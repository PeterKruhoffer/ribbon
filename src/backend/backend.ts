import * as Cloudflare from "alchemy/Cloudflare";
import { Effect, Schema } from "effect";
import { HttpServerRequest, HttpServerResponse } from "effect/http";
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
  },
  Effect.gen(function* () {
    const lists = yield* Wishlist;

    return {
      fetch: Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const url = new URL(request.url, "http://ribbon");
        const match = listPath.exec(url.pathname);
        if (!match) return HttpServerResponse.text("Not found", { status: 404 });
        const listId = match[1]!;
        const rest = match[2] ?? "";
        const role = url.searchParams.get("as") === "owner" ? "owner" : "guest";
        const list = lists.getByName(listId);

        if (rest === "" && request.method === "GET") {
          return yield* HttpServerResponse.json(yield* list.read(listId, role));
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
            Effect.flatMap(({ guest }) => list.claim(listId, claim[1]!, guest)),
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
