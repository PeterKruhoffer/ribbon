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

export class ItemNotFound extends Schema.TaggedError<ItemNotFound>()("ItemNotFound", {
  itemId: Schema.String,
}) {}

export class FullyClaimed extends Schema.TaggedError<FullyClaimed>()("FullyClaimed", {
  itemId: Schema.String,
}) {}
