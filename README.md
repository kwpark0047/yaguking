# 야구왕 (YaguKing)

KBO 기록 퀴즈를 **1이닝 경기**로 플레이하는 웹앱. 문제는 투구, 정답 속도는 타구,
오답은 아웃. 3아웃이면 이닝이 끝나고 **박스스코어**가 남는다.

> **현재 상태 (2026-10-26)**: P1과 그 위의 고도화(테마·화면 스타일, 선수 카드·업적 카드,
> 메인 페이지, 처리방침 초안·보관 기간 파기, 만 14세 확인)가 **로컬에서 구현·검증됐다.**
> 실제 사용자에게는 아직 공개하지 않았다. 운영 배포는 하지 않았다.
>
> 공개를 막는 것 — 모두 사람이 정할 일이다:
> - 이용약관 문안(처리방침은 2026-10-26 시행 — 15 문서)
> - 배포 환경(호스팅·Supabase 리전·도메인) → 11 문서 §2.2
> - KBO 데이터 이용 허락(문의서 초안 13 문서, 미발송)
>
> 성능 목표와 실측은 [PERFORMANCE.md](PERFORMANCE.md)에 구분해 적었다.

## 문서

`KBO_YaguKing_Docs_20261023/` 에 있다. V2가 유효한 기준이며 충돌 시 `06` §11 대조표를 따른다.

| 문서 | 내용 |
|---|---|
| `06_야구왕_V2_고도화_통합기획.md` | 제품 결정 — 게임 루프, 차별화, 전환, 반응형 |
| `07_야구왕_V2_데이터_API_델타.md` | 스키마, 판정 규칙, 엔드포인트 |
| `08_야구왕_V2_UI_UX_화면설계.md` | 화면·상태·와이어프레임·접근성 |
| `09_야구왕_V2_개발실행계획_P1.md` | P1 범위, 구현 순서, 테스트 계획 |
| `01`~`05` | V1 기준선 (일부 대체됨) |

## 시작하기

```bash
npm install
cp .env.example .env.local   # 값을 채운다. .env.local 은 커밋하지 않는다.
npm run dev
```

로컬 DB는 **Docker가 필요하다**.

```bash
npm run db:start   # 로컬 Supabase 스택
npm run db:reset   # 마이그레이션 + seed 적용
```

Docker가 없으면 DB 없이도 다음은 모두 동작한다.

```bash
npm run typecheck
npm run lint
npm run test:unit       # 판정 엔진·토큰 대비·순수 로직
npm run check:sql       # 마이그레이션 SQL 구문 검사 (PostgreSQL 파서)
npm run build
npm run security:check  # 번들 비밀값·정답 컬럼 유출 검사 (빌드 후 실행)
npm run test:e2e        # 공개 화면·접근성·반응형 (DB 필요한 흐름은 자동 skip)
```

## 구조

```text
src/lib/engine/     판정 엔진 — 순수 함수. 규칙의 단일 진실 공급원
src/server/         서버 전용 경계. service_role·DATABASE_URL 사용
supabase/migrations/ 0001~0010
tests/unit/engine/  경계값 테스트 (커버리지 100%)
scripts/check-sql.mjs  Docker 없이 SQL 구문 검증
```

## 지켜야 할 규칙

1. **판정 규칙은 `src/lib/engine`에만 둔다.** SQL이나 클라이언트로 복제하지 않는다.
2. **점수·기록은 서버만 변경한다.** `public` 테이블에 쓰기 RLS 정책이 없고
   `anon`/`authenticated`의 쓰기 권한은 회수되어 있다.
3. **정답은 타석 종료 전 어떤 응답에도 담지 않는다.** 정답은 `private` 스키마에만 있다.
4. `SUPABASE_SERVICE_ROLE_KEY`와 `DATABASE_URL`은 `src/server` 경계 밖에서 쓰지 않는다
   (eslint가 막는다).
5. **KBO 공식 로고·선수 사진·구단 공식 컬러를 사용하지 않는다.** 데이터 사용권 확보
   전까지 자체 작성 문항과 검증된 공개 사실만 쓴다.

## 화면

| 라우트 | 화면 |
|---|---|
| `/` | V01 랜딩 = 1번 타석 (0탭). 진행 중 경기가 있으면 이어서 보여준다 |
| `/play/[sessionId]` | V02 경기 화면. lg에서 사이드바 + 경기 + 정보 패널 3열 |
| `/play/[sessionId]/result` | V03 결과 + 박스스코어 + G1 가입 게이트 |
| `/auth`, `/auth/callback` | 로그인. 콜백이 게스트 기록을 승계한다 |
| `/onboarding` | 닉네임 + 대표 구단 2단계 |
| `/dashboard`, `/modes` | V06 덕아웃, V07 모드 선택 |
| `/me/batting`, `/settings` | V08 내 기록(통산·시즌), V17 설정 |
| `/rankings` | V15 비율(OPS, 최소 50타석) / 볼륨(시즌 득점) |
| `/share/[sessionId]` | 공개 공유 카드 + OG 이미지. 문항·정답 미포함 |
| `/admin/questions` | V19 문항 검수. 권한은 DB로 확인 |

## API (단계 4~5)

| Method | Path | 비회원 |
|---|---|---|
| POST | `/api/v1/play/sessions` | ○ (체험 1일 2이닝) |
| GET | `/api/v1/play/sessions/{id}` | ○ |
| POST | `/api/v1/play/sessions/{id}/at-bats` | ○ |
| POST | `/api/v1/play/sessions/{id}/abandon` | ○ |
| GET | `/api/v1/play/sessions/{id}/box-score` | ○ |

## 테스트

```bash
npm run test:unit            # 단위 (엔진 커버리지 100%)
npm run test                 # 단위 + 통합 (로컬 Supabase 필요)
npm run test:e2e             # Playwright — 공개 화면·접근성·반응형·경기·회원 시나리오
```

테스트는 **`.env.local`을 스스로 읽는다**(`tests/support/loadLocalEnv.ts`). 셸에서
변수를 내보낼 필요가 없다. Next의 환경 로더는 `NODE_ENV=test`에서 `.env.local`을
건너뛰므로 따로 읽는다.

회원 시나리오(`tests/e2e/member.spec.ts`)는 **실제 이메일 링크 로그인**을 한다 —
로컬 Supabase가 보낸 메일을 Mailpit(`http://127.0.0.1:54324`)에서 꺼낸다.
계정은 `e2e-…@example.test`로 만들고 끝나면 지운다.

통합 테스트는 `DATABASE_URL`이 없으면 건너뛴다. **로컬이 아닌 DB를 가리키면
즉시 중단한다** — 테이블을 지우기 때문이다 (`tests/integration/helpers/fixtures.ts`).
