import Link from 'next/link';
import { StyleMenu } from '@/components/theme/StyleMenu';

/**
 * 메인 페이지 머리줄 — 로고, 랭킹·소식, 로그인/가입(또는 마이·로그아웃).
 *
 * 로그아웃은 폼 POST다(링크 GET으로 로그아웃되면 다른 사이트가 끌어낼 수
 * 있다 — src/app/(auth)/auth/signout/route.ts).
 */
export function SiteHeader({ member }: { member: { nickname: string } | null }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <Link href="/" className="font-cute flex min-h-11 items-center gap-1 text-2xl">
        <span aria-hidden="true">⚾</span>
        야구왕
      </Link>

      <nav aria-label="사이트 메뉴" className="order-3 flex w-full gap-1 sm:order-none sm:w-auto">
        {[
          { href: '/rankings', label: '랭킹' },
          { href: '/news', label: '최신 소식' },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex min-h-11 items-center rounded-full px-3 text-sm font-semibold text-ink-2 hover:text-ink-1"
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="flex items-center gap-2">
        <StyleMenu />
        {member ? (
          <>
            <Link
              href="/dashboard"
              className="flex min-h-11 items-center rounded-full border-2 px-4 text-sm font-semibold"
              style={{ borderColor: 'var(--line)' }}
            >
              마이
            </Link>
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="flex min-h-11 items-center px-2 text-sm text-ink-2 underline"
              >
                로그아웃
              </button>
            </form>
          </>
        ) : (
          <>
            <Link
              href="/auth?mode=login"
              className="flex min-h-11 items-center px-2 text-sm font-semibold"
            >
              로그인
            </Link>
            <Link
              href="/auth?mode=signup"
              className="squishy flex min-h-11 items-center px-4 text-sm font-semibold"
              style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
            >
              가입하기
            </Link>
          </>
        )}
      </div>
    </header>
  );
}
