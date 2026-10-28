import { useSyncExternalStore } from 'react';

/**
 * 홈 화면에 추가(PWA) — 설치 가능 여부·설치됨·"나중에"를 한곳에서. 화면은 InstallGuide·InstallOffer·BookmarkButton.
 *
 * - 크롬·엣지·삼성 인터넷(안드로이드·데스크톱)은 `beforeinstallprompt`를 보낸다 → 그 이벤트를 붙잡아 두었다가 "앱 설치하기"에서 띄운다
 * - iOS 사파리 등 이벤트가 없는 브라우저는 직접 따라 할 안내만(자동 설치·자동 북마크는 브라우저가 막는다)
 * - 설치하면(`appinstalled`) 또는 홈 화면 앱으로 열렸으면(display-mode: standalone) 다시 권하지 않는다
 * - "나중에"는 이 기기에만 기억(`yk_pwa`) — 가입 직후 자동 권유를 다시 띄우지 않는다. 설정·머리줄 별표에서는 언제든 다시 연다
 */
export type Platform = 'ios' | 'android' | 'mac' | 'desktop';

export const PWA_KEY = 'yk_pwa';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface Stored {
  installed?: boolean;
  dismissedAt?: number;
}

/** 기기 종류 — iPadOS 사파리는 맥으로 자기를 소개하므로 터치 지점 수로 가린다 */
export function platformOf(userAgent: string, maxTouchPoints = 0): Platform {
  if (/iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1)) return 'ios';
  if (/Android/i.test(userAgent)) return 'android';
  if (/Macintosh|Mac OS X/i.test(userAgent)) return 'mac';
  return 'desktop';
}

/** iOS에서 사파리인가(크롬 CriOS·파이어폭스 FxiOS·엣지 EdgiOS·인앱 브라우저가 아님) */
export function isIosSafari(userAgent: string): boolean {
  return /Safari/i.test(userAgent) && !/CriOS|FxiOS|EdgiOS|KAKAOTALK|NAVER|Instagram|FBAN|Line\//i.test(userAgent);
}

/** 설치 이벤트가 없어도 사람이 따라 하면 설치되는 곳 — 모바일 전부, 데스크톱 크롬·엣지·맥 사파리 17+ */
export function manualInstallPossible(platform: Platform, userAgent: string): boolean {
  if (platform === 'ios' || platform === 'android') return true;
  if (/Edg\/|Chrome\//.test(userAgent) && !/OPR\//.test(userAgent)) return true;
  const safari = /Version\/(\d+)[.\d]* Safari/.exec(userAgent);
  return platform === 'mac' && !!safari && Number(safari[1]) >= 17;
}

function readStored(): Stored {
  try {
    return JSON.parse(localStorage.getItem(PWA_KEY) ?? '{}') as Stored;
  } catch {
    return {};
  }
}

function writeStored(next: Stored): void {
  try {
    localStorage.setItem(PWA_KEY, JSON.stringify(next));
  } catch {
    // 사생활 보호 모드 등 — 이번 방문 동안만 기억
  }
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches === true || (navigator as { standalone?: boolean }).standalone === true;
}

let deferred: BeforeInstallPromptEvent | null = null;
let installedNow = false;
let dismissedNow = false;
let snapshot: InstallState | null = null;
const listeners = new Set<() => void>();

export interface InstallState {
  platform: Platform;
  /** 홈 화면 앱으로 열렸거나 이 기기에서 설치를 마쳤다 */
  installed: boolean;
  /** 브라우저의 설치 창을 바로 띄울 수 있다 */
  canPrompt: boolean;
  /** 설치 창은 없어도 안내를 따라 하면 설치된다 */
  manual: boolean;
  /** 가입 직후 권유에서 "나중에"를 골랐다 */
  dismissed: boolean;
  iosSafari: boolean;
}

function compute(): InstallState {
  const userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const platform = platformOf(userAgent, typeof navigator === 'undefined' ? 0 : navigator.maxTouchPoints);
  const stored = readStored();
  return {
    platform,
    installed: installedNow || stored.installed === true || isStandalone(),
    canPrompt: deferred !== null,
    manual: manualInstallPossible(platform, userAgent),
    dismissed: dismissedNow || typeof stored.dismissedAt === 'number',
    iosSafari: platform === 'ios' && isIosSafari(userAgent),
  };
}

function notify() {
  snapshot = compute();
  for (const listener of listeners) listener();
}

/** 앱을 시작할 때 한 번 — 설치 이벤트는 화면이 뜨기 전에 올 수 있어 일찍 붙잡는다 */
export function watchInstall(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault(); // 브라우저의 자동 미니 안내 대신 우리 단추로
    deferred = event as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    installedNow = true;
    writeStored({ ...readStored(), installed: true });
    notify();
  });
}

/** 브라우저 설치 창 띄우기. 이벤트가 없으면 'unavailable'(안내를 보여 줄 차례) */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const event = deferred;
  if (!event) return 'unavailable';
  deferred = null; // 한 번 쓴 이벤트는 다시 못 쓴다
  await event.prompt();
  const { outcome } = await event.userChoice;
  notify();
  return outcome;
}

/** 가입 직후 권유에서 "나중에" — 다시 자동으로 띄우지 않는다 */
export function dismissInstallOffer(): void {
  dismissedNow = true;
  writeStored({ ...readStored(), dismissedAt: Date.now() });
  notify();
}

export function useInstall(): InstallState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => (snapshot ??= compute()),
    () => (snapshot ??= compute()),
  );
}

/**
 * 서비스 워커 등록 — 운영 빌드에서만(개발 서버·테스트는 캐시 없이). 화면이 다 뜬 뒤에 등록해 첫 화면을 늦추지 않는다.
 * 새 판이 배포되면 브라우저가 sw.js를 다시 받아 바꾼다(public/sw.js의 판 관리).
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // 등록 실패는 앱 사용과 무관하다(설치 안내는 그대로)
    });
  });
}
