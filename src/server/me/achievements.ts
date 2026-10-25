import type { getDb } from '@/lib/db/sql';
import {
  ACHIEVEMENTS,
  judgeAchievements,
  type AchievementDefinition,
  type AchievementId,
  type EarnedAchievement,
  type LedgerAtBat,
} from '@/lib/achievements/rules';
import type { AtBatResult, UpgradeReason } from '@/lib/engine';
import type { AchievementDto } from '@/types/api';

type Db = ReturnType<typeof getDb>;

const KST_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** 명예의 전당(Lv.7) — 레벨로만 판정하는 업적 */
const LEVEL_ACHIEVEMENT: AchievementId = 'hall_of_fame';
const LEVEL_ACHIEVEMENT_LEVEL = 7;

/**
 * 본인 원장을 읽어 판정한다.
 *
 * **본인 경기만** 본다. 결과가 확정된 타석을 읽어 순수 함수
 * (`judgeAchievements`)로 판정한다. 모드·상태는 가리지 않는다 — 기권한 경기의
 * 홈런도 친 홈런이다.
 *
 * 획득 기록을 따로 저장하지 않는다. 원장이 진실이고, 규칙을 고치면 과거
 * 기록에도 그대로 다시 적용된다. 타석이 아주 많아지면 집계 테이블로 옮긴다.
 */
async function loadEarned(
  db: Db,
  userId: string,
): Promise<Map<AchievementId, EarnedAchievement>> {
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

  return judgeAchievements(ledger, stats?.level ?? 1);
}

function toDto(definition: AchievementDefinition, earned: EarnedAchievement | undefined) {
  return {
    id: definition.id,
    title: definition.title,
    condition: definition.condition,
    rarity: definition.rarity,
    earned: earned !== undefined,
    earnedOn: earned?.at ? KST_DATE.format(earned.at) : null,
  } satisfies AchievementDto;
}

/** 내 업적 카드 컬렉션 (14 문서 §5.2). 모든 카드를 획득 여부와 함께 */
export async function getAchievements(db: Db, userId: string): Promise<AchievementDto[]> {
  const earned = await loadEarned(db, userId);
  return ACHIEVEMENTS.map((definition) => toDto(definition, earned.get(definition.id)));
}

/**
 * **이 경기로 처음 얻은** 업적 카드 (경기 결과 화면).
 *
 * 타석으로 얻는 업적은 조건을 처음 채운 타석이 이 경기에 있으면 새 카드다.
 * 같은 업적을 예전에 이미 얻었다면 이번에 또 채워도 새 카드가 아니다.
 *
 * 명예의 전당은 타석 원장에 경기가 없다. XP 원장에서 **이 경기의 지급 직전과
 * 직후 레벨**을 비교해, 이 경기로 Lv.7을 넘었을 때만 새 카드로 본다.
 */
export async function getNewAchievements(
  db: Db,
  userId: string,
  sessionId: string,
): Promise<AchievementDto[]> {
  const earned = await loadEarned(db, userId);

  const isNew = new Set<AchievementId>();
  for (const [id, moment] of earned) {
    if (moment.sessionId === sessionId) isNew.add(id);
  }

  if (earned.has(LEVEL_ACHIEVEMENT) && (await crossedLevelIn(db, userId, sessionId))) {
    isNew.add(LEVEL_ACHIEVEMENT);
  }

  return ACHIEVEMENTS.filter((definition) => isNew.has(definition.id)).map((definition) =>
    toDto(definition, earned.get(definition.id)),
  );
}

/**
 * 이 경기의 XP 지급으로 Lv.7 문턱을 넘었는가.
 *
 * 한 경기의 XP는 종료 처리 한 트랜잭션에서 지급되어 지급 시각이 같다.
 * 멱등 키(`사유:대상:회원`)의 대상이 이 경기이거나 이 경기의 타석인 지급을
 * 찾아, 그 시각 **이전 합계**와 **그 시각까지 합계**의 레벨을 DB 함수로 견준다.
 */
async function crossedLevelIn(db: Db, userId: string, sessionId: string): Promise<boolean> {
  const [row] = await db<{ before: number; after: number }[]>`
    with mine as (
      select amount, created_at, split_part(idempotency_key, ':', 2) as entity
        from public.xp_transactions
       where user_id = ${userId}
    ),
    session_entities as (
      select ${sessionId}::text as id
      union all
      select id::text from public.at_bats where session_id = ${sessionId}
    ),
    granted as (
      select max(created_at) as at
        from mine
       where entity in (select id from session_entities)
    )
    select public.level_for_xp(coalesce(sum(m.amount) filter (where m.created_at < g.at), 0)) as before,
           public.level_for_xp(coalesce(sum(m.amount) filter (where m.created_at <= g.at), 0)) as after
      from granted g
      left join mine m on true
     where g.at is not null
     group by g.at
  `;

  return (
    row !== undefined &&
    row.before < LEVEL_ACHIEVEMENT_LEVEL &&
    row.after >= LEVEL_ACHIEVEMENT_LEVEL
  );
}
