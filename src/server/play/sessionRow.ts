import { ApiError } from '@/lib/api/errors';
import type { Queryable } from '@/lib/db/types';
import type { AtBatResult, Difficulty, SessionGoal } from '@/lib/engine';
import { findGuestSession, type Owner } from './owner';

export interface PlaySessionRow {
  id: string;
  user_id: string | null;
  guest_session_id: string | null;
  mode: string;
  innings_target: number;
  pa_target: number | null;
  current_inning: number;
  outs: number;
  bases: number;
  runs: number;
  streak: number;
  official: boolean;
  day_key: string;
  status: string;
}

export interface AtBatRow {
  id: string;
  session_id: string;
  sequence: number;
  question_id: string;
  inning: number;
  outs_before: number;
  bases_before: number;
  opened_at: Date;
  deadline_at: Date;
  option_id: string | null;
  submission_id: string | null;
  elapsed_ms: number | null;
  is_correct: boolean | null;
  result: AtBatResult | null;
  upgraded: boolean;
  upgrade_reason: string | null;
  rbi: number;
  bases_after: number | null;
}

export async function loadSessionForUpdate(
  tx: Queryable,
  sessionId: string,
): Promise<PlaySessionRow> {
  const [row] = await tx<PlaySessionRow[]>`
    select id, user_id, guest_session_id, mode, innings_target, pa_target,
           current_inning, outs, bases, runs, streak, official,
           day_key::text as day_key, status
      from public.play_sessions
     where id = ${sessionId}
     for update
  `;
  if (!row) throw new ApiError('NOT_FOUND', '경기를 찾을 수 없습니다.');
  return row;
}

export async function loadSession(
  tx: Queryable,
  sessionId: string,
): Promise<PlaySessionRow> {
  const [row] = await tx<PlaySessionRow[]>`
    select id, user_id, guest_session_id, mode, innings_target, pa_target,
           current_inning, outs, bases, runs, streak, official,
           day_key::text as day_key, status
      from public.play_sessions
     where id = ${sessionId}
  `;
  if (!row) throw new ApiError('NOT_FOUND', '경기를 찾을 수 없습니다.');
  return row;
}

/**
 * 소유권 확인. 남의 경기를 조회·제출할 수 없다.
 * 존재 여부를 흘리지 않도록 소유자가 아니면 NOT_FOUND로 응답한다.
 */
export async function assertOwner(
  tx: Queryable,
  session: PlaySessionRow,
  owner: Owner,
): Promise<void> {
  if (owner.kind === 'user') {
    if (session.user_id === owner.userId) return;
    throw new ApiError('NOT_FOUND', '경기를 찾을 수 없습니다.');
  }

  const guest = await findGuestSession(tx, owner.tokenHash);
  if (guest && session.guest_session_id === guest.id) return;
  throw new ApiError('NOT_FOUND', '경기를 찾을 수 없습니다.');
}

export function goalOf(session: PlaySessionRow): SessionGoal {
  return session.pa_target !== null
    ? { kind: 'pa', pa: session.pa_target }
    : { kind: 'innings', innings: session.innings_target };
}

/**
 * 출제 난이도 계획.
 *
 * 체험은 첫 두 타석을 쉽게 깔아 첫인상을 지키고, 그 뒤부터 섞는다.
 * 공식 경기는 초급 40 / 중급 40 / 고급 20 분포를 노린다 (09 문서 §11).
 */
export function plannedDifficulty(mode: string, sequence: number): Difficulty | null {
  if (mode === 'trial') {
    if (sequence === 1) return 'easy';
    if (sequence === 2) return 'normal';
    return null;
  }

  const roll = Math.random();
  if (roll < 0.4) return 'easy';
  if (roll < 0.8) return 'normal';
  return 'hard';
}
