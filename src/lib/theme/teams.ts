import type { CSSProperties } from 'react';
import { BASE, type Scheme } from './base';
import { deriveAccent, deriveSurface } from './derive';

/**
 * 구단 테마.
 *
 * ── 권리 주의 (08 문서 머리말, 11 문서 §4) ─────────────────────────────
 * 아래 기준 색은 **구단 공식 브랜드 가이드의 값이 아니다.** 각 구단을 떠올리게
 * 하는 색조를 자체적으로 잡은 근사치이며, 실제로 화면에 쓰이는 값은 여기서
 * 접근성 기준에 맞춰 다시 도출된다. 로고·엠블럼·유니폼 도안은 쓰지 않는다.
 *
 * 원래 08 문서는 "공식 구단 컬러를 식별 표지로 사용하지 않는다"였다. 2026-10-24
 * 요청으로 구단 테마를 도입했고, 권리 검토 결과에 따라 `TEAM_THEMES=off`로
 * 즉시 끌 수 있게 했다(`themeSwitch.ts`). 끄면 모든 화면이 브랜드 기본색으로
 * 돌아간다.
 * ─────────────────────────────────────────────────────────────────────
 *
 * 구단 테마가 바꾸는 것은 **강조색과 구단 띠뿐이다.** 출루·아웃·홈런 같은
 * 의미 색은 건드리지 않는다 — 그 색은 판정을 전달하고 대비도 따로 맞춰 두었다.
 */

export interface TeamIdentity {
  /** 구단을 떠올리게 하는 대표 색조 (근사치) */
  primary: string;
  /** 띠의 두 번째 색조. 무채색이면 중립 표면이 된다. */
  secondary: string;
}

export const TEAM_IDENTITY = {
  doosan: { primary: '#1b2a6b', secondary: '#d7262e' },
  lg: { primary: '#c3105a', secondary: '#1a1a1a' },
  kiwoom: { primary: '#7f1734', secondary: '#c08a5b' },
  ssg: { primary: '#cf1430', secondary: '#f2b31a' },
  kt: { primary: '#e0202d', secondary: '#141414' },
  nc: { primary: '#1f4a8a', secondary: '#c4a46c' },
  samsung: { primary: '#0b5fd0', secondary: '#9aa8b8' },
  lotte: { primary: '#14336e', secondary: '#d21f3c' },
  kia: { primary: '#e2142d', secondary: '#152238' },
  hanwha: { primary: '#f26a1b', secondary: '#1c1c1c' },
} as const satisfies Record<string, TeamIdentity>;

export type TeamSlug = keyof typeof TEAM_IDENTITY;

export function isTeamSlug(value: unknown): value is TeamSlug {
  return typeof value === 'string' && Object.hasOwn(TEAM_IDENTITY, value);
}

export interface TeamSchemeTokens {
  accent: string;
  accentInk: string;
  /** 구단 띠의 첫 색 */
  surface: string;
  /** 구단 띠의 두 번째 색 */
  surfaceAlt: string;
}

export interface TeamTheme {
  slug: TeamSlug | 'brand';
  dark: TeamSchemeTokens;
  light: TeamSchemeTokens;
}

/**
 * 구단을 고르지 않았거나 테마가 꺼졌을 때의 값.
 * 띠는 야구장 잔디색(`--bg-field`)을 쓴다 — 특정 구단이 아니라 "야구"의 색이다.
 */
export const BRAND_THEME: TeamTheme = {
  slug: 'brand',
  dark: {
    accent: BASE.dark.accent,
    accentInk: BASE.dark.accentInk,
    surface: '#10251a',
    surfaceAlt: '#0c1117',
  },
  light: {
    accent: BASE.light.accent,
    accentInk: BASE.light.accentInk,
    surface: '#e8f2eb',
    surfaceAlt: '#f7f8fa',
  },
};

function deriveScheme(identity: TeamIdentity, scheme: Scheme): TeamSchemeTokens {
  const { accent, accentInk } = deriveAccent(identity.primary, scheme);
  return {
    accent,
    accentInk,
    surface: deriveSurface(identity.primary, scheme),
    surfaceAlt: deriveSurface(identity.secondary, scheme),
  };
}

const cache = new Map<TeamSlug, TeamTheme>();

/** 구단 테마. 계산은 구단마다 한 번만 한다. */
export function teamTheme(slug: string | null | undefined): TeamTheme {
  if (!isTeamSlug(slug)) return BRAND_THEME;

  const cached = cache.get(slug);
  if (cached) return cached;

  const identity = TEAM_IDENTITY[slug];
  const theme: TeamTheme = {
    slug,
    dark: deriveScheme(identity, 'dark'),
    light: deriveScheme(identity, 'light'),
  };
  cache.set(slug, theme);
  return theme;
}

/**
 * 요소에 붙일 CSS 변수. `data-team`과 함께 쓴다.
 *
 * 다크·라이트 값을 **둘 다** 넣고, 어느 쪽을 쓸지는 CSS가 색 구성표를 보고
 * 고른다(`globals.css`의 `[data-team]` 규칙). 인라인 스타일로는 미디어 쿼리를
 * 쓸 수 없기 때문이다.
 *
 * 범위를 좁혀 쓸 때(공유 카드처럼 **보는 사람이 아니라 만든 사람의 구단**을
 * 보여야 할 때)도 값을 전부 넣는다. 일부만 넣으면 CSS 변수가 상속되어
 * 바깥(보는 사람의) 구단 색이 섞인다.
 */
export function teamStyle(theme: TeamTheme): CSSProperties {
  return {
    '--team-accent-d': theme.dark.accent,
    '--team-accent-ink-d': theme.dark.accentInk,
    '--team-surface-d': theme.dark.surface,
    '--team-surface-alt-d': theme.dark.surfaceAlt,
    '--team-accent-l': theme.light.accent,
    '--team-accent-ink-l': theme.light.accentInk,
    '--team-surface-l': theme.light.surface,
    '--team-surface-alt-l': theme.light.surfaceAlt,
  } as CSSProperties;
}

/** 브라우저 주소창 색(모바일). 구단 띠의 첫 색을 쓴다. */
export function teamThemeColor(theme: TeamTheme, scheme: Scheme): string {
  return scheme === 'dark' ? theme.dark.surface : theme.light.surface;
}
