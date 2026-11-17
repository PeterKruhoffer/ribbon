import { verifyJwt } from "@clerk/backend/jwt";
import { Effect } from "effect";
import { Unauthorized } from "../shared/wishlist.ts";

// Owners sign in with Clerk. The browser sends its Clerk session token, and
// the Backend checks the signature against the instance's public key
// (CLERK_JWT_KEY, PEM), so verifying needs no network call and no secret.
// Returns the Clerk user id, or undefined when the request has no token.
// A token that fails verification is an error, never a quiet fall back to a
// guest: a signed-in owner treated as a guest would see the claims.
export const viewerOf = (jwtKey: string, token: string | undefined) =>
  token === undefined
    ? Effect.succeed(undefined)
    : Effect.tryPromise({
        try: () => verifyJwt(token, { key: jwtKey }),
        catch: () => new Unauthorized(),
      }).pipe(Effect.map((payload) => payload.sub));

// The Durable Object reads the verified viewer of a WebSocket upgrade from this
// header. The Backend always overwrites it, so a browser cannot pick its own.
export const viewerHeader = "x-ribbon-viewer";
