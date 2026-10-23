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

/** 목표 출제 분포 누적 경계: 초급 40 / 중급 40 / 고급 20 (09 문서 §11). */
const EASY_UNTIL = 0.4;
const NORMAL_UNTIL = 0.8;

/** [0,1) 난수를 난이도로 옮긴다. 분포를 눈으로 확인할 수 있게 분리했다. */
export function rollDifficulty(roll: number): Difficulty {
  if (roll < EASY_UNTIL) return 'easy';
  if (roll < NORMAL_UNTIL) return 'normal';
  return 'hard';
}

/**
 * 출제 난이도 계획.
 *
 * 체험은 첫 두 타석을 쉽게 깔아 첫인상을 지키고, 그 뒤부터는 공식 경기와
 * 같은 초급 40 / 중급 40 / 고급 20으로 굴린다 (09 문서 §11).
 *
 * 체험의 3타석 이후에 `null`(난이도 무제한)을 돌려주던 때는 **문제은행의
 * 난이도 구성이 그대로 출제 분포가 됐다.** 고급은 판정 엔진의 승급 조건이라
 * 문항을 채울 때마다 경기 밸런스가 흔들렸다. 공급과 밸런스를 분리한다
 * (10 문서 §1.2.2).
 *
 * 계획한 난이도에 남은 문항이 없을 때 제한을 푸는 것은 호출부의 몫이다
 * (`openAtBat`).
 */
export function plannedDifficulty(mode: string, sequence: number): Difficulty {
  if (mode === 'trial') {
    if (sequence === 1) return 'easy';
    if (sequence === 2) return 'normal';
  }

  return rollDifficulty(Math.random());
}
