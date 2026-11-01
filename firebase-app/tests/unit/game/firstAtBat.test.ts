import { describe, expect, it } from 'vitest';
import { LIMIT_MS, resolveAtBat } from '@/lib/engine';
import { TIME_BONUS_MS } from '@/lib/game/chance';
import { FIRST_AT_BAT_EXTRA_MS, extraTimeFor, judgedElapsed } from '@/lib/game/match';

/** 개인 경기 첫 타석 20초, 두 번째부터 15초(운영자 결정 2026-11-01) — 늘어난 5초는 읽는 시간으로 보고 판정에서 뺀다 */
describe('첫 타석 20초', () => {
  it('첫 타석만 5초 더(20초), 두 번째부터 15초 — 초성 퀴즈 보너스는 따로 더해진다', () => {
    expect(LIMIT_MS + extraTimeFor(0)).toBe(20_000);
    expect(LIMIT_MS + extraTimeFor(1)).toBe(15_000);
    expect(LIMIT_MS + extraTimeFor(4)).toBe(15_000);
    expect(LIMIT_MS + extraTimeFor(3, TIME_BONUS_MS)).toBe(18_000);
    expect(FIRST_AT_BAT_EXTRA_MS).toBe(5_000);
  });

  it('판정은 더 받은 시간을 뺀 15초 기준 — 첫 타석 6초 정답 = 1초 = 홈런, 19초 정답 = 14초 = 볼넷', () => {
    const verdict = (elapsed: number) => resolveAtBat(true, judgedElapsed(elapsed, extraTimeFor(0), true), 'easy', 0).result;
    expect(verdict(6_000)).toBe('HR');
    expect(verdict(9_000)).toBe('2B');
    expect(verdict(19_000)).toBe('BB');
    expect(verdict(1_000)).toBe('HR'); // 0 아래로 내려가지 않음
  });

  it('시간을 넘기면(보기 없음) 그대로 삼진, 두 번째 타석은 예전과 같다', () => {
    expect(resolveAtBat(true, judgedElapsed(20_001, extraTimeFor(0), false), 'easy', 0).result).toBe('K');
    expect(judgedElapsed(6_000, extraTimeFor(1), true)).toBe(6_000);
    expect(resolveAtBat(true, judgedElapsed(16_000, extraTimeFor(1), true), 'easy', 0).result).toBe('K');
  });
});
