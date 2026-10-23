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
| 역할 | `supabase db dump --local --role-only -f backup-roles.sql` | 권한 복원 |

**`-s public,private`을 빠뜨리면 정답 테이블(`private.question_options`)이
백업되지 않는다.** 기본값은 `public`만 받는다.

운영에서는 `--local` 대신 `--db-url` 또는 `--linked`를 쓴다.

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

# 2) 데이터를 적재한다. 중간에 실패하면 멈춰야 하므로 ON_ERROR_STOP 을 켠다.
docker exec -i supabase_db_<프로젝트> \
  psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q < backup-data.sql
```

운영에서는 2단계를 `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backup-data.sql`로 한다.

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

지문은 16개 테이블의 행 수에 더해 **집계값**(통산 타석·안타·득점, XP 합계,
게시 문항 수)을 함께 본다. 행 수만 보면 내용이 바뀐 것을 놓친다.

불일치가 있으면 종료 코드 1과 함께 어떤 항목이 몇 개에서 몇 개로 바뀌었는지
출력한다.

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

### 이 리허설이 증명하지 않은 것

- **운영 규모의 데이터**에서의 소요 시간. 358KB와 수 GB는 다르다
- **PITR(시점 복구)**. Supabase 유료 플랜 기능이며 여기서는 검증하지 않았다
- `auth` 스키마 복구. 이번 백업은 `public`·`private`만 받았다 —
  **회원 계정은 복구되지 않는다.** 운영 백업에는 `auth` 포함 여부를 결정해야 한다
- 무중단 복구. 위 절차는 DB를 내렸다 올린다

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
