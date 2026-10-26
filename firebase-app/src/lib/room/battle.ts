import type { OptionLabel, Question } from '@/content/questions';
import { ROOM_CODE_ALPHABET } from '@/lib/data/keys';
import { LIMIT_MS, type Difficulty } from '@/lib/engine';

/**
 * 비공식 친구 대결 — 순수 함수(점수·순위·출제). 난수는 주입받는다.
 *
 * 모두 같은 문항을 같은 순서로 **각자 속도로** 푼다. 방장이 문항마다 넘기지 않으므로
 * 방 문서는 시작·종료 때만 바뀐다(실시간 읽기를 줄인다). 점수는 기기가 계산한
 * 비공식 값이라 랭킹·XP에 넣지 않는다.
 */

export const ROOM_SIZES = [2, 3, 4, 6, 10] as const;
export const DEFAULT_ROOM_SIZE = 4;
export const ROOM_QUESTION_COUNTS = [5, 10, 15] as const;
export const DEFAULT_QUESTION_COUNT = 10;
/** 문항당 제한 시간(초) — 개인 퀴즈와 같은 15초 */
export const ROOM_QUESTION_SECONDS = LIMIT_MS / 1000;

/** 정답 100점 + 빠를수록 최대 50점 */
export const POINTS = { correct: 100, speedMax: 50 } as const;

export interface BattleAnswer {
  choice: OptionLabel | null;
  elapsedMs: number;
  correct: boolean;
}

export function pointsFor(answer: BattleAnswer): number {
  if (!answer.correct) return 0;
  const left = Math.max(0, LIMIT_MS - answer.elapsedMs) / LIMIT_MS;
  return POINTS.correct + Math.round(POINTS.speedMax * left);
}

export function scoreOf(answers: readonly BattleAnswer[]): number {
  return answers.reduce((sum, answer) => sum + pointsFor(answer), 0);
}

export function judge(question: Question, choice: OptionLabel | null, elapsedMs: number): BattleAnswer {
  return {
    choice,
    elapsedMs: Math.round(Math.min(elapsedMs, LIMIT_MS + 1)),
    correct: choice !== null && choice === question.correct && elapsedMs <= LIMIT_MS,
  };
}

/** 주소·입력값을 방 코드로. 형식이 틀리면 null(헷갈리는 0·O·1·I·L은 쓰지 않는다) */
export function normalizeRoomCode(input: string): string | null {
  const code = input.trim().toUpperCase();
  if (code.length !== 6) return null;
  for (const char of code) if (!ROOM_CODE_ALPHABET.includes(char)) return null;
  return code;
}

/** 대결 문항: 쉬움 40 · 보통 40 · 어려움 20 비율로 섞고, 겹치지 않게 count개 */
export function pickBattleQuestions(
  bank: readonly Question[],
  count: number,
  random: () => number = Math.random,
): string[] {
  const plan: Difficulty[] = [];
  const hard = Math.round(count * 0.2);
  const easy = Math.round((count - hard) / 2);
  for (let index = 0; index < easy; index += 1) plan.push('easy');
  for (let index = 0; index < count - hard - easy; index += 1) plan.push('normal');
  for (let index = 0; index < hard; index += 1) plan.push('hard');

  const shuffled = shuffle([...bank], random);
  const used = new Set<string>();
  const picked: string[] = [];
  for (const difficulty of plan) {
    const question =
      shuffled.find((item) => item.difficulty === difficulty && !used.has(item.id)) ??
      shuffled.find((item) => !used.has(item.id));
    if (!question) break;
    used.add(question.id);
    picked.push(question.id);
  }
  // 쉬운 것부터 — 같은 난이도 안에서는 섞인 순서
  return picked;
}

function shuffle<T>(items: T[], random: () => number): T[] {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [items[index], items[other]] = [items[other]!, items[index]!];
  }
  return items;
}

export interface Standing {
  uid: string;
  nickname: string;
  score: number;
  correct: number;
  answered: number;
  /** 맞힌 문항에 쓴 시간 합(동점이면 짧은 쪽이 위) */
  correctMs: number;
  rank: number;
}

/** 점수 → 맞힌 시간 순. 둘 다 같으면 같은 순위 */
export function standings(
  players: readonly { uid: string; nickname: string; answers: readonly BattleAnswer[] }[],
): Standing[] {
  const rows = players.map((player) => ({
    uid: player.uid,
    nickname: player.nickname,
    score: scoreOf(player.answers),
    correct: player.answers.filter((answer) => answer.correct).length,
    answered: player.answers.length,
    correctMs: player.answers.filter((answer) => answer.correct).reduce((sum, answer) => sum + answer.elapsedMs, 0),
    rank: 0,
  }));
  rows.sort((a, b) => b.score - a.score || a.correctMs - b.correctMs || a.nickname.localeCompare(b.nickname));
  rows.forEach((row, index) => {
    const previous = rows[index - 1];
    row.rank = previous && previous.score === row.score && previous.correctMs === row.correctMs ? previous.rank : index + 1;
  });
  return rows;
}

/** 모두 마지막 문항까지 답했나 */
export function everyoneDone(players: readonly { answers: readonly unknown[] }[], total: number): boolean {
  return players.length > 0 && players.every((player) => player.answers.length >= total);
}
