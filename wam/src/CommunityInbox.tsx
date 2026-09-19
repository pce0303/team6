import { useEffect, useRef, useState, type FormEvent } from 'react'
import { type User, type Conversation, type Message } from '@tutorial/shared'
import { api, useResource } from './community-api'
import { Icon, Empty, ErrorNotice } from './community-ui'
import { clock } from './community-format'

export default function Inbox({
  user,
  conversationId,
  open,
  viewPost,
}: {
  user: User
  conversationId: string | null
  open: (id: string | null) => void
  viewPost: (id: string) => void
}) {
  const list = useResource<Conversation[]>('/conversations', 10000)
  const reloadList = list.reload
  const thread = useResource<{
    conversation: Conversation
    messages: Message[]
  }>(conversationId ? `/conversations/${conversationId}` : null, 10000)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef<{ body: string; clientId: string } | null>(null)
  const end = useRef<HTMLDivElement>(null)
  const lastId = thread.data?.messages[thread.data.messages.length - 1]?.id ?? 0
  useEffect(() => {
    setText('')
    setError('')
    pending.current = null
  }, [conversationId])
  useEffect(() => {
    const markRead = () => {
      if (!conversationId || !lastId || document.hidden) return
      void api(`/conversations/${conversationId}/read`, 'POST', {
        through: lastId,
      })
        .then(reloadList)
        .catch((e) => setError((e as Error).message))
    }
    markRead()
    document.addEventListener('visibilitychange', markRead)
    end.current?.scrollIntoView({ block: 'nearest' })
    return () => document.removeEventListener('visibilitychange', markRead)
  }, [conversationId, lastId, reloadList])
  async function send(e: FormEvent) {
    e.preventDefault()
    if (busy || !text.trim() || !conversationId) return
    const id = conversationId
    const body = text.trim()
    if (pending.current?.body !== body)
      pending.current = { body, clientId: crypto.randomUUID() }
    setBusy(true)
    setError('')
    try {
      await api(`/conversations/${id}/messages`, 'POST', pending.current)
      setText('')
      pending.current = null
      await thread.reload()
      await list.reload()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <section>
      {conversationId ? (
        <>
          <button
            className="back"
            onClick={() => open(null)}
          >
            <Icon name="arrow" />
            쪽지함
          </button>
          {thread.data && (
            <>
              <div className="thread-heading">
                <span className="avatar">
                  {thread.data.conversation.nickname.slice(0, 1)}
                </span>
                <div>
                  <h2>{thread.data.conversation.nickname}</h2>
                  <span className="muted">둘만의 약속을 이야기해요</span>
                </div>
              </div>
              <button
                className="linked-post"
                onClick={() => viewPost(thread.data!.conversation.postId)}
              >
                모집글 · {thread.data.conversation.postTitle} ↗
              </button>
              <div className="messages">
                {!thread.data.messages.length && (
                  <Empty
                    title="첫 쪽지를 보내보세요"
                    text="가벼운 인사로 시작해도 좋아요."
                  />
                )}
                {thread.data.messages.map((m) => (
                  <div
                    key={m.id}
                    className={`message ${m.senderId === user.id ? 'mine' : ''}`}
                  >
                    <p>{m.body}</p>
                    <small>{clock(m.createdAt)}</small>
                  </div>
                ))}
                <div ref={end} />
              </div>
              <form
                className="message-compose"
                onSubmit={send}
              >
                <label
                  className="sr-only"
                  htmlFor="message"
                >
                  쪽지 내용
                </label>
                <textarea
                  id="message"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={2}
                  maxLength={2000}
                  required
                  placeholder="쪽지를 입력하세요"
                  disabled={busy}
                />
                <button
                  className="primary"
                  disabled={busy || !text.trim()}
                >
                  {busy ? '전송 중' : '보내기'}
                </button>
              </form>
            </>
          )}
          {thread.error && (
            <ErrorNotice>
              {thread.error}
              <button onClick={() => void thread.reload()}>다시 시도</button>
            </ErrorNotice>
          )}
          {thread.loading && !thread.data && <p>대화를 불러오고 있어요…</p>}
        </>
      ) : (
        <>
          <div className="page-title">
            <span className="eyebrow">PRIVATE MESSAGES</span>
            <h1>우리끼리 이야기</h1>
            <p>함께할 약속은 여기서 이어가요.</p>
          </div>
          {list.loading && !list.data && <p>쪽지함을 불러오고 있어요…</p>}
          {list.error && (
            <ErrorNotice>
              {list.error}
              <button onClick={() => void list.reload()}>다시 시도</button>
            </ErrorNotice>
          )}
          {list.data?.length === 0 && (
            <Empty
              title="아직 도착한 쪽지가 없어요"
              text="마음에 드는 모집글에서 먼저 말을 걸어보세요."
            />
          )}
          {list.data?.map((c) => (
            <button
              className="conversation"
              key={c.id}
              onClick={() => open(c.id)}
            >
              <span className="avatar">{c.nickname.slice(0, 1)}</span>
              <div>
                <strong>{c.nickname}</strong>
                <p>{c.lastMessage ?? '첫 인사를 보내보세요'}</p>
                <small>{c.postTitle}</small>
              </div>
              <div className="conversation-meta">
                <small>{clock(c.updatedAt)}</small>
                {c.unread > 0 && <b className="unread">{c.unread}</b>}
              </div>
            </button>
          ))}
        </>
      )}
      {error && <ErrorNotice>{error}</ErrorNotice>}
    </section>
  )
}
