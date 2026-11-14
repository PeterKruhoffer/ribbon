# Ribbon docs

Ribbon is a shared gift wish list. The owner shares a link. Guests claim items, and every guest sees claims live. The owner never sees who claimed what.

- [Architecture](architecture.md): the Workers, the Durable Object, and where code goes.
- [Live updates](live-updates.md): the WebSocket protocol, spoiler protection, and safe claims.
- [Development](development.md): commands, local dev, deploy, and checks.

## Rules

- Use Effect v4 and Alchemy v2. Do not use Effect v3 or Alchemy v1 APIs.
- Put server logic in the Effect Backend and Durable Object (`src/backend`). TanStack Start only renders pages.
- Parse untrusted input with `Schema`. Shared schemas and tagged errors live in `src/shared`.
- `alchemy.run.ts` defines all Cloudflare infrastructure. Do not add Wrangler config or `@cloudflare/vite-plugin`.
- Import Alchemy's Cloudflare resources from `@alchemy.run/cloudflare`. Alchemy 2.0.0-beta.84 removed `alchemy/Cloudflare`.
- The owner must never receive claim data or claim events. See [Live updates](live-updates.md).
- Never commit secrets.
