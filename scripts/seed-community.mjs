const origin = process.env.COMMUNITY_ORIGIN ?? "http://127.0.0.1:8787";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin))
  throw new Error("Seed is local-only");
async function api(path, method = "GET", body, token) {
  const r = await fetch(`${origin}/api/community${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const value = await r.json();
  if (!r.ok) throw new Error(value.error);
  return value;
}
async function account(login, nickname) {
  const credentials = { login, password: "geunal-local-2026" };
  try {
    return await api("/auth/signup", "POST", { ...credentials, nickname });
  } catch {
    return api("/auth/login", "POST", credentials);
  }
}
const a = await account("demo_haru", "하루"),
  b = await account("demo_bom", "봄이");
const today = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Seoul",
}).format(new Date());
const date = (n) => {
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const examples = [
  [
    a,
    0,
    "밥",
    "혼밥 말고, 같이 학식 먹을래요?",
    "첫 학기라 아직 학생회관 학식을 못 먹어봤어요. 점심 수업 끝나고 같이 가실 분! 메뉴는 만나서 골라요.",
    "12:00",
    "학생회관 앞",
  ],
  [
    b,
    0,
    "카페",
    "공강 한 시간, 커피 한 잔 같이 해요 ☕",
    "다음 수업까지 시간이 남는데 날씨도 좋아서 카페 가려고 해요. 전공 달라도 환영! 편하게 이야기해요.",
    "14:00",
    "정문 근처",
  ],
  [
    a,
    0,
    "노래방",
    "수업 끝나고 코노 한 시간 🎤",
    "노래 잘 못해도 괜찮아요. 저도 듣는 걸 더 좋아해요. 같이 스트레스 풀어요!",
    "17:30",
    "대학로 코인노래방",
  ],
  [
    b,
    1,
    "공부",
    "도서관 첫 방문, 같이 자리 찾아봐요",
    "도서관 이용이 처음인 사람끼리 함께 가봐요. 각자 공부하다가 쉬는 시간에 인사해요.",
    "10:00",
    "중앙도서관 입구",
  ],
  [
    a,
    3,
    "축제",
    "축제 부스 같이 구경할 사람!",
    "혼자 돌아다니기는 조금 어색해서 같이 구경할 친구를 찾아요. 먹거리부터 천천히 둘러봐요.",
    "16:00",
    "대운동장 입구",
  ],
];
for (const [owner, offset, activity, title, body, time, place] of examples) {
  const existing = await api(`/posts?date=${date(offset)}`);
  if (!existing.some((p) => p.title === title && p.authorId === owner.user.id))
    await api(
      "/posts",
      "POST",
      { date: date(offset), activity, title, body, time, place },
      owner.token,
    );
}
await api("/auth/logout", "POST", undefined, a.token);
await api("/auth/logout", "POST", undefined, b.token);
console.log(
  "Local demo ready. Accounts: demo_haru / demo_bom. Password: geunal-local-2026 (local sample only).",
);
