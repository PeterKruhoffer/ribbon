import { Effect, Option, Schema } from "effect";
import { SqlClient } from "effect/sql";
import {
  FullyClaimed,
  ItemNotFound,
  ListChanged,
  type ListEdit,
  ListNotFound,
  type ListView,
  type NewList,
  NotClaimed,
  NotOwner,
  OwnerCannotClaim,
  photoKey,
  type Role,
} from "../shared/wishlist.ts";

// A list's data in its Durable Object's SQLite storage. Wishlist provides the
// SqlClient and calls one of these per method, inside that method's span, so
// they are untraced.

const decodeLinks = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Array(Schema.String)));

export const migrate = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`CREATE TABLE IF NOT EXISTS item (id TEXT PRIMARY KEY, title TEXT NOT NULL, quantity INTEGER NOT NULL, position INTEGER NOT NULL)`;
  // A wish's photo, links (a JSON array), and note. A table of its own, so
  // lists made before wishes had details need no migration.
  yield* sql`CREATE TABLE IF NOT EXISTS item_detail (item_id TEXT PRIMARY KEY, photo TEXT, links TEXT NOT NULL, note TEXT)`;
  yield* sql`CREATE TABLE IF NOT EXISTS claim (id INTEGER PRIMARY KEY AUTOINCREMENT, item_id TEXT NOT NULL, guest TEXT NOT NULL)`;
  yield* sql`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`;
});

// The owner is the Clerk user who created the list. Anyone else, signed in or
// not, is a guest. Lists made before sign-in have no owner.
export const roleOf = Effect.fnUntraced(function* (viewer: string | undefined) {
  if (viewer === undefined) return "guest" satisfies Role;
  const sql = yield* SqlClient.SqlClient;
  const [owner] = yield* sql<{ value: string }>`SELECT value FROM meta WHERE key = 'owner'`;
  return owner?.value === viewer ? ("owner" satisfies Role) : ("guest" satisfies Role);
});

const titleOf = Effect.fnUntraced(function* (listId: string) {
  const sql = yield* SqlClient.SqlClient;
  const [meta] = yield* sql<{ value: string }>`SELECT value FROM meta WHERE key = 'title'`;
  if (!meta) return yield* new ListNotFound({ listId });
  return meta.value;
});

// The bucket keys of the photos this list's wishes use.
const photoKeys = Effect.fnUntraced(function* () {
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* sql<{ photo: string }>`SELECT photo FROM item_detail WHERE photo IS NOT NULL`;
  return new Set(rows.flatMap(({ photo }) => photoKey(photo) ?? []));
});

const ownerOnly = Effect.fnUntraced(function* (listId: string, viewer: string | undefined) {
  yield* titleOf(listId);
  if ((yield* roleOf(viewer)) !== "owner") return yield* new NotOwner();
});

// Writes one wish, new or existing, with its details. Its claims stay.
const saveItem = Effect.fnUntraced(function* (
  id: string,
  position: number,
  item: NewList["items"][number],
) {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`INSERT INTO item VALUES (${id}, ${item.title}, ${item.quantity}, ${position}) ON CONFLICT (id) DO UPDATE SET title = excluded.title, quantity = excluded.quantity, position = excluded.position`;
  const links = item.links ?? [];
  if (item.photo || item.note || links.length > 0)
    yield* sql`INSERT OR REPLACE INTO item_detail VALUES (${id}, ${item.photo ?? null}, ${JSON.stringify(links)}, ${item.note ?? null})`;
  else yield* sql`DELETE FROM item_detail WHERE item_id = ${id}`;
});

// The Backend picks a fresh random id for each new list, so the object starts
// empty. Item ids are random too, so they never repeat within a list once
// items can be removed.
export const createList = Effect.fnUntraced(function* (list: NewList, owner: string) {
  const sql = yield* SqlClient.SqlClient;
  yield* sql.withTransaction(
    Effect.gen(function* () {
      yield* sql`INSERT INTO meta VALUES ('title', ${list.title})`;
      yield* sql`INSERT INTO meta VALUES ('owner', ${owner})`;
      for (const [position, item] of list.items.entries())
        yield* saveItem(crypto.randomUUID(), position, item);
    }),
  );
});

// The owner replaces the list with an edited one, in one transaction. A removed
// wish takes its claims with it. Lowering a quantity below its claims keeps the
// claims, and guests see 0 left. Nothing here depends on claims, so the owner
// learns nothing about them from an edit. Answers the uploaded photos no wish
// uses any more, for the Backend to delete.
export const updateList = Effect.fnUntraced(function* (
  listId: string,
  list: ListEdit,
  viewer: string | undefined,
) {
  const sql = yield* SqlClient.SqlClient;
  yield* ownerOnly(listId, viewer);
  const existing = new Set((yield* sql<{ id: string }>`SELECT id FROM item`).map((row) => row.id));
  // Check every id before writing, so a stale edit changes nothing.
  const kept = new Set<string>();
  for (const { id } of list.items) {
    if (id === undefined) continue;
    if (!existing.has(id) || kept.has(id)) return yield* new ListChanged({ itemId: id });
    kept.add(id);
  }
  const photosBefore = yield* photoKeys();
  yield* sql.withTransaction(
    Effect.gen(function* () {
      for (const id of existing) {
        if (kept.has(id)) continue;
        yield* sql`DELETE FROM item WHERE id = ${id}`;
        yield* sql`DELETE FROM item_detail WHERE item_id = ${id}`;
        yield* sql`DELETE FROM claim WHERE item_id = ${id}`;
      }
      yield* sql`UPDATE meta SET value = ${list.title} WHERE key = 'title'`;
      for (const [position, { id, ...item }] of list.items.entries())
        yield* saveItem(id ?? crypto.randomUUID(), position, item);
    }),
  );
  const photosAfter = new Set(list.items.map((item) => photoKey(item.photo)));
  return [...photosBefore].filter((key) => !photosAfter.has(key));
});

