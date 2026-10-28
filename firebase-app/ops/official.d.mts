import type { Firestore } from 'firebase-admin/firestore';

/** official.mjs의 형(테스트가 TypeScript에서 불러온다) */
export const OFFICIAL_TOTAL: number;
export const OFFICIAL_QUESTION_MS: number;
export const OFFICIAL_GRACE_MS: number;
export const OFFICIAL_POINTS: { correct: number; speedMax: number; finish: number };
export const OFFICIAL_RETENTION_DAYS: number;
export function roundIdOf(ms: number): string;
export function roundOpensAt(roundId: string): number;
export function questionPoints(correct: boolean, elapsedMs: number): number;
export function gradeAttempt(
  startedAt: number,
  answers: Record<string, { choice: string | null; at: number }>,
  key: readonly string[],
): { questions: { choice: string | null; correct: boolean; elapsedMs: number; points: number }[]; correct: number; answered: number; points: number };
export interface PoolQuestion {
  id: string;
  category: string;
  difficulty: string;
  recordAsOf: string;
  seasonScope: string;
  stem: string;
  options: { label: string; text: string }[];
  correct: string;
  explanation: string;
  source: string;
}
export function parsePool(text: string, bankIds?: Set<string>): { questions: PoolQuestion[]; problems: string[] };
export function bankIds(): Set<string>;
export function runOfficial(options: { db: Firestore; poolText?: string | null; now?: number; start?: string; bank?: Set<string> }): Promise<{
  graded: string[];
  attempts: number;
  removedAttempts: number;
  published: string[];
  short: string[];
  remaining: number | null;
  problems: string[];
  deletedRounds: number;
}>;
