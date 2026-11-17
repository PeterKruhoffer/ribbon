import * as Cloudflare from "@alchemy.run/cloudflare";
import { Effect, Option, Schema } from "effect";
import { HttpServerRequest } from "effect/http";
import { viewerHeader } from "./auth.ts";
import { ClientMessage, entityTopic, type LiveEvent } from "../live/protocol.ts";
import {
  FullyClaimed,
  ItemNotFound,
  ListNotFound,
  type ListView,
  type NewList,
  OwnerCannotClaim,
  Role,
} from "../shared/wishlist.ts";

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
      const sql = state.storage.sql;
      yield* sql.exec(
        "CREATE TABLE IF NOT EXISTS item (id TEXT PRIMARY KEY, title TEXT NOT NULL, quantity INTEGER NOT NULL, position INTEGER NOT NULL)",
      );
      yield* sql.exec(
        "CREATE TABLE IF NOT EXISTS claim (id INTEGER PRIMARY KEY AUTOINCREMENT, item_id TEXT NOT NULL, guest TEXT NOT NULL)",
      );
      yield* sql.exec(
        "CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
      );

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

      // The owner is the Clerk user who created the list. Anyone else, signed in
      // or not, is a guest. Lists made before sign-in have no owner.
      const roleOf = Effect.fn("Wishlist.roleOf")(function* (viewer: string | undefined) {
        if (viewer === undefined) return "guest" as Role;
        const [owner] = yield* (yield* sql.exec<{ value: string }>(
          "SELECT value FROM meta WHERE key = 'owner'",
        )).toArray();
        return (owner?.value === viewer ? "owner" : "guest") as Role;
      });

      return {
        // The Backend picks a fresh random id for each new list, so this object
        // starts empty. Item ids are random too, so they never repeat within a
        // list once items can be removed.
        create: Effect.fn("Wishlist.create")(function* (list: NewList, owner: string) {
          yield* sql.exec("INSERT INTO meta VALUES ('title', ?)", list.title);
          yield* sql.exec("INSERT INTO meta VALUES ('owner', ?)", owner);
          for (const [position, item] of list.items.entries()) {
            yield* sql.exec(
              "INSERT INTO item VALUES (?, ?, ?, ?)",
              crypto.randomUUID(),
              item.title,
              item.quantity,
              position,
            );
          }
        }),

        read: Effect.fn("Wishlist.read")(function* (listId: string, viewer: string | undefined) {
          const [meta] = yield* (yield* sql.exec<{ value: string }>(
            "SELECT value FROM meta WHERE key = 'title'",
          )).toArray();
          if (!meta) return yield* new ListNotFound({ listId });
          const role = yield* roleOf(viewer);
          const rows = yield* (yield* sql.exec<{
            id: string;
            title: string;
            quantity: number;
            claimed: number;
          }>(
            "SELECT item.id, item.title, item.quantity, COUNT(claim.id) AS claimed FROM item LEFT JOIN claim ON claim.item_id = item.id GROUP BY item.id ORDER BY item.position",
          )).toArray();
          const view: ListView = {
            title: meta.value,
            role,
            items: rows.map(({ id, title, quantity, claimed }) =>
              role === "owner"
                ? { id, title, quantity }
                : { id, title, quantity, remaining: quantity - claimed },
            ),
          };
          return view;
        }),

        // One conditional INSERT checks and claims in a single statement, so two
        // guests racing for the last item cannot both win, even if the fibers
        // handling their requests interleave.
        claim: Effect.fn("Wishlist.claim")(function* (
          itemId: string,
          guest: string,
          viewer: string | undefined,
        ) {
          if ((yield* roleOf(viewer)) === "owner") return yield* new OwnerCannotClaim();
          // RETURNING makes the inserted row the result, which is reliable where
          // the cursor's rowsWritten counter is not.
          const inserted = yield* (yield* sql.exec(
            "INSERT INTO claim (item_id, guest) SELECT id, ? FROM item WHERE id = ? AND quantity > (SELECT COUNT(*) FROM claim WHERE item_id = ?) RETURNING id",
            guest,
            itemId,
            itemId,
          )).toArray();
          if (inserted.length === 0) {
            const exists = yield* (yield* sql.exec(
              "SELECT 1 FROM item WHERE id = ?",
              itemId,
            )).toArray();
            return yield* exists.length > 0
              ? new FullyClaimed({ itemId })
              : new ItemNotFound({ itemId });
          }
          const [row] = yield* (yield* sql.exec<{ remaining: number }>(
            "SELECT quantity - (SELECT COUNT(*) FROM claim WHERE item_id = item.id) AS remaining FROM item WHERE id = ?",
            itemId,
          )).toArray();
          yield* publishToGuests(entityTopic("Item", itemId), {
            id: itemId,
            changed: ["remaining"],
          });
          return { remaining: row!.remaining };
        }),

        // WebSocket upgrades for /api/lists/:id/live. The Backend verified the
        // Clerk token and put the viewer's user id in viewerHeader.
        fetch: Effect.gen(function* () {
          const request = yield* HttpServerRequest.HttpServerRequest;
          const role = yield* roleOf(request.headers[viewerHeader] || undefined);
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
