import { redirect } from 'next/navigation';
import { AchievementCard } from '@/components/me/AchievementCard';
import { MeTabs } from '@/components/me/MeTabs';
import { AppShell } from '@/components/shell/AppShell';
import { getDb } from '@/lib/db/sql';
import { getAuthUserId } from '@/lib/supabase/server';
import { getAchievements } from '@/server/me/achievements';

/**
 * 업적 카드 컬렉션 (14 문서 §5.2, 3단계).
 *
 * 획득한 카드는 희귀도에 맞는 프레임으로, 못 얻은 카드는 실루엣 + 조건으로
 * 보인다. 판정은 타석 원장에서 매번 다시 한다(src/server/me/achievements.ts).
 */
export const dynamic = 'force-dynamic';

export default async function CollectionPage() {
  const userId = await getAuthUserId();
  if (!userId) redirect('/auth?returnTo=/me/collection');

  const achievements = await getAchievements(getDb(), userId);
  const earnedCount = achievements.filter((achievement) => achievement.earned).length;

  return (
    <AppShell active="me">
      <main className="flex flex-col gap-4 px-4 py-6">
        <h1 className="text-2xl font-bold">컬렉션</h1>
        <MeTabs active="collection" />

        <p className="num-tabular text-sm text-ink-2">
          {achievements.length}장 중 {earnedCount}장 획득
        </p>

        <ul className="grid max-w-3xl grid-cols-2 gap-3 md:grid-cols-3">
          {achievements.map((achievement) => (
            <li key={achievement.id} className="flex">
              <AchievementCard achievement={achievement} />
            </li>
          ))}
        </ul>

        <p className="text-xs text-ink-2">
          지난 경기 기록에서 다시 계산합니다. 명예의 전당은 레벨로 판정하므로 획득일을
          표시하지 않습니다.
        </p>
      </main>
    </AppShell>
  );
}
