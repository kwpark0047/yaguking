import Link from 'next/link';
import { Mascot } from '@/components/brand/Mascot';
import { SiteHeader } from '@/components/home/SiteHeader';
import { LevelBadge } from '@/components/theme/LevelBadge';
import { TeamScope } from '@/components/theme/TeamScope';
import { latestNews } from '@/content/news';
import { getAuthUserId } from '@/lib/supabase/server';
import { getMe } from '@/server/me/profile';
import { getRanking } from '@/server/stats/rankings';
import type { RankingDto } from '@/types/api';

/**
 * V01 메인 페이지 — 소개 + 게임 시작 (2026-10-26 변경, 08 문서 §3 변경 기록).
 *
 * 원래 `/`는 첫 타석을 바로 띄웠다(0탭). 요청에 따라 귀여운 소개 화면이 되었고,
 * 첫 투구까지는 **"게임 시작" 한 번**이다. 버튼이 화면 첫 줄에 크게 있고, 누르면
 * `/play`가 곧바로 1번 타석을 띄운다 — 그 뒤로는 여전히 로그인·약관·튜토리얼이
 * 앞서지 않는다.
 *
 * 순서: 머리줄 → 캐릭터와 소개·게임 시작 → 노는 법 3단계 → 랭킹 미리보기 →
 * 최신 소식 → 바닥글.
 */
export const dynamic = 'force-dynamic';

const STEPS = [
  { emoji: '⚾', title: '문제가 날아와요', body: '야구 상식 문제 하나가 공 하나예요.' },
  { emoji: '💥', title: '빨리 맞히면 홈런!', body: '빠르고 정확할수록 타구가 멀리 날아가요.' },
  {
    emoji: '🏆',
    title: '아웃이 쌓이면 경기 끝',
    body: '체험은 1이닝, 회원 공식 경기는 3이닝. 박스스코어와 업적 카드가 남아요.',
  },
] as const;

async function loadRankingPreview(): Promise<RankingDto | null> {
  try {
    // 비율 랭킹은 50타석을 채운 사람만 오른다. 아직 비어 있으면 득점 랭킹을 보인다.
    const rate = await getRanking('rate', 3);
    if (rate.entries.length > 0) return rate;
    return await getRanking('volume', 3);
  } catch {
    return null;
  }
}

