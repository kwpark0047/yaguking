import postgres from 'postgres';

/**
 * 게임 쓰기 전용 Postgres 연결.
 *
 * supabase-js에는 다중 문장 트랜잭션이 없다. 타석 제출 1회는 세션 잠금 →
 * 검증 → 정답 조회 → 원장 INSERT → 상태 UPDATE → (종료 시) 성적·XP 반영을
 * 원자적으로 처리해야 하므로 직접 연결을 쓴다 (09 문서 §3.1).
 *
 * 판정 규칙은 src/lib/engine의 순수 함수가 단일 진실 공급원이며 SQL로
 * 복제하지 않는다.
 *
 * 서버 전용 모듈이다. eslint가 클라이언트 컴포넌트에서의 import를 막는다.
 */

type Sql = ReturnType<typeof postgres>;

declare global {
  // 개발 중 HMR로 연결이 누적되지 않게 전역에 캐시한다.
  var __ykSql: Sql | undefined;
}

let cached: Sql | undefined = globalThis.__ykSql;

export function getDb(): Sql {
  if (cached) return cached;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL이 설정되지 않았습니다. .env.example을 참고해 .env.local을 채우세요.',
    );
  }

  const instance = postgres(connectionString, {
    // Supavisor 트랜잭션 모드 풀러는 준비된 구문을 지원하지 않는다.
    prepare: false,
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    idle_timeout: 20,
    connect_timeout: 10,
    // 비밀값이 로그로 새지 않게 쿼리 로깅을 켜지 않는다.
    onnotice: () => {},
  });

  cached = instance;
  if (process.env.NODE_ENV !== 'production') {
    globalThis.__ykSql = instance;
  }
  return instance;
}

/** 테스트에서 연결을 정리한다. */
export async function closeDb(): Promise<void> {
  if (cached) {
    await cached.end({ timeout: 5 });
    cached = undefined;
    globalThis.__ykSql = undefined;
  }
}
