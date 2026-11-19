// Prints a fresh Clerk session token for a test owner, for `pnpm verify:live`
// in CI. It signs in a Clerk test user, creating it on first use.
// Usage: RIBBON_OWNER_TOKEN=$(CLERK_SECRET_KEY=sk_... node scripts/owner-token.mjs)
// The secret key must belong to the instance the deployment verifies tokens for.
import { createClerkClient } from "@clerk/backend";

const secretKey = process.env.CLERK_SECRET_KEY;
if (!secretKey) throw new Error("Set CLERK_SECRET_KEY to the Clerk instance's secret key");
const clerk = createClerkClient({ secretKey });
// +clerk_test addresses never receive email.
const email = "ci+clerk_test@example.com";

const { data: users } = await clerk.users.getUserList({ emailAddress: [email] });
const user =
  users[0] ??
  (await clerk.users.createUser({
    emailAddress: [email],
    firstName: "Ribbon CI",
    skipPasswordRequirement: true,
  }));
const session = await clerk.sessions.createSession({ userId: user.id });
const { jwt } = await clerk.sessions.getToken(session.id);
process.stdout.write(jwt);
