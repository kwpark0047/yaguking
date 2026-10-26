import { NICKNAME_MESSAGE, validateNickname } from '@/lib/game/nickname';

/**
 * 프로필 입력 검증 — **firestore.rules와 같은 규칙**이다. 화면에서 먼저 막아 친절한
 * 문장을 보여 주고, 규칙이 마지막에 한 번 더 막는다.
 */

export const MAX_FAVORITE_TEAMS = 3;
export const MAX_FAVORITE_PLAYERS = 3;
export const PLAYER_NAME_MAX = 20;

/** 닉네임 문제를 문장으로. 없으면 null. 규칙: 2~16자, 앞뒤 공백 없음, '/' 없음 */
export function nicknameProblem(value: string): string | null {
  const problem = validateNickname(value);
  if (problem) return NICKNAME_MESSAGE[problem];
  if (value.trim().includes('/')) return "닉네임에 '/'는 쓸 수 없어요.";
  return null;
}

/**
 * 구단 고르기: 누른 순서가 순위다. 이미 고른 구단을 다시 누르면 빠지고 뒤 순위가
 * 한 칸씩 올라온다. 3개를 넘게 고를 수 없다.
 */
export function toggleTeam(ranked: readonly string[], slug: string): string[] {
  if (ranked.includes(slug)) return ranked.filter((item) => item !== slug);
  if (ranked.length >= MAX_FAVORITE_TEAMS) return [...ranked];
  return [...ranked, slug];
}

/** 최애 선수: 앞뒤 공백을 지우고 빈 칸은 버린다. 같은 이름은 한 번만. */
export function normalizePlayers(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const name = value.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    result.push(name);
  }
  return result.slice(0, MAX_FAVORITE_PLAYERS);
}

export function playersProblem(values: readonly string[]): string | null {
  const tooLong = values.find((value) => value.trim().length > PLAYER_NAME_MAX);
  return tooLong ? `선수 이름은 ${PLAYER_NAME_MAX}자까지 쓸 수 있어요.` : null;
}
