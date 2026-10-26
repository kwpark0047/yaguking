import { describe, expect, it } from 'vitest';
import { resolveAtBat } from '@/lib/engine/atBat';

/**
 * 07 문서 §10 TC 1~11 — 타석 판정 경계값.
 * 판정표: 06 문서 §4.2
 */
describe('resolveAtBat — 시간 경계', () => {
  it('TC1: 정답 2000ms는 홈런 (경계 포함)', () => {
    expect(resolveAtBat(true, 2000, 'normal', 0).result).toBe('HR');
  });

  it('TC2: 정답 2001ms는 2루타', () => {
    expect(resolveAtBat(true, 2001, 'normal', 0).result).toBe('2B');
  });

  it('TC3: 정답 4500ms는 2루타 (경계 포함)', () => {
    expect(resolveAtBat(true, 4500, 'normal', 0).result).toBe('2B');
  });

  it('TC4: 정답 4501ms는 단타', () => {
    expect(resolveAtBat(true, 4501, 'normal', 0).result).toBe('1B');
  });

  it('TC5: 정답 8000ms는 단타 (경계 포함)', () => {
    expect(resolveAtBat(true, 8000, 'normal', 0).result).toBe('1B');
  });

  it('TC6: 정답 8001ms는 볼넷', () => {
    expect(resolveAtBat(true, 8001, 'normal', 0).result).toBe('BB');
  });

  it('TC7: 정답 15000ms는 볼넷 (제한시간 경계 포함)', () => {
    expect(resolveAtBat(true, 15000, 'normal', 0).result).toBe('BB');
  });

  it('TC8: 정답이라도 15001ms는 아웃이고 연속이 끊긴다', () => {
    const r = resolveAtBat(true, 15001, 'normal', 4);
    expect(r.result).toBe('K');
    expect(r.streakAfter).toBe(0);
    expect(r.upgraded).toBe(false);
  });

  it('0ms도 홈런으로 처리한다', () => {
    expect(resolveAtBat(true, 0, 'normal', 0).result).toBe('HR');
  });

  it('음수 경과시간은 0으로 보정한다', () => {
    expect(resolveAtBat(true, -50, 'normal', 0).result).toBe('HR');
  });
});

describe('resolveAtBat — 오답', () => {
  it('오답은 시간과 무관하게 아웃', () => {
    expect(resolveAtBat(false, 500, 'hard', 10).result).toBe('K');
  });

  it('오답은 연속 정답을 0으로 초기화한다', () => {
    expect(resolveAtBat(false, 500, 'normal', 7).streakAfter).toBe(0);
  });

  it('오답에는 승급이 적용되지 않는다', () => {
    const r = resolveAtBat(false, 500, 'hard', 9);
    expect(r.upgraded).toBe(false);
    expect(r.upgradeReason).toBeNull();
  });
});

describe('resolveAtBat — 승급 규칙', () => {
  it('TC9: 고급 문항 정답 4500ms는 3루타로 한 단계 상승', () => {
    const r = resolveAtBat(true, 4500, 'hard', 0);
    expect(r.result).toBe('3B');
    expect(r.upgraded).toBe(true);
    expect(r.upgradeReason).toBe('hard');
  });

  it('5연속 달성 시 한 단계 상승하고 사유는 streak', () => {
    const r = resolveAtBat(true, 5000, 'normal', 4);
    expect(r.streakAfter).toBe(5);
    expect(r.result).toBe('2B');
    expect(r.upgradeReason).toBe('streak');
  });

  it('4연속까지는 승급 없음', () => {
    const r = resolveAtBat(true, 5000, 'normal', 3);
    expect(r.result).toBe('1B');
    expect(r.upgraded).toBe(false);
  });

  it('TC10: 고급 + 연속 동시 충족도 승급은 최대 한 단계', () => {
    const r = resolveAtBat(true, 4500, 'hard', 7);
    expect(r.result).toBe('3B');
    expect(r.upgradeReason).toBe('both');
  });

  it('TC11: 이미 홈런이면 더 올라가지 않는다', () => {
    const r = resolveAtBat(true, 1500, 'hard', 9);
    expect(r.result).toBe('HR');
    expect(r.upgraded).toBe(false);
    expect(r.upgradeReason).toBeNull();
  });

  it('볼넷도 한 단계 올라 단타가 된다', () => {
    const r = resolveAtBat(true, 12000, 'hard', 0);
    expect(r.result).toBe('1B');
    expect(r.upgraded).toBe(true);
  });

  it('3루타는 승급 경로로만 발생한다 (기본 판정표에 없음)', () => {
    const baseResults = [0, 2000, 2001, 4500, 4501, 8000, 8001, 15000].map(
      (ms) => resolveAtBat(true, ms, 'normal', 0).result,
    );
    expect(baseResults).not.toContain('3B');
  });
});

describe('resolveAtBat — 연속 정답 카운트', () => {
  it('정답마다 1씩 증가한다', () => {
    expect(resolveAtBat(true, 3000, 'normal', 0).streakAfter).toBe(1);
    expect(resolveAtBat(true, 3000, 'normal', 11).streakAfter).toBe(12);
  });
});
