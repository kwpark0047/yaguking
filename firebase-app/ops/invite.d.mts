import type { Firestore } from 'firebase-admin/firestore';

/** invite.mjs의 형(테스트가 TypeScript에서 불러온다) */
export const INVITE_START: string;
export const INVITE_POINTS: { inviter: number; invitee: number };
export const INVITE_MONTHLY_CAP: number;
export const INVITE_ACTIVE_WINDOW_DAYS: number;
export const INVITE_ACTIVE_DAYS: number;
export const INVITE_MILESTONES: readonly { count: number; title: string; points: number }[];
export const INVITE_EVENTS: readonly { id: string; start: string; end: string; multiplier: number }[];
export function eventFor(day: string): { id: string; start: string; end: string; multiplier: number } | null;
export function activeDayOf(linkedSerial: number, playedSerials: readonly number[]): number | null;
export function summarize(
  entries: readonly { status: string; inviter: string; invitee: string; inviterPoints?: number; inviteePoints?: number }[],
): Map<string, { bonus: number; rewarded: number; titles: string[] }>;
export function runInvites(options: { db: Firestore; now?: number; start?: string }): Promise<{
  started: boolean;
  linked: number;
  created: number;
  rewarded: number;
  expired: number;
  capped: number;
  removed: number;
  summaries: number;
}>;
export function revokeInvite(options: { db: Firestore; inviteeUid: string; by?: string }): Promise<{ revoked: boolean; reason?: string }>;
