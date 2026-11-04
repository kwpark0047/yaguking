import { chosung } from '@/content/chosung';
import type { OptionLabel, Question } from '@/content/questions';
import { resolveAtBat, type AtBatResult, type AtBatVerdict, type Difficulty } from '@/lib/engine';

/**
 * 문제 풀이 힌트(docs/hint-plan.md) — 출석으로 모은 포인트를 쓴다. 비공식 경기(개인 경기·오늘의 1이닝·오답노트 복습)에서만.
 * 공식전·레벨 테스트·친구 대결에는 없다. 포인트는 지갑(src/lib/game/wallet.ts), 규칙이 값과 잔액을 지킨다(firestore.rules wallet).
 *
 * 순수 함수다. 이 파일은 테스트(Node)에서도 불러온다.
 */

/** 처리방침 개정(7일 전 공지) 시행일에 연다 — 운영자 PC 지갑 작업(ops/monthly.mjs HINT_START)과 같아야 한다(단위 테스트) */
export const HINT_START = '2026-11-11';

/** 화면을 여는 시작일. 에뮬레이터 개발·E2E에서만 VITE_HINT_START로 앞당길 수 있다(engagementStart와 같은 방식) */
export function hintStart(): string {
  const env = import.meta.env as Record<string, string | undefined> | undefined;
  const override = env?.VITE_HINT_START;
  return env?.VITE_USE_EMULATORS !== 'false' && override ? override : HINT_START;
}

export const hintsOpen = (today: string, start: string = hintStart()) => today >= start;

export type HintKind = 'fifty' | 'chosung' | 'time';

/** 값 — firestore.rules의 wallet 규칙(20·30만 허용)과 같아야 한다(단위 테스트) */
export const HINT_COST: Record<HintKind, number> = { fifty: 30, chosung: 20, time: 20 };
export const HINT_ORDER: readonly HintKind[] = ['fifty', 'chosung', 'time'];
export const HINT_TITLE: Record<HintKind, string> = { fifty: '반반', chosung: '초성', time: '시간 +5초' };
export const HINT_DESCRIPTION: Record<HintKind, string> = {
  fifty: '틀린 보기 둘을 지워요',
  chosung: '정답의 초성을 보여 줘요',
  time: '남은 시간에 5초를 더해요',
};
/** 시간 힌트로 더 주는 시간 — 판정에서는 뺀다(첫 문제 20초와 같은 방식) */
export const HINT_TIME_MS = 5_000;
/** 한 경기에 둘까지(한 문제에는 하나) */
export const HINTS_PER_GAME = 2;

/** 반반·초성은 맞혀도 2루타까지 — 답을 보고 친 공이 홈런이면 기록이 흔들린다 */
export const hintCapsResult = (hint: HintKind | null | undefined): boolean => hint === 'fifty' || hint === 'chosung';

export function capHintResult(result: AtBatResult): AtBatResult {
  return result === 'HR' || result === '3B' ? '2B' : result;
}

/** 힌트까지 반영한 판정 — 제한이 걸리면 승급 보너스도 없다(고급 문항·연속 정답). 연속 정답 수는 그대로 이어진다 */
export function hintVerdict(
  correct: boolean,
  elapsedMs: number,
  difficulty: Difficulty,
  streakBefore: number,
  hint: HintKind | null | undefined,
): AtBatVerdict {
  const verdict = resolveAtBat(correct, elapsedMs, difficulty, streakBefore);
  if (!hintCapsResult(hint)) return verdict;
  const base = resolveAtBat(correct, elapsedMs, 'easy', 0); // 승급 없는 결과
  return { result: capHintResult(base.result), upgraded: false, upgradeReason: null, streakAfter: verdict.streakAfter };
}

/** 반반 — 지울 틀린 보기 둘. 문항 ID로 정해져 다시 열어도 같다 */
export function fiftyFifty(question: Pick<Question, 'id' | 'options' | 'correct'>): OptionLabel[] {
  let hash = 2166136261;
  for (let i = 0; i < question.id.length; i += 1) {
    hash ^= question.id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const wrong = question.options.map((option) => option.label).filter((label) => label !== question.correct);
  const keep = (hash >>> 0) % wrong.length;
  return wrong.filter((_, index) => index !== keep).slice(0, 2);
}

/** 초성 힌트 글자 — 숫자가 있으면 끝자리를 가린다(2016년 → 201_년), 아니면 낱말마다 초성(두산 베어스 → ㄷㅅ ㅂㅇㅅ) */
export function initialsHint(text: string): string {
  const lastDigit = [...text].reduce((found, char, index) => (/[0-9]/.test(char) ? index : found), -1);
  if (lastDigit >= 0) return [...text].map((char, index) => (index === lastDigit ? '_' : char)).join('');
  return text
    .split(' ')
    .map((word) => chosung(word).replaceAll(' ', ''))
    .join(' ');
}

/** 초성 힌트 — 그 문항의 정답 보기에서 */
export function chosungHint(question: Pick<Question, 'options' | 'correct'>): string {
  return initialsHint(question.options.find((option) => option.label === question.correct)?.text ?? '');
}
