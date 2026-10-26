import type { AtBatResult, UpgradeReason } from '@/lib/engine';

/**
 * 업적 카드 판정 (14 문서 §5.2, 3단계).
 *
 * **이미 있는 타석 원장(`at_bats`)만으로** 계산한다. 업적을 위해 새로 모으는
 * 정보는 없고, 획득 기록을 따로 저장하지도 않는다. 원장이 진실이므로 규칙을
 * 고치면 과거 기록에도 그대로 다시 적용된다.
 *
 * 희귀도는 카드 프레임 단계다. 등급 7단계와 **같은 소재·테두리**를 그대로
 * 쓴다(14 문서 §5.2) — 희귀도 5 카드는 골든글러브 카드처럼 금박이다.
 *
 * 순수 함수다. IO·DB에 기대지 않는다.
 */

export type AchievementId =
  | 'first_hit'
  | 'first_hr'
  | 'streak_bonus'
  | 'cycle'
  | 'big_inning'
  | 'hall_of_fame';

export interface AchievementDefinition {
  id: AchievementId;
  title: string;
  /** 획득 조건. 미획득 카드에 그대로 보인다 */
  condition: string;
  /** 1~7. 카드 프레임은 같은 숫자의 등급 프레임을 쓴다 */
  rarity: number;
}

/** 빅 이닝 기준 득점. 한 이닝(같은 경기·같은 이닝)의 타점 합 */
export const BIG_INNING_RUNS = 5;

const HITS: readonly AtBatResult[] = ['1B', '2B', '3B', 'HR'];

/** 화면에 보이는 순서 = 희귀도 순 */
export const ACHIEVEMENTS: readonly AchievementDefinition[] = [
  { id: 'first_hit', title: '첫 안타', condition: '안타를 처음 친다', rarity: 1 },
  { id: 'first_hr', title: '첫 홈런', condition: '홈런을 처음 친다', rarity: 2 },
  {
    id: 'streak_bonus',
    title: '5연속 정답',
    condition: '연속 정답 보너스로 타구가 한 단계 오른다',
    rarity: 3,
  },
  {
    id: 'cycle',
    title: '사이클링 히트',
    condition: '한 경기에서 안타·2루타·3루타·홈런을 모두 친다',
    rarity: 5,
  },
  {
    id: 'big_inning',
    title: '빅 이닝',
    condition: `한 이닝에 ${BIG_INNING_RUNS}점 이상을 낸다`,
    rarity: 6,
  },
  {
    id: 'hall_of_fame',
    title: '명예의 전당 입성',
    condition: 'Lv.7 명예의 전당에 오른다',
    rarity: 7,
  },
];

/** 판정에 쓰는 결과가 확정된 타석 하나 */
export interface LedgerAtBat {
  sessionId: string;
  sequence: number;
  inning: number;
  result: AtBatResult;
  rbi: number;
  upgradeReason: UpgradeReason | null;
  submittedAt: Date;
}

/** 업적을 **처음** 얻은 순간 */
export interface EarnedAchievement {
  /** 조건을 채운 타석의 제출 시각. 원장에 시각이 없으면 null */
  at: Date | null;
  /** 조건을 채운 타석의 경기. 경기 결과 화면의 "새 업적"을 가르는 기준이다 */
  sessionId: string | null;
}

/**
 * 획득한 업적과 처음 획득한 순간.
 *
 * 명예의 전당은 레벨에서 판정하는데 레벨에 오른 시각·경기는 타석 원장에
 * 없으므로 둘 다 `null`이다(지어내지 않는다). 어느 경기에서 올랐는지는 XP
 * 원장으로 따로 가린다(src/server/me/achievements.ts).
 */
export function judgeAchievements(
  atBats: readonly LedgerAtBat[],
  level: number,
): Map<AchievementId, EarnedAchievement> {
  const earned = new Map<AchievementId, EarnedAchievement>();
  const earn = (id: AchievementId, atBat: LedgerAtBat | null) => {
    if (!earned.has(id)) {
      earned.set(id, { at: atBat?.submittedAt ?? null, sessionId: atBat?.sessionId ?? null });
    }
  };

  // 시간순으로 한 번 훑는다. 처음 조건을 채운 타석이 획득 시각이 된다.
  const ordered = [...atBats].sort(
    (a, b) =>
      a.submittedAt.getTime() - b.submittedAt.getTime() ||
      a.sessionId.localeCompare(b.sessionId) ||
      a.sequence - b.sequence,
  );

  const hitsBySession = new Map<string, Set<AtBatResult>>();
  const runsByInning = new Map<string, number>();

  for (const atBat of ordered) {
    if (HITS.includes(atBat.result)) {
      earn('first_hit', atBat);

      const hits = hitsBySession.get(atBat.sessionId) ?? new Set<AtBatResult>();
      hits.add(atBat.result);
      hitsBySession.set(atBat.sessionId, hits);
      if (hits.size === HITS.length) earn('cycle', atBat);
    }

    if (atBat.result === 'HR') earn('first_hr', atBat);

    if (atBat.upgradeReason === 'streak' || atBat.upgradeReason === 'both') {
      earn('streak_bonus', atBat);
    }

    const inningKey = `${atBat.sessionId}:${atBat.inning}`;
    const runs = (runsByInning.get(inningKey) ?? 0) + atBat.rbi;
    runsByInning.set(inningKey, runs);
    if (runs >= BIG_INNING_RUNS) earn('big_inning', atBat);
  }

  if (level >= 7) earn('hall_of_fame', null);

  return earned;
}
