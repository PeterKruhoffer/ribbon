// Verifies the live wish list spike against a deployed worker.
// Usage: pnpm verify:live <base-url>
const base = process.argv[2];
const list = `verify-${Date.now().toString(36)}`;
const api = `${base}/api/lists/${list}`;
const ws = (query = "") => `${base.replace(/^http/, "ws")}/api/lists/${list}/live${query}`;
const topic = (id) => `entity:Item:${id}`;
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

const claim = (item, guest = "guest-a", query = "") =>
  fetch(`${api}/items/${item}/claim${query}`, { method: "POST", body: JSON.stringify({ guest }) });

await fetch(api); // create the list
const guestB = await connect(ws());
const owner = await connect(ws("?as=owner"));
for (const c of [guestB, owner]) {
  c.subscribe("s-socks", topic("socks"));
  c.subscribe("s-lego", topic("lego"));
}
await sleep(500);

// 1. A guest's claim reaches other guests but not the owner.
const first = await claim("socks");
await sleep(1500);
check("claim succeeds", first.status === 200, `status ${first.status}`);
check(
  "guest B gets the socks event",
  guestB.events.length === 1 &&
    guestB.events[0].subscriptionId === "s-socks" &&
    guestB.events[0].topic === topic("socks"),
  JSON.stringify(guestB.events),
);
check(
  "event carries no claim data",
  JSON.stringify(guestB.events[0]?.data) === '{"id":"socks","changed":["remaining"]}',
);
check("owner gets nothing", owner.events.length === 0, `${owner.events.length} events`);

// 2. Ten guests race for the last LEGO set; exactly one wins.
const statuses = (
  await Promise.all(Array.from({ length: 10 }, (_, i) => claim("lego", `racer-${i}`)))
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
const guestView = await (await fetch(api)).json();
check("lego shows 0 left", guestView.items.find((i) => i.id === "lego").remaining === 0);
const ownerView = await (await fetch(`${api}?as=owner`)).json();
check(
  "owner view has no remaining counts",
  ownerView.items.every((i) => !("remaining" in i)),
);

// 3. The owner cannot claim.
check("owner claim is refused", (await claim("socks", "owner", "?as=owner")).status === 403);

// 4. Claiming a missing item is a 404, also as a new list's first request.
const fresh = `${base}/api/lists/${list}-fresh/items/missing/claim`;
const missing = await fetch(fresh, { method: "POST", body: JSON.stringify({ guest: "g" }) });
check("missing item on a new list is 404", missing.status === 404, `status ${missing.status}`);
check("missing item is 404", (await claim("missing")).status === 404);

// 5. Unsubscribed topics stop receiving events.
guestB.unsubscribe("s-socks");
await sleep(500);
const before = guestB.events.length;
await claim("socks");
await sleep(1500);
check("no event after unsubscribe", guestB.events.length === before);

// 6. Subscriptions survive the object going idle (hibernation after ~10 s).
const idle = await connect(ws());
idle.subscribe("s-wingspan", topic("wingspan"));
await sleep(20000);
await claim("wingspan");
await sleep(1500);
check("event delivered after 20 s idle", idle.events.length === 1, `${idle.events.length} events`);

for (const c of [guestB, owner, idle]) c.close();
console.log(failures ? `${failures} failed` : "all passed");
process.exit(failures ? 1 : 0);
