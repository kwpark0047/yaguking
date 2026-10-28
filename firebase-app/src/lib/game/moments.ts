import type { Match, PlayedAtBat } from './match';

/** 안타로 치는 결과(볼넷은 아님) */
export const HIT_RESULTS: ReadonlySet<string> = new Set(['1B', '2B', '3B', 'HR']);

/**
 * 이번 경기의 첫 안타·첫 홈런인가(docs/motion-plan.md §3 — 경기 기준이라 읽기 0).
 * `match`는 이번 타석까지 들어간 경기, `atBat`은 그 마지막 타석. 첫 홈런이 첫 안타보다 우선한다.
 */
export function firstOfGame(match: Pick<Match, 'atBats'>, atBat: Pick<PlayedAtBat, 'result'>): 'hit' | 'homeRun' | null {
  const before = match.atBats.slice(0, -1);
  if (atBat.result === 'HR' && !before.some((item) => item.result === 'HR')) return 'homeRun';
  if (HIT_RESULTS.has(atBat.result) && !before.some((item) => HIT_RESULTS.has(item.result))) return 'hit';
  return null;
}
