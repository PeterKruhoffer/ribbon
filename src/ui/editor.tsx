import { useAuth } from "@clerk/react";
import * as stylex from "@stylexjs/stylex";
import { type FormEvent, useState } from "react";
import { Option, Schema } from "effect";
import {
  type ListEdit,
  type ListView,
  photoPath,
  unreadableAnswer,
  UploadedPhoto,
} from "../shared/wishlist.ts";
import { readError, Ribbon, row, ui } from "./kit.tsx";
import { color, figure } from "./tokens.stylex.ts";

const decodeUploaded = Schema.decodeUnknownOption(UploadedPhoto);

// The list form, used to make a list on /new and to edit one on its own page.
// A wish loaded from a saved list keeps its id, so saving keeps its claims.

// photo and note are undefined until the owner adds them, so their fields stay hidden.
// photo is a link or, once an upload finishes, the uploaded photo's path.
type Draft = {
  // Stable while wishes above are removed, so a finished upload finds its wish.
  key: string;
  id?: string;
  title: string;
  quantity: number;
  photo?: string;
  uploading?: boolean;
  links: string[];
  note?: string;
};
const emptyItem = (): Draft => ({ key: crypto.randomUUID(), title: "", quantity: 1, links: [] });
const maxLinks = 5;
// The Backend accepts only http(s) links; the browser checks the same before sending.
// Browsers compile pattern with the v flag, which needs "/" escaped inside [].
const urlPattern = "https?://[^\\s\\/?#]+\\S*";
const uploaded = (photo: string) => photo.startsWith(photoPath);

// Phone photos run to several MB. Redrawing one as a 1600 px JPEG keeps it
// small, drops its location and other metadata, and turns HEIC and the like
// into a type every browser shows. createImageBitmap applies EXIF rotation.
const maxSide = 1600;
async function shrink(file: File) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d")!;
  // JPEG has no transparency; white beats the black a PNG's clear parts would get.
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject()), "image/jpeg", 0.85),
  );
}

export const draftsOf = (list: ListView): Draft[] =>
  list.items.map(({ id, title, quantity, photo, links, note }) => ({
    key: id,
    id,
    title,
    quantity,
    photo,
    links: [...links],
    note,
  }));

