import { emoji, shiftDate, prettyDate } from './community-format'
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import {
  activities,
  koreaDate,
  type Post,
  type PostInput,
} from '@tutorial/shared'
import { api, type Session } from './community-api'

const icons: Record<string, string> = {
  calendar:
    'M5 3v4M19 3v4M3 10h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z',
  chat: 'M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-2 2v-9.5A8.5 8.5 0 0 1 10.5 4h2A8.5 8.5 0 0 1 21 11.5ZM7 11h10M7 15h6',
  user: 'M20 21v-2a6 6 0 0 0-6-6h-4a6 6 0 0 0-6 6v2M16 6a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  arrow: 'm14 6-6 6 6 6',
  plus: 'M12 5v14M5 12h14',
  clock: 'M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
  pin: 'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
}
export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={icons[name] ?? icons.calendar} />
    </svg>
  )
}
export function ErrorNotice({ children }: { children: ReactNode }) {
  return (
    <div
      className="error"
      role="alert"
    >
      {children}
    </div>
  )
}
export function Empty({
  title,
  text,
  children,
}: {
  title: string
  text: string
  children?: ReactNode
}) {
  return (
    <div className="empty">
      <div className="empty-art">✳</div>
      <h3>{title}</h3>
      <p>{text}</p>
      {children}
    </div>
  )
}
function Modal({
  title,
  close,
  children,
}: {
  title: string
  close: () => void
  children: ReactNode
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])
  return (
    <dialog
      ref={dialog}
      onCancel={close}
      onClick={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <div className="modal-inner">
        <div className="section-heading">
          <h2>{title}</h2>
          <button
            className="icon-button"
            onClick={close}
            aria-label="닫기"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </dialog>
  )
}
export function Auth({
  onSuccess,
  close,
}: {
  onSuccess: (session: Session) => void
  close: () => void
}) {
  const [signup, setSignup] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (busy) return
    const f = new FormData(e.currentTarget)
    setBusy(true)
    setError('')
    try {
      onSuccess(
        await api<Session>(
          `/auth/${signup ? 'signup' : 'login'}`,
          'POST',
          Object.fromEntries(f)
        )
      )
      close()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      title={signup ? '우리, 그날 만나요' : '다시 만나 반가워요'}
      close={close}
    >
      <p className="muted">
        닉네임으로 가볍게 시작해요. 아이디는 공개되지 않아요.
      </p>
      <form
        onSubmit={submit}
        className="form"
      >
        <label>
          아이디
          <input
            name="login"
            required
            pattern="[A-Za-z0-9_]{4,30}"
            minLength={4}
            maxLength={30}
            autoComplete="username"
            placeholder="영문·숫자·밑줄 4~30자"
          />
        </label>
        {signup && (
          <label>
            닉네임
            <input
              name="nickname"
              required
              minLength={2}
              maxLength={20}
              autoComplete="nickname"
              placeholder="친구들이 부를 이름"
            />
          </label>
        )}
        <label>
          비밀번호
          <input
            name="password"
            type="password"
            required
            minLength={8}
            maxLength={64}
            autoComplete={signup ? 'new-password' : 'current-password'}
            placeholder="8자 이상"
          />
        </label>
        {error && <ErrorNotice>{error}</ErrorNotice>}
        <button
          className="primary"
          disabled={busy}
        >
          {busy ? '잠시만요…' : signup ? '가입하고 시작하기' : '로그인'}
        </button>
        <button
          type="button"
          className="text-button"
          onClick={() => {
            setSignup(!signup)
            setError('')
          }}
        >
          {signup ? '이미 계정이 있어요' : '처음이에요 · 회원가입'}
        </button>
      </form>
    </Modal>
  )
}
export function Editor({
  initial,
  date,
  close,
  saved,
}: {
  initial?: Post
  date: string
  close: () => void
  saved: (post: Post) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (busy) return
    const f = new FormData(e.currentTarget)
    const payload = Object.fromEntries(f) as Record<string, string | null>
    for (const key of ['activity', 'time', 'place'])
      if (!payload[key]) payload[key] = null
    setBusy(true)
    setError('')
    try {
      saved(
        await api<Post>(
          initial ? `/posts/${initial.id}` : '/posts',
          initial ? 'PATCH' : 'POST',
          payload as PostInput
        )
      )
      close()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      title={initial ? '모집글 수정하기' : '그날, 함께할 사람 찾기'}
      close={close}
    >
      <form
        className="form"
        onSubmit={submit}
      >
        <div className="form-row">
          <label>
            날짜
            <input
              name="date"
              type="date"
              min={koreaDate()}
              defaultValue={initial?.date ?? date}
              required
            />
          </label>
          <label>
            무엇을 할까요?
            <select
              name="activity"
              defaultValue={initial?.activity ?? ''}
            >
              <option value="">선택 안 함</option>
              {activities.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </label>
        </div>
        <label>
          제목
          <input
            name="title"
            maxLength={100}
            defaultValue={initial?.title}
            required
            placeholder="예: 수업 끝나고 같이 학식 먹을 사람?"
          />
        </label>
        <label>
          어떤 만남인가요?
          <textarea
            name="body"
            rows={5}
            maxLength={5000}
            defaultValue={initial?.body}
            required
            placeholder="하고 싶은 일과 편하게 알아두면 좋을 것들을 적어주세요."
          />
        </label>
        <div className="form-row">
          <label>
            시간 <small>선택</small>
            <input
              name="time"
              type="time"
              defaultValue={initial?.time ?? ''}
            />
          </label>
          <label>
            장소 <small>선택</small>
            <input
              name="place"
              maxLength={100}
              defaultValue={initial?.place ?? ''}
              placeholder="예: 학생회관 앞"
            />
          </label>
        </div>
        <p className="hint">
          참가 신청이나 자동 매칭은 없어요. 댓글과 쪽지로 직접 약속해요.
        </p>
        {error && <ErrorNotice>{error}</ErrorNotice>}
        <button
          className="primary"
          disabled={busy}
        >
          {busy ? '저장 중…' : initial ? '수정 완료' : '모집글 올리기'}
        </button>
      </form>
    </Modal>
  )
}
export function Calendar({
  value,
  select,
}: {
  value: string
  select: (date: string) => void
}) {
  const [month, setMonth] = useState(value.slice(0, 7))
  const first = `${month}-01`
  const start = shiftDate(first, -new Date(`${first}T12:00:00Z`).getUTCDay())
  function move(n: number) {
    const d = new Date(`${first}T12:00:00Z`)
    d.setUTCMonth(d.getUTCMonth() + n)
    setMonth(d.toISOString().slice(0, 7))
  }
  return (
    <div className="calendar">
      <div className="section-heading">
        <button
          className="icon-button"
          aria-label="이전 달"
          onClick={() => move(-1)}
        >
          ‹
        </button>
        <strong>{month.replace('-', '년 ')}월</strong>
        <button
          className="icon-button"
          aria-label="다음 달"
          onClick={() => move(1)}
        >
          ›
        </button>
      </div>
      <div className="calendar-grid">
        {'일월화수목금토'.split('').map((day) => (
          <small key={day}>{day}</small>
        ))}
        {Array.from({ length: 42 }, (_, i) => shiftDate(start, i)).map(
          (date) => (
            <button
              key={date}
              className={`${date === value ? 'selected' : ''} ${date.slice(0, 7) !== month ? 'faded' : ''}`}
              aria-label={prettyDate(date)}
              aria-pressed={date === value}
              onClick={() => select(date)}
            >
              {Number(date.slice(-2))}
              {date === koreaDate() && <i />}
            </button>
          )
        )}
      </div>
    </div>
  )
}
export function PostCard({ post, open }: { post: Post; open: () => void }) {
  const closed = post.status === 'closed' || post.date < koreaDate()
  return (
    <button
      className="post-card"
      onClick={open}
    >
      <div
        className={`activity-tile activity-${activities.indexOf(post.activity ?? '기타')}`}
      >
        {emoji[post.activity ?? '기타']}
      </div>
      <div className="post-summary">
        <div className="card-meta">
          <span>{post.activity ?? '함께하기'}</span>
          <span className={`status ${closed ? 'closed' : ''}`}>
            {closed ? '모집 마감' : '모집 중'}
          </span>
        </div>
        <h3>{post.title}</h3>
        <p className="preview">{post.body}</p>
        <div className="details">
          {post.time && (
            <span>
              <Icon
                name="clock"
                size={14}
              />
              {post.time}
            </span>
          )}
          {post.place && (
            <span>
              <Icon
                name="pin"
                size={14}
              />
              {post.place}
            </span>
          )}
        </div>
        <div className="card-footer">
          <span>{post.nickname}</span>
          <span>
            <Icon
              name="chat"
              size={14}
            />
            {post.commentCount}
          </span>
        </div>
      </div>
    </button>
  )
}
