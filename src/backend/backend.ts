import * as Cloudflare from "@alchemy.run/cloudflare";
import { Effect, Schema } from "effect";
import { HttpServerRequest, HttpServerResponse } from "effect/http";
import { NewList } from "../shared/wishlist.ts";
import Wishlist from "./wishlist.ts";

// The Effect Worker behind /api. It hosts the Wishlist Durable Object and
// routes each request to the object for its list. The website Worker forwards
// /api/* here through a service binding, so the browser sees one origin.

const listPath = /^\/api\/lists\/([\w-]{1,64})(?:\/(.*))?$/;
const ClaimBody = Schema.Struct({ guest: Schema.String.check(Schema.isMaxLength(64)) });

export default class Backend extends Cloudflare.Worker<Backend>()(
  "Backend",
  {
    main: import.meta.url,
    compatibility: { date: "2026-09-25", flags: ["nodejs_compat"] },
    dev: { port: 1337 },
  },
  Effect.gen(function* () {
    const lists = yield* Wishlist;

    return {
      fetch: Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const url = new URL(request.url, "http://ribbon");
        // A random UUID is the list's id and its share link, so links can't be
        // guessed. Until owners sign in, the creator opens the owner view with
        // ?as=owner like before.
        if (url.pathname === "/api/lists" && request.method === "POST") {
          return yield* HttpServerRequest.schemaBodyJson(NewList).pipe(
            Effect.flatMap((list) => {
              const listId = crypto.randomUUID();
              return lists.getByName(listId).create(list).pipe(Effect.as({ listId }));
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
        const role = url.searchParams.get("as") === "owner" ? "owner" : "guest";
        const list = lists.getByName(listId);

        if (rest === "" && request.method === "GET") {
          return yield* list.read(listId, role).pipe(
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
          return yield* list.fetch(request);
        }
        const claim = /^items\/([\w-]{1,64})\/claim$/.exec(rest);
        if (claim && request.method === "POST") {
          if (role === "owner")
            return HttpServerResponse.text("Only guests can claim", { status: 403 });
          return yield* HttpServerRequest.schemaBodyJson(ClaimBody).pipe(
            Effect.flatMap(({ guest }) => list.claim(claim[1]!, guest)),
            Effect.flatMap((result) => HttpServerResponse.json(result)),
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
      }),
    };
  }),
) {}
