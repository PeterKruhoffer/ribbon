import * as stylex from "@stylexjs/stylex";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { ClaimedGift, GiftTable, ShareLink, SpoilerTable, WishCard } from "../ui/figures.tsx";
import { Page, readError, Ribbon, row, ui } from "../ui/kit.tsx";
import { color, font } from "../ui/tokens.stylex.ts";

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
      <GiftTable style={s.hero} />
      <h1 {...stylex.props(ui.title)}>Make a wish list</h1>
      <p {...stylex.props(ui.sub)}>
        Share the link, and guests claim gifts so nobody buys the same one twice. You never see who
        claimed what.
      </p>
      <a href="#make" {...stylex.props(ui.button, s.cta)}>
        Make a wish list
      </a>

      <section aria-labelledby="how" {...stylex.props(s.section)}>
        <h2 id="how" {...stylex.props(s.heading)}>
          How Ribbon works
        </h2>
        <ol {...stylex.props(s.steps)}>
          <li {...stylex.props(s.step)}>
            <WishCard style={s.stepFigure} />
            <p {...stylex.props(s.stepText)}>
              Write the wishes
              <span {...stylex.props(ui.small)}>Socks, a board game, anything.</span>
            </p>
          </li>
          <li {...stylex.props(s.step)}>
            <ShareLink style={s.stepFigure} />
            <p {...stylex.props(s.stepText)}>
              Share the link
              <span {...stylex.props(ui.small)}>One link for every guest.</span>
            </p>
          </li>
          <li {...stylex.props(s.step)}>
            <ClaimedGift style={s.stepFigure} />
            <p {...stylex.props(s.stepText)}>
              Guests claim
              <span {...stylex.props(ui.small)}>Every guest sees it live.</span>
            </p>
          </li>
        </ol>
      </section>

      <section aria-labelledby="spoilers" {...stylex.props(s.section)}>
        <h2 id="spoilers" {...stylex.props(s.heading)}>
          Your surprise stays a surprise
        </h2>
        <p {...stylex.props(ui.sub)}>
          Guests see which gifts are taken. You see the same list with no bows, ever.
        </p>
        <div {...stylex.props(s.pair)}>
          <figure {...stylex.props(s.view)}>
            <SpoilerTable guest={false} />
            <figcaption {...stylex.props(s.stepText)}>
              Your view
              <span {...stylex.props(ui.small)}>Wishes, no claims</span>
            </figcaption>
          </figure>
          <figure {...stylex.props(s.view)}>
            <SpoilerTable guest />
            <figcaption {...stylex.props(s.stepText)}>
              Guest view
              <span {...stylex.props(ui.small)}>A bow on every claimed gift</span>
            </figcaption>
          </figure>
        </div>
      </section>

      <section id="make" aria-labelledby="make-title" {...stylex.props(s.section, s.make)}>
        <h2 id="make-title" {...stylex.props(s.heading)}>
          Make a wish list
        </h2>
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
      </section>
    </Page>
  );
}

const MOBILE = "@media (max-width: 480px)";

const s = stylex.create({
  hero: { maxWidth: 400, marginBottom: 20 },
  cta: { display: "inline-block", textDecoration: "none" },
  section: {
    marginTop: 56,
    paddingTop: 40,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: color.line,
  },
  make: { scrollMarginTop: 24 },
  heading: {
    margin: "0 0 8px",
    fontFamily: font.title,
    fontSize: { default: 28, [MOBILE]: 24 },
    fontWeight: 500,
    lineHeight: 1.1,
    letterSpacing: "-0.01em",
    textWrap: "balance",
  },
  steps: {
    listStyle: "none",
    margin: "20px 0 0",
    padding: 0,
    display: "grid",
    gridTemplateColumns: { default: "repeat(3, minmax(0, 1fr))", [MOBILE]: "1fr" },
    gap: { default: 16, [MOBILE]: 12 },
  },
  step: {
    display: { default: "grid", [MOBILE]: "flex" },
    alignItems: { default: "start", [MOBILE]: "center" },
    alignContent: "start",
    gap: { default: 10, [MOBILE]: 16 },
  },
  stepFigure: {
    height: { default: 104, [MOBILE]: 76 },
    width: { default: "100%", [MOBILE]: 104 },
    flexShrink: 0,
  },
  stepText: { display: "grid", gap: 2, margin: 0, fontWeight: 600, fontSize: 15 },
  pair: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: { default: 20, [MOBILE]: 12 } },
  view: { display: "grid", alignContent: "start", gap: 10, margin: 0, minWidth: 0 },
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
