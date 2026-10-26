import type { Timestamp } from 'firebase/firestore';
import type { OptionLabel } from '@/content/questions';
import type { AtBatResult } from '@/lib/engine';

/**
 * Firestore 문서 모양 (docs/data-model.md). 필드를 바꾸면 firestore.rules와
 * tests/rules/를 함께 고친다 — 규칙이 정해진 필드 말고는 받지 않는다.
 *
 * 모든 점수는 기기가 계산한 **비공식** 값이다.
 */

/** users/{uid} — 회원만(비회원은 프로필이 없다) */
export interface UserDoc {
  ageConfirmedAt: Timestamp;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
  nickname?: string;
  /** 구단 slug, 1~3개, 1위 필수 */
  favoriteTeams?: string[];
  /** 자유 입력, 0~3명 */
  favoritePlayers?: string[];
  /** 최초 레벨 테스트 — 한 번만 */
  levelTest?: {
    completedAt: Timestamp;
    correct: number;
    total: number;
    tier: number;
    byCategory: Record<string, number>;
  };
}

/** nicknames/{소문자 닉네임} */
export interface NicknameDoc {
  uid: string;
}

/** 타석 하나 — 경기 기록 안에 배열로 */
export interface AtBatRecord {
  questionId: string;
  choice: OptionLabel | null;
  correct: boolean;
  elapsedMs: number;
  result: AtBatResult;
  rbi: number;
}

/** users/{uid}/games/{gameId} — 경기를 끝낼 때 **한 번** 쓴다 */
export interface GameDoc {
  mode: 'practice' | 'levelTest';
  createdAt: Timestamp;
  innings: number;
  runs: number;
  pa: number;
  atBats: AtBatRecord[];
}

/** users/{uid}/daily/{kstDayKey} — 비회원 하루 경기 수(최대 2) */
export interface DailyDoc {
  count: number;
}

/** users/{uid}/summary/main — 경기마다 하나씩 늘리는 누적(비공식) */
export interface SummaryDoc {
  games: number;
  pa: number;
  ab: number;
  h: number;
  hr: number;
  bb: number;
  so: number;
  runs: number;
  xp: number;
  updatedAt: Timestamp;
}

/** users/{uid}/wrongNotes/{questionId} — 1·3·7·14일 복습 */
export interface WrongNoteDoc {
  questionId: string;
  wrongCount: number;
  firstWrongAt: Timestamp;
  lastWrongAt: Timestamp;
  /** 0~4: 다음 복습까지 1·3·7·14일, 4면 끝 */
  stage: number;
  nextReviewAt: Timestamp;
  mastered: boolean;
}

/** rooms/{code} — 비공식 친구 대결 */
export interface RoomDoc {
  hostUid: string;
  status: 'waiting' | 'playing' | 'finished';
  createdAt: Timestamp;
  startedAt?: Timestamp;
  finishedAt?: Timestamp;
  maxPlayers: number;
  playerIds: string[];
  questionIds: string[];
  questionSeconds: number;
}

/** rooms/{code}/players/{uid} */
export interface RoomPlayerDoc {
  nickname: string;
  joinedAt: Timestamp;
  updatedAt?: Timestamp;
  score: number;
  answers: { choice: OptionLabel | null; elapsedMs: number; correct: boolean }[];
}
