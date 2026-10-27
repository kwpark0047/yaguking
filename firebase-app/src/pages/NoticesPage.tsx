import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { visibleNotices, type PublicNotice } from '@/lib/admin/notices';
import { loadPublicHome } from '@/lib/public/home';

const dateText = (ms: number) =>
  new Date(ms).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Seoul' });

/** 공지사항 목록 — 로그인 없이 누구나. 공개 묶음 한 번 읽기 */
export function NoticesPage() {
  const [notices, setNotices] = useState<PublicNotice[] | null>(null);

  useEffect(() => {
    void loadPublicHome().then((home) => setNotices(visibleNotices(home.notices, Date.now())));
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-4 px-4 py-8">
      <Link to="/" className="flex min-h-11 items-center self-start text-sm text-ink-2 underline">
        ← 야구왕
      </Link>
      <h1 className="font-cute text-3xl">공지사항</h1>
      {!notices && <p className="text-sm text-ink-2">불러오는 중…</p>}
      {notices?.length === 0 && <p className="text-sm text-ink-2">지금은 공지가 없어요.</p>}
      {notices && notices.length > 0 && (
        <ul className="flex flex-col gap-3" aria-label="공지 목록">
          {notices.map((notice) => (
            <li key={notice.id} className="sticker flex flex-col gap-2 p-4">
              <h2 className="font-semibold break-keep">
                {notice.pinned && <span className="sr-only">고정 공지: </span>}
                {notice.pinned && <span aria-hidden="true">📌 </span>}
                {notice.title}
              </h2>
              <p className="text-xs text-ink-2">{dateText(notice.startsAt)}</p>
              {notice.body && <p className="text-sm leading-relaxed whitespace-pre-line break-keep">{notice.body}</p>}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
