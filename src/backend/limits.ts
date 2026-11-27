import * as Cloudflare from "@alchemy.run/cloudflare";
import { RuntimeContext } from "alchemy/RuntimeContext";
import { Effect, Layer } from "effect";
import { HttpServerRequest } from "effect/http";
import { Throttle, Viewer } from "../shared/api.ts";
import { DailyLimitReached, TooManyRequests } from "../shared/wishlist.ts";
import Quota from "./quota.ts";

// Limits on every route, so neither a signed-in user nor a guest can flood
// Ribbon. Each request counts against its Clerk user id, or its IP address when
// signed out:
// - Cloudflare rate limits per minute: one for reads (GET), one for writes
//   (everything else, including guests' claims). They are counted per
//   Cloudflare location and are approximate, which is enough to stop a flood.
// - Daily caps per user on new lists and photo uploads, counted exactly in the
//   user's Quota Durable Object, because each one keeps data.
// See Rate limits in docs/architecture.md.

// A list page loads the list, its socket, and up to 50 photos.
const reads = Cloudflare.RateLimit("READ_LIMIT", {
  namespaceId: 20261126,
  simple: { limit: 600, period: 60 },
});
const writes = Cloudflare.RateLimit("WRITE_LIMIT", {
  namespaceId: 20261127,
  simple: { limit: 60, period: 60 },
});

// Endpoint name to the most a user makes in a day (UTC).
export const dailyCaps: Record<string, number> = { create: 20, upload: 200 };

export const makeThrottle = Effect.gen(function* () {
  const readLimit = yield* reads;
  const writeLimit = yield* writes;
  const quotas = yield* Quota;

  return Layer.succeed(
    Throttle,
    Effect.fnUntraced(function* (httpEffect, { endpoint }) {
      const viewer = yield* Viewer;
      const request = yield* HttpServerRequest.HttpServerRequest;
      const key = viewer ?? `ip:${request.headers["cf-connecting-ip"] ?? "unknown"}`;
      const limit = endpoint.method === "GET" ? readLimit : writeLimit;
      // A failing limiter lets the request through rather than take Ribbon down.
      // The client's RuntimeContext requirement is type-only (RuntimeContext.phantom).
      const { success } = yield* limit.limit({ key }).pipe(
        Effect.provide(RuntimeContext.phantom),
        Effect.catchTag("RateLimitError", (error) =>
          Effect.logError("Rate limit failed", error).pipe(Effect.as({ success: true })),
        ),
      );
      if (!success) return yield* new TooManyRequests();

      // Only signed-in users reach create and upload; SignedIn refuses others.
      const cap = dailyCaps[endpoint.identifier];
      if (cap !== undefined && viewer !== undefined) {
        // Counts attempts, so a refused upload also counts. That is fine at
        // these caps, and checking before the body is read keeps it cheap.
        const taken = yield* quotas.getByName(viewer).take(endpoint.identifier, cap);
        if (!taken) return yield* new DailyLimitReached({ limit: cap });
      }
      return yield* httpEffect;
    }),
  );
});