export function ListEditor({
  initial,
  submit,
  submitting,
  onSubmit,
  onCancel,
}: {
  initial?: { title: string; items: Draft[] };
  submit: string;
  submitting: string;
  // Resolves to an error message, or undefined once the list is saved.
  onSubmit: (list: ListEdit) => Promise<string | undefined>;
  onCancel?: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [items, setItems] = useState<Draft[]>(initial?.items ?? [emptyItem()]);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const { getToken } = useAuth();

  const update = (index: number, change: Partial<Draft>) =>
    setItems((current) => current.map((item, i) => (i === index ? { ...item, ...change } : item)));

  const upload = async (key: string, file: File) => {
    const update = (change: Partial<Draft>) =>
      setItems((current) =>
        current.map((item) => (item.key === key ? { ...item, ...change } : item)),
      );
    update({ uploading: true });
    setError(undefined);
    const body = await shrink(file).catch(() => undefined);
    if (body === undefined) {
      update({ uploading: false });
      return setError("That file isn't a photo this browser can read. Try a JPEG or PNG.");
    }
    const response = await fetch("/api/photos", {
      method: "POST",
      headers: { authorization: `Bearer ${await getToken()}`, "content-type": body.type },
      body,
    }).catch(() => undefined);
    if (!response?.ok) {
      update({ uploading: false });
      return setError(response ? await readError(response) : "Couldn't upload the photo.");
    }
    const uploaded = decodeUploaded(await response.json());
    if (Option.isNone(uploaded)) {
      update({ uploading: false });
      return setError(unreadableAnswer);
    }
    update({ uploading: false, photo: uploaded.value.photo });
  };

  // The owner never sees claims, so any saved wish may have been claimed.
  // Removing it takes the claim with it, so ask first.
  const remove = (index: number) => {
    const item = items[index]!;
    if (
      item.id !== undefined &&
      !confirm(
        `Remove "${item.title}"? Guests may already have claimed it. Their claim goes too, and you won't see whether there was one.`,
      )
    )
      return;
    setItems((current) => current.filter((_, i) => i !== index));
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const wishes = items
      .filter((item) => item.title.trim() !== "")
      .map(({ id, title, quantity, photo, links, note }) => ({
        ...(id === undefined ? {} : { id }),
        title,
        quantity,
        photo: photo?.trim() || undefined,
        links: links.map((link) => link.trim()).filter((link) => link !== ""),
        note: note?.trim() || undefined,
      }));
    if (wishes.length === 0) return setError("Add at least one wish.");
    setError(undefined);
    setSaving(true);
    const failed = await onSubmit({ title, items: wishes });
    setSaving(false);
    setError(failed);
  };

  return (
    <form onSubmit={(event) => void save(event)} {...stylex.props(s.form)}>
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
            <div key={item.key} data-draft-item {...stylex.props(row.base, s.draft)}>
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
                  onChange={(event) => update(index, { quantity: event.target.valueAsNumber || 1 })}
                  {...stylex.props(ui.field, s.quantity)}
                />
                <button
                  type="button"
                  aria-label={`Remove wish ${index + 1}`}
                  disabled={items.length === 1}
                  onClick={() => remove(index)}
                  {...stylex.props(ui.iconButton)}
                >
                  ×
                </button>
              </div>
              {item.photo !== undefined && (
                <div {...stylex.props(s.line)}>
                  {(uploaded(item.photo) || /^https?:\/\/\S/.test(item.photo)) && (
                    <img
                      key={item.photo}
                      src={item.photo}
                      alt=""
                      referrerPolicy="no-referrer"
                      onError={(event) => (event.currentTarget.hidden = true)}
                      {...stylex.props(s.preview)}
                    />
                  )}
                  {uploaded(item.photo) ? (
                    <span {...stylex.props(s.wish, s.uploaded)}>Uploaded photo</span>
                  ) : (
                    <>
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
                      <label {...stylex.props(s.addDetail, s.pick, item.uploading && s.busy)}>
                        {item.uploading ? "Uploading…" : "Upload"}
                        <input
                          type="file"
                          accept="image/*"
                          aria-label={`Upload a photo for wish ${index + 1}`}
                          disabled={item.uploading}
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            event.target.value = "";
                            if (file) void upload(item.key, file);
                          }}
                          {...stylex.props(s.file)}
                        />
                      </label>
                    </>
                  )}
                  <button
                    type="button"
                    aria-label={`Remove photo from wish ${index + 1}`}
                    disabled={item.uploading}
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
        <button
          type="submit"
          disabled={saving || items.some((item) => item.uploading)}
          {...stylex.props(ui.button)}
        >
          {saving ? submitting : submit}
        </button>
        {onCancel && (
          <button
            type="button"
            disabled={saving}
            onClick={onCancel}
            {...stylex.props(ui.button, ui.quiet)}
          >
            Cancel
          </button>
        )}
        {error && (
          <p role="alert" {...stylex.props(ui.error)}>
            {error}
          </p>
        )}
      </div>
    </form>
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
  uploaded: { fontSize: 14, color: color.soft, paddingInline: 4 },
  // The file input stays in the label, which is the visible button, so a click
  // or Enter on it opens the picker.
  file: { position: "absolute", width: 1, height: 1, opacity: 0, overflow: "hidden" },
  pick: { outline: { default: "none", ":has(:focus-visible)": `2px solid ${color.focus}` } },
  busy: { color: color.soft, cursor: "default" },
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
    position: "relative",
    whiteSpace: "nowrap",
  },
  quantity: { width: 64, paddingInline: 10, textAlign: "center" },
  add: { paddingTop: 14 },
  submit: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 },
});
