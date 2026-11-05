import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { checkTossDist } from '../../scripts/toss-check.mjs';
import * as webShare from '@/lib/platform/share';
import * as tossShare from '@/toss/share';

/** 앱인토스 미니앱판(docs/toss-miniapp.md) — 정책 점검과, 판마다 바꿔 끼우는 모듈이 서로 맞는지 */
const page = (text: string, path = 'assets/a.js') => [
  { path: 'index.html', text: '<html></html>' },
  { path: 'assets/a.css', text: '.min-h-14{} .sr-only{} .g-option{}' },
  { path, text },
];

describe('미니앱 결과물 점검', () => {
  it('깨끗한 묶음은 통과', () => {
    expect(checkTossDist(page('console.warn(1)'))).toEqual([]);
  });

  it('Tailwind가 src/를 못 읽어 화면 클래스가 CSS에 없으면 멈춘다', () => {
    expect(checkTossDist([{ path: 'index.html', text: '' }, { path: 'assets/a.css', text: '.flex{}' }]).join()).toContain('min-h-14');
  });

  it.each([
    ['구글 로그인', 'https://accounts.google.com/x'],
    ['서비스 워커 등록', 'navigator.serviceWorker.register("/sw.js")'],
    ['홈 화면 설치 권유', 'addEventListener("beforeinstallprompt",f)'],
    ['달력', 'BEGIN:VCALENDAR'],
    ['매니페스트', '<link href="/manifest.webmanifest">'],
  ])('%s이 들어 있으면 멈춘다', (reason, text) => {
    expect(checkTossDist(page(text)).join()).toContain(reason);
  });
});

describe('판마다 바꿔 끼우는 모듈', () => {
  it('공유 모듈은 두 판의 내보내기가 같다(APP_NAME만 미니앱에)', () => {
    const toss = Object.keys(tossShare).filter((name) => name !== 'APP_NAME').sort();
    expect(toss).toEqual(Object.keys(webShare).sort());
  });

  it('공유 링크: 웹은 앱 주소, 미니앱은 intoss://(자사 웹으로 가지 않는다)', () => {
    vi.stubGlobal('location', { origin: 'https://yaguking.web.app' });
    expect(webShare.appUrl('/daily')).toBe('https://yaguking.web.app/daily');
    expect(tossShare.appUrl('/room/ABC234')).toBe('intoss://yaguking/room/ABC234');
    vi.unstubAllGlobals();
  });

  it('appName이 설정 파일과 공유 모듈에서 같다, 묶는 폴더는 dist-toss', () => {
    const config = readFileSync(new URL('../../apps-in-toss.config.ts', import.meta.url), 'utf8');
    expect(config).toContain(`appName: '${tossShare.APP_NAME}'`);
    expect(config).toContain("webBundleDir: 'dist-toss'");
  });

  it('웹판 진입점은 토스 코드를 불러오지 않는다', () => {
    for (const file of ['../../src/main.tsx', '../../src/App.tsx', '../../src/pages/HomePage.tsx']) {
      expect(readFileSync(new URL(file, import.meta.url), 'utf8'), file).not.toMatch(/apps-in-toss|@\/toss\//);
    }
  });
});
