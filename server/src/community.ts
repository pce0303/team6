import { hash, compare } from "bcryptjs";
import { z } from "zod";
import {
  DateSchema,
  LoginSchema,
  SignupSchema,
  PostInputSchema,
  TextSchema,
  MessageInputSchema,
  StatusSchema,
  StartConversationSchema,
  ReadSchema,
  koreaDate,
} from "@tutorial/shared";

type Statement = {
  bind(...args: (string | number | null)[]): Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
};
export interface CommunityDatabase {
  prepare(sql: string): Statement;
  batch(statements: Statement[]): Promise<unknown>;
}
class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const fail = (status: number, message: string): never => {
  throw new ApiError(status, message);
};
const json = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
async function digest(token: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
const postSelect = `SELECT p.id,p.author_id AS authorId,p.date,p.title,p.body,p.activity,p.time,p.place,p.status,p.created_at AS createdAt,u.nickname,(SELECT COUNT(*) FROM community_comments WHERE post_id=p.id) AS commentCount FROM community_posts p JOIN community_users u ON u.id=p.author_id`;
const commentSelect = `SELECT c.id,c.author_id AS authorId,c.body,c.created_at AS createdAt,u.nickname FROM community_comments c JOIN community_users u ON u.id=c.author_id`;
const requireCurrent = (date: string) => {
  if (date < koreaDate()) fail(409, "지난 날짜의 게시판은 읽기만 가능해요.");
};

export async function communityApi(
  request: Request,
  db: CommunityDatabase,
): Promise<Response> {
  const url = new URL(request.url);
  const path =
    url.pathname.replace(/^\/api\/community/, "").replace(/\/$/, "") || "/";
  const method = request.method;
  const stmt = (sql: string, ...args: (string | number | null)[]) =>
    db.prepare(sql).bind(...args);
  const one = <T = Record<string, unknown>>(
    sql: string,
    ...args: (string | number | null)[]
  ) => stmt(sql, ...args).first<T>();
  const all = async (sql: string, ...args: (string | number | null)[]) =>
    (await stmt(sql, ...args).all()).results;
  async function input<T>(
    schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  ): Promise<T> {
    if (!request.headers.get("content-type")?.includes("application/json"))
      fail(415, "JSON 요청이 필요해요.");
    const reader = request.body?.getReader();
    if (!reader) return fail(400, "입력을 확인해주세요.");
    let size = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 32768) {
        await reader.cancel();
        return fail(413, "입력이 너무 길어요.");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    let body: unknown;
    try {
      body = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return fail(400, "입력을 확인해주세요.");
    }
    return schema.parse(body);
  }
  async function user() {
    const token = request.headers
      .get("authorization")
      ?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
    if (!token) return fail(401, "로그인이 필요해요.");
    const found = await one<{ id: string; nickname: string }>(
      `SELECT u.id,u.nickname FROM community_sessions s JOIN community_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?`,
      await digest(token),
      Date.now(),
    );
    return found ?? fail(401, "로그인이 만료됐어요. 다시 로그인해주세요.");
  }
  async function post(id: string) {
    return (
      (await one(`${postSelect} WHERE p.id=? AND p.deleted=0`, id)) ??
      fail(404, "삭제되었거나 없는 글이에요.")
    );
  }
  async function ownPost(id: string, uid: string) {
    const p = await post(id);
    if (p.authorId !== uid) fail(403, "작성자만 변경할 수 있어요.");
    requireCurrent(p.date as string);
    return p;
  }
  async function conversation(id: string, uid: string) {
    const c = await one(
      `SELECT * FROM community_conversations WHERE id=? AND (user_a=? OR user_b=?)`,
      id,
      uid,
      uid,
    );
    return c ?? fail(404, "대화를 찾을 수 없어요.");
  }
  async function conversations(uid: string, id?: string) {
    return all(
      `SELECT c.id,u.nickname,c.post_id AS postId,CASE WHEN p.deleted=1 THEN '삭제된 모집글' ELSE p.title END AS postTitle,
      (SELECT body FROM community_messages WHERE conversation_id=c.id ORDER BY id DESC LIMIT 1) AS lastMessage,
      COALESCE((SELECT created_at FROM community_messages WHERE conversation_id=c.id ORDER BY id DESC LIMIT 1),c.created_at) AS updatedAt,
      (SELECT COUNT(*) FROM community_messages m WHERE m.conversation_id=c.id AND m.sender_id<>? AND m.id>COALESCE(r.through_id,0)) AS unread
      FROM community_conversations c JOIN community_users u ON u.id=CASE WHEN c.user_a=? THEN c.user_b ELSE c.user_a END
      JOIN community_posts p ON p.id=c.post_id LEFT JOIN community_reads r ON r.conversation_id=c.id AND r.user_id=?
      WHERE (c.user_a=? OR c.user_b=?) ${id ? "AND c.id=?" : ""} ORDER BY updatedAt DESC LIMIT 200`,
      uid,
      uid,
      uid,
      uid,
      uid,
      ...(id ? [id] : []),
    );
  }
  try {
    if (
      (path === "/auth/signup" || path === "/auth/login") &&
      method === "POST"
    ) {
      const data = await input(
        path.endsWith("signup") ? SignupSchema : LoginSchema,
      );
      const now = Date.now();
      const window = Math.floor(now / 900000);
      // CF provides the trusted IP in production. A single local bucket is sufficient for development.
      const keys = [
        `ip:${request.headers.get("cf-connecting-ip") ?? "local"}:${window}`,
        `account:${data.login}:${window}`,
      ];
      for (const key of keys) {
        const hit = await one<{ count: number }>(
          `INSERT INTO community_auth_limits(key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count`,
          key,
          now + 900000,
        );
        if ((hit?.count ?? 99) > 20)
          return json(
            { error: "시도가 많아요. 15분 후 다시 시도해주세요." },
            429,
          );
      }
      await stmt(
        "DELETE FROM community_auth_limits WHERE expires_at<?",
        now,
      ).run();
      await stmt(
        "DELETE FROM community_sessions WHERE expires_at<?",
        now,
      ).run();
      let account: {
        id: string;
        nickname: string;
        password_hash: string;
      } | null;
      if (path.endsWith("signup")) {
        const signup = SignupSchema.parse(data);
        if (
          await one(
            "SELECT id FROM community_users WHERE login=?",
            signup.login,
          )
        )
          fail(409, "이미 사용 중인 아이디예요.");
        account = {
          id: crypto.randomUUID(),
          nickname: signup.nickname,
          password_hash: await hash(signup.password, 10),
        };
        try {
          await stmt(
            "INSERT INTO community_users(id,login,nickname,password_hash,created_at) VALUES (?,?,?,?,?)",
            account.id,
            signup.login,
            account.nickname,
            account.password_hash,
            now,
          ).run();
        } catch (error) {
          if (String(error).includes("UNIQUE"))
            fail(409, "이미 사용 중인 아이디예요.");
          throw error;
        }
      } else {
        account = await one(
          "SELECT id,nickname,password_hash FROM community_users WHERE login=?",
          data.login,
        );
        // Fixed valid bcrypt hash keeps missing-account checks from returning immediately.
        const valid = await compare(
          data.password,
          account?.password_hash ??
            "$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy",
        );
        if (!account || !valid)
          return fail(401, "아이디 또는 비밀번호를 확인해주세요.");
      }
      const token = Array.from(
        crypto.getRandomValues(new Uint8Array(32)),
        (b) => b.toString(16).padStart(2, "0"),
      ).join("");
      await stmt(
        "INSERT INTO community_sessions(token_hash,user_id,expires_at) VALUES (?,?,?)",
        await digest(token),
        account.id,
        now + 7 * 86400000,
      ).run();
      return json({
        token,
        user: { id: account.id, nickname: account.nickname },
      });
    }
    if (path === "/auth/me" && method === "GET") return json(await user());
    if (path === "/auth/logout" && method === "POST") {
      await user();
      await stmt(
        "DELETE FROM community_sessions WHERE token_hash=?",
        await digest(request.headers.get("authorization")!.slice(7)),
      ).run();
      return json({ ok: true });
    }
    if (path === "/posts" && method === "GET") {
      const mine = url.searchParams.get("mine") === "true";
      const filter = mine
        ? (await user()).id
        : DateSchema.parse(url.searchParams.get("date"));
      return json(
        await all(
          `${postSelect} WHERE p.deleted=0 AND ${mine ? "p.author_id" : "p.date"}=? ORDER BY p.created_at DESC,p.id DESC LIMIT 200`,
          filter,
        ),
      );
    }
    if (path === "/posts" && method === "POST") {
      const u = await user();
      const p = await input(PostInputSchema);
      requireCurrent(p.date);
      const id = crypto.randomUUID();
      await stmt(
        "INSERT INTO community_posts(id,author_id,date,title,body,activity,time,place,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
        id,
        u.id,
        p.date,
        p.title,
        p.body,
        p.activity,
        p.time,
        p.place,
        Date.now(),
      ).run();
      return json(await post(id), 201);
    }
    let match = path.match(/^\/posts\/([^/]+)$/);
    if (match) {
      const id = match[1];
      if (method === "GET")
        return json({
          post: await post(id),
          comments: await all(
            `${commentSelect} WHERE c.post_id=? ORDER BY c.created_at,c.id LIMIT 500`,
            id,
          ),
        });
      const u = await user();
      await ownPost(id, u.id);
      if (method === "PATCH") {
        const p = await input(PostInputSchema);
        requireCurrent(p.date);
        await stmt(
          "UPDATE community_posts SET date=?,title=?,body=?,activity=?,time=?,place=? WHERE id=?",
          p.date,
          p.title,
          p.body,
          p.activity,
          p.time,
          p.place,
          id,
        ).run();
        return json(await post(id));
      }
      if (method === "DELETE") {
        await stmt("UPDATE community_posts SET deleted=1 WHERE id=?", id).run();
        return json({ ok: true });
      }
    }
    match = path.match(/^\/posts\/([^/]+)\/status$/);
    if (match && method === "PATCH") {
      const u = await user();
      await ownPost(match[1], u.id);
      const data = await input(StatusSchema);
      await stmt(
        "UPDATE community_posts SET status=? WHERE id=?",
        data.status,
        match[1],
      ).run();
      return json(await post(match[1]));
    }
    match = path.match(/^\/posts\/([^/]+)\/comments$/);
    if (match && method === "POST") {
      const u = await user();
      const p = await post(match[1]);
      requireCurrent(p.date as string);
      const data = await input(TextSchema);
      const id = crypto.randomUUID();
      await stmt(
        "INSERT INTO community_comments(id,post_id,author_id,body,created_at) VALUES (?,?,?,?,?)",
        id,
        match[1],
        u.id,
        data.body,
        Date.now(),
      ).run();
      return json({ id }, 201);
    }
    match = path.match(/^\/comments\/([^/]+)$/);
    if (match && ["PATCH", "DELETE"].includes(method)) {
      const u = await user();
      const c =
        (await one("SELECT * FROM community_comments WHERE id=?", match[1])) ??
        fail(404, "댓글이 없어요.");
      if (c.author_id !== u.id) fail(403, "작성자만 변경할 수 있어요.");
      const p = await post(c.post_id as string);
      requireCurrent(p.date as string);
      if (method === "DELETE")
        await stmt("DELETE FROM community_comments WHERE id=?", match[1]).run();
      else {
        const data = await input(TextSchema);
        await stmt(
          "UPDATE community_comments SET body=? WHERE id=?",
          data.body,
          match[1],
        ).run();
      }
      return json({ ok: true });
    }
    if (path === "/conversations" && method === "GET")
      return json(await conversations((await user()).id));
    if (path === "/conversations" && method === "POST") {
      const u = await user();
      const data = await input(StartConversationSchema);
      const p = await post(data.postId);
      if (p.authorId === u.id) fail(400, "자신에게 쪽지를 보낼 수 없어요.");
      const [a, b] = [u.id, p.authorId as string].sort();
      await stmt(
        "INSERT INTO community_conversations(id,user_a,user_b,post_id,created_at) VALUES (?,?,?,?,?) ON CONFLICT(user_a,user_b) DO NOTHING",
        crypto.randomUUID(),
        a,
        b,
        data.postId,
        Date.now(),
      ).run();
      const c = await one<{ id: string }>(
        "SELECT id FROM community_conversations WHERE user_a=? AND user_b=?",
        a,
        b,
      );
      return json({ id: c!.id });
    }
    match = path.match(/^\/conversations\/([^/]+)(?:\/(messages|read))?$/);
    if (match) {
      const u = await user();
      const id = match[1];
      await conversation(id, u.id);
      if (!match[2] && method === "GET")
        return json({
          conversation: (await conversations(u.id, id))[0],
          messages: await all(
            "SELECT id,sender_id AS senderId,body,created_at AS createdAt FROM (SELECT * FROM community_messages WHERE conversation_id=? ORDER BY id DESC LIMIT 500) ORDER BY id",
            id,
          ),
        });
      if (match[2] === "messages" && method === "POST") {
        const data = await input(MessageInputSchema);
        const existing = await one<{ conversation_id: string; body: string }>(
          "SELECT conversation_id,body FROM community_messages WHERE sender_id=? AND client_id=?",
          u.id,
          data.clientId,
        );
        if (
          existing &&
          (existing.conversation_id !== id || existing.body !== data.body)
        )
          fail(409, "이미 사용된 전송 번호예요.");
        await stmt(
          "INSERT INTO community_messages(conversation_id,sender_id,client_id,body,created_at) VALUES (?,?,?,?,?) ON CONFLICT(sender_id,client_id) DO NOTHING",
          id,
          u.id,
          data.clientId,
          data.body,
          Date.now(),
        ).run();
        return json({ ok: true });
      }
      if (match[2] === "read" && method === "POST") {
        const data = await input(ReadSchema);
        const maximum = await one<{ n: number }>(
          "SELECT COALESCE(MAX(id),0) AS n FROM community_messages WHERE conversation_id=?",
          id,
        );
        await stmt(
          "INSERT INTO community_reads(conversation_id,user_id,through_id) VALUES (?,?,?) ON CONFLICT(conversation_id,user_id) DO UPDATE SET through_id=MAX(through_id,excluded.through_id)",
          id,
          u.id,
          Math.min(data.through, maximum!.n),
        ).run();
        return json({ ok: true });
      }
    }
    return json({ error: "요청한 기능을 찾을 수 없어요." }, 404);
  } catch (error) {
    if (error instanceof ApiError)
      return json({ error: error.message }, error.status);
    if (error instanceof z.ZodError)
      return json(
        { error: error.issues[0]?.message ?? "입력을 확인해주세요." },
        400,
      );
    console.error(
      "Community request failed",
      error instanceof Error ? error.name : "unknown",
    );
    return json({ error: "잠시 문제가 생겼어요. 다시 시도해주세요." }, 500);
  }
}
