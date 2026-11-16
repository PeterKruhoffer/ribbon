import { Schema } from "effect";

// Shapes shared by the backend and the browser.

export const Role = Schema.Literals(["owner", "guest"]);
export type Role = typeof Role.Type;

export const Item = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  quantity: Schema.Number,
  // Only guests see this. "2 of 5 left" would spoil the owner.
  remaining: Schema.optional(Schema.Number),
});

export const ListView = Schema.Struct({ title: Schema.String, items: Schema.Array(Item) });
export type ListView = typeof ListView.Type;

const Text = (maxLength: number) =>
  Schema.Trim.check(Schema.isMinLength(1), Schema.isMaxLength(maxLength));

// Body of POST /api/lists.
export const NewList = Schema.Struct({
  title: Text(100),
  items: Schema.Array(
    Schema.Struct({
      title: Text(200),
      quantity: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 99 })),
    }),
  ).check(Schema.isMinLength(1), Schema.isMaxLength(50)),
});
export type NewList = typeof NewList.Type;

export class ListNotFound extends Schema.TaggedError<ListNotFound>()("ListNotFound", {
  listId: Schema.String,
}) {}

export class ItemNotFound extends Schema.TaggedError<ItemNotFound>()("ItemNotFound", {
  itemId: Schema.String,
}) {}

export class FullyClaimed extends Schema.TaggedError<FullyClaimed>()("FullyClaimed", {
  itemId: Schema.String,
}) {}
