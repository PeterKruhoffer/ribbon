import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";

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
    if (!response.ok) return setError(await response.text());
    const { listId } = (await response.json()) as { listId: string };
    // ?as=owner stands in for real sign-in until owners have accounts.
    await navigate({ to: "/lists/$listId", params: { listId }, search: { as: "owner" } });
  };

  return (
    <main style={{ padding: 24, maxWidth: 520 }}>
      <h1>Ribbon 🎀</h1>
      <p style={{ color: "#666" }}>Make a wish list, share the link, and let guests claim gifts.</p>
      <form onSubmit={(event) => void create(event)} style={{ display: "grid", gap: 12 }}>
        <label style={{ display: "grid", gap: 4 }}>
          List name
          <input
            name="title"
            required
            maxLength={100}
            value={title}
            placeholder="Peter's birthday"
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <fieldset style={{ display: "grid", gap: 8 }}>
          <legend>Wishes</legend>
          {items.map((item, index) => (
            <div key={index} style={{ display: "flex", gap: 8 }} data-draft-item>
              <input
                aria-label={`Wish ${index + 1}`}
                maxLength={200}
                value={item.title}
                placeholder="Wool socks"
                style={{ flex: 1 }}
                onChange={(event) => update(index, { title: event.target.value })}
              />
              <input
                aria-label={`How many of wish ${index + 1}`}
                type="number"
                min={1}
                max={99}
                value={item.quantity}
                style={{ width: 56 }}
                onChange={(event) => update(index, { quantity: event.target.valueAsNumber || 1 })}
              />
              <button
                type="button"
                aria-label={`Remove wish ${index + 1}`}
                disabled={items.length === 1}
                onClick={() => setItems((current) => current.filter((_, i) => i !== index))}
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            disabled={items.length >= 50}
            onClick={() => setItems((current) => [...current, emptyItem()])}
            style={{ justifySelf: "start" }}
          >
            Add a wish
          </button>
        </fieldset>
        <button type="submit" disabled={saving} style={{ justifySelf: "start" }}>
          {saving ? "Creating…" : "Create list"}
        </button>
        {error && <p style={{ color: "#b00020", margin: 0 }}>{error}</p>}
      </form>
    </main>
  );
}
