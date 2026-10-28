import { describe, expect, it } from 'vitest';
import { CHOSUNG_TERMS, chosung, chosungRound } from '@/content/chosung';
import { initialState } from '@/lib/engine';
import {
  GOOD_MS,
  MAX_CHANCES,
  PERFECT_MS,
  ZONE_MARGIN,
  applyChanceBonus,
  bonusOf,
  chanceFor,
  succeeded,
  timingOutcome,
  zonePitch,
  type ChanceRecord,
} from '@/lib/game/chance';
import { pickQuestion, rulesAllowed } from '@/lib/game/match';

/** 찬스 이벤트 1차(docs/fun-plan.md) — 순수 계산 */
let seed = 1;
const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const state = (patch: Partial<ReturnType<typeof initialState>> = {}) => ({ ...initialState(), ...patch });
const atBats = (...results: string[]) => results.map((result) => ({ result })) as never;

describe('언제 나오나 — 최대 2번, 이유마다 한 번', () => {
  it('연속 정답 2개 뒤 타이밍 배팅', () => {
    expect(chanceFor({ state: state(), streak: 2, atBats: atBats('1B', '1B') }, [], random)).toEqual({ kind: 'timing', reason: 'streak' });
    expect(chanceFor({ state: state(), streak: 1, atBats: atBats('1B') }, [], random)).toBeNull();
  });

  it('2아웃이 된 순간(방금 아웃) — 스트라이크 판정이나 초성', () => {
    const chance = chanceFor({ state: state({ outs: 2 }), streak: 0, atBats: atBats('K', 'K') }, [], random);
    expect(chance?.reason).toBe('twoOuts');
    expect(['zone', 'chosung']).toContain(chance?.kind);
    // 2아웃 상태에서 안타를 친 뒤에는 아님(이미 지난 순간)
    expect(chanceFor({ state: state({ outs: 2 }), streak: 1, atBats: atBats('K', 'K', '1B') }, [], random)).toBeNull();
  });

  it('조건이 없으면 4타석 뒤 한 번', () => {
    expect(chanceFor({ state: state({ outs: 1 }), streak: 0, atBats: atBats('1B', 'K', 'BB', '2B') }, [], random)?.reason).toBe('midGame');
    const one: ChanceRecord[] = [{ kind: 'timing', reason: 'streak', outcome: 'miss' }];
    expect(chanceFor({ state: state({ outs: 1 }), streak: 0, atBats: atBats('1B', 'K', 'BB', '2B') }, one, random)).toBeNull();
  });

  it(`최대 ${MAX_CHANCES}번, 같은 이유는 다시 없음, 이닝이 끝났으면 없음`, () => {
    const two: ChanceRecord[] = [
      { kind: 'timing', reason: 'streak', outcome: 'good' },
      { kind: 'zone', reason: 'twoOuts', outcome: 'fail' },
    ];
    expect(chanceFor({ state: state(), streak: 3, atBats: atBats('1B', '1B', '1B') }, two, random)).toBeNull();
    expect(chanceFor({ state: state(), streak: 3, atBats: atBats('1B', '1B', '1B') }, two.slice(0, 1), random)).toBeNull();
    expect(chanceFor({ state: state({ inningEnded: true }), streak: 2, atBats: atBats('1B', '1B') }, [], random)).toBeNull();
  });
});

describe('보너스 — 주자·득점만(아웃·타석 그대로)', () => {
  it('결과 → 보너스', () => {
    expect(bonusOf('timing', 'perfect')).toBe('HR');
    expect(bonusOf('timing', 'good')).toBe('1B');
    expect(bonusOf('timing', 'miss')).toBeNull();
    expect(bonusOf('zone', 'success')).toBe('BB');
    expect(bonusOf('chosung', 'success')).toBe('time');
    expect(bonusOf('chosung', 'skipped')).toBeNull();
    expect(succeeded({ kind: 'zone', reason: 'midGame', outcome: 'success' })).toBe(true);
    expect(succeeded({ kind: 'zone', reason: 'midGame', outcome: 'skipped' })).toBe(false);
  });

  it('보너스 홈런은 주자 모두와 타자 득점, 안타·볼넷은 진루', () => {
    const base = { state: state({ bases: 0b011, runs: 1, outs: 2 }) }; // 1·2루
    const hr = applyChanceBonus(base, 'HR');
    expect(hr.state).toMatchObject({ bases: 0, runs: 4, outs: 2 });
    expect(hr.bonusRuns).toBe(3);
    expect(applyChanceBonus({ state: state({ bases: 0b100 }) }, '1B').state).toMatchObject({ bases: 0b001, runs: 1 });
    expect(applyChanceBonus({ state: state({ bases: 0b111 }) }, 'BB').state.runs).toBe(1); // 밀어내기
  });
});

