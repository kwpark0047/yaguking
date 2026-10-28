import { advanceRunners } from '@/lib/engine';
import type { Match } from './match';

/**
 * 찬스 이벤트(docs/fun-plan.md) — 문제 사이에 끼우는 3~5초짜리 쉬운 놀이. 순수 계산만(화면은 ChanceEvent).
 *
 * - 한 경기 최대 2번: 연속 정답 2개 뒤(타이밍 배팅), 2아웃이 된 순간(스트라이크 판정·초성 중 하나), 둘 다 없으면 4타석 뒤 한 번
 * - 잘하면 보너스, 못해도 손해 없음(아웃·타석 수는 그대로 — 보너스는 주자·득점만 바꾼다)
 * - 비공식: 기기에서 판정
 */
export type ChanceKind = 'timing' | 'zone' | 'chosung';
export type ChanceReason = 'streak' | 'twoOuts' | 'midGame';
export type ChanceOutcome = 'perfect' | 'good' | 'miss' | 'success' | 'fail' | 'skipped';

export interface ChanceRecord {
  kind: ChanceKind;
  reason: ChanceReason;
  outcome: ChanceOutcome;
}

export const MAX_CHANCES = 2;
export const MID_GAME_AT_BAT = 4;
/** 초성 퀴즈 성공 — 다음 문제 시간 +3초(그만큼 빨리 친 것으로 판정) */
export const TIME_BONUS_MS = 3_000;

export const CHANCE_TITLE: Record<ChanceKind, string> = {
  timing: '타이밍 배팅',
  zone: '스트라이크? 볼?',
  chosung: '초성 퀴즈',
};

export const CHANCE_INTRO: Record<ChanceReason, string> = {
  streak: '찬스! 보너스 타격',
  twoOuts: '마지막 찬스',
  midGame: '찬스 이벤트',
};

/** 방금 타석을 마친 경기에서 찬스 이벤트를 띄울지. 띄우면 종류와 이유 */
export function chanceFor(
  match: Pick<Match, 'state' | 'streak' | 'atBats'>,
  records: readonly ChanceRecord[],
  random: () => number,
): { kind: ChanceKind; reason: ChanceReason } | null {
  if (records.length >= MAX_CHANCES || match.state.inningEnded || match.state.finished) return null;
  const used = new Set(records.map((record) => record.reason));
  const quiz = (): ChanceKind => (random() < 0.5 ? 'zone' : 'chosung');
  if (match.streak >= 2 && !used.has('streak')) return { kind: 'timing', reason: 'streak' };
  const last = match.atBats[match.atBats.length - 1];
  if (match.state.outs === 2 && last?.result === 'K' && !used.has('twoOuts')) return { kind: quiz(), reason: 'twoOuts' };
  if (match.atBats.length === MID_GAME_AT_BAT && records.length === 0) return { kind: quiz(), reason: 'midGame' };
  return null;
}

export type ChanceBonus = 'HR' | '1B' | 'BB' | 'time';

/** 결과 → 보너스: 타이밍 퍼펙트 = 홈런, 굿 = 안타, 스트라이크 판정 3연속 = 볼넷, 초성 정답 = 시간 +3초 */
export function bonusOf(kind: ChanceKind, outcome: ChanceOutcome): ChanceBonus | null {
  if (kind === 'timing') return outcome === 'perfect' ? 'HR' : outcome === 'good' ? '1B' : null;
  if (outcome !== 'success') return null;
  return kind === 'zone' ? 'BB' : 'time';
}

export const succeeded = (record: ChanceRecord) => record.outcome === 'perfect' || record.outcome === 'good' || record.outcome === 'success';

/** 보너스 타격·볼넷을 경기에 반영 — 주자·득점만(아웃·타석 수·연속 정답은 그대로) */
export function applyChanceBonus<T extends Pick<Match, 'state'>>(match: T, bonus: Exclude<ChanceBonus, 'time'>): T & { bonusRuns: number } {
  const advance = advanceRunners(match.state.bases, bonus);
  return {
    ...match,
    state: { ...match.state, bases: advance.bases, runs: match.state.runs + advance.runs },
    bonusRuns: advance.runs,
  };
}

// ── 타이밍 배팅 ───────────────────────────────────────────────────────────────
export const PERFECT_MS = 60;
export const GOOD_MS = 150;

export function timingOutcome(diffMs: number | null): ChanceOutcome {
  if (diffMs === null) return 'miss';
  const off = Math.abs(diffMs);
  return off <= PERFECT_MS ? 'perfect' : off <= GOOD_MS ? 'good' : 'miss';
}

// ── 스트라이크? 볼? ───────────────────────────────────────────────────────────
/**
 * 공 자국 하나. 좌표는 스트라이크 존을 0~1로 본 값(존 밖은 0보다 작거나 1보다 큼).
 * 판정이 모호하지 않게 존 경계에서 0.12 이상 떨어진 곳에만 놓는다.
 */
export interface ZonePitch {
  x: number;
  y: number;
  strike: boolean;
}
export const ZONE_MARGIN = 0.12;

export function zonePitch(random: () => number): ZonePitch {
  const strike = random() < 0.5;
  if (strike) {
    return { x: ZONE_MARGIN + random() * (1 - 2 * ZONE_MARGIN), y: ZONE_MARGIN + random() * (1 - 2 * ZONE_MARGIN), strike };
  }
  // 존 밖: 네 방향 중 하나, 경계에서 0.12~0.3 떨어진 곳(그림 안에 들어오게)
  const side = Math.floor(random() * 4);
  const out = ZONE_MARGIN + random() * 0.18;
  const along = random();
  if (side === 0) return { x: -out, y: along, strike };
  if (side === 1) return { x: 1 + out, y: along, strike };
  if (side === 2) return { x: along, y: -out, strike };
  return { x: along, y: 1 + out, strike };
}

export const ZONE_PITCHES = 3;
export const ZONE_SECONDS = 2;
/** 첫 공은 설명을 읽을 시간까지 */
export const ZONE_FIRST_SECONDS = 3.5;
