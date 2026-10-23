import { afterEach, describe, expect, it, vi } from 'vitest';
import { plannedDifficulty, rollDifficulty } from '@/server/play/sessionRow';

/**
 * 출제 난이도 계획 (09 문서 §11, 10 문서 §1.2.2).
 *
 * 이 테스트가 지키는 것은 **문제은행 구성이 경기 밸런스를 바꾸지 못한다**는
 * 성질이다. 고급은 판정 엔진의 승급 조건이므로, 고급 문항을 많이 넣었다고
 * 출제 비중이 따라 올라가면 안타·홈런이 부풀어 결과 화면 수치가 왜곡된다.
 */

const MODES = ['trial', 'official_3', 'full_9', 'daily'];

/** 재현 가능한 [0,1) 난수. 테스트가 난수 때문에 깜빡이면 안 된다. */
function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 4_294_967_296;
  };
}

function tally(draws: Iterable<string>) {
  const counts = { easy: 0, normal: 0, hard: 0 };
  for (const value of draws) counts[value as keyof typeof counts] += 1;
  return counts;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('rollDifficulty', () => {
  it('40/40/20 경계에서 갈린다', () => {
    expect(rollDifficulty(0)).toBe('easy');
    expect(rollDifficulty(0.399_999)).toBe('easy');
    expect(rollDifficulty(0.4)).toBe('normal');
    expect(rollDifficulty(0.799_999)).toBe('normal');
    expect(rollDifficulty(0.8)).toBe('hard');
    expect(rollDifficulty(0.999_999)).toBe('hard');
  });

  it('구간 경계가 목표 비중과 같다', () => {
    // 경계값을 바꾸면 이 테스트가 먼저 깨진다.
    const counts = tally(
      Array.from({ length: 1000 }, (_, i) => rollDifficulty(i / 1000)),
    );
    expect(counts).toEqual({ easy: 400, normal: 400, hard: 200 });
  });
});

describe('plannedDifficulty', () => {
  it('체험 1타석은 초급, 2타석은 중급으로 고정한다', () => {
    expect(plannedDifficulty('trial', 1)).toBe('easy');
    expect(plannedDifficulty('trial', 2)).toBe('normal');
  });

  it('체험 3타석부터는 난수를 그대로 난이도로 옮긴다', () => {
    for (const [roll, expected] of [
      [0.1, 'easy'],
      [0.5, 'normal'],
      [0.9, 'hard'],
    ] as const) {
      vi.spyOn(Math, 'random').mockReturnValue(roll);
      expect(plannedDifficulty('trial', 3)).toBe(expected);
      vi.restoreAllMocks();
    }
  });

  it('공식 경기는 첫 타석부터 굴린다', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9);
    expect(plannedDifficulty('official_3', 1)).toBe('hard');
    expect(plannedDifficulty('full_9', 2)).toBe('hard');
  });

  /**
   * 회귀 방지. 예전에는 체험 3타석부터 `null`(난이도 무제한)을 돌려줘
   * 문제은행의 난이도 구성이 그대로 출제 분포가 됐다.
   */
  it('어떤 모드·타석에서도 난이도를 비우지 않는다', () => {
    const random = lcg(20_261_024);
    vi.spyOn(Math, 'random').mockImplementation(random);
    for (const mode of MODES) {
      for (let sequence = 1; sequence <= 60; sequence += 1) {
        expect(['easy', 'normal', 'hard']).toContain(plannedDifficulty(mode, sequence));
      }
    }
  });

  it('체험의 3타석 이후 분포가 공식 경기와 같다', () => {
    const DRAWS = 30_000;
    const tolerance = 0.02;

    const random = lcg(1_982_0327);
    vi.spyOn(Math, 'random').mockImplementation(random);

    const trial = tally(
      Array.from({ length: DRAWS }, (_, i) => plannedDifficulty('trial', i + 3)),
    );
    const official = tally(
      Array.from({ length: DRAWS }, (_, i) => plannedDifficulty('official_3', i + 1)),
    );

    for (const counts of [trial, official]) {
      expect(counts.easy / DRAWS).toBeCloseTo(0.4, 1);
      expect(counts.normal / DRAWS).toBeCloseTo(0.4, 1);
      expect(counts.hard / DRAWS).toBeCloseTo(0.2, 1);
    }

    // 두 모드가 같은 분포를 쓰는지 직접 비교한다.
    for (const key of ['easy', 'normal', 'hard'] as const) {
      expect(Math.abs(trial[key] - official[key]) / DRAWS).toBeLessThan(tolerance);
    }
  });

  it('고급 비중이 설계값 20%를 크게 넘지 않는다', () => {
    const DRAWS = 30_000;
    const random = lcg(42);
    vi.spyOn(Math, 'random').mockImplementation(random);

    const counts = tally(
      Array.from({ length: DRAWS }, (_, i) => plannedDifficulty('trial', i + 3)),
    );
    // 문제은행이 고급 39%여도 출제는 20% 근처여야 한다.
    expect(counts.hard / DRAWS).toBeLessThan(0.25);
  });
});
