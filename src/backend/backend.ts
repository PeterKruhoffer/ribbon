import * as Cloudflare from "@alchemy.run/cloudflare";
import { Config, Effect, Layer, Path, Schema } from "effect";
import {
  Etag,
  Headers,
  HttpPlatform,
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
} from "effect/http";
import { HttpApiBuilder } from "effect/http-api";
import { Authentication, RibbonApi, SignedIn, SignedInUser, Viewer } from "../shared/api.ts";
import {
  FullyClaimed,
  ItemNotFound,
  ListChanged,
  ListNotFound,
  NotOwner,
  OwnerCannotClaim,
  SignInRequired,
} from "../shared/wishlist.ts";
import { viewerHeader, viewerOf } from "./auth.ts";
import { makeThrottle } from "./limits.ts";
import { makePhotos } from "./photos.ts";
import Wishlist from "./wishlist.ts";

// The Effect Worker behind /api. It serves RibbonApi (src/shared/api.ts): each
// handler calls one Durable Object or photo method, and the errors those fail
// with carry their own HTTP status. The website Worker forwards /api/* here
// through a service binding, so the browser sees one origin.

// The Backend never serves files, so HttpPlatform's file responses are stubbed.
const HttpPlatformStub = Layer.succeed(HttpPlatform.HttpPlatform, {
  platform: "web",
  compression: {
    algorithms: new Set<HttpPlatform.CompressionAlgorithm>(),
    compressResponse: (response) => Effect.succeed(response),
  },
  fileResponse: () => Effect.die("HttpPlatform.fileResponse not supported"),
  fileWebResponse: () => Effect.die("HttpPlatform.fileWebResponse not supported"),
});

// A Durable Object's typed errors arrive over RPC as plain objects, which the
// API cannot encode. Decoding rebuilds the error classes.
const ListError = Schema.Union([
  ListNotFound,
  ItemNotFound,
  ListChanged,
  OwnerCannotClaim,
  NotOwner,
  FullyClaimed,
]);
const isListError = Schema.is(ListError);
const decodeListError = Schema.decodeUnknownSync(ListError);
const fromObject = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.mapError(effect, (error) => (isListError(error) ? error : decodeListError(error)) as E);

export default class Backend extends Cloudflare.Worker<Backend>()(
  "Backend",
  {
    main: import.meta.url,
    compatibility: { date: "2026-09-25", flags: ["nodejs_compat"] },
    dev: { port: 1337 },
  },
  Effect.gen(function* () {
    const lists = yield* Wishlist;
    const photos = yield* makePhotos;
    const throttle = yield* makeThrottle;
    // The Clerk instance's PEM public key. It is public, but Alchemy binds every
    // Config value as a secret.
    const jwtKey = yield* Config.String("CLERK_JWT_KEY");

    const authentication = Layer.succeed(
      Authentication,
      Effect.fnUntraced(function* (httpEffect) {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const bearer = /^Bearer (.+)$/.exec(request.headers.authorization ?? "")?.[1];
        const query = new URL(request.url, "http://ribbon").searchParams.get("token");
        const viewer = yield* viewerOf(jwtKey, bearer ?? query ?? undefined);
        return yield* Effect.provideService(httpEffect, Viewer, viewer);
      }),
    );

    const signedIn = Layer.succeed(
      SignedIn,
      Effect.fnUntraced(function* (httpEffect) {
        const viewer = yield* Viewer;
        if (viewer === undefined) return yield* new SignInRequired();
        return yield* Effect.provideService(httpEffect, SignedInUser, viewer);
      }),
    );

    // Handlers are untraced: each Durable Object and photo method has its own span.
    const listHandlers = HttpApiBuilder.group(RibbonApi, "lists", (handlers) =>
      Effect.succeed(
        handlers
          .handle(
            "create",
            Effect.fnUntraced(function* ({ payload }) {
              const owner = yield* SignedInUser;
              const listId = crypto.randomUUID();
              yield* fromObject(lists.getByName(listId).create(payload, owner));
              return { listId };
            }),
          )
          .handle(
            "read",
            Effect.fnUntraced(function* ({ params }) {
              return yield* fromObject(
                lists.getByName(params.listId).read(params.listId, yield* Viewer),
              );
            }),
          )
          .handle(
            "update",
            Effect.fnUntraced(function* ({ params, payload }) {
              const owner = yield* SignedInUser;
              yield* fromObject(
                lists.getByName(params.listId).update(params.listId, payload, owner),
              );
            }),
          )
          .handle(
            "claim",
            Effect.fnUntraced(function* ({ params, payload }) {
              const viewer = yield* Viewer;
              return yield* fromObject(
                lists.getByName(params.listId).claim(params.itemId, payload.guest, viewer),
              );
            }),
          )
          // The Durable Object answers the upgrade itself. It reads the verified
          // viewer from viewerHeader, which is always overwritten here, so a
          // browser cannot pick its own.
          .handleRaw(
            "live",
            Effect.fnUntraced(function* ({ params, request }) {
              if (request.headers.upgrade !== "websocket")
                return HttpServerResponse.text("Expected a WebSocket upgrade", { status: 426 });
              const viewer = yield* Viewer;
              return yield* lists
                .getByName(params.listId)
                .fetch(
                  request.modify({
                    headers: Headers.set(request.headers, viewerHeader, viewer ?? ""),
                  }),
                )
                .pipe(Effect.orDie);
            }),
          ),
      ),
    );

    const photoHandlers = HttpApiBuilder.group(RibbonApi, "photos", (handlers) =>
      Effect.succeed(
        handlers
          .handleRaw(
            "upload",
            Effect.fnUntraced(function* () {
              return yield* photos.upload(yield* SignedInUser);
            }),
          )
          .handle("serve", ({ params }) => photos.serve(params.key)),
      ),
    );

    return {
      fetch: HttpApiBuilder.layer(RibbonApi).pipe(
        Layer.provide([listHandlers, photoHandlers]),
        Layer.provide([authentication, throttle, signedIn]),
        Layer.provide([Etag.layer, HttpPlatformStub, Path.layer]),
        HttpRouter.toHttpEffect,
      ),
    };
  }).pipe(
    Effect.provide([Cloudflare.R2.ReadWriteBucketBinding, Cloudflare.Workers.RateLimitBinding]),
  ),
) {}
