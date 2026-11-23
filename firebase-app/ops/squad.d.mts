import type { Firestore } from 'firebase-admin/firestore';

/** squad.mjs의 형(테스트가 TypeScript에서 불러온다) */
export const SQUAD_START: string;
export const SQUAD_MAX: number;
export const LEAGUE_TOP: number;
export const LEAGUE_REWARDS: readonly number[];
export const LEAGUE_TABLE_MAX: number;
export function weekStartOf(day: string): string;
export function weekDays(weekStart: string): string[];
export function squadScore(points: readonly number[]): number;
export function rankSquads<T extends { code: string; score: number; players: number }>(rows: readonly T[]): (T & { rank: number })[];
export function bonusOf(weeks: Record<string, number> | undefined): number;
export function weekPoints(monthDocs: readonly Record<string, number>[], days: readonly string[]): { points: number; days: number };
export function runSquads(options: { db: Firestore; now?: number; start?: string }): Promise<{
  started: boolean;
  squads: number;
  removedMembers: number;
  removedRequests: number;
  removedSquads: number;
  fixedSquads: number;
  ranked: number;
  finalized: string | null;
  rewarded: number;
}>;
export function hideSquad(options: { db: Firestore; code: string; hidden?: boolean; by?: string }): Promise<{ changed: boolean; reason?: string; code?: string; hidden?: boolean }>;
export function listSquads(options: { db: Firestore }): Promise<{ code: string; name: string; kind: string; size: number; hidden: boolean }[]>;
