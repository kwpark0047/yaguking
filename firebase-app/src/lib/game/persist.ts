import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import type { Question } from '@/content/questions';
import { kstDayKey } from '@/lib/data/keys';
import type { AtBatRecord } from '@/lib/data/types';
import { buildBoxScore } from '@/lib/engine';
import { firestore } from '@/lib/firebase/db';
import { countReads, countWrites, queryReads } from '@/lib/firebase/meter';
import { GUEST_DAILY_GAMES } from './guestLimit';
import type { PlayedAtBat } from './match';
import { noteAfterReviewCorrect, noteAfterWrong, REVIEW_DAYS, type NoteState } from './review';

/**
 * 경기·레벨 테스트·오답노트 저장 (docs/data-model.md §2).
 *
 * **경기는 끝날 때 한 번(한 묶음)만 쓴다** — 무료 쓰기 한도(하루 2만). 타석마다 쓰지 않는다.
 * **저장할 때 읽지 않는다** — 누적·비회원 카운터·오답 횟수는 서버의 증가 연산(increment)으로
 * 올린다. 규칙은 증가가 끝난 값을 보고 검사한다(경기 수 +1, 카운터 +1 ≤ 2 등).
 *
 * 시각은 서버 시각을 쓴다. 기기 시계가 빠르면 "미래 시각으로 틀렸다"가 되어 규칙이
 * 거절한다(오답노트의 lastWrongAt ≤ request.time).
 */

export { GUEST_DAILY_GAMES };
/** 오답노트 한 번에 읽는 수 — 복습 시각 순이라 복습할 문항이 앞에 온다 */
export const NOTES_PAGE_SIZE = 30;
const DAY_MS = 86_400_000;

/** 비회원이 오늘(KST) 남은 경기 수. 읽기 1번. */
export async function guestGamesLeft(uid: string): Promise<number> {
  const snapshot = await getDoc(doc(firestore(), 'users', uid, 'daily', kstDayKey()));
  countReads('guestGamesLeft', 1);
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

/** 경기 저장 — 읽기 0, 쓰기 = 경기 1 + 누적 1 + (비회원) 카운터 1 + 틀린 문항 수 */
export async function saveMatch(input: SaveMatchInput): Promise<SaveMatchResult> {
  const db = firestore();
  const batch = writeBatch(db);
  const userRef = doc(db, 'users', input.uid);
  let writes = 0;

  batch.set(doc(collection(userRef, 'games')), {
    mode: input.mode,
    createdAt: serverTimestamp(),
    innings: 1,
    runs: input.runs,
    pa: input.atBats.length,
    atBats: input.atBats.map(toRecord),
  });
  writes += 1;

  if (input.mode === 'practice') {
    // 누적(비공식) — 경기마다 하나씩. 없으면 증가 연산이 0에서 시작해 새로 만든다
    const box = buildBoxScore(input.atBats.map((atBat) => ({ result: atBat.result, rbi: atBat.rbi })));
    batch.set(
      doc(userRef, 'summary', 'main'),
      {
        games: increment(1),
        pa: increment(box.pa),
        ab: increment(box.ab),
        h: increment(box.h),
        hr: increment(box.hr),
        bb: increment(box.bb),
        so: increment(box.so),
        runs: increment(input.runs),
        xp: increment(input.xp),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    writes += 1;

    if (input.isGuest) {
      batch.set(doc(userRef, 'daily', kstDayKey()), { count: increment(1) }, { merge: true });
      writes += 1;
    }
  }

  if (input.levelTest) {
    batch.update(userRef, {
      levelTest: { ...input.levelTest, completedAt: serverTimestamp() },
      updatedAt: serverTimestamp(),
    });
    writes += 1;
  }

  // 틀린 문항 → 오답노트(같은 문항은 한 번). 이전 노트를 읽지 않고 덮어쓴다 — 틀리면 어차피
  // 단계가 처음(0)으로 돌아가고, 틀린 횟수만 서버에서 1 올린다.
  const wrongIds = [...new Set(input.atBats.filter((atBat) => !atBat.correct).map((atBat) => atBat.questionId))];
  const nextReviewAt = Timestamp.fromMillis(Date.now() + REVIEW_DAYS[0] * DAY_MS);
  for (const questionId of wrongIds) {
    batch.set(
      doc(userRef, 'wrongNotes', questionId),
      {
        questionId,
        wrongCount: increment(1),
        lastWrongAt: serverTimestamp(),
        stage: 0,
        nextReviewAt,
        mastered: false,
      },
      { merge: true },
    );
    writes += 1;
  }

  await batch.commit();
  countWrites(`saveMatch:${input.mode}`, writes);
  return { wrongSaved: wrongIds.length };
}

export interface WrongNote extends NoteState {
  questionId: string;
}

export interface WrongNotePage {
  notes: WrongNote[];
  /** 다음 쪽을 읽을 자리. 없으면 끝 */
  cursor: QueryDocumentSnapshot | null;
}

/**
 * 오답노트 한 쪽 — 복습 시각 순으로 NOTES_PAGE_SIZE개(읽기 = 문서 수).
 * 복습할 문항이 앞에, 익힌 문항은 맨 뒤에 온다(review.ts MASTERED_PARK_DAYS).
 */
export async function loadWrongNotes(uid: string, after: QueryDocumentSnapshot | null = null): Promise<WrongNotePage> {
  const notes = collection(firestore(), 'users', uid, 'wrongNotes');
  const snapshot = await getDocs(
    after
      ? query(notes, orderBy('nextReviewAt'), startAfter(after), limit(NOTES_PAGE_SIZE))
      : query(notes, orderBy('nextReviewAt'), limit(NOTES_PAGE_SIZE)),
  );
  countReads('loadWrongNotes', queryReads(snapshot.size));
  return {
    notes: snapshot.docs.map((item) => ({ questionId: item.id, ...noteFromDoc(item.data()) })),
    cursor: snapshot.size === NOTES_PAGE_SIZE ? snapshot.docs[snapshot.size - 1]! : null,
  };
}

/** 복습 한 문항의 결과를 남긴다(쓰기 1번) */
export async function saveReview(uid: string, note: WrongNote, correct: boolean): Promise<WrongNote> {
  const ref = doc(firestore(), 'users', uid, 'wrongNotes', note.questionId);
  const now = Date.now();
  const batch = writeBatch(firestore());
  let next: NoteState;
  if (correct) {
    next = noteAfterReviewCorrect(note, now);
    batch.update(ref, {
      stage: next.stage,
      nextReviewAt: Timestamp.fromMillis(next.nextReviewAt),
      mastered: next.mastered,
    });
  } else {
    next = noteAfterWrong(note, now);
    batch.update(ref, {
      wrongCount: increment(1),
      lastWrongAt: serverTimestamp(),
      stage: 0,
      nextReviewAt: Timestamp.fromMillis(next.nextReviewAt),
      mastered: false,
    });
  }
  await batch.commit();
  countWrites('saveReview', 1);
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
