import type { AtBatResult, AtBatVerdict, Difficulty, UpgradeReason } from './types';

/** 제한시간 15초 (06 문서 §4.2) */
export const LIMIT_MS = 15_000;

/** 결과 승급 사다리. HR은 상한이므로 키가 없다. */
const UPGRADE: Partial<Record<AtBatResult, AtBatResult>> = {
  BB: '1B',
  '1B': '2B',
  '2B': '3B',
  '3B': 'HR',
};

/** 5연속 정답부터 승급 대상 */
const STREAK_THRESHOLD = 5;

/**
 * 타석 결과를 판정한다.
 *
 * 모든 인자는 서버가 확정한 값만 사용한다.
 * elapsedMs = received_at - opened_at. 클라이언트가 보낸 경과시간은 신뢰하지 않는다.
 *
 * 판정표 (06 문서 §4.2):
 *   정답 t ≤ 2.0s        → HR
 *   정답 2.0 < t ≤ 4.5s  → 2B
 *   정답 4.5 < t ≤ 8.0s  → 1B
 *   정답 8.0 < t ≤ 15.0s → BB (타수 제외)
 *   오답 또는 15.0s 초과 → K
 *
 * 승급: 고급 문항 정답 또는 5연속 이상 유지 중이면 한 단계 상승.
 *       두 조건을 동시에 충족해도 **최대 한 단계**.
 */
export function resolveAtBat(
  correct: boolean,
  elapsedMs: number,
  difficulty: Difficulty,
  streakBefore: number,
): AtBatVerdict {
  if (!correct || elapsedMs > LIMIT_MS) {
    return { result: 'K', upgraded: false, upgradeReason: null, streakAfter: 0 };
  }

  const t = Math.max(0, elapsedMs);
  const base: AtBatResult =
    t <= 2_000 ? 'HR' : t <= 4_500 ? '2B' : t <= 8_000 ? '1B' : 'BB';

  const streakAfter = streakBefore + 1;

  const byDifficulty = difficulty === 'hard';
  const byStreak = streakAfter >= STREAK_THRESHOLD;
  const upgraded = UPGRADE[base];

  if ((!byDifficulty && !byStreak) || upgraded === undefined) {
    return { result: base, upgraded: false, upgradeReason: null, streakAfter };
  }

  const upgradeReason: UpgradeReason =
    byDifficulty && byStreak ? 'both' : byDifficulty ? 'hard' : 'streak';

  return { result: upgraded, upgraded: true, upgradeReason, streakAfter };
}
