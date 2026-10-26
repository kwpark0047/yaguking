import { describe, expect, it } from 'vitest';
import questions from '@/content/questions.generated.json';
import type { Question } from '@/content/questions';
import { ROOM_CODE_ALPHABET, roomCode } from '@/lib/data/keys';
import { LIMIT_MS } from '@/lib/engine';
import {
  POINTS,
  ROOM_QUESTION_COUNTS,
  ROOM_QUESTION_SECONDS,
  ROOM_SIZES,
  everyoneDone,
  judge,
  normalizeRoomCode,
  pickBattleQuestions,
  pointsFor,
  scoreOf,
  standings,
  type BattleAnswer,
} from '@/lib/room/battle';
import { roomNicknameProblem } from '@/lib/room/nickname';

const bank = questions as Question[];
const seeded = (seed: number) => () => {
  seed = (seed * 9301 + 49297) % 233280;
  return seed / 233280;
};
const right = (elapsedMs: number): BattleAnswer => ({ choice: 'A', elapsedMs, correct: true });
const wrong: BattleAnswer = { choice: 'B', elapsedMs: 3000, correct: false };

describe('점수', () => {
  it('정답 100점 + 빠를수록 최대 50점, 오답·시간 초과는 0점', () => {
    expect(pointsFor(right(0))).toBe(POINTS.correct + POINTS.speedMax);
    expect(pointsFor(right(LIMIT_MS / 2))).toBe(125);
    expect(pointsFor(right(LIMIT_MS))).toBe(100);
    expect(pointsFor(wrong)).toBe(0);
    expect(scoreOf([right(0), wrong, right(LIMIT_MS)])).toBe(250);
  });

  it('최고 점수도 규칙의 점수 상한(10000) 안이다', () => {
    const most = Math.max(...ROOM_QUESTION_COUNTS);
    expect(scoreOf(Array.from({ length: most }, () => right(0)))).toBeLessThanOrEqual(10_000);
  });

  it('채점: 정답이어도 제한 시간을 넘으면 틀린 것, 시간은 정수로', () => {
    const question = bank[0]!;
    expect(judge(question, question.correct, 1234.6)).toEqual({ choice: question.correct, elapsedMs: 1235, correct: true });
    expect(judge(question, question.correct, LIMIT_MS + 5).correct).toBe(false);
    expect(judge(question, null, LIMIT_MS + 1)).toEqual({ choice: null, elapsedMs: LIMIT_MS + 1, correct: false });
  });
});

describe('순위', () => {
  it('점수 → 맞힌 시간 순, 완전히 같으면 같은 순위', () => {
    const table = standings([
      { uid: 'a', nickname: '가', answers: [right(5000)] },
      { uid: 'b', nickname: '나', answers: [right(1000), right(1000)] },
      { uid: 'c', nickname: '다', answers: [right(5000)] },
      { uid: 'd', nickname: '라', answers: [wrong] },
    ]);
    expect(table.map((row) => [row.uid, row.rank])).toEqual([
      ['b', 1],
      ['a', 2],
      ['c', 2],
      ['d', 4],
    ]);
    expect(table[0]).toMatchObject({ correct: 2, answered: 2 });
  });

  it('모두 마지막 문항까지 답해야 끝', () => {
    expect(everyoneDone([], 3)).toBe(false);
    expect(everyoneDone([{ answers: [1, 2, 3] }, { answers: [1, 2] }], 3)).toBe(false);
    expect(everyoneDone([{ answers: [1, 2, 3] }, { answers: [1, 2, 3] }], 3)).toBe(true);
  });
});

describe('출제·방 설정', () => {
  it('문항이 겹치지 않고, 쉬움 40 · 보통 40 · 어려움 20 비율', () => {
    const ids = pickBattleQuestions(bank, 10, seeded(7));
    expect(new Set(ids).size).toBe(10);
    const byId = new Map(bank.map((question) => [question.id, question]));
    const counts = { easy: 0, normal: 0, hard: 0 };
    for (const id of ids) counts[byId.get(id)!.difficulty] += 1;
    expect(counts).toEqual({ easy: 4, normal: 4, hard: 2 });
  });

  it('문항 ID는 규칙의 형식이고, 방 설정값은 규칙의 범위 안이다', () => {
    for (const count of ROOM_QUESTION_COUNTS) {
      const ids = pickBattleQuestions(bank, count, seeded(count));
      expect(ids).toHaveLength(count);
      expect(count).toBeGreaterThanOrEqual(3);
      expect(count).toBeLessThanOrEqual(15);
    }
    for (const size of ROOM_SIZES) expect(size >= 2 && size <= 10).toBe(true);
    expect(ROOM_QUESTION_SECONDS).toBe(15);
  });

  it('문제은행이 모자라면 있는 만큼만', () => {
    expect(pickBattleQuestions(bank.slice(0, 2), 5)).toHaveLength(2);
  });

  it('방 코드: 대소문자·공백을 고치고, 헷갈리는 글자·길이는 거절', () => {
    expect(normalizeRoomCode(' abc234 ')).toBe('ABC234');
    expect(normalizeRoomCode('ABC23')).toBeNull();
    expect(normalizeRoomCode('ABCO10')).toBeNull();
    const code = roomCode(seeded(3));
    expect(normalizeRoomCode(code)).toBe(code);
    expect(/^[A-Z2-9]{6}$/.test(code)).toBe(true);
    expect(ROOM_CODE_ALPHABET).not.toMatch(/[01IOL]/);
  });

  it('비회원 이름은 1~16자', () => {
    expect(roomNicknameProblem('  ')).not.toBeNull();
    expect(roomNicknameProblem('가'.repeat(17))).not.toBeNull();
    expect(roomNicknameProblem('손님1234')).toBeNull();
  });
});
