# Development

## Tools

- pnpm 12.11.1 with the committed `pnpm-lock.yaml`: `pnpm install --frozen-lockfile`.
- Vite+ runs dev, build, Oxlint, and Oxfmt. Configure them in `vite.config.ts`. Do not add Biome, ESLint, or Prettier.
- `pnpm-workspace.yaml` holds a supply-chain policy (release age, provenance, build scripts). Do not bypass it to make an install pass.
- Upgrade `effect`, `@effect/platform-node`, and the `@effect/*` overrides in `pnpm-workspace.yaml` together, so the lockfile holds one Effect version. Upgrade `alchemy` and `@alchemy.run/cloudflare` together; they pin each other's exact version.
- `workerd` must not run its install script: the platform package already has the binary. `allowBuilds` lists it by exact version, so update that entry when an Alchemy upgrade moves `workerd`.

## Commands

| Command                             | Does                                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------------------- |
| `pnpm dev`                          | Pages only, on port 3000. No Durable Objects, so `/api` fails. No credentials needed. |
| `pnpm dev:cloudflare`               | `alchemy dev`. Website on port 1338, Backend on 1337, with hot reload.                |
| `pnpm check`                        | Format check, lint, and typecheck.                                                    |
| `pnpm build`                        | Vite build of the website.                                                            |
| `pnpm format`                       | Format with Oxfmt.                                                                    |
| `pnpm run deploy --stage dev --yes` | Deploy with Alchemy. Plain `pnpm deploy` is a pnpm built-in.                          |
| `pnpm verify:live <url>`            | End-to-end checks against a deployment. Needs `RIBBON_OWNER_TOKEN`; see below.        |
| `node scripts/owner-token.mjs`      | Prints an owner token for `verify:live`. Needs `CLERK_SECRET_KEY`; see below.         |

Run `pnpm check` and `pnpm build` after every change.

## Local dev

Copy `.env.example` to `.env`. It holds the two Clerk values for the development instance; both are public. Vite reads `VITE_CLERK_PUBLISHABLE_KEY` into the browser bundle, and Alchemy binds `CLERK_JWT_KEY` to the Backend. In orbs, the Amp project sets both as environment variables. See [Auth](auth.md).

`alchemy dev` runs both Workers and the Durable Object in local workerd. It still needs Cloudflare credentials (`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`), because Alchemy keeps its state store on Cloudflare.

Both Workers default to port 1337, so `alchemy.run.ts` and `src/backend/backend.ts` set `dev.port`. Without it, the two race for 1337 and swap ports between runs.

Keep the compatibility date in `alchemy.run.ts` at or below what the local workerd supports. A newer date stops `alchemy dev` from starting.

## Deploy and verify

Deploying to verify work is allowed.

1. `pnpm run deploy --stage dev --yes` prints `url` and `backendUrl`.
2. Sign in on `<url>`, run `await Clerk.session.getToken()` in the browser console, and within a minute run `RIBBON_OWNER_TOKEN=<token> pnpm verify:live <url>`. It checks sign-in for list creation, photo upload and read-back, live delivery, the owner getting no events, owner edits, the race for the last item, 404s, unsubscribe, and delivery after 20 s idle.

Demo: sign in and create a list at `<url>`. It opens the owner view; open its share link in two private windows as guests.

Clerk test emails such as `owner+clerk_test@example.com` sign in with code `424242` and send no email.

## Deploy from CI

`.github/workflows/deploy.yml` deploys every push to `main` to the `prod` stage, one run at a time. Threads deploy to `dev` and other stages, so they never overwrite `prod`. The workflow runs `pnpm check` and `pnpm build`, deploys, reads the URL from Alchemy state (`alchemy state cat Ribbon/prod/output`), and runs `pnpm verify:live` against it. The run's summary and the GitHub `prod` environment show the URL.

Alchemy's state lives in the account's Cloudflare state store, so CI and local deploys share it with no extra setup. The workflow copies `.env.example` to `.env` for the public Clerk values.

Repository secrets, under Settings, Secrets and variables, Actions:

| Secret                  | Value                                                                                                                        |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | A Cloudflare API token with Workers Scripts Write, Workers R2 Storage Write, Secrets Store Write, and Account Settings Read. |
| `CLOUDFLARE_ACCOUNT_ID` | The Cloudflare account id.                                                                                                   |
| `CLERK_SECRET_KEY`      | The Clerk development instance's secret key (`sk_test_...`). Without it, `verify:live` is skipped.                           |

The token needs Secrets Store Write even though CI only reads: without cached credentials, Alchemy reads its state store token through a preview Worker that binds a Secrets Store secret. Without it, the deploy fails with "Edge-preview secret read failed".

`scripts/owner-token.mjs` uses the secret key to sign in the test user `ci+clerk_test@example.com` and prints a session token for `verify:live`. Clerk only allows this on development instances. Each run leaves one verify list in `prod`.

## Orbs

`.agents/setup` installs dependencies. `.amp/services.yaml` runs `pnpm dev`; start it with `amp orb services ensure`.
