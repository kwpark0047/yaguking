import Link from 'next/link';

/**
 * 앱 셸 (08 문서 §6.1, §6.7).
 *
 *   sm — 하단 탭 5개
 *
 * 홈은 메인 페이지(`/`)다. 회원의 덕아웃(`/dashboard`)은 메인 페이지 머리줄의
 * "마이"에서 들어간다. 홈이 회원 전용 화면이면 비회원이 누를 때 로그인으로 튕긴다.
 *   md — 하단 탭 유지
 *   lg — 좌측 사이드바 고정, 최대 폭 1320px 중앙 정렬
 *
 * 경기 화면은 이 셸을 쓰지 않는다(탭을 숨겨야 하므로).
 */

const NAV = [
  { key: 'home', href: '/', label: '홈' },
  { key: 'play', href: '/modes', label: '경기' },
  { key: 'rankings', href: '/rankings', label: '랭킹' },
  { key: 'news', href: '/news', label: '소식' },
  { key: 'me', href: '/me/batting', label: '마이' },
] as const;

export type NavKey = (typeof NAV)[number]['key'];

export function AppShell({
  active,
  children,
}: {
  active: NavKey;
  children: React.ReactNode;
}) {
  return (
    <div className="lg:mx-auto lg:grid lg:max-w-[1320px] lg:grid-cols-[240px_1fr] lg:gap-6">
      <aside className="hidden lg:flex lg:flex-col lg:gap-4 lg:py-6" aria-label="주요 메뉴">
        <Link href="/" className="text-lg font-bold">
          야구왕
        </Link>
        <nav className="flex flex-col gap-1 text-sm">
          {NAV.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              aria-current={item.key === active ? 'page' : undefined}
              className="rounded-option px-3 py-2"
              style={
                item.key === active
                  ? { backgroundColor: 'var(--bg-field)', fontWeight: 600 }
                  : { color: 'var(--ink-2)' }
              }
            >
              {item.label}
            </Link>
          ))}
          <Link href="/settings" className="px-3 py-2 text-ink-2">
            설정
          </Link>
        </nav>
      </aside>

      <div className="pb-20 lg:pb-6">{children}</div>

      {/* 하단 탭 — lg에서는 사이드바가 대신한다 */}
      <nav
        className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-5 border-t lg:hidden"
        style={{
          borderColor: 'var(--line)',
          backgroundColor: 'var(--bg-card)',
          paddingBottom: 'env(safe-area-inset-bottom, 0)',
        }}
        aria-label="주요 메뉴"
      >
        {NAV.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            aria-current={item.key === active ? 'page' : undefined}
            className="flex min-h-14 items-center justify-center text-sm"
            style={
              item.key === active
                ? { color: 'var(--accent)', fontWeight: 600 }
                : { color: 'var(--ink-2)' }
            }
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
