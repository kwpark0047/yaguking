import { ApiError } from '@/lib/api/errors';
import { checkOption, loadPublicQuestion, loadReveal } from '@/lib/db/queries/questions';
import type { SubmitAtBatDto } from '@/types/api';
import { getDb } from '@/lib/db/sql';
import type { Queryable } from '@/lib/db/types';
import { applyAtBat, LIMIT_MS, resolveAtBat } from '@/lib/engine';
import type {
  AtBatResult,
  Difficulty,
  SessionState,
  UpgradeReason,
} from '@/lib/engine';
import type { SubmitAtBatInput } from '@/lib/schemas/play';
import {
  findAtBatBySequence,
  findAtBatBySubmission,
  findPendingAtBat,
  openAtBat,
  toPublicAtBat,
} from './atBatRow';
import { finishSession, type FinishOutcome } from './finishSession';
import type { Owner } from './owner';
import {
  assertOwner,
  goalOf,
  loadSessionForUpdate,
  type AtBatRow,
  type PlaySessionRow,
} from './sessionRow';

export type SubmitAtBatResult = SubmitAtBatDto;

/**
 * 타석 제출.
 *
 * 한 트랜잭션에서 다음을 처리한다 (09 문서 §3.1).
 *   1) 세션 행 잠금 → 동시 제출 경합 차단
 *   2) 멱등 키 · 순번 · 마감시각 검증
 *   3) private 스키마에서 정답 조회
 *   4) 판정(TS 엔진) → 원장 UPDATE
 *   5) 세션 상태 UPDATE
 *   6) 종료 시 성적 · 존 · XP 원자 반영
 *
 * 마감 초과는 **오류를 던지지 않고** 아웃으로 확정한 뒤 outcome으로 알린다.
 * 예외를 던지면 트랜잭션이 롤백되어 "아웃 처리"가 사라지기 때문이다.
 * HTTP 422 변환은 라우트 핸들러가 담당한다.
 */
