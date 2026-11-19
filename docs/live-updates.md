# Live updates

Each browser opens one WebSocket per list to `/api/lists/:listId/live`. The Wishlist Durable Object holds these sockets and sends events when a claim changes an item or the owner edits the list.

## Claim flow

```text
Guest A        Backend       Wishlist DO          Guest B     Owner
   │ POST claim   │              │                    │          │
   │─────────────▶│  claim()     │                    │          │
   │              │─────────────▶│ INSERT ... RETURNING          │
   │              │              │ event ────────────▶│          │
   │              │              │ (owner skipped)    │          ✗
   │◀──── 200 ────│◀─────────────│                    │          │
```

Guest B refetches the list after the event. The event itself holds only the item id and the changed field names.

## Protocol

Topics use fate's format: `entity:Item:<itemId>` for claims, and `entity:List:<listId>` for the owner's edits (`changed: ["title", "items"]`), since an edit can add and remove items. The page subscribes to both and refetches on either.

Browser to server:

```json
{ "op": "subscribe", "id": "s1", "topic": "entity:Item:socks" }
{ "op": "unsubscribe", "id": "s1" }
```

Server to browser:

```json
{
  "subscriptionId": "s1",
  "topic": "entity:Item:socks",
  "type": "update",
  "data": { "id": "socks", "changed": ["remaining"] }
}
```

`src/live/client.ts` is the browser side. It has the same shape as fate's live connector (`subscribe` returns an unsubscribe function, plus `close`), so fate can use it later. It asks for a fresh URL, with a fresh session token, before each connection. After a reconnect it subscribes again. It does not replay missed events, so the page refetches on reconnect.

## Spoiler protection

- The owner view has no `remaining` counts.
- The socket's role comes from the Clerk token in `?token=`, which the Backend verifies and passes on to the object. Each socket stores its role in its attachment. Claim events go to guest sockets only. A "something changed" event would already spoil the gift.
- Edit events also go to guests only. The owner's own page reloads after saving.
- An edit never reads claims, so its result tells the owner nothing about them.
- The owner cannot claim.

## Safe claims

Durable Object methods are Effects. Two requests can interleave between `yield*` steps. So a claim checks and writes in one SQL statement:

```sql
INSERT INTO claim (item_id, guest)
SELECT id, ? FROM item
WHERE id = ? AND quantity > (SELECT COUNT(*) FROM claim WHERE item_id = ?)
RETURNING id
```

No row back means the item is full or missing. Read the result from `RETURNING`. The cursor's `rowsWritten` gave wrong counts here.

## Hibernation

Cloudflare can remove an idle object from memory and keep its sockets open. The socket attachment (role and subscriptions) survives this. Keep attachments under 16 KB; the object caps each socket at 200 subscriptions.
