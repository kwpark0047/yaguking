/**
 * 오늘의 공식전(docs/engagement-plan.md §5) — 순수 계산. 정답은 기기에 없고 운영자 PC(ops/official.mjs)가 판정한다.
 * **점수 계산은 그 파일과 같아야 한다**(tests/unit/official.test.ts가 대조). 화면은 판정이 끝난 뒤 공개된 정답으로
 * 내 결과를 다시 계산해 보여 줄 뿐이고, 등수에 들어가는 점수는 운영자 PC가 쓴 값이다.
 */

export const OFFICIAL_TOTAL = 5;
/** 한 문제 시간(화면). 판정은 네트워크 지연을 감안해 1.5초 여유 */
export const OFFICIAL_QUESTION_MS = 15_000;
export const OFFICIAL_GRACE_MS = 1_500;
export const OFFICIAL_POINTS = { correct: 100, speedMax: 50, finish: 20 } as const;

const KST = 9 * 3_600_000;

/** 공식전 ID = 한국 날짜 "YYYYMMDD" */
export function roundIdOf(nowMs: number = Date.now()): string {
  return new Date(nowMs + KST).toISOString().slice(0, 10).replaceAll('-', '');
}

/** 한 문제 점수 — 맞히면 100 + 빠르기(0~50: 0초 50점, 15초 0점), 틀리거나 시간을 넘기면 0 */
export function questionPoints(correct: boolean, elapsedMs: number): number {
  if (!correct || elapsedMs > OFFICIAL_QUESTION_MS + OFFICIAL_GRACE_MS) return 0;
  const left = OFFICIAL_QUESTION_MS - Math.min(Math.max(elapsedMs, 0), OFFICIAL_QUESTION_MS);
  return OFFICIAL_POINTS.correct + Math.floor((OFFICIAL_POINTS.speedMax * left) / OFFICIAL_QUESTION_MS);
}

export interface AttemptAnswer {
  choice: string | null;
  /** 서버 시각(ms) */
  at: number;
}

export interface GradedQuestion {
  choice: string | null;
  correct: boolean;
  elapsedMs: number;
  points: number;
}

/**
 * 시도 하나 판정 — 문제마다 걸린 시간 = 이 답의 서버 시각 − 앞 답(첫 문제는 시작)의 서버 시각.
 * 끝까지 답하면(시간 초과 포함) 완주 +20.
 */
export function gradeAttempt(startedAt: number, answers: Record<string, AttemptAnswer>, key: readonly string[]) {
  const questions: GradedQuestion[] = [];
  let previous = startedAt;
  for (let index = 0; index < key.length; index += 1) {
    const answer = answers[String(index)];
    if (!answer) break;
    const elapsedMs = answer.at - previous;
    previous = answer.at;
    const correct = answer.choice !== null && answer.choice === key[index] && elapsedMs <= OFFICIAL_QUESTION_MS + OFFICIAL_GRACE_MS;
    questions.push({ choice: answer.choice, correct, elapsedMs, points: questionPoints(correct, elapsedMs) });
  }
  const finished = questions.length === key.length;
  return {
    questions,
    correct: questions.filter((question) => question.correct).length,
    answered: questions.length,
    points: questions.reduce((sum, question) => sum + question.points, 0) + (finished ? OFFICIAL_POINTS.finish : 0),
  };
}

/** 그 달 공식 점수 합 — `through`일까지(등수와 같은 기준). days = { "YYYYMMDD": 점수 } */
export function officialSum(days: Record<string, number>, month: string, through = 31): { points: number; rounds: number } {
  let points = 0;
  let rounds = 0;
  for (const [day, value] of Object.entries(days)) {
    if (day.slice(0, 6) !== month || Number(day.slice(6, 8)) > through || !Number.isFinite(value)) continue;
    points += value;
    rounds += 1;
  }
  return { points, rounds };
}