export async function submitAtBat(
  sessionId: string,
  input: SubmitAtBatInput,
  owner: Owner,
): Promise<SubmitAtBatResult> {
  const db = getDb();

  return db.begin(async (tx) => {
    const session = await loadSessionForUpdate(tx, sessionId);
    await assertOwner(tx, session, owner);

    // ── 멱등 재시도: 같은 submissionId면 저장된 결과를 그대로 돌려준다 ──
    const replay = await findAtBatBySubmission(tx, input.submissionId);
    if (replay) {
      if (replay.session_id !== sessionId) {
        throw new ApiError('VALIDATION_ERROR', '다른 경기의 제출 ID입니다.');
      }
      return buildReplay(tx, session, replay);
    }

    if (session.status !== 'active') {
      throw new ApiError('SESSION_FINISHED');
    }

    const target = await findAtBatBySequence(tx, sessionId, input.sequence);
    if (!target) {
      throw new ApiError('NOT_FOUND', '해당 타석이 없습니다.');
    }

    // 이미 확정된 타석에 다른 제출 ID로 들어온 경우
    if (target.result !== null) {
      throw new ApiError('ALREADY_SUBMITTED', undefined, {
        result: target.result,
        sequence: target.sequence,
      });
    }

    const pending = await findPendingAtBat(tx, sessionId, true);
    if (!pending || pending.sequence !== input.sequence) {
      throw new ApiError('SEQUENCE_MISMATCH', undefined, {
        expectedSequence: pending?.sequence ?? null,
      });
    }

    // ── 경과시간은 DB 시계 기준 ─────────────────────────────────────────
    const [nowRow] = await tx<{ now: Date }[]>`select clock_timestamp() as now`;
    const now = nowRow?.now ?? new Date();
    const elapsedMs = Math.max(0, now.getTime() - target.opened_at.getTime());
    const expired = elapsedMs > LIMIT_MS;

    // ── 보기 소속 확인 + 정오 (정답은 private 스키마에만 있다) ───────────
    let isCorrectOption = false;
    if (input.optionId === undefined) {
      // 보기 없는 제출은 시간초과 확정 요청이다. 마감이 지나지 않았다면 거부한다.
      if (!expired) {
        throw new ApiError('VALIDATION_ERROR', '보기를 선택해 주세요.');
      }
    } else {
      const checked = await checkOption(tx, target.question_id, input.optionId);
      if (checked === null) {
        throw new ApiError('VALIDATION_ERROR', '이 문항의 보기가 아닙니다.');
      }
      isCorrectOption = checked;
    }

    const [questionRow] = await tx<{ difficulty: Difficulty }[]>`
      select difficulty from public.questions where id = ${target.question_id}
    `;
    const difficulty: Difficulty = questionRow?.difficulty ?? 'normal';

    const verdict = resolveAtBat(
      isCorrectOption && !expired,
      elapsedMs,
      difficulty,
      session.streak,
    );

    const state: SessionState = {
      inning: session.current_inning,
      outs: session.outs,
      bases: session.bases,
      runs: session.runs,
      rbi: 0,
      paPlayed: 0,
      inningEnded: false,
      finished: false,
    };
    const nextState = applyAtBat(state, verdict.result, goalOf(session));

    await tx`
      update public.at_bats
         set option_id = ${input.optionId ?? null},
             submission_id = ${input.submissionId},
             submitted_at = ${now},
             elapsed_ms = ${elapsedMs},
             is_correct = ${isCorrectOption},
             result = ${verdict.result}::public.at_bat_result,
             upgraded = ${verdict.upgraded},
             upgrade_reason = ${verdict.upgradeReason},
             rbi = ${nextState.rbi},
             bases_after = ${nextState.bases}
       where id = ${target.id}
    `;

    await tx`
      update public.play_sessions
         set current_inning = ${nextState.inning},
             outs = ${nextState.outs},
             bases = ${nextState.bases},
             runs = ${nextState.runs},
             streak = ${verdict.streakAfter}
       where id = ${sessionId}
    `;

    const updatedSession = { ...session, ...toSessionPatch(nextState, verdict.streakAfter) };

    let next = null;
    let finish: FinishOutcome | null = null;
    let finished = nextState.finished;

    if (!finished) {
      const opened = await openAtBat(tx, updatedSession, {
        sequence: target.sequence + 1,
        inning: nextState.inning,
        outs: nextState.outs,
        bases: nextState.bases,
      });

      if (opened) {
        next = toPublicAtBat(opened.row, opened.question, now);
      } else {
        // 문제은행이 바닥났다. 오류로 막다른 길을 만들지 않고 경기를 마무리한다.
        finished = true;
      }
    }

    if (finished) {
      finish = await finishSession(tx, updatedSession, 'finished');
    }

    const reveal = await loadReveal(tx, target.question_id);

    return {
      outcome: expired ? ('deadline_exceeded' as const) : ('resolved' as const),
      result: verdict.result,
      upgraded: verdict.upgraded,
      upgradeReason: verdict.upgradeReason,
      isCorrect: isCorrectOption,
      elapsedMs,
      rbi: nextState.rbi,
      inningEnded: nextState.inningEnded,
      reveal,
      scoreboard: {
        inning: nextState.inning,
        outs: nextState.outs,
        bases: nextState.bases,
        runs: nextState.runs,
        streak: verdict.streakAfter,
      },
      next,
      finished,
      finish,
    };
  });
}

function toSessionPatch(state: SessionState, streak: number) {
  return {
    current_inning: state.inning,
    outs: state.outs,
    bases: state.bases,
    runs: state.runs,
    streak,
  };
}

/**
 * 재시도 응답.
 *
 * 저장된 타석 판정을 그대로 돌려주고 스코어보드는 **현재 세션 상태**를 쓴다.
 * 이후 타석이 이미 진행된 뒤의 늦은 재시도라면 현재 상태가 더 유용하다.
 */
async function buildReplay(
  tx: Queryable,
  session: PlaySessionRow,
  row: AtBatRow,
): Promise<SubmitAtBatResult> {
  const reveal = await loadReveal(tx, row.question_id);
  const pending = await findPendingAtBat(tx, session.id);

  let next = null;
  if (pending) {
    const question = await loadPublicQuestion(tx, pending.question_id);
    const [nowRow] = await tx<{ now: Date }[]>`select clock_timestamp() as now`;
    next = toPublicAtBat(pending, question, nowRow?.now ?? new Date());
  }

  return {
    outcome: 'replayed',
    result: row.result as AtBatResult,
    upgraded: row.upgraded,
    upgradeReason: row.upgrade_reason as UpgradeReason | null,
    isCorrect: row.is_correct ?? false,
    elapsedMs: row.elapsed_ms ?? 0,
    rbi: row.rbi,
    // 재시도 응답에서는 이닝 교대 연출을 다시 재생하지 않는다.
    inningEnded: false,
    reveal,
    scoreboard: {
      inning: session.current_inning,
      outs: session.outs,
      bases: session.bases,
      runs: session.runs,
      streak: session.streak,
    },
    next,
    finished: session.status !== 'active',
    finish: null,
  };
}
