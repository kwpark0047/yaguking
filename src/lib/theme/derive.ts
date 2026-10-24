import { AA_LARGE, AA_TEXT } from '@/lib/design/contrast';
import { BASE, INK_CANDIDATES, type Scheme } from './base';
import { fitLightness, hexToOklch, pickInk } from './color';

/**
 * 기준 색 하나에서 쓰임새별 색을 도출한다.
 *
 * 모든 결과는 `BASE`의 표면 위에서 AA를 만족하도록 맞춰진다. 이 파일의 함수가
 * 만든 값은 테스트가 구단·등급 전부에 대해 다시 검사한다.
 */

/** 채도가 이보다 낮으면 무채색으로 본다. 검정·흰색의 색상각은 의미가 없다. */
const NEUTRAL_CHROMA = 0.025;

export interface AccentPair {
  /** 글자색·테두리·주 버튼 배경으로 쓰는 강조색 */
  accent: string;
  /** 강조색 위 글자 */
  accentInk: string;
}

/**
 * 강조색. 카드와 페이지 배경 위에서 **글자로 써도** 4.5:1, 버튼 배경으로 쓸 때
 * 그 위 글자와도 4.5:1이다.
 *
 * 다크에서는 밝히고 라이트에서는 어둡게 한다. 진한 잉크와 흰색을 대비 상대에
 * 함께 넣어 두면, 배경 대비를 맞추는 방향과 글자 대비를 맞추는 방향이 같아서
 * 한 번에 둘 다 충족된다.
 */
export function deriveAccent(baseHex: string, scheme: Scheme): AccentPair {
  const surface = BASE[scheme];
  const accent =
    scheme === 'dark'
      ? fitLightness(baseHex, {
          against: [surface.bgBase, surface.bgCard, INK_CANDIDATES[0]],
          direction: 'lighter',
          maxChroma: 0.19,
        })
      : fitLightness(baseHex, {
          against: [surface.bgBase, surface.bgCard, INK_CANDIDATES[1]],
          direction: 'darker',
          maxChroma: 0.19,
        });

  return { accent, accentInk: pickInk(accent, INK_CANDIDATES) };
}

/**
 * 구단 띠·히어로 카드 같은 넓은 표면. **본문 글자(ink-1)와 보조 글자(ink-2)가
 * 모두 4.5:1**이어야 하므로 은은하게 칠한다.
 */
export function deriveSurface(baseHex: string, scheme: Scheme): string {
  const surface = BASE[scheme];
  const base = hexToOklch(baseHex);
  const neutral = base.c < NEUTRAL_CHROMA;

  return scheme === 'dark'
    ? fitLightness(baseHex, {
        against: [surface.ink1, surface.ink2],
        direction: 'darker',
        startLightness: 0.33,
        chroma: neutral ? 0 : Math.min(base.c, 0.075),
      })
    : fitLightness(baseHex, {
        against: [surface.ink1, surface.ink2],
        direction: 'lighter',
        startLightness: 0.9,
        chroma: neutral ? 0 : Math.min(base.c, 0.04),
      });
}

/**
 * 장식 테두리(무지개 테두리 등). 글자가 아니라 UI 경계이므로 3:1이면 된다.
 */
export function deriveOrnament(baseHex: string, scheme: Scheme): string {
  const surface = BASE[scheme];
  return fitLightness(baseHex, {
    against: [surface.bgBase, surface.bgCard],
    minimum: AA_LARGE,
    direction: scheme === 'dark' ? 'lighter' : 'darker',
    maxChroma: 0.2,
  });
}

export { AA_TEXT };
