import { doc, getDoc, serverTimestamp, setDoc, Timestamp, updateDoc } from 'firebase/firestore';
import { firestore } from '@/lib/firebase/db';
import { countReads, countWrites } from '@/lib/firebase/meter';
import type { CategorySlug, OptionLabel } from '@/content/questions';
import type { Difficulty } from '@/lib/engine';
import type { AttemptAnswer } from './official';

/**
 * 오늘의 공식전 읽고 쓰기(docs/engagement-plan.md §5). 계산은 official.ts, 판정은 운영자 PC(ops/official.mjs).
 *
 * 문제는 하나씩만 읽힌다 — 보안 규칙이 "앞 문제에 답했을 때만" 다음 문제를 연다. 답마다 서버 시각이 찍히고,
 * 기기가 보낸 시간은 쓰지 않는다. 읽기: 공식전 1 + 내 시도 1 + 문제 5, 쓰기: 시작 1 + 답 5.
 */
export interface OfficialRound {
  id: string;
  opensAt: number;
  closesAt: number;
  total: number;
  /** 판정 뒤 공개 — 정답·해설·출처 */
  revealed: { answers: string[]; explanations: string[]; sources: string[] } | null;
  participants: number | null;
}

export interface OfficialQuestion {
  stem: string;
  options: { label: OptionLabel; text: string }[];
  category: CategorySlug;
  difficulty: Difficulty;
  recordAsOf: string;
  seasonScope: string;
}

export interface OfficialAttempt {
  startedAt: number;
  total: number;
  answers: Record<string, AttemptAnswer>;
}

const millis = (value: unknown) => (value instanceof Timestamp ? value.toMillis() : 0);
const strings = (value: unknown) => (Array.isArray(value) ? value.map((item) => String(item ?? '')) : []);

/** 공식전 문서 — 없으면 null(그날 문항이 준비되지 않음). 읽기 1번 */
export async function loadRound(roundId: string): Promise<OfficialRound | null> {
  const snapshot = await getDoc(doc(firestore(), 'officialRounds', roundId));
  countReads('loadOfficialRound', 1);
  if (!snapshot.exists()) return null;
  const revealed = snapshot.get('revealed') as Record<string, unknown> | undefined;
  return {
    id: roundId,
    opensAt: millis(snapshot.get('opensAt')),
    closesAt: millis(snapshot.get('closesAt')),
    total: Number(snapshot.get('total') ?? 0),
    revealed: revealed
      ? { answers: strings(revealed.answers), explanations: strings(revealed.explanations), sources: strings(revealed.sources) }
      : null,
    participants: snapshot.get('participants') == null ? null : Number(snapshot.get('participants')),
  };
}

/** 내 시도 — 없으면 null. 읽기 1번 */
export async function loadAttempt(uid: string, roundId: string): Promise<OfficialAttempt | null> {
  const snapshot = await getDoc(doc(firestore(), 'officialRounds', roundId, 'attempts', uid));
  countReads('loadOfficialAttempt', 1);
  if (!snapshot.exists()) return null;
  const answers: Record<string, AttemptAnswer> = {};
  for (const [index, value] of Object.entries((snapshot.get('answers') ?? {}) as Record<string, { choice?: unknown; at?: unknown }>)) {
    answers[index] = { choice: typeof value.choice === 'string' ? value.choice : null, at: millis(value.at) };
  }
  return { startedAt: millis(snapshot.get('startedAt')), total: Number(snapshot.get('total') ?? 0), answers };
}

/** 시작 — 시각은 서버 시각. 하루 한 번(이미 있으면 규칙이 거절). 쓰기 1번 */
export async function startAttempt(uid: string, roundId: string, total: number): Promise<void> {
  await setDoc(doc(firestore(), 'officialRounds', roundId, 'attempts', uid), { startedAt: serverTimestamp(), total, answers: {} });
  countWrites('startOfficial', 1);
}

/** index번 문제 — 앞 문제에 답한 뒤에만 읽힌다. 읽기 1번 */
export async function loadQuestion(roundId: string, index: number): Promise<OfficialQuestion> {
  const snapshot = await getDoc(doc(firestore(), 'officialRounds', roundId, 'questions', String(index)));
  countReads('loadOfficialQuestion', 1);
  const options = Array.isArray(snapshot.get('options')) ? (snapshot.get('options') as { label: string; text: string }[]) : [];
  return {
    stem: String(snapshot.get('stem') ?? ''),
    options: options.map((option) => ({ label: String(option.label) as OptionLabel, text: String(option.text) })),
    category: String(snapshot.get('category') ?? 'rules') as CategorySlug,
    difficulty: String(snapshot.get('difficulty') ?? 'normal') as Difficulty,
    recordAsOf: String(snapshot.get('recordAsOf') ?? ''),
    seasonScope: String(snapshot.get('seasonScope') ?? ''),
  };
}

/** 답 하나 — 시간 초과면 choice null. 쓰기 1번 */
export async function submitAnswer(uid: string, roundId: string, index: number, choice: string | null): Promise<void> {
  await updateDoc(doc(firestore(), 'officialRounds', roundId, 'attempts', uid), {
    [`answers.${index}`]: { choice, at: serverTimestamp() },
  });
  countWrites('answerOfficial', 1);
}