describe('판정', () => {
  it(`타이밍: ±${PERFECT_MS}ms 퍼펙트, ±${GOOD_MS}ms 굿, 그 밖·못 침은 헛스윙`, () => {
    expect(timingOutcome(0)).toBe('perfect');
    expect(timingOutcome(-PERFECT_MS)).toBe('perfect');
    expect(timingOutcome(GOOD_MS)).toBe('good');
    expect(timingOutcome(GOOD_MS + 1)).toBe('miss');
    expect(timingOutcome(null)).toBe('miss');
  });

  it('스트라이크 존: 판정이 모호하지 않게 경계에서 떨어진 곳에만', () => {
    for (let i = 0; i < 500; i++) {
      const pitch = zonePitch(random);
      const inside = pitch.x >= 0 && pitch.x <= 1 && pitch.y >= 0 && pitch.y <= 1;
      expect(inside).toBe(pitch.strike);
      if (pitch.strike) {
        expect(Math.min(pitch.x, 1 - pitch.x, pitch.y, 1 - pitch.y)).toBeGreaterThanOrEqual(ZONE_MARGIN - 1e-9);
      } else {
        const outBy = Math.max(-pitch.x, pitch.x - 1, -pitch.y, pitch.y - 1);
        expect(outBy).toBeGreaterThanOrEqual(ZONE_MARGIN - 1e-9);
        expect(outBy).toBeLessThanOrEqual(0.3 + 1e-9); // 그림(존 바깥 0.3까지) 안에
      }
    }
  });
});

describe('초성 퀴즈', () => {
  it('초성 계산', () => {
    expect(chosung('홈런')).toBe('ㅎ ㄹ');
    expect(chosung('한국시리즈')).toBe('ㅎ ㄱ ㅅ ㄹ ㅈ');
  });

  it('용어 80개, 겹치지 않음, 힌트 있음', () => {
    expect(CHOSUNG_TERMS).toHaveLength(80);
    expect(new Set(CHOSUNG_TERMS.map(([term]) => term)).size).toBe(80);
    for (const [term, hint] of CHOSUNG_TERMS) {
      expect(term.length, term).toBeGreaterThanOrEqual(2);
      expect(hint.length, term).toBeGreaterThan(3);
      expect(hint, term).not.toContain(term); // 힌트에 정답이 그대로 나오지 않게
    }
  });

  it('한 판: 정답 포함 보기 셋, 서로 다르고 초성도 달라 헷갈리지 않음', () => {
    for (let i = 0; i < 200; i++) {
      const round = chosungRound(random);
      expect(round.options).toHaveLength(3);
      expect(round.options).toContain(round.answer);
      expect(new Set(round.options.map(chosung)).size).toBe(3);
      expect(chosung(round.answer)).toBe(round.initials);
    }
  });
});

describe('규칙 문항은 경기의 절반 이하', () => {
  it('다음 문항을 규칙으로 내도 되나', () => {
    expect(rulesAllowed([])).toBe(false); // 첫 문항은 규칙이 아닌 것부터
    expect(rulesAllowed(['player-stats'])).toBe(true);
    expect(rulesAllowed(['player-stats', 'rules'])).toBe(false);
    expect(rulesAllowed(['player-stats', 'rules', 'korean-series'])).toBe(true);
  });

  it('고를 수 있으면 조건을 먼저, 없으면 조건 없이', () => {
    const q = (id: string, category: string) => ({ id, category, difficulty: 'easy' }) as never;
    const bank = [q('r1', 'rules'), q('r2', 'rules'), q('k1', 'korean-series')];
    const notRules = (question: { category: string }) => question.category !== 'rules';
    expect(pickQuestion(bank, 'easy', new Set(), new Set(), random, notRules)).toMatchObject({ id: 'k1' });
    expect(pickQuestion(bank, 'easy', new Set(['k1']), new Set(), random, notRules)).toMatchObject({ category: 'rules' });
  });
});
