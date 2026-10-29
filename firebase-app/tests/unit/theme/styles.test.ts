import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AA_LARGE, AA_TEXT, contrastRatio } from '@/lib/design/contrast';
import { STYLES, SURFACES, type BaseSurface, type Scheme, type Style } from '@/lib/theme/base';
import { AAA_TEXT } from '@/lib/theme/derive';
import { TEAM_IDENTITY, teamTheme, teamTokens } from '@/lib/theme/teams';
import { MAX_LEVEL, tierTheme, tierTokens } from '@/lib/theme/tiers';

/**
 * 화면 스타일 (기본 / 부드러운 / 고대비) — 08 문서 §2.6.
 *
 * 스타일은 사용자가 고르고 성별 같은 개인 정보와 무관하다. 이 테스트가 지키는
 * 것은 세 가지다.
 *   1) 스타일마다 모든 글자 조합이 기준 대비를 넘는다(고대비는 7:1)
 *   2) 구단·등급색이 **고른 스타일의 표면 위에서** 기준을 넘는다
 *   3) CSS와 TS의 값이 같다 — 어긋나면 테스트만 통과하고 화면은 깨진다
 */

const SCHEMES: Scheme[] = ['dark', 'light'];
const SLUGS = Object.keys(TEAM_IDENTITY);
const ratio = (a: string, b: string) => Number(contrastRatio(a, b).toFixed(2));

/** 스타일별 본문 기준. 고대비는 AAA. */
const textMinimum = (style: Style) => (style === 'contrast' ? AAA_TEXT : AA_TEXT);

const css = readFileSync(
  fileURLToPath(new URL('../../../src/app/globals.css', import.meta.url)),
  'utf8',
);

const TOKEN_NAMES: [keyof BaseSurface, string][] = [
  ['bgBase', '--bg-base'],
  ['bgCard', '--bg-card'],
  ['bgField', '--bg-field'],
  ['ink1', '--ink-1'],
  ['ink2', '--ink-2'],
  ['line', '--line'],
  ['accent', '--accent'],
  ['accentInk', '--accent-ink'],
  ['onBase', '--on-base'],
  ['out', '--out'],
  ['hr', '--hr'],
  ['focus', '--focus'],
];

