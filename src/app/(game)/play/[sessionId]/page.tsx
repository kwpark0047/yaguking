import Link from 'next/link';
import { PlayClient } from '@/components/game/PlayClient';
import { resolveOwnerFromCookies } from '@/server/auth/resolveOwner';
import { loadResumableSession } from '@/server/play/resume';

/**
 * V02 경기 화면 (08 문서 §4).
 *
 * lg에서는 좌측 사이드바 + 중앙 경기 + 우측 정보 패널 3열이다. 좌측은 여기서,
 * 중앙과 우측은 PlayClient가 그린다 (우측 패널은 경기 상태를 쓰므로).
 */
export const dynamic = 'force-dynamic';

export default async function PlayPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const owner = await resolveOwnerFromCookies();

  if (!owner) return <Unavailable message="세션을 확인할 수 없습니다." />;

  let session = null;
  try {
    session = await loadResumableSession(sessionId, owner);
  } catch {
    return <Unavailable message="경기를 찾을 수 없습니다." />;
  }

  if (!session) {
    return <Unavailable message="이미 종료된 경기입니다." />;
  }

  return (
    <div className="lg:mx-auto lg:grid lg:max-w-[1320px] lg:grid-cols-[240px_1fr] lg:gap-6">
      <SideNav />
      <PlayClient initial={session} />
    </div>
  );
}

/** lg 전용 좌측 사이드바. 경기 중에는 하단 탭 대신 이것이 네비게이션이다. */
function SideNav() {
  return (
    <aside
      className="hidden lg:flex lg:flex-col lg:gap-4 lg:py-4"
      aria-label="주요 메뉴"
    >
      <p className="text-lg font-bold">야구왕</p>
      <nav className="flex flex-col gap-1 text-sm">
        <span className="rounded-option bg-bg-field px-3 py-2 font-semibold">경기</span>
        <span className="px-3 py-2 text-ink-2">내 기록 · 단계 8</span>
        <span className="px-3 py-2 text-ink-2">랭킹 · 단계 8</span>
      </nav>
    </aside>
  );
}

function Unavailable({ message }: { message: string }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4">
      <h1 className="text-xl font-bold">{message}</h1>
      <Link
        href="/"
        className="min-h-14 rounded-option px-4 py-4 text-center font-semibold"
        style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
      >
        새 경기 시작
      </Link>
    </main>
  );
}
