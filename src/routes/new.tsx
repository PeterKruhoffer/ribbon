import { SignInButton, useAuth } from "@clerk/react";
import * as stylex from "@stylexjs/stylex";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { Page, readError, Ribbon, row, ui } from "../ui/kit.tsx";
import { color, figure } from "../ui/tokens.stylex.ts";

// Making a list needs an account, so only you open it as the owner. A
// signed-out visitor sees a sign-in prompt instead of the form.

export const Route = createFileRoute("/new")({ component: NewList });

// photo and note are undefined until the owner adds them, so their fields stay hidden.
type Draft = { title: string; quantity: number; photo?: string; links: string[]; note?: string };
const emptyItem = (): Draft => ({ title: "", quantity: 1, links: [] });
const maxLinks = 5;
// The Backend accepts only http(s) links; the browser checks the same before sending.
// Browsers compile pattern with the v flag, which needs "/" escaped inside [].
const urlPattern = "https?://[^\\s\\/?#]+\\S*";

function NewList() {
  const navigate = useNavigate();
  const { isSignedIn, getToken } = useAuth();
  const [title, setTitle] = useState("");
  const [items, setItems] = useState<Draft[]>([emptyItem()]);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const update = (index: number, change: Partial<Draft>) =>
    setItems((current) => current.map((item, i) => (i === index ? { ...item, ...change } : item)));

  const create = async (event: FormEvent) => {
    event.preventDefault();
    const wishes = items
      .filter((item) => item.title.trim() !== "")
      .map(({ title, quantity, photo, links, note }) => ({
        title,
        quantity,
        photo: photo?.trim() || undefined,
        links: links.map((link) => link.trim()).filter((link) => link !== ""),
        note: note?.trim() || undefined,
      }));
    if (wishes.length === 0) return setError("Add at least one wish.");
    setError(undefined);
    setSaving(true);
    const response = await fetch("/api/lists", {
      method: "POST",
      headers: { authorization: `Bearer ${await getToken()}` },
      body: JSON.stringify({ title, items: wishes }),
    });
    setSaving(false);
    if (!response.ok) return setError(await readError(response));
    const { listId } = (await response.json()) as { listId: string };
    await navigate({ to: "/lists/$listId", params: { listId } });
  };

  if (isSignedIn === undefined) return <Page>{null}</Page>;

  if (!isSignedIn)
    return (
      <Page>
        <h1 {...stylex.props(ui.title)}>Make a wish list</h1>
        <p {...stylex.props(ui.sub)}>
          Sign in to make a list, so only you open it as the owner. Guests need no account.
        </p>
        <SignInButton mode="modal">
          <button type="button" {...stylex.props(ui.button)}>
            Sign in
          </button>
        </SignInButton>
      </Page>
    );

  return (
    <Page>
      <h1 {...stylex.props(ui.title)}>Make a wish list</h1>
      <p {...stylex.props(ui.sub)}>Name the list, add the wishes, and share the link.</p>
      <form onSubmit={(event) => void create(event)} {...stylex.props(s.form)}>
        <label {...stylex.props(s.label)}>
          List name
          <input
            name="title"
            required
            maxLength={100}
            value={title}
            placeholder="Peter's birthday"
            onChange={(event) => setTitle(event.target.value)}
            {...stylex.props(ui.field)}
          />
        </label>
        <fieldset {...stylex.props(s.fieldset)}>
          <legend {...stylex.props(s.legend)}>Wishes</legend>
          <Ribbon>
            {items.map((item, index) => (
              <div key={index} data-draft-item {...stylex.props(row.base, s.draft)}>
                <div {...stylex.props(s.line)}>
                  <input
                    aria-label={`Wish ${index + 1}`}
                    maxLength={200}
                    value={item.title}
                    placeholder="Wool socks"
                    onChange={(event) => update(index, { title: event.target.value })}
                    {...stylex.props(ui.field, s.wish)}
                  />
                  <input
                    aria-label={`How many of wish ${index + 1}`}
                    type="number"
                    min={1}
                    max={99}
                    value={item.quantity}
                    onChange={(event) =>
                      update(index, { quantity: event.target.valueAsNumber || 1 })
                    }
                    {...stylex.props(ui.field, s.quantity)}
                  />
                  <button
                    type="button"
                    aria-label={`Remove wish ${index + 1}`}
                    disabled={items.length === 1}
                    onClick={() => setItems((current) => current.filter((_, i) => i !== index))}
                    {...stylex.props(ui.iconButton)}
                  >
                    ×
                  </button>
                </div>
                {item.photo !== undefined && (
                  <div {...stylex.props(s.line)}>
                    {/^https?:\/\/\S/.test(item.photo) && (
                      <img
                        key={item.photo}
                        src={item.photo}
                        alt=""
                        referrerPolicy="no-referrer"
                        onError={(event) => (event.currentTarget.hidden = true)}
                        {...stylex.props(s.preview)}
                      />
                    )}
                    <input
                      type="url"
                      pattern={urlPattern}
                      aria-label={`Photo link for wish ${index + 1}`}
                      maxLength={2000}
                      value={item.photo}
                      placeholder="Photo link, https://…"
                      onChange={(event) => update(index, { photo: event.target.value })}
                      {...stylex.props(ui.field, s.wish, s.detail)}
                    />
                    <button
                      type="button"
                      aria-label={`Remove photo from wish ${index + 1}`}
                      onClick={() => update(index, { photo: undefined })}
                      {...stylex.props(ui.iconButton)}
                    >
                      ×
                    </button>
                  </div>
                )}
                {item.links.map((link, j) => (
                  <div key={j} {...stylex.props(s.line)}>
                    <input
                      type="url"
                      pattern={urlPattern}
                      aria-label={`Link ${j + 1} for wish ${index + 1}`}
                      maxLength={2000}
                      value={link}
                      placeholder="Shop link, https://…"
                      onChange={(event) =>
                        update(index, {
                          links: item.links.map((l, k) => (k === j ? event.target.value : l)),
                        })
                      }
                      {...stylex.props(ui.field, s.wish, s.detail)}
                    />
                    <button
                      type="button"
                      aria-label={`Remove link ${j + 1} from wish ${index + 1}`}
                      onClick={() => update(index, { links: item.links.filter((_, k) => k !== j) })}
                      {...stylex.props(ui.iconButton)}
                    >
                      ×
                    </button>
                  </div>
                ))}
                {item.note !== undefined && (
                  <textarea
                    aria-label={`Note for wish ${index + 1}`}
                    maxLength={500}
                    rows={3}
                    value={item.note}
                    placeholder="Size, colour, anything guests should know"
                    onChange={(event) => update(index, { note: event.target.value })}
                    {...stylex.props(ui.field, s.note)}
                  />
                )}
                <div {...stylex.props(s.adds)}>
                  {item.photo === undefined && (
                    <button
                      type="button"
                      onClick={() => update(index, { photo: "" })}
                      {...stylex.props(s.addDetail)}
                    >
                      + Photo
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={item.links.length >= maxLinks}
                    onClick={() => update(index, { links: [...item.links, ""] })}
                    {...stylex.props(s.addDetail)}
                  >
                    + Link
                  </button>
                  {item.note === undefined && (
                    <button
                      type="button"
                      onClick={() => update(index, { note: "" })}
                      {...stylex.props(s.addDetail)}
                    >
                      + Note
                    </button>
                  )}
                </div>
              </div>
            ))}
            <div {...stylex.props(s.add)}>
              <button
                type="button"
                disabled={items.length >= 50}
                onClick={() => setItems((current) => [...current, emptyItem()])}
                {...stylex.props(ui.button, ui.quiet)}
              >
                Add a wish
              </button>
            </div>
          </Ribbon>
        </fieldset>
        <div {...stylex.props(s.submit)}>
          <button type="submit" disabled={saving} {...stylex.props(ui.button)}>
            {saving ? "Creating…" : "Create list"}
          </button>
          {error && (
            <p role="alert" {...stylex.props(ui.error)}>
              {error}
            </p>
          )}
        </div>
      </form>
    </Page>
  );
}

const s = stylex.create({
  form: { display: "grid", gap: 28 },
  label: { display: "grid", gap: 6, fontSize: 15, fontWeight: 600 },
  fieldset: { margin: 0, padding: 0, borderStyle: "none", minWidth: 0 },
  legend: { padding: 0, marginBottom: 18, fontSize: 15, fontWeight: 600 },
  draft: { flexDirection: "column", alignItems: "stretch", gap: 8, paddingBlock: 12 },
  line: { display: "flex", alignItems: "center", gap: 8 },
  wish: { flex: 1 },
  detail: { fontSize: 14 },
  preview: {
    width: 40,
    height: 40,
    flexShrink: 0,
    objectFit: "cover",
    borderRadius: 8,
    backgroundColor: figure.wash,
  },
  note: { fontSize: 14, borderRadius: 14, resize: "vertical", lineHeight: 1.45 },
  adds: { display: "flex", flexWrap: "wrap", gap: 4, marginLeft: -8 },
  addDetail: {
    paddingBlock: 4,
    paddingInline: 8,
    fontSize: 14,
    color: { default: color.ribbon, ":disabled": color.soft },
    backgroundColor: { default: "transparent", ":hover": "#f7e9eb", ":disabled": "transparent" },
    borderStyle: "none",
    borderRadius: 999,
    cursor: { default: "pointer", ":disabled": "default" },
    outline: { default: "none", ":focus-visible": `2px solid ${color.focus}` },
  },
  quantity: { width: 64, paddingInline: 10, textAlign: "center" },
  add: { paddingTop: 14 },
  submit: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 },
});
