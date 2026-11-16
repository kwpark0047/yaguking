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
  retention: ReturnRates;
  funnel: WeeklyFunnel;
}
/** 주간 퍼널 한 묶음 — 처음 온 계정 수와 단계마다 간 수 */
export interface FunnelCohort {
  accounts: number;
  played: number;
  returned: number;
  signedUp: number;
  ageConfirmed: number;
}
export interface WeeklyFunnel {
  day: string;
  from: string;
  to: string;
  cohort: FunnelCohort;
  players: { members: number; guests: number };
  /** 출처 → 묶음('none' = 기록 없음). 유입 출처 기록 시행 전에는 없다 */
  bySource?: Record<string, FunnelCohort>;
}
export const ACQUISITION_START: string;
export const ACQUISITION_SOURCES: readonly string[];
export function weeklyFunnel(options: {
  accounts: readonly { uid: string; createdAt: number; lastActiveAt: number; member: boolean }[];
  players: ReadonlySet<string>;
  ageConfirmed: ReadonlySet<string>;
  sources?: ReadonlyMap<string, string> | null;
  now?: number;
}): WeeklyFunnel;
/** [처음 온 수, 다시 연 수] — 회원·비회원 따로 */
export interface ReturnCohort {
  members: [number, number];
  guests: [number, number];
}
export interface ReturnRates {
  day: string;
  d1: ReturnCohort;
  d7: ReturnCohort;
}
export function returnRates(accounts: readonly { createdAt: number; lastActiveAt: number; member: boolean }[], now?: number): ReturnRates;
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
