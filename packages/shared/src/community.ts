import { z } from "zod";

export const activities = [
  "밥",
  "카페",
  "노래방",
  "공부",
  "축제",
  "기타",
] as const;
export const koreaDate = (now = new Date()) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(now);
export const DateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "올바른 날짜를 선택해주세요.");
export const LoginSchema = z.object({
  login: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]{4,30}$/, "아이디는 영문 소문자·숫자·밑줄 4~30자입니다."),
  password: z
    .string()
    .min(8, "비밀번호는 8자 이상 입력해주세요.")
    .max(64)
    .refine(
      (value) => new TextEncoder().encode(value).length <= 72,
      "비밀번호는 UTF-8 기준 72바이트 이내로 입력해주세요.",
    ),
});
export const SignupSchema = LoginSchema.extend({
  nickname: z.string().trim().min(2).max(20),
});
export const PostInputSchema = z.object({
  date: DateSchema,
  title: z.string().trim().min(1).max(100),
  body: z.string().trim().min(1).max(5000),
  activity: z.enum(activities).nullable().default(null),
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable()
    .default(null),
  place: z.string().trim().max(100).nullable().default(null),
});
export const TextSchema = z.object({
  body: z.string().trim().min(1).max(2000),
});
export const MessageInputSchema = TextSchema.extend({
  clientId: z.string().uuid(),
});
export const StatusSchema = z.object({ status: z.enum(["open", "closed"]) });
export const StartConversationSchema = z.object({ postId: z.string().uuid() });
export const ReadSchema = z.object({ through: z.number().int().nonnegative() });
export const UserSchema = z.object({ id: z.string(), nickname: z.string() });
export const AuthSchema = z.object({ token: z.string(), user: UserSchema });
export const PostSchema = PostInputSchema.extend({
  id: z.string(),
  authorId: z.string(),
  nickname: z.string(),
  status: z.enum(["open", "closed"]),
  createdAt: z.number(),
  commentCount: z.number(),
});
export const CommentSchema = z.object({
  id: z.string(),
  authorId: z.string(),
  nickname: z.string(),
  body: z.string(),
  createdAt: z.number(),
});
export const ConversationSchema = z.object({
  id: z.string(),
  nickname: z.string(),
  postId: z.string(),
  postTitle: z.string(),
  lastMessage: z.string().nullable(),
  updatedAt: z.number(),
  unread: z.number(),
});
export const MessageSchema = z.object({
  id: z.number(),
  senderId: z.string(),
  body: z.string(),
  createdAt: z.number(),
});
export const DetailSchema = z.object({
  post: PostSchema,
  comments: z.array(CommentSchema),
});
export const ThreadSchema = z.object({
  conversation: ConversationSchema,
  messages: z.array(MessageSchema),
});
export type User = z.infer<typeof UserSchema>;
export type Post = z.infer<typeof PostSchema>;
export type PostInput = z.infer<typeof PostInputSchema>;
export type Comment = z.infer<typeof CommentSchema>;
export type Conversation = z.infer<typeof ConversationSchema>;
export type Message = z.infer<typeof MessageSchema>;
