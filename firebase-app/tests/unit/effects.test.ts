import { describe, expect, it } from 'vitest';
import { BIG_GAME_RUNS, BIG_PER_GAME, particleCap, planFor } from '@/lib/effects/catalog';
import { isLight } from '@/lib/effects/celebrate';
import { resolveMode } from '@/lib/effects/preference';

/** 축하 효과 1차(docs/effects-plan.md) — 어떤 순간에 얼마나 크게 */
describe('효과 강도', () => {
  const parts = (plan: ReturnType<typeof planFor>) => plan.steps.map((step) => step.part);

  it('홈런은 큰 효과: 폭죽 2발 + 꽃가루', () => {
    const plan = planFor({ kind: 'homeRun' }, 'full', 0);
    expect(plan.strength).toBe('big');
    expect(parts(plan)).toEqual(['firework', 'firework', 'confetti']);
  });

  it(`경기 종료: 0점은 없음, 1~2점은 꽃가루, ${BIG_GAME_RUNS}점 이상은 폭죽`, () => {
    expect(planFor({ kind: 'gameEnd', runs: 0 }, 'full', 0).steps).toEqual([]);
    expect(parts(planFor({ kind: 'gameEnd', runs: 2 }, 'full', 0))).toEqual(['confetti']);
    expect(planFor({ kind: 'gameEnd', runs: BIG_GAME_RUNS }, 'full', 0).strength).toBe('big');
    expect(parts(planFor({ kind: 'gameEnd', runs: 5 }, 'full', 0)).filter((part) => part === 'firework')).toHaveLength(3);
  });

  it('등급: Lv.1~2 반짝이, Lv.3 꽃가루, Lv.4 폭죽 2발, Lv.5 금색 폭죽 3발', () => {
    expect(parts(planFor({ kind: 'tier', level: 1 }, 'full', 0))).toEqual(['sparkle']);
    expect(parts(planFor({ kind: 'tier', level: 3 }, 'full', 0))).toEqual(['confetti']);
    expect(parts(planFor({ kind: 'tier', level: 4 }, 'full', 0)).filter((part) => part === 'firework')).toHaveLength(2);
    const gold = planFor({ kind: 'tier', level: 5 }, 'full', 0);
    expect(gold.steps.filter((step) => step.part === 'firework')).toHaveLength(3);
    expect(gold.steps.every((step) => step.palette === 'gold')).toBe(true);
  });

  it('승급 보너스는 중간: 금색 반짝이', () => {
    const plan = planFor({ kind: 'upgrade' }, 'full', 0);
    expect(plan.strength).toBe('medium');
    expect(plan.steps).toEqual([expect.objectContaining({ part: 'sparkle', palette: 'gold' })]);
  });

  it(`큰 효과는 한 판에 ${BIG_PER_GAME}번까지 — 넘으면 중간으로`, () => {
    expect(planFor({ kind: 'homeRun' }, 'full', BIG_PER_GAME - 1).strength).toBe('big');
    const tired = planFor({ kind: 'homeRun' }, 'full', BIG_PER_GAME);
    expect(tired.strength).toBe('medium');
    expect(parts(tired)).toEqual(['confetti']);
  });

  it('줄이기(calm)는 폭죽·꽃가루 없이 반짝이만, 끄기(none)는 아무것도', () => {
    for (const event of [{ kind: 'homeRun' }, { kind: 'gameEnd', runs: 4 }, { kind: 'tier', level: 5 }] as const) {
      expect(parts(planFor(event, 'calm', 0))).toEqual(['sparkle']);
      expect(planFor(event, 'none', 0).steps).toEqual([]);
    }
  });

  it('입자 상한: 폰 120, 큰 화면 220, 코어 4개 이하면 절반', () => {
    expect(particleCap(360, 8)).toBe(120);
    expect(particleCap(1280, 8)).toBe(220);
    expect(particleCap(1280, 4)).toBe(110);
    expect(particleCap(360, undefined)).toBe(120);
  });
});

describe('화면 효과 단계 = 설정과 기기 상태 중 더 조용한 쪽', () => {
  it('끄기나 기기의 동작 줄이기면 none', () => {
    expect(resolveMode('off', false, false)).toBe('none');
    expect(resolveMode('on', true, false)).toBe('none');
    expect(resolveMode('reduced', true, true)).toBe('none');
  });
  it('줄이기나 고대비면 calm, 아니면 full', () => {
    expect(resolveMode('reduced', false, false)).toBe('calm');
    expect(resolveMode('on', false, true)).toBe('calm');
    expect(resolveMode('on', false, false)).toBe('full');
  });
});

describe('폭죽 색: 밝은 바탕에서는 흰색·파스텔 대신 진한 색', () => {
  it('바탕 밝기를 가른다', () => {
    expect(isLight('rgb(247, 248, 250)')).toBe(true);
    expect(isLight('rgb(255, 255, 255)')).toBe(true);
    expect(isLight('rgb(12, 17, 23)')).toBe(false);
    expect(isLight('rgba(0, 0, 0, 0)')).toBe(false);
  });
});
