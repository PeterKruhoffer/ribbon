# Architecture

Two Workers, two Durable Object classes, and one R2 bucket, all deployed by `alchemy.run.ts`.

```text
Browser
  │  pages, /api, WebSockets (one origin)
  ▼
Website Worker ............ src/worker.ts
  │  TanStack Start renders pages
  │  /api/* goes to BACKEND (service binding)
  ▼
Backend Worker ............ src/backend/backend.ts
  │  Effect Worker, routes /api/lists/:listId/... and /api/photos
  │  lists.getByName(listId)            photos ──► Photos R2 bucket
  ▼                                                src/backend/photos.ts
Wishlist Durable Object ... src/backend/wishlist.ts
     one per wish list
     SQLite: item, item_detail, claim, meta
     open WebSockets (hibernating)
```

## Parts

**Website Worker.** Serves the React pages. Forwards every `/api/*` request, including WebSocket upgrades, to the Backend. Keep it thin.

**Backend Worker.** An Effect Worker (`Cloudflare.Worker`) serving `RibbonApi`, an Effect `HttpApi` defined in `src/shared/api.ts`. The API declares each route's params, body, answer, and errors; each error class in `src/shared/wishlist.ts` carries its own HTTP status (`httpApiStatus`). Three middlewares check the caller, in this order: `Authentication` verifies the Clerk token on every route and provides `Viewer`, `Throttle` applies the rate limits and daily caps below (`src/backend/limits.ts`), and `SignedIn` refuses signed-out requests to create, edit, or upload. All three run before the body is read. Each handler calls one Durable Object or photo method. A Durable Object's errors arrive over RPC as plain objects, so the Backend decodes them back into their classes. To add a route, add an endpoint to `RibbonApi` and a handler in `src/backend/backend.ts`.

**Photos bucket.** An R2 bucket (`Cloudflare.R2.Bucket`) for photos owners upload, declared in `src/backend/photos.ts` and bound to the Backend; Alchemy creates it with the Backend. Each photo is keyed by a random UUID and carries its uploader's Clerk user id as metadata. A wish stores an uploaded photo as `/api/photos/<key>`, so it stays up when a shop removes its image.

**Quota Durable Object.** `src/backend/quota.ts`, one per signed-in user, addressed by Clerk user id. Its one method, `take(kind, cap)`, counts one more of a kind (an endpoint name) for today (UTC) in its key-value storage, or answers false when the user already reached the cap. See Rate limits below.

**Wishlist Durable Object.** An Effect Durable Object (`Cloudflare.DurableObject`). One instance per list, addressed by list id. It stores the list in its own SQLite storage and holds the list's WebSockets. Its queries live in `src/backend/store.ts`, written as `@effect/sql-sqlite-do` tagged templates; the object keeps the sockets, builds one SQL client per instance, and treats a storage failure as a defect. An edit's writes run in one storage transaction. Methods:

| Method                         | Does                                                                                                                                                                                                                                                                                            |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create(list, owner)`          | Stores a new list's title, items, and owner's Clerk user id. Item ids are random UUIDs. A wish's photo, links, and note go in `item_detail`.                                                                                                                                                    |
| `read(listId, viewer)`         | Returns the list and the viewer's role. Guests get `remaining`, the owner does not.                                                                                                                                                                                                             |
| `update(listId, edit, viewer)` | The owner replaces the title and wishes. Wishes sent with an id keep it and their claims; new ones get an id; left-out ones are deleted with their claims. Then sends a list event to guests. Fails with `NotOwner`, `ListChanged` (stale or repeated id, before any write), or `ListNotFound`. |
| `claim(itemId, guest, viewer)` | Claims one unit, then sends a live event to guests. Fails with `OwnerCannotClaim`, `FullyClaimed`, or `ItemNotFound`.                                                                                                                                                                           |
| `fetch`                        | Opens a WebSocket for `/live`.                                                                                                                                                                                                                                                                  |
| `webSocketMessage`             | Handles subscribe and unsubscribe.                                                                                                                                                                                                                                                              |

## API

| Request                                       | Result                                                                                                                                                        |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/lists`                             | Signed in. Body `{ title, items: [{ title, quantity, photo?, links?, note? }] }`. 201 `{ listId }`, 400, or 401.                                              |
| `POST /api/photos`                            | Signed in. Body is the image. 201 `{ photo: "/api/photos/<key>" }`, 401, 413 over 5 MB, or 415 if not an image.                                               |
| `GET /api/photos/:key`                        | The image, cached for a year, or 404. No sign-in: guests load it with the list.                                                                               |
| `GET /api/lists/:listId`                      | `{ title, role, items }`, or 404. `role` is `owner` for the list's creator.                                                                                   |
| `PUT /api/lists/:listId`                      | Owner only. Body like `POST /api/lists`, with `id` on each kept wish. 204, 400, 401 signed out, 403 not the owner, 404, or 409 when an id is not on the list. |
| `POST /api/lists/:listId/items/:itemId/claim` | Body `{ "guest": "<token>" }`. 200, 404, 409, or 403 for the owner.                                                                                           |
| `GET /api/lists/:listId/live`                 | WebSocket upgrade. See [Live updates](live-updates.md).                                                                                                       |

