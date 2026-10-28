import type { Firestore } from 'firebase-admin/firestore';

/** monthly.mjs의 형(테스트가 TypeScript에서 불러온다) */
export const ENGAGEMENT_START: string;
export const POINTS: { day: number; week: number; perfect: number };
export const STREAK_WEEK: number;
export const DOUBLE_FACTOR: number;
export const TEAM_MIN_FANS: number;
export const RANKING_TOP: number;
export const HIDDEN_NAME: string;
export const REMOVED_NAME: string;
export const LEADERBOARD_MONTHS_KEPT: number;
export function kstMonthKey(ms: number): string;
export function daysInMonth(month: string): number;
export function previousMonth(month: string): string;
export function firstCountedDay(month: string, start?: string): number;
export function attendancePoints(
  days: readonly number[],
  month: string,
  through?: number,
  start?: string,
  doubleDays?: readonly number[],
): { points: number; days: number; weeks: number; perfect: boolean };
export function teamsOf(rows: readonly { team: string | null; days: number; points: number }[]): { team: string; fans: number; days: number; points: number }[];
export function doubleDaysOf(list: unknown, month: string): number[];
export function titlesFor(rank: number, perfect: boolean): string[];
export function rankRows<T extends { points: number; days: number; nickname: string }>(rows: T[]): (T & { rank: number })[];
export function officialSum(days: Record<string, number>, month: string, through?: number): { points: number; rounds: number };
export function histogramOf(ranked: readonly { points: number }[]): Record<string, number>;
export function runMonthly(options: { db: Firestore; now?: number; start?: string }): Promise<{
  month: string;
  finalized: string | null;
  participants: number;
  awards: number;
  scrubbed: number;
  removed: number;
}>;
