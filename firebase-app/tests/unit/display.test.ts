import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_TEXT,
  DEFAULT_THEME,
  TEXT_KEY,
  TEXT_SCALE,
  THEME_CHOICES,
  THEME_KEY,
  applyDisplay,
  nextTextSize,
  readTextSize,
  readTheme,
  saveTextSize,
  saveTheme,
} from '@/lib/display/preference';
import { PREMIUM_STYLES, STYLES } from '@/lib/theme/base';

/** 화면 설정 — 글자 크기 소·중·대, 테마(docs/game-look-plan.md). 기기에만, 기본이면 지운다 */
const css = readFileSync(fileURLToPath(new URL('../../src/app/globals.css', import.meta.url)), 'utf8');
let store: Map<string, string>;
let dataset: Record<string, string>;

beforeEach(() => {
  store = new Map();
  dataset = {};
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  };
  (globalThis as Record<string, unknown>).document = { documentElement: { dataset } };
});
afterEach(() => {
  delete (globalThis as Record<string, unknown>).localStorage;
  delete (globalThis as Record<string, unknown>).document;
});

describe('글자 크기', () => {
  it('기본은 중(1.5배), 소 1배·대 2배 — CSS의 --game-scale과 같다', () => {
    expect(DEFAULT_TEXT).toBe('m');
    expect(TEXT_SCALE).toEqual({ s: 1, m: 1.5, l: 2 });
    for (const [size, scale] of Object.entries(TEXT_SCALE)) {
      expect(css).toMatch(new RegExp(`:root\\[data-text='${size}'\\]\\s*\\{\\s*--game-scale:\\s*${scale};`));
    }
    expect(css).toMatch(/:root\s*\{\s*--game-scale:\s*1\.5;/); // 아직 칠하기 전에도 기본
  });

  it('바꾸면 기기에 남고 기본(중)이면 지운다, 이상한 값은 기본', () => {
    expect(readTextSize()).toBe('m');
    saveTextSize('l');
    expect(store.get(TEXT_KEY)).toBe('l');
    expect(dataset.text).toBe('l');
    saveTextSize('m');
    expect(store.has(TEXT_KEY)).toBe(false);
    store.set(TEXT_KEY, 'xxl');
    expect(readTextSize()).toBe('m');
  });

  it('"가가" 단추는 소 → 중 → 대 → 소', () => {
    expect([nextTextSize('s'), nextTextSize('m'), nextTextSize('l')]).toEqual(['m', 'l', 's']);
  });

  it('작은 안내 글자는 16px(1rem)에서 멈춘다', () => {
    expect(css).toMatch(/\.g-meta\s*\{\s*font-size:\s*min\([^;]+,\s*1rem\);/);
  });
});

describe('테마', () => {
  it('기본은 나이트 골드 — <html data-style="gold">, 내 구단이면 data-style을 지운다(구단색은 TeamThemeSync)', () => {
    expect(DEFAULT_THEME).toBe('gold');
    applyDisplay();
    expect(dataset.style).toBe('gold');
    saveTheme('team');
    expect(dataset.style).toBeUndefined();
    expect(store.get(THEME_KEY)).toBe('team');
    saveTheme('contrast');
    expect(dataset.style).toBe('contrast');
    saveTheme('gold');
    expect(store.has(THEME_KEY)).toBe(false);
    store.set(THEME_KEY, 'neon');
    expect(readTheme()).toBe('gold');
  });

  it('고를 수 있는 테마마다 색 표면이 있다(대비는 theme/styles.test.ts가 모두 잰다)', () => {
    for (const choice of THEME_CHOICES) {
      if (choice.value === 'team') continue;
      expect(STYLES, choice.value).toContain(choice.value);
    }
    expect(PREMIUM_STYLES).toEqual(['gold', 'green', 'burgundy', 'stone']);
  });
});
