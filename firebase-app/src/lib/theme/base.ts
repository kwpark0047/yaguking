/**
 * 테마가 올라앉는 기준 표면 (08 문서 §2.1, §2.6).
 *
 * `globals.css`의 토큰과 **같아야 한다.** 구단·등급 색은 이 표면 위에서 대비를
 * 계산하므로, 둘이 어긋나면 테스트는 통과해도 실제 화면에서 대비가 깨진다.
 * 테스트가 두 값을 대조한다(tests/unit/theme/palette.test.ts).
 *
 * 스타일은 사용자가 설정에서 고른다(성별 등 개인 정보로 정하지 않는다).
 *   default  — 기본. 야간 전광판
 *   soft     — 부드러운. 따뜻한 표면, 덜 날카로운 흰 글자, 둥근 모서리
 *   contrast — 고대비. 본문 7:1(AAA), 경계선 3:1, 장식 효과 최소화
 */

export type Scheme = 'dark' | 'light';
export type Style = 'default' | 'soft' | 'contrast';

export const STYLES: readonly Style[] = ['default', 'soft', 'contrast'];

export interface BaseSurface {
  bgBase: string;
  bgCard: string;
  bgField: string;
  ink1: string;
  ink2: string;
  line: string;
  /** 구단을 고르지 않았을 때의 강조색 — 브랜드 기본값 */
  accent: string;
  accentInk: string;
  onBase: string;
  out: string;
  hr: string;
  focus: string;
}

export const SURFACES: Record<Style, Record<Scheme, BaseSurface>> = {
  default: {
    dark: {
      bgBase: '#0c1117',
      bgCard: '#161d26',
      bgField: '#10251a',
      ink1: '#f2f5f7',
      ink2: '#9aa6b2',
      line: '#243040',
      accent: '#ffc53d',
      accentInk: '#101418',
      onBase: '#35b36b',
      out: '#e8636f',
      hr: '#ff8a3d',
      focus: '#5ab0ff',
    },
    light: {
      bgBase: '#f7f8fa',
      bgCard: '#ffffff',
      bgField: '#e8f2eb',
      ink1: '#101418',
      ink2: '#5c6873',
      line: '#dde3e9',
      accent: '#856404',
      accentInk: '#ffffff',
      onBase: '#1e7a46',
      out: '#c0392b',
      hr: '#a8490f',
      focus: '#0b63ce',
    },
  },
  soft: {
    dark: {
      bgBase: '#12161c',
      bgCard: '#1a2029',
      bgField: '#142a1f',
      ink1: '#e3e8ec',
      ink2: '#a5b0bb',
      line: '#29333f',
      accent: '#f7c24a',
      accentInk: '#14181c',
      onBase: '#45c07a',
      out: '#ec7a84',
      hr: '#ff9a57',
      focus: '#6cb8ff',
    },
    light: {
      bgBase: '#f5f3ee',
      bgCard: '#fffdf9',
      bgField: '#e8f0e4',
      ink1: '#22272c',
      ink2: '#56606b',
      line: '#e4dfd5',
      accent: '#7c5e06',
      accentInk: '#ffffff',
      onBase: '#1c7342',
      out: '#b5372a',
      hr: '#a1460e',
      focus: '#0b5fc4',
    },
  },
  contrast: {
    dark: {
      bgBase: '#000000',
      bgCard: '#0b0d10',
      bgField: '#04150b',
      ink1: '#ffffff',
      ink2: '#d2d9e0',
      line: '#8794a3',
      accent: '#ffd25c',
      accentInk: '#000000',
      onBase: '#5fe39a',
      out: '#ff9aa3',
      hr: '#ffb37a',
      focus: '#8fcbff',
    },
    light: {
      bgBase: '#ffffff',
      bgCard: '#ffffff',
      bgField: '#e6f2e9',
      ink1: '#000000',
      ink2: '#2c343d',
      line: '#4b5664',
      accent: '#5a4300',
      accentInk: '#ffffff',
      onBase: '#0b5a2d',
      out: '#8f1a11',
      hr: '#7a3306',
      focus: '#003f99',
    },
  },
};

/** 기본 스타일. 예전 코드와의 호환을 위해 남긴다. */
export const BASE: Record<Scheme, BaseSurface> = SURFACES.default;

/** 강조색 위 글자 후보. 진한 잉크와 흰색 중 대비가 큰 쪽을 쓴다. */
export const INK_CANDIDATES: readonly [string, string] = ['#101418', '#ffffff'];

/** 고대비에서는 순흑·순백을 쓴다. 7:1을 맞추기 위한 여유가 필요하다. */
export const HC_INK_CANDIDATES: readonly [string, string] = ['#000000', '#ffffff'];
