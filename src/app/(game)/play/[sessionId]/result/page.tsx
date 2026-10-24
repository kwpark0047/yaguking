import Link from 'next/link';
import { AtBatLogDetailed } from '@/components/result/AtBatLogDetailed';
import { BoxScore } from '@/components/result/BoxScore';
import { ClaimedBanner } from '@/components/result/ClaimedBanner';
import { ShareButton } from '@/components/result/ShareButton';
import { SignupGate } from '@/components/result/SignupGate';
import { LevelBadge } from '@/components/theme/LevelBadge';
import { formatRate } from '@/lib/engine';
import { resolveOwnerFromCookies } from '@/server/auth/resolveOwner';
import { getBoxScore } from '@/server/play/getState';
import { getMe } from '@/server/me/profile';

/**
 * V03 결과 + 가입 게이트 (08 문서 §5).
 *
 * 노출 순서: 최종 스코어 → 박스스코어 → 타석 로그 → 게이트 → 다음 행동.
 * **박스스코어는 비회원에게도 전부 공개한다.**
 */
export const dynamic = 'force-dynamic';

export default async function ResultPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ claimed?: string }>;
}) {
  const { sessionId } = await params;
  const { claimed } = await searchParams;
  const owner = await resolveOwnerFromCookies();

  if (!owner) return <Unavailable />;

  let result;
  try {
    result = await getBoxScore(sessionId, owner);
  } catch {
    return <Unavailable />;
  }

  const me = owner.kind === 'user' ? await getMe(owner.userId) : null;
  const returnTo = `/play/${sessionId}/result`;

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-6 lg:max-w-2xl">
      <header className="text-center">
        <p className="text-sm text-ink-2">경기 종료</p>
        <h1 className="num-tabular text-2xl font-bold">
          {result.innings}이닝 · 최종 {result.runs}득점
        </h1>
        {result.status === 'abandoned' && (
          <p className="mt-1 text-xs text-ink-2">
            중도 종료된 경기입니다. 공식 집계에는 들어가지 않습니다.
          </p>
        )}
      </header>

      <BoxScore box={result.boxScore} runs={result.runs} />

      <AtBatLogDetailed entries={result.atBats} />

      {/* ── 가입 게이트 또는 적립 결과 ─────────────────────────────── */}
      {claimed === '1' && me && (
        <ClaimedBanner
          career={me.career}
          onboardingPending={me.profile?.onboardingStatus !== 'completed'}
          returnTo={returnTo}
        />
      )}

      {owner.kind === 'guest' && (
        <SignupGate box={result.boxScore} returnTo={returnTo} />
      )}

      {me && claimed !== '1' && (
        <section
          className="rounded-card border p-4"
          style={{ borderColor: 'var(--line)' }}
        >
          <h2 className="text-sm font-semibold">적립 결과</h2>
          {me.career && me.career.pa > 0 ? (
            <p className="num-tabular mt-1 text-sm text-ink-2">
              통산 {me.career.pa}타석 · 타율 {formatRate(me.career.avg)} · OPS{' '}
              {formatRate(me.career.ops)}
            </p>
          ) : (
            <p className="mt-1 text-sm text-ink-2">아직 통산 기록이 없습니다.</p>
          )}
          <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-2">
            <LevelBadge level={me.level} />
            <span className="num-tabular">누적 {me.totalXp} XP</span>
          </p>
          {me.profile?.onboardingStatus !== 'completed' && (
            <Link
              href={`/onboarding?returnTo=${encodeURIComponent(returnTo)}`}
              className="mt-3 flex min-h-14 items-center justify-center rounded-option px-4 font-semibold"
              style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
            >
              대표 구단 고르기
            </Link>
          )}
        </section>
      )}

      {/* ── 다음 행동 ────────────────────────────────────────────── */}
      <div className="flex gap-2">
        <Link
          href="/modes"
          className="flex min-h-14 flex-1 items-center justify-center rounded-option px-4 font-semibold"
          style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
        >
          한 이닝 더
        </Link>
        <ShareButton sessionId={sessionId} />
      </div>

      <p className="text-xs text-ink-2">
        공유하면 닉네임·등급·박스스코어 요약만 보이는 공개 카드가 열립니다.
        문항과 정답은 담기지 않습니다.
      </p>
    </main>
  );
}

function Unavailable() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4">
      <h1 className="text-xl font-bold">결과를 찾을 수 없습니다.</h1>
      <Link
        href="/"
        className="flex min-h-14 items-center justify-center rounded-option px-4 font-semibold"
        style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
      >
        새 경기 시작
      </Link>
    </main>
  );
}
