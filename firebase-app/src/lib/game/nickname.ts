/**
 * 닉네임 추천.
 *
 * 온보딩을 3초로 줄이려면 입력란이 **이미 채워져 있어야** 한다. 사용자는
 * 그대로 `다음`을 누르거나 고치면 된다 (06 문서 §7.4).
 *
 * 순수 함수다. 난수는 주입받아 테스트에서 고정할 수 있게 한다.
 */

export const NICKNAME_MIN = 2;
export const NICKNAME_MAX = 16;

const ADJECTIVES = [
  '빠른',
  '묵직한',
  '노련한',
  '겁없는',
  '꾸준한',
  '잠잠한',
  '단단한',
  '날카로운',
] as const;

const NOUNS = [
  '중견수',
  '마무리',
  '대타',
  '유격수',
  '좌완',
  '포수',
  '교타자',
  '선발',
] as const;

export type RandomSource = () => number;

/** 추천 닉네임 하나. 항상 2~16자를 만족한다. */
export function suggestNickname(random: RandomSource = Math.random): string {
  const adjective = ADJECTIVES[Math.floor(random() * ADJECTIVES.length)] ?? ADJECTIVES[0];
  const noun = NOUNS[Math.floor(random() * NOUNS.length)] ?? NOUNS[0];
  const number = String(Math.floor(random() * 90) + 10);

  const candidate = `${adjective}${noun}${number}`;
  return candidate.length <= NICKNAME_MAX ? candidate : `${noun}${number}`;
}

export type NicknameProblem = 'too_short' | 'too_long' | 'blank';

/** 닉네임 검증. 서버와 화면이 같은 규칙을 쓴다. */
export function validateNickname(value: string): NicknameProblem | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return 'blank';
  if (trimmed.length < NICKNAME_MIN) return 'too_short';
  if (trimmed.length > NICKNAME_MAX) return 'too_long';
  return null;
}

export const NICKNAME_MESSAGE: Record<NicknameProblem, string> = {
  blank: '닉네임을 입력해 주세요.',
  too_short: `닉네임은 ${NICKNAME_MIN}자 이상이어야 합니다.`,
  too_long: `닉네임은 ${NICKNAME_MAX}자까지 쓸 수 있습니다.`,
};
