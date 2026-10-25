import Link from 'next/link';

const TABS = [
  { key: 'batting', href: '/me/batting', label: '내 기록' },
  { key: 'collection', href: '/me/collection', label: '컬렉션' },
] as const;

/**
 * 마이 탭 안의 화면 전환 — 내 기록 / 컬렉션 (14 문서 §5.2).
 *
 * 페이지 이동 링크다(탭 위젯이 아니다). 현재 화면은 `aria-current`로 알린다.
 */
export function MeTabs({ active }: { active: (typeof TABS)[number]['key'] }) {
  return (
    <nav aria-label="마이 메뉴" className="flex gap-2">
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={tab.key === active ? 'page' : undefined}
          className="flex min-h-11 items-center rounded-option border px-4 text-sm"
          style={
            tab.key === active
              ? {
                  borderColor: 'var(--accent)',
                  backgroundColor: 'var(--accent)',
                  color: 'var(--accent-ink)',
                  fontWeight: 600,
                }
              : { borderColor: 'var(--line)', color: 'var(--ink-2)' }
          }
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