// The owner deletes the list: every row goes, so the object reads as a list
// that was never made. Answers the list's uploaded photos, for the Backend to
// delete.
export const deleteList = Effect.fnUntraced(function* (listId: string, viewer: string | undefined) {
  const sql = yield* SqlClient.SqlClient;
  yield* ownerOnly(listId, viewer);
  const photos = yield* photoKeys();
  yield* sql.withTransaction(
    Effect.gen(function* () {
      yield* sql`DELETE FROM claim`;
      yield* sql`DELETE FROM item_detail`;
      yield* sql`DELETE FROM item`;
      yield* sql`DELETE FROM meta`;
    }),
  );
  return [...photos];
});

// guest is the token the guest's browser sent, if any. Its own claims come
// back as mine, so it can undo them.
export const readList = Effect.fnUntraced(function* (
  listId: string,
  viewer: string | undefined,
  guest: string | undefined,
) {
  const sql = yield* SqlClient.SqlClient;
  const title = yield* titleOf(listId);
  const role = yield* roleOf(viewer);
  const rows = yield* sql<{
    id: string;
    title: string;
    quantity: number;
    photo: string | null;
    links: string | null;
    note: string | null;
    claimed: number;
    mine: number;
  }>`SELECT item.id, item.title, item.quantity, d.photo, d.links, d.note, COUNT(claim.id) AS claimed, COUNT(CASE WHEN claim.guest = ${guest ?? null} THEN 1 END) AS mine FROM item LEFT JOIN item_detail d ON d.item_id = item.id LEFT JOIN claim ON claim.item_id = item.id GROUP BY item.id ORDER BY item.position`;
  const view: ListView = {
    title,
    role,
    items: rows.map(({ id, title, quantity, photo, links, note, claimed, mine }) => ({
      id,
      title,
      quantity,
      ...(photo === null ? {} : { photo }),
      links: links === null ? [] : Option.getOrElse(decodeLinks(links), () => []),
      ...(note === null ? {} : { note }),
      // An edit can lower a quantity below the claims already made.
      ...(role === "owner" ? {} : { remaining: Math.max(0, quantity - claimed) }),
      ...(role === "owner" || guest === undefined ? {} : { mine }),
    })),
  };
  return view;
});

// One conditional INSERT checks and claims in a single statement, so two
// guests racing for the last item cannot both win, even if the fibers handling
// their requests interleave. RETURNING makes the inserted row the result,
// which is reliable where the cursor's rowsWritten counter is not.
export const claimItem = Effect.fnUntraced(function* (
  itemId: string,
  guest: string,
  viewer: string | undefined,
) {
  const sql = yield* SqlClient.SqlClient;
  if ((yield* roleOf(viewer)) === "owner") return yield* new OwnerCannotClaim();
  const inserted =
    yield* sql`INSERT INTO claim (item_id, guest) SELECT id, ${guest} FROM item WHERE id = ${itemId} AND quantity > (SELECT COUNT(*) FROM claim WHERE item_id = ${itemId}) RETURNING id`;
  if (inserted.length === 0) {
    const exists = yield* sql`SELECT 1 FROM item WHERE id = ${itemId}`;
    return yield* exists.length > 0 ? new FullyClaimed({ itemId }) : new ItemNotFound({ itemId });
  }
  const [row] = yield* sql<{
    remaining: number;
  }>`SELECT quantity - (SELECT COUNT(*) FROM claim WHERE item_id = item.id) AS remaining FROM item WHERE id = ${itemId}`;
  return { remaining: row!.remaining };
});

// Undoes the guest token's latest claim on the item, in one statement. The
// owner is refused before any claim is read, so the answer tells them nothing.
export const unclaimItem = Effect.fnUntraced(function* (
  itemId: string,
  guest: string,
  viewer: string | undefined,
) {
  const sql = yield* SqlClient.SqlClient;
  if ((yield* roleOf(viewer)) === "owner") return yield* new OwnerCannotClaim();
  const deleted =
    yield* sql`DELETE FROM claim WHERE id = (SELECT MAX(id) FROM claim WHERE item_id = ${itemId} AND guest = ${guest}) RETURNING id`;
  if (deleted.length === 0) {
    const exists = yield* sql`SELECT 1 FROM item WHERE id = ${itemId}`;
    return yield* exists.length > 0 ? new NotClaimed({ itemId }) : new ItemNotFound({ itemId });
  }
  const [row] = yield* sql<{
    remaining: number;
  }>`SELECT quantity - (SELECT COUNT(*) FROM claim WHERE item_id = item.id) AS remaining FROM item WHERE id = ${itemId}`;
  return { remaining: Math.max(0, row!.remaining) };
});
