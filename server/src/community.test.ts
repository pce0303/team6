import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { communityApi, type CommunityDatabase } from "./community.js";
import { koreaDate, DateSchema } from "@tutorial/shared";

function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(
    readFileSync(
      new URL(
        "../../cloudflare/migrations/0002_community.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  function prepare(sql: string, args: (string | number | null)[] = []) {
    return {
      bind: (...values: (string | number | null)[]) => prepare(sql, values),
      async first<T>() {
        return (sqlite.prepare(sql).get(...args) as T) ?? null;
      },
      async all<T>() {
        return { results: sqlite.prepare(sql).all(...args) as T[] };
      },
      async run() {
        return sqlite.prepare(sql).run(...args);
      },
    };
  }
  const db: CommunityDatabase = {
    prepare,
    async batch(statements) {
      for (const s of statements) await s.run();
    },
  };
  async function call(
    path: string,
    method = "GET",
    body?: unknown,
    token?: string,
  ) {
    const response = await communityApi(
      new Request(`http://localhost/api/community${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      }),
      db,
    );
    return {
      status: response.status,
      body: (await response.json()) as Record<string, any>,
    };
  }
  const signup = async (login: string) => {
    const r = await call("/auth/signup", "POST", {
      login,
      nickname: login,
      password: "test-password-42",
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    return r.body as { token: string; user: { id: string; nickname: string } };
  };
  return { sqlite, call, signup };
}
const postBody = {
  date: "2099-09-23",
  title: "학식 같이 먹어요",
  body: "학생회관 앞에서 만나요",
  activity: "밥",
  time: "12:30",
  place: "학생회관",
};

test("Korean dates and calendar validation", () => {
  assert.equal(koreaDate(new Date("2026-09-22T15:00:00Z")), "2026-09-23");
  assert.equal(koreaDate(new Date("2026-09-22T14:59:59Z")), "2026-09-22");
  assert.equal(DateSchema.safeParse("2026-02-30").success, false);
});

test("real SQL: accounts, date boards, ownership, comments, private messages and logout", async () => {
  const { sqlite, call, signup } = fixture();
  try {
    const a = await signup("alice");
    const b = await signup("bob_");
    const c = await signup("carol");
    assert.equal((await call("/posts", "POST", postBody)).status, 401);
    assert.equal(
      (
        await call("/auth/login", "POST", {
          login: "alice",
          password: "wrong-pass",
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await call("/auth/login", "POST", {
          login: "alice",
          password: "test-password-42",
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await call("/auth/signup", "POST", {
          login: "alice",
          nickname: "다른사람",
          password: "test-password-42",
        })
      ).status,
      409,
    );
    const created = await call("/posts", "POST", postBody, a.token);
    assert.equal(created.status, 201);
    const id = created.body.id;
    assert.equal(created.body.nickname, "alice");
    assert.equal(created.body.login, undefined);
    assert.equal(created.body.password_hash, undefined);
    const day = await call(`/posts?date=${postBody.date}`);
    assert.equal((day.body as unknown as unknown[]).length, 1);
    assert.equal(
      ((await call("/posts?date=2099-09-24")).body as unknown as unknown[])
        .length,
      0,
    );
    assert.equal(
      (
        await call(
          `/posts/${id}`,
          "PATCH",
          { ...postBody, title: "도용" },
          b.token,
        )
      ).status,
      403,
    );
    assert.equal(
      (await call(`/posts/${id}`, "DELETE", undefined, b.token)).status,
      403,
    );
    const comment = await call(
      `/posts/${id}/comments`,
      "POST",
      { body: "저요!" },
      b.token,
    );
    assert.equal(comment.status, 201);
    assert.equal(
      (
        await call(
          `/comments/${comment.body.id}`,
          "PATCH",
          { body: "도용" },
          a.token,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await call(
          `/comments/${comment.body.id}`,
          "PATCH",
          { body: "같이 가요" },
          b.token,
        )
      ).status,
      200,
    );
    assert.equal(
      (await call(`/posts/${id}`)).body.comments[0].body,
      "같이 가요",
    );
    assert.equal(
      (await call("/conversations", "POST", { postId: id }, a.token)).status,
      400,
    );
    const conv = await call("/conversations", "POST", { postId: id }, b.token);
    const cid = conv.body.id;
    assert.equal(
      (await call("/conversations", "POST", { postId: id }, b.token)).body.id,
      cid,
    );
    const payload = { body: "12시에 만날까요?", clientId: crypto.randomUUID() };
    assert.equal(
      (await call(`/conversations/${cid}/messages`, "POST", payload, b.token))
        .status,
      200,
    );
    assert.equal(
      (await call(`/conversations/${cid}/messages`, "POST", payload, b.token))
        .status,
      200,
    );
    assert.equal(
      (await call(`/conversations/${cid}`, "GET", undefined, c.token)).status,
      404,
    );
    assert.equal(
      (
        await call(
          `/conversations/${cid}/messages`,
          "POST",
          { body: "침입", clientId: crypto.randomUUID() },
          c.token,
        )
      ).status,
      404,
    );
    const thread = (
      await call(`/conversations/${cid}`, "GET", undefined, a.token)
    ).body;
    assert.equal(thread.messages.length, 1);
    assert.equal(thread.conversation.unread, 1);
    await call(
      `/conversations/${cid}/read`,
      "POST",
      { through: thread.messages[0].id },
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
      (await call(`/conversations/${cid}`, "GET", undefined, b.token)).body
        .conversation.unread,
      1,
    );
    assert.equal(
      (
        await call(
          `/posts/${id}/status`,
          "PATCH",
          { status: "closed" },
          a.token,
        )
      ).body.status,
      "closed",
    );
    assert.equal(
      (await call(`/posts/${id}/status`, "PATCH", { status: "open" }, a.token))
        .body.status,
      "open",
    );
    await call(`/comments/${comment.body.id}`, "DELETE", undefined, b.token);
    assert.equal((await call(`/posts/${id}`)).body.comments.length, 0);
    await call(`/posts/${id}`, "DELETE", undefined, a.token);
    assert.equal((await call(`/posts/${id}`)).status, 404);
    assert.equal(
      (await call(`/conversations/${cid}`, "GET", undefined, a.token)).body
        .conversation.postTitle,
      "삭제된 모집글",
    );
    const stored = sqlite.prepare("SELECT * FROM community_sessions").all();
    assert(!JSON.stringify(stored).includes(a.token));
    assert.equal(
      (await call("/auth/logout", "POST", undefined, a.token)).status,
      200,
    );
    assert.equal(
      (await call("/auth/me", "GET", undefined, a.token)).status,
      401,
    );
  } finally {
    sqlite.close();
  }
});

test("past boards are read-only, sessions expire, oversized and malformed inputs are rejected", async () => {
  const { sqlite, call, signup } = fixture();
  try {
    const a = await signup("alice");
    assert.equal(
      (
        await call(
          "/posts",
          "POST",
          { ...postBody, date: "2000-01-01" },
          a.token,
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await call(
          "/posts",
          "POST",
          { ...postBody, date: "2099-02-31" },
          a.token,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await call(
          "/posts",
          "POST",
          { ...postBody, body: "a".repeat(40000) },
          a.token,
        )
      ).status,
      413,
    );
    const p = await call("/posts", "POST", postBody, a.token);
    sqlite
      .prepare("UPDATE community_posts SET date=? WHERE id=?")
      .run("2000-01-01", p.body.id);
    assert.equal((await call(`/posts/${p.body.id}`)).status, 200);
    assert.equal(
      (
        await call(
          `/posts/${p.body.id}/comments`,
          "POST",
          { body: "늦은 댓글" },
          a.token,
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await call(
          `/posts/${p.body.id}/status`,
          "PATCH",
          { status: "open" },
          a.token,
        )
      ).status,
      409,
    );
    assert.equal(
      (await call(`/posts/${p.body.id}`, "PATCH", postBody, a.token)).status,
      409,
    );
    sqlite.prepare("UPDATE community_sessions SET expires_at=0").run();
    assert.equal(
      (await call("/auth/me", "GET", undefined, a.token)).status,
      401,
    );
  } finally {
    sqlite.close();
  }
});

test("authentication is rate limited", async () => {
  const { sqlite, call } = fixture();
  try {
    let status = 0;
    for (let i = 0; i < 21; i++)
      status = (
        await call("/auth/login", "POST", {
          login: "noaccount",
          password: "test-password-42",
        })
      ).status;
    assert.equal(status, 429);
  } finally {
    sqlite.close();
  }
});
