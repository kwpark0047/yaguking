import type { getDb } from '@/lib/db/sql';
import { ACHIEVEMENTS, judgeAchievements, type LedgerAtBat } from '@/lib/achievements/rules';
import type { AtBatResult, UpgradeReason } from '@/lib/engine';
import type { AchievementDto } from '@/types/api';

type Db = ReturnType<typeof getDb>;

const KST_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * 내 업적 카드 컬렉션 (14 문서 §5.2).
 *
 * **본인 경기만** 본다. 결과가 확정된 타석을 시간순으로 읽어 순수 함수
 * (`judgeAchievements`)로 판정한다. 모드·상태는 가리지 않는다 — 기권한 경기의
 * 홈런도 친 홈런이다.
 *
 * 획득 기록을 따로 저장하지 않는다. 원장이 진실이고, 규칙을 고치면 과거
 * 기록에도 그대로 다시 적용된다. 타석이 아주 많아지면 집계 테이블로 옮긴다.
 */
export async function getAchievements(db: Db, userId: string): Promise<AchievementDto[]> {
  const rows = await db<
    {
      session_id: string;
      sequence: number;
      inning: number;
      result: AtBatResult;
      rbi: number;
      upgrade_reason: UpgradeReason | null;
      submitted_at: Date;
    }[]
  >`
    select a.session_id, a.sequence, a.inning, a.result, a.rbi,
           a.upgrade_reason, a.submitted_at
      from public.at_bats a
      join public.play_sessions s on s.id = a.session_id
     where s.user_id = ${userId}
       and a.result is not null
  `;

  const [stats] = await db<{ level: number }[]>`
    select level from public.user_private_stats where user_id = ${userId}
  `;

  const ledger: LedgerAtBat[] = rows.map((row) => ({
    sessionId: row.session_id,
    sequence: row.sequence,
    inning: row.inning,
    result: row.result,
    rbi: row.rbi,
    upgradeReason: row.upgrade_reason,
    submittedAt: row.submitted_at,
  }));

  const earned = judgeAchievements(ledger, stats?.level ?? 1);

  return ACHIEVEMENTS.map((definition) => {
    const at = earned.get(definition.id);
    return {
      id: definition.id,
      title: definition.title,
      condition: definition.condition,
      rarity: definition.rarity,
      earned: earned.has(definition.id),
      earnedOn: at ? KST_DATE.format(at) : null,
    };
  });
}
