# 운영 런북

09 문서 §10의 롤백 계획을 **실제로 실행해 본 절차**로 옮긴 것이다.
종이 위의 계획과 작동하는 절차는 다르다. 여기 적힌 것은 전부 한 번 이상
돌려 본 명령이다.

---

## 1. 백업

### 무엇을 받는가

| 대상 | 명령 | 용도 |
|---|---|---|
| 스키마 | `supabase db dump --local -f backup-schema.sql` | 구조 복원·비교 |
| 데이터 | `supabase db dump --local --data-only -s public,private -f backup-data.sql` | 내용 복원 |
| **계정** | `pg_dump --data-only --column-inserts -t auth.users -t auth.identities` | **로그인 복원** |
| 역할 | `supabase db dump --local --role-only -f backup-roles.sql` | 권한 복원 |

**`-s public,private`을 빠뜨리면 정답 테이블(`private.question_options`)이
백업되지 않는다.** 기본값은 `public`만 받는다.

운영에서는 `--local` 대신 `--db-url` 또는 `--linked`를 쓴다.

### 계정(auth) 백업 — 반드시 별도로

`supabase db dump`의 `-s`에 `auth`를 통째로 넣으면 안 된다. `auth`에는 27개
테이블이 있고 그중 상당수는 **복구하면 안 되거나 복구할 수 없는 것**이다.

```bash
docker exec supabase_db_<프로젝트> pg_dump -U postgres -d postgres \
  --data-only --column-inserts \
  -t auth.users -t auth.identities > backup-auth.sql
```

운영에서는 `pg_dump "$DATABASE_URL" --data-only --column-inserts -t auth.users -t auth.identities`.

| 테이블 | 백업 | 이유 |
|---|---|---|
| `auth.users` | **한다** | 계정 자체 |
| `auth.identities` | **한다** | 공급자 연결. 없으면 로그인 경로가 끊긴다 |
| `auth.mfa_factors` | MFA 도입 시 | 지금은 쓰지 않는다 |
| `auth.sessions`, `auth.refresh_tokens` | **하지 않는다** | 복구 시점에 이미 지난 세션이고, 오래된 토큰을 되살리는 것은 보안상 바람직하지 않다. 사용자는 다시 로그인한다 |
| `auth.schema_migrations`, `auth.instances` | **하지 않는다** | `db reset` 이 GoTrue 스키마를 새로 만들며 채운다. 덮어쓰면 충돌한다 |

### 계정 백업 파일 취급

`backup-auth.sql`에는 **이메일 주소와 비밀번호 해시**가 들어 있다.
게임 데이터 백업과 **같은 수준으로 다루면 안 된다.**

- 저장 시 암호화, 접근 권한 최소화
- 보관 기간을 짧게 (개인정보 처리방침의 보관 기간과 맞춘다)
- 저장소·이슈 트래커·채팅에 올리지 않는다
- `.gitignore`에 `backup-*.sql`이 포함되어 있는지 확인할 것

### 받은 뒤 반드시 확인할 것

백업은 **복원해 보기 전까지 백업이 아니다.** 최소한 다음은 확인한다.

```bash
# 어떤 테이블이 담겼는지
grep -oE 'INSERT INTO "[a-z_]+"\."[a-z_]+"' backup-data.sql | sort -u
```

`private.question_options`가 목록에 없으면 다시 받는다.

---

## 2. 복구

### 절차

```bash
# 1) 스키마를 깨끗이 되돌린다. seed 는 건너뛴다 —
#    데이터 백업에 기준 데이터가 이미 들어 있어 충돌한다.
supabase db reset --local --no-seed

# 2) 계정을 먼저 복구한다. public.profiles 가 auth.users 를 참조하므로
#    순서를 바꾸면 외래키에서 깨진다.
docker exec -i supabase_db_<프로젝트> \
  psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q < backup-auth.sql

# 3) 애플리케이션 데이터를 적재한다.
docker exec -i supabase_db_<프로젝트> \
  psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q < backup-data.sql
```

운영에서는 `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f <파일>`로 한다.

**순서가 중요하다.** auth → public/private. 반대로 하면
`profiles.id → auth.users(id)` 외래키에서 적재가 통째로 실패한다.

### `--no-seed`가 중요한 이유

`seed.sql`은 구단 10개와 카테고리 5개를 넣는다. 데이터 백업에도 같은 행이
들어 있으므로, seed 를 돌린 뒤 백업을 적재하면 **slug 유니크 제약에서
깨진다.** 복구는 항상 빈 스키마 위에서 한다.

---

## 3. 검증

눈대중으로 "복구된 것 같다"고 판단하지 않는다.

