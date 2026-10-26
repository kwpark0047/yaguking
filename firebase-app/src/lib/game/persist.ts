import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  writeBatch,
  type DocumentData,
} from 'firebase/firestore';
import type { Question } from '@/content/questions';
import { kstDayKey } from '@/lib/data/keys';
import type { AtBatRecord } from '@/lib/data/types';
import { buildBoxScore } from '@/lib/engine';
import { firestore } from '@/lib/firebase/db';
import type { PlayedAtBat } from './match';
import { noteAfterReviewCorrect, noteAfterWrong, type NoteState } from './review';

/**
 * 경기·레벨 테스트·오답노트 저장 (docs/data-model.md §2).
 *
 * **경기는 끝날 때 한 번(한 묶음)만 쓴다** — 무료 쓰기 한도(하루 2만). 타석마다 쓰지 않는다.
 * 규칙이 요구하는 묶음: 비회원 경기 = 경기 + 오늘 카운터 +1, 닉네임 = 프로필 + 예약.
 *
 * 시각은 서버 시각을 쓴다. 기기 시계가 빠르면 "미래 시각으로 틀렸다"가 되어 규칙이
 * 거절한다(오답노트의 lastWrongAt ≤ request.time).
 */

export const GUEST_DAILY_GAMES = 2;

/** 비회원이 오늘(KST) 남은 경기 수. 읽기 1번. */
export async function guestGamesLeft(uid: string): Promise<number> {
  const snapshot = await getDoc(doc(firestore(), 'users', uid, 'daily', kstDayKey()));
  const used = snapshot.exists() ? Number(snapshot.get('count') ?? 0) : 0;
  return Math.max(0, GUEST_DAILY_GAMES - used);
}

function toRecord(atBat: PlayedAtBat): AtBatRecord {
  return {
    questionId: atBat.questionId,
    choice: atBat.choice,
    correct: atBat.correct,
    elapsedMs: atBat.elapsedMs,
    result: atBat.result,
    rbi: atBat.rbi,
  };
}

function noteFromDoc(data: DocumentData): NoteState {
  const ms = (value: unknown) => (value instanceof Timestamp ? value.toMillis() : 0);
  return {
    wrongCount: Number(data.wrongCount ?? 0),
    firstWrongAt: ms(data.firstWrongAt),
    lastWrongAt: ms(data.lastWrongAt),
    stage: Number(data.stage ?? 0),
    nextReviewAt: ms(data.nextReviewAt),
    mastered: Boolean(data.mastered),
  };
}

export interface SaveMatchInput {
  uid: string;
  isGuest: boolean;
  mode: 'practice' | 'levelTest';
  atBats: PlayedAtBat[];
  runs: number;
  xp: number;
  /** 레벨 테스트면 결과를 프로필에 한 번만 남긴다 */
  levelTest?: { correct: number; total: number; tier: number; byCategory: Record<string, number> };
}

export interface SaveMatchResult {
  wrongSaved: number;
}

