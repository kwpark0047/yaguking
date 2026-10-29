import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { NewsPost } from '@/lib/news/validate';
import { loadNews } from '@/lib/public/news';

/** 메인의 최신 소식 — 최근 3개(운영자 PC가 출처·날짜를 확인해 올린 글만). 글이 없으면 구역을 그리지 않는다 */
export function NewsPreview() {
  const [posts, setPosts] = useState<NewsPost[] | null>(null);
  useEffect(() => {
    void loadNews().then(setPosts);
  }, []);
  if (!posts || posts.length === 0) return null;
  return (
    <section aria-labelledby="news-title" className="sticker flex flex-col gap-3 p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="news-title" className="font-cute text-2xl">
          최신 소식
        </h2>
        <Link to="/news" className="flex min-h-11 items-center text-sm underline">
          전체 보기
        </Link>
      </div>
      <ul className="flex flex-col gap-2">
        {posts.slice(0, 3).map((post) => (
          <li key={post.id} className="flex flex-col gap-0.5 rounded-2xl px-3 py-2" style={{ backgroundColor: 'var(--bg-base)' }}>
            <p className="text-xs text-ink-2">
              <span className="font-semibold">{post.category}</span> · <time dateTime={post.date}>{post.date}</time>
            </p>
            <Link to={`/news#${post.id}`} className="font-semibold break-keep underline-offset-2 hover:underline">
              {post.title}
            </Link>
            <p className="text-sm text-ink-2 break-keep">{post.summary}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
