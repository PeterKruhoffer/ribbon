import { SignInButton, useAuth } from "@clerk/react";
import * as stylex from "@stylexjs/stylex";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { Page, readError, Ribbon, row, ui } from "../ui/kit.tsx";

// Making a list needs an account, so only you open it as the owner. A
// signed-out visitor sees a sign-in prompt instead of the form.

export const Route = createFileRoute("/new")({ component: NewList });

type Draft = { title: string; quantity: number };
const emptyItem = (): Draft => ({ title: "", quantity: 1 });

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
    const wishes = items.filter((item) => item.title.trim() !== "");
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
                  onChange={(event) => update(index, { quantity: event.target.valueAsNumber || 1 })}
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
  draft: { gap: 8 },
  wish: { flex: 1 },
  quantity: { width: 64, paddingInline: 10, textAlign: "center" },
  add: { paddingTop: 14 },
  submit: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 },
});
