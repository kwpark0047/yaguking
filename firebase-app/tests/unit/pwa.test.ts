import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { isIosSafari, manualInstallPossible, platformOf } from '@/lib/pwa/install';

/** 홈 화면에 추가(PWA)·즐겨찾기 — 기기 판별, 매니페스트·아이콘, 서비스 워커가 저장하는 것(docs/pwa.md) */
const root = join(__dirname, '../..');
const UA = {
  windowsChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  windowsFirefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
  macSafari17: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  macSafari16: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15',
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0 Mobile/15E148 Safari/604.1',
  iphoneKakao: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.8.0',
  android: 'Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
};

describe('기기·브라우저 판별', () => {
  it('윈도·맥·아이폰·안드로이드, 아이패드(맥처럼 보이지만 터치)', () => {
    expect(platformOf(UA.windowsChrome)).toBe('desktop');
    expect(platformOf(UA.macSafari17)).toBe('mac');
    expect(platformOf(UA.macSafari17, 5)).toBe('ios'); // iPadOS
    expect(platformOf(UA.iphoneSafari)).toBe('ios');
    expect(platformOf(UA.android)).toBe('android');
  });

  it('iOS 사파리만 "홈 화면에 추가" 순서 안내, 크롬·카카오톡 안 브라우저는 사파리로 안내', () => {
    expect(isIosSafari(UA.iphoneSafari)).toBe(true);
    expect(isIosSafari(UA.iphoneChrome)).toBe(false);
    expect(isIosSafari(UA.iphoneKakao)).toBe(false);
  });

  it('설치 창이 없어도 따라 하면 되는 곳 — 모바일, 데스크톱 크롬·엣지, 맥 사파리 17+. 파이어폭스·옛 사파리는 북마크만', () => {
    expect(manualInstallPossible('desktop', UA.windowsChrome)).toBe(true);
    expect(manualInstallPossible('desktop', UA.windowsFirefox)).toBe(false);
    expect(manualInstallPossible('mac', UA.macSafari17)).toBe(true);
    expect(manualInstallPossible('mac', UA.macSafari16)).toBe(false);
    expect(manualInstallPossible('ios', UA.iphoneKakao)).toBe(true);
    expect(manualInstallPossible('android', UA.android)).toBe(true);
  });
});

/** PNG 크기(IHDR) */
function pngSize(file: string): [number, number] {
  const buffer = readFileSync(join(root, 'public', file));
  expect(buffer.subarray(1, 4).toString()).toBe('PNG');
  return [buffer.readUInt32BE(16), buffer.readUInt32BE(20)];
}

describe('매니페스트·아이콘', () => {
  const manifest = JSON.parse(readFileSync(join(root, 'public/manifest.webmanifest'), 'utf8'));

  it('이름 "야구왕", 시작 주소·범위 /, standalone, 색, 192·512 아이콘(maskable 포함)', () => {
    expect(manifest).toMatchObject({ name: '야구왕', short_name: '야구왕', start_url: '/', scope: '/', display: 'standalone', lang: 'ko' });
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/i);
    for (const purpose of ['any', 'maskable']) {
      for (const size of [192, 512]) {
        const icon = manifest.icons.find((item: { sizes: string; purpose: string }) => item.sizes === `${size}x${size}` && item.purpose === purpose);
        expect(icon, `${purpose} ${size}`).toBeDefined();
        expect(pngSize(icon.src.slice(1))).toEqual([size, size]);
      }
    }
    expect(pngSize('icons/apple-touch-icon.png')).toEqual([180, 180]);
  });

  it('index.html이 매니페스트·테마 색·애플 아이콘을 건다', () => {
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest" />');
    expect(html).toContain(`<meta name="theme-color" content="${manifest.theme_color}" />`);
    expect(html).toContain('rel="apple-touch-icon" href="/icons/apple-touch-icon.png"');
  });
});

describe('서비스 워커가 저장하는 것', () => {
  // public/sw.js를 가짜 서비스 워커 환경에서 읽어 cacheable()만 꺼낸다
  const source = readFileSync(join(root, 'public/sw.js'), 'utf8');
  const context = { self: { addEventListener: () => {}, location: { origin: 'https://yaguking.web.app' } }, URL } as Record<string, unknown>;
  vm.runInNewContext(`${source}\nthis.cacheable = cacheable;`, context);
  const cacheable = context.cacheable as (request: { method: string; url: string }) => boolean;
  const get = (url: string) => ({ method: 'GET', url });

  it('같은 주소의 해시 정적 파일·아이콘만', () => {
    expect(cacheable(get('https://yaguking.web.app/assets/index-DnOcf0Dn.js'))).toBe(true);
    expect(cacheable(get('https://yaguking.web.app/icons/icon-192.png'))).toBe(true);
  });

  it('화면(HTML)·로그인 처리(/__/)·다른 주소(인증·Firestore)·GET 아닌 요청·검색어 붙은 주소는 저장하지 않는다', () => {
    expect(cacheable(get('https://yaguking.web.app/'))).toBe(false);
    expect(cacheable(get('https://yaguking.web.app/ranking'))).toBe(false);
    expect(cacheable(get('https://yaguking.web.app/__/auth/handler'))).toBe(false);
    expect(cacheable(get('https://firestore.googleapis.com/v1/projects/x/databases/(default)/documents/users/a'))).toBe(false);
    expect(cacheable(get('https://identitytoolkit.googleapis.com/v1/accounts:lookup'))).toBe(false);
    expect(cacheable({ method: 'POST', url: 'https://yaguking.web.app/assets/a.js' })).toBe(false);
    expect(cacheable(get('https://yaguking.web.app/assets/a.js?token=1'))).toBe(false);
  });

  it('판이 바뀌면 이전 판 저장소를 지우고, 오프라인 화면을 약속하지 않는다(화면 요청을 가로채지 않음)', () => {
    expect(source).toMatch(/const CACHE = 'yaguking-static-v\d+'/);
    expect(source).toContain("name.startsWith('yaguking-') && name !== CACHE");
    expect(source).not.toMatch(/navigate/);
  });
});
