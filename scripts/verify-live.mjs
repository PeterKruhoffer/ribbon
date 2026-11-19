// Verifies the live wish list against a deployed worker.
// Usage: RIBBON_OWNER_TOKEN=<token> pnpm verify:live <base-url>
// The token is a Clerk session token for any user. Sign in on the site and run
// `await Clerk.session.getToken()` in the browser console. It lasts 60 s, so
// start the script right away; it uses the token in the first seconds.
const base = process.argv[2];
const token = process.env.RIBBON_OWNER_TOKEN;
if (!token) throw new Error("Set RIBBON_OWNER_TOKEN to a Clerk session token");
const asOwner = { authorization: `Bearer ${token}` };
const topic = (id) => `entity:Item:${id}`;
// JSON bodies say so, as the pages' requests do; the Backend refuses others.
const send = (url, init = {}) =>
  fetch(
    url,
    typeof init.body === "string"
      ? { ...init, headers: { "content-type": "application/json", ...init.headers } }
      : init,
  );
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
};

const connect = (url) =>
  new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const events = [];
    socket.addEventListener("message", (m) => events.push(JSON.parse(m.data)));
    socket.addEventListener("open", () =>
      resolve({
        events,
        subscribe: (id, t) => socket.send(JSON.stringify({ op: "subscribe", id, topic: t })),
        unsubscribe: (id) => socket.send(JSON.stringify({ op: "unsubscribe", id })),
        close: () => socket.close(),
      }),
    );
    socket.addEventListener("error", reject);
  });

const claim = (item, guest = "guest-a", headers = {}) =>
  send(`${api}/items/${item}/claim`, { method: "POST", headers, body: JSON.stringify({ guest }) });

// 0. Create a list. Only signed-in users create lists, invalid bodies are
// refused, and unknown lists are 404.
const newList = JSON.stringify({ title: "Anonymous", items: [{ title: "Socks", quantity: 1 }] });
const anonymous = await send(`${base}/api/lists`, { method: "POST", body: newList });
check("create without sign-in is 401", anonymous.status === 401, `status ${anonymous.status}`);
const forged = await send(`${base}/api/lists`, {
  method: "POST",
  headers: { authorization: `Bearer ${token.slice(0, -4)}AAAA` },
  body: newList,
});
check("create with a forged token is 401", forged.status === 401, `status ${forged.status}`);
const bad = await send(`${base}/api/lists`, {
  method: "POST",
  headers: asOwner,
  body: JSON.stringify({ title: "  ", items: [] }),
});
check("invalid list is 400", bad.status === 400, `status ${bad.status}`);
const unknown = await send(`${base}/api/lists/${crypto.randomUUID()}`);
check("unknown list is 404", unknown.status === 404, `status ${unknown.status}`);

// Photos: only signed-in users upload, only images are kept, and anyone reads
// them back. A 1×1 PNG.
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==",
  "base64",
);
const upload = (body, headers = asOwner) =>
  send(`${base}/api/photos`, { method: "POST", headers, body });
const anonymousPhoto = await upload(png, {});
check("upload without sign-in is 401", anonymousPhoto.status === 401);
const svg = await upload("<svg xmlns='http://www.w3.org/2000/svg'/>");
check("non-image upload is 415", svg.status === 415, `status ${svg.status}`);
const uploaded = await upload(png);
check("upload is 201", uploaded.status === 201, `status ${uploaded.status}`);
const { photo } = await uploaded.json();
const served = await send(`${base}${photo}`);
check(
  "photo reads back signed out, as PNG, byte for byte",
  served.status === 200 &&
    served.headers.get("content-type") === "image/png" &&
    Buffer.from(await served.arrayBuffer()).equals(png),
  `status ${served.status}, ${served.headers.get("content-type")}`,
);

const created = await send(`${base}/api/lists`, {
  method: "POST",
  headers: asOwner,
  body: JSON.stringify({
    title: " Verify list ",
    items: [
      { title: "LEGO Botanical bonsai tree", quantity: 1, photo },
      { title: "Wingspan board game", quantity: 1 },
      { title: "Wool socks", quantity: 5 },
    ],
  }),
});
check("create is 201", created.status === 201, `status ${created.status}`);
const { listId: list } = await created.json();
const api = `${base}/api/lists/${list}`;
const ws = (query = "") => `${base.replace(/^http/, "ws")}/api/lists/${list}/live${query}`;
const initial = await (await send(api)).json();
check(
  "new list has its title and items in order",
  initial.title === "Verify list" &&
    initial.role === "guest" &&
    initial.items[0].photo === photo &&
    initial.items.map((i) => `${i.title}:${i.quantity}:${i.remaining}`).join("|") ===
      "LEGO Botanical bonsai tree:1:1|Wingspan board game:1:1|Wool socks:5:5",
  JSON.stringify(initial),
);
const [lego, wingspan, socks] = initial.items.map((i) => i.id);
const guestB = await connect(ws());
const owner = await connect(ws(`?token=${encodeURIComponent(token)}`));
for (const c of [guestB, owner]) {
  c.subscribe("s-socks", topic(socks));
  c.subscribe("s-lego", topic(lego));
}
await sleep(500);

