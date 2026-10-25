import { BIG_INNING_RUNS } from '@/lib/achievements/rules';
import { MATERIAL_INLAY } from '@/lib/theme/material';
import { tierStyle, tierTheme } from '@/lib/theme/tiers';
import type { AchievementDto } from '@/types/api';

/** 카드 가운데 표식. 장식이며 제목이 늘 글자로 함께 나온다. */
const MARK: Record<string, string> = {
  first_hit: 'H',
  first_hr: 'HR',
  streak_bonus: '5×',
  cycle: 'CY',
  big_inning: `${BIG_INNING_RUNS}R`,
  hall_of_fame: 'HOF',
};

/**
 * 업적 카드 한 장 (14 문서 §5.2).
 *
 * 선수 카드와 **같은 프레임·소재**를 작게 쓴다. 희귀도 n 카드는 등급 n 카드와
 * 같은 테두리·소재다 — 자산이 늘지 않는다.
 *
 * 미획득 카드는 실루엣이다: 중립 종이 소재, 점선 테두리, 표식 대신 "?".
 * 그래도 **제목과 조건은 그대로 읽힌다** — 무엇을 하면 얻는지 알아야 모은다.
 * 글자를 흐리게(opacity) 하지 않는다. 흐린 글자는 대비 기준을 깬다.
 */
export function AchievementCard({
  achievement,
  titleAs: Title = 'h2',
  className,
}: {
  achievement: AchievementDto;
  /** 카드 제목의 제목 단계. 상위 제목이 h2인 구역 안에서는 h3 */
  titleAs?: 'h2' | 'h3';
  className?: string;
}) {
  const tier = tierTheme(achievement.earned ? achievement.rarity : 1);
  const titleId = `achievement-${achievement.id}`;

  return (
    <article
      aria-labelledby={titleId}
      data-tier={tier.level}
      data-ornament={tier.ornament}
      data-locked={achievement.earned ? undefined : ''}
      style={tierStyle(tier)}
      className={['player-card player-card--mini tier-frame rounded-card', className]
        .filter(Boolean)
        .join(' ')}
    >
      <div
        className="player-card__material"
        data-material={tier.material}
        data-inlay={MATERIAL_INLAY[tier.material]}
      >
        <div className="player-card__face">
          <p className="text-xs text-ink-2">희귀도 {achievement.rarity}</p>

          <span className="player-card__initial self-center" aria-hidden="true">
            {achievement.earned ? (MARK[achievement.id] ?? '★') : '?'}
          </span>

          <Title id={titleId} className="text-center text-sm font-bold break-keep">
            {achievement.title}
          </Title>
          <p className="flex-1 text-center text-xs text-ink-2 break-keep">
            {achievement.condition}
          </p>

          <p
            className="text-center text-xs font-semibold"
            style={achievement.earned ? { color: 'var(--tier)' } : { color: 'var(--ink-2)' }}
          >
            {achievement.earned
              ? achievement.earnedOn
                ? `획득 · ${achievement.earnedOn}`
                : '획득'
              : '미획득'}
          </p>
        </div>
      </div>
    </article>
  );
}
