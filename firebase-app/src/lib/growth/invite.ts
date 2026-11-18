/**
 * 친구 초대 1단계(기획: 야구왕 친구 초대·팀 플레이 기획 §2·§3, 운영자 결정 2026-11-18).
 *
 * - 회원마다 한 번 만드는 6자리 초대 코드. 링크로 들어온 코드는 기기에 30일 두었다가 가입(닉네임)할 때 한 번 연결한다
 * - 보상은 가입이 아니라 활동 확인(연결 후 7일 안에 서로 다른 2일 경기) 뒤 운영자 PC 0시 작업이 준다(ops/invite.mjs)
 * - 포인트는 힌트에만 쓰는 **보너스 포인트**(월간 등수에 넣지 않음). 현금·상품으로 바꿀 수 없다
 * - 처리방침 개정판 시행일(INVITE_START)부터만 동작한다. 그 전에는 주소를 읽지도, 코드를 만들지도 않는다
 *
 * 이 파일은 Firebase를 불러오지 않는다(첫 화면 묶음에 들어간다). 쓰기·읽기는 inviteApi.ts.
 */

/** 처리방침 개정판 시행일 — ops/invite.mjs와 같아야 한다(단위 테스트). 규칙은 날짜를 막지 않는다 — 시행일 전에는 앱이 코드를 만들지도 읽지도 않는다 */
export const INVITE_START = '2026-12-01';

/** 코드 글자 — 헷갈리는 0·O·1·I를 뺀 대문자·숫자. firestore.rules의 정규식과 같아야 한다(단위 테스트) */
export const INVITE_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const INVITE_CODE_LENGTH = 6;
export const INVITE_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;

/** 기기 저장 키(localStorage) — 링크로 받은 코드를 가입할 때까지. 처리방침 10절 */
export const INVITE_KEY = 'yk_invite';
export const INVITE_REMEMBER_DAYS = 30;

/** 보상(운영자 결정 2026-11-18) — ops/invite.mjs와 같아야 한다(단위 테스트) */
export const INVITE_POINTS = { inviter: 100, invitee: 50 } as const;
/** 한 달에 초대한 사람이 보상받는 최대 인원 */
export const INVITE_MONTHLY_CAP = 10;
/** 활동 확인: 연결한 날부터 ACTIVE_WINDOW_DAYS일 안에 서로 다른 ACTIVE_DAYS일 경기 */
export const INVITE_ACTIVE_WINDOW_DAYS = 7;
export const INVITE_ACTIVE_DAYS = 2;
/** 연결은 가입(프로필 생성) 후 이 기간 안에만 — 오래된 회원이 남의 코드를 넣어 보상받지 못하게. firestore.rules와 같아야 한다 */
export const INVITE_LINK_WITHIN_DAYS = 7;

/** 누적 보상 인원에 따른 칭호와 한 번 주는 보너스 */
export const INVITE_MILESTONES = [
  { count: 3, title: 'scout', name: '스카우트', points: 100 },
  { count: 10, title: 'gm', name: '단장', points: 300 },
] as const;

/** 초대 이벤트 — 기간 안에 활동이 확인된 초대의 포인트를 배수로. 마지막 날 포함(한국 날짜) */
export const INVITE_EVENTS = [
  { id: 'scout-week-2026', name: '비시즌 스카우트 주간', start: '2026-12-01', end: '2026-12-14', multiplier: 2 },
] as const;

export type InviteStatus = 'joined' | 'rewarded' | 'expired' | 'revoked';

export const INVITE_STATUS_LABEL: Record<InviteStatus, string> = {
  joined: '가입 — 활동 확인 중',
  rewarded: '보상 완료',
  expired: '기간 지남',
  revoked: '취소됨',
};

export const kstDate = (now: number = Date.now()) => new Date(now + 9 * 3_600_000).toISOString().slice(0, 10);

/** 화면을 여는 시작일. 에뮬레이터 개발·E2E에서만 VITE_INVITE_START로 앞당길 수 있다(hintStart와 같은 방식) */
export function inviteStart(): string {
  const env = import.meta.env as Record<string, string | undefined> | undefined;
  const override = env?.VITE_INVITE_START;
  return env?.VITE_USE_EMULATORS !== 'false' && override ? override : INVITE_START;
}

