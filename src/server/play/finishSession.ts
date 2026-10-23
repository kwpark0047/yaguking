import type { Queryable } from '@/lib/db/types';
import { buildBoxScore } from '@/lib/engine';
import type { AtBatEntry, AtBatResult, Difficulty } from '@/lib/engine';
import type { FinishDto } from '@/types/api';
import { addBattingStats } from '@/server/stats/batting';
import { applyXpTotals, grantXp } from '@/server/xp/grant';
import type { PlaySessionRow } from './sessionRow';

interface ResolvedAtBatRow {
  id: string;
  sequence: number;
  question_id: string;
  result: AtBatResult;
  rbi: number;
  is_correct: boolean;
  difficulty: Difficulty;
  era_band: number | null;
  difficulty_band: number;
}

/** 공식 집계 반영 여부(recorded)는 체험·비회원에서 false다. */
export type FinishOutcome = FinishDto;

/** P1 XP 이벤트 (06 문서 §9) */
const XP = {
  answerCorrect: 10,
  hardCorrectBonus: 5,
  inningComplete: 20,
  dailyComplete: 30,
} as const;

const INNING_COMPLETE_DAILY_CAP = 5;
const DAILY_COMPLETE_DAILY_CAP = 1;

export async function loadResolvedAtBats(
  tx: Queryable,
  sessionId: string,
): Promise<ResolvedAtBatRow[]> {
  return tx<ResolvedAtBatRow[]>`
    select ab.id, ab.sequence, ab.question_id, ab.result, ab.rbi, ab.is_correct,
           q.difficulty, q.era_band, q.difficulty_band
      from public.at_bats ab
      join public.questions q on q.id = ab.question_id
     where ab.session_id = ${sessionId}
       and ab.result is not null
     order by ab.sequence
  `;
}

export function toEntries(rows: readonly ResolvedAtBatRow[]): AtBatEntry[] {
  return rows.map((r) => ({ result: r.result, rbi: r.rbi }));
}

/**
 * 경기를 확정한다.
 *
 * 세션 상태 · 통산 성적 · 존 집계 · XP 원장 · 누적 XP를 **같은 트랜잭션에서**
 * 처리한다. 어느 하나라도 실패하면 전부 롤백된다 (07 문서 §5.3).
 *
 * 체험(비공식)이나 비회원 경기는 기록만 남기고 공식 집계에 넣지 않는다.
 */
export async function finishSession(
  tx: Queryable,
  session: PlaySessionRow,
  status: 'finished' | 'abandoned' = 'finished',
): Promise<FinishOutcome> {
  const rows = await loadResolvedAtBats(tx, session.id);
  const boxScore = buildBoxScore(toEntries(rows));

  await tx`
    update public.play_sessions
       set status = ${status},
           ended_at = now()
     where id = ${session.id}
  `;

  const isOfficial = session.official && session.user_id !== null;
  if (!isOfficial || !session.user_id) {
    return { boxScore, recorded: false, xpEarned: 0, totalXp: null, level: null };
  }

  const userId = session.user_id;

  // ── 통산 성적 (게스트 승계와 같은 경로를 쓴다) ──────────────────────
  await addBattingStats(tx, userId, boxScore);

  // ── 존 히트맵 집계 (P2에서 화면화, P1은 수집만) ──────────────────────
  const cells = new Map<string, { era: number; diff: number; attempts: number; correct: number }>();
  for (const row of rows) {
    if (row.era_band === null) continue;
    const key = `${row.era_band}:${row.difficulty_band}`;
    const cell =
      cells.get(key) ??
      { era: row.era_band, diff: row.difficulty_band, attempts: 0, correct: 0 };
    cell.attempts += 1;
    if (row.is_correct) cell.correct += 1;
    cells.set(key, cell);
  }

  for (const cell of cells.values()) {
    await tx`
      insert into public.user_zone_cells (
        user_id, era_band, difficulty_band, attempts, correct
      )
      values (${userId}, ${cell.era}, ${cell.diff}, ${cell.attempts}, ${cell.correct})
      on conflict (user_id, era_band, difficulty_band) do update set
        attempts = user_zone_cells.attempts + excluded.attempts,
        correct = user_zone_cells.correct + excluded.correct,
        updated_at = now()
    `;
  }

  // ── XP ──────────────────────────────────────────────────────────────
  let xpEarned = 0;

  for (const row of rows) {
    if (!row.is_correct) continue;

    const correctGrant = await grantXp(tx, {
      userId,
      reason: 'answer_correct',
      entityId: row.id,
      amount: XP.answerCorrect,
    });
    xpEarned += correctGrant.amount;

    if (row.difficulty === 'hard') {
      const hardGrant = await grantXp(tx, {
        userId,
        reason: 'hard_correct_bonus',
        entityId: row.id,
        amount: XP.hardCorrectBonus,
      });
      xpEarned += hardGrant.amount;
    }
  }

  if (status === 'finished') {
    const inningGrant = await grantXp(tx, {
      userId,
      reason: 'inning_complete',
      entityId: session.id,
      amount: XP.inningComplete,
      dailyCap: INNING_COMPLETE_DAILY_CAP,
    });
    xpEarned += inningGrant.amount;

    if (session.mode === 'daily') {
      const dailyGrant = await grantXp(tx, {
        userId,
        reason: 'daily_complete',
        entityId: session.id,
        amount: XP.dailyComplete,
        dailyCap: DAILY_COMPLETE_DAILY_CAP,
      });
      xpEarned += dailyGrant.amount;
    }
  }

  const correctCount = rows.filter((r) => r.is_correct).length;
  const totals = await applyXpTotals(tx, {
    userId,
    xpDelta: xpEarned,
    gamesDelta: status === 'finished' ? 1 : 0,
    correctDelta: correctCount,
    wrongDelta: rows.length - correctCount,
  });

  return {
    boxScore,
    recorded: true,
    xpEarned,
    totalXp: totals.totalXp,
    level: totals.level,
  };
}
