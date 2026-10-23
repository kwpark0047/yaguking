/**
 * 대비 계산 (WCAG 2.2).
 *
 * 디자인 토큰이 AA 기준을 지키는지 테스트로 고정하기 위한 순수 함수다.
 * axe는 실제로 렌더된 화면만 보므로, 쓰이지 않는 조합이나 아직 만들지 않은
 * 화면의 토큰은 잡지 못한다. 토큰 자체를 검사해 두면 화면이 늘어도 안전하다.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function parseHex(hex: string): Rgb {
  const value = hex.replace('#', '').trim();
  const full =
    value.length === 3
      ? value
          .split('')
          .map((char) => char + char)
          .join('')
      : value;

  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    throw new Error(`색 코드가 올바르지 않습니다: ${hex}`);
  }

  return {
    r: Number.parseInt(full.slice(0, 2), 16),
    g: Number.parseInt(full.slice(2, 4), 16),
    b: Number.parseInt(full.slice(4, 6), 16),
  };
}

/** sRGB 성분을 선형값으로 (WCAG 정의) */
function toLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(color: Rgb): number {
  return (
    0.2126 * toLinear(color.r) +
    0.7152 * toLinear(color.g) +
    0.0722 * toLinear(color.b)
  );
}

/** 대비비. 1~21. 두 색의 순서에 관계없이 같은 값이 나온다. */
export function contrastRatio(a: string, b: string): number {
  const first = relativeLuminance(parseHex(a));
  const second = relativeLuminance(parseHex(b));
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

/** 본문 텍스트 기준 */
export const AA_TEXT = 4.5;
/** 큰 텍스트·아이콘·UI 경계 기준 */
export const AA_LARGE = 3;