Requests send the Clerk session token as `Authorization: Bearer <token>`, and WebSockets as `?token=`. A token that fails verification gets 401 on any route, and any route can answer 429 (see Rate limits). See [Auth](auth.md).

JSON bodies need `content-type: application/json`; a missing type counts as JSON, and any other gets 415. An error answers with its status and a JSON body naming the error, such as `{ "_tag": "ListNotFound", "listId": "…" }`. A body that fails its schema gets an empty 400. The browser turns these into words in `readError` (`src/ui/kit.tsx`).

Limits: titles 1 to 100 characters after trimming, 1 to 50 items, item titles up to 200 characters, quantities 1 to 99. Each item may have a photo, up to 5 shop links, and a note of up to 500 characters. Shop links must be `http(s)` URLs of up to 2000 characters; a photo is either such a URL or an uploaded photo's `/api/photos/<key>` path. They are rendered as `href` and `src`, so other schemes are refused.

### Rate limits

Every route counts each request against its Clerk user id, or its IP address (`cf-connecting-ip`) when signed out. Over a limit, the Backend answers 429 with `{ "_tag": "TooManyRequests" }` or `{ "_tag": "DailyLimitReached", "limit": <cap> }`.

| Limit                         | Counts                                                 | How                                                                   |
| ----------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------- |
| 600 reads a minute            | Every `GET`: lists, photos, and sockets                | Cloudflare rate limit binding `READ_LIMIT`, approximate per location  |
| 60 writes a minute            | Everything else, including guests' claims              | Cloudflare rate limit binding `WRITE_LIMIT`, approximate per location |
| 20 new lists a day (UTC)      | `POST /api/lists`, per user                            | The user's Quota Durable Object, exact                                |
| 200 photo uploads a day (UTC) | `POST /api/photos`, per user, refused uploads included | The user's Quota Durable Object, exact                                |

The bindings are declared in `src/backend/limits.ts`, like the Photos bucket in `photos.ts`; Alchemy attaches them to the Backend. Their namespace ids are fixed, so every stage shares the same counters. A limiter that errors lets the request through. A new endpoint gets the read or write limit by its method; add it to `dailyCaps` in `limits.ts` if it keeps data.

Uploads take JPEG, PNG, GIF, or WebP up to 5 MB. The Backend reads the type from the file's first bytes and serves it with `nosniff`, so nothing but a raster image is served from Ribbon's origin. Before uploading, the browser redraws the photo as a JPEG of at most 1600 px, which drops location data and keeps phone photos far under the limit. A photo no saved wish uses, because its list was never created or an edit replaced or removed it, stays in the bucket; nothing cleans those up yet.

The list page shows each wish as a roomy row: the photo beside the name, then the note (cut off after three lines with "Læs mere"), the shop links (two plus "+N mere" when there are more than three), and "Reservér" (claim) on its own line. Both the owner and guests see the details; only guests see claim counts.

The owner's "Redigér liste" (edit list) button swaps the page for the same form `/new` uses (`src/ui/editor.tsx`), filled in. Removing a saved wish asks first, because the owner cannot see whether a guest claimed it. Lowering a quantity below its claims keeps the claims, and guests see 0 left.

The list id is a random UUID, and the share link is `/lists/:listId`. The owner and guests open the same link; the owner's token makes the Backend answer with the owner view.

## Files

| Path                      | Holds                                                                                                                 |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `alchemy.run.ts`          | Stack: Backend, Website, bindings                                                                                     |
| `src/backend`             | Effect Worker, Durable Object and its SQL (`store.ts`), photo bucket (`photos.ts`), and Clerk token check (`auth.ts`) |
| `src/shared`              | The HTTP API (`api.ts`), and schemas and tagged errors used by both sides                                             |
| `src/live`                | WebSocket protocol and browser client                                                                                 |
| `src/ui`                  | StyleX tokens and shared UI pieces. See [Design](design.md).                                                          |
| `src/routes`              | TanStack Start pages. `routeTree.gen.ts` is generated; do not edit it, but keep it in Git.                            |
| `scripts/verify-live.mjs` | End-to-end checks against a running deployment                                                                        |
