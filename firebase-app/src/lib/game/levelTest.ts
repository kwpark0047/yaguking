import type { CategorySlug, Question } from '@/content/questions';
import type { Difficulty } from '@/lib/engine';

/**
 * 최초 레벨 테스트 — 20문항(01 PRD F05).
 *
 * PRD는 5영역 × 4문항이지만 문제은행에 **KBO 역사가 0문항**, 구단 역사가 5문항뿐이다.
 * 있는 영역으로 채운다: 규칙·상식 8, 한국시리즈 4, 선수 기록 4, 구단 역사 4.
 * 난이도는 초급 8 / 중급 8 / 고급 4를 **될 수 있는 만큼** 맞춘다(영역별 문항이 적어
 * 정확히 못 맞출 수 있다). 영역에 문항이 모자라면 규칙·상식으로 채운다.
 */
export const LEVEL_TEST_SIZE = 20;
export const LEVEL_TEST_QUOTA: Partial<Record<CategorySlug, number>> = {
  rules: 8,
  'korean-series': 4,
  'player-stats': 4,
  'team-history': 4,
};
const DIFFICULTY_TARGET: Record<Difficulty, number> = { easy: 8, normal: 8, hard: 4 };

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

export function buildLevelTest(bank: readonly Question[], random: () => number = Math.random): Question[] {
  const chosen: Question[] = [];
  const used = new Set<string>();
  const difficultyCount: Record<Difficulty, number> = { easy: 0, normal: 0, hard: 0 };

  const take = (pool: Question[], count: number) => {
    // 난이도 목표에서 가장 모자란 쪽부터 고른다
    const candidates = shuffle(pool, random);
    for (let n = 0; n < count; n += 1) {
      const remaining = candidates.filter((q) => !used.has(q.id));
      if (remaining.length === 0) return;
      remaining.sort(
        (a, b) =>
          difficultyCount[a.difficulty] / DIFFICULTY_TARGET[a.difficulty] -
          difficultyCount[b.difficulty] / DIFFICULTY_TARGET[b.difficulty],
      );
      const pick = remaining[0]!;
      used.add(pick.id);
      difficultyCount[pick.difficulty] += 1;
      chosen.push(pick);
    }
  };

  for (const [category, quota] of Object.entries(LEVEL_TEST_QUOTA)) {
    take(bank.filter((q) => q.category === category), quota ?? 0);
  }
  take(bank.filter((q) => q.category === 'rules'), LEVEL_TEST_SIZE - chosen.length);
  take([...bank], LEVEL_TEST_SIZE - chosen.length);

  return shuffle(chosen, random);
}

/**
 * 맞힌 수 → 처음 등급 1~5 (01 PRD §6, 03 §4): 0~5 → 1, 6~9 → 2, 10~13 → 3, 14~17 → 4, 18~20 → 5.
 * 정답 **수**만 본다(비율이 아니다). 처음 테스트로는 Lv5(골든글러브)까지만 — Lv6·7은 2차 승급 시험.
 * firestore.rules의 validLevelTest()가 같은 구간으로 등급과 맞힌 수가 맞는지 검사한다.
 */
export const PLACEMENT_MAX_TIER = 5;

export function tierFor(correct: number): number {
  if (correct >= 18) return 5;
  if (correct >= 14) return 4;
  if (correct >= 10) return 3;
  if (correct >= 6) return 2;
  return 1;
}