// 1. A guest's claim reaches other guests but not the owner.
const first = await claim(socks);
await sleep(1500);
check("claim succeeds", first.status === 200, `status ${first.status}`);
check(
  "guest B gets the socks event",
  guestB.events.length === 1 &&
    guestB.events[0].subscriptionId === "s-socks" &&
    guestB.events[0].topic === topic(socks),
  JSON.stringify(guestB.events),
);
check(
  "event carries no claim data",
  JSON.stringify(guestB.events[0]?.data) === JSON.stringify({ id: socks, changed: ["remaining"] }),
);
check("owner gets nothing", owner.events.length === 0, `${owner.events.length} events`);

// 2. Ten guests race for the last LEGO set; exactly one wins.
const statuses = (
  await Promise.all(Array.from({ length: 10 }, (_, i) => claim(lego, `racer-${i}`)))
).map((r) => r.status);
await sleep(1500);
check(
  "one claim wins the race",
  statuses.filter((s) => s === 200).length === 1,
  statuses.join(","),
);
check("nine get 409", statuses.filter((s) => s === 409).length === 9);
check(
  "guest B gets exactly one lego event",
  guestB.events.filter((e) => e.subscriptionId === "s-lego").length === 1,
);
const guestView = await (await send(api)).json();
check("lego shows 0 left", guestView.items.find((i) => i.id === lego).remaining === 0);
const ownerView = await (await send(api, { headers: asOwner })).json();
check(
  "owner view has no remaining counts",
  ownerView.role === "owner" && ownerView.items.every((i) => !("remaining" in i)),
);
const oldLink = await (await send(`${api}?as=owner`)).json();
check("?as=owner without a token is a guest", oldLink.role === "guest");

// 3. The owner cannot claim.
check("owner claim is refused", (await claim(socks, "owner", asOwner)).status === 403);

// 4. Claiming a missing item is a 404, also on a list that doesn't exist.
const fresh = `${base}/api/lists/${crypto.randomUUID()}/items/missing/claim`;
const missing = await send(fresh, { method: "POST", body: JSON.stringify({ guest: "g" }) });
check("missing item on an unknown list is 404", missing.status === 404, `status ${missing.status}`);
check("missing item is 404", (await claim("missing")).status === 404);

// 5. Unsubscribed topics stop receiving events.
guestB.unsubscribe("s-socks");
await sleep(500);
const before = guestB.events.length;
await claim(socks);
await sleep(1500);
check("no event after unsubscribe", guestB.events.length === before);

// 6. The owner edits the list: claims stay on kept wishes, guests get one list
// event, and the owner's socket gets nothing. Signed-out visitors cannot edit.
for (const c of [guestB, owner]) c.subscribe("s-list", `entity:List:${list}`);
await sleep(500);
const edit = (body, headers = asOwner) =>
  send(api, { method: "PUT", headers, body: JSON.stringify(body) });
const kept = {
  title: "Verify list, edited",
  items: [
    { id: lego, title: "LEGO Botanical bonsai tree", quantity: 1 },
    { id: wingspan, title: "Wingspan board game", quantity: 1 },
    { id: socks, title: "Merino socks", quantity: 6, note: "Size 43", photo },
  ],
};
check("signed-out edit is 401", (await edit(kept, {})).status === 401);
check(
  "edit with an unknown wish id is 409",
  (await edit({ ...kept, items: [{ id: "missing", title: "x", quantity: 1 }] })).status === 409,
);
const edited = await edit(kept);
await sleep(1500);
check("owner edit is 204", edited.status === 204, `status ${edited.status}`);
const afterEdit = await (await send(api)).json();
const editedSocks = afterEdit.items.find((i) => i.id === socks);
check(
  "edit keeps claims and takes an uploaded photo",
  afterEdit.title === "Verify list, edited" &&
    editedSocks.title === "Merino socks" &&
    editedSocks.photo === photo &&
    editedSocks.remaining === 4,
  JSON.stringify(editedSocks),
);
check(
  "guest B gets the list event",
  guestB.events.filter((e) => e.subscriptionId === "s-list").length === 1,
);
check(
  "owner gets nothing for the edit",
  owner.events.length === 0,
  `${owner.events.length} events`,
);

// 7. Subscriptions survive the object going idle (hibernation after ~10 s).
const idle = await connect(ws());
idle.subscribe("s-wingspan", topic(wingspan));
await sleep(20000);
await claim(wingspan);
await sleep(1500);
check("event delivered after 20 s idle", idle.events.length === 1, `${idle.events.length} events`);

for (const c of [guestB, owner, idle]) c.close();
console.log(failures ? `${failures} failed` : "all passed");
process.exit(failures ? 1 : 0);
