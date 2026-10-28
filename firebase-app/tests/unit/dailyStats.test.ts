import { describe, expect, it } from 'vitest';
import { GUEST_BURST_PER_HOUR, guestBurst, kstDay, summarizeDay } from '../../ops/admin.mjs';

/** 매일 밤 통계 요약·비회원 급증 감시(ops/admin.mjs) — 순수 계산 */
const HOUR = 3_600_000;

describe('하루 요약', () => {
  const at = Date.parse('2026-10-27T15:30:00+09:00');
  const atBat = (questionId: string, correct: boolean, result = correct ? '1B' : 'K') => ({ questionId, correct, result });

  it('한국 날짜 경계와 키', () => {
    expect(kstDay(Date.parse('2026-10-28T00:10:00+09:00'))).toEqual({ start: Date.parse('2026-10-28T00:00:00+09:00'), key: '20261028' });
    expect(kstDay(Date.parse('2026-10-27T23:59:00+09:00')).key).toBe('20261027');
  });

  it('경기 수·회원/비회원·평균 득점·정답률·홈런 비율·시간대·문항별 [나온, 맞힌]', () => {
    const games = [
      { uid: 'm1', mode: 'practice', runs: 2, createdAt: at, atBats: [atBat('q1', true, 'HR'), atBat('q2', false)] },
      { uid: 'g1', mode: 'practice', runs: 0, createdAt: at + HOUR, atBats: [atBat('q2', false), atBat('q3', true)] },
      { uid: 'm1', mode: 'levelTest', runs: 0, createdAt: at, atBats: [] },
    ];
    const day = summarizeDay(games, new Set(['m1']));
    expect(day).toMatchObject({ games: 3, levelTests: 1, practice: 2, memberGames: 2, guestGames: 1, players: 2, averageRuns: 0.7, atBats: 4 });
    expect(day.correctRate).toBe(0.5);
    expect(day.homeRunRate).toBe(0.25);
    expect(day.hourly[15]).toBe(2);
    expect(day.hourly[16]).toBe(1);
    expect(day.questions).toEqual({ q1: [1, 1], q2: [2, 0], q3: [1, 1] });
  });

  it('경기가 없으면 0', () => {
    expect(summarizeDay([], new Set())).toMatchObject({ games: 0, averageRuns: 0, correctRate: 0, players: 0 });
  });
});

describe('비회원 급증 감시', () => {
  const now = Date.parse('2026-10-28T12:00:00+09:00');
  it('최근 24시간 새 비회원 수와 가장 많이 생긴 한 시간', () => {
    const times = [now - 2 * HOUR, now - 2 * HOUR + 60_000, now - 5 * HOUR, now - 30 * HOUR];
    expect(guestBurst(times, now)).toEqual({ guestsNew24h: 3, guestsPeakHour: 2 });
    expect(guestBurst([], now)).toEqual({ guestsNew24h: 0, guestsPeakHour: 0 });
  });
  it(`한 시간 ${GUEST_BURST_PER_HOUR}개 넘으면 급증`, () => {
    const burst = Array.from({ length: GUEST_BURST_PER_HOUR + 1 }, (_, i) => now - HOUR / 2 + i);
    expect(guestBurst(burst, now).guestsPeakHour).toBeGreaterThan(GUEST_BURST_PER_HOUR);
  });
});
