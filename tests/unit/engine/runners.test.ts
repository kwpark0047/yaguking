import { describe, expect, it } from 'vitest';
import { advanceRunners, describeBases, runnerCount } from '@/lib/engine/runners';
import type { AtBatResult } from '@/lib/engine/types';

/**
 * 07 문서 §10 TC 12~14 — 주자 진루.
 * bases 비트마스크: 1 = 1루, 2 = 2루, 4 = 3루
 */
describe('advanceRunners — 볼넷(강제 진루만)', () => {
  it('주자 없음 → 1루', () => {
    expect(advanceRunners(0, 'BB')).toEqual({ bases: 1, runs: 0 });
  });

  it('1루만 → 1·2루', () => {
    expect(advanceRunners(1, 'BB')).toEqual({ bases: 3, runs: 0 });
  });

  it('2루만 → 밀어낼 필요 없음, 1·2루', () => {
    expect(advanceRunners(2, 'BB')).toEqual({ bases: 3, runs: 0 });
  });

  it('3루만 → 3루 주자는 움직이지 않는다', () => {
    expect(advanceRunners(4, 'BB')).toEqual({ bases: 5, runs: 0 });
  });

  it('1·2루 → 만루', () => {
    expect(advanceRunners(3, 'BB')).toEqual({ bases: 7, runs: 0 });
  });

  it('1·3루 → 만루', () => {
    expect(advanceRunners(5, 'BB')).toEqual({ bases: 7, runs: 0 });
  });

  it('TC12: 만루 → 밀어내기 1득점, 만루 유지', () => {
    expect(advanceRunners(7, 'BB')).toEqual({ bases: 7, runs: 1 });
  });
});

describe('advanceRunners — 단타', () => {
  it('주자 없음 → 1루', () => {
    expect(advanceRunners(0, '1B')).toEqual({ bases: 1, runs: 0 });
  });

  it('3루 주자는 득점한다', () => {
    expect(advanceRunners(4, '1B')).toEqual({ bases: 1, runs: 1 });
  });

  it('1루 주자는 2루로', () => {
    expect(advanceRunners(1, '1B')).toEqual({ bases: 3, runs: 0 });
  });

  it('만루 → 1득점, 만루 유지', () => {
    expect(advanceRunners(7, '1B')).toEqual({ bases: 7, runs: 1 });
  });
});

describe('advanceRunners — 2루타', () => {
  it('TC13: 1루 주자만 있을 때 2·3루, 득점 없음', () => {
    expect(advanceRunners(1, '2B')).toEqual({ bases: 6, runs: 0 });
  });

  it('주자 없음 → 2루', () => {
    expect(advanceRunners(0, '2B')).toEqual({ bases: 2, runs: 0 });
  });

  it('2·3루 주자는 모두 득점', () => {
    expect(advanceRunners(6, '2B')).toEqual({ bases: 2, runs: 2 });
  });

  it('만루 → 2득점, 2·3루', () => {
    expect(advanceRunners(7, '2B')).toEqual({ bases: 6, runs: 2 });
  });
});

describe('advanceRunners — 3루타', () => {
  it('주자 전원 득점, 타자는 3루', () => {
    expect(advanceRunners(7, '3B')).toEqual({ bases: 4, runs: 3 });
  });

  it('주자 없음 → 3루, 득점 없음', () => {
    expect(advanceRunners(0, '3B')).toEqual({ bases: 4, runs: 0 });
  });

  it('2·3루 → 2득점', () => {
    expect(advanceRunners(6, '3B')).toEqual({ bases: 4, runs: 2 });
  });
});

describe('advanceRunners — 홈런', () => {
  it('TC14: 만루 홈런은 4득점', () => {
    expect(advanceRunners(7, 'HR')).toEqual({ bases: 0, runs: 4 });
  });

  it('주자 없으면 1득점', () => {
    expect(advanceRunners(0, 'HR')).toEqual({ bases: 0, runs: 1 });
  });

  it('1루 주자 포함 2득점', () => {
    expect(advanceRunners(1, 'HR')).toEqual({ bases: 0, runs: 2 });
  });
});

describe('advanceRunners — 아웃', () => {
  it('주자 상태와 득점이 변하지 않는다', () => {
    expect(advanceRunners(7, 'K')).toEqual({ bases: 7, runs: 0 });
    expect(advanceRunners(0, 'K')).toEqual({ bases: 0, runs: 0 });
    expect(advanceRunners(5, 'K')).toEqual({ bases: 5, runs: 0 });
  });
});

describe('advanceRunners — 전수 불변식', () => {
  const results: AtBatResult[] = ['K', 'BB', '1B', '2B', '3B', 'HR'];

  it('모든 주자 상태 × 모든 결과에서 bases는 0~7, runs는 0~4', () => {
    for (let bases = 0; bases <= 7; bases += 1) {
      for (const result of results) {
        const next = advanceRunners(bases, result);
        expect(next.bases).toBeGreaterThanOrEqual(0);
        expect(next.bases).toBeLessThanOrEqual(7);
        expect(next.runs).toBeGreaterThanOrEqual(0);
        expect(next.runs).toBeLessThanOrEqual(4);
      }
    }
  });

  it('주자 수 + 타자 수가 보존된다 (득점 + 잔류 주자)', () => {
    for (let bases = 0; bases <= 7; bases += 1) {
      for (const result of results) {
        const next = advanceRunners(bases, result);
        const before = runnerCount(bases) + (result === 'K' ? 0 : 1);
        const after = runnerCount(next.bases) + next.runs;
        expect(after).toBe(before);
      }
    }
  });
});

describe('describeBases — 스크린리더 텍스트', () => {
  it('주자 없음', () => {
    expect(describeBases(0)).toBe('주자 없음');
  });

  it('단일 주자', () => {
    expect(describeBases(1)).toBe('주자 1루');
    expect(describeBases(4)).toBe('주자 3루');
  });

  it('복수 주자', () => {
    expect(describeBases(3)).toBe('주자 1·2루');
  });

  it('만루', () => {
    expect(describeBases(7)).toBe('만루');
  });
});
