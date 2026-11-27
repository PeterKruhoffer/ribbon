# Auth

Owners sign in with [Clerk](https://clerk.com). Guests never need an account: the share link is enough to see the list and claim gifts.

| Who                              | Can                                        |
| -------------------------------- | ------------------------------------------ |
| Signed-out visitor               | Open a shared list as a guest and claim.   |
| Signed-in user                   | Create lists. Open other lists as a guest. |
| Signed-in user who made the list | Open it as the owner. Cannot claim.        |

## Pages

The landing page (`/`) has no form. Its "Lav en ønskeliste" (make a wish list) button and the header's "Log ind" (sign in) both open the Clerk modal and go to `/new` after sign-in; a signed-in visitor's button links straight there. `/new` holds the create form and shows a sign-in prompt to signed-out visitors. Signing in from a list page stays on that page, so a guest who owns the list reloads it as the owner.

## How a request is checked

1. The browser loads Clerk with `ClerkProvider` in `src/routes/__root.tsx`. Clerk runs in the browser only; TanStack Start has no Clerk middleware because it only renders pages.
2. The page asks Clerk for a session token (`getToken()`, valid for 60 s) and sends it as `Authorization: Bearer <token>`. WebSockets cannot set headers, so they send `?token=`.
3. The Backend verifies the token with the instance's PEM public key (`CLERK_JWT_KEY`) in `src/backend/auth.ts`. Verifying needs no network call and no Clerk secret key. The token's `sub`, the Clerk user id, is the viewer.
4. `POST /api/lists` stores the viewer as the list's owner in the Durable Object's `meta` table. Every read, claim, and socket compares the viewer to it.

A token that fails verification gets 401 instead of the guest view. A signed-in owner who quietly became a guest would see the claims.

The Backend passes a socket's viewer to the Durable Object in the `x-ribbon-viewer` header and always overwrites it, so a browser cannot set it.

## Configuration

| Name                         | Where                         | Value                                         |
| ---------------------------- | ----------------------------- | --------------------------------------------- |
| `VITE_CLERK_PUBLISHABLE_KEY` | Website bundle, at build time | Clerk publishable key (`pk_...`)              |
| `CLERK_JWT_KEY`              | Backend, bound by Alchemy     | PEM public key on one line, from Clerk's JWKS |

Both are public. `.env.example` has the values for the development instance, and the Amp project sets them for orbs. A production Clerk instance has its own keys; set them in the deploy environment.

The Clerk application is "Ribbon" (`app_3MFMAKmWIMvpTrm1bTHiBOoIyj2`), with a development instance at `moral-escargot-2597.clerk.accounts.dev`. Sign-in uses email codes, passwords, or Google. Sign-up is open to anyone, by Peter's choice, so his friends can make their own lists. The rate limits and daily caps in [Architecture](architecture.md#rate-limits) keep it from being abused; the development instance also stops at 100 users.

## Lists made before sign-in

Lists created before Clerk have no owner. Everyone, including their creator, opens them as a guest.
