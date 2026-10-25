import { ApiError } from '@/lib/api/errors';
import { getDb } from '@/lib/db/sql';
import type { SessionGoal } from '@/lib/engine';
import {
  MEMBER_ONLY_MODES,
  OFFICIAL_MODES,
  PLAY_MODE_GOAL,
  type StartSessionInput,
} from '@/lib/schemas/play';
import type { StartSessionDto } from '@/types/api';
import { openAtBat, toPublicAtBat } from './atBatRow';
import { consumeGuestInning, remainingTrials, type Owner } from './owner';
import type { PlaySessionRow } from './sessionRow';

export type StartSessionResult = StartSessionDto;

/**
 * 경기를 시작한다.
 *
 * 게스트는 체험 1이닝만 가능하고 하루 2회로 제한된다. 공식 모드는 회원 전용이며
 * 프로필(온보딩)이 있어야 한다.
 *
 * 세션 생성과 1번 타석 개시를 한 트랜잭션에서 처리한다. 중간에 실패하면
 * 체험 횟수도 함께 롤백된다.
 */
export async function startSession(
  input: StartSessionInput,
  owner: Owner,
): Promise<StartSessionResult> {
  const db = getDb();
  const mode = input.mode;

  if (owner.kind === 'guest' && MEMBER_ONLY_MODES.has(mode)) {
    throw new ApiError('MEMBERSHIP_REQUIRED', '공식 경기는 회원만 이용할 수 있습니다.');
  }

  // SessionGoal로 넓혀 둔다. P1 스키마는 이닝제 모드만 허용하지만 고정 타석
  // 모드(P2)가 같은 코드 경로를 쓰므로 분기를 유지한다.
  const goal: SessionGoal = PLAY_MODE_GOAL[mode];
  const official = OFFICIAL_MODES.has(mode) && owner.kind === 'user';

  return db.begin(async (tx) => {
    let guestSessionId: string | null = null;
    let trialRemaining: number | null = null;

    if (owner.kind === 'guest') {
      const guest = await consumeGuestInning(tx, owner.tokenHash);
      guestSessionId = guest.id;
      trialRemaining = remainingTrials(guest);
    }

    let teamSnapshotId: string | null = null;
    if (owner.kind === 'user') {
      const [profile] = await tx<{ primary_team_id: string | null; age_confirmed: boolean }[]>`
        select primary_team_id, age_confirmed_at is not null as age_confirmed
          from public.profiles where id = ${owner.userId}
      `;
      if (!profile) {
        throw new ApiError(
          'FORBIDDEN',
          '프로필이 없습니다. 닉네임과 대표 구단을 먼저 설정해 주세요.',
        );
      }
      // 만 14세 확인 전에는 회원 기록을 쌓지 않는다(src/server/me/age.ts).
      if (!profile.age_confirmed) throw new ApiError('AGE_CONFIRMATION_REQUIRED');
      teamSnapshotId = profile.primary_team_id;
    }

    const inningsTarget = goal.kind === 'innings' ? goal.innings : 1;
    const paTarget = goal.kind === 'pa' ? goal.pa : null;

    const [session] = await tx<PlaySessionRow[]>`
      insert into public.play_sessions (
        user_id, guest_session_id, mode, innings_target, pa_target,
        official, team_snapshot_id
      )
      values (
        ${owner.kind === 'user' ? owner.userId : null},
        ${guestSessionId},
        ${mode}::public.play_mode,
        ${inningsTarget},
        ${paTarget},
        ${official},
        ${teamSnapshotId}
      )
      returning id, user_id, guest_session_id, mode, innings_target, pa_target,
                current_inning, outs, bases, runs, streak, official,
                day_key::text as day_key, status
    `;
    if (!session) throw new ApiError('INTERNAL_ERROR');

    const opened = await openAtBat(tx, session, {
      sequence: 1,
      inning: 1,
      outs: 0,
      bases: 0,
    });

    // 1번 타석조차 못 만들면 경기를 시작할 수 없다.
    if (!opened) {
      throw new ApiError(
        'INTERNAL_ERROR',
        '출제할 문항이 없습니다. 문제은행을 확인해 주세요.',
      );
    }

    const [nowRow] = await tx<{ now: Date }[]>`select clock_timestamp() as now`;
    const now = nowRow?.now ?? new Date();

    return {
      sessionId: session.id,
      mode: session.mode,
      official: session.official,
      goal: {
        kind: goal.kind,
        target: goal.kind === 'innings' ? goal.innings : goal.pa,
      },
      scoreboard: {
        inning: session.current_inning,
        outs: session.outs,
        bases: session.bases,
        runs: session.runs,
        streak: session.streak,
      },
      atBat: toPublicAtBat(opened.row, opened.question, now),
      guestTrialRemaining: trialRemaining,
    };
  });
}
