import { Schema } from "effect";

// Shapes shared by the backend and the browser.

export const Role = Schema.Literals(["owner", "guest"]);
export type Role = typeof Role.Type;

export const Item = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  quantity: Schema.Number,
  // A photo (a link, or an uploaded photo's /api/photos/ path), shop links,
  // and a note from the owner. All optional.
  photo: Schema.optional(Schema.String),
  links: Schema.Array(Schema.String),
  note: Schema.optional(Schema.String),
  // Only guests see this. "2 of 5 left" would spoil the owner.
  remaining: Schema.optional(Schema.Number),
});

// role is "owner" only for the signed-in user who created the list.
export const ListView = Schema.Struct({
  title: Schema.String,
  role: Role,
  items: Schema.Array(Item),
});
export type ListView = typeof ListView.Type;

const Text = (maxLength: number) =>
  Schema.Trim.check(Schema.isMinLength(1), Schema.isMaxLength(maxLength));

// Links are rendered as href and src, so only http(s) gets through.
const Url = Schema.Trim.check(
  Schema.isMaxLength(2000),
  Schema.isPattern(/^https?:\/\/[^\s/?#]+\S*$/i),
);

// Uploaded photos live at photoPath + a UUID on Ribbon's own origin.
export const photoPath = "/api/photos/";
const Photo = Schema.Trim.check(
  Schema.isMaxLength(2000),
  Schema.isPattern(/^(?:https?:\/\/[^\s/?#]+\S*|\/api\/photos\/[0-9a-f-]{36})$/i),
);

const wish = {
  title: Text(200),
  quantity: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 99 })),
  photo: Schema.optionalKey(Photo),
  links: Schema.optionalKey(Schema.Array(Url).check(Schema.isMaxLength(5))),
  note: Schema.optionalKey(Text(500)),
};

// Body of POST /api/lists.
export const NewList = Schema.Struct({
  title: Text(100),
  items: Schema.Array(Schema.Struct(wish)).check(Schema.isMinLength(1), Schema.isMaxLength(50)),
});
export type NewList = typeof NewList.Type;

// Body of PUT /api/lists/:listId: the whole list as it should be now. Wishes
// with an id keep it (and their claims), wishes without one are new, and
// wishes left out are removed.
export const ListEdit = Schema.Struct({
  title: Text(100),
  items: Schema.Array(
    Schema.Struct({ id: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(64))), ...wish }),
  ).check(Schema.isMinLength(1), Schema.isMaxLength(50)),
});
export type ListEdit = typeof ListEdit.Type;

// Answer to POST /api/lists.
export const CreatedList = Schema.Struct({ listId: Schema.String });

// Answer to POST /api/photos: the path to use as the wish's photo.
export const UploadedPhoto = Schema.Struct({ photo: Schema.String });

// The browser shows this when an answer from the Backend doesn't match its schema.
export const unreadableAnswer = "Ribbon's server sent an answer this page can't read. Try again.";

export class ListNotFound extends Schema.TaggedError<ListNotFound>()("ListNotFound", {
  listId: Schema.String,
}) {}

export class ItemNotFound extends Schema.TaggedError<ItemNotFound>()("ItemNotFound", {
  itemId: Schema.String,
}) {}

export class OwnerCannotClaim extends Schema.TaggedError<OwnerCannotClaim>()(
  "OwnerCannotClaim",
  {},
) {}

// Only the list's owner edits it.
export class NotOwner extends Schema.TaggedError<NotOwner>()("NotOwner", {}) {}

// The request carried a Clerk session token that failed verification.
export class Unauthorized extends Schema.TaggedError<Unauthorized>()("Unauthorized", {}) {}

export class FullyClaimed extends Schema.TaggedError<FullyClaimed>()("FullyClaimed", {
  itemId: Schema.String,
}) {}
