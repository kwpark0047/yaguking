import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkDist, checkTarget, loadEnv } from '../../scripts/predeploy-check.mjs';

/** 8단계 — 배포 전 점검(firebase.json predeploy)과 Hosting 설정 */
const env = {
  VITE_FIREBASE_API_KEY: 'AIza-test',
  VITE_FIREBASE_AUTH_DOMAIN: 'yaguking.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'yaguking',
  VITE_FIREBASE_APP_ID: '1:2:web:3',
};

describe('배포 대상·설정', () => {
  it('데모 프로젝트, 모르는 프로젝트, 빈 설정, 다른 프로젝트 설정은 거절', () => {
    expect(checkTarget('demo-yaguking', env).join()).toMatch(/데모/);
    expect(checkTarget(undefined, env).join()).toMatch(/모릅니다/);
    expect(checkTarget('yaguking', { ...env, VITE_FIREBASE_APP_ID: '' }).join()).toMatch(/VITE_FIREBASE_APP_ID/);
    expect(checkTarget('yaguking-staging', env).join()).toMatch(/다릅니다/);
    expect(checkTarget('yaguking', env)).toEqual([]);
  });

  it('.env 파일을 Vite와 같은 순서로 읽고, 실행 환경 값이 이긴다', () => {
    const dir = mkdtempSync(join(tmpdir(), 'yk-env-'));
    writeFileSync(join(dir, '.env'), 'VITE_FIREBASE_PROJECT_ID=from-env\n');
    writeFileSync(join(dir, '.env.production.local'), 'VITE_FIREBASE_PROJECT_ID="from-prod-local"\r\nVITE_X=1\n');
    expect(loadEnv(dir, {}).VITE_FIREBASE_PROJECT_ID).toBe('from-prod-local');
    expect(loadEnv(dir, { VITE_FIREBASE_PROJECT_ID: 'from-shell' }).VITE_FIREBASE_PROJECT_ID).toBe('from-shell');
  });
});

describe('결과물 검사', () => {
  const ok = [
    { path: 'index.html', text: '<!doctype html>' },
    { path: 'assets/index-abc.js', text: 'initializeApp({projectId:"yaguking"})' },
    { path: 'assets/jua-subset.woff2', text: null },
  ];

  it('운영 빌드는 통과', () => {
    expect(checkDist(ok)).toEqual([]);
  });

  it('이용자 앱 결과물에 관리자 사이트 코드가 섞이면 거절(관리자 사이트 결과물은 괜찮음)', () => {
    const leaked = [...ok, { path: 'assets/a.js', text: "collection(db,'accountMirror')" }];
    expect(checkDist(leaked).join()).toMatch(/관리자 사이트 코드/);
    expect(checkDist(leaked, 'admin')).toEqual([]);
  });

  it('에뮬레이터 빌드·비밀 키·서비스 계정·소스맵·공식 정답은 거절', () => {
    const bad = (path: string, text: string | null) => checkDist([...ok, { path, text }]);
    expect(bad('assets/a.js', 'connectAuthEmulator("http://127.0.0.1:9099")').join()).toMatch(/에뮬레이터/);
    expect(bad('assets/a.js', 'projectId:"demo-yaguking"').join()).toMatch(/데모/);
    expect(bad('assets/a.js', '-----BEGIN PRIVATE KEY-----').join()).toMatch(/개인 키/);
    expect(bad('sa.json', '{"type": "service_account"}').join()).toMatch(/서비스 계정/);
    expect(bad('assets/a.js.map', '{}').join()).toMatch(/소스맵/);
    expect(bad('assets/a.js', 'officialKeys').join()).toMatch(/공식 정답/);
    expect(checkDist([]).join()).toMatch(/index\.html/);
  });
});

