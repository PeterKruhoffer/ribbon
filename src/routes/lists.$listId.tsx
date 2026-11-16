import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { connectLive } from "../live/client.ts";
import { entityTopic } from "../live/protocol.ts";
import type { ListView, Role } from "../shared/wishlist.ts";

// One list. Guests claim items, and a claim in one guest tab updates the
// others live; the owner sees the share link and receives no claim events.
// ?as=owner stands in for real authentication.

export const Route = createFileRoute("/lists/$listId")({
  validateSearch: (search: Record<string, unknown>): { as?: "owner" } =>
    search.as === "owner" ? { as: "owner" } : {},
  component: ListPage,
});

function guestToken() {
  let token = localStorage.getItem("ribbon-guest");
  if (!token) {
    token = crypto.randomUUID();
    localStorage.setItem("ribbon-guest", token);
  }
  return token;
}

function ListPage() {
  const { listId } = Route.useParams();
  const role: Role = Route.useSearch().as === "owner" ? "owner" : "guest";
  const query = role === "owner" ? "?as=owner" : "";
  const [list, setList] = useState<ListView | "missing">();
  const [events, setEvents] = useState(0);
  const [error, setError] = useState<string>();
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch(`/api/lists/${listId}${query}`);
    setList(response.status === 404 ? "missing" : ((await response.json()) as ListView));
  }, [listId, query]);

  useEffect(() => {
    void load();
  }, [load]);

  const itemIds = list === "missing" ? undefined : list?.items.map((item) => item.id).join(",");
  useEffect(() => {
    if (!itemIds) return;
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const live = connectLive(`${protocol}//${location.host}/api/lists/${listId}/live${query}`, {
      onReconnect: () => void load(),
    });
    for (const id of itemIds.split(",")) {
      void live.subscribe({
        id,
        topic: entityTopic("Item", id),
        onEvent: () => {
          setEvents((count) => count + 1);
          void load();
        },
      });
    }
    return () => live.close();
  }, [itemIds, listId, query, load]);

  const claim = async (itemId: string) => {
    setError(undefined);
    const response = await fetch(`/api/lists/${listId}/items/${itemId}/claim`, {
      method: "POST",
      body: JSON.stringify({ guest: guestToken() }),
    });
    if (!response.ok) setError(await response.text());
    await load();
  };

  if (!list) return <main style={{ padding: 24 }}>Loading…</main>;
  if (list === "missing")
    return (
      <main style={{ padding: 24 }}>
        <h1>List not found</h1>
        <p>
          Check the link, or <a href="/">make a new list</a>.
        </p>
      </main>
    );
  const shareUrl = `${location.origin}/lists/${listId}`;
  return (
    <main style={{ padding: 24, maxWidth: 520 }}>
      <h1 style={{ marginBottom: 4 }}>{list.title}</h1>
      <p style={{ color: "#666", marginTop: 0 }}>Viewing as {role}</p>
      {role === "owner" && (
        <div style={{ display: "flex", gap: 8 }}>
          <input readOnly aria-label="Share link" value={shareUrl} style={{ flex: 1 }} data-share />
          <button
            onClick={() => void navigator.clipboard.writeText(shareUrl).then(() => setCopied(true))}
          >
            {copied ? "Copied" : "Copy share link"}
          </button>
        </div>
      )}
      <ul style={{ listStyle: "none", padding: 0 }}>
        {list.items.map((item) => (
          <li
            key={item.id}
            data-item={item.id}
            style={{ display: "flex", gap: 12, alignItems: "center", padding: "8px 0" }}
          >
            <span style={{ flex: 1 }}>{item.title}</span>
            {role === "owner" ? (
              <span style={{ color: "#666" }}>wants {item.quantity}</span>
            ) : (
              <>
                <span data-remaining>{item.remaining} left</span>
                <button disabled={item.remaining === 0} onClick={() => void claim(item.id)}>
                  Claim
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
      {error && <p style={{ color: "#b00020" }}>{error}</p>}
      <p style={{ color: "#666" }} data-events>
        Live events received: {events}
      </p>
    </main>
  );
}
