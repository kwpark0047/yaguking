import { LevelBadge } from '@/components/theme/LevelBadge';
import { TeamScope } from '@/components/theme/TeamScope';
import { MATERIAL_INLAY, cardInitial } from '@/lib/theme/material';
import { tierStyle, tierTheme } from '@/lib/theme/tiers';
import type { ShareCardDto } from '@/types/api';

/**
 * 내 선수 카드 (14 문서 §5.1, 1단계).
 *
 * 수집 카드 형식으로 이번 경기를 보여 준다. **그림 자산 없이 CSS만으로** 만든다.
 *   - 테두리 여백의 소재와 프레임 → 등급 (육성선수 종이 … 명예의 전당 금속판)
 *   - 가운데 띠 → **기록을 만든 사람의** 구단 색. 로고는 없다
 *   - 가운데 큰 글자 → 닉네임 첫 글자. 구단 이니셜이 아니다
 *
 * 글자는 모두 HTML이다. 이미지에 굽지 않아야 대비 검사·고대비 스타일·화면
 * 낭독이 그대로 동작한다. 소재와 큰 글자는 장식이라 낭독에서 뺀다.
 *
 * 서버 컴포넌트 전용이다(`TeamScope`가 서버에서 테마 스위치를 읽는다).
 */
export function PlayerCard({ card, headingId }: { card: ShareCardDto; headingId: string }) {
  const tier = tierTheme(card.level);

  const stats = [
    ['득점', String(card.runs)],
    ['타석', String(card.pa)],
    ['타율', card.avg],
    ['OPS', card.ops],
  ] as const;

  return (
    <TeamScope slug={card.teamSlug}>
      <article
        aria-labelledby={headingId}
        data-tier={tier.level}
        data-ornament={tier.ornament}
        style={tierStyle(tier)}
        className="player-card tier-frame rounded-card"
      >
        <div
          className="player-card__material"
          data-material={tier.material}
          data-inlay={MATERIAL_INLAY[tier.material]}
        >
          <div className="player-card__face">
            <p className="flex flex-wrap items-center justify-between gap-2 text-sm text-ink-2">
              <LevelBadge level={card.level} />
              {card.teamShortName && (
                <span className="inline-flex items-center gap-1">
                  <span className="team-dot" aria-hidden="true" />
                  {card.teamShortName}
                </span>
              )}
            </p>

            <div className="team-band flex flex-1 flex-col items-center justify-center gap-3 rounded-option px-3 py-5">
              <span className="player-card__initial" aria-hidden="true">
                {cardInitial(card.nickname)}
              </span>
              <h1
                id={headingId}
                className="text-center text-2xl font-bold break-keep [overflow-wrap:anywhere]"
              >
                {card.nickname}
              </h1>
            </div>

            <dl className="grid grid-cols-2 gap-2">
              {stats.map(([label, value]) => (
                <div key={label} className="rounded-option bg-bg-base px-3 py-2">
                  <dt className="text-xs text-ink-2">{label}</dt>
                  <dd className="num-tabular text-lg font-semibold">{value}</dd>
                </div>
              ))}
            </dl>

            <p className="text-center text-xs text-ink-2">야구왕 · 1이닝 기록</p>
          </div>
        </div>
      </article>
    </TeamScope>
  );
}
