import type { Metadata } from 'next';
import Link from 'next/link';
import { Mascot } from '@/components/brand/Mascot';
import { AppShell } from '@/components/shell/AppShell';
import { latestNews } from '@/content/news';

export const metadata: Metadata = { title: '최신 소식 — 야구왕' };

/**
 * 최신 소식 — 야구왕 서비스 소식(업데이트·안내·이벤트).
 *
 * 리그 경기 소식이 아니다. 리그 데이터는 정식 이용 허락 전에는 가져오지 않는다
 * (12·13 문서, src/content/news.ts 머리말).
 */
export default function NewsPage() {
  const posts = latestNews();

  return (
    <AppShell active="news">
      <main className="flex flex-col gap-4 px-4 py-6">
        <div className="flex items-center gap-3">
          <Mascot mood="wink" className="h-16 w-16 shrink-0" />
          <div>
            <h1 className="font-cute text-3xl">최신 소식</h1>
            <p className="text-sm text-ink-2">야구왕에 새로 생긴 것들을 알려 드려요.</p>
          </div>
        </div>

        <ul className="flex max-w-3xl flex-col gap-3">
          {posts.map((post) => (
            <li key={post.slug}>
              <article aria-labelledby={`news-${post.slug}`} className="sticker flex flex-col gap-1 p-4">
                <p className="text-xs text-ink-2">
                  <span
                    className="mr-1 rounded-full px-2 py-0.5 font-semibold"
                    style={{ backgroundColor: 'var(--bg-base)' }}
                  >
                    {post.category}
                  </span>
                  <time dateTime={post.date}>{post.date}</time>
                </p>
                <h2 id={`news-${post.slug}`} className="font-cute text-xl break-keep">
                  <Link href={`/news/${post.slug}`} className="hover:underline">
                    {post.title}
                  </Link>
                </h2>
                <p className="text-sm text-ink-2 break-keep">{post.summary}</p>
              </article>
            </li>
          ))}
        </ul>
      </main>
    </AppShell>
  );
}
