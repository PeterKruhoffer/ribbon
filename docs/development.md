# Development

## Tools

- pnpm 12.11.1 with the committed `pnpm-lock.yaml`: `pnpm install --frozen-lockfile`.
- Vite+ runs dev, build, Oxlint, and Oxfmt. Configure them in `vite.config.ts`. Do not add Biome, ESLint, or Prettier.
- `pnpm-workspace.yaml` holds a supply-chain policy (release age, provenance, build scripts). Do not bypass it to make an install pass.

## Commands

| Command                             | Does                                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------------------- |
| `pnpm dev`                          | Pages only, on port 3000. No Durable Objects, so `/api` fails. No credentials needed. |
| `pnpm dev:cloudflare`               | `alchemy dev`. Website on port 1338, Backend on 1337, with hot reload.                |
| `pnpm check`                        | Format check, lint, and typecheck.                                                    |
| `pnpm build`                        | Vite build of the website.                                                            |
| `pnpm format`                       | Format with Oxfmt.                                                                    |
| `pnpm run deploy --stage dev --yes` | Deploy with Alchemy. Plain `pnpm deploy` is a pnpm built-in.                          |
| `pnpm verify:live <url>`            | End-to-end checks against a deployment.                                               |

Run `pnpm check` and `pnpm build` after every change.

## Local dev

`alchemy dev` runs both Workers and the Durable Object in local workerd. It still needs Cloudflare credentials (`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`), because Alchemy keeps its state store on Cloudflare.

Keep the compatibility date in `alchemy.run.ts` at or below what the local workerd supports. A newer date stops `alchemy dev` from starting.

## Deploy and verify

Deploying to verify work is allowed.

1. `pnpm run deploy --stage dev --yes` prints `url` and `backendUrl`.
2. `pnpm verify:live <url>` checks live delivery, the owner getting no events, the race for the last item, 404s, unsubscribe, and delivery after 20 s idle.

Demo: open `<url>/lists/demo` in two tabs and `<url>/lists/demo?as=owner` in a third.

## Orbs

`.agents/setup` installs dependencies. `.amp/services.yaml` runs `pnpm dev`; start it with `amp orb services ensure`.
