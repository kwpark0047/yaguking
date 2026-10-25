import type { CSSProperties } from 'react';
import { SURFACES, type Scheme, type Style } from './base';
import { deriveAccent, deriveOrnament, type Profile } from './derive';

/**
 * 레벨 등급 테마 (06 문서 §9의 7단계).
 *
 * 구단 테마가 **색조**를 바꾼다면 등급은 **장식의 격**을 바꾼다. 두 축을 분리해
 * 서로 덮어쓰지 않게 한다 — LG 팬이 MVP 등급이어도 강조색은 LG 색이고, 등급은
 * 배지와 테두리로 드러난다.
 *
 * 등급이 오를수록 장식이 한 겹씩 늘어난다.
 *   none      — 육성선수. 아직 등급색이 없다(외곽선 배지)
 *   badge     — 등급색 배지
 *   frame     — + 카드 테두리
 *   glow      — + 은은한 광채
 *   prismatic — + 여러 색이 도는 테두리 (명예의 전당)
 *
 * 등급색은 서로 다른 색상(hue)에서 고른다. 같은 계열이면 다크 모드에서
 * 명도를 올리는 순간 서로 구분되지 않는다(금색 둘이 같은 연노랑이 된다).
 */

export type Ornament = 'none' | 'badge' | 'frame' | 'glow' | 'prismatic';

interface TierDefinition {
  name: string;
  /** 등급 기준 색. null이면 중립(보조 글자색)을 쓴다. */
  base: string | null;
  ornament: Ornament;
  /** 명예의 전당 테두리에 도는 색들 */
  prism?: readonly string[];
}

export const TIER_DEFINITIONS: Record<number, TierDefinition> = {
  1: { name: '육성선수', base: null, ornament: 'none' },
  // 동은 구리 쪽(붉은 기)으로 둔다. 노란 기가 섞인 동은 라이트 모드에서 금을
  // 어둡게 한 색과 거의 같은 갈색이 되어 골든글러브와 구분되지 않았다(ΔE 0.049).
  2: { name: '백업', base: '#b85c38', ornament: 'badge' }, // 동
  3: { name: '주전', base: '#a8b4c4', ornament: 'frame' }, // 은
  4: { name: '올스타', base: '#4f8cff', ornament: 'frame' }, // 별빛 청
  5: { name: '골든글러브', base: '#e0a800', ornament: 'glow' }, // 금
  6: { name: 'MVP', base: '#9b6bff', ornament: 'glow' }, // 자수정
  7: {
    name: '명예의 전당',
    base: '#e0a800',
    ornament: 'prismatic',
    prism: ['#e0a800', '#ff5c8a', '#9b6bff', '#3ec7ff'],
  },
};

export const MAX_LEVEL = 7;

export interface TierSchemeTokens {
  /** 글자·테두리로 쓰는 등급색. 카드 위에서 4.5:1 */
  color: string;
  /** 채운 배지 위 글자 */
  ink: string;
  /** 무지개 테두리 그라데이션. 명예의 전당만 */
  prism: string | null;
}

export interface TierTheme {
  level: number;
  name: string;
  ornament: Ornament;
  /** 기본·부드러운 스타일 공용 */
  dark: TierSchemeTokens;
  light: TierSchemeTokens;
  /** 고대비 스타일(7:1) */
  darkHc: TierSchemeTokens;
  lightHc: TierSchemeTokens;
}

export function clampLevel(level: number): number {
  if (!Number.isFinite(level)) return 1;
  return Math.min(MAX_LEVEL, Math.max(1, Math.trunc(level)));
}

function deriveScheme(
  definition: TierDefinition,
  scheme: Scheme,
  profile: Profile,
): TierSchemeTokens {
  if (!definition.base) {
    // 중립 등급은 채우지 않는다. 보조 글자색으로 외곽선만 그린다.
    // 기본·부드러운 공용 값은 기본 스타일의 보조 글자색이다. 부드러운 표면
    // 위에서도 4.5:1인지는 테스트가 확인한다.
    const surface = SURFACES[profile === 'contrast' ? 'contrast' : 'default'][scheme];
    return { color: surface.ink2, ink: surface.ink1, prism: null };
  }

  const { accent, accentInk } = deriveAccent(definition.base, scheme, profile);
  const prism = definition.prism
    ? `linear-gradient(120deg, ${definition.prism
        .map((stop) => deriveOrnament(stop, scheme, profile))
        .join(', ')})`
    : null;

  return { color: accent, ink: accentInk, prism };
}

const cache = new Map<number, TierTheme>();

export function tierTheme(level: number): TierTheme {
  const safe = clampLevel(level);
  const cached = cache.get(safe);
  if (cached) return cached;

  const definition = TIER_DEFINITIONS[safe]!;
  const theme: TierTheme = {
    level: safe,
    name: definition.name,
    ornament: definition.ornament,
    dark: deriveScheme(definition, 'dark', 'standard'),
    light: deriveScheme(definition, 'light', 'standard'),
    darkHc: deriveScheme(definition, 'dark', 'contrast'),
    lightHc: deriveScheme(definition, 'light', 'contrast'),
  };
  cache.set(safe, theme);
  return theme;
}

/** 이 등급에 해당 장식이 붙는가. 장식은 누적된다. */
export function hasOrnament(theme: TierTheme, ornament: Exclude<Ornament, 'none'>): boolean {
  const order: Ornament[] = ['none', 'badge', 'frame', 'glow', 'prismatic'];
  return order.indexOf(theme.ornament) >= order.indexOf(ornament);
}

/** `data-tier`와 함께 쓰는 CSS 변수. 다크·라이트 선택은 CSS가 한다. */
export function tierStyle(theme: TierTheme): CSSProperties {
  return {
    '--tier-d': theme.dark.color,
    '--tier-ink-d': theme.dark.ink,
    '--tier-prism-d': theme.dark.prism ?? 'none',
    '--tier-l': theme.light.color,
    '--tier-ink-l': theme.light.ink,
    '--tier-prism-l': theme.light.prism ?? 'none',
    '--tier-dhc': theme.darkHc.color,
    '--tier-ink-dhc': theme.darkHc.ink,
    '--tier-prism-dhc': theme.darkHc.prism ?? 'none',
    '--tier-lhc': theme.lightHc.color,
    '--tier-ink-lhc': theme.lightHc.ink,
    '--tier-prism-lhc': theme.lightHc.prism ?? 'none',
  } as CSSProperties;
}

/** 스타일·색 구성표에 맞는 토큰 묶음 */
export function tierTokens(theme: TierTheme, scheme: Scheme, style: Style): TierSchemeTokens {
  if (style === 'contrast') return scheme === 'dark' ? theme.darkHc : theme.lightHc;
  return scheme === 'dark' ? theme.dark : theme.light;
}
