import { ClerkProvider } from "@clerk/react";
import { createRootRoute, HeadContent, Outlet, Scripts, useRouter } from "@tanstack/react-router";
import appCss from "../styles.css?url";

// In a build, the StyleX plugin appends every StyleX rule to styles.css. In dev
// it serves them from a virtual stylesheet and reloads it on change.
const devStylex = import.meta.env.DEV;

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Ribbon" },
      { name: "description", content: "Shared gift wish lists without spoilers." },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      ...(devStylex ? [{ rel: "stylesheet", href: "/virtual:stylex.css" }] : []),
    ],
    scripts: devStylex ? [{ type: "module", src: "/@id/virtual:stylex:runtime" }] : [],
  }),
  component: RootDocument,
});

function RootDocument() {
  const router = useRouter();
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {/* Clerk runs in the browser only. The Backend verifies its session
            tokens, so the pages need no server-side Clerk middleware. Clerk
            navigates through the router after sign-in, so the page does not
            reload. */}
        <ClerkProvider
          publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}
          routerPush={(href) => router.navigate({ href })}
          routerReplace={(href) => router.navigate({ href, replace: true })}
          appearance={{ variables: { colorPrimary: "#b0243a" } }}
        >
          <Outlet />
        </ClerkProvider>
        <Scripts />
      </body>
    </html>
  );
}
