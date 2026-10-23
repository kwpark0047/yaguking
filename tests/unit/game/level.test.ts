import { describe, expect, it } from 'vitest';
import { LEVEL_NAME, LEVEL_THRESHOLDS, levelName, levelProgress } from '@/lib/game/labels';

/**
 * 레벨 임계값은 V1과 동일해야 한다 (06 문서 §9).
 * 이 테스트가 깨지면 기존 회원의 등급이 움직인다는 뜻이다.
 */
describe('LEVEL_THRESHOLDS', () => {
  it('V1 임계값을 그대로 유지한다', () => {
    expect([...LEVEL_THRESHOLDS]).toEqual([0, 500, 1500, 3500, 7000, 12000, 20000]);
  });

  it('단조 증가한다', () => {
    for (let i = 1; i < LEVEL_THRESHOLDS.length; i += 1) {
      expect(LEVEL_THRESHOLDS[i]!).toBeGreaterThan(LEVEL_THRESHOLDS[i - 1]!);
    }
  });
});

describe('levelName', () => {
  it('1~7에 모두 이름이 있다', () => {
    for (let level = 1; level <= 7; level += 1) {
      expect(LEVEL_NAME[level]).toBeTruthy();
    }
  });

  it('범위를 벗어나면 1레벨 이름으로 떨어진다', () => {
    expect(levelName(0)).toBe('육성선수');
    expect(levelName(99)).toBe('육성선수');
  });

  it('최고 등급은 명예의 전당', () => {
    expect(levelName(7)).toBe('명예의 전당');
  });
});

describe('levelProgress', () => {
  it('구간 시작은 0, 중간은 0.5', () => {
    expect(levelProgress(1, 0)).toBe(0);
    expect(levelProgress(1, 250)).toBe(0.5);
  });

  it('다음 임계값에 닿으면 1', () => {
    expect(levelProgress(1, 500)).toBe(1);
  });

  it('최고 레벨은 항상 1', () => {
    expect(levelProgress(7, 20000)).toBe(1);
    expect(levelProgress(7, 999999)).toBe(1);
  });

  it('0~1을 벗어나지 않는다', () => {
    expect(levelProgress(2, 0)).toBe(0);
    expect(levelProgress(2, 999999)).toBe(1);
  });

  it('Lv.3 구간을 올바르게 계산한다', () => {
    // 1500 ~ 3500 구간의 중간 = 2500
    expect(levelProgress(3, 2500)).toBe(0.5);
  });
});
