import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { paragraphsOf, type NewsPost } from '@/lib/news/validate';
import { loadNews } from '@/lib/public/news';

/**
 * 최신 소식 — 야구왕 서비스 소식(업데이트·안내·이벤트). 로그인 없이 누구나, 공개 문서 한 번 읽기.
 * 글은 운영자가 쓰고, 매일 새벽 운영자 PC가 글마다 출처가 열리는지·날짜가 맞는지 확인해 통과한 글만 보인다(docs/news.md).
 * 리그 경기 소식이 아니다 — 리그 데이터는 정식 이용 허락 전에는 가져오지 않는다.
 */
export function NewsPage() {
  const [posts, setPosts] = useState<NewsPost[] | null>(null);
  useEffect(() => {
    void loadNews().then(setPosts);
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-4 px-4 py-8">
      <Link to="/" className="flex min-h-11 items-center self-start text-sm text-ink-2 underline">
        ← 야구왕
      </Link>
      <h1 className="font-cute text-3xl">최신 소식</h1>
      <p className="text-sm text-ink-2 break-keep">야구왕에 새로 생긴 것들을 알려 드려요. 글마다 출처와 날짜를 매일 확인해 올려요.</p>
      {!posts && <p className="text-sm text-ink-2">불러오는 중…</p>}
      {posts?.length === 0 && <p className="text-sm text-ink-2">아직 소식이 없어요.</p>}
      {posts && posts.length > 0 && (
        <ul className="flex flex-col gap-3" aria-label="소식 목록">
          {posts.map((post) => (
            <li key={post.id} id={post.id}>
              <article aria-labelledby={`news-${post.id}`} className="sticker flex flex-col gap-2 p-4">
                <p className="text-xs text-ink-2">
                  <span className="mr-1 rounded-full px-2 py-0.5 font-semibold" style={{ backgroundColor: 'var(--bg-base)' }}>
                    {post.category}
                  </span>
                  <time dateTime={post.date}>{post.date}</time>
                </p>
                <h2 id={`news-${post.id}`} className="font-semibold break-keep">
                  {post.title}
                </h2>
                {paragraphsOf(post.body).map((paragraph) => (
                  <p key={paragraph} className="text-sm leading-relaxed break-keep">
                    {paragraph}
                  </p>
                ))}
                <p className="text-xs text-ink-2 break-all">
                  출처:{' '}
                  <a href={post.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">
                    {post.sourceName}
                  </a>
                </p>
              </article>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
