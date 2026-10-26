import { usingEmulators } from '@/lib/env';

/**
 * 무료 한도 계량기 — 이 기기가 일으킨 Firestore 읽기·쓰기를 센다(과금 규칙대로 추정).
 *
 * - 문서 읽기 1번 = 1, 쿼리는 결과 문서 수(0개여도 1), 실시간 구독은 서버에서 온
 *   변경 문서 수(기기 캐시에서 온 첫 화면은 0)
 * - 쓰기는 문서 하나 = 1(묶음 안의 문서마다). 서버 시각·증가 연산은 따로 세지 않는다
 * - **보안 규칙 안의 get()은 기기가 볼 수 없어 여기에 없다** — docs/usage-report.md에 따로 적는다
 *
 * 에뮬레이터 모드에서만 window.__ykUsage로 내보내 사용량 측정 E2E(tests/e2e/usage.spec.ts)가 읽는다.
 */
export interface UsageCounter {
  reads: number;
  writes: number;
  byLabel: Record<string, { reads: number; writes: number }>;
}

const usage: UsageCounter = { reads: 0, writes: 0, byLabel: {} };

function bucket(label: string) {
  return (usage.byLabel[label] ??= { reads: 0, writes: 0 });
}

export function countReads(label: string, count: number): void {
  usage.reads += count;
  bucket(label).reads += count;
}

export function countWrites(label: string, count: number): void {
  usage.writes += count;
  bucket(label).writes += count;
}

/** 지금까지 센 값(복사본) */
export function usageSnapshot(): UsageCounter {
  return structuredClone(usage);
}

/** 쿼리 한 번의 과금 읽기: 결과 문서 수, 없으면 1 */
export const queryReads = (size: number) => Math.max(1, size);

declare global {
  interface Window {
    __ykUsage?: UsageCounter;
  }
}

if (usingEmulators && typeof window !== 'undefined') window.__ykUsage = usage;