export async function saveMatch(input: SaveMatchInput): Promise<SaveMatchResult> {
  const db = firestore();
  const batch = writeBatch(db);
  const userRef = doc(db, 'users', input.uid);

  batch.set(doc(collection(userRef, 'games')), {
    mode: input.mode,
    createdAt: serverTimestamp(),
    innings: 1,
    runs: input.runs,
    pa: input.atBats.length,
    atBats: input.atBats.map(toRecord),
  });

  if (input.mode === 'practice') {
    // 누적(비공식) — 경기마다 하나씩
    const summaryRef = doc(userRef, 'summary', 'main');
    const current = await getDoc(summaryRef);
    const box = buildBoxScore(input.atBats.map((atBat) => ({ result: atBat.result, rbi: atBat.rbi })));
    const before = current.exists() ? current.data() : {};
    const add = (key: string, value: number) => Number(before[key] ?? 0) + value;
    batch.set(summaryRef, {
      games: add('games', 1),
      pa: add('pa', box.pa),
      ab: add('ab', box.ab),
      h: add('h', box.h),
      hr: add('hr', box.hr),
      bb: add('bb', box.bb),
      so: add('so', box.so),
      runs: add('runs', input.runs),
      xp: add('xp', input.xp),
      updatedAt: serverTimestamp(),
    });

    if (input.isGuest) {
      const dayRef = doc(userRef, 'daily', kstDayKey());
      const day = await getDoc(dayRef);
      batch.set(dayRef, { count: (day.exists() ? Number(day.get('count') ?? 0) : 0) + 1 });
    }
  }

  if (input.levelTest) {
    batch.update(userRef, {
      levelTest: { ...input.levelTest, completedAt: serverTimestamp() },
      updatedAt: serverTimestamp(),
    });
  }

  // 틀린 문항 → 오답노트(같은 문항은 한 번)
  const wrongIds = [...new Set(input.atBats.filter((atBat) => !atBat.correct).map((atBat) => atBat.questionId))];
  const now = Date.now();
  for (const questionId of wrongIds) {
    const ref = doc(userRef, 'wrongNotes', questionId);
    const existing = await getDoc(ref);
    const previous = existing.exists() ? noteFromDoc(existing.data()) : null;
    const next = noteAfterWrong(previous, now);
    batch.set(ref, {
      questionId,
      wrongCount: next.wrongCount,
      firstWrongAt: existing.exists() ? existing.get('firstWrongAt') : serverTimestamp(),
      lastWrongAt: serverTimestamp(),
      stage: next.stage,
      nextReviewAt: Timestamp.fromMillis(next.nextReviewAt),
      mastered: false,
    });
  }

  await batch.commit();
  return { wrongSaved: wrongIds.length };
}

export interface WrongNote extends NoteState {
  questionId: string;
}

/** 오답노트 — 복습 시각 순으로 최대 100개(읽기 = 문서 수) */
export async function loadWrongNotes(uid: string): Promise<WrongNote[]> {
  const snapshot = await getDocs(
    query(collection(firestore(), 'users', uid, 'wrongNotes'), orderBy('nextReviewAt'), limit(100)),
  );
  return snapshot.docs.map((item) => ({ questionId: item.id, ...noteFromDoc(item.data()) }));
}

/** 복습 한 문항의 결과를 남긴다(쓰기 1번) */
export async function saveReview(uid: string, note: WrongNote, correct: boolean): Promise<WrongNote> {
  const ref = doc(firestore(), 'users', uid, 'wrongNotes', note.questionId);
  const now = Date.now();
  if (correct) {
    const next = noteAfterReviewCorrect(note, now);
    const batch = writeBatch(firestore());
    batch.update(ref, {
      stage: next.stage,
      nextReviewAt: Timestamp.fromMillis(next.nextReviewAt),
      mastered: next.mastered,
    });
    await batch.commit();
    return { ...note, ...next };
  }
  const next = noteAfterWrong(note, now);
  const batch = writeBatch(firestore());
  batch.update(ref, {
    wrongCount: next.wrongCount,
    lastWrongAt: serverTimestamp(),
    stage: 0,
    nextReviewAt: Timestamp.fromMillis(next.nextReviewAt),
    mastered: false,
  });
  await batch.commit();
  return { ...note, ...next };
}

/** 이 기기에서 최근 본 문항 — 다음 경기에서 뒤로 미룬다(서버 기록 없이, 기기에만) */
const SEEN_KEY = 'yk_seen_questions';
const SEEN_MAX = 150;

export function recentlySeen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

export function rememberSeen(ids: readonly string[]): void {
  try {
    const merged = [...ids, ...recentlySeen()].slice(0, SEEN_MAX);
    localStorage.setItem(SEEN_KEY, JSON.stringify([...new Set(merged)]));
  } catch {
    // 사생활 보호 모드 등에서는 기억하지 않는다
  }
}

/** 문제은행에서 ID로 찾기 */
export function byId(bank: readonly Question[]): Map<string, Question> {
  return new Map(bank.map((question) => [question.id, question]));
}
