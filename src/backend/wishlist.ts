import * as Cloudflare from "@alchemy.run/cloudflare";
import * as SqliteClient from "@effect/sql-sqlite-do/SqliteClient";
import { Effect, Layer, Option, Schema, Scope } from "effect";
import { HttpServerRequest } from "effect/http";
import { type SqlClient, SqlError } from "effect/sql";
import { viewerHeader } from "./auth.ts";
import * as Store from "./store.ts";
import { ClientMessage, entityTopic, type LiveEvent } from "../live/protocol.ts";
import { type ListEdit, type NewList, Role } from "../shared/wishlist.ts";

// One Durable Object per wish list. It owns the list's data in its SQLite
// storage and every open WebSocket for the list, so a claim and the live
// update it causes happen in one place. Sockets use the hibernation API: the
// object can leave memory while connections stay open, and each socket keeps
// its role and subscriptions in its attachment.

// Subscription id to topic. Cloudflare caps attachments at 16 KB.
const Attachment = Schema.Struct({
  role: Role,
  subscriptions: Schema.Record(Schema.String, Schema.String),
});
const maxSubscriptions = 200;
const decodeMessage = Schema.decodeUnknownOption(Schema.fromJsonString(ClientMessage));

export default class Wishlist extends Cloudflare.DurableObject<Wishlist>()(
  "Wishlist",
  Effect.gen(function* () {
    const state = yield* Cloudflare.DurableObjectState;

    return Effect.gen(function* () {
      // One SQL client per object instance, for the object's lifetime. A storage
      // failure is a defect; the store's own errors stay typed.
      const sqlContext = yield* Layer.buildWithScope(
        SqliteClient.layer({ storage: state.raw.storage }),
        yield* Scope.make(),
      );
      const run = <A, E>(
        effect: Effect.Effect<A, E, SqlClient.SqlClient>,
      ): Effect.Effect<A, Exclude<E, SqlError.SqlError>> =>
        // catchIf does not narrow a generic error channel, so the type is stated.
        effect.pipe(
          Effect.provide(sqlContext),
          Effect.catchIf(SqlError.isSqlError, Effect.die),
        ) as Effect.Effect<A, Exclude<E, SqlError.SqlError>>;
      yield* run(Store.migrate);

      // Send an event to every guest socket subscribed to the topic. Owner
      // sockets are skipped: even "something changed" would spoil a gift.
      // Events carry only an id and the changed fields; each browser refetches
      // with its own credentials.
      const publishToGuests = Effect.fn("Wishlist.publishToGuests")(function* (
        topic: string,
        data: LiveEvent["data"],
      ) {
        for (const socket of yield* state.getWebSockets()) {
          const attachment = yield* socket.getAttachment(Attachment).pipe(Effect.option);
          if (Option.isNone(attachment) || attachment.value.role === "owner") continue;
          for (const [subscriptionId, subscribed] of Object.entries(
            attachment.value.subscriptions,
          )) {
            if (subscribed !== topic) continue;
            const event: LiveEvent = { subscriptionId, topic, type: "update", data };
            yield* socket.send(JSON.stringify(event));
          }
        }
      });

      return {
        create: Effect.fn("Wishlist.create")(function* (list: NewList, owner: string) {
          yield* run(Store.createList(list, owner));
        }),

        update: Effect.fn("Wishlist.update")(function* (
          listId: string,
          list: ListEdit,
          viewer: string | undefined,
        ) {
          const unusedPhotos = yield* run(Store.updateList(listId, list, viewer));
          // Wishes can come and go, so the event is on the list's topic.
          yield* publishToGuests(entityTopic("List", listId), {
            id: listId,
            changed: ["title", "items"],
          });
          return unusedPhotos;
        }),

        // Guests' pages refetch on the list event, find no list, and close
        // their sockets.
        delete: Effect.fn("Wishlist.delete")(function* (
          listId: string,
          viewer: string | undefined,
        ) {
          const photos = yield* run(Store.deleteList(listId, viewer));
          yield* publishToGuests(entityTopic("List", listId), {
            id: listId,
            changed: ["title", "items"],
          });
          return photos;
        }),

        read: Effect.fn("Wishlist.read")(function* (
          listId: string,
          viewer: string | undefined,
          guest: string | undefined,
        ) {
          return yield* run(Store.readList(listId, viewer, guest));
        }),

        claim: Effect.fn("Wishlist.claim")(function* (
          itemId: string,
          guest: string,
          viewer: string | undefined,
        ) {
          const result = yield* run(Store.claimItem(itemId, guest, viewer));
          yield* publishToGuests(entityTopic("Item", itemId), {
            id: itemId,
            changed: ["remaining"],
          });
          return result;
        }),

        unclaim: Effect.fn("Wishlist.unclaim")(function* (
          itemId: string,
          guest: string,
          viewer: string | undefined,
        ) {
          const result = yield* run(Store.unclaimItem(itemId, guest, viewer));
          yield* publishToGuests(entityTopic("Item", itemId), {
            id: itemId,
            changed: ["remaining"],
          });
          return result;
        }),

        // WebSocket upgrades for /api/lists/:id/live. The Backend verified the
        // Clerk token and put the viewer's user id in viewerHeader.
        fetch: Effect.gen(function* () {
          const request = yield* HttpServerRequest.HttpServerRequest;
          const role = yield* run(Store.roleOf(request.headers[viewerHeader] || undefined));
          const [response, socket] = yield* Cloudflare.upgrade();
          yield* socket.setAttachment(Attachment, { role, subscriptions: {} }).pipe(Effect.orDie);
          return response;
        }),

        webSocketMessage: Effect.fn("Wishlist.webSocketMessage")(function* (
          socket: Cloudflare.WebSocket,
          message: string | ArrayBuffer,
        ) {
          const parsed = decodeMessage(
            typeof message === "string" ? message : new TextDecoder().decode(message),
          );
          const attachment = yield* socket.getAttachment(Attachment).pipe(Effect.option);
          if (Option.isNone(parsed) || Option.isNone(attachment)) return;
          const subscriptions = { ...attachment.value.subscriptions };
          if (parsed.value.op === "subscribe") {
            if (Object.keys(subscriptions).length >= maxSubscriptions) return;
            subscriptions[parsed.value.id] = parsed.value.topic;
          } else {
            delete subscriptions[parsed.value.id];
          }
          yield* socket
            .setAttachment(Attachment, { ...attachment.value, subscriptions })
            .pipe(Effect.orDie);
        }),

        webSocketClose: Effect.fn("Wishlist.webSocketClose")(function* (
          socket: Cloudflare.WebSocket,
          code: number,
          reason: string,
        ) {
          yield* socket.close(code, reason);
        }),
      };
    });
  }),
) {}
