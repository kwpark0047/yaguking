import type { Firestore } from 'firebase-admin/firestore';

/** news.mjs의 형(테스트가 TypeScript에서 불러온다) */
export const NEWS_CATEGORIES: string[];
export const NEWS_LIMITS: { title: number; summary: number; body: number; sourceName: number; posts: number };
export const NEWS_PUBLIC_MAX: number;
export const NEWS_ARCHIVE_DAYS: number;
export function kstToday(ms: number): string;
export function isCalendarDate(value: unknown): boolean;
export function newsProblem(post: Record<string, unknown>): string | null;
export function dateStatus(date: string, today: string): 'ok' | 'scheduled' | 'archived';
export function sourceReachable(url: string, fetchImpl?: typeof fetch): Promise<{ ok: boolean; status: number; error?: string }>;
export function runNews(options: { db: Firestore; now?: number; fetchImpl?: typeof fetch }): Promise<{ posts: number; shown: number; failed: number }>;
export function seedNews(options: { db: Firestore; posts: unknown[] }): Promise<{ seeded: number; skipped?: number; reason?: string }>;
