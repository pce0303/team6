import { useState } from 'react'
import { koreaDate, type Post, type User, type Comment } from '@tutorial/shared'
import { api, useResource } from './community-api'
import { Icon, ErrorNotice } from './community-ui'
import { emoji, prettyDate, clock } from './community-format'

export default function Detail({
  id,
  user,
  login,
  back,
  edit,
  startChat,
}: {
  id: string
  user: User | null
  login: () => void
  back: () => void
  edit: (post: Post) => void
  startChat: (id: string) => void
}) {
  const { data, error, loading, reload } = useResource<{
    post: Post
    comments: Comment[]
  }>(`/posts/${id}`)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const [comment, setComment] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  async function action(fn: () => Promise<void>) {
    if (busy) return
    setBusy(true)
    setActionError('')
    try {
      await fn()
    } catch (e) {
      setActionError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const p = data?.post
  const past = !!p && p.date < koreaDate()
  return (
    <section>
      <button
        className="back"
        onClick={back}
      >
        <Icon name="arrow" />
        날짜 게시판
      </button>
      {error && (
        <ErrorNotice>
          {error}
          <button onClick={() => void reload()}>다시 시도</button>
        </ErrorNotice>
      )}
      {!p && loading && <p className="muted">글을 불러오고 있어요…</p>}
      {p && (
        <>
          <article className="detail-card">
            <div className="card-meta">
              <span>
                {emoji[p.activity ?? '기타']} {p.activity ?? '함께하기'}
              </span>
              <span
                className={`status ${past || p.status === 'closed' ? 'closed' : ''}`}
              >
                {past || p.status === 'closed' ? '모집 마감' : '모집 중'}
              </span>
            </div>
            <h1>{p.title}</h1>
            <div className="author">
              <span className="avatar">{p.nickname.slice(0, 1)}</span>
              <strong>{p.nickname}</strong>
              <small>{clock(p.createdAt)}</small>
            </div>
            <div className="meeting-info">
              <span>
                <Icon name="calendar" />
                {prettyDate(p.date)}
              </span>
              {p.time && (
                <span>
                  <Icon name="clock" />
                  {p.time}
                </span>
              )}
              {p.place && (
                <span>
                  <Icon name="pin" />
                  {p.place}
                </span>
              )}
            </div>
            <p className="body-text">{p.body}</p>
            {user?.id === p.authorId ? (
              !past && (
                <div className="button-row">
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => edit(p)}
                  >
                    수정
                  </button>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() =>
                      void action(async () => {
                        await api(`/posts/${id}/status`, 'PATCH', {
                          status: p.status === 'open' ? 'closed' : 'open',
                        })
                        await reload()
                      })
                    }
                  >
                    {p.status === 'open' ? '모집 마감' : '다시 모집'}
                  </button>
                  <button
                    className="text-button danger"
                    disabled={busy}
                    onClick={() => {
                      if (confirm('이 모집글을 삭제할까요?'))
                        void action(async () => {
                          await api(`/posts/${id}`, 'DELETE')
                          back()
                        })
                    }}
                  >
                    삭제
                  </button>
                </div>
              )
            ) : (
              <button
                className="primary"
                disabled={busy}
                onClick={() => {
                  if (!user) return login()
                  void action(async () => {
                    const c = await api<{ id: string }>(
                      '/conversations',
                      'POST',
                      { postId: id }
                    )
                    startChat(c.id)
                  })
                }}
              >
                <Icon name="chat" />
                작성자에게 쪽지 보내기
              </button>
            )}
          </article>
          <section className="comments">
            <h2>
              댓글 <span>{data.comments.length}</span>
            </h2>
            {!data.comments.length && (
              <p className="muted">
                궁금한 점이나 함께하고 싶은 마음을 남겨보세요.
              </p>
            )}
            {data.comments.map((c) => (
              <div
                className="comment"
                key={c.id}
              >
                <div className="comment-head">
                  <strong>
                    {c.nickname}
                    {c.authorId === p.authorId && <small> 글쓴이</small>}
                  </strong>
                  <small>{clock(c.createdAt)}</small>
                </div>
                <p className="body-text">{c.body}</p>
                {user?.id === c.authorId && !past && (
                  <div className="button-row">
                    <button
                      className="text-button"
                      onClick={() => {
                        setEditing(c.id)
                        setComment(c.body)
                      }}
                    >
                      수정
                    </button>
                    <button
                      className="text-button danger"
                      disabled={busy}
                      onClick={() => {
                        if (confirm('댓글을 삭제할까요?'))
                          void action(async () => {
                            await api(`/comments/${c.id}`, 'DELETE')
                            await reload()
                          })
                      }}
                    >
                      삭제
                    </button>
                  </div>
                )}
              </div>
            ))}
            {past ? (
              <p className="hint">지난 날짜의 게시판은 읽기만 가능해요.</p>
            ) : (
              <form
                className="form"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (!user) return login()
                  void action(async () => {
                    await api(
                      editing
                        ? `/comments/${editing}`
                        : `/posts/${id}/comments`,
                      editing ? 'PATCH' : 'POST',
                      { body: comment }
                    )
                    setComment('')
                    setEditing(null)
                    await reload()
                  })
                }}
              >
                <label
                  className="sr-only"
                  htmlFor="comment"
                >
                  댓글
                </label>
                <textarea
                  id="comment"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  required
                  maxLength={2000}
                  rows={3}
                  placeholder={
                    user
                      ? '댓글로 이야기를 시작해보세요.'
                      : '로그인하고 댓글을 남겨보세요.'
                  }
                />
                <div className="button-row">
                  {editing && (
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => {
                        setEditing(null)
                        setComment('')
                      }}
                    >
                      수정 취소
                    </button>
                  )}
                  <button
                    className="primary"
                    disabled={busy}
                  >
                    {editing ? '수정 완료' : '댓글 남기기'}
                  </button>
                </div>
              </form>
            )}
          </section>
        </>
      )}
      {actionError && <ErrorNotice>{actionError}</ErrorNotice>}
    </section>
  )
}
