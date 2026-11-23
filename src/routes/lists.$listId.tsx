import { useAuth } from "@clerk/react";
import * as stylex from "@stylexjs/stylex";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { connectLive } from "../live/client.ts";
import { entityTopic } from "../live/protocol.ts";
import { Option, Schema } from "effect";
import { type ListEdit, ListView, unreadableAnswer } from "../shared/wishlist.ts";
import { draftsOf, ListEditor } from "../ui/editor.tsx";
import { ClaimGift, OpenBox, WrappedGift } from "../ui/figures.tsx";
import { Page, readError, Ribbon, row, Tag, ui } from "../ui/kit.tsx";
import { color, figure } from "../ui/tokens.stylex.ts";

// One list. Guests claim items, and a claim in one guest tab updates the
// others live. The owner sees the share link, can edit the list, and receives
// no claim events. An edit reaches guests live too.
// The Backend decides the role: the signed-in user who created the list is
// the owner, and everyone else with the link is a guest.

export const Route = createFileRoute("/lists/$listId")({ component: ListPage });

const decodeListView = Schema.decodeUnknownOption(ListView);

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
  const [editing, setEditing] = useState(false);
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
    if (response.status === 404) return setList("missing");
    if (!response.ok) return setError(await readError(response));
    const view = decodeListView(await response.json());
    if (Option.isSome(view)) setList(view.value);
    else setError(unreadableAnswer);
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
    // The owner's edits arrive on the list's topic; claims on each item's.
    void live.subscribe({
      id: "list",
      topic: entityTopic("List", listId),
      onEvent: () => void load(),
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
  }, [itemIds, role, listId, getToken, load]);

  const claim = async (itemId: string, title: string) => {
    setError(undefined);
    setClaiming(itemId);
    const response = await fetch(`/api/lists/${listId}/items/${itemId}/claim`, {
      method: "POST",
      headers: { ...(await authHeaders()), "content-type": "application/json" },
      body: JSON.stringify({ guest: guestToken() }),
    });
    if (response.ok) setClaimed((last) => ({ id: (last?.id ?? 0) + 1, title }));
    else setError(await readError(response));
    await load();
    setClaiming(undefined);
  };

  const save = async (edit: ListEdit) => {
    const response = await fetch(`/api/lists/${listId}`, {
      method: "PUT",
      headers: { ...(await authHeaders()), "content-type": "application/json" },
      body: JSON.stringify(edit),
    });
    if (!response.ok) return readError(response);
    await load();
    setEditing(false);
  };

  if (!list)
    return (
      <Page>
        <WrappedGift style={s.waiting} />
        <p {...stylex.props(ui.small)}>Åbner listen…</p>
      </Page>
    );
  if (list === "missing")
    return (
      <Page>
        <OpenBox style={s.missing} />
        <h1 {...stylex.props(ui.title)}>Listen blev ikke fundet</h1>
        <p {...stylex.props(ui.sub)}>
          Tjek linket, eller{" "}
          <a href="/" {...stylex.props(ui.link)}>
            lav en ny liste
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
  if (owner && editing)
    return (
      <Page>
        <h1 {...stylex.props(ui.title)}>Redigér din liste</h1>
        <p {...stylex.props(ui.sub)}>
          Gæsterne ser dine ændringer med det samme. Ønsker beholder deres reservationer, medmindre
          du fjerner dem.
        </p>
        <ListEditor
          initial={{ title: list.title, items: draftsOf(list) }}
          submit="Gem ændringer"
          submitting="Gemmer…"
          onSubmit={save}
          onCancel={() => setEditing(false)}
        />
      </Page>
    );
  return (
    <Page>
      <h1 {...stylex.props(ui.title)}>{list.title}</h1>
      <p {...stylex.props(ui.sub)}>
        {owner
          ? "Din liste. Gæsterne ser, hvad der stadig er ledigt, og du ser aldrig, hvem der har reserveret hvad."
          : "Reservér en gave, så ingen andre køber den samme. Listens ejer ser aldrig, hvem der har reserveret hvad."}
      </p>
      {owner && (
        <div {...stylex.props(s.share)}>
          <input
            readOnly
            aria-label="Delingslink"
            value={shareUrl}
            onFocus={(event) => event.target.select()}
            {...stylex.props(ui.field, s.shareField)}
            data-share
          />
          <button
            onClick={() => void navigator.clipboard.writeText(shareUrl).then(() => setCopied(true))}
            {...stylex.props(ui.button)}
          >
            {copied ? "Kopieret" : "Kopiér delingslink"}
          </button>
          <button onClick={() => setEditing(true)} {...stylex.props(ui.button, ui.quiet)}>
            Redigér liste
          </button>
        </div>
      )}
      <Ribbon>
        <ul {...stylex.props(s.list)}>
          {list.items.map((item) => {
            const taken = item.remaining === 0;
            return (
              <li key={item.id} data-item={item.id} {...stylex.props(row.base, s.item)}>
                {!owner && taken && (
                  <span {...stylex.props(row.tag, s.tag)}>
                    <Tag swing={!takenIds.has(item.id)} />
                  </span>
                )}
                <div {...stylex.props(s.head)}>
                  {item.photo && (
                    <img
                      src={item.photo}
                      alt=""
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      onError={(event) => (event.currentTarget.hidden = true)}
                      {...stylex.props(s.photo)}
                    />
                  )}
                  <span {...stylex.props(s.name, taken && ui.soft)}>{item.title}</span>
                </div>
                {item.note && <Note text={item.note} />}
                {item.links.length > 0 && <Shops links={item.links} />}
                <div {...stylex.props(s.foot)}>
                  {owner ? (
                    <span {...stylex.props(s.meta)}>ønsker {item.quantity}</span>
                  ) : (
                    <>
                      <span data-remaining {...stylex.props(s.meta)}>
                        {item.remaining} af {item.quantity} tilbage
                      </span>
                      {taken ? (
                        <span {...stylex.props(s.taken)}>Reserveret</span>
                      ) : (
                        <button
                          disabled={claiming !== undefined}
                          onClick={() => void claim(item.id, item.title)}
                          {...stylex.props(ui.button)}
                        >
                          Reservér
                        </button>
                      )}
                    </>
                  )}
                </div>
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
                ? `Du har reserveret ${claimed.title}. De andre gæster kan se det nu.`
                : "Reservationer vises for alle gæster med det samme."}
            </p>
          </div>
        </div>
      )}
    </Page>
  );
}

// The owner's note, cut off after three lines with a button to read the rest.
function Note({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [long, setLong] = useState(false);
  useEffect(() => {
    const note = ref.current;
    if (!note || open) return;
    const measure = () => setLong(note.scrollHeight > note.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(note);
    return () => observer.disconnect();
  }, [open, text]);
  return (
    <div {...stylex.props(s.noteWrap)}>
      <p ref={ref} {...stylex.props(s.note, !open && s.clamp)}>
        {text}
      </p>
      {long && (
        <button onClick={() => setOpen(!open)} {...stylex.props(s.more)}>
          {open ? "Vis mindre" : "Læs mere"}
        </button>
      )}
    </div>
  );
}

const host = (link: string) => {
  try {
    return new URL(link).hostname.replace(/^www\./, "");
  } catch {
    return link;
  }
};

// Shop links as chips. More than three show the first two and a button for the rest.
function Shops({ links }: { links: readonly string[] }) {
  const [open, setOpen] = useState(false);
  const shown = open || links.length <= 3 ? links : links.slice(0, 2);
  return (
    <div {...stylex.props(s.shops)}>
      <span {...stylex.props(s.label)}>Hvor kan den købes</span>
      <div {...stylex.props(s.chips)}>
        {shown.map((link, i) => (
          <a
            key={i}
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            {...stylex.props(s.chip)}
          >
            {host(link)} ↗
          </a>
        ))}
        {shown.length < links.length && (
          <button onClick={() => setOpen(true)} {...stylex.props(s.chip, s.moreChip)}>
            +{links.length - shown.length} mere
          </button>
        )}
      </div>
    </div>
  );
}

const MOBILE = "@media (max-width: 480px)";

const s = stylex.create({
  share: { display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 32 },
  shareField: { flex: "1 1 240px", fontSize: 14 },
  list: { listStyle: "none", margin: 0, padding: 0 },
  // Roomy rows: the photo sits beside the name only, so the note and links get
  // the full width, and Claim gets a line of its own at the bottom.
  item: {
    flexDirection: "column",
    alignItems: "stretch",
    gap: 14,
    paddingBlock: 20,
  },
  tag: { top: 14, marginTop: 0 },
  head: { display: "flex", alignItems: "center", gap: 14, minWidth: 0 },
  photo: {
    width: { default: 80, [MOBILE]: 56 },
    height: { default: 80, [MOBILE]: 56 },
    flexShrink: 0,
    objectFit: "cover",
    borderRadius: 8,
    backgroundColor: figure.wash,
  },
  name: {
    flex: 1,
    minWidth: 0,
    fontSize: 17,
    fontWeight: 500,
    lineHeight: 1.35,
    overflowWrap: "break-word",
  },
  noteWrap: { display: "grid", gap: 4, justifyItems: "start" },
  note: {
    margin: 0,
    fontSize: 15,
    lineHeight: 1.6,
    color: color.ink,
    maxWidth: "60ch",
    textWrap: "pretty",
    whiteSpace: "pre-line",
    overflowWrap: "break-word",
  },
  clamp: {
    display: "-webkit-box",
    WebkitLineClamp: 3,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },
  more: {
    padding: 0,
    fontSize: 14,
    fontWeight: 500,
    color: { default: color.ribbon, ":hover": color.ribbonDark },
    backgroundColor: "transparent",
    borderStyle: "none",
    borderRadius: 4,
    cursor: "pointer",
    outline: { default: "none", ":focus-visible": `2px solid ${color.focus}` },
    outlineOffset: 2,
  },
  shops: { display: "grid", gap: 8 },
  label: { fontSize: 13, color: color.soft },
  chips: { display: "flex", flexWrap: "wrap", gap: 6 },
  chip: {
    display: "inline-flex",
    alignItems: "center",
    paddingBlock: 3,
    paddingInline: 11,
    fontSize: 14,
    color: color.ribbon,
    backgroundColor: { default: "transparent", ":hover": "#f7e9eb" },
    borderStyle: "none",
    borderRadius: 999,
    boxShadow: `inset 0 0 0 1px ${color.line}`,
    textDecoration: "none",
    whiteSpace: "nowrap",
    cursor: "pointer",
    outline: { default: "none", ":focus-visible": `2px solid ${color.focus}` },
    outlineOffset: 2,
  },
  moreChip: { color: color.soft },
  foot: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 },
  meta: {
    fontSize: 14,
    color: color.soft,
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  },
  taken: { minWidth: 76, fontSize: 15, color: color.soft, textAlign: "center" },
  footer: { display: "grid", gap: 6, marginTop: 24 },
  status: { display: "flex", alignItems: "center", gap: 12 },
  claimFigure: { width: 64, flexShrink: 0 },
  waiting: { width: 120, marginBottom: 16 },
  missing: { maxWidth: 320, marginBottom: 20 },
});
