import Link from 'next/link';
import { AchievementCard } from '@/components/me/AchievementCard';
import type { AchievementDto } from '@/types/api';

/**
 * 이번 경기로 처음 얻은 업적 카드 (14 문서 §5.2).
 *
 * 새 카드가 없으면 아무것도 그리지 않는다 — "이번엔 없음"을 알리는 빈 구역은
 * 결과 화면을 길게만 한다. 카드는 한 장씩 차례로 떠오르며, 움직임 줄이기
 * 설정에서는 전역 규칙이 애니메이션을 없앤다(08 문서 §2.4).
 */
export function NewAchievements({ achievements }: { achievements: AchievementDto[] }) {
  if (achievements.length === 0) return null;

  return (
    <section
      aria-labelledby="new-achievements-title"
      className="rounded-card border p-4"
      style={{ borderColor: 'var(--accent)' }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="new-achievements-title" className="text-sm font-semibold">
          새 업적 카드 <span className="num-tabular">{achievements.length}</span>장
        </h2>
        <Link
          href="/me/collection"
          className="flex min-h-11 items-center text-sm text-ink-2 underline"
        >
          컬렉션 보기
        </Link>
      </div>

      <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {achievements.map((achievement, index) => (
          <li
            key={achievement.id}
            className="achievement-reveal flex"
            style={{ animationDelay: `${index * 120}ms` }}
          >
            <AchievementCard achievement={achievement} titleAs="h3" />
          </li>
        ))}
      </ul>
    </section>
  );
}
