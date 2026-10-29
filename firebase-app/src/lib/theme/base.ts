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
export type Style = 'default' | 'soft' | 'contrast' | 'gold' | 'green' | 'burgundy' | 'stone';

export const STYLES: readonly Style[] = ['default', 'soft', 'contrast', 'gold', 'green', 'burgundy', 'stone'];
/** 게임 화면 고급화 테마(docs/game-look-plan.md) — 설정 › 화면에서 고른다(src/lib/display/preference.ts) */
export const PREMIUM_STYLES: readonly Style[] = ['gold', 'green', 'burgundy', 'stone'];

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
  // 나이트 골드(기본) — 밤 야구장의 짙은 남색과 금색
  gold: {
    dark: {
      bgBase: '#0a1326',
      bgCard: '#121d36',
      bgField: '#0d2a1c',
      ink1: '#f4f0e4',
      ink2: '#a9b3c6',
      line: '#26355a',
      accent: '#e3b54f',
      accentInk: '#0a1326',
      onBase: '#42c07b',
      out: '#f0737d',
      hr: '#ff9752',
      focus: '#6db9ff',
    },
    light: {
      bgBase: '#f6f3ec',
      bgCard: '#ffffff',
      bgField: '#e7f0e8',
      ink1: '#0f1a2e',
      ink2: '#4c586b',
      line: '#ded6c4',
      accent: '#7a5900',
      accentInk: '#ffffff',
      onBase: '#1d7744',
      out: '#b5352a',
      hr: '#9f450d',
      focus: '#0b5fc4',
    },
  },
  // 클래식 그린 — 옛 야구장 잔디색과 황동색
  green: {
    dark: {
      bgBase: '#09180f',
      bgCard: '#112419',
      bgField: '#0c2c19',
      ink1: '#f2efe2',
      ink2: '#a6b5a8',
      line: '#234031',
      accent: '#d9b562',
      accentInk: '#09180f',
      onBase: '#5fd18f',
      out: '#f37d84',
      hr: '#ffa264',
      focus: '#7cc1ff',
    },
    light: {
      bgBase: '#f8f7f1',
      bgCard: '#ffffff',
      bgField: '#e3eee0',
      ink1: '#132419',
      ink2: '#4c5b4f',
      line: '#ddd5bf',
      accent: '#6a520e',
      accentInk: '#ffffff',
      onBase: '#186e3d',
      out: '#b1352a',
      hr: '#99420c',
      focus: '#0b5fc4',
    },
  },
  // 버건디 — 와인색 바탕과 샴페인 골드
  burgundy: {
    dark: {
      bgBase: '#190b11',
      bgCard: '#25131b',
      bgField: '#0f2317',
      ink1: '#f6ede7',
      ink2: '#bea8ad',
      line: '#45262f',
      accent: '#eac77e',
      accentInk: '#190b11',
      onBase: '#55c98a',
      out: '#ff8c94',
      hr: '#ffa866',
      focus: '#7cc1ff',
    },
    light: {
      bgBase: '#faf6f5',
      bgCard: '#ffffff',
      bgField: '#e7efe5',
      ink1: '#2a1018',
      ink2: '#5d474e',
      line: '#e6d3d3',
      accent: '#861d3b',
      accentInk: '#ffffff',
      onBase: '#1b7240',
      out: '#a92c25',
      hr: '#984109',
      focus: '#0b5fc4',
    },
  },
  // 화이트 스톤 — 밝은 회백색과 짙은 남색(어둡게는 짙은 돌색)
  stone: {
    dark: {
      bgBase: '#101215',
      bgCard: '#161a1e',
      bgField: '#12251a',
      ink1: '#f3f2ee',
      ink2: '#a7aaae',
      line: '#343840',
      accent: '#bccae8',
      accentInk: '#101418',
      onBase: '#48c27c',
      out: '#ee7c86',
      hr: '#ff9c59',
      focus: '#6db9ff',
    },
    light: {
      bgBase: '#f7f7f4',
      bgCard: '#ffffff',
      bgField: '#e5eee6',
      ink1: '#141a22',
      ink2: '#525b65',
      line: '#d8d5ce',
      accent: '#1d2d50',
      accentInk: '#ffffff',
      onBase: '#1e7a46',
      out: '#b5352a',
      hr: '#9f450d',
      focus: '#0b5fc4',
    },
  },
};

/** 기본 스타일. 예전 코드와의 호환을 위해 남긴다. */
export const BASE: Record<Scheme, BaseSurface> = SURFACES.default;

/** 강조색 위 글자 후보. 진한 잉크와 흰색 중 대비가 큰 쪽을 쓴다. */
export const INK_CANDIDATES: readonly [string, string] = ['#101418', '#ffffff'];

/** 고대비에서는 순흑·순백을 쓴다. 7:1을 맞추기 위한 여유가 필요하다. */
export const HC_INK_CANDIDATES: readonly [string, string] = ['#000000', '#ffffff'];
