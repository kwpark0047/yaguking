import type { EffectsMode } from './preference';

/**
 * 어떤 순간에 어떤 효과를 얼마나 크게 — 한 표(docs/effects-plan.md §2·§3·§5).
 * 화면은 `celebrate('homeRun')`처럼 이름만 부르고, 여기서 부품·강도·시차를 정한다. 캔버스와 무관한 순수 함수.
 */
export type EffectEvent =
  | { kind: 'homeRun' }
  | { kind: 'upgrade' }
  | { kind: 'gameEnd'; runs: number }
  | { kind: 'tier'; level: number };

export type Palette = 'accent' | 'gold' | 'tier';

export interface EffectStep {
  part: 'firework' | 'confetti' | 'sparkle';
  /** 시작까지 기다리는 시간(ms) */
  at: number;
  /** 화면(또는 기준 요소) 안 가로 위치 0~1 */
  x: number;
  /** 세로 위치 0~1(폭죽은 터지는 높이) */
  y: number;
  count: number;
  palette: Palette;
}

export type Strength = 'none' | 'small' | 'medium' | 'big';

export interface EffectPlan {
  strength: Strength;
  steps: EffectStep[];
}

/** 한 판에 큰 효과는 이만큼까지 — 넘으면 중간으로 낮춘다 */
export const BIG_PER_GAME = 3;
/** 경기 종료 큰 효과(폭죽) 기준 득점 — 실제 분포를 보고 고친다(§8) */
export const BIG_GAME_RUNS = 3;

const step = (part: EffectStep['part'], at: number, x: number, y: number, count: number, palette: Palette): EffectStep => ({
  part,
  at,
  x,
  y,
  count,
  palette,
});

function strengthOf(event: EffectEvent): Strength {
  switch (event.kind) {
    case 'homeRun':
      return 'big';
    case 'upgrade':
      return 'medium';
    case 'gameEnd':
      return event.runs >= BIG_GAME_RUNS ? 'big' : event.runs >= 1 ? 'medium' : 'none';
    case 'tier':
      return event.level >= 4 ? 'big' : event.level === 3 ? 'medium' : 'small';
  }
}

function stepsOf(event: EffectEvent, strength: Strength): EffectStep[] {
  const palette: Palette = event.kind === 'tier' ? (event.level >= 5 ? 'gold' : 'tier') : 'accent';
  if (strength === 'none') return [];
  if (strength === 'small') return [step('sparkle', 0, 0.5, 0.5, 10, palette)];
  if (strength === 'medium') {
    if (event.kind === 'upgrade') return [step('sparkle', 120, 0.5, 0.5, 18, 'gold')];
    return [step('confetti', event.kind === 'gameEnd' ? 600 : 0, 0.5, 0.35, 60, palette)];
  }
  switch (event.kind) {
    case 'homeRun':
      return [step('firework', 0, 0.3, 0.28, 60, palette), step('firework', 250, 0.7, 0.24, 60, palette), step('confetti', 500, 0.5, 0.3, 70, palette)];
    case 'gameEnd':
      return [
        step('firework', 450, 0.18, 0.3, 60, palette),
        step('firework', 650, 0.82, 0.26, 60, palette),
        step('firework', 900, 0.5, 0.22, 70, palette),
        step('confetti', 1100, 0.5, 0, 90, palette),
      ];
    case 'tier': {
      const shots = event.level >= 5 ? [0.25, 0.75, 0.5] : [0.3, 0.7];
      return [...shots.map((x, i) => step('firework', i * 220, x, 0.26, 60, palette)), step('confetti', shots.length * 220, 0.5, 0.3, 70, palette)];
    }
    default:
      return [step('confetti', 0, 0.5, 0.35, 60, palette)];
  }
}

/**
 * 효과 계획. `bigUsed`는 이번 판에 이미 쓴 큰 효과 수.
 * 화면 효과 단계(mode)가 calm이면 폭죽·꽃가루를 빼고 반짝이만, none이면 아무것도 없다.
 */
export function planFor(event: EffectEvent, mode: EffectsMode, bigUsed: number): EffectPlan {
  if (mode === 'none') return { strength: 'none', steps: [] };
  let strength = strengthOf(event);
  if (strength === 'big' && bigUsed >= BIG_PER_GAME) strength = 'medium';
  if (mode === 'calm' && (strength === 'big' || strength === 'medium')) strength = 'small';
  return { strength, steps: stepsOf(event, strength) };
}

/** 한 화면 입자 상한 — 폰·큰 화면, 낮은 사양이면 절반 */
export function particleCap(viewportWidth: number, cores: number | undefined): number {
  const base = viewportWidth < 768 ? 120 : 220;
  return cores !== undefined && cores <= 4 ? Math.floor(base / 2) : base;
}
