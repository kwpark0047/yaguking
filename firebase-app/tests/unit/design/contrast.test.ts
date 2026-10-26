import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AA_LARGE, AA_TEXT, contrastRatio, parseHex } from '@/lib/design/contrast';

/**
 * 디자인 토큰 대비 검사 (08 문서 §2.1).
 *
 * axe는 **렌더된 화면만** 본다. 아직 만들지 않은 화면이나 특정 상태에서만
 * 쓰이는 조합은 놓친다. 토큰 자체를 검사해 두면 화면이 늘어도 기준이 유지된다.
 *
 * 값은 globals.css에서 직접 읽는다 — 테스트가 CSS와 따로 놀지 않게 한다.
 */
const css = readFileSync(
  fileURLToPath(new URL('../../../src/app/globals.css', import.meta.url)),
  'utf8',
);

/** `:root { ... }` 같은 블록에서 토큰을 읽는다. */
function readTokens(blockMatcher: RegExp): Record<string, string> {
  const block = css.match(blockMatcher)?.[1] ?? '';
  const tokens: Record<string, string> = {};
  for (const line of block.split('\n')) {
    const match = line.match(/^\s*(--[\w-]+):\s*(#[0-9a-fA-F]{3,6});/);
    if (match?.[1] && match[2]) tokens[match[1]] = match[2];
  }
  return tokens;
}

const dark = readTokens(/:root\s*\{([\s\S]*?)\n\}/);
const light = readTokens(/:root\[data-theme='light'\]\s*\{([\s\S]*?)\n\}/);

describe('토큰 파싱', () => {
  it('다크·라이트 토큰을 모두 읽었다', () => {
    expect(Object.keys(dark).length).toBeGreaterThan(8);
    expect(Object.keys(light).length).toBeGreaterThan(8);
  });

  it('두 테마가 같은 토큰 집합을 정의한다', () => {
    const darkColors = Object.keys(dark).sort();
    const lightColors = Object.keys(light).sort();
    for (const token of lightColors) {
      expect(darkColors, `${token}이 다크 테마에 없습니다`).toContain(token);
    }
  });

  it('모든 값이 유효한 색이다', () => {
    for (const [name, value] of Object.entries({ ...dark, ...light })) {
      expect(() => parseHex(value), `${name}=${value}`).not.toThrow();
    }
  });
});

/**
 * 실제로 쓰는 조합만 검사한다.
 * [전경, 배경, 기준] — 기준은 본문 4.5, 큰 텍스트·UI 경계 3.
 */
const PAIRS: [string, string, number][] = [
  ['--ink-1', '--bg-base', AA_TEXT],
  ['--ink-1', '--bg-card', AA_TEXT],
  ['--ink-1', '--bg-field', AA_TEXT],
  ['--ink-2', '--bg-base', AA_TEXT],
  ['--ink-2', '--bg-card', AA_TEXT],
  ['--ink-2', '--bg-field', AA_TEXT],
  // 주 CTA: 버튼 배경이 accent, 글자가 accent-ink
  ['--accent-ink', '--accent', AA_TEXT],
  // accent를 글자색으로 쓰는 자리 (활성 탭, 강조 문구)
  ['--accent', '--bg-card', AA_TEXT],
  ['--accent', '--bg-base', AA_TEXT],
  ['--on-base', '--bg-card', AA_TEXT],
  ['--on-base', '--bg-field', AA_TEXT],
  ['--out', '--bg-card', AA_TEXT],
  ['--hr', '--bg-card', AA_TEXT],
  // 포커스 링은 UI 경계이므로 3:1
  ['--focus', '--bg-base', AA_LARGE],
  ['--focus', '--bg-card', AA_LARGE],
];

for (const [theme, tokens] of [
  ['다크', dark],
  ['라이트', light],
] as const) {
  describe(`${theme} 테마 대비`, () => {
    for (const [foreground, background, minimum] of PAIRS) {
      it(`${foreground} on ${background} ≥ ${minimum}:1`, () => {
        const fg = tokens[foreground];
        const bg = tokens[background];
        expect(fg, `${foreground} 미정의`).toBeDefined();
        expect(bg, `${background} 미정의`).toBeDefined();

        const ratio = contrastRatio(fg!, bg!);
        expect(
          Number(ratio.toFixed(2)),
          `${theme}: ${fg} on ${bg} = ${ratio.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(minimum);
      });
    }
  });
}

describe('contrastRatio', () => {
  it('흑백은 21:1', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
  });

  it('같은 색은 1:1', () => {
    expect(contrastRatio('#336699', '#336699')).toBeCloseTo(1, 5);
  });

  it('순서를 바꿔도 같다', () => {
    expect(contrastRatio('#123456', '#fedcba')).toBeCloseTo(
      contrastRatio('#fedcba', '#123456'),
      10,
    );
  });

  it('3자리 표기를 지원한다', () => {
    expect(contrastRatio('#fff', '#000')).toBeCloseTo(21, 1);
  });
});
