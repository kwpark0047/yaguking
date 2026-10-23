# 야구왕 (YaguKing)

KBO 기록 퀴즈를 **1이닝 경기**로 플레이하는 웹앱. 문제는 투구, 정답 속도는 타구,
오답은 아웃. 3아웃이면 이닝이 끝나고 **박스스코어**가 남는다.

> **현재 상태: P1 단계 1~9 구현 완료.** 다만 **출시 가능 상태는 아니다.**
>
> 남은 차단 요인:
> - 통합 테스트 34건과 E2E 78건이 **Docker 없이 실행되지 않았다**
> - KBO 데이터 사용권 미확보 → 문항 300개는 콘텐츠 과제로 남아 있다
> - Auth 공급자 자격증명 미확보 → 로그인 왕복이 한 번도 실행되지 않았다
> - 스테이징 배포·백업·롤백 리허설 미수행
>
> 운영 배포는 하지 않았다. 성능 목표와 실측은 [PERFORMANCE.md](PERFORMANCE.md)에
> 구분해 적었다.
>
> ⚠️ **통합 테스트 34건은 작성되었으나 실행되지 않았다.** Docker가 없어 로컬
> Supabase 스택을 띄울 수 없었다. `npm run db:start` 가능한 환경에서 먼저
> 돌려야 한다.

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
npm run test:unit            # 75건, 엔진 커버리지 100%
npm run test:unit -- --coverage
npm run test                 # 통합 테스트 포함 (DATABASE_URL 필요)
npm run test:e2e             # Playwright (단계 6 이후)
```

통합 테스트는 `DATABASE_URL`이 없으면 건너뛴다. **로컬이 아닌 DB를 가리키면
즉시 중단한다** — 테이블을 지우기 때문이다 (`tests/integration/helpers/fixtures.ts`).
