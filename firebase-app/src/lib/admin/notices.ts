/**
 * 공지사항 — 관리자 원본(`notices/{id}`)과 이용자 앱이 읽는 공개 묶음(`public/home`의 notices).
 * 순수 함수. 시각은 밀리초(ms)로 주입받는다.
 */
export const NOTICE_TITLE_MAX = 80;
export const NOTICE_BODY_MAX = 2000;
/** 공개 묶음에 싣는 공지 수(규칙: 20 이하) */
export const PUBLIC_NOTICES_MAX = 20;

export interface Notice {
  id: string;
  title: string;
  body: string;
  startsAt: number;
  endsAt: number | null;
  pinned: boolean;
  hidden: boolean;
  /** 원본을 처음 만든 시각(관리자 쪽에만 — 고쳐도 바뀌지 않는다) */
  createdAt?: number;
}

/** 공개 묶음에 싣는 모양(숨김 여부·만든 시각은 싣지 않는다) */
export type PublicNotice = Omit<Notice, 'hidden' | 'createdAt'>;

export function noticeProblem(input: { title: string; body: string; startsAt: number; endsAt: number | null }): string | null {
  const title = input.title.trim();
  if (title.length === 0) return '제목을 적어 주세요.';
  if (title.length > NOTICE_TITLE_MAX) return `제목은 ${NOTICE_TITLE_MAX}자까지예요.`;
  if (input.body.length > NOTICE_BODY_MAX) return `본문은 ${NOTICE_BODY_MAX}자까지예요.`;
  if (!Number.isFinite(input.startsAt)) return '공개 시작 시각을 정해 주세요.';
  if (input.endsAt !== null && input.endsAt <= input.startsAt) return '공개 끝은 시작보다 뒤여야 해요.';
  return null;
}

/** 고정 먼저, 그다음 최근 시작 순 */
export const byPinnedThenRecent = <T extends Pick<Notice, 'pinned' | 'startsAt'>>(a: T, b: T) =>
  Number(b.pinned) - Number(a.pinned) || b.startsAt - a.startsAt;

/**
 * 공개 묶음: 숨기지 않았고 아직 끝나지 않은 공지(예약 공개 포함 — 시작 전 공지는 이용자 앱이 걸러 보여 준다).
 */
export function buildPublicNotices(notices: readonly Notice[], now: number): PublicNotice[] {
  return notices
    .filter((notice) => !notice.hidden && (notice.endsAt === null || notice.endsAt > now))
    .sort(byPinnedThenRecent)
    .slice(0, PUBLIC_NOTICES_MAX)
    .map(({ hidden: _hidden, createdAt: _createdAt, ...rest }) => rest);
}

/** 이용자 앱이 지금 보여 줄 공지 */
export function visibleNotices<T extends Pick<Notice, 'startsAt' | 'endsAt' | 'pinned'>>(notices: readonly T[], now: number): T[] {
  return notices
    .filter((notice) => notice.startsAt <= now && (notice.endsAt === null || notice.endsAt > now))
    .sort(byPinnedThenRecent);
}
