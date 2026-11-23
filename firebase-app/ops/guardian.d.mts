import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';

/** guardian.mjs의 형(테스트가 TypeScript에서 불러온다) */
export const GUARDIAN_WAIT_DAYS: number;
export const GUARDIAN_VERSION: string;
export function listGuardians(options: { db: Firestore }): Promise<{ uid: string; code: string | null; email: string | null; requestedAt: number }[]>;
export function approveGuardian(options: { db: Firestore; code: string; email: string; now?: number; by?: string }): Promise<{ approved: boolean; uid?: string; reason?: string }>;
export function expireGuardians(options: { db: Firestore; auth: Auth; now?: number; dryRun?: boolean }): Promise<{ pending: number; expired: number; deleted: number }>;
