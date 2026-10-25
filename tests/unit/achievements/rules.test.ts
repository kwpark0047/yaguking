import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENTS,
  BIG_INNING_RUNS,
  judgeAchievements,
  type LedgerAtBat,
} from '@/lib/achievements/rules';
import type { AtBatResult, UpgradeReason } from '@/lib/engine';
import { MAX_LEVEL } from '@/lib/theme/tiers';

/** 업적 판정 (14 문서 §5.2). 원장만으로 계산하는 순수 함수다. */

let clock = Date.UTC(2026, 9, 1);

function atBat(
  result: AtBatResult,
  options: {
    session?: string;
    inning?: number;
    rbi?: number;
    upgrade?: UpgradeReason | null;
    at?: Date;
  } = {},
): LedgerAtBat {
  clock += 60_000;
  return {
    sessionId: options.session ?? 's1',
    sequence: clock / 60_000,
    inning: options.inning ?? 1,
    result,
    rbi: options.rbi ?? 0,
    upgradeReason: options.upgrade ?? null,
    submittedAt: options.at ?? new Date(clock),
  };
}

describe('업적 정의', () => {
  it('id가 겹치지 않고 희귀도 순서다', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    const rarities = ACHIEVEMENTS.map((a) => a.rarity);
    expect(rarities).toEqual([...rarities].sort((a, b) => a - b));
  });

  it('희귀도는 등급 프레임 범위(1~7) 안이다', () => {
    for (const a of ACHIEVEMENTS) {
      expect(a.rarity).toBeGreaterThanOrEqual(1);
      expect(a.rarity).toBeLessThanOrEqual(MAX_LEVEL);
    }
  });
});

describe('judgeAchievements', () => {
  it('기록이 없으면 아무것도 얻지 않는다', () => {
    expect(judgeAchievements([], 1).size).toBe(0);
  });

  it('볼넷·삼진은 안타가 아니다', () => {
    const earned = judgeAchievements([atBat('BB'), atBat('K')], 1);
    expect(earned.has('first_hit')).toBe(false);
  });

  it('첫 안타는 처음 친 안타의 시각이다', () => {
    const first = atBat('2B');
    const earned = judgeAchievements([first, atBat('1B')], 1);
    expect(earned.get('first_hit')?.at).toEqual(first.submittedAt);
  });

  it('홈런은 첫 안타이자 첫 홈런이다', () => {
    const hr = atBat('HR');
    const earned = judgeAchievements([hr], 1);
    expect(earned.get('first_hit')?.at).toEqual(hr.submittedAt);
    expect(earned.get('first_hr')?.at).toEqual(hr.submittedAt);
  });

  it('입력 순서가 아니라 시간순으로 처음을 고른다', () => {
    const early = atBat('HR', { at: new Date(Date.UTC(2026, 0, 1)) });
    const late = atBat('HR', { at: new Date(Date.UTC(2026, 5, 1)) });
    expect(judgeAchievements([late, early], 1).get('first_hr')?.at).toEqual(early.submittedAt);
  });

  it.each<[UpgradeReason, boolean]>([
    ['streak', true],
    ['both', true],
    ['hard', false],
  ])('승급 사유 %s → 5연속 정답 %s', (reason, expected) => {
    const earned = judgeAchievements([atBat('2B', { upgrade: reason })], 1);
    expect(earned.has('streak_bonus')).toBe(expected);
  });

  describe('사이클링 히트', () => {
    it('한 경기에서 네 가지 안타를 모두 치면 얻는다 — 마지막 안타의 시각', () => {
      const hits = [atBat('1B'), atBat('K'), atBat('2B'), atBat('3B'), atBat('HR')];
      expect(judgeAchievements(hits, 1).get('cycle')?.at).toEqual(hits[4]!.submittedAt);
    });

    it('여러 경기에 나눠 친 것은 사이클이 아니다', () => {
      const hits = [
        atBat('1B', { session: 'a' }),
        atBat('2B', { session: 'a' }),
        atBat('3B', { session: 'b' }),
        atBat('HR', { session: 'b' }),
      ];
      expect(judgeAchievements(hits, 1).has('cycle')).toBe(false);
    });

    it('같은 안타를 여러 번 쳐도 종류가 모자라면 아니다', () => {
      const hits = [atBat('1B'), atBat('1B'), atBat('2B'), atBat('HR'), atBat('HR')];
      expect(judgeAchievements(hits, 1).has('cycle')).toBe(false);
    });
  });

  describe('빅 이닝', () => {
    it(`한 이닝 타점 합이 ${BIG_INNING_RUNS}점에 닿는 타석에서 얻는다`, () => {
      const plays = [atBat('HR', { rbi: 3 }), atBat('1B', { rbi: 1 }), atBat('2B', { rbi: 1 })];
      expect(judgeAchievements(plays, 1).get('big_inning')?.at).toEqual(plays[2]!.submittedAt);
    });

    it('한 점 모자라면 아니다', () => {
      const plays = [atBat('HR', { rbi: 3 }), atBat('1B', { rbi: 1 })];
      expect(judgeAchievements(plays, 1).has('big_inning')).toBe(false);
    });

    it('다른 이닝의 득점은 더하지 않는다', () => {
      const plays = [
        atBat('HR', { inning: 1, rbi: 3 }),
        atBat('HR', { inning: 2, rbi: 3 }),
      ];
      expect(judgeAchievements(plays, 1).has('big_inning')).toBe(false);
    });

    it('다른 경기의 같은 이닝도 더하지 않는다', () => {
      const plays = [
        atBat('HR', { session: 'a', rbi: 3 }),
        atBat('HR', { session: 'b', rbi: 3 }),
      ];
      expect(judgeAchievements(plays, 1).has('big_inning')).toBe(false);
    });
  });

  it('처음 조건을 채운 타석의 경기를 함께 알려 준다 — 결과 화면의 새 카드 기준', () => {
    const plays = [
      atBat('1B', { session: 'a' }),
      atBat('HR', { session: 'b' }),
      atBat('HR', { session: 'c' }),
    ];
    const earned = judgeAchievements(plays, 1);
    expect(earned.get('first_hit')?.sessionId).toBe('a');
    // 경기 c의 홈런은 두 번째라 c의 새 카드가 아니다
    expect(earned.get('first_hr')?.sessionId).toBe('b');
  });

  describe('명예의 전당', () => {
    it('Lv.7이면 얻고, 시각은 지어내지 않는다', () => {
      const earned = judgeAchievements([], 7);
      expect(earned.has('hall_of_fame')).toBe(true);
      expect(earned.get('hall_of_fame')).toEqual({ at: null, sessionId: null });
    });

    it('Lv.6이면 아니다', () => {
      expect(judgeAchievements([], 6).has('hall_of_fame')).toBe(false);
    });
  });
});
