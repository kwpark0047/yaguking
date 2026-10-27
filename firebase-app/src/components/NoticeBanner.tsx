import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { visibleNotices, type PublicNotice } from '@/lib/admin/notices';
import { loadPublicHome } from '@/lib/public/home';

/**
 * 메인 공지 띠 — 지금 공개 중인 공지 중 맨 앞(고정 먼저) 하나. 없으면 아무것도 그리지 않는다.
 * 관리자가 올린 공지(public/home)를 앱 열기당 한 번 읽는다(docs/admin-plan.md §5.9).
 */
export function NoticeBanner() {
  const [notice, setNotice] = useState<PublicNotice | null>(null);

  useEffect(() => {
    let alive = true;
    void loadPublicHome().then((home) => {
      if (alive) setNotice(visibleNotices(home.notices, Date.now())[0] ?? null);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!notice) return null;
  return (
    <aside aria-label="공지" className="sticker flex items-center justify-between gap-3 px-4 py-3 text-sm">
      <p className="break-keep">
        <span className="mr-2 rounded-full px-2 py-0.5 text-xs font-semibold" style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}>
          공지
        </span>
        {notice.title}
      </p>
      <Link to="/notices" className="flex min-h-11 shrink-0 items-center underline">
        자세히
      </Link>
    </aside>
  );
}
