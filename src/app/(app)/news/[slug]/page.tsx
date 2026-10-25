import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/shell/AppShell';
import { NEWS, findNews } from '@/content/news';

/** 글은 코드에 있으므로 빌드 때 모두 만든다. 없는 주소는 404다. */
export const dynamicParams = false;

export function generateStaticParams() {
  return NEWS.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const post = findNews((await params).slug);
  return post ? { title: `${post.title} — 야구왕`, description: post.summary } : {};
}

export default async function NewsPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const post = findNews((await params).slug);
  if (!post) notFound();

  return (
    <AppShell active="news">
      <main className="flex max-w-2xl flex-col gap-4 px-4 py-6">
        <Link href="/news" className="flex min-h-11 items-center text-sm text-ink-2 underline">
          ← 최신 소식
        </Link>
        <article aria-labelledby="news-title" className="sticker flex flex-col gap-3 p-5">
          <p className="text-xs text-ink-2">
            {post.category} · <time dateTime={post.date}>{post.date}</time>
          </p>
          <h1 id="news-title" className="font-cute text-3xl break-keep">
            {post.title}
          </h1>
          {post.body.map((paragraph) => (
            <p key={paragraph} className="leading-relaxed break-keep">
              {paragraph}
            </p>
          ))}
        </article>
        <Link
          href="/play"
          className="squishy font-cute flex min-h-14 items-center justify-center px-6 text-xl"
          style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
        >
          게임 시작 <span aria-hidden="true">▶</span>
        </Link>
      </main>
    </AppShell>
  );
}
