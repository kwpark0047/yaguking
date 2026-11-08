import type { CategorySlug, OptionLabel } from '@/content/questions';
import type { Difficulty } from '@/lib/engine';

/**
 * 어제의 KBO 퀴즈 공통 계산(저장소 맨 위 docs/daily-kbo-quiz/03-design.md). 화면·관리자가 함께 쓴다.
 *
 * 시작일은 처리방침 개정(7일 전 공지) 뒤다. **아직 배포 전이라 임시 날짜다.** 배포일 + 7일 이후로 맞춘다.
 * 처리방침 판 시행일이 이 값을 따른다.
 */
export const KBO_QUIZ_START = '2026-11-20';
export const KBO_ATTEMPT_RETENTION_DAYS = 30;
export const KBO_MAX_QUESTIONS = 10;
export const KBO_MIN_QUESTIONS = 1;
export const KBO_QUESTION_MS = 20_000;
/** 오늘 묶음이 없거나 안내뿐이면 며칠 전까지 풀 수 있는 묶음을 찾나(비시즌에도 마지막 퀴즈가 보이게) */
export const KBO_LOOKBACK_DAYS = 7;

const KST = 9 * 3_600_000;
const DAY = 86_400_000;
const PUBLISH_HOUR = 6;

export type KboSetKind = 'quiz' | 'review' | 'news' | 'no-game' | 'rainout' | 'season-end';
export type KboSetState = 'draft' | 'approved' | 'held';

export interface KboQuestion {
  stem: string;
  options: { label: OptionLabel; text: string }[];
  difficulty: Difficulty;
  category: CategorySlug;
  recordAsOf: string;
  seasonScope: string;
}

export interface KboKey {
  correct: OptionLabel;
  explanation: string;
  sourceName: string;
  sourceUrl: string;
  recordAsOf: string;
}

export interface KboSet {
  id: string;
  kind: KboSetKind;
  gamesDate: string;
  publishAt: number;
  questions: KboQuestion[];
  state: KboSetState;
  withdrawn: number[];
  isTest: boolean;
}

export const kboQuizOpen = (today: string) => today >= KBO_QUIZ_START;
export const isPlayable = (kind: KboSetKind) => kind === 'quiz' || kind === 'review' || kind === 'news';

/** 지금 열려 있어야 할 묶음의 ID — 묶음은 그날 06:00에 열리고 다음 날 06:00까지 간다 */
export function currentSetId(now: number = Date.now()): string {
  return new Date(now + KST - PUBLISH_HOUR * 3_600_000).toISOString().slice(0, 10);
}

/** n일 전 묶음 ID */
export const setIdDaysBefore = (setId: string, days: number) => new Date(Date.parse(`${setId}T00:00:00Z`) - days * DAY).toISOString().slice(0, 10);

/**
 * 보여 줄 묶음 고르기 — 오늘부터 거꾸로(sets[0] = 오늘). 풀 수 있는 묶음이 있으면 가장 최근 것,
 * 없으면 가장 최근 안내(경기 없음·우천 취소·시즌 끝). 둘 다 없으면 null.
 */
export function pickLatest<T extends { kind: KboSetKind }>(sets: readonly (T | null)[]): T | null {
  return sets.find((set): set is T => !!set && isPlayable(set.kind)) ?? sets.find((set): set is T => !!set) ?? null;
}

/** 하루 전 묶음 ID — 오늘 것이 아직 준비되지 않았을 때 보여 준다 */
export const previousSetId = (setId: string) => new Date(Date.parse(`${setId}T00:00:00Z`) - DAY).toISOString().slice(0, 10);

export const publishAtOf = (setId: string) => Date.parse(`${setId}T06:00:00+09:00`);

/** 관리자가 새로 만들 때 기본 날짜 — 다음에 올 06:00, 시작일보다 앞서지 않는다 */
export function nextSetId(now: number = Date.now()): string {
  const next = new Date(Date.parse(`${currentSetId(now)}T00:00:00Z`) + DAY).toISOString().slice(0, 10);
  return next < KBO_QUIZ_START ? KBO_QUIZ_START : next;
}

/** "2026-11-05" → "11월 5일" */
export const dateLabel = (date: string) => `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일`;

/** 화면 제목. "어제"는 경기일이 실제로 어제일 때만 쓴다 */
export function headlineOf(set: Pick<KboSet, 'kind' | 'gamesDate'>, now: number = Date.now()): string {
  const today = new Date(now + KST).toISOString().slice(0, 10);
  const isYesterday = previousSetId(today) === set.gamesDate;
  const day = isYesterday ? '어제' : dateLabel(set.gamesDate);
  switch (set.kind) {
    case 'quiz':
      return `${dateLabel(set.gamesDate)} 경기 퀴즈`;
    case 'review':
      return '2026 시즌 돌아보기';
    case 'news':
      return '야구 소식 퀴즈';
    case 'no-game':
      return `${day}${isYesterday ? '는' : '은'} 경기가 없었어요`;
    case 'rainout':
      return `${day} 경기는 취소됐어요`;
    case 'season-end':
      return '이번 시즌이 끝났어요';
  }
}

/** 관리자 입력 확인 — 문제가 없으면 null */
export function kboQuestionProblem(question: KboQuestion, key: KboKey): string | null {
  if (question.stem.trim().length < 5) return '문제를 적어 주세요.';
  const texts = question.options.map((option) => option.text.trim());
  if (texts.length !== 4 || texts.some((text) => !text)) return '보기 4개를 모두 적어 주세요.';
  if (new Set(texts).size !== 4) return '보기가 서로 달라야 해요.';
  if (!question.options.some((option) => option.label === key.correct)) return '정답을 골라 주세요.';
  if (!key.explanation.trim()) return '해설을 적어 주세요.';
  if (!key.sourceName.trim()) return '출처 이름을 적어 주세요.';
  if (!/^https:\/\/\S+$/.test(key.sourceUrl.trim())) return '출처 주소는 https로 시작해야 해요.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key.recordAsOf)) return '기준일을 적어 주세요.';
  return null;
}
