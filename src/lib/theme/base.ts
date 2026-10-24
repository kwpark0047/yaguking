/**
 * 테마가 올라앉는 기준 표면 (08 문서 §2.1).
 *
 * `globals.css`의 `:root`(다크)와 `:root[data-theme='light']` 값과 **같아야
 * 한다.** 구단·등급 색은 이 표면 위에서 대비를 계산하므로, 둘이 어긋나면
 * 테스트는 통과해도 실제 화면에서 대비가 깨진다. 테스트가 두 값을 대조한다.
 */

export type Scheme = 'dark' | 'light';

export interface BaseSurface {
  bgBase: string;
  bgCard: string;
  ink1: string;
  ink2: string;
  /** 구단을 고르지 않았을 때의 강조색 — 브랜드 기본값 */
  accent: string;
  accentInk: string;
}

export const BASE: Record<Scheme, BaseSurface> = {
  dark: {
    bgBase: '#0c1117',
    bgCard: '#161d26',
    ink1: '#f2f5f7',
    ink2: '#9aa6b2',
    accent: '#ffc53d',
    accentInk: '#101418',
  },
  light: {
    bgBase: '#f7f8fa',
    bgCard: '#ffffff',
    ink1: '#101418',
    ink2: '#5c6873',
    accent: '#856404',
    accentInk: '#ffffff',
  },
};

/** 강조색 위 글자 후보. 진한 잉크와 흰색 중 대비가 큰 쪽을 쓴다. */
export const INK_CANDIDATES: readonly [string, string] = ['#101418', '#ffffff'];
