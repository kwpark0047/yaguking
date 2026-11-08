import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';

/** kbo.mjs의 형(테스트가 TypeScript에서 불러온다) */
export const KBO_TEAMS: string[];
export const KBO_DEFAULT_TOTAL: number;
export const KBO_ATTEMPT_RETENTION_DAYS: number;
export function kstDateOf(ms: number): string;
export function addDays(date: string, days: number): string;

/* eslint-disable @typescript-eslint/no-explicit-any -- 원자료와 문서 모양은 테스트에서 칸만 확인한다 */
export function normalizeGame(raw: Record<string, unknown>): any;
export function checkGame(game: any, expectedDate: string): { usable: boolean; pending: boolean; problems: string[] };
export function dedupeGames(games: any[]): any[];
export function gameHash(game: any): string;
export function candidatesOf(game: any, random: () => number): any[];
export function difficultyPlan(total: number): { easy: number; normal: number; hard: number };
export function pickQuestions(candidates: any[], total: number, random: () => number): any[];
export function toDocuments(picked: any[], random: () => number): any[];
export function documentProblem(document: any): string | null;
export function generateSet(games: any[], options: { total?: number; seed: string }): { documents: any[]; problems: string[] };

export interface KboAdapter {
  name: string;
  isTest: boolean;
  fetchDay(date: string): Promise<{ seasonEnded?: boolean; games?: Record<string, unknown>[] }>;
}
export function fixtureAdapter(days: Record<string, unknown>): KboAdapter;

export interface KboRunReport {
  gamesDate: string;
  setId: string;
  source: string;
  status: string;
  games: number;
  usable: number;
  pending: number;
  corrected: number;
  questions: number;
  problems: string[];
}
export function runKboPipeline(options: { db: Firestore; adapter: KboAdapter; gamesDate?: string; now?: number }): Promise<KboRunReport>;

export interface KboSummary {
  views: number;
  guestViews: number;
  starts: number;
  completes: number;
  signupClicks: number;
  signupCompletes: number;
  returned: number;
  questions: { index: number; answered: number; correct: number }[];
}
export function summarizeAttempts(options: {
  attempts: { uid: string; guest: boolean; signupClicked?: boolean; answers?: Record<string, { choice?: string | null }> }[];
  correct: Record<number, string>;
  withdrawn?: number[];
  total: number;
  previousUids?: Set<string>;
  signedUpUids?: Set<string>;
}): KboSummary;
export function runKboStats(options: { db: Firestore; auth?: Auth; now?: number }): Promise<{ setId: string; counted: boolean; views?: number; attemptsDeleted: number }>;
export function importReviewSet(options: { db: Firestore; setId: string; questions: { stem: string; options: { label: string; text: string }[]; difficulty: string; category: string; recordAsOf: string; seasonScope: string; correct: string; explanation: string; source: string }[]; kind?: string; replace?: boolean; now?: number }): Promise<{ setId: string; written: boolean; reason?: string; questions?: number; replaced?: string | null }>;
