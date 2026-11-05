# 야구왕(YaguKing) 개발 가이드

## 시작하기

### 사전 요구사항

- Node.js >= 20.9.0
- npm 또는 pnpm
- Docker (통합 테스트 및 로컬 Supabase 실행용)

### 설치 및 실행

```bash
# 저장소 클론 후 의존성 설치
npm install

# 환경 변수 파일 생성 (.env.local 예시 참조)
cp .env.example .env.local

# 로컬 Supabase 시작
npm run db:start

# DB 초기화 및 시드 데이터 추가
npm run db:reset
npm run seed:questions

# 개발 서버 시작
npm run dev
```

### 사용 가능한 스크립트

| 스크립트 | 설명 |
|----------|------|
| `npm run dev` | 개발 서버 실행 |
| `npm run build` | 프로덕션 빌드 |
| `npm run start` | 프로덕션 서버 실행 |
| `npm run typecheck` | TypeScript 타입 체크 |
| `npm run lint` | ESLint 실행 |
| `npm run format` | Prettier 포맷팅 |
| `npm run test` | 전체 테스트 (단위 + 통합) |
| `npm run test:unit` | 단위 테스트만 실행 |
| `npm run test:e2e` | E2E 테스트 (Playwright) |
| `npm run db:start` | 로컬 Supabase 시작 |
| `npm run db:stop` | 로컬 Supabase 중지 |
| `npm run db:reset` | DB 마이그레이션 리셋 |
| `npm run seed:questions` | 문제은행 시드 데이터 추가 |
| `npm run security:check` | 보안 점검 스크립트 실행 |

## 코드 컨벤션

### TypeScript

- 엄격 모드 사용 (`strict: true`)
- `any` 타입 사용 지양, 명시적 타입 정의 권장
- 인터페이스는 `interface`, 타입 별칭은 `type` 사용

### ESLint

- Next.js 공식 ESLint 설정 사용
- 서버 전용 모듈은 `eslint`가 클라이언트 컴포넌트에서의 import를 차단함
- `import type` 사용 권장 (타입 전용 import)

### Prettier

- 기본 설정 사용
- `npm run format`으로 일괄 포맷팅

## 게임 로직 수정 시 주의사항

### 판정 엔진 (`src/lib/engine/`)

판정 엔진은 **순수 함수만** 포함해야 합니다. DB, 파일 시스템, 네트워크 의존 금지.

```typescript
// ❌ 안 됨: DB 의존
import { getDb } from '@/lib/db/sql';

// ✅ 됨: 순수 함수
export function resolveAtBat(
  correct: boolean,
  elapsedMs: number,
  difficulty: Difficulty,
  streakBefore: number,
): AtBatVerdict { ... }
```

### 트랜잭션 경계

모든 쓰기 작업은 `db.begin()` 트랜잭션 내에서 처리해야 합니다.

```typescript
return db.begin(async (tx) => {
  // 모든 DB 작업을 tx를 통해 수행
  await tx`...`;
});
```

### 멱등성

중복 실행이 가능해질 수 있는 작업은 멱등 키를 사용하세요.

```typescript
const key = `${reason}:${entityId}:${userId}`;
await tx`
  insert into public.xp_transactions (user_id, amount, reason, idempotency_key)
  values (${userId}, ${amount}, ${reason}, ${key})
  on conflict (idempotency_key) do nothing
`;
```

### IP 주소 처리

클라이언트 IP는 신뢰할 수 없으므로 `clientAddress()` 헬퍼를 사용하세요.

```typescript
import { clientAddress } from '@/server/security/rateLimit';
const address = clientAddress(request);
```

## 테스트 작성 가이드

### 단위 테스트 (`tests/unit/`)

DB 의존 없는 순수 함수 테스트. vitest로 실행.

```typescript
import { describe, it, expect } from 'vitest';
import { resolveAtBat } from '@/lib/engine/atBat';

describe('resolveAtBat', () => {
  it('정답 2초 이내면 HR', () => {
    const verdict = resolveAtBat(true, 1500, 'normal', 0);
    expect(verdict.result).toBe('HR');
  });
});
```

### 통합 테스트 (`tests/integration/`)

Supabase DB 필요. 각 테스트 파일이 `cleanup()`으로 테이블을 비우므로 병렬 실행 불가 (`fileParallelism: false`).

### E2E 테스트

Playwright 사용. 브라우저 환경 필요.

```bash
npm run test:e2e
```

## 성능 측정

연결 풀 변경 후 성능 측정:

```bash
# 로드 스모크 테스트
npm run load:smoke
```

측정 항목:
- 동시 사용자 수
- p95 응답 시간
- 목표: 50명 동시 시 p95 300ms 이내

## 디버깅

### DB 연결 확인

```bash
# 직접 쿼리 테스트
node --env-file-if-exists=.env.local -e "
import { getDb } from './src/lib/db/sql';
const db = getDb();
const [row] = await db\`select 1 as test\`;
console.log(row);
"
```

### 보안 점검

```bash
npm run security:check
```

## 알려진 문제

1. **vitest rolldown 바인딩 오류**: `@rolldown/binding-wasm32-wasi` 패키지가 설치되지 않은 경우 발생. `npm install @rolldown/binding-wasm32-wasi`로 해결.
2. **통합 테스트 실행 불가**: Docker가 설치되지 않은 환경에서는 Supabase 로컬 인스턴스를 시작할 수 없어 통합 테스트를 실행할 수 없음.
3. **E2E 테스트 38건 실패**: 마지막 실행 시 38건 실패. 브라우저 환경 및 DB 설정 필요.
