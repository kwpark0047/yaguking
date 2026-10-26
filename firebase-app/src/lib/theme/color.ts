import { AA_TEXT, contrastRatio } from '@/lib/design/contrast';

/**
 * 테마 색 계산.
 *
 * 구단 색과 등급 색을 **손으로 고르지 않고** 기준 색에서 도출한다. 손으로
 * 고르면 10개 구단 × 라이트/다크 × 쓰임새마다 대비를 따로 맞춰야 하고, 하나만
 * 어긋나도 아무도 모른다. 기준 색의 색상(hue)은 지키고 **명도만** 움직여
 * WCAG AA를 만족하는 가장 가까운 값을 찾는다.
 *
 * OKLCH를 쓰는 이유: HSL은 명도를 바꾸면 색상이 틀어진다(파랑을 밝히면
 * 보라가 된다). OKLCH는 지각적으로 균일해 명도만 옮겨도 "같은 색"으로 읽힌다.
 */

export interface Oklch {
  l: number;
  c: number;
  h: number;
}

function srgbToLinear(value: number): number {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(value: number): number {
  return value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055;
}

function hexToRgb01(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  const full =
    value.length === 3
      ? value
          .split('')
          .map((char) => char + char)
          .join('')
      : value;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) throw new Error(`색 코드가 올바르지 않습니다: ${hex}`);
  return [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
}

export function hexToOklch(hex: string): Oklch {
  const [r, g, b] = hexToRgb01(hex).map(srgbToLinear) as [number, number, number];

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;

  const c = Math.hypot(A, B);
  const h = ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;
  return { l: L, c, h };
}

/** OKLCH → 선형이 아닌 sRGB(0~1). 범위 밖일 수 있다. */
function oklchToRgb01({ l: L, c, h }: Oklch): [number, number, number] {
  const radians = (h * Math.PI) / 180;
  const A = c * Math.cos(radians);
  const B = c * Math.sin(radians);

  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;

  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const b = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  return [r, g, b].map(linearToSrgb) as [number, number, number];
}

function inGamut(rgb: [number, number, number]): boolean {
  return rgb.every((v) => v >= -0.0005 && v <= 1.0005);
}

function rgb01ToHex(rgb: [number, number, number]): string {
  return `#${rgb
    .map((v) =>
      Math.round(Math.min(1, Math.max(0, v)) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

/**
 * OKLCH를 hex로. sRGB 밖이면 **색상과 명도는 두고 채도만** 줄여 안으로 넣는다.
 * 채도를 자르지 않고 각 성분을 잘라내면 색상이 틀어진다.
 */
export function oklchToHex(color: Oklch): string {
  if (inGamut(oklchToRgb01(color))) return rgb01ToHex(oklchToRgb01(color));

  let low = 0;
  let high = color.c;
  for (let i = 0; i < 24; i += 1) {
    const mid = (low + high) / 2;
    if (inGamut(oklchToRgb01({ ...color, c: mid }))) low = mid;
    else high = mid;
  }
  return rgb01ToHex(oklchToRgb01({ ...color, c: low }));
}

/** 모든 상대 색과 `minimum` 이상의 대비를 내는가 */
export function meetsContrast(color: string, against: readonly string[], minimum: number): boolean {
  return against.every((other) => contrastRatio(color, other) >= minimum);
}

export interface FitOptions {
  /** 이 색들 모두와 대비를 확보한다 */
  against: readonly string[];
  /** 기본 4.5:1 (본문 텍스트) */
  minimum?: number;
  /** 어두운 배경 위에 쓸 색이면 lighter, 밝은 배경 위면 darker */
  direction: 'lighter' | 'darker';
  /** 채도 상한. 지나치게 쨍한 색을 막는다. */
  maxChroma?: number;
  /** 시작 명도. 없으면 기준 색의 명도에서 출발한다. */
  startLightness?: number;
  /** 고정 채도. 표면색처럼 은은해야 할 때 쓴다. */
  chroma?: number;
}

/**
 * 기준 색의 색상(hue)을 유지한 채 명도만 움직여 대비를 맞춘다.
 *
 * 출발점이 이미 기준을 넘으면 그대로 돌려준다 — **가능한 한 원래 색에 가깝게**
 * 남기기 위해서다. 끝까지 가도 못 맞추면(이론상 거의 없다) 가장 멀리 간 값을
 * 돌려주고, 테스트가 그 실패를 잡는다.
 */
export function fitLightness(baseHex: string, options: FitOptions): string {
  const minimum = options.minimum ?? AA_TEXT;
  const base = hexToOklch(baseHex);
  const chroma = Math.min(options.chroma ?? base.c, options.maxChroma ?? Number.POSITIVE_INFINITY);
  const step = options.direction === 'lighter' ? 0.004 : -0.004;

  let lightness = options.startLightness ?? base.l;
  let candidate = oklchToHex({ l: lightness, c: chroma, h: base.h });

  for (let i = 0; i < 260; i += 1) {
    if (meetsContrast(candidate, options.against, minimum)) return candidate;
    lightness += step;
    if (lightness <= 0 || lightness >= 1) break;
    candidate = oklchToHex({ l: lightness, c: chroma, h: base.h });
  }
  return candidate;
}

/** 대비가 더 큰 쪽 글자색을 고른다. */
export function pickInk(background: string, inks: readonly [string, string]): string {
  return contrastRatio(inks[0], background) >= contrastRatio(inks[1], background)
    ? inks[0]
    : inks[1];
}
