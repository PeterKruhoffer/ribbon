import { Context, Schema } from "effect";
import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiMiddleware,
  HttpApiSchema,
} from "effect/http-api";
import {
  CreatedList,
  DailyLimitReached,
  FullyClaimed,
  ItemNotFound,
  ListChanged,
  ListEdit,
  ListNotFound,
  ListView,
  NewList,
  NotAnImage,
  NotOwner,
  OwnerCannotClaim,
  PhotoNotFound,
  PhotoStorageFailed,
  PhotoTooLarge,
  SignInRequired,
  TooManyRequests,
  Unauthorized,
  UploadedPhoto,
} from "./wishlist.ts";

// The Backend's HTTP API: every route, its input, its answer, and the errors
// it can fail with. src/backend/backend.ts implements it.

// The Clerk user id of whoever sent the request, or undefined when it carried
// no session token. Authentication provides it on every route.
export class Viewer extends Context.Service<Viewer, string | undefined>()("ribbon/Viewer") {}

// The signed-in viewer, on routes behind SignedIn.
export class SignedInUser extends Context.Service<SignedInUser, string>()("ribbon/SignedInUser") {}

// Verifies the Clerk token in the Authorization header, or in ?token= for a
// WebSocket, which cannot set headers. A token that fails verification is an
// error, never a quiet fall back to a guest: a signed-in owner treated as a
// guest would see the claims.
export class Authentication extends HttpApiMiddleware.Service<
  Authentication,
  { provides: Viewer }
>()("ribbon/Authentication", { error: Unauthorized }) {}

// Refuses signed-out requests before their body is read.
export class SignedIn extends HttpApiMiddleware.Service<
  SignedIn,
  { provides: SignedInUser; requires: Viewer }
>()("ribbon/SignedIn", { error: SignInRequired }) {}

// Rate limits every route by user, or by IP address when signed out, and caps
// how many lists and photos a user makes in a day. Runs after Authentication
// and before the body is read. See src/backend/limits.ts.
export class Throttle extends HttpApiMiddleware.Service<Throttle, { requires: Viewer }>()(
  "ribbon/Throttle",
  { error: [TooManyRequests, DailyLimitReached] },
) {}

const Id = Schema.String.check(Schema.isPattern(/^[\w-]{1,64}$/));
const listParams = { listId: Id };

const Lists = HttpApiGroup.make("lists").add(
  // A random UUID is the new list's id and its share link, so links can't be
  // guessed. The creator becomes the owner.
  HttpApiEndpoint.post("create", "/api/lists", {
    payload: NewList,
    success: CreatedList.pipe(HttpApiSchema.status(201)),
  }).middleware(SignedIn),
  HttpApiEndpoint.get("read", "/api/lists/:listId", {
    params: listParams,
    success: ListView,
    error: ListNotFound,
  }),
  HttpApiEndpoint.put("update", "/api/lists/:listId", {
    params: listParams,
    payload: ListEdit,
    success: HttpApiSchema.NoContent,
    error: [ListNotFound, NotOwner, ListChanged],
  }).middleware(SignedIn),
  HttpApiEndpoint.post("claim", "/api/lists/:listId/items/:itemId/claim", {
    params: { listId: Id, itemId: Id },
    payload: Schema.Struct({ guest: Schema.String.check(Schema.isMaxLength(64)) }),
    success: Schema.Struct({ remaining: Schema.Number }),
    error: [OwnerCannotClaim, FullyClaimed, ItemNotFound],
  }),
  // A WebSocket upgrade, answered by the list's Durable Object. See
  // docs/live-updates.md.
  HttpApiEndpoint.get("live", "/api/lists/:listId/live", { params: listParams }),
);

const Photos = HttpApiGroup.make("photos").add(
  // The image is the raw body. Owners upload a wish's photo before saving.
  HttpApiEndpoint.post("upload", "/api/photos", {
    success: UploadedPhoto.pipe(HttpApiSchema.status(201)),
    error: [PhotoTooLarge, NotAnImage, PhotoStorageFailed],
  }).middleware(SignedIn),
  // Anyone with the list loads its photos, so reading needs no sign-in.
  HttpApiEndpoint.get("serve", "/api/photos/:key", {
    params: { key: Schema.String.check(Schema.isPattern(/^[0-9a-f-]{36}$/)) },
    error: [PhotoNotFound, PhotoStorageFailed],
  }),
);

// The middleware added last runs first: Authentication, then Throttle.
export const RibbonApi = HttpApi.make("Ribbon")
  .add(Lists)
  .add(Photos)
  .middleware(Throttle)
  .middleware(Authentication);
