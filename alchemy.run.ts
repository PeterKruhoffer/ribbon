import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";

export const Website = Cloudflare.Website.Vite("Website", {
  main: "./src/worker.ts",
  compatibility: { date: "2026-10-10", flags: ["nodejs_compat"] },
});

export default Alchemy.Stack(
  "Ribbon",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const website = yield* Website;
    return { url: website.url.as<string>() };
  }),
);
