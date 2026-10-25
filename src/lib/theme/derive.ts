import { AA_LARGE, AA_TEXT } from '@/lib/design/contrast';
import {
  HC_INK_CANDIDATES,
  INK_CANDIDATES,
  SURFACES,
  type BaseSurface,
  type Scheme,
} from './base';
import { fitLightness, hexToOklch, pickInk } from './color';

/**
 * 기준 색 하나에서 쓰임새별 색을 도출한다.
 *
 * 프로필이 둘이다.
 *   standard — 기본·부드러운 스타일이 **같은 값**을 쓴다. 두 스타일의 표면을
 *              모두 상대로 4.5:1을 맞추므로 어느 쪽에 얹어도 통과한다.
 *              스타일마다 따로 도출하면 화면에 실어 보낼 변수가 그만큼 늘어난다.
 *   contrast — 고대비. 본문 7:1(AAA)로 따로 도출한다. 4.5:1에 맞춘 색을 그대로
 *              두면 고대비라고 부를 수 없다.
 *
 * 이 파일의 함수가 만든 값은 테스트가 구단·등급 전부에 대해 다시 검사한다.
 */

export type Profile = 'standard' | 'contrast';

/** AAA 본문 대비 */
export const AAA_TEXT = 7;

/** 채도가 이보다 낮으면 무채색으로 본다. 검정·흰색의 색상각은 의미가 없다. */
const NEUTRAL_CHROMA = 0.025;

interface ProfileSpec {
  surfaces: readonly BaseSurface[];
  text: number;
  inks: readonly [string, string];
}

/** 프로필이 상대해야 하는 표면들과 기준 */
export function profileSpec(profile: Profile, scheme: Scheme): ProfileSpec {
  return profile === 'contrast'
    ? { surfaces: [SURFACES.contrast[scheme]], text: AAA_TEXT, inks: HC_INK_CANDIDATES }
    : {
        surfaces: [SURFACES.default[scheme], SURFACES.soft[scheme]],
        text: AA_TEXT,
        inks: INK_CANDIDATES,
      };
}

const backgroundsOf = (spec: ProfileSpec) =>
  spec.surfaces.flatMap((s) => [s.bgBase, s.bgCard]);

const textInksOf = (spec: ProfileSpec) => spec.surfaces.flatMap((s) => [s.ink1, s.ink2]);

export interface AccentPair {
  /** 글자색·테두리·주 버튼 배경으로 쓰는 강조색 */
  accent: string;
  /** 강조색 위 글자 */
  accentInk: string;
}

/**
 * 강조색. 카드와 페이지 배경 위에서 **글자로 써도** 기준 대비, 버튼 배경으로
 * 쓸 때 그 위 글자와도 기준 대비다.
 *
 * 다크에서는 밝히고 라이트에서는 어둡게 한다. 진한 잉크(또는 흰색)를 대비
 * 상대에 함께 넣어 두면, 배경 대비를 맞추는 방향과 글자 대비를 맞추는 방향이
 * 같아서 한 번에 둘 다 충족된다.
 */
export function deriveAccent(
  baseHex: string,
  scheme: Scheme,
  profile: Profile = 'standard',
): AccentPair {
  const spec = profileSpec(profile, scheme);
  const accent = fitLightness(baseHex, {
    against: [...backgroundsOf(spec), scheme === 'dark' ? spec.inks[0] : spec.inks[1]],
    minimum: spec.text,
    direction: scheme === 'dark' ? 'lighter' : 'darker',
    maxChroma: 0.19,
  });

  return { accent, accentInk: pickInk(accent, spec.inks) };
}

/**
 * 구단 띠·히어로 카드 같은 넓은 표면. **본문 글자와 보조 글자가 모두** 기준
 * 대비여야 하므로 은은하게 칠한다.
 */
export function deriveSurface(
  baseHex: string,
  scheme: Scheme,
  profile: Profile = 'standard',
): string {
  const spec = profileSpec(profile, scheme);
  const base = hexToOklch(baseHex);
  const neutral = base.c < NEUTRAL_CHROMA;

  return scheme === 'dark'
    ? fitLightness(baseHex, {
        against: textInksOf(spec),
        minimum: spec.text,
        direction: 'darker',
        startLightness: 0.33,
        chroma: neutral ? 0 : Math.min(base.c, 0.075),
      })
    : fitLightness(baseHex, {
        against: textInksOf(spec),
        minimum: spec.text,
        direction: 'lighter',
        startLightness: 0.9,
        chroma: neutral ? 0 : Math.min(base.c, 0.04),
      });
}

/**
 * 장식 테두리(무지개 테두리 등). 글자가 아니라 UI 경계이므로 3:1이면 된다.
 */
export function deriveOrnament(
  baseHex: string,
  scheme: Scheme,
  profile: Profile = 'standard',
): string {
  const spec = profileSpec(profile, scheme);
  return fitLightness(baseHex, {
    against: backgroundsOf(spec),
    minimum: AA_LARGE,
    direction: scheme === 'dark' ? 'lighter' : 'darker',
    maxChroma: 0.2,
  });
}

export { AA_TEXT };
