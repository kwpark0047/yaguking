import type { BaseSurface } from './base';

/**
 * 선수 카드의 소재 (14 문서 §4.1).
 *
 * 등급이 **장식의 격**이라면 소재는 그 격을 손에 잡히게 한다. 육성선수는 무지
 * 종이, 명예의 전당은 금속판. 1단계는 그림 자산 없이 **CSS 그라데이션만으로**
 * 흉내 낸다. 자산(14 문서 §6)이 오면 이 층만 갈아 끼운다.
 *
 * 소재는 카드 **테두리 여백에만** 깔린다. 글자는 늘 단색 면(카드·구단 띠) 위에
 * 있으므로, 질감이 대비 계산을 흔들지 않는다.
 *
 * 웹은 `globals.css`의 `.player-card__material[data-material]`이 그린다. 여기
 * 값은 CSS 변수와 `color-mix`를 모르는 Satori(OG 이미지)용이다. 둘은 같은
 * 의도를 다른 수단으로 옮긴 것이라 픽셀까지 같지는 않다.
 */

export type Material = 'paper' | 'kraft' | 'coated' | 'gloss' | 'foil' | 'holo' | 'metal';

export const MATERIALS: readonly Material[] = [
  'paper',
  'kraft',
  'coated',
  'gloss',
  'foil',
  'holo',
  'metal',
];

export const MATERIAL_NAME: Record<Material, string> = {
  paper: '무지 종이',
  kraft: '크라프트지',
  coated: '코팅지',
  gloss: '광택지',
  foil: '금박',
  holo: '홀로그램',
  metal: '금속판',
};

/**
 * 카드 면 둘레의 두 번째 선. 테두리(등급색) 안쪽에 한 줄 더 긋는다.
 *   none   — 홑선
 *   solid  — 이중선
 *   dashed — 글러브 실밥
 */
export type Inlay = 'none' | 'solid' | 'dashed';

export const MATERIAL_INLAY: Record<Material, Inlay> = {
  paper: 'none',
  kraft: 'none',
  coated: 'solid',
  gloss: 'solid',
  foil: 'dashed',
  holo: 'solid',
  metal: 'solid',
};

/** 홀로그램 무지개. 명예의 전당 테두리와 같은 색들이다(tiers.ts). */
const HOLO_STOPS = ['#3ec7ff', '#ff5c8a', '#e0a800', '#9b6bff'] as const;

function parseHex(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  return [0, 2, 4].map((i) => Number.parseInt(value.slice(i, i + 2), 16)) as [
    number,
    number,
    number,
  ];
}

/** `a`를 `weight`만큼, `b`를 나머지만큼 섞는다. sRGB 보간 — 장식에만 쓴다. */
export function mixHex(a: string, b: string, weight: number): string {
  const [ar, ag, ab] = parseHex(a);
  const [br, bg, bb] = parseHex(b);
  const channel = (x: number, y: number) =>
    Math.round(x * weight + y * (1 - weight))
      .toString(16)
      .padStart(2, '0');
  return `#${channel(ar, br)}${channel(ag, bg)}${channel(ab, bb)}`;
}

export interface MaterialFill {
  backgroundColor: string;
  backgroundImage: string;
}

/**
 * Satori용 소재 면. `tier`는 이 구성표에서 쓰는 등급색이다.
 * 웹 CSS의 각 소재와 같은 순서·같은 의도로 쓴다.
 */
export function materialFill(material: Material, tier: string, surface: BaseSurface): MaterialFill {
  const card = surface.bgCard;

  switch (material) {
    case 'paper':
      return {
        backgroundColor: mixHex(surface.ink1, card, 0.06),
        backgroundImage: `linear-gradient(180deg, ${mixHex(surface.ink1, card, 0.09)}, ${mixHex(surface.ink1, card, 0.04)})`,
      };
    case 'kraft': {
      // 모서리 리벳은 OG 쪽에서 작은 원 요소로 그린다(Satori는 층별 위치 지정이 약하다).
      const kraft = mixHex(tier, card, 0.45);
      return {
        backgroundColor: kraft,
        backgroundImage: `linear-gradient(100deg, ${kraft}, ${mixHex(tier, card, 0.32)}, ${kraft})`,
      };
    }
    case 'coated':
      return {
        backgroundColor: mixHex(tier, card, 0.4),
        backgroundImage: `linear-gradient(135deg, ${mixHex(tier, card, 0.6)}, ${mixHex(tier, card, 0.25)} 45%, ${mixHex(tier, card, 0.6)} 55%, ${mixHex(tier, card, 0.3)})`,
      };
    case 'gloss':
      return {
        backgroundColor: mixHex(tier, card, 0.45),
        backgroundImage: `linear-gradient(160deg, ${mixHex(tier, card, 0.7)}, ${mixHex(tier, card, 0.3)} 50%, ${mixHex(tier, card, 0.6)})`,
      };
    case 'foil':
      return {
        backgroundColor: tier,
        backgroundImage: `linear-gradient(120deg, ${mixHex(tier, card, 0.75)}, ${mixHex(tier, '#ffffff', 0.7)} 35%, ${mixHex(tier, card, 0.6)} 60%, ${mixHex(tier, '#ffffff', 0.8)} 85%, ${mixHex(tier, card, 0.7)})`,
      };
    case 'holo':
      return {
        backgroundColor: mixHex(tier, card, 0.5),
        backgroundImage: `linear-gradient(115deg, ${HOLO_STOPS.map((stop) => mixHex(mixHex(tier, stop, 0.5), card, 0.7)).join(', ')})`,
      };
    case 'metal':
      return {
        backgroundColor: mixHex(tier, '#8a929c', 0.35),
        backgroundImage: `linear-gradient(180deg, ${mixHex(tier, '#c9d0d8', 0.3)}, ${mixHex(tier, '#5b636c', 0.3)} 50%, ${mixHex(tier, '#c9d0d8', 0.3)})`,
      };
  }
}

/**
 * 카드 가운데에 크게 새기는 글자 — **닉네임의 첫 글자**다(14 문서 §3).
 * 구단 이니셜(D·L·K…)은 식별 표지라 쓰지 않는다.
 *
 * 그래핌 단위로 자른다. 코드 포인트로 자르면 결합 문자나 이모지가 반쪽이 된다.
 */
export function cardInitial(nickname: string): string {
  const trimmed = nickname.trim();
  if (!trimmed) return '?';
  const first = new Intl.Segmenter('ko', { granularity: 'grapheme' })
    .segment(trimmed)
    [Symbol.iterator]()
    .next().value?.segment;
  return (first ?? '?').toLocaleUpperCase('en');
}
