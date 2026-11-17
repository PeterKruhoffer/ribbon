import { useAuth } from "@clerk/react";
import * as stylex from "@stylexjs/stylex";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { connectLive } from "../live/client.ts";
import { entityTopic } from "../live/protocol.ts";
import type { ListView } from "../shared/wishlist.ts";
import { ClaimGift, OpenBox, WrappedGift } from "../ui/figures.tsx";
import { Page, readError, Ribbon, row, Tag, ui } from "../ui/kit.tsx";
import { color } from "../ui/tokens.stylex.ts";

// One list. Guests claim items, and a claim in one guest tab updates the
// others live; the owner sees the share link and receives no claim events.
// The Backend decides the role: the signed-in user who created the list is
// the owner, and everyone else with the link is a guest.

export const Route = createFileRoute("/lists/$listId")({ component: ListPage });

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
  // Wait for Clerk before the first fetch. Fetching signed out would show the
  // owner the guest view, claims included.
  const { isLoaded, userId, getToken } = useAuth();
  const [list, setList] = useState<ListView | "missing">();
  const [events, setEvents] = useState(0);
  const [error, setError] = useState<string>();
  const [copied, setCopied] = useState(false);
  const [claiming, setClaiming] = useState<string>();
  // Each claim gets a new id, so its figure remounts and its animation plays again.
  const [claimed, setClaimed] = useState<{ id: number; title: string }>();
  // Items already taken when the list first showed. Their tags hang still; the
  // tag swings in only for an item that becomes taken while the page is open.
  const takenAtLoad = useRef<{ listId: string; ids: Set<string> }>(undefined);

  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const token = await getToken();
    return token ? { authorization: `Bearer ${token}` } : {};
  }, [getToken]);

  // userId is a dependency so signing in or out reloads the list in its new role.
  const load = useCallback(async () => {
    if (!isLoaded) return;
    const response = await fetch(`/api/lists/${listId}`, { headers: await authHeaders() });
    if (response.ok || response.status === 404)
      setList(response.status === 404 ? "missing" : ((await response.json()) as ListView));
    else setError(await readError(response));
  }, [isLoaded, userId, listId, authHeaders]);

  useEffect(() => {
    void load();
  }, [load]);

  const itemIds = list === "missing" ? undefined : list?.items.map((item) => item.id).join(",");
  const role = list === "missing" ? undefined : list?.role;
  useEffect(() => {
    if (!itemIds) return;
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    // Session tokens last a minute, so each reconnect asks Clerk for a fresh one.
    const url = async () => {
      const token = await getToken();
      const query = token ? `?token=${encodeURIComponent(token)}` : "";
      return `${protocol}//${location.host}/api/lists/${listId}/live${query}`;
    };
    const live = connectLive(url, { onReconnect: () => void load() });
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
  }, [itemIds, role, listId, getToken, load]);

  const claim = async (itemId: string, title: string) => {
    setError(undefined);
    setClaiming(itemId);
    const response = await fetch(`/api/lists/${listId}/items/${itemId}/claim`, {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify({ guest: guestToken() }),
    });
    if (response.ok) setClaimed((last) => ({ id: (last?.id ?? 0) + 1, title }));
    else setError(await readError(response));
    await load();
    setClaiming(undefined);
  };

  if (!list)
    return (
      <Page>
        <WrappedGift style={s.waiting} />
        <p {...stylex.props(ui.small)}>Opening the list…</p>
      </Page>
    );
  if (list === "missing")
    return (
      <Page>
        <OpenBox style={s.missing} />
        <h1 {...stylex.props(ui.title)}>List not found</h1>
        <p {...stylex.props(ui.sub)}>
          Check the link, or{" "}
          <a href="/" {...stylex.props(ui.link)}>
            make a new list
          </a>
          .
        </p>
      </Page>
    );
  if (takenAtLoad.current?.listId !== listId)
    takenAtLoad.current = {
      listId,
      ids: new Set(list.items.filter((item) => item.remaining === 0).map((item) => item.id)),
    };
  const takenIds = takenAtLoad.current.ids;
  const shareUrl = `${location.origin}/lists/${listId}`;
  const owner = list.role === "owner";
  return (
    <Page>
      <h1 {...stylex.props(ui.title)}>{list.title}</h1>
      <p {...stylex.props(ui.sub)}>
        {owner
          ? "Your list. Guests see what is still free, and you never see who claimed what."
          : "Claim a gift so nobody else buys the same one. The list's owner never sees who claimed what."}
      </p>
      {owner && (
        <div {...stylex.props(s.share)}>
          <input
            readOnly
            aria-label="Share link"
            value={shareUrl}
            onFocus={(event) => event.target.select()}
            {...stylex.props(ui.field, s.shareField)}
            data-share
          />
          <button
            onClick={() => void navigator.clipboard.writeText(shareUrl).then(() => setCopied(true))}
            {...stylex.props(ui.button)}
          >
            {copied ? "Copied" : "Copy share link"}
          </button>
        </div>
      )}
      <Ribbon>
        <ul {...stylex.props(s.list)}>
          {list.items.map((item) => {
            const taken = item.remaining === 0;
            return (
              <li key={item.id} data-item={item.id} {...stylex.props(row.base)}>
                {!owner && taken && (
                  <span {...stylex.props(row.tag)}>
                    <Tag swing={!takenIds.has(item.id)} />
                  </span>
                )}
                <span {...stylex.props(s.name, taken && ui.soft)}>{item.title}</span>
                {owner ? (
                  <span {...stylex.props(s.meta)}>wants {item.quantity}</span>
                ) : (
                  <>
                    <span data-remaining {...stylex.props(s.meta)}>
                      {item.remaining} of {item.quantity} left
                    </span>
                    {taken ? (
                      <span {...stylex.props(s.taken)}>Taken</span>
                    ) : (
                      <button
                        disabled={claiming !== undefined}
                        onClick={() => void claim(item.id, item.title)}
                        {...stylex.props(ui.button)}
                      >
                        Claim
                      </button>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </Ribbon>
      {!owner && (
        <div {...stylex.props(s.footer)}>
          {error && (
            <p role="alert" {...stylex.props(ui.error)}>
              {error}
            </p>
          )}
          <div {...stylex.props(s.status)}>
            {claimed && <ClaimGift key={claimed.id} style={s.claimFigure} />}
            <p aria-live="polite" data-events={events} {...stylex.props(ui.small)}>
              {claimed
                ? `You claimed ${claimed.title}. Other guests see it now.`
                : "Claims show up for every guest right away."}
            </p>
          </div>
        </div>
      )}
    </Page>
  );
}

const MOBILE = "@media (max-width: 480px)";

const s = stylex.create({
  share: { display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 32 },
  shareField: { flex: "1 1 240px", fontSize: 14 },
  list: { listStyle: "none", margin: 0, padding: 0 },
  name: { flex: 1, minWidth: 0, overflowWrap: "anywhere" },
  meta: {
    fontSize: 14,
    color: color.soft,
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
    display: { default: null, [MOBILE]: "none" },
  },
  taken: { minWidth: 76, fontSize: 15, color: color.soft, textAlign: "center" },
  footer: { display: "grid", gap: 6, marginTop: 24 },
  status: { display: "flex", alignItems: "center", gap: 12 },
  claimFigure: { width: 64, flexShrink: 0 },
  waiting: { width: 120, marginBottom: 16 },
  missing: { maxWidth: 320, marginBottom: 20 },
});