export function invitesOpen(now: number = Date.now(), start: string = inviteStart()): boolean {
  return kstDate(now) >= start;
}

export function eventOn(day: string): (typeof INVITE_EVENTS)[number] | null {
  return INVITE_EVENTS.find((event) => event.start <= day && day <= event.end) ?? null;
}

/** 다음(또는 지금) 이벤트 — 화면 안내용 */
export function currentOrNextEvent(day: string): (typeof INVITE_EVENTS)[number] | null {
  return INVITE_EVENTS.find((event) => day <= event.end) ?? null;
}

export function isInviteCode(value: unknown): value is string {
  return typeof value === 'string' && INVITE_CODE_PATTERN.test(value);
}

/** 사람이 적은 코드를 고친다(소문자·공백·하이픈) — 맞지 않으면 null */
export function normalizeInviteCode(value: string): string | null {
  const code = value.replace(/[\s-]/g, '').toUpperCase();
  return isInviteCode(code) ? code : null;
}

/** 새 코드(난수는 주입) */
export function makeInviteCode(random: () => number = Math.random): string {
  let code = '';
  for (let index = 0; index < INVITE_CODE_LENGTH; index += 1) {
    code += INVITE_CODE_CHARS.charAt(Math.floor(random() * INVITE_CODE_CHARS.length) % INVITE_CODE_CHARS.length);
  }
  return code;
}

/** 공유 링크 — 유입 출처는 기존 목록의 '앱 안 공유'(share)에 캠페인 invite로 남는다(새 출처를 만들지 않음) */
export function inviteLink(origin: string, code: string): string {
  return `${origin}/?invite=${code}&utm_source=share&utm_campaign=invite`;
}

export function inviteShareText(code: string, link: string): string {
  return `야구왕에서 같이 야구 상식 대결해요! 가입할 때 초대 코드 ${code}가 자동으로 들어가요.\n${link}`;
}

/** 주소의 검색 부분 → 초대 코드(순수 함수) */
export function parseInvite(search: string): string | null {
  const raw = new URLSearchParams(search).get('invite');
  return raw ? normalizeInviteCode(raw) : null;
}

/** 주소에서 invite 칸을 뺀 주소(순수 함수) */
export function withoutInvite(href: string): string {
  const url = new URL(href);
  url.searchParams.delete('invite');
  return url.toString();
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** 기기에 둔 초대 코드(30일 지나면 없음) */
export function pendingInvite(now: number = Date.now()): string | null {
  try {
    const saved = JSON.parse(storage()?.getItem(INVITE_KEY) ?? 'null') as { code?: unknown; at?: unknown } | null;
    if (!saved || !isInviteCode(saved.code) || typeof saved.at !== 'number') return null;
    if (now - saved.at > INVITE_REMEMBER_DAYS * 86_400_000) return null;
    return saved.code;
  } catch {
    return null;
  }
}

export function clearPendingInvite(): void {
  try {
    storage()?.removeItem(INVITE_KEY);
  } catch {
    // 저장소를 못 쓰면 지울 것도 없다
  }
}

/**
 * 앱을 열 때 한 번(main.tsx). 링크의 초대 코드를 기기에 둔다 — 이미 둔 코드가 있으면 그대로(처음 초대한 사람 우선).
 * 주소창에서는 invite 칸을 지운다(다시 공유되지 않게).
 */
export function captureInvite(now: number = Date.now()): void {
  if (!invitesOpen(now) || typeof location === 'undefined') return;
  const code = parseInvite(location.search);
  if (!code) return;
  try {
    const store = storage();
    if (store && pendingInvite(now) === null) store.setItem(INVITE_KEY, JSON.stringify({ code, at: now }));
  } catch {
    // 저장소를 못 쓰면 가입 화면에서 코드를 직접 넣을 수 있다
  }
  try {
    history.replaceState(history.state, '', withoutInvite(location.href));
  } catch {
    // 주소를 못 바꿔도 기능에는 지장 없다
  }
}