/** 스타일·구성표에 해당하는 CSS 블록 본문 */
function cssBlock(style: Style, scheme: Scheme): string {
  const escape = (s: string) => s.replace(/[[\]'().*]/g, (c) => `\\${c}`);
  const selector =
    style === 'default'
      ? scheme === 'dark'
        ? ':root'
        : ":root[data-theme='light']"
      : scheme === 'dark'
        ? `:root[data-style='${style}']`
        : `:root[data-style='${style}'][data-theme='light']`;
  const match = css.match(new RegExp(`(?:^|\\n)${escape(selector)}\\s*\\{([\\s\\S]*?)\\n\\}`));
  return match?.[1] ?? '';
}

function cssToken(block: string, name: string): string | undefined {
  return block.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6});`))?.[1]?.toLowerCase();
}

describe('CSS와 TS의 스타일 값이 같다', () => {
  for (const style of STYLES) {
    for (const scheme of SCHEMES) {
      it(`${style} · ${scheme}`, () => {
        const block = cssBlock(style, scheme);
        expect(block, '블록을 찾지 못했다').not.toBe('');
        for (const [key, name] of TOKEN_NAMES) {
          expect(cssToken(block, name), `${name}`).toBe(SURFACES[style][scheme][key]);
        }
      });
    }
  }

  it('스타일 라이트 블록이 미디어 쿼리 안에도 같은 값으로 있다', () => {
    // 라이트 모드에서 다크 스타일 블록이 기본 라이트 블록을 순서로 이기므로,
    // 미디어 쿼리 안의 스타일 라이트 블록이 모든 값을 다시 덮어야 한다.
    for (const style of ['soft', 'contrast', 'gold', 'green', 'burgundy', 'stone'] as const) {
      const media = css.match(
        new RegExp(
          `:root\\[data-style='${style}'\\]:not\\(\\[data-theme='dark'\\]\\)\\s*\\{([\\s\\S]*?)\\n\\s*\\}`,
        ),
      )?.[1];
      expect(media, style).toBeDefined();
      for (const [key, name] of TOKEN_NAMES) {
        expect(cssToken(media!, name), `${style} ${name}`).toBe(SURFACES[style].light[key]);
      }
    }
  });
});

for (const style of STYLES) {
  for (const scheme of SCHEMES) {
    describe(`표면 대비 · ${style} · ${scheme}`, () => {
      const t = SURFACES[style][scheme];
      const text = textMinimum(style);

      const pairs: [string, string, string, number][] = [
        ['ink-1 / bg-base', t.ink1, t.bgBase, text],
        ['ink-1 / bg-card', t.ink1, t.bgCard, text],
        ['ink-1 / bg-field', t.ink1, t.bgField, text],
        ['ink-2 / bg-base', t.ink2, t.bgBase, text],
        ['ink-2 / bg-card', t.ink2, t.bgCard, text],
        ['ink-2 / bg-field', t.ink2, t.bgField, text],
        ['accent-ink / accent', t.accentInk, t.accent, text],
        ['accent / bg-card', t.accent, t.bgCard, text],
        ['accent / bg-base', t.accent, t.bgBase, text],
        ['on-base / bg-card', t.onBase, t.bgCard, text],
        ['on-base / bg-field', t.onBase, t.bgField, text],
        ['out / bg-card', t.out, t.bgCard, text],
        ['hr / bg-card', t.hr, t.bgCard, text],
        ['focus / bg-base', t.focus, t.bgBase, style === 'contrast' ? AA_TEXT : AA_LARGE],
        ['focus / bg-card', t.focus, t.bgCard, style === 'contrast' ? AA_TEXT : AA_LARGE],
      ];
      // 고대비에서는 카드 테두리도 경계로 읽혀야 한다
      if (style === 'contrast') {
        pairs.push(['line / bg-base', t.line, t.bgBase, AA_LARGE]);
        pairs.push(['line / bg-card', t.line, t.bgCard, AA_LARGE]);
      }

      for (const [label, fg, bg, minimum] of pairs) {
        it(`${label} ≥ ${minimum}:1`, () => {
          expect(ratio(fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(minimum);
        });
      }
    });
  }
}

/**
 * 구단색은 기본·부드러운이 같은 값을 쓰고 고대비만 따로다. 그러니 기본 값이
 * **부드러운 표면 위에서도** 통과하는지 따로 봐야 한다.
 */
for (const style of STYLES) {
  for (const scheme of SCHEMES) {
    describe(`구단색 · ${style} · ${scheme}`, () => {
      const surface = SURFACES[style][scheme];
      const text = textMinimum(style);

      for (const slug of [...SLUGS, 'brand']) {
        it(slug, () => {
          const tokens = teamTokens(teamTheme(slug === 'brand' ? null : slug), scheme, style);
          expect(ratio(tokens.accent, surface.bgCard)).toBeGreaterThanOrEqual(text);
          expect(ratio(tokens.accent, surface.bgBase)).toBeGreaterThanOrEqual(text);
          expect(ratio(tokens.accentInk, tokens.accent)).toBeGreaterThanOrEqual(text);
          for (const band of [tokens.surface, tokens.surfaceAlt]) {
            expect(ratio(surface.ink1, band), `ink-1 on ${band}`).toBeGreaterThanOrEqual(text);
            expect(ratio(surface.ink2, band), `ink-2 on ${band}`).toBeGreaterThanOrEqual(text);
          }
          expect(ratio(tokens.accent, tokens.surface)).toBeGreaterThanOrEqual(AA_LARGE);
        });
      }
    });
  }
}

for (const style of STYLES) {
  for (const scheme of SCHEMES) {
    it(`등급색 · ${style} · ${scheme}`, () => {
      const surface = SURFACES[style][scheme];
      const text = textMinimum(style);
      for (let level = 1; level <= MAX_LEVEL; level += 1) {
        const theme = tierTheme(level);
        const tokens = tierTokens(theme, scheme, style);
        expect(ratio(tokens.color, surface.bgCard), `Lv.${level}`).toBeGreaterThanOrEqual(text);
        expect(ratio(tokens.color, surface.bgBase), `Lv.${level}`).toBeGreaterThanOrEqual(text);
        if (theme.ornament !== 'none') {
          expect(ratio(tokens.ink, tokens.color), `Lv.${level} 배지 글자`).toBeGreaterThanOrEqual(
            text,
          );
        }
      }
    });
  }
}

it('명예의 전당 무지개 테두리: 고대비에서도 각 색이 경계 3:1 (멈춘 채 남는다)', () => {
  for (const scheme of SCHEMES) {
    const prism = tierTokens(tierTheme(7), scheme, 'contrast').prism;
    const stops = prism?.match(/#[0-9a-f]{6}/gi) ?? [];
    expect(stops.length, scheme).toBe(4);
    for (const stop of stops) {
      for (const bg of [SURFACES.contrast[scheme].bgBase, SURFACES.contrast[scheme].bgCard]) {
        expect(ratio(stop, bg), `${scheme} ${stop} on ${bg}`).toBeGreaterThanOrEqual(AA_LARGE);
      }
    }
  }
});

describe('스타일별 장식 조정', () => {
  it('고대비는 흐르는 무지개를 멈추고 배지를 단색으로 바꾼다', () => {
    expect(css).toMatch(
      /:root\[data-style='contrast'\] \.tier-frame\[data-ornament='prismatic'\]\s*\{[^}]*animation:\s*none/,
    );
    expect(css).toMatch(
      /:root\[data-style='contrast'\] \.tier-badge\[data-ornament='prismatic'\]\s*\{[^}]*background:\s*var\(--tier\)/,
    );
  });

  it('고대비는 포커스 링을 두껍게', () => {
    expect(cssBlock('contrast', 'dark')).toMatch(/--focus-width:\s*4px/);
    expect(css).toMatch(/outline:\s*var\(--focus-width, 3px\)/);
  });

  /**
   * 회귀 방지. <html>의 구단 규칙이 `[data-team]`(0,1,0)뿐이면 스타일 블록
   * (`:root[data-style='soft']`, 0,2,0)에 져서 부드러운 스타일에서 구단 강조색이
   * 브랜드 기본색으로 덮인다.
   */
  it('<html>의 구단 규칙은 스타일 블록보다 명시도가 낮지 않고 뒤에 온다', () => {
    const teamRule = css.indexOf(':root[data-team],\n[data-team] {');
    const softBlock = css.indexOf(":root[data-style='soft'] {");
    expect(teamRule).toBeGreaterThan(-1);
    expect(softBlock).toBeGreaterThan(-1);
    expect(teamRule).toBeGreaterThan(softBlock);
  });
});
