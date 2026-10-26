import { describe, expect, it } from 'vitest';
import questions from '@/content/questions.generated.json';
import type { Question } from '@/content/questions';
import {
  MAX_PA,
  answerAtBat,
  boxScoreOf,
  isFinished,
  pickQuestion,
  plannedDifficulty,
  startMatch,
  xpOf,
} from '@/lib/game/match';
import { LEVEL_TEST_SIZE, PLACEMENT_MAX_TIER, buildLevelTest, tierFor } from '@/lib/game/levelTest';
import { tierTheme } from '@/lib/theme/tiers';
import { REVIEW_DAYS, dueNotes, noteAfterReviewCorrect, noteAfterWrong } from '@/lib/game/review';

const bank = questions as Question[];
const q = (overrides: Partial<Question> = {}): Question => ({ ...bank[0]!, ...overrides });
const seeded = (seed: number) => () => {
  seed = (seed * 9301 + 49297) % 233280;
  return seed / 233280;
};

describe('출제', () => {
  it('첫 두 타석은 쉬움·보통, 그 뒤는 40/40/20 — 기존 앱과 같다', () => {
    expect(plannedDifficulty(1, 0.99)).toBe('easy');
    expect(plannedDifficulty(2, 0.99)).toBe('normal');
    expect(plannedDifficulty(3, 0.39)).toBe('easy');
    expect(plannedDifficulty(3, 0.79)).toBe('normal');
    expect(plannedDifficulty(3, 0.8)).toBe('hard');
  });

  it('이번 경기에 나온 문항은 다시 고르지 않고, 최근 본 문항은 뒤로 미룬다', () => {
    const random = seeded(1);
    const used = new Set(bank.slice(0, 400).map((x) => x.id));
    const recent = new Set(bank.slice(400, 500).map((x) => x.id));
    for (let i = 0; i < 50; i += 1) {
      const pick = pickQuestion(bank, 'easy', used, recent, random)!;
      expect(used.has(pick.id)).toBe(false);
      expect(recent.has(pick.id)).toBe(false); // 아직 안 본 문항이 남아 있다
    }
  });

  it('남은 문항이 없으면 null', () => {
    const used = new Set(bank.map((x) => x.id));
    expect(pickQuestion(bank, 'easy', used, new Set(), Math.random)).toBeNull();
  });
});

describe('1이닝 경기', () => {
  it('정답 시간에 따라 엔진 판정이 그대로 적용된다', () => {
    const question = q({ difficulty: 'easy' });
    const { atBat } = answerAtBat(startMatch(), question, question.correct, 1_500);
    expect(atBat).toMatchObject({ correct: true, result: 'HR', rbi: 1 });
  });

  it('오답·시간 초과는 아웃, 3아웃이면 끝난다', () => {
    let match = startMatch();
    const question = q();
    const wrong = (['A', 'B', 'C', 'D'] as const).find((label) => label !== question.correct)!;
    match = answerAtBat(match, question, wrong, 1_000).match;
    match = answerAtBat(match, question, null, 15_001).match;
    expect(isFinished(match)).toBe(false);
    match = answerAtBat(match, question, wrong, 1_000).match;
    expect(isFinished(match)).toBe(true);
    expect(boxScoreOf(match)).toMatchObject({ pa: 3, so: 3, h: 0 });
  });

  it('비공식 XP: 정답 10, 고급 +5, 이닝 완주 20', () => {
    let match = startMatch();
    const hard = q({ difficulty: 'hard' });
    match = answerAtBat(match, hard, hard.correct, 3_000).match;
    expect(xpOf(match.atBats, false)).toBe(15);
    expect(xpOf(match.atBats, true)).toBe(35);
  });

  it('타석 수 상한이 규칙(60)보다 작다', () => {
    expect(MAX_PA).toBeLessThanOrEqual(60);
  });
});

describe('레벨 테스트', () => {
  it('20문항, 겹치지 않고, 있는 영역을 고루 담는다', () => {
    const test = buildLevelTest(bank, seeded(7));
    expect(test).toHaveLength(LEVEL_TEST_SIZE);
    expect(new Set(test.map((x) => x.id)).size).toBe(LEVEL_TEST_SIZE);
    const by = (category: string) => test.filter((x) => x.category === category).length;
    expect(by('rules')).toBe(8);
    expect(by('korean-series')).toBe(4);
    expect(by('player-stats')).toBe(4);
    expect(by('team-history')).toBe(4);
  });

  it('난이도가 한쪽으로 쏠리지 않는다(고급 2~8개)', () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const hard = buildLevelTest(bank, seeded(seed)).filter((x) => x.difficulty === 'hard').length;
      expect(hard).toBeGreaterThanOrEqual(2);
      expect(hard).toBeLessThanOrEqual(8);
    }
  });

  it('맞힌 수 → 처음 등급 1~5 (PRD: 0~5·6~9·10~13·14~17·18~20)', () => {
    expect([0, 5, 6, 9, 10, 13, 14, 17, 18, 19, 20].map((n) => tierFor(n))).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 5]);
  });

  it('처음 테스트로는 Lv5(골든글러브)까지만 — 비율이 아니라 정답 수', () => {
    expect(Math.max(...Array.from({ length: LEVEL_TEST_SIZE + 1 }, (_, n) => tierFor(n)))).toBe(PLACEMENT_MAX_TIER);
    expect(tierTheme(tierFor(20)).name).toBe('골든글러브');
  });
});

describe('오답노트 간격 복습(1·3·7·14일)', () => {
  const DAY = 86_400_000;
  const t0 = Date.UTC(2026, 9, 26);

  it('틀리면 단계 0, 하루 뒤 복습. 다시 틀리면 횟수가 늘고 단계는 처음부터', () => {
    const first = noteAfterWrong(null, t0);
    expect(first).toMatchObject({ wrongCount: 1, stage: 0, nextReviewAt: t0 + DAY, mastered: false });
    const again = noteAfterWrong(first, t0 + 5 * DAY);
    expect(again).toMatchObject({ wrongCount: 2, lastWrongAt: t0 + 5 * DAY, stage: 0 });
  });

  it('복습에서 맞히면 1→3→7→14일 뒤로, 14일 복습을 통과하면 익힌 문항', () => {
    let note = noteAfterWrong(null, t0);
    const gaps: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      const now = note.nextReviewAt;
      note = noteAfterReviewCorrect(note, now);
      gaps.push((note.nextReviewAt - now) / DAY);
    }
    expect(gaps).toEqual([REVIEW_DAYS[1], REVIEW_DAYS[2], REVIEW_DAYS[3]]);
    note = noteAfterReviewCorrect(note, note.nextReviewAt);
    expect(note.mastered).toBe(true);
    expect(note.stage).toBeLessThanOrEqual(4); // 규칙: 0~4
    // 익힌 문항은 복습 시각 순 목록의 끝으로 밀린다
    expect(note.nextReviewAt).toBeGreaterThan(t0 + 365 * DAY);
  });

  it('복습할 노트만, 오래 기다린 것부터', () => {
    const notes = [
      { id: 'a', mastered: false, nextReviewAt: t0 + DAY },
      { id: 'b', mastered: false, nextReviewAt: t0 - DAY },
      { id: 'c', mastered: true, nextReviewAt: t0 - 2 * DAY },
      { id: 'd', mastered: false, nextReviewAt: t0 - 3 * DAY },
    ];
    expect(dueNotes(notes, t0).map((n) => n.id)).toEqual(['d', 'b']);
  });
});
