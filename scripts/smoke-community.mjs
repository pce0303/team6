import assert from "node:assert/strict";
const origin = process.env.COMMUNITY_ORIGIN ?? "http://127.0.0.1:8787";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin))
  throw new Error("Community smoke is local-only");
const suffix = crypto.randomUUID().slice(0, 8);
async function call(path, method = "GET", body, token) {
  const response = await fetch(`${origin}/api/community${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: await response.json() };
}
async function account(name) {
  const r = await call("/auth/signup", "POST", {
    login: `qa_${name}_${suffix}`,
    nickname: `검증 ${name}`,
    password: `local-${suffix}-password`,
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body;
}
const a = await account("a"),
  b = await account("b"),
  c = await account("c");
const created = await call(
  "/posts",
  "POST",
  {
    date: "2099-09-23",
    title: `로컬 검증 ${suffix}`,
    body: "실제 Workers와 D1 검증",
    activity: "밥",
    time: "12:00",
    place: "학생회관",
  },
  a.token,
);
assert.equal(created.status, 201, JSON.stringify(created.body));
const id = created.body.id;
assert((await call("/posts?date=2099-09-23")).body.some((p) => p.id === id));
assert(!(await call("/posts?date=2099-09-24")).body.some((p) => p.id === id));
assert.equal(
  (await call(`/posts/${id}`, "DELETE", undefined, b.token)).status,
  403,
);
const comment = await call(
  `/posts/${id}/comments`,
  "POST",
  { body: "함께 가요" },
  b.token,
);
assert.equal(comment.status, 201);
const conversation = await call(
  "/conversations",
  "POST",
  { postId: id },
  b.token,
);
assert.equal(conversation.status, 200);
const cid = conversation.body.id;
assert.equal(
  (await call("/conversations", "POST", { postId: id }, b.token)).body.id,
  cid,
);
const message = { body: "12시에 만나요", clientId: crypto.randomUUID() };
await call(`/conversations/${cid}/messages`, "POST", message, b.token);
await call(`/conversations/${cid}/messages`, "POST", message, b.token);
assert.equal(
  (await call(`/conversations/${cid}`, "GET", undefined, c.token)).status,
  404,
);
const thread = await call(`/conversations/${cid}`, "GET", undefined, a.token);
assert.equal(thread.body.messages.length, 1);
assert.equal(thread.body.conversation.unread, 1);
await call(
  `/conversations/${cid}/read`,
  "POST",
  { through: thread.body.messages[0].id },
  a.token,
);
assert.equal(
  (await call(`/conversations/${cid}`, "GET", undefined, a.token)).body
    .conversation.unread,
  0,
);
await call(
  `/conversations/${cid}/messages`,
  "POST",
  { body: "좋아요!", clientId: crypto.randomUUID() },
  a.token,
);
assert.equal(
  (await call(`/conversations/${cid}`, "GET", undefined, b.token)).body.messages
    .length,
  2,
);
assert.equal(
  (await call(`/posts/${id}/status`, "PATCH", { status: "closed" }, a.token))
    .body.status,
  "closed",
);
await call(`/posts/${id}`, "DELETE", undefined, a.token);
for (const session of [a, b, c])
  await call("/auth/logout", "POST", undefined, session.token);
console.log(
  "PASS: real local Workers + D1 — signup, date board, comments, private conversations, duplicate prevention, read state, reply, close and logout",
);
