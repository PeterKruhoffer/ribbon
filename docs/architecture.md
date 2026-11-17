# Architecture

Two Workers and one Durable Object class, all defined in `alchemy.run.ts`.

```text
Browser
  │  pages, /api, WebSockets (one origin)
  ▼
Website Worker ............ src/worker.ts
  │  TanStack Start renders pages
  │  /api/* goes to BACKEND (service binding)
  ▼
Backend Worker ............ src/backend/backend.ts
  │  Effect Worker, routes /api/lists/:listId/...
  │  lists.getByName(listId)
  ▼
Wishlist Durable Object ... src/backend/wishlist.ts
     one per wish list
     SQLite: item, claim, meta
     open WebSockets (hibernating)
```

## Parts

**Website Worker.** Serves the React pages. Forwards every `/api/*` request, including WebSocket upgrades, to the Backend. Keep it thin.

**Backend Worker.** An Effect Worker (`Cloudflare.Worker`). It parses requests with `Schema`, calls the list's Durable Object, and maps tagged errors to HTTP status codes.

**Wishlist Durable Object.** An Effect Durable Object (`Cloudflare.DurableObject`). One instance per list, addressed by list id. It stores the list in its own SQLite storage and holds the list's WebSockets. Methods:

| Method                         | Does                                                                                                                  |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `create(list, owner)`          | Stores a new list's title, items, and owner's Clerk user id. Item ids are random UUIDs.                               |
| `read(listId, viewer)`         | Returns the list and the viewer's role. Guests get `remaining`, the owner does not.                                   |
| `claim(itemId, guest, viewer)` | Claims one unit, then sends a live event to guests. Fails with `OwnerCannotClaim`, `FullyClaimed`, or `ItemNotFound`. |
| `fetch`                        | Opens a WebSocket for `/live`.                                                                                        |
| `webSocketMessage`             | Handles subscribe and unsubscribe.                                                                                    |

## API

| Request                                       | Result                                                                                    |
| --------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `POST /api/lists`                             | Signed in. Body `{ title, items: [{ title, quantity }] }`. 201 `{ listId }`, 400, or 401. |
| `GET /api/lists/:listId`                      | `{ title, role, items }`, or 404. `role` is `owner` for the list's creator.               |
| `POST /api/lists/:listId/items/:itemId/claim` | Body `{ "guest": "<token>" }`. 200, 404, 409, or 403 for the owner.                       |
| `GET /api/lists/:listId/live`                 | WebSocket upgrade. See [Live updates](live-updates.md).                                   |

Requests send the Clerk session token as `Authorization: Bearer <token>`, and WebSockets as `?token=`. A token that fails verification gets 401 on any route. See [Auth](auth.md).

Limits: titles 1 to 100 characters after trimming, 1 to 50 items, item titles up to 200 characters, quantities 1 to 99.

The list id is a random UUID, and the share link is `/lists/:listId`. The owner and guests open the same link; the owner's token makes the Backend answer with the owner view.

## Files

| Path                      | Holds                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------ |
| `alchemy.run.ts`          | Stack: Backend, Website, bindings                                                          |
| `src/backend`             | Effect Worker, Durable Object, and Clerk token check (`auth.ts`)                           |
| `src/shared`              | Schemas and tagged errors used by both sides                                               |
| `src/live`                | WebSocket protocol and browser client                                                      |
| `src/ui`                  | StyleX tokens and shared UI pieces. See [Design](design.md).                               |
| `src/routes`              | TanStack Start pages. `routeTree.gen.ts` is generated; do not edit it, but keep it in Git. |
| `scripts/verify-live.mjs` | End-to-end checks against a running deployment                                             |
