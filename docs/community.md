# 그날 — 날짜별 커뮤니티

브랜치: `main2`. 서비스 자체 계정으로 로그인하는 React 웹/WAM 앱입니다. 자동 매칭 없이 댓글과 쪽지로 직접 약속합니다.

## 로컬 실행

Node 24 이상, 프로젝트 지정 pnpm을 사용합니다.

```sh
pnpm install --frozen-lockfile
pnpm build:cloudflare
pnpm db:migrate:local
pnpm dev:cloudflare
```

첫 실행 전에 루트 `.dev.vars`에 다음 **로컬 전용 더미 값**을 설정합니다. 기존 설정은 덮어쓰지 않습니다. 이 파일은 Git에서 제외됩니다.

```dotenv
APP_ID=local-test-app
APP_SECRET=local-test-secret
SIGNING_KEY=1111111111111111111111111111111111111111111111111111111111111111
APP_STORE_URL=https://app-store-api.channel.io
AUTO_REGISTER=false
```

별도 터미널에서:

```sh
pnpm dev:wam
```

- UI: http://localhost:5173 — Vite가 `/api`를 127.0.0.1:8787로 프록시합니다.
- 빌드된 WAM: http://localhost:8787/resource/wam/tutorial/
- 서버 변경 시 `pnpm build:cloudflare`로 재빌드합니다. Wrangler가 변경을 반영합니다.
- Nest 단독 `dev:server`에는 D1과 커뮤니티 Fetch 라우터가 없습니다. **커뮤니티 서버는 `dev:cloudflare`로 실행합니다.**

선택적으로 실제 로컬 D1에 샘플 데이터를 넣습니다. 운영 데이터에는 자동 삽입하지 않습니다.

```sh
pnpm seed:community:local
```

로컬 시연 계정은 `demo_haru` / `demo_bom`, 비밀번호는 둘 다 `geunal-local-2026`입니다. 각기 다른 탭 또는 브라우저에서 로그인해 쪽지를 확인할 수 있습니다. 이미 같은 제목의 샘플 글이 있으면 재생성하지 않습니다.

## 구조와 API

기존 `/functions`는 SDK 서명 검증을 유지합니다. Worker는 `/api/community/*`만 별도의 Fetch API 핸들러로 보내고 기존 D1 binding을 전달합니다. UI와 서버는 공유 패키지의 요청 스키마·응답 타입을 사용합니다. WAM 안에서도 동일 출처 HTTP API로 접근하므로 커뮤니티 기능마다 Channel Function을 등록할 필요가 없습니다. 기존 `/tutorial` Function은 화면을 여는 진입점으로 유지합니다.

| API                                                      | 역할                                         |
| -------------------------------------------------------- | -------------------------------------------- |
| POST `/auth/signup`, `/auth/login`                       | 아이디·비밀번호 인증, 가입 시 닉네임 추가    |
| GET `/auth/me`, POST `/auth/logout`                      | 세션 조회·폐기                               |
| GET `/posts?date=YYYY-MM-DD` 또는 `?mine=true`           | 선택 날짜 또는 본인 글                       |
| POST `/posts`, GET/PATCH/DELETE `/posts/:id`             | 글 작성·상세·수정·삭제                       |
| PATCH `/posts/:id/status`                                | `open` / `closed` 전환                       |
| POST `/posts/:id/comments`, PATCH/DELETE `/comments/:id` | 댓글                                         |
| GET/POST `/conversations`                                | 쪽지함 / 글 작성자와 대화 시작               |
| GET `/conversations/:id`                                 | 참여자만 대화 조회                           |
| POST `/conversations/:id/messages`                       | `body`, UUID `clientId`로 중복 전송 방지     |
| POST `/conversations/:id/read`                           | 화면에서 확인한 메시지 ID `through`까지 읽음 |

모든 경로 앞에 `/api/community`를 붙입니다. 성공은 JSON, 오류는 `{error: string}`과 HTTP 상태 코드입니다. 비공개/변경 API는 `Authorization: Bearer <token>`을 요구합니다. 인증 응답 외에는 로그인 아이디·비밀번호 해시·토큰을 반환하지 않습니다.

비밀번호는 bcrypt(cost 10), 세션은 난수 256비트/서버 SHA-256 해시/7일 만료입니다. 클라이언트 토큰은 sessionStorage에 저장하며 third-party cookie에 의존하지 않습니다. 로그아웃하면 서버 세션도 폐기합니다. 로그인·가입은 IP와 아이디별 15분 창에서 20회까지 제한합니다. 로컬 IP bucket은 공용이므로 반복 검증 시 제한에 도달할 수 있습니다.

날짜는 Asia/Seoul 기준입니다. 지난 날짜의 글·댓글은 읽기만 가능하며 쪽지는 계속 사용할 수 있습니다. 삭제한 글은 숨기고 기존 대화의 연결은 유지합니다. 쪽지는 두 사용자당 한 대화를 재사용하며 최초 시작 글을 연결합니다. 현재 v1 조회 상한은 글/대화 200건, 댓글 500건, 대화별 최신 메시지 500건이며 이전 항목 페이지 탐색은 후속 범위입니다.

## 검증

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm build:cloudflare
pnpm test:community
SMOKE_ORIGIN=http://127.0.0.1:8787 pnpm test:cloudflare
```

`test:community`는 실행 중인 로컬 Workers/D1에 임시 계정 3개를 생성해 가입, 날짜 분리, 댓글, 양방향 쪽지, 제3자 차단, 중복 전송 방지, 읽음, 마감, 로그아웃을 검증합니다. 검증 글은 숨김 처리하며 로컬 테스트 계정·대화는 남습니다. 테스트와 seed는 localhost/127.0.0.1만 허용합니다.

브라우저 확인: 두 계정으로 글 작성 → 댓글 → 쪽지 답장 → 모집 마감. 달력·빈 날짜·오류 재시도·작은 화면도 확인합니다. 실제 채널톡 host bridge와 앱 열기는 로컬 브라우저 검증과 별개입니다.

## 운영진 배포 절차 (이번 작업에서는 실행하지 않음)

1. 운영진이 Team6 DB 매핑을 확인하고 새 `0002_community.sql`을 **코드의 main 머지 전에** 원격 D1에 적용합니다. 기존 `0001`은 수정하지 않습니다.
2. 원격 적용 확인 후 코드 머지와 CI/자동 배포를 진행합니다. 새 테이블만 추가하므로 이전 버전은 그대로 동작합니다.
3. `/tutorial`의 Command metadata/Function schema는 변경하지 않았습니다. 별도 Command 추가나 고객용 `front` 전환은 이번 범위에 없습니다.
4. 운영용 계정으로 가입·로그인·글·쪽지·마감 후, Team6 `/tutorial`에서 화면 크기·닫기·API 요청을 확인합니다. 더미 키·로컬 seed 계정은 원격에 넣지 않습니다.
5. Workers Free의 CPU 한도에서 bcrypt 인증 요청의 실행 시간을 확인합니다. 로컬 Wrangler는 배포 환경의 CPU 한도를 입증하지 않으므로, 한도 초과 시 인증 실행 환경을 조정하기 전까지 공개 운영하지 않습니다. 5xx, 401/429 비율과 API 응답 시간을 확인합니다. 서버 오류 로그는 토큰/비밀번호/본문을 포함하지 않습니다. 롤백은 코드만 이전 버전으로 되돌리고 추가 테이블은 유지합니다.

학교 인증, 비밀번호 복구, 신고/차단, 첨부파일, 실시간 소켓, 푸시 알림은 포함하지 않습니다.
