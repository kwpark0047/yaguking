import type { Style } from './base';

/**
 * 화면 스타일 선택 (08 문서 §2.6).
 *
 * **사용자가 고른다.** 성별 같은 개인 정보로 정하지 않고, 서버에도 남기지
 * 않는다. 기기별 쿠키 하나에 담는다 — 클래식 모드처럼 기기 편의 설정이며,
 * 쿠키라서 서버가 첫 화면부터 바로 그릴 수 있다(깜빡임 없음).
 *
 *   auto     — 기기의 '대비 높이기' 설정을 따른다(켜져 있으면 고대비, 아니면 기본)
 *   default  — 기본
 *   soft     — 부드러운
 *   contrast — 고대비
 *
 * 쿠키가 없으면 auto다. 고대비는 접근성 기능이라, 설정 화면을 찾지 못한
 * 사람에게도 기기 설정을 보고 자동으로 적용되어야 한다.
 */

export type StylePreference = 'auto' | Style;

export const STYLE_COOKIE = 'yk_style';
/** 1년. 다시 고를 때까지 유지한다. */
export const STYLE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export const STYLE_OPTIONS: readonly {
  value: StylePreference;
  label: string;
  description: string;
}[] = [
  {
    value: 'auto',
    label: '자동',
    description: "기기의 '대비 높이기' 설정을 따릅니다.",
  },
  { value: 'default', label: '기본', description: '야간 전광판 느낌의 기본 화면입니다.' },
  {
    value: 'soft',
    label: '부드러운',
    description: '따뜻한 바탕과 덜 눈부신 글자, 둥근 모서리로 오래 봐도 편합니다.',
  },
  {
    value: 'contrast',
    label: '고대비',
    description: '글자 대비를 7:1 이상으로 높이고 테두리를 또렷하게 그립니다.',
  },
];

export function parseStylePreference(value: string | null | undefined): StylePreference {
  return value === 'default' || value === 'soft' || value === 'contrast' ? value : 'auto';
}

/** 쿠키 문자열에서 선택값을 읽는다. 브라우저에서 메뉴가 현재 값을 보여 줄 때 쓴다. */
export function readStylePreference(cookie: string): StylePreference {
  const entry = cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${STYLE_COOKIE}=`));
  return parseStylePreference(entry?.slice(STYLE_COOKIE.length + 1));
}

/** 서버가 확정해 그릴 수 있는 스타일. auto면 null — 기기 설정은 브라우저만 안다. */
export function explicitStyle(preference: StylePreference): Style | null {
  return preference === 'auto' ? null : preference;
}

/**
 * auto일 때 기기 설정을 보고 고대비를 켜는 스크립트. <head>에서 **그리기 전에**
 * 돈다. 하이드레이션 뒤에 바꾸면 고대비가 필요한 사람에게 첫 화면이 기본
 * 대비로 한 번 보였다가 바뀐다.
 *
 * `data-style-source`가 user면 손대지 않는다(직접 고른 값이 우선).
 * 기기 설정이 바뀌면 따라간다.
 */
export const AUTO_STYLE_SCRIPT = `(function(){try{var r=document.documentElement;if(r.dataset.styleSource==='user')return;r.dataset.styleSource='auto';var m=window.matchMedia('(prefers-contrast: more)');var s=function(){if(r.dataset.styleSource!=='auto')return;if(m.matches)r.dataset.style='contrast';else delete r.dataset.style;};s();m.addEventListener('change',s);}catch(e){}})();`;

/**
 * 설정에서 고른 스타일을 **즉시** 화면에 입히고 쿠키에 남긴다.
 * 서버는 다음 요청부터 같은 값을 그린다.
 */
export function applyDocumentStyle(preference: StylePreference): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const secure = window.location.protocol === 'https:' ? '; secure' : '';

  if (preference === 'auto') {
    document.cookie = `${STYLE_COOKIE}=; path=/; max-age=0; samesite=lax${secure}`;
    root.dataset.styleSource = 'auto';
    if (window.matchMedia('(prefers-contrast: more)').matches) root.dataset.style = 'contrast';
    else delete root.dataset.style;
    return;
  }

  document.cookie = `${STYLE_COOKIE}=${preference}; path=/; max-age=${STYLE_COOKIE_MAX_AGE}; samesite=lax${secure}`;
  root.dataset.styleSource = 'user';
  root.dataset.style = preference;
}
