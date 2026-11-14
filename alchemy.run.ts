import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import Backend from "./src/backend/backend.ts";

export const Website = Cloudflare.Website.Vite("Website", {
  main: "./src/worker.ts",
  compatibility: { date: "2026-09-25", flags: ["nodejs_compat"] },
  env: { BACKEND: Backend },
});

export default Alchemy.Stack(
  "Ribbon",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const backend = yield* Backend;
    const website = yield* Website;
    return { url: website.url.as<string>(), backendUrl: backend.url.as<string>() };
  }),
);
