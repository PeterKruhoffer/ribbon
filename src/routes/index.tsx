import * as stylex from "@stylexjs/stylex";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { Page, readError, Ribbon, row, ui } from "../ui/kit.tsx";

export const Route = createFileRoute("/")({ component: Home });

type Draft = { title: string; quantity: number };
const emptyItem = (): Draft => ({ title: "", quantity: 1 });

function Home() {
  const navigate = useNavigate();
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
      body: JSON.stringify({ title, items: wishes }),
    });
    setSaving(false);
    if (!response.ok) return setError(await readError(response));
    const { listId } = (await response.json()) as { listId: string };
    // ?as=owner stands in for real sign-in until owners have accounts.
    await navigate({ to: "/lists/$listId", params: { listId }, search: { as: "owner" } });
  };

  return (
    <Page>
      <h1 {...stylex.props(ui.title)}>Make a wish list</h1>
      <p {...stylex.props(ui.sub)}>
        Share the link, and guests claim gifts so nobody buys the same one twice. You never see who
        claimed what.
      </p>
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
