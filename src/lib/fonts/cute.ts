import { Jua } from 'next/font/google';

/**
 * 메인 페이지·제목용 둥근 글꼴(Jua, SIL OFL).
 *
 * `next/font`가 빌드 때 받아 **자체 호스팅**한다 — 방문자 브라우저가 Google에
 * 요청하지 않는다. 한글 글리프는 unicode-range로 쪼개져 있어 미리 받지 않고
 * (`preload: false`) 쓰인 글자만 내려받는다.
 *
 * 제목·버튼에만 쓴다(`.font-cute`). 본문은 읽기 쉬운 시스템 글꼴 그대로다.
 */
export const cuteFont = Jua({
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
  preload: false,
  variable: '--font-cute',
  fallback: ['system-ui', 'Malgun Gothic', 'sans-serif'],
});
