/**
 * 메인 히어로 바탕(야간 야구장 night-stadium.svg) 위에 겹치는 움직임 — 별빛 깜박임, 조명 숨쉬기, 천천히 흐르는 빛 안개.
 *
 * 좌표는 바탕 그림과 같은 1200×1000 판(같은 viewBox·preserveAspectRatio로 겹치므로 어떤 화면 폭에서도 그림과 맞는다).
 * 움직임은 층(svg) 전체의 투명도·위치만 바꾼다(transform/opacity — 폰에서도 다시 그리지 않고 합성만).
 * 설정 "화면 효과"(<html data-effects>)와 기기의 동작 줄이기를 globals.css가 따른다:
 * - full: 모두 · calm(줄이기·고대비): 별빛만 느리고 약하게 · none(끄기·동작 줄이기): 모두 그대로
 */
export const SKY_VIEWBOX = '0 0 1200 1000';
/** 바탕 그림(night-stadium.svg)과 같아야 겹친다 — 아래·가운데 기준으로 덮기 */
export const SKY_ASPECT = 'xMidYMax slice';

export type Star = { x: number; y: number; r: number };

/**
 * 깜박이는 별 세 무리 — 무리마다 주기가 달라 함께 깜박이지 않는다.
 * 하늘(관중석 위, 대략 y < 120)에만 두고, 폰에서 보이는 가운데(x 430~770)에도 몇 개씩 둔다.
 */
export const TWINKLE_GROUPS: readonly (readonly Star[])[] = [
  [
    { x: 455, y: 28, r: 2.4 },
    { x: 612, y: 62, r: 2 },
    { x: 742, y: 22, r: 2.6 },
    { x: 205, y: 48, r: 2.2 },
    { x: 1012, y: 74, r: 2 },
    { x: 1150, y: 18, r: 2.4 },
  ],
  [
    { x: 528, y: 88, r: 2.2 },
    { x: 690, y: 40, r: 2.4 },
    { x: 330, y: 22, r: 2 },
    { x: 120, y: 92, r: 2.4 },
    { x: 948, y: 30, r: 2.6 },
    { x: 818, y: 96, r: 2 },
  ],
  [
    { x: 575, y: 16, r: 2.6 },
    { x: 470, y: 76, r: 2 },
    { x: 768, y: 70, r: 2.2 },
    { x: 262, y: 104, r: 2 },
    { x: 40, y: 30, r: 2.2 },
    { x: 1080, y: 52, r: 2.4 },
  ],
];

/** 조명 등 — 바탕 그림의 glow 원과 같은 자리(가운데가 가장 크다) */
export const FLOODLIGHTS: readonly Star[] = [
  { x: 180, y: 269.5, r: 41.4 },
  { x: 330, y: 226.4, r: 41.4 },
  { x: 470, y: 203, r: 50.6 },
  { x: 600, y: 196, r: 57.5 },
  { x: 730, y: 203, r: 50.6 },
  { x: 870, y: 226.4, r: 41.4 },
  { x: 1020, y: 269.5, r: 41.4 },
];

/** 숨쉬는 빛은 등의 가운데만(반지름의 이만큼) — 글자 뒤 넓은 번짐은 그대로 두어 제목 대비가 흔들리지 않게 */
export const FLOODLIGHT_CORE = 0.55;

/** 관중석 위를 천천히 흐르는 빛 안개 */
export const HAZE = { x: 600, y: 170, rx: 300, ry: 110 } as const;
