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

export const MEMBER_DATA_FROM: string;
export function memberDataOpenFor(projectId: string, now?: number): boolean;
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
  written: number;
  removed: number;
}
export function syncAccounts(options: { auth: Auth; db: Firestore; now?: number }): Promise<SyncReport>;
export function processAdminTasks(options: { auth: Auth; db: Firestore; now?: number }): Promise<{
  processed: number;
  results: { syncAccounts?: SyncReport };
}>;
