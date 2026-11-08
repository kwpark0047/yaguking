import type { Firestore } from 'firebase-admin/firestore';

/** newsFeed.mjs의 형(테스트가 TypeScript에서 불러온다) */
export const FEED_USER_AGENT: string;
export const FEED_LIMITS: { feeds: number; itemsPerFeed: number; summary: number; keepDays: number; title: number };
export const BLOCKED_HOSTS: string[];
export function decodeEntities(text: string): string;
export function plainText(raw: unknown): string;
export function parseFeed(xml: string): { title: string; link: string; published: string; summary: string }[];
export function feedUrlProblem(url: string): string | null;
export function robotsAllows(robotsText: string, path: string, agent?: string): boolean;
export function itemId(link: string): string;

export interface FeedItem {
  id: string;
  title: string;
  link: string;
  publishedAt: number;
  summary: string;
  feedId: string;
  feedName: string;
}
export function cleanItems(items: { title: string; link: string; published: string; summary: string }[], options: { now: number; feed: { id: string; name: string } }): FeedItem[];

export interface FeedRunReport {
  at: number;
  added: number;
  removed: number;
  feeds: { id: string; name: string; status: string; items: number; added: number; reason?: string }[];
}
export function runNewsFeed(options: { db: Firestore; fetchImpl?: typeof fetch; now?: number }): Promise<FeedRunReport>;
