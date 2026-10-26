import { advanceRunners } from './runners';
import type { AtBatResult, SessionGoal, SessionState } from './types';

const OUTS_PER_INNING = 3;

export function initialState(): SessionState {
  return {
    inning: 1,
    outs: 0,
    bases: 0,
    runs: 0,
    rbi: 0,
    paPlayed: 0,
    inningEnded: false,
    finished: false,
  };
}

/**
 * 타석 하나를 상태에 적용한다.
 *
 * 3아웃이면 이닝을 넘기고 아웃·주자를 초기화한다.
 * 종료 조건은 목표 종류에 따라 다르다 (07 문서 §5.3).
 *   - innings: 목표 이닝을 초과하면 종료
 *   - pa:      목표 타석 수에 도달하면 종료 (아웃과 무관)
 *
 * 순수 함수다. 입력 상태를 변경하지 않고 새 상태를 돌려준다.
 */
export function applyAtBat(
  state: SessionState,
  result: AtBatResult,
  goal: SessionGoal,
): SessionState {
  const { bases, runs } = advanceRunners(state.bases, result);

  let inning = state.inning;
  let outs = state.outs;
  let nextBases = bases;
  let inningEnded = false;

  if (result === 'K') {
    outs += 1;
    if (outs >= OUTS_PER_INNING) {
      inning += 1;
      outs = 0;
      nextBases = 0;
      inningEnded = true;
    }
  }

  const paPlayed = state.paPlayed + 1;
  const finished =
    goal.kind === 'innings' ? inning > goal.innings : paPlayed >= goal.pa;

  return {
    inning,
    outs,
    bases: nextBases,
    runs: state.runs + runs,
    rbi: runs,
    paPlayed,
    inningEnded,
    finished,
  };
}