describe('GitHub 자동 배포·정리는 꺼져 있다', () => {
  const workflow = (name: string) => readFileSync(join(__dirname, '../../../.github/workflows', name), 'utf8');
  const triggers = (text: string) =>
    text
      .split(/\r?\n/)
      .filter((line) => /^ {2}[a-z_]+:/.test(line)) // on: 아래 2칸 들여쓴 트리거(주석 줄은 #으로 시작해 빠진다)
      .map((line) => line.trim().replace(':', ''))
      .filter((key) => ['push', 'pull_request', 'schedule', 'workflow_run', 'workflow_dispatch', 'release'].includes(key));

  it('배포: 손으로 누를 때만, 저장소 변수로 켜야, 실제 배포는 production 환경 승인', () => {
    const text = workflow('firebase-deploy.yml');
    expect(triggers(text)).toEqual(['workflow_dispatch']);
    expect(text).toContain("if: vars.FIREBASE_DEPLOY_ENABLED == 'true'");
    expect(text).toContain("inputs.target == 'live' && 'production'");
    expect(text).not.toMatch(/credentials_json|FIREBASE_TOKEN/); // 키 파일·옛 토큰 대신 WIF
  });

  it('정리: 예약은 주석, 저장소 변수로 켜야, 손으로 누르면 기본이 미리 보기', () => {
    const text = workflow('firebase-cleanup.yml');
    expect(triggers(text)).toEqual(['workflow_dispatch']);
    expect(text).toMatch(/^ {2}# schedule:/m);
    expect(text).toContain("if: vars.FIREBASE_CLEANUP_ENABLED == 'true'");
    expect(text).toMatch(/apply:[\s\S]*?default: false/);
  });

  it('CI는 검사만 — 배포 명령이 없다', () => {
    expect(workflow('firebase-app-ci.yml')).not.toMatch(/firebase deploy|hosting:channel:deploy/);
  });
});

interface HostingSite {
  target: string;
  public: string;
  predeploy: string[];
  ignore: string[];
  rewrites: { source?: string; destination: string }[];
  headers: { source: string; headers: { key: string; value: string }[] }[];
}

describe('Hosting 설정(firebase.json) — 이용자 앱과 관리자 사이트 두 개', () => {
  const config = JSON.parse(readFileSync(join(__dirname, '../../firebase.json'), 'utf8')) as { hosting: HostingSite[] };
  const site = (target: string) => config.hosting.find((item) => item.target === target)!;
  const header = (target: string, source: string, key: string) =>
    site(target).headers.find((rule) => rule.source === source)?.headers.find((item) => item.key === key)?.value;

  it('두 사이트, 각자 결과물 폴더와 배포 직전 점검', () => {
    expect(config.hosting.map((item) => item.target)).toEqual(['app', 'admin']);
    expect(site('app')).toMatchObject({ public: 'dist', predeploy: ['node scripts/predeploy-check.mjs'] });
    expect(site('admin')).toMatchObject({ public: 'dist-admin', predeploy: ['node scripts/predeploy-check.mjs --admin'] });
    // Firebase CLI는 '='이 든 predeploy 명령을 실행하지 않고 넘어간다(경고만) — 점검 없이 옛 빌드가 올라간다
    for (const target of ['app', 'admin']) for (const command of site(target).predeploy) expect(command).not.toContain('=');
    for (const target of ['app', 'admin']) expect(site(target).ignore).toContain('**/*.map');
    const rc = JSON.parse(readFileSync(join(__dirname, '../../.firebaserc'), 'utf8'));
    expect(rc.targets['yaguking-bc25c'].hosting).toEqual({ app: ['yaguking-bc25c'], admin: ['yaguking-bc25c-admin'] });
  });

  it('화면 주소만 index.html로 — 점이 든 주소(없는 묶음 파일 등)는 404', () => {
    // "**" 하나로 다 받으면 없는 /assets/x.js에도 index.html을 1년 캐시로 돌려줬다(첫 배포 뒤 발견).
    // 확인: Hosting 에뮬레이터·미리보기에서 /play 200, /assets/없는파일.js 404
    for (const target of ['app', 'admin']) {
      expect(site(target).rewrites).toEqual([{ source: '**/!(*.*)', destination: '/index.html' }]);
    }
    for (const file of ['../../src/App.tsx', '../../src/admin/AdminApp.tsx']) {
      const routes = [...readFileSync(join(__dirname, file), 'utf8').matchAll(/path="([^"]+)"/g)].map((match) => match[1]!);
      expect(routes.length).toBeGreaterThan(5);
      for (const route of routes) expect(route, `화면 주소에 점이 있으면 404가 난다: ${route}`).not.toContain('.');
    }
  });

  it('이용자 앱: 같은 헤더는 뒤 규칙이 이긴다 — 전체(**)를 먼저, 묶음 파일(/assets/**)을 뒤에', () => {
    const sources = site('app').headers.map((rule) => rule.source);
    expect(sources.indexOf('**')).toBeLessThan(sources.indexOf('/assets/**'));
    expect(header('app', '**', 'Cache-Control')).toBe('no-cache'); // 새 배포가 바로 보이게
    expect(header('app', '/assets/**', 'Cache-Control')).toMatch(/immutable/); // 이름에 해시가 있는 파일
    expect(header('app', '**', 'X-Frame-Options')).toBe('DENY');
    expect(header('app', '**', 'X-Robots-Tag')).toBe('noindex'); // 출시 전까지 검색 노출 막기
  });

  it('관리자 사이트: CSP는 강제, 화면은 저장하지 않음, 검색·링크 따라가기 금지, 다른 사이트가 못 띄움', () => {
    expect(header('admin', '**', 'Content-Security-Policy')).toMatch(/frame-ancestors 'none'/);
    expect(header('admin', '**', 'Content-Security-Policy-Report-Only')).toBeUndefined();
    expect(header('admin', '**', 'Cache-Control')).toBe('no-store');
    expect(header('admin', '**', 'X-Robots-Tag')).toBe('noindex, nofollow');
    expect(header('admin', '**', 'Referrer-Policy')).toBe('no-referrer');
    const sources = site('admin').headers.map((rule) => rule.source);
    expect(sources.indexOf('**')).toBeLessThan(sources.indexOf('/assets/**'));
  });
});
