import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';

/** cleanup.mjs의 형(테스트가 TypeScript에서 불러온다) */
export const ROOM_RETENTION_HOURS: number;
export const GUEST_RETENTION_DAYS: number;
export const DEFAULT_MAX_DELETES: number;

export interface UserLike {
  email?: string | null;
  providerData?: readonly unknown[];
  metadata?: { creationTime?: string | null; lastSignInTime?: string | null; lastRefreshTime?: string | null };
}

export function isAnonymous(user: UserLike): boolean;
export function lastActiveMs(user: UserLike): number;

export interface CleanupReport {
  dryRun: boolean;
  rooms: number;
  orphanSeats: number;
  guests: number;
  deletedDocs: number;
  stoppedAtLimit: boolean;
}

export function cleanup(options: {
  db: Firestore;
  auth: Auth;
  now?: number;
  dryRun?: boolean;
  maxDeletes?: number;
  log?: (line: string) => void;
}): Promise<CleanupReport>;
