import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
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
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  );
}
