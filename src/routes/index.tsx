import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { Effect } from "effect";

const getGreeting = createServerFn().handler(() =>
  Effect.runPromise(Effect.succeed("Hello from Ribbon 🎀")),
);

export const Route = createFileRoute("/")({
  loader: () => getGreeting(),
  component: Home,
});

function Home() {
  const greeting = Route.useLoaderData();
  return (
    <main style={{ display: "grid", placeItems: "center", minHeight: "100vh" }}>
      <div>
        <h1>{greeting}</h1>
        <p>
          Live demo: <a href="/lists/demo">guest view</a> ·{" "}
          <a href="/lists/demo?as=owner">owner view</a>
        </p>
      </div>
    </main>
  );
}
