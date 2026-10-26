import type { AtBatEntry, BoxScore } from './types';

/**
 * 소수 3자리 반올림.
 * `v_user_batting_rates` 뷰의 `round(..., 3)`과 동일한 결과를 내도록 맞춘다.
 */
const round3 = (n: number): number => Math.round(n * 1000) / 1000;

/**
 * 타석 목록에서 박스스코어를 만든다.
 *
 *   AVG = H / AB
 *   OBP = (H + BB) / PA
 *   SLG = TB / AB
 *   OPS = OBP + SLG
 *
 * 볼넷은 타석(PA)에 포함되지만 타수(AB)에서 제외한다 (06 문서 §4.2).
 * OPS는 SQL 뷰와 같이 **각 지표를 3자리로 반올림한 뒤** 더한다.
 */
export function buildBoxScore(entries: readonly AtBatEntry[]): BoxScore {
  let singles = 0;
  let d2 = 0;
  let d3 = 0;
  let hr = 0;
  let bb = 0;
  let so = 0;
  let r = 0;

  for (const e of entries) {
    switch (e.result) {
      case '1B':
        singles += 1;
        break;
      case '2B':
        d2 += 1;
        break;
      case '3B':
        d3 += 1;
        break;
      case 'HR':
        hr += 1;
        break;
      case 'BB':
        bb += 1;
        break;
      case 'K':
        so += 1;
        break;
    }
    r += e.rbi;
  }

  const pa = entries.length;
  const ab = pa - bb;
  const h = singles + d2 + d3 + hr;
  const tb = singles + 2 * d2 + 3 * d3 + 4 * hr;

  const avg = ab > 0 ? round3(h / ab) : null;
  const obp = pa > 0 ? round3((h + bb) / pa) : null;
  const slg = ab > 0 ? round3(tb / ab) : null;
  const ops = obp !== null && slg !== null ? round3(obp + slg) : null;

  return { pa, ab, h, singles, d2, d3, hr, bb, so, tb, r, avg, obp, slg, ops };
}

/**
 * 야구 표기로 포맷한다. 1 미만은 앞의 0을 뗀다.
 *   0.327 → ".327"   1.25 → "1.250"   null → "-"
 */
export function formatRate(value: number | null): string {
  if (value === null) return '-';
  const fixed = value.toFixed(3);
  return Math.abs(value) < 1 ? fixed.replace(/^(-?)0/, '$1') : fixed;
}
