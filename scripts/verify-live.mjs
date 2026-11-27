// Verifies the live wish list against a deployed worker.
// Usage: RIBBON_OWNER_TOKEN=<token> pnpm verify:live <base-url>
// The token is a Clerk session token for any user. Sign in on the site and run
// `await Clerk.session.getToken()` in the browser console. It lasts 60 s, so
// start the script right away; its last use, deleting the list it made, comes
// about 40 s in. Each run takes 2 of the user's 20 daily list creations (the
// invalid list counts) and 3 of 200 uploads, and about 15 writes as the owner
// and 24 from its IP, under the 60 a minute write limit.
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

const claim = (item, guest = "guest-a", headers = {}, method = "POST") =>
  send(`${api}/items/${item}/claim`, { method, headers, body: JSON.stringify({ guest }) });
const unclaim = (item, guest = "guest-a", headers = {}) => claim(item, guest, headers, "DELETE");

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

// 3. The owner cannot claim, or undo a claim.
check("owner claim is refused", (await claim(socks, "owner", asOwner)).status === 403);
const racer = `racer-${statuses.indexOf(200)}`;
check("owner undo is refused", (await unclaim(lego, racer, asOwner)).status === 403);
const ownerWithGuest = await (
  await send(api, { headers: { ...asOwner, "x-ribbon-guest": racer } })
).json();
check(
  "owner view has no claims, even with a guest token",
  ownerWithGuest.items.every((i) => !("remaining" in i) && !("mine" in i)),
);

// 3b. A guest undoes their own claim, and only their own. Other guests get the
// event; the owner does not.
const mine = await (await send(api, { headers: { "x-ribbon-guest": racer } })).json();
check(
  "guest view counts the guest's own claims",
  mine.items.find((i) => i.id === lego).mine === 1 &&
    mine.items.find((i) => i.id === socks).mine === 0,
  JSON.stringify(mine.items.map((i) => i.mine)),
);
const legoEvents = () => guestB.events.filter((e) => e.subscriptionId === "s-lego").length;
check("another guest cannot undo it", (await unclaim(lego, "guest-a")).status === 404);
const undone = await unclaim(lego, racer);
await sleep(1500);
check("guest undoes their claim", undone.status === 200, `status ${undone.status}`);
const afterUndo = await (await send(api)).json();
check("lego is free again", afterUndo.items.find((i) => i.id === lego).remaining === 1);
check("guest B gets the undo event", legoEvents() === 2, `${legoEvents()} lego events`);
check("undoing twice is 404", (await unclaim(lego, racer)).status === 404);
check("undo on a missing item is 404", (await unclaim("missing", racer)).status === 404);
check("lego can be claimed again", (await claim(lego, racer)).status === 200);

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
check("a photo moved to another wish stays", (await send(`${base}${photo}`)).status === 200);

// 6b. A photo an edit replaces is deleted.
const { photo: replaced } = await (await upload(png)).json();
const withPhoto = (wingspanPhoto) => ({
  ...kept,
  items: kept.items.map((i) => (i.id === wingspan ? { ...i, photo: wingspanPhoto } : i)),
});
const addedStatus = (await edit(withPhoto(replaced))).status;
check(
  "edit takes a second uploaded photo",
  addedStatus === 204 && (await send(`${base}${replaced}`)).status === 200,
  `status ${addedStatus}`,
);
const replacedStatus = (await edit(withPhoto("https://example.com/wingspan.jpg"))).status;
check(
  "a replaced photo is deleted",
  replacedStatus === 204 && (await send(`${base}${replaced}`)).status === 404,
  `status ${replacedStatus}`,
);

// 7. Subscriptions survive the object going idle (hibernation after ~10 s).
const idle = await connect(ws());
idle.subscribe("s-wingspan", topic(wingspan));
await sleep(20000);
await claim(wingspan);
await sleep(1500);
check("event delivered after 20 s idle", idle.events.length === 1, `${idle.events.length} events`);

// 8. The owner deletes the list, which also deletes its photos. Guests get one
// list event so their pages find the list gone. Deleting it keeps each CI
// run from leaving a list behind.
const remove = (headers = asOwner) => send(api, { method: "DELETE", headers });
check("signed-out delete is 401", (await remove({})).status === 401);
const listEvents = () => guestB.events.filter((e) => e.subscriptionId === "s-list").length;
const listEventsBefore = listEvents();
const deleted = await remove();
await sleep(1500);
check("owner delete is 204", deleted.status === 204, `status ${deleted.status}`);
check("deleted list is 404", (await send(api)).status === 404);
check("deleted list's photo is 404", (await send(`${base}${photo}`)).status === 404);
check("guest B gets the delete event", listEvents() === listEventsBefore + 1);
check("owner gets nothing at all", owner.events.length === 0, `${owner.events.length} events`);
check("deleting again is 404", (await remove()).status === 404);

for (const c of [guestB, owner, idle]) c.close();
console.log(failures ? `${failures} failed` : "all passed");
process.exit(failures ? 1 : 0);