export default async function HomePage() {
  const userId = await getAuthUserId();
  const [me, ranking] = await Promise.all([
    userId ? getMe(userId).catch(() => null) : Promise.resolve(null),
    loadRankingPreview(),
  ]);
  const member = me?.profile ? { nickname: me.profile.nickname, level: me.level } : null;
  const news = latestNews(3);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-4 sm:py-6">
      <SiteHeader member={member} />

      <main className="flex flex-col gap-10">
        {/* ── 히어로 ─────────────────────────────────────────── */}
        <section
          aria-labelledby="home-title"
          className="home-hero grid items-center gap-6 px-5 py-8 sm:grid-cols-[1fr_auto] sm:px-10 sm:py-12"
        >
          <div className="flex flex-col gap-4">
            <p className="speech-bubble self-start text-sm font-semibold">
              {member ? `${member.nickname} 선수, 다시 왔군요!` : '오늘도 한 이닝 어때요?'}
            </p>
            <h1 id="home-title" className="font-cute text-4xl leading-tight break-keep sm:text-5xl">
              야구 상식으로
              <br />
              홈런 치자!
            </h1>
            <p className="max-w-md text-ink-2 break-keep">
              문제는 투구, 정답 속도는 타구, 오답은 아웃. 3아웃이면 1이닝이 끝나고 나만의
              박스스코어가 남아요.
            </p>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Link
                href="/play"
                className="squishy font-cute flex min-h-16 items-center justify-center gap-2 px-8 text-2xl"
                style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
              >
                게임 시작
                <span aria-hidden="true">▶</span>
              </Link>
              {member && (
                <Link
                  href="/modes"
                  className="flex min-h-11 items-center justify-center px-3 text-sm font-semibold underline"
                >
                  다른 모드 고르기
                </Link>
              )}
            </div>
            <p className="text-xs text-ink-2">
              {member ? (
                <span className="inline-flex flex-wrap items-center gap-2">
                  {/* 회원의 "게임 시작"은 공식 3이닝이다(src/server/play/resume.ts defaultModeFor) */}
                  공식 3이닝으로 시작해요 · 통산 기록·XP·랭킹에 반영 · 지금 등급{' '}
                  <LevelBadge level={member.level} />
                </span>
              ) : (
                '로그인 없이 바로 시작해요. 비회원 체험은 하루 2이닝이에요.'
              )}
            </p>
          </div>

          {/* 좁은 화면에서는 캐릭터가 제목 위에 온다. 버튼 아래로 밀리면 안 보인다 */}
          <Mascot className="order-first mx-auto h-32 w-32 sm:order-none sm:h-64 sm:w-64" />
        </section>

        {/* ── 노는 법 ─────────────────────────────────────────── */}
        <section aria-labelledby="how-title" className="flex flex-col gap-4">
          <h2 id="how-title" className="font-cute text-2xl">
            이렇게 놀아요
          </h2>
          <ol className="grid gap-4 sm:grid-cols-3">
            {STEPS.map((step, index) => (
              <li key={step.title} className="sticker flex gap-3 p-4">
                <span className="step-dot font-cute text-lg">{index + 1}</span>
                <div className="flex flex-col gap-1">
                  <h3 className="font-cute text-lg">
                    <span aria-hidden="true">{step.emoji} </span>
                    {step.title}
                  </h3>
                  <p className="text-sm text-ink-2 break-keep">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* ── 랭킹 미리보기 ─────────────────────────────────── */}
          <section aria-labelledby="ranking-title" className="sticker flex flex-col gap-3 p-5">
            <div className="flex items-baseline justify-between gap-2">
              <h2 id="ranking-title" className="font-cute text-2xl">
                랭킹
              </h2>
              <Link href="/rankings" className="flex min-h-11 items-center text-sm underline">
                전체 보기
              </Link>
            </div>
            {ranking && ranking.entries.length > 0 ? (
              <>
                <p className="text-xs text-ink-2">기준: {ranking.criterion}</p>
                <ol className="flex flex-col gap-2">
                  {ranking.entries.map((entry) => (
                    <li
                      key={`${entry.rank}-${entry.nickname}`}
                      className="flex items-center gap-3 rounded-2xl px-3 py-2"
                      style={{ backgroundColor: 'var(--bg-base)' }}
                    >
                      <span className="font-cute w-10 text-lg">
                        <span aria-hidden="true">{['🥇', '🥈', '🥉'][entry.rank - 1]} </span>
                        <span className="sr-only">{entry.rank}위</span>
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate font-semibold">{entry.nickname}</span>
                        {entry.teamShortName && (
                          <TeamScope
                            as="span"
                            slug={entry.teamSlug}
                            className="inline-flex items-center gap-1 text-xs text-ink-2"
                          >
                            <span className="team-dot" aria-hidden="true" />
                            {entry.teamShortName}
                          </TeamScope>
                        )}
                      </span>
                      <span className="num-tabular font-semibold">{entry.primary}</span>
                    </li>
                  ))}
                </ol>
              </>
            ) : (
              <p className="text-sm text-ink-2 break-keep">
                아직 랭킹이 비어 있어요. 첫 번째 주인공이 되어 보세요!
              </p>
            )}
          </section>

          {/* ── 최신 소식 ─────────────────────────────────────── */}
          <section aria-labelledby="news-title" className="sticker flex flex-col gap-3 p-5">
            <div className="flex items-baseline justify-between gap-2">
              <h2 id="news-title" className="font-cute text-2xl">
                최신 소식
              </h2>
              <Link href="/news" className="flex min-h-11 items-center text-sm underline">
                더 보기
              </Link>
            </div>
            <ul className="flex flex-col gap-2">
              {news.map((post) => (
                <li key={post.slug}>
                  <Link
                    href={`/news/${post.slug}`}
                    className="flex flex-col gap-0.5 rounded-2xl px-3 py-2 hover:underline"
                    style={{ backgroundColor: 'var(--bg-base)' }}
                  >
                    <span className="text-xs text-ink-2">
                      {post.category} · <time dateTime={post.date}>{post.date}</time>
                    </span>
                    <span className="font-semibold break-keep">{post.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </main>

      <footer className="flex flex-col gap-1 border-t pt-4 text-xs text-ink-2" style={{ borderColor: 'var(--line)' }}>
        <p>야구왕은 KBO 리그 팬을 위한 야구 상식 퀴즈 게임이에요.</p>
        <p>KBO 및 각 구단의 공식 서비스가 아니며, 구단 로고·엠블럼을 사용하지 않습니다.</p>
        <nav aria-label="약관과 정책" className="flex flex-wrap gap-x-4">
          <Link href="/terms" className="flex min-h-11 items-center underline">
            이용약관 (확정 전)
          </Link>
          <Link href="/privacy" className="flex min-h-11 items-center font-semibold underline">
            개인정보처리방침
          </Link>
        </nav>
      </footer>
    </div>
  );
}
