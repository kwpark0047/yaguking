import { ApiError } from '@/lib/api/errors';
import type { Queryable } from '@/lib/db/types';

/**
 * 경기 소유자.
 *
 * 회원이면 userId, 비회원이면 게스트 토큰 해시다. 서버 함수는 이 값을
 * 인자로 받으므로 Next 런타임(쿠키·헤더)에 의존하지 않는다 — 통합 테스트가
 * DB만으로 돌아간다.
 */
export type Owner =
  | { kind: 'user'; userId: string }
  | { kind: 'guest'; tokenHash: string };

export interface GuestSessionRow {
  id: string;
  token_hash: string;
  day_key: string;
  innings_started: number;
  claimed_by: string | null;
}

/** 체험 1일 상한 (06 문서 §7.2) */
export const GUEST_DAILY_INNING_LIMIT = 2;

/**
 * 게스트 세션 행을 잠그고 오늘 체험 횟수를 1 늘린다.
 *
 * 일자 경계는 KST다. 날짜가 바뀌면 카운터를 1로 리셋한다.
 * 상한 초과면 GUEST_TRIAL_EXHAUSTED.
 *
 * 쿠키 삭제·시크릿 모드로 우회할 수 있다. 이 상한은 **전환 유도 장치**이며
 * 보안 경계가 아니다 (06 문서 출시 게이트 G9).
 */
export async function consumeGuestInning(
  tx: Queryable,
  tokenHash: string,
): Promise<GuestSessionRow> {
  const [existing] = await tx<GuestSessionRow[]>`
    select id, token_hash, day_key::text as day_key, innings_started, claimed_by
      from public.guest_sessions
     where token_hash = ${tokenHash}
     for update
  `;

  if (!existing) {
    const [created] = await tx<GuestSessionRow[]>`
      insert into public.guest_sessions (token_hash, day_key, innings_started)
      values (${tokenHash}, public.kst_today(), 1)
      returning id, token_hash, day_key::text as day_key, innings_started, claimed_by
    `;
    if (!created) throw new ApiError('INTERNAL_ERROR');
    return created;
  }

  const [today] = await tx<{ today: string }[]>`
    select public.kst_today()::text as today
  `;
  const isSameDay = existing.day_key === today?.today;

  if (isSameDay && existing.innings_started >= GUEST_DAILY_INNING_LIMIT) {
    throw new ApiError('GUEST_TRIAL_EXHAUSTED');
  }

  const [updated] = await tx<GuestSessionRow[]>`
    update public.guest_sessions
       set day_key = public.kst_today(),
           innings_started = ${isSameDay ? existing.innings_started + 1 : 1}
     where id = ${existing.id}
    returning id, token_hash, day_key::text as day_key, innings_started, claimed_by
  `;
  if (!updated) throw new ApiError('INTERNAL_ERROR');
  return updated;
}

/** 소유권 확인용 게스트 세션 조회. 체험 횟수를 늘리지 않는다. */
export async function findGuestSession(
  tx: Queryable,
  tokenHash: string,
): Promise<GuestSessionRow | null> {
  const [row] = await tx<GuestSessionRow[]>`
    select id, token_hash, day_key::text as day_key, innings_started, claimed_by
      from public.guest_sessions
     where token_hash = ${tokenHash}
  `;
  return row ?? null;
}

/** 남은 체험 횟수 */
export function remainingTrials(row: GuestSessionRow): number {
  return Math.max(0, GUEST_DAILY_INNING_LIMIT - row.innings_started);
}
