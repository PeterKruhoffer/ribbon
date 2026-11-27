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
export const unreadableAnswer =
  "Ribbons server sendte et svar, som siden ikke kan læse. Prøv igen.";

// Failures the Backend answers with, each with its HTTP status. The browser
// turns the tag into words (readError in src/ui/kit.tsx).

export class ListNotFound extends Schema.TaggedError<ListNotFound>()(
  "ListNotFound",
  { listId: Schema.String },
  { httpApiStatus: 404 },
) {}

export class ItemNotFound extends Schema.TaggedError<ItemNotFound>()(
  "ItemNotFound",
  { itemId: Schema.String },
  { httpApiStatus: 404 },
) {}

// An edit named a wish the list no longer has, so the owner's copy is stale.
export class ListChanged extends Schema.TaggedError<ListChanged>()(
  "ListChanged",
  { itemId: Schema.String },
  { httpApiStatus: 409 },
) {}

export class OwnerCannotClaim extends Schema.TaggedError<OwnerCannotClaim>()(
  "OwnerCannotClaim",
  {},
  { httpApiStatus: 403 },
) {}

// Only the list's owner edits it.
export class NotOwner extends Schema.TaggedError<NotOwner>()(
  "NotOwner",
  {},
  { httpApiStatus: 403 },
) {}

// The request carried a Clerk session token that failed verification.
export class Unauthorized extends Schema.TaggedError<Unauthorized>()(
  "Unauthorized",
  {},
  { httpApiStatus: 401 },
) {}

// Making a list, editing one, and uploading a photo need a signed-in user.
export class SignInRequired extends Schema.TaggedError<SignInRequired>()(
  "SignInRequired",
  {},
  { httpApiStatus: 401 },
) {}

export class FullyClaimed extends Schema.TaggedError<FullyClaimed>()(
  "FullyClaimed",
  { itemId: Schema.String },
  { httpApiStatus: 409 },
) {}

export class PhotoNotFound extends Schema.TaggedError<PhotoNotFound>()(
  "PhotoNotFound",
  {},
  { httpApiStatus: 404 },
) {}

export class PhotoTooLarge extends Schema.TaggedError<PhotoTooLarge>()(
  "PhotoTooLarge",
  {},
  { httpApiStatus: 413 },
) {}

// The upload's first bytes are not a JPEG, PNG, GIF, or WebP.
export class NotAnImage extends Schema.TaggedError<NotAnImage>()(
  "NotAnImage",
  {},
  { httpApiStatus: 415 },
) {}

export class PhotoStorageFailed extends Schema.TaggedError<PhotoStorageFailed>()(
  "PhotoStorageFailed",
  {},
  { httpApiStatus: 502 },
) {}

// Too many requests in the last minute, from this user or, signed out, this
// IP address. See Rate limits in docs/architecture.md.
export class TooManyRequests extends Schema.TaggedError<TooManyRequests>()(
  "TooManyRequests",
  {},
  { httpApiStatus: 429 },
) {}

// The user made as many lists or uploaded as many photos as one day allows.
export class DailyLimitReached extends Schema.TaggedError<DailyLimitReached>()(
  "DailyLimitReached",
  { limit: Schema.Number },
  { httpApiStatus: 429 },
) {}
