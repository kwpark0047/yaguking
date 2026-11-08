import type { OptionLabel } from '@/content/questions';
import type { Difficulty } from '@/lib/engine';
import { TEAMS } from '@/content/teams';
import { kboQuestionProblem, type KboKey, type KboQuestion } from '@/lib/kbo/set';

/**
 * 소식 → 문제 초안(저장소 맨 위 docs/daily-kbo-quiz/05-news-feed.md). AI 없이 틀로 만든다.
 * 관리자가 기사에서 **정답이 될 사실**을 고르면 오답 보기와 문항 모양을 채운다. 정답은 사람이 정한 그대로다.
 *
 * - 팀: 정답 팀 + 다른 구단 3개(실제 구단 이름)
 * - 숫자: 정답 숫자 + 가까운 숫자 3개(같은 단위)
 * - 직접: 정답 + 관리자가 적은 오답 3개(선수 이름 등 — 선수 명단 DB가 없어 사람이 적는다)
 */
export type DraftKind = 'team' | 'number' | 'text';

export interface NewsSource {
  title: string;
  link: string;
  feedName: string;
  publishedAt: number;
}

export interface DraftInput {
  kind: DraftKind;
  stem: string;
  /** 팀이면 구단 이름, 숫자면 숫자, 직접이면 정답 글 */
  correct: string;
  unit?: string;
  wrong?: string[];
  difficulty: Difficulty;
  explanation: string;
  seed: string;
}

const LABELS: OptionLabel[] = ['A', 'B', 'C', 'D'];
const kstDate = (ms: number) => new Date(ms + 9 * 3_600_000).toISOString().slice(0, 10);

/** 같은 씨앗이면 같은 순서 — 초안을 다시 만들어도 보기가 바뀌지 않는다 */
function seeded(seed: string) {
  let state = 2166136261;
  for (const char of seed) state = Math.imul(state ^ char.charCodeAt(0), 16777619) >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let index = out.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [out[index], out[other]] = [out[other]!, out[index]!];
  }
  return out;
}

/** 숫자 오답 — 정답 가까이, 0 아래로 가지 않게, 겹치지 않게 */
export function nearbyNumbers(value: number, random: () => number): number[] {
  const step = Math.max(1, Math.round(Math.abs(value) * 0.1));
  const pool = [-3, -2, -1, 1, 2, 3].map((offset) => value + offset * step).filter((candidate) => candidate >= 0 && candidate !== value);
  return shuffle([...new Set(pool)], random).slice(0, 3);
}

export function draftFromNews(source: NewsSource, input: DraftInput): { draft: { question: KboQuestion; key: KboKey } | null; problem: string | null } {
  const random = seeded(input.seed);
  const correct = input.correct.trim();
  let wrong: string[];
  let correctText = correct;
  if (input.kind === 'team') {
    const team = TEAMS.find((item) => item.name === correct || item.shortName === correct);
    if (!team) return { draft: null, problem: '정답 구단을 골라 주세요.' };
    correctText = team.name;
    wrong = shuffle(TEAMS.filter((item) => item.slug !== team.slug).map((item) => item.name), random).slice(0, 3);
  } else if (input.kind === 'number') {
    const value = Number(correct);
    if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) return { draft: null, problem: '정답은 0 이상의 정수로 적어 주세요.' };
    const unit = (input.unit ?? '').trim();
    correctText = `${value}${unit}`;
    wrong = nearbyNumbers(value, random).map((number) => `${number}${unit}`);
  } else {
    wrong = (input.wrong ?? []).map((text) => text.trim()).filter(Boolean);
    if (wrong.length !== 3) return { draft: null, problem: '오답 보기 3개를 적어 주세요.' };
  }
  const texts = shuffle([correctText, ...wrong], random);
  const recordAsOf = kstDate(source.publishedAt);
  const question: KboQuestion = {
    stem: input.stem.trim(),
    options: texts.map((text, index) => ({ label: LABELS[index]!, text })),
    difficulty: input.difficulty,
    category: 'team-history',
    recordAsOf,
    seasonScope: `${recordAsOf.slice(0, 4)} 시즌`,
  };
  const key: KboKey = {
    correct: LABELS[texts.indexOf(correctText)]!,
    explanation: input.explanation.trim(),
    sourceName: source.feedName.trim(),
    sourceUrl: source.link,
    recordAsOf,
  };
  const problem = kboQuestionProblem(question, key);
  return problem ? { draft: null, problem } : { draft: { question, key }, problem: null };
}
