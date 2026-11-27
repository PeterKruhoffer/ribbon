import * as Cloudflare from "@alchemy.run/cloudflare";
import { Effect } from "effect";

// One Durable Object per signed-in user, addressed by Clerk user id. It counts
// what the user made today (UTC) per kind, an endpoint name such as "create"
// or "upload", so the Backend can cap each kind per day. See
// src/backend/limits.ts.

type Day = { day: string; count: number };

export default class Quota extends Cloudflare.DurableObject<Quota>()(
  "Quota",
  Effect.gen(function* () {
    const state = yield* Cloudflare.DurableObjectState;

    return Effect.succeed({
      // Counts one more of kind and answers true, or answers false when the
      // user already made cap today. One object runs one call at a time, so
      // concurrent requests cannot both take the last one.
      take: (kind: string, cap: number) =>
        Effect.sync(() => {
          const day = new Date().toISOString().slice(0, 10);
          // One record per kind, overwritten each new day, so nothing piles up.
          const saved = state.storage.kv.get<Day>(kind);
          const count = saved?.day === day ? saved.count : 0;
          if (count >= cap) return false;
          state.storage.kv.put<Day>(kind, { day, count: count + 1 });
          return true;
        }).pipe(Effect.withSpan("Quota.take")),
    });
  }),
) {}