```bash
# 사고 전 (정기적으로 떠 두면 좋다)
node scripts/db-fingerprint.mjs > before.json

# 복구 후
node scripts/db-fingerprint.mjs > after.json
node scripts/db-fingerprint.mjs --compare before.json after.json
```

지문은 테이블 행 수(`auth.users`·`auth.identities` 포함)에 더해 **집계값**
(통산 타석·안타·득점, XP 합계, 게시 문항 수)을 함께 본다. 행 수만 보면
내용이 바뀐 것을 놓친다.

`auth.sessions`와 `auth.refresh_tokens`는 `notRestored`로 따로 찍고
**대조에서 제외한다.** 일부러 복구하지 않는 항목이기 때문이다.

불일치가 있으면 종료 코드 1과 함께 어떤 항목이 몇 개에서 몇 개로 바뀌었는지
출력한다.

### 행 수만으로는 부족하다

지문이 일치해도 **GoTrue가 그 계정을 인정하는지는 별개 문제다.**
계정 복구 뒤에는 반드시 실제 로그인을 확인한다.

```bash
# GoTrue 가 사용자를 보는지
node -e "..." # admin.auth.admin.listUsers()
```

그다음 실제로 매직링크를 받아 로그인까지 해 본다. 행이 있어도 로그인이
안 되면 복구된 것이 아니다.

---

## 4. 리허설 기록

### 2026-10-24 · 로컬 스택

실제로 데이터를 파괴하고 복구했다.

| 단계 | 내용 |
|---|---|
| 사고 전 | 문항 16, 타석 683, 경기 256, 게스트 256, 보기 64 |
| 손상 주입 | `truncate at_bats, play_sessions, guest_sessions cascade` + `delete from questions` |
| 손상 후 | 문항 0, 타석 0, 경기 0, 게시 문항 0 |
| 복구 | `db reset --no-seed` → 데이터 백업 적재 (종료 코드 0) |
| 검증 | **지문 16개 테이블 + 집계 5개 전부 일치** |
| 사후 확인 | 테스트 192건 통과, 앱 200 응답, 타석 원장 683건 복원 |

소요: 약 2분(로컬, 데이터 358KB 기준).

### 2026-10-24 · 계정(auth) 포함 리허설

앞선 리허설에서 **계정이 복구되지 않는다**는 공백이 드러나 절차를 확정하고
다시 수행했다.

| 단계 | 내용 |
|---|---|
| 준비 | 계정 1개(`restore-check@example.test`) + 프로필·통산 성적(10타석 4안타) 연결 |
| 백업 | `auth.users`·`auth.identities` 2.4KB, 애플리케이션 데이터 359KB |
| 손상 | `db reset --no-seed` — DB 전체 유실 시나리오 |
| 손상 후 | `auth.users` 0, 문항 0 |
| 복구 | auth 먼저 → public/private (종료 코드 0) |
| 지문 | **전부 일치** (`auth.users` 1, `auth.identities` 1 포함) |
| **로그인 검증** | 매직링크 요청 → 수신 → 콜백 → **대시보드 진입 성공** |
| 데이터 확인 | 닉네임·대표 구단·통산 성적(.444 / OPS 1.278) 모두 복원 |

행 수가 맞는 것으로 끝내지 않고 실제 로그인까지 확인했다. GoTrue가 계정을
인정하지 않으면 행이 있어도 아무도 들어오지 못한다.

### 이 리허설이 증명하지 않은 것

- **운영 규모의 데이터**에서의 소요 시간. 359KB와 수 GB는 다르다
- **PITR(시점 복구)**. Supabase 유료 플랜 기능이며 여기서는 검증하지 않았다
- **MFA·OAuth 계정**. 검증한 것은 이메일 매직링크 계정 하나다.
  소셜 로그인을 켜면 `auth.identities`의 공급자 행이 늘어나므로 다시 확인해야 한다
- 무중단 복구. 위 절차는 DB를 내렸다 올린다
- **복구 후 사용자는 전원 재로그인해야 한다.** 세션을 복구하지 않기 때문이며,
  이건 결함이 아니라 의도된 선택이다

---

## 5. 마이그레이션 롤백

09 문서 §10의 원칙은 **전진 전용(forward-only)**이다.

- 되돌릴 때는 역방향 마이그레이션을 **새로 작성**한다
- `drop` 이 들어가는 마이그레이션은 적용 전 반드시 백업
- 원장 테이블(`at_bats`, `xp_transactions`)은 어떤 경우에도 삭제하지 않는다 —
  통산 성적이 여기서 재계산된다

실제 사례: `0013`은 중복 문항을 정리하면서 **출제 이력이 있는 문항은 지우지
않고 `retired`로 내렸다.** `at_bats`가 참조하고 있어 FK 가 막기도 하지만,
무엇보다 지난 경기의 결과 화면이 깨진다.

