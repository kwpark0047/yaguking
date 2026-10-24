import type { Metadata } from "next";
import Link from "next/link";
import { LevelBadge } from "@/components/theme/LevelBadge";
import { TeamScope } from "@/components/theme/TeamScope";
import { tierStyle, tierTheme } from "@/lib/theme/tiers";
import { getShareCard } from "@/server/share/shareCard";

/**
 * 공유 링크가 열리는 공개 화면.
 *
 * 결과 화면(V03)은 소유자만 볼 수 있다. 공유받은 사람이 여는 건 이 화면이며
 * **요약만** 보여준다 — 문항 본문과 정답은 담지 않는다(문제 유출 방지,
 * 08 문서 §5.5).
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}): Promise<Metadata> {
  const { sessionId } = await params;
  const card = await getShareCard(sessionId).catch(() => null);

  if (!card) return { title: "야구왕" };

  return {
    title: `${card.nickname}의 1이닝 — ${card.runs}득점`,
    description: `타율 ${card.avg} · OPS ${card.ops} · ${card.pa}타석`,
    openGraph: {
      title: `${card.nickname}의 1이닝 — ${card.runs}득점`,
      description: `타율 ${card.avg} · OPS ${card.ops}`,
    },
  };
}

export default async function SharePage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const card = await getShareCard(sessionId).catch(() => null);

  if (!card) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4">
        <h1 className="text-xl font-bold">기록을 찾을 수 없습니다.</h1>
        <Link
          href="/"
          className="flex min-h-14 items-center justify-center rounded-option px-4 font-semibold"
          style={{
            backgroundColor: "var(--accent)",
            color: "var(--accent-ink)",
          }}
        >
          나도 1이닝 해보기
        </Link>
      </main>
    );
  }

  const tier = tierTheme(card.level);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4">
      {/*
        **기록을 만든 사람의** 구단과 등급으로 칠한다. 보는 사람의 테마(<html>)와
        섞이지 않도록 카드 범위에서 다시 지정한다. 아래 "나도 해보기" 버튼은
        보는 사람에게 하는 말이라 바깥 테마를 그대로 쓴다.
      */}
      <TeamScope slug={card.teamSlug}>
        <section
          data-tier={tier.level}
          data-ornament={tier.ornament}
          style={tierStyle(tier)}
          className="tier-frame overflow-hidden rounded-card"
        >
          <div className="team-band p-6 text-center">
            <p className="flex flex-wrap items-center justify-center gap-2 text-sm text-ink-2">
              <LevelBadge level={card.level} />
              {card.teamShortName && (
                <span className="inline-flex items-center gap-1">
                  <span className="team-dot" aria-hidden="true" />
                  {card.teamShortName}
                </span>
              )}
            </p>
            <h1 className="mt-2 text-2xl font-bold">{card.nickname}</h1>
            <p className="num-tabular mt-4 text-5xl font-bold">{card.runs}</p>
            <p className="text-sm text-ink-2">득점</p>

            <dl className="mt-4 grid grid-cols-3 gap-2">
              {[
                ["타석", String(card.pa)],
                ["타율", card.avg],
                ["OPS", card.ops],
              ].map(([label, value]) => (
                <div key={label} className="rounded-option bg-bg-card p-2">
                  <dt className="text-xs text-ink-2">{label}</dt>
                  <dd className="num-tabular font-semibold">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      </TeamScope>

      <Link
        href="/"
        className="flex min-h-14 items-center justify-center rounded-option px-4 font-semibold"
        style={{ backgroundColor: "var(--accent)", color: "var(--accent-ink)" }}
      >
        나도 1이닝 해보기
      </Link>

      <p className="text-center text-xs text-ink-2">
        로그인 없이 바로 플레이할 수 있습니다.
      </p>
    </main>
  );
}
