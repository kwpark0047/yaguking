import type { Question } from '@/content/questions';
import type { AtBatResult } from '@/lib/engine';

/**
 * 오늘의 1이닝(docs/retention-plan.md A) — 날마다 모두에게 같은 3문제(한국 날짜로 공개 문제은행에서 고른다).
 * 하루 한 번, 기기에서만 채점·저장(Firestore 읽기·쓰기 0, 비회원 하루 3판에 세지 않음). 점수는 비공식이다.
 * 결과는 이모지 3색 한 줄로 공유한다.
 */
export const DAILY_TOTAL = 3;
export const DAILY_STORAGE_KEY = 'yk_daily';

/** 문자열 → 32비트 씨앗(같은 날짜면 어느 기기에서나 같은 값) */
function seedOf(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** 씨앗으로 정해지는 난수(mulberry32) */
function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 그날의 3문제: 쉬움·보통·어려움 하나씩, 규칙 문항은 많아야 하나(한 경기 규칙 절반 이하와 같은 뜻) */
export function pickDaily(bank: readonly Question[], date: string): Question[] {
  const next = random(seedOf(`yaguking-daily-${date}`));
  const sorted = [...bank].sort((a, b) => a.id.localeCompare(b.id)); // 문제은행 순서가 바뀌어도 같은 날은 같은 문제
  const picked: Question[] = [];
  for (const difficulty of ['easy', 'normal', 'hard'] as const) {
    const rulesTaken = picked.some((question) => question.category === 'rules');
    const pool = sorted.filter((question) => question.difficulty === difficulty && !(rulesTaken && question.category === 'rules'));
    if (pool.length > 0) picked.push(pool[Math.floor(next() * pool.length)]!);
  }
  return picked;
}

/** 공유 줄의 색: 안타 이상 🟩, 볼넷 🟨, 아웃 🟥 */
export function resultEmoji(result: AtBatResult): string {
  return result === 'K' ? '🟥' : result === 'BB' ? '🟨' : '🟩';
}

export function dailySummary(results: readonly AtBatResult[]): string {
  const hits = results.filter((result) => result !== 'K' && result !== 'BB').length;
  const walks = results.filter((result) => result === 'BB').length;
  const outs = results.filter((result) => result === 'K').length;
  return [hits && `${hits}안타`, walks && `${walks}볼넷`, outs && `${outs}아웃`].filter(Boolean).join(' ');
}

export function shareText(date: string, results: readonly AtBatResult[], streak: number, url: string, hints = 0): string {
  return [
    `⚾ 야구왕 오늘의 1이닝 ${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`,
    `${results.map(resultEmoji).join('')} ${dailySummary(results)}${hints > 0 ? ` · 힌트 ${hints}` : ''}`,
    ...(streak > 1 ? [`연속 ${streak}일`] : []),
    url,
  ].join('\n');
}

/** 기기 저장: 오늘 진행(중간에 닫아도 이어서 — 같은 문제를 다시 풀 수 없다)과 연속 기록 */
export interface DailyRecord {
  date: string;
  results: AtBatResult[];
  /** 오늘 쓴 힌트 수(공유 줄에 숨기지 않고 적는다) */
  hints: number;
  /** 마지막으로 3문제를 끝낸 날과 그때까지 연속 일수 */
  lastDone: string | null;
  streak: number;
  best: number;
}

const EMPTY: DailyRecord = { date: '', results: [], hints: 0, lastDone: null, streak: 0, best: 0 };

export function loadDaily(): DailyRecord {
  try {
    const raw = localStorage.getItem(DAILY_STORAGE_KEY);
    if (!raw) return EMPTY;
    const value = JSON.parse(raw) as Partial<DailyRecord>;
    return {
      date: typeof value.date === 'string' ? value.date : '',
      results: Array.isArray(value.results) ? (value.results as AtBatResult[]).slice(0, DAILY_TOTAL) : [],
      hints: Number(value.hints) || 0,
      lastDone: typeof value.lastDone === 'string' ? value.lastDone : null,
      streak: Number(value.streak) || 0,
      best: Number(value.best) || 0,
    };
  } catch {
    return EMPTY;
  }
}

function save(record: DailyRecord): void {
  try {
    localStorage.setItem(DAILY_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // 저장소를 못 쓰는 브라우저(사생활 보호 창 등) — 이번 화면에서만 진행된다
  }
}

/** 오늘 기록(다른 날 진행은 버리고 연속만 남긴다) */
export function todayRecord(record: DailyRecord, today: string): DailyRecord {
  return record.date === today ? record : { ...record, date: today, results: [], hints: 0 };
}

/** 그날 연속이 이어졌나 — 어제 끝냈거나 오늘 이미 끝냈으면 이어짐 */
export function streakAlive(record: DailyRecord, today: string): boolean {
  return record.lastDone === today || record.lastDone === previousDate(today);
}

export function previousDate(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
}

/** 타석 하나를 기록. 3번째면 연속을 올린다 */
export function recordAtBat(record: DailyRecord, today: string, result: AtBatResult, hinted = false): DailyRecord {
  const current = todayRecord(record, today);
  if (current.results.length >= DAILY_TOTAL) return current;
  const results = [...current.results, result];
  let next: DailyRecord = { ...current, results, hints: current.hints + (hinted ? 1 : 0) };
  if (results.length === DAILY_TOTAL) {
    const streak = current.lastDone === previousDate(today) ? current.streak + 1 : 1;
    next = { ...next, lastDone: today, streak, best: Math.max(current.best, streak) };
  }
  save(next);
  return next;
}
