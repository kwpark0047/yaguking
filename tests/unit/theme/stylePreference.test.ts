import { afterEach, describe, expect, it } from 'vitest';
import {
  applyDocumentStyle,
  AUTO_STYLE_SCRIPT,
  explicitStyle,
  parseStylePreference,
  STYLE_COOKIE,
  STYLE_OPTIONS,
} from '@/lib/theme/style';

/**
 * 화면 스타일 선택값 (src/lib/theme/style.ts).
 *
 * 쿠키 하나에 담고 서버에는 남기지 않는다. '자동'이면 기기의 대비 설정을 따른다.
 */

/** 브라우저 없이 돌리기 위한 최소한의 document·window 흉내 */
function fakeBrowser(prefersContrast: boolean) {
  const dataset: Record<string, string> = {};
  const listeners: (() => void)[] = [];
  const media = {
    matches: prefersContrast,
    addEventListener: (_: string, fn: () => void) => listeners.push(fn),
  };
  const browser = {
    document: { documentElement: { dataset }, cookie: '' },
    window: { location: { protocol: 'http:' }, matchMedia: () => media },
    media,
    changeContrast(next: boolean) {
      media.matches = next;
      for (const fn of listeners) fn();
    },
  };
  Object.assign(globalThis, { document: browser.document, window: browser.window });
  return browser;
}

afterEach(() => {
  delete (globalThis as Record<string, unknown>).document;
  delete (globalThis as Record<string, unknown>).window;
});

describe('parseStylePreference', () => {
  it('아는 값만 받고 나머지는 자동', () => {
    expect(parseStylePreference('soft')).toBe('soft');
    expect(parseStylePreference('contrast')).toBe('contrast');
    expect(parseStylePreference('default')).toBe('default');
    expect(parseStylePreference(undefined)).toBe('auto');
    expect(parseStylePreference('')).toBe('auto');
    expect(parseStylePreference('pink')).toBe('auto');
    expect(parseStylePreference('auto')).toBe('auto');
  });

  it('서버가 확정해 그리는 것은 직접 고른 값뿐', () => {
    expect(explicitStyle('auto')).toBeNull();
    expect(explicitStyle('soft')).toBe('soft');
  });

  it('선택지는 자동·기본·부드러운·고대비', () => {
    expect(STYLE_OPTIONS.map((o) => o.label)).toEqual(['자동', '기본', '부드러운', '고대비']);
  });
});

describe('자동 스크립트', () => {
  const run = () => new Function(AUTO_STYLE_SCRIPT)();

  it('기기가 대비 높이기면 고대비를 켠다', () => {
    const b = fakeBrowser(true);
    run();
    expect(b.document.documentElement.dataset.style).toBe('contrast');
  });

  it('기기 설정이 없으면 기본으로 둔다', () => {
    const b = fakeBrowser(false);
    run();
    expect(b.document.documentElement.dataset.style).toBeUndefined();
  });

  it('직접 고른 값이 있으면 손대지 않는다', () => {
    const b = fakeBrowser(true);
    b.document.documentElement.dataset.style = 'soft';
    b.document.documentElement.dataset.styleSource = 'user';
    run();
    expect(b.document.documentElement.dataset.style).toBe('soft');
  });

  it('기기 설정이 바뀌면 따라간다', () => {
    const b = fakeBrowser(false);
    run();
    b.changeContrast(true);
    expect(b.document.documentElement.dataset.style).toBe('contrast');
    b.changeContrast(false);
    expect(b.document.documentElement.dataset.style).toBeUndefined();
  });
});

describe('applyDocumentStyle', () => {
  it('고르면 즉시 화면에 입히고 쿠키에 남긴다', () => {
    const b = fakeBrowser(false);
    applyDocumentStyle('soft');
    expect(b.document.documentElement.dataset.style).toBe('soft');
    expect(b.document.documentElement.dataset.styleSource).toBe('user');
    expect(b.document.cookie).toContain(`${STYLE_COOKIE}=soft`);
    expect(b.document.cookie).toContain('samesite=lax');
  });

  it('직접 고른 뒤에는 기기 설정이 바뀌어도 그대로다', () => {
    const b = fakeBrowser(false);
    new Function(AUTO_STYLE_SCRIPT)();
    applyDocumentStyle('soft');
    b.changeContrast(true);
    expect(b.document.documentElement.dataset.style).toBe('soft');
  });

  it('자동으로 돌리면 쿠키를 지우고 기기 설정을 다시 본다', () => {
    const b = fakeBrowser(true);
    applyDocumentStyle('soft');
    applyDocumentStyle('auto');
    expect(b.document.cookie).toContain('max-age=0');
    expect(b.document.documentElement.dataset.styleSource).toBe('auto');
    expect(b.document.documentElement.dataset.style).toBe('contrast');
  });
});