---

## 6. 배포 전 점검

아직 수행하지 않은 항목은 `README.md`의 차단 요인 목록을 따른다.

```bash
npm run typecheck && npm run lint && npm run check:sql
npm run test            # DATABASE_URL 필요
npm run build
npm run security:check  # 빌드 후 실행
npm run test:e2e
npm run load:smoke -- --users 50   # 프로덕션 빌드에 대고
```

## 문제은행 점검과 퍼널 집계

### 노출 전 문항 점검

```bash
npm run content:check
```

정답 위치 쏠림, 게시 조건, 라벨 무결성, 권리 근거, 난이도 분포를 본다.
**오류가 있으면 종료 코드 1이다.** 노출 전에 반드시 0건이어야 한다.

정답이 한 글자에 몰리면 문항을 읽지 않고 찍어도 맞는다. 이 게임은 정답
속도가 타구 결과를 정하므로, 찍기가 통하면 기믹 자체가 무력해진다.
쏠렸다고 나오면 재배치한다. **CSV가 원본이므로 적재에 쓴 CSV를 모두
넘겨야 한다.**

```bash
npm run content:rebalance -- --check data/questions.sample.csv data/questions.rules-a.csv data/questions.rules-a2.csv data/questions.league-rules-2026.csv data/questions.basics-easy.csv data/questions.awards-and-ops.csv data/questions.basics-mix.csv
```

`--check`를 빼면 실제로 적용된다. 본문 해시로 라벨을 정하므로 몇 번 돌려도
결과가 같고, CSV를 새로 적재한 결과와도 일치한다. 보기 행의 id는 바뀌지
않는다 — 지난 경기 기록이 `at_bats.option_id`로 그 id를 들고 있기 때문이다.

### 퍼널 수치

```bash
npm run funnel
npm run funnel -- --days 7
```

**새로 수집하는 것은 없다.** 이미 저장되는 상태 테이블만 읽는다.
못 재는 단계가 있으므로 출력 끝의 "미측정" 항목을 함께 읽을 것
(11 문서 §2.3).

## 레이트 리밋

경기 시작·타석 제출·기록 승계에 주소 기준 리밋이 걸려 있다(11 문서 §3.1).
카운터는 `public.rate_limit_counters`에 있고, IP 원문 대신 HMAC 값만 남는다.

### 배포 시

`TRUSTED_PROXY_COUNT`를 배포 구성에 맞춘다. 프록시 하나면 1(기본),
CDN 뒤 로드밸런서면 2. 맞췄는지는 이렇게 본다.

```bash
for i in 1 2 3 4 5 6 7; do curl -s -o /dev/null -w "%{http_code} " -X POST -H "content-type: application/json" -d '{"mode":"trial"}' https://<배포주소>/api/v1/play/sessions; done
```

일곱 번째가 `429`여야 한다. 이어서 `-H "x-forwarded-for: 1.2.3.4"`를 붙여
값을 바꿔 가며 보내도 계속 `429`여야 한다. 통과한다면 위조가 통하는 것이다.

### E2E를 로컬에서 돌릴 때

Playwright가 직접 띄운 서버는 `RATE_LIMIT=off`로 뜬다. **이미 떠 있는 개발
서버를 재사용하면 그 서버에는 적용되지 않아 429로 깨진다.** 개발 서버를
내리고 돌리거나, 개발 서버를 `RATE_LIMIT=off`로 띄운다.

**통합 테스트와 E2E를 같은 DB에 동시에 돌리지 않는다.** 통합 테스트의
픽스처 문항은 게시 상태라 E2E 경기가 뽑아 갈 수 있다. 정리 함수가 그
타석까지 지우도록 고쳤지만, 동시에 돌리면 측정값 자체가 섞인다.

## 최신 소식 글 올리기

메인 페이지와 `/news`의 글은 `src/content/news.ts`의 `NEWS` 배열이다(관리 화면 없음).

1. 배열 **맨 앞에** 글 하나를 넣는다 — `slug`(영문 소문자·숫자·하이픈), `title`, `date`(KST, `YYYY-MM-DD`), `category`(`업데이트`·`안내`·`이벤트`), `summary`, `body`(문단 배열)
2. `npm run test:unit` — 주소 중복, 날짜 형식, 빈 문단을 `tests/unit/content/news.test.ts`가 잡는다
3. 배포하면 반영된다. 글 주소는 빌드 때 만들어지므로(`generateStaticParams`) 배포 없이는 새 글이 404다

**싣지 않는 것**: KBO 경기 결과·순위·기록. 정식 데이터 이용 허락 전에는 어떤 경로로도 가져오지 않는다(12·13 문서).
