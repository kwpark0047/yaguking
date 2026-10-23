import type { Queryable } from '@/lib/db/types';

/**
 * XP 지급.
 *
 * 멱등 키는 `reason:entityId:userId`로 결정적이다. 같은 이벤트가 두 번
 * 들어와도 원장에 한 번만 쌓인다 (03 문서 §5 승계).
 * 정정·취소는 삭제가 아니라 반대 거래로 처리한다.
 */
export interface GrantInput {
  userId: string;
  reason: string;
  entityId: string;
  amount: number;
  /** KST 일자 기준 지급 횟수 상한. 없으면 무제한. */
  dailyCap?: number;
}

export interface GrantResult {
  granted: boolean;
  amount: number;
  reason: 'ok' | 'duplicate' | 'daily_cap';
}

export async function grantXp(
  tx: Queryable,
  input: GrantInput,
): Promise<GrantResult> {
  const key = `${input.reason}:${input.entityId}:${input.userId}`;

  if (input.dailyCap !== undefined) {
    const [counted] = await tx<{ count: string }[]>`
      select count(*)::text as count
        from public.xp_transactions
       where user_id = ${input.userId}
         and reason = ${input.reason}
         and (created_at at time zone 'Asia/Seoul')::date = public.kst_today()
    `;
    // 경합 시 상한을 1~2건 넘길 수 있다. 멱등 키가 동일 이벤트의 중복은
    // 막으므로 금액 폭주로는 번지지 않는다. 정확한 상한이 필요해지면
    // 사용자별 일일 카운터 테이블로 바꾼다.
    if (Number(counted?.count ?? '0') >= input.dailyCap) {
      return { granted: false, amount: 0, reason: 'daily_cap' };
    }
  }

  const rows = await tx<{ amount: number }[]>`
    insert into public.xp_transactions (user_id, amount, reason, idempotency_key)
    values (${input.userId}, ${input.amount}, ${input.reason}, ${key})
    on conflict (idempotency_key) do nothing
    returning amount
  `;

  if (rows.length === 0) {
    return { granted: false, amount: 0, reason: 'duplicate' };
  }
  return { granted: true, amount: input.amount, reason: 'ok' };
}

/** 누적 XP와 레벨을 갱신한다. 레벨 임계값은 DB 함수가 단일 출처다. */
export async function applyXpTotals(
  tx: Queryable,
  params: {
    userId: string;
    xpDelta: number;
    gamesDelta: number;
    correctDelta: number;
    wrongDelta: number;
  },
): Promise<{ totalXp: number; level: number }> {
  const [row] = await tx<{ total_xp: string; level: number }[]>`
    insert into public.user_private_stats (
      user_id, total_xp, level, total_games, total_correct, total_wrong
    )
    values (
      ${params.userId}, ${params.xpDelta},
      public.level_for_xp(${params.xpDelta}::bigint),
      ${params.gamesDelta}, ${params.correctDelta}, ${params.wrongDelta}
    )
    on conflict (user_id) do update set
      total_xp = user_private_stats.total_xp + excluded.total_xp,
      level = public.level_for_xp(user_private_stats.total_xp + excluded.total_xp),
      total_games = user_private_stats.total_games + excluded.total_games,
      total_correct = user_private_stats.total_correct + excluded.total_correct,
      total_wrong = user_private_stats.total_wrong + excluded.total_wrong,
      updated_at = now()
    returning total_xp::text as total_xp, level
  `;

  return { totalXp: Number(row?.total_xp ?? '0'), level: row?.level ?? 1 };
}
