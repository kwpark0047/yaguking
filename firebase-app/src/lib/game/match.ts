import type { Question } from '@/content/questions';
import {
  applyAtBat,
  buildBoxScore,
  initialState,
  resolveAtBat,
  type AtBatResult,
  type BoxScore,
  type Difficulty,
  type SessionGoal,
  type SessionState,
  type UpgradeReason,
} from '@/lib/engine';

/**
 * 개인 퀴즈 1이닝 — **기기에서 판정한다**(Firebase판, 서버 없음).
 *
 * 판정 규칙은 기존 앱과 같은 엔진(`resolveAtBat`·`applyAtBat`)이다. 다만 시간을
 * 기기가 재고 정답도 기기에 있으므로 결과는 **비공식**이다(docs/data-model.md §0).
 *
 * 순수 함수다. 난수와 시각은 주입받아 테스트에서 고정한다.
 */

/** 한 판 = 1이닝(3아웃). 문항이 바닥나도 끝난다. */
export const PRACTICE_GOAL: SessionGoal = { kind: 'innings', innings: 1 };
/** 안전 상한 — 규칙의 타석 수 상한(60)보다 작게 */
export const MAX_PA = 40;

/** 기존 앱과 같은 출제 난이도: 첫 두 타석은 쉽게, 그 뒤 초급 40 / 중급 40 / 고급 20 */
export function plannedDifficulty(sequence: number, roll: number): Difficulty {
  if (sequence === 1) return 'easy';
  if (sequence === 2) return 'normal';
  if (roll < 0.4) return 'easy';
  if (roll < 0.8) return 'normal';
  return 'hard';
}

/**
 * 다음 문항을 고른다. 이번 경기에 나온 문항은 빼고, 최근에 본 문항은 뒤로 미룬다.
 * 계획한 난이도가 바닥나면 난이도를 풀고 고른다. 아무것도 없으면 null.
 */
export function pickQuestion(
  bank: readonly Question[],
  difficulty: Difficulty,
  usedInMatch: ReadonlySet<string>,
  recentlySeen: ReadonlySet<string>,
  random: () => number,
  /** 고를 수 있으면 이 조건을 먼저(예: 규칙 문항 비율) — 맞는 문항이 없으면 조건 없이 */
  prefer?: (question: Question) => boolean,
): Question | null {
  if (prefer) {
    const preferred = pickQuestion(bank.filter(prefer), difficulty, usedInMatch, recentlySeen, random);
    if (preferred) return preferred;
  }
  const available = bank.filter((q) => !usedInMatch.has(q.id));
  const tiers = [
    available.filter((q) => q.difficulty === difficulty && !recentlySeen.has(q.id)),
    available.filter((q) => !recentlySeen.has(q.id)),
    available.filter((q) => q.difficulty === difficulty),
    available,
  ];
  const pool = tiers.find((tier) => tier.length > 0);
  if (!pool) return null;
  return pool[Math.floor(random() * pool.length)] ?? null;
}

export interface PlayedAtBat {
  questionId: string;
  difficulty: Difficulty;
  choice: Question['correct'] | null;
  correct: boolean;
  elapsedMs: number;
  result: AtBatResult;
  upgraded: boolean;
  upgradeReason: UpgradeReason | null;
  rbi: number;
  inning: number;
}

export interface Match {
  state: SessionState;
  streak: number;
  atBats: PlayedAtBat[];
}

export function startMatch(): Match {
  return { state: initialState(), streak: 0, atBats: [] };
}

/** 타석 하나를 판정해 다음 경기 상태를 돌려준다. choice=null이면 시간 초과. */
export function answerAtBat(
  match: Match,
  question: Question,
  choice: Question['correct'] | null,
  elapsedMs: number,
): { match: Match; atBat: PlayedAtBat } {
  const correct = choice !== null && choice === question.correct;
  const verdict = resolveAtBat(correct, elapsedMs, question.difficulty, match.streak);
  const inning = match.state.inning;
  const state = applyAtBat(match.state, verdict.result, PRACTICE_GOAL);

  const atBat: PlayedAtBat = {
    questionId: question.id,
    difficulty: question.difficulty,
    choice,
    correct,
    elapsedMs: Math.round(elapsedMs),
    result: verdict.result,
    upgraded: verdict.upgraded,
    upgradeReason: verdict.upgradeReason,
    rbi: state.rbi,
    inning,
  };

  return { match: { state, streak: verdict.streakAfter, atBats: [...match.atBats, atBat] }, atBat };
}

export function isFinished(match: Match): boolean {
  return match.state.finished || match.atBats.length >= MAX_PA;
}

export function boxScoreOf(match: Match): BoxScore {
  return buildBoxScore(match.atBats.map((atBat) => ({ result: atBat.result, rbi: atBat.rbi })));
}

/**
 * 비공식 XP — 기존 앱의 지급 기준과 같은 숫자(정답 10, 고급 정답 +5, 이닝 완주 20).
 * 기기가 계산하므로 공식 등급·랭킹에 쓰지 않는다.
 */
export const XP = { answerCorrect: 10, hardCorrectBonus: 5, inningComplete: 20, chanceSuccess: 10 } as const;

export function xpOf(atBats: readonly PlayedAtBat[], finishedInning: boolean): number {
  let xp = finishedInning ? XP.inningComplete : 0;
  for (const atBat of atBats) {
    if (!atBat.correct) continue;
    xp += XP.answerCorrect;
    if (atBat.difficulty === 'hard') xp += XP.hardCorrectBonus;
  }
  return xp;
}

/** 한 경기에서 규칙 문항은 절반 이하(docs/fun-plan.md §6) — 다음 문항을 규칙으로 내도 되나 */
export function rulesAllowed(categoriesSoFar: readonly string[]): boolean {
  const rules = categoriesSoFar.filter((category) => category === 'rules').length;
  return rules + 1 <= Math.floor((categoriesSoFar.length + 1) / 2);
}
