import { shiftDate, prettyDate } from './community-format'
import { useEffect, useState } from 'react'
import { koreaDate, type Post, type User } from '@tutorial/shared'
import { api, savedToken, setToken, useResource } from './community-api'
import {
  Icon,
  ErrorNotice,
  Empty,
  Auth,
  Editor,
  Calendar,
  PostCard,
} from './community-ui'
import Detail from './CommunityDetail'
import Inbox from './CommunityInbox'
import './community.css'

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [authReady, setAuthReady] = useState(!savedToken())
  const [authOpen, setAuthOpen] = useState(false)
  const [tab, setTab] = useState('board')
  const [date, setDate] = useState(koreaDate())
  const [calendar, setCalendar] = useState(false)
  const [postId, setPostId] = useState<string | null>(null)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [editor, setEditor] = useState<Post | 'new' | null>(null)
  const [notice, setNotice] = useState('')
  const [detailVersion, setDetailVersion] = useState(0)
  const posts = useResource<Post[]>(
    tab === 'board' && !postId
      ? `/posts?date=${date}`
      : tab === 'mine' && user && !postId
        ? '/posts?mine=true'
        : null
  )
  useEffect(() => {
    if (savedToken())
      void api<User>('/auth/me')
        .then(setUser)
        .catch(() => {
          setToken('')
          setNotice('다시 로그인해주세요.')
        })
        .finally(() => setAuthReady(true))
    const expired = () => {
      setToken('')
      setUser(null)
      setAuthOpen(true)
    }
    window.addEventListener('session-expired', expired)
    return () => window.removeEventListener('session-expired', expired)
  }, [])
  useEffect(() => {
    const bridge = window.ChannelIOWam
    if (bridge) {
      void bridge.setSize({ width: 480, height: 720 })
    }
  }, [])
  function navigate(next: string) {
    setTab(next)
    setPostId(null)
    setConversationId(null)
    setNotice('')
  }
  function compose() {
    if (!user) return setAuthOpen(true)
    setEditor('new')
  }
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [tab, postId, conversationId])
  const today = koreaDate()
  const dayOfWeek = new Date(`${date}T12:00:00Z`).getUTCDay()
  const start = shiftDate(date, -dayOfWeek)
  return (
    <div className="app-shell">
      <header className="topbar">
        <button
          className="brand"
          onClick={() => navigate('board')}
        >
          <span className="brand-mark">✳</span>
          <span>
            그날<small>함께할 이유가 생기는 날</small>
          </span>
        </button>
        <div className="header-actions">
          {authReady &&
            (user ? (
              <button
                className="profile-chip"
                onClick={() => navigate('mine')}
              >
                <span className="tiny-avatar">{user.nickname.slice(0, 1)}</span>
                {user.nickname}
              </button>
            ) : (
              <button
                className="secondary small"
                onClick={() => setAuthOpen(true)}
              >
                로그인
              </button>
            ))}
          {window.ChannelIOWam && (
            <button
              className="icon-button"
              aria-label="앱 닫기"
              onClick={() => void window.ChannelIOWam?.close()}
            >
              ×
            </button>
          )}
        </div>
      </header>
      <main>
        {notice && (
          <div
            role="status"
            className="notice"
          >
            {notice}
            <button
              aria-label="알림 닫기"
              onClick={() => setNotice('')}
            >
              ×
            </button>
          </div>
        )}
        {postId ? (
          <Detail
            key={`${postId}:${detailVersion}`}
            id={postId}
            user={user}
            login={() => setAuthOpen(true)}
            back={() => {
              setPostId(null)
              void posts.reload()
            }}
            edit={setEditor}
            startChat={(id) => {
              setTab('inbox')
              setPostId(null)
              setConversationId(id)
            }}
          />
        ) : tab === 'board' ? (
          <>
            <section className="hero">
              <div>
                <span className="eyebrow">A LITTLE PLAN, A NEW FRIEND</span>
                <h1>
                  그날, 뭐 해요<span>?</span>
                </h1>
                <p>
                  밥 한 끼도, 축제 한 바퀴도.
                  <br />
                  같은 날을 기다리는 사람들과 함께해요.
                </p>
              </div>
              <div
                className="hero-calendar"
                aria-hidden="true"
              >
                <div>LET’S MEET</div>
                <strong>{Number(date.slice(-2))}</strong>
                <span>혼자보다, 같이 ✳</span>
              </div>
            </section>
            <section className="date-panel">
              <div className="section-heading">
                <button
                  className="month-button"
                  onClick={() => setCalendar(!calendar)}
                >
                  <Icon name="calendar" />
                  {date.slice(0, 4)}년 {Number(date.slice(5, 7))}월{' '}
                  <span>⌄</span>
                </button>
                <div className="button-row">
                  <button
                    className="text-button"
                    onClick={() => setDate(today)}
                  >
                    오늘
                  </button>
                  <button
                    className="icon-button"
                    aria-label="이전 주"
                    onClick={() => setDate(shiftDate(date, -7))}
                  >
                    ‹
                  </button>
                  <button
                    className="icon-button"
                    aria-label="다음 주"
                    onClick={() => setDate(shiftDate(date, 7))}
                  >
                    ›
                  </button>
                </div>
              </div>
              {calendar && (
                <Calendar
                  value={date}
                  select={(d) => {
                    setDate(d)
                    setCalendar(false)
                  }}
                />
              )}
              <div className="week-strip">
                {Array.from({ length: 7 }, (_, i) => shiftDate(start, i)).map(
                  (d) => (
                    <button
                      key={d}
                      className={d === date ? 'selected' : ''}
                      aria-pressed={d === date}
                      aria-label={prettyDate(d)}
                      onClick={() => setDate(d)}
                    >
                      <small>
                        {
                          '일월화수목금토'[
                            new Date(`${d}T12:00:00Z`).getUTCDay()
                          ]
                        }
                      </small>
                      <strong>{Number(d.slice(-2))}</strong>
                      <span>{d === today ? '오늘' : '·'}</span>
                    </button>
                  )
                )}
              </div>
            </section>
            <section className="board">
              <div className="section-heading">
                <div>
                  <h2>
                    {prettyDate(date).replace(/ [일월화수목금토]요일$/, '')}의
                    약속{' '}
                    <span className="count">{posts.data?.length ?? 0}</span>
                  </h2>
                  <p className="muted">
                    {date < today
                      ? '지나간 날의 이야기를 둘러보세요.'
                      : '거창한 계획 없이, 가볍게 말을 걸어봐요.'}
                  </p>
                </div>
                <span className="sort-label">최신순</span>
              </div>
              {posts.error && (
                <ErrorNotice>
                  {posts.error}
                  <button onClick={() => void posts.reload()}>다시 시도</button>
                </ErrorNotice>
              )}
              {posts.loading && !posts.data && (
                <div className="skeleton">그날의 약속을 불러오고 있어요…</div>
              )}
              {posts.data?.length === 0 && (
                <Empty
                  title="아직 비어 있는 하루예요"
                  text="작은 계획 하나가 새로운 친구의 시작이 될 수 있어요."
                >
                  {date >= today && (
                    <button
                      className="secondary"
                      onClick={compose}
                    >
                      첫 번째 약속 제안하기 ↗
                    </button>
                  )}
                </Empty>
              )}
              <div className="post-list">
                {posts.data?.map((p) => (
                  <PostCard
                    key={p.id}
                    post={p}
                    open={() => setPostId(p.id)}
                  />
                ))}
              </div>
            </section>
            {date >= today && (
              <button
                className="compose-button"
                onClick={compose}
              >
                <Icon name="plus" />
                모집글 쓰기
              </button>
            )}
          </>
        ) : !user ? (
          <Empty
            title={
              tab === 'inbox'
                ? '쪽지를 주고받아 볼까요?'
                : '나의 약속을 모아보세요'
            }
            text="로그인하면 댓글과 쪽지로 이야기를 이어갈 수 있어요."
          >
            <button
              className="primary"
              onClick={() => setAuthOpen(true)}
            >
              로그인하고 시작하기
            </button>
          </Empty>
        ) : tab === 'inbox' ? (
          <Inbox
            key={user.id}
            user={user}
            conversationId={conversationId}
            open={setConversationId}
            viewPost={setPostId}
          />
        ) : (
          <>
            <div className="page-title">
              <span className="eyebrow">MY LITTLE PLANS</span>
              <h1>{user.nickname}의 그날</h1>
              <p>내가 제안한 만남을 한곳에서 관리해요.</p>
              <button
                className="text-button"
                onClick={() => {
                  void api('/auth/logout', 'POST')
                    .then(() => {
                      setToken('')
                      setUser(null)
                      navigate('board')
                    })
                    .catch((e) => setNotice((e as Error).message))
                }}
              >
                로그아웃
              </button>
            </div>
            <h2>내 모집글</h2>
            {posts.error && (
              <ErrorNotice>
                {posts.error}
                <button onClick={() => void posts.reload()}>다시 시도</button>
              </ErrorNotice>
            )}
            {posts.loading && !posts.data && <p>내 글을 불러오고 있어요…</p>}
            {posts.data?.length === 0 && (
              <Empty
                title="첫 약속을 제안해보세요"
                text="함께 하고 싶은 일이 있다면 날짜부터 골라봐요."
              />
            )}
            <div className="post-list">
              {posts.data?.map((p) => (
                <div key={p.id}>
                  <div className="my-date">{prettyDate(p.date)}</div>
                  <PostCard
                    post={p}
                    open={() => setPostId(p.id)}
                  />
                </div>
              ))}
            </div>
          </>
        )}
      </main>
      <nav
        className="bottom-nav"
        aria-label="주 메뉴"
      >
        {[
          ['board', 'calendar', '날짜 게시판'],
          ['inbox', 'chat', '쪽지함'],
          ['mine', 'user', '내 활동'],
        ].map(([key, icon, label]) => (
          <button
            key={key}
            className={tab === key ? 'active' : ''}
            onClick={() => navigate(key)}
            aria-current={tab === key ? 'page' : undefined}
          >
            <Icon name={icon} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      {authOpen && (
        <Auth
          close={() => setAuthOpen(false)}
          onSuccess={(session) => {
            setToken(session.token)
            setUser(session.user)
            setNotice(`${session.user.nickname}님, 반가워요!`)
          }}
        />
      )}
      {editor && (
        <Editor
          initial={editor === 'new' ? undefined : editor}
          date={date}
          close={() => setEditor(null)}
          saved={(p) => {
            setDate(p.date)
            setPostId(p.id)
            setTab('board')
            setDetailVersion((v) => v + 1)
            setNotice('모집글을 저장했어요.')
          }}
        />
      )}
    </div>
  )
}
