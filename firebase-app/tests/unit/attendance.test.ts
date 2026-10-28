import { describe, expect, it } from 'vitest';
import * as job from '../../ops/monthly.mjs';
import {
  ENGAGEMENT_START,
  HIDDEN_NAME,
  MONTH_XP_GOALS,
  POINTS,
  RANKING_TOP,
  attendancePoints,
  daysInMonth,
  engagementOpen,
  kstDayOfMonth,
  kstMonthKey,
  monthGoals,
  needsPrevious,
  previousMonth,
  rankFromHistogram,
  streakOf,
  titlesFor,
} from '@/lib/game/attendance';

/** 매일 출석·월간 등수(docs/engagement-plan.md) — 순수 계산. 화면(attendance.ts)과 운영자 PC 작업(ops/monthly.mjs)이 같은지 */
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

describe('한국 날짜', () => {
  it('이번 달·오늘 — 한국 시간 자정에 바뀐다', () => {
    expect(kstMonthKey(Date.UTC(2026, 10, 30, 14, 59))).toBe('202611'); // 11-30 23:59 KST
    expect(kstMonthKey(Date.UTC(2026, 10, 30, 15, 0))).toBe('202612'); // 12-01 00:00 KST
    expect(kstDayOfMonth(Date.UTC(2026, 10, 30, 15, 0))).toBe(1);
    expect(daysInMonth('202602')).toBe(28);
    expect(daysInMonth('202811')).toBe(30);
    expect(previousMonth('202701')).toBe('202612');
    expect(previousMonth('202611')).toBe('202610');
  });

  it(`시작일(${ENGAGEMENT_START}) 전에는 화면을 열지 않는다`, () => {
    expect(engagementOpen('2026-11-04')).toBe(false);
    expect(engagementOpen('2026-11-05')).toBe(true);
  });
});

describe('출석 포인트', () => {
  it(`하루 ${POINTS.day}, 7일 연속마다 +${POINTS.week}, 개근 +${POINTS.perfect}`, () => {
    expect(attendancePoints([3], '202612')).toMatchObject({ points: 10, days: 1, weeks: 0, perfect: false });
    expect(attendancePoints(range(1, 7), '202612').points).toBe(70 + 30);
    expect(attendancePoints(range(1, 14), '202612').weeks).toBe(2);
    expect(attendancePoints([...range(1, 6), ...range(8, 14)], '202612').weeks).toBe(1); // 하루 빠지면 다시 센다
    const full = attendancePoints(range(1, 31), '202612');
    expect(full).toMatchObject({ days: 31, weeks: 4, perfect: true, points: 310 + 120 + 100 });
  });

  it('어제까지만 센다 — 개근은 그 달을 다 셌을 때만, 이상한 값은 무시', () => {
    expect(attendancePoints(range(1, 20), '202612', 10)).toMatchObject({ days: 10, perfect: false });
    expect(attendancePoints([1, 1, 2, 0, 32, 2.5], '202612').days).toBe(2);
  });

  it('시작한 달은 시작일부터 — 그 전 날짜와 그 전 달은 세지 않는다, 개근도 시작일부터', () => {
    expect(attendancePoints(range(1, 10), '202611').days).toBe(6); // 5~10일
    expect(attendancePoints(range(5, 30), '202611')).toMatchObject({ days: 26, perfect: true });
    expect(attendancePoints(range(1, 31), '202610').points).toBe(0);
  });

  it('운영자 PC 작업(ops/monthly.mjs)과 같은 값 — 무작위 2,000가지', () => {
    let seed = 7;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 2000; i += 1) {
      const month = ['202611', '202612', '202701', '202702'][Math.floor(random() * 4)]!;
      const days = range(1, 31).filter(() => random() < 0.7);
      const through = 1 + Math.floor(random() * 31);
      expect(job.attendancePoints(days, month, through)).toEqual(attendancePoints(days, month, through));
    }
    expect(job.ENGAGEMENT_START).toBe(ENGAGEMENT_START);
    expect(job.POINTS).toEqual(POINTS);
    expect(job.RANKING_TOP).toBe(RANKING_TOP);
    expect(job.HIDDEN_NAME).toBe(HIDDEN_NAME);
    for (const rank of [1, 2, 3, 4, 10, 11]) expect(job.titlesFor(rank, rank === 11)).toEqual(titlesFor(rank, rank === 11));
  });
});

describe('연속 출석(표시용)', () => {
  it('오늘 찍었으면 오늘까지, 아니면 어제까지 — 1일부터 이어지면 지난달까지', () => {
    expect(streakOf([8, 9, 10], 10, null, 30)).toBe(3);
    expect(streakOf([8, 9], 10, null, 30)).toBe(2);
    expect(streakOf([7, 9], 10, null, 30)).toBe(1);
    expect(needsPrevious([8, 9, 10], 10)).toBe(false);
    expect(needsPrevious([1, 2], 3)).toBe(true);
    expect(streakOf([1, 2], 3, [29, 30], 30)).toBe(4);
    expect(streakOf([1, 2], 3, [28, 29], 30)).toBe(2); // 지난달 마지막 날이 빠짐
  });
});

describe('순위·칭호', () => {
  it('같은 포인트는 같은 순위, 0점은 빠진다', () => {
    const ranked = job.rankRows([
      { nickname: '다', points: 100, days: 10 },
      { nickname: '가', points: 100, days: 10 },
      { nickname: '나', points: 50, days: 5 },
      { nickname: '라', points: 0, days: 0 },
    ]);
    expect(ranked.map((row) => [row.nickname, row.rank])).toEqual([['가', 1], ['다', 1], ['나', 3]]);
    expect(job.histogramOf(ranked)).toEqual({ '100': 2, '50': 1 });
  });

  it('내 순위는 분포표로 계산한다(따로 읽지 않음)', () => {
    const histogram = { '100': 2, '50': 1, '30': 4 };
    expect(rankFromHistogram(100, histogram)).toEqual({ rank: 1, participants: 7 });
    expect(rankFromHistogram(30, histogram)).toEqual({ rank: 4, participants: 7 });
    expect(rankFromHistogram(40, histogram).rank).toBe(4); // 분포표 뒤에 찍은 도장 — 사이에 들어간다
    expect(rankFromHistogram(0, histogram).rank).toBeNull();
  });

  it('1위 야구왕, 2~3위 올스타, 4~10위 명예의 전당, 개근은 따로', () => {
    expect(titlesFor(1, true)).toEqual(['king', 'perfect']);
    expect(titlesFor(3, false)).toEqual(['allstar']);
    expect(titlesFor(10, false)).toEqual(['hall']);
    expect(titlesFor(11, false)).toEqual([]);
  });
});

describe('이번 달 연습 목표(비공식)', () => {
  it(`XP ${MONTH_XP_GOALS.join('·')}, 30판`, () => {
    expect(monthGoals(0, 0)).toEqual({ reached: [], next: 500, gamesReached: false });
    expect(monthGoals(1600, 30)).toEqual({ reached: [500, 1500], next: 3000, gamesReached: true });
    expect(monthGoals(5000, 3).next).toBeNull();
  });
});
