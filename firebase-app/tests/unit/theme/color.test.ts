import { describe, expect, it } from 'vitest';
import { contrastRatio } from '@/lib/design/contrast';
import { fitLightness, hexToOklch, oklchToHex, pickInk } from '@/lib/theme/color';

/** 테마 색 계산의 기초. 이게 틀리면 위의 모든 팔레트가 의미를 잃는다. */
describe('OKLCH 변환', () => {
  it('흰색과 검정의 명도', () => {
    expect(hexToOklch('#ffffff').l).toBeCloseTo(1, 3);
    expect(hexToOklch('#000000').l).toBeCloseTo(0, 3);
  });

  it('무채색의 채도는 0에 가깝다', () => {
    expect(hexToOklch('#808080').c).toBeLessThan(0.001);
  });

  it('hex → OKLCH → hex 왕복이 원래 색으로 돌아온다', () => {
    for (const hex of ['#c3105a', '#0b5fd0', '#f26a1b', '#1b2a6b', '#e0a800', '#10251a']) {
      expect(oklchToHex(hexToOklch(hex))).toBe(hex);
    }
  });

  it('sRGB 밖의 색은 채도를 줄여 안으로 넣는다 (색상은 유지)', () => {
    const outside = { l: 0.7, c: 0.4, h: 145 };
    const hex = oklchToHex(outside);
    expect(hex).toMatch(/^#[0-9a-f]{6}$/);
    const back = hexToOklch(hex);
    expect(back.c).toBeLessThan(0.4);
    expect(Math.abs(back.h - 145)).toBeLessThan(3);
  });
});

describe('fitLightness', () => {
  it('이미 기준을 넘으면 손대지 않는다 (원래 색에 가깝게)', () => {
    expect(fitLightness('#ffc53d', { against: ['#161d26'], direction: 'lighter' })).toBe('#ffc53d');
  });

  it('어두운 배경 위에서 밝혀 4.5:1을 맞춘다', () => {
    const fitted = fitLightness('#1b2a6b', { against: ['#161d26', '#0c1117'], direction: 'lighter' });
    expect(contrastRatio(fitted, '#161d26')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(fitted, '#0c1117')).toBeGreaterThanOrEqual(4.5);
  });

  it('밝은 배경 위에서 어둡게 해 4.5:1을 맞춘다', () => {
    const fitted = fitLightness('#ffc53d', { against: ['#ffffff'], direction: 'darker' });
    expect(contrastRatio(fitted, '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });

  it('필요 이상으로 멀리 가지 않는다 (기준 바로 위에서 멈춘다)', () => {
    const fitted = fitLightness('#1b2a6b', { against: ['#161d26'], direction: 'lighter' });
    expect(contrastRatio(fitted, '#161d26')).toBeLessThan(5.2);
  });
});

describe('pickInk', () => {
  it('밝은 배경엔 진한 잉크, 어두운 배경엔 흰색', () => {
    expect(pickInk('#ffc53d', ['#101418', '#ffffff'])).toBe('#101418');
    expect(pickInk('#1b2a6b', ['#101418', '#ffffff'])).toBe('#ffffff');
  });
});
