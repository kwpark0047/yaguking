/**
 * 오답노트 간격 복습 — 틀린 뒤 1·3·7·14일 (01 PRD F08).
 *
 * stage = 다음 복습까지의 단계(0~4). 틀리면 stage 0, 하루 뒤 복습.
 * 복습에서 맞히면 stage가 하나 오르고 그 단계의 간격 뒤에 다시 나온다.
 * stage 4에서 맞히면(14일 복습 통과) 익힌 문항이 된다.
 *
 * 순수 함수다. 시각(ms)은 주입받는다. firestore.rules가 stage 0~4를 지킨다.
 */
export const REVIEW_DAYS = [1, 3, 7, 14] as const;
/** 익힌 문항은 복습 시각을 멀리 미뤄, 복습 시각 순으로 읽을 때 목록 끝에 오게 한다 */
export const MASTERED_PARK_DAYS = 3650;
const DAY_MS = 86_400_000;

export interface NoteState {
  wrongCount: number;
  lastWrongAt: number;
  stage: number;
  nextReviewAt: number;
  mastered: boolean;
}

/**
 * 틀렸다(경기 중이든 복습 중이든). 처음 틀린 문항이면 previous=null.
 * 경기 저장은 이전 노트를 읽지 않고 횟수만 서버에서 1 올린다(persist.ts) — 결과는 같다.
 */
export function noteAfterWrong(previous: NoteState | null, now: number): NoteState {
  return {
    wrongCount: (previous?.wrongCount ?? 0) + 1,
    lastWrongAt: now,
    stage: 0,
    nextReviewAt: now + REVIEW_DAYS[0] * DAY_MS,
    mastered: false,
  };
}

/** 복습에서 맞혔다 */
export function noteAfterReviewCorrect(previous: NoteState, now: number): NoteState {
  const stage = Math.min(previous.stage + 1, REVIEW_DAYS.length);
  if (stage >= REVIEW_DAYS.length) {
    return { ...previous, stage: REVIEW_DAYS.length, mastered: true, nextReviewAt: now + MASTERED_PARK_DAYS * DAY_MS };
  }
  return { ...previous, stage, nextReviewAt: now + REVIEW_DAYS[stage]! * DAY_MS };
}

/** 지금 복습할 노트: 익히지 않았고 복습 시각이 지났다. 오래 기다린 것부터. */
export function dueNotes<T extends Pick<NoteState, 'mastered' | 'nextReviewAt'>>(
  notes: readonly T[],
  now: number,
): T[] {
  return notes
    .filter((note) => !note.mastered && note.nextReviewAt <= now)
    .sort((a, b) => a.nextReviewAt - b.nextReviewAt);
}
