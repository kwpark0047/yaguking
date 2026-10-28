import type { Auth, UserRecord } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';

/** admin.mjs의 형(테스트가 TypeScript에서 불러온다) */
export interface AccountMirror {
  email: string | null;
  emailVerified: boolean;
  providers: string[];
  disabled: boolean;
  createdAt: number;
  lastSignInAt: number;
  admin: boolean;
}

export function isMemberAccount(user: Pick<UserRecord, 'providerData' | 'email'>): boolean;
export function mirrorOf(user: UserRecord): AccountMirror;
export function setAdmin(options: { auth: Auth; email: string; value?: boolean }): Promise<{
  uid: string;
  admin: boolean;
  emailVerified: boolean;
  providers: string[];
}>;
export interface SyncReport {
  members: number;
  guests: number;
  guestsActive7d: number;
  guestsNew24h: number;
  guestsPeakHour: number;
  written: number;
  removed: number;
}
export function syncAccounts(options: { auth: Auth; db: Firestore; now?: number }): Promise<SyncReport>;
export function processAdminTasks(options: { auth: Auth; db: Firestore; now?: number }): Promise<{
  processed: number;
  results: { syncAccounts?: SyncReport };
}>;

export const GUEST_BURST_PER_HOUR: number;
export function kstDay(ms: number): { start: number; key: string };
export interface DayGame {
  uid: string;
  mode: string;
  runs: number;
  createdAt: number;
  atBats: { questionId: string; correct: boolean; result: string }[];
}
export interface DaySummary {
  games: number;
  levelTests: number;
  practice: number;
  memberGames: number;
  guestGames: number;
  players: number;
  averageRuns: number;
  atBats: number;
  correctRate: number;
  homeRunRate: number;
  hourly: number[];
  questions: Record<string, [number, number]>;
}
export function summarizeDay(games: readonly DayGame[], memberUids: Set<string>): DaySummary;
export function buildDailyStats(options: { db: Firestore; now?: number; day?: string }): Promise<{ day: string; games: number; players: number; signups: number }>;
export function guestBurst(creationTimes: readonly number[], now?: number): { guestsNew24h: number; guestsPeakHour: number };
