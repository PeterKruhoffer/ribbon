# Ribbon

Shared gift wish lists with spoiler protection: owners share a link, guests claim items in real time, and the owner never sees who claimed what.

- Use pnpm 12.11.1 and the committed `pnpm-lock.yaml`. Run `pnpm install --frozen-lockfile`.
- Vite+ owns dev/build, Oxlint, and Oxfmt. Configure them in `vite.config.ts`; do not add Biome, ESLint, or Prettier.
- Preserve the supply-chain policy in `pnpm-workspace.yaml`. Do not bypass release age, provenance, or build-script checks to make an install pass.
- This project uses Effect v4, Alchemy v2, React, and TanStack Start. Do not use Effect v3 or Alchemy v1 APIs.
- `src/routes` owns file-based routes. Vite generates `src/routeTree.gen.ts`; do not edit it by hand. Keep it tracked.
- `alchemy.run.ts` is the source of truth for Cloudflare infrastructure. Do not add Wrangler configuration or `@cloudflare/vite-plugin`.
- `pnpm dev` is credential-free. `pnpm dev:cloudflare` uses Alchemy's Cloudflare runtime.
- Run `pnpm check` and `pnpm build` after changes.
- `.agents/setup` installs dependencies. `.amp/services.yaml` declares the dev server; run `amp orb services ensure` to start the preview.
- Never deploy or change shared Cloudflare resources without the user's approval. Never commit secrets.
