import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { TEAMS } from '@/content/teams';
import { AA_LARGE, AA_TEXT, contrastRatio } from '@/lib/design/contrast';
import { BASE, type Scheme } from '@/lib/theme/base';
import { hexToOklch } from '@/lib/theme/color';
import { BRAND_THEME, TEAM_IDENTITY, isTeamSlug, teamTheme } from '@/lib/theme/teams';
import { MAX_LEVEL, clampLevel, hasOrnament, tierTheme } from '@/lib/theme/tiers';

/**
 * 테마 팔레트 대비 검사.
 *
 * 구단 10개 × 라이트/다크 × 쓰임새, 등급 7개 × 라이트/다크. 손으로 확인할 수
 * 있는 양이 아니다. 하나라도 AA를 놓치면 그 구단 팬에게만 글자가 안 보이는데
 * 다른 구단으로 테스트한 사람은 모른다. 그래서 **전부** 돈다.
 */

const SCHEMES: Scheme[] = ['dark', 'light'];
const SLUGS = Object.keys(TEAM_IDENTITY);
const ratio = (a: string, b: string) => Number(contrastRatio(a, b).toFixed(2));

function read(path: string): string {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
}

/** 두 색의 지각적 거리(OKLab ΔE). 0이면 같은 색. */
function deltaE(a: string, b: string): number {
  const toLab = (hex: string) => {
    const { l, c, h } = hexToOklch(hex);
    const r = (h * Math.PI) / 180;
    return [l, c * Math.cos(r), c * Math.sin(r)] as const;
  };
  const [l1, a1, b1] = toLab(a);
  const [l2, a2, b2] = toLab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

describe('기준 표면은 globals.css와 같다', () => {
  const css = read('../../../src/app/globals.css');
  const block = (matcher: RegExp) => css.match(matcher)?.[1] ?? '';
  const token = (text: string, name: string) =>
    text.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6});`))?.[1]?.toLowerCase();

  const blocks: Record<Scheme, string> = {
    dark: block(/:root\s*\{([\s\S]*?)\n\}/),
    light: block(/:root\[data-theme='light'\]\s*\{([\s\S]*?)\n\}/),
  };

  for (const scheme of SCHEMES) {
    it(`${scheme}`, () => {
      // 어긋나면 테스트는 통과해도 실제 화면의 대비가 깨진다.
      expect(token(blocks[scheme], '--bg-base')).toBe(BASE[scheme].bgBase);
      expect(token(blocks[scheme], '--bg-card')).toBe(BASE[scheme].bgCard);
      expect(token(blocks[scheme], '--ink-1')).toBe(BASE[scheme].ink1);
      expect(token(blocks[scheme], '--ink-2')).toBe(BASE[scheme].ink2);
      expect(token(blocks[scheme], '--accent')).toBe(BASE[scheme].accent);
      expect(token(blocks[scheme], '--accent-ink')).toBe(BASE[scheme].accentInk);
    });
  }
});

describe('구단 목록', () => {
  // Firebase판: 구단 목록은 DB 시드가 아니라 src/content/teams.ts다.
  it('구단 목록의 구단마다 팔레트가 있다', () => {
    expect(TEAMS).toHaveLength(10);
    for (const { slug } of TEAMS) {
      expect(isTeamSlug(slug), `${slug} 팔레트 없음`).toBe(true);
    }
  });

  it('모르는 구단은 브랜드 기본으로 떨어진다', () => {
    expect(teamTheme('unknown')).toBe(BRAND_THEME);
    expect(teamTheme(null)).toBe(BRAND_THEME);
    expect(teamTheme(undefined)).toBe(BRAND_THEME);
    // 프로토타입 키에 속지 않는다
    expect(isTeamSlug('toString')).toBe(false);
  });

  it('브랜드 기본은 지금의 토큰 그대로다', () => {
    for (const scheme of SCHEMES) {
      expect(BRAND_THEME[scheme].accent).toBe(BASE[scheme].accent);
      expect(BRAND_THEME[scheme].accentInk).toBe(BASE[scheme].accentInk);
    }
  });
});

for (const slug of [...SLUGS, 'brand']) {
  for (const scheme of SCHEMES) {
    describe(`구단 ${slug} · ${scheme}`, () => {
      const tokens = teamTheme(slug === 'brand' ? null : slug)[scheme];
      const base = BASE[scheme];

      it('강조색을 글자로 써도 카드·페이지 위에서 4.5:1', () => {
        expect(ratio(tokens.accent, base.bgCard)).toBeGreaterThanOrEqual(AA_TEXT);
        expect(ratio(tokens.accent, base.bgBase)).toBeGreaterThanOrEqual(AA_TEXT);
      });

      it('강조색 버튼 위 글자 4.5:1', () => {
        expect(ratio(tokens.accentInk, tokens.accent)).toBeGreaterThanOrEqual(AA_TEXT);
      });

      it('구단 띠 양 끝에서 본문·보조 글자 4.5:1', () => {
        for (const surface of [tokens.surface, tokens.surfaceAlt]) {
          expect(ratio(base.ink1, surface)).toBeGreaterThanOrEqual(AA_TEXT);
          expect(ratio(base.ink2, surface)).toBeGreaterThanOrEqual(AA_TEXT);
        }
      });

      // 띠의 왼쪽 막대, 구단 점, 구단 선택 버튼의 선택 테두리
      it('띠 위의 강조색 경계 3:1', () => {
        expect(ratio(tokens.accent, tokens.surface)).toBeGreaterThanOrEqual(AA_LARGE);
      });
    });
  }
}

describe('구단색은 그 구단의 색조를 지킨다', () => {
  // 대비를 맞추느라 색상이 돌아가 버리면 그 구단이 아니게 된다.
  for (const slug of SLUGS) {
    it(slug, () => {
      const identity = hexToOklch(TEAM_IDENTITY[slug as keyof typeof TEAM_IDENTITY].primary);
      for (const scheme of SCHEMES) {
        const derived = hexToOklch(teamTheme(slug)[scheme].accent);
        const diff = Math.abs(((derived.h - identity.h + 540) % 360) - 180);
        expect(diff, `${slug} ${scheme}: ${identity.h.toFixed(0)}° → ${derived.h.toFixed(0)}°`).toBeLessThan(20);
      }
    });
  }
});

describe('등급', () => {
  for (let level = 1; level <= MAX_LEVEL; level += 1) {
    for (const scheme of SCHEMES) {
      it(`Lv.${level} · ${scheme}`, () => {
        const theme = tierTheme(level);
        const tokens = theme[scheme];
        const base = BASE[scheme];

        // 등급색은 외곽선 배지에서 글자로도 쓰인다
        expect(ratio(tokens.color, base.bgCard)).toBeGreaterThanOrEqual(AA_TEXT);
        expect(ratio(tokens.color, base.bgBase)).toBeGreaterThanOrEqual(AA_TEXT);

        // 채운 배지는 육성선수(외곽선)를 뺀 전부
        if (theme.ornament !== 'none') {
          expect(ratio(tokens.ink, tokens.color)).toBeGreaterThanOrEqual(AA_TEXT);
        }
      });
    }
  }

  it('명예의 전당 무지개: 각 색이 경계 3:1, 배지 글자(#101418) 4.5:1', () => {
    for (const scheme of SCHEMES) {
      const prism = tierTheme(7)[scheme].prism;
      expect(prism).not.toBeNull();
      const stops = prism!.match(/#[0-9a-f]{6}/gi) ?? [];
      expect(stops.length).toBe(4);
      for (const stop of stops) {
        expect(ratio(stop, BASE[scheme].bgCard), `${scheme} ${stop}`).toBeGreaterThanOrEqual(AA_LARGE);
        expect(ratio('#101418', stop), `${scheme} ${stop}`).toBeGreaterThanOrEqual(AA_TEXT);
      }
    }
  });

  /**
   * 이웃 등급끼리 구분되어야 한다. 같은 계열 색이면 다크에서 명도를 올리는
   * 순간 똑같은 연노랑이 된다.
   */
  it('2~6등급은 서로 구분되는 색이다', () => {
    for (const scheme of SCHEMES) {
      for (let a = 2; a <= 6; a += 1) {
        for (let b = a + 1; b <= 6; b += 1) {
          const distance = deltaE(tierTheme(a)[scheme].color, tierTheme(b)[scheme].color);
          expect(distance, `${scheme} Lv.${a} vs Lv.${b}`).toBeGreaterThan(0.08);
        }
      }
    }
  });

  it('장식은 등급이 오를수록 한 겹씩 늘어난다', () => {
    expect(hasOrnament(tierTheme(1), 'badge')).toBe(false);
    expect(hasOrnament(tierTheme(2), 'badge')).toBe(true);
    expect(hasOrnament(tierTheme(2), 'frame')).toBe(false);
    expect(hasOrnament(tierTheme(3), 'frame')).toBe(true);
    expect(hasOrnament(tierTheme(5), 'glow')).toBe(true);
    expect(hasOrnament(tierTheme(6), 'prismatic')).toBe(false);
    expect(hasOrnament(tierTheme(7), 'prismatic')).toBe(true);
    // 누적: 명예의 전당은 아래 장식을 모두 가진다
    for (const o of ['badge', 'frame', 'glow'] as const) {
      expect(hasOrnament(tierTheme(7), o)).toBe(true);
    }
  });

  it('범위 밖 레벨은 가장 가까운 등급으로', () => {
    expect(clampLevel(0)).toBe(1);
    expect(clampLevel(-5)).toBe(1);
    expect(clampLevel(99)).toBe(7);
    expect(clampLevel(3.9)).toBe(3);
    expect(clampLevel(Number.NaN)).toBe(1);
    expect(tierTheme(99).name).toBe('명예의 전당');
  });

  it('등급명은 06 문서 §9와 같다', () => {
    const names = Array.from({ length: 7 }, (_, i) => tierTheme(i + 1).name);
    expect(names).toEqual(['육성선수', '백업', '주전', '올스타', '골든글러브', 'MVP', '명예의 전당']);
  });
});
