/**
 * Firestore 문서 ID 규칙 — **보안 규칙(firestore.rules)과 똑같이** 계산해야 한다.
 * 어긋나면 규칙이 쓰기를 거절한다. tests/unit/data/keys.test.ts가 규칙과 같은지 본다.
 */

/** 닉네임 예약 문서 ID: nicknames/{소문자} — 규칙의 `.lower()`와 같다 */
export function nicknameKey(nickname: string): string {
  return nickname.toLowerCase();
}

/** 한국 날짜 일련번호(1970-01-01 KST부터 며칠째) — 규칙의 kstDay()와 같다 */
export function kstDayKey(nowMs: number = Date.now()): string {
  return String(Math.trunc((nowMs + 9 * 3600 * 1000) / 86_400_000));
}

/**
 * 방 코드: 6자, 헷갈리는 글자(0·O·1·I·L) 없이 대문자 + 숫자 2~9. 규칙: ^[A-Z2-9]{6}$
 * 코드가 곧 문서 ID라, 같은 코드가 이미 있으면 규칙이 만들기를 거절한다 → 다시 뽑는다.
 */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function roomCode(random: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += ROOM_CODE_ALPHABET[Math.floor(random() * ROOM_CODE_ALPHABET.length)];
  }
  return code;
}
