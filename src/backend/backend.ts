import * as Cloudflare from "@alchemy.run/cloudflare";
import { Config, Effect, Schema } from "effect";
import { Headers, HttpServerRequest, HttpServerResponse } from "effect/http";
import { NewList } from "../shared/wishlist.ts";
import { viewerHeader, viewerOf } from "./auth.ts";
import Wishlist from "./wishlist.ts";

// The Effect Worker behind /api. It hosts the Wishlist Durable Object and
// routes each request to the object for its list. The website Worker forwards
// /api/* here through a service binding, so the browser sees one origin.

const listPath = /^\/api\/lists\/([\w-]{1,64})(?:\/(.*))?$/;
const ClaimBody = Schema.Struct({ guest: Schema.String.check(Schema.isMaxLength(64)) });

const unauthorized = () =>
  Effect.succeed(HttpServerResponse.text("Sign in again", { status: 401 }));

export default class Backend extends Cloudflare.Worker<Backend>()(
  "Backend",
  {
    main: import.meta.url,
    compatibility: { date: "2026-09-25", flags: ["nodejs_compat"] },
    dev: { port: 1337 },
  },
  Effect.gen(function* () {
    const lists = yield* Wishlist;
    // The Clerk instance's PEM public key. It is public, but Alchemy binds every
    // Config value as a secret.
    const jwtKey = yield* Config.String("CLERK_JWT_KEY");

    return {
      fetch: Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const url = new URL(request.url, "http://ribbon");
        // Browsers cannot set headers on a WebSocket, so sockets send the Clerk
        // session token as ?token=.
        const bearer = /^Bearer (.+)$/.exec(request.headers.authorization ?? "")?.[1];
        const token = bearer ?? url.searchParams.get("token") ?? undefined;

        return yield* Effect.gen(function* () {
          const viewer = yield* viewerOf(jwtKey, token);

          // Only signed-in users create lists, and the creator becomes the owner.
          // A random UUID is the list's id and its share link, so links can't be
          // guessed.
          if (url.pathname === "/api/lists" && request.method === "POST") {
            if (viewer === undefined)
              return HttpServerResponse.text("Sign in to create a list", { status: 401 });
            return yield* HttpServerRequest.schemaBodyJson(NewList).pipe(
              Effect.flatMap((list) => {
                const listId = crypto.randomUUID();
                return lists.getByName(listId).create(list, viewer).pipe(Effect.as({ listId }));
              }),
              Effect.flatMap((created) => HttpServerResponse.json(created, { status: 201 })),
              Effect.catchTag("SchemaError", () =>
                Effect.succeed(
                  HttpServerResponse.text(
                    "Expected { title, items: [{ title, quantity }] } with 1 to 50 items",
                    { status: 400 },
                  ),
                ),
              ),
            );
          }
          const match = listPath.exec(url.pathname);
          if (!match) return HttpServerResponse.text("Not found", { status: 404 });
          const listId = match[1]!;
          const rest = match[2] ?? "";
          const list = lists.getByName(listId);

          if (rest === "" && request.method === "GET") {
            return yield* list.read(listId, viewer).pipe(
              Effect.flatMap((view) => HttpServerResponse.json(view)),
              Effect.catchTag("ListNotFound", () =>
                Effect.succeed(HttpServerResponse.text("No such list", { status: 404 })),
              ),
            );
          }
          if (rest === "live") {
            if (request.headers.upgrade !== "websocket") {
              return HttpServerResponse.text("Expected a WebSocket upgrade", { status: 426 });
            }
            return yield* list.fetch(
              request.modify({
                headers: Headers.set(request.headers, viewerHeader, viewer ?? ""),
              }),
            );
          }
          const claim = /^items\/([\w-]{1,64})\/claim$/.exec(rest);
          if (claim && request.method === "POST") {
            return yield* HttpServerRequest.schemaBodyJson(ClaimBody).pipe(
              Effect.flatMap(({ guest }) => list.claim(claim[1]!, guest, viewer)),
              Effect.flatMap((result) => HttpServerResponse.json(result)),
              Effect.catchTag("OwnerCannotClaim", () =>
                Effect.succeed(HttpServerResponse.text("Only guests can claim", { status: 403 })),
              ),
              Effect.catchTag("FullyClaimed", () =>
                Effect.succeed(HttpServerResponse.text("Already fully claimed", { status: 409 })),
              ),
              Effect.catchTag("ItemNotFound", () =>
                Effect.succeed(HttpServerResponse.text("No such item", { status: 404 })),
              ),
              Effect.catchTag("SchemaError", () =>
                Effect.succeed(HttpServerResponse.text("Expected { guest }", { status: 400 })),
              ),
            );
          }
          return HttpServerResponse.text("Not found", { status: 404 });
        }).pipe(Effect.catchTag("Unauthorized", unauthorized));
      }),
    };
  }),
) {}
