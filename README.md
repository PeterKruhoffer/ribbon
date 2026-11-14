# Ribbon

Shared gift wish lists without spoilers, on Effect v4 and Alchemy v2 on Cloudflare, with a React frontend on TanStack Start.

An Effect Worker owns the API. Each wish list is an Effect Durable Object that owns the list's data and its open WebSockets. A guest's claim updates every other guest's page live; the owner's page never receives claim events.

```sh
pnpm install --frozen-lockfile
pnpm dev                              # http://localhost:3000, no Durable Objects
pnpm dev:cloudflare                   # alchemy dev: website on http://localhost:1338, API on :1337
pnpm run deploy --stage dev --yes     # deploy to Cloudflare
pnpm verify:live <deployed-url>       # check live updates against a deployment
```

Try the demo at `/lists/demo` in two tabs, and `/lists/demo?as=owner` in a third.

More in [docs/](docs/README.md).
