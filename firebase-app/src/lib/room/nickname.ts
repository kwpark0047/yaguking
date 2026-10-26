/**
 * 대결 방에서 쓸 이름. 회원은 프로필 닉네임, 비회원은 방에 들어갈 때 적는다
 * (기기에 기억해 다음에 미리 채운다). 규칙: 1~16자.
 */
const KEY = 'yk_room_nickname';
export const ROOM_NICKNAME_MAX = 16;

export function rememberedGuestName(random: () => number = Math.random): string {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) return saved;
  } catch {
    // 저장소를 못 쓰면 새로 만든다
  }
  return `손님${Math.floor(1000 + random() * 9000)}`;
}

export function rememberGuestName(name: string): void {
  try {
    localStorage.setItem(KEY, name);
  } catch {
    // 기억하지 못해도 대결은 된다
  }
}

/** 문제가 없으면 null */
export function roomNicknameProblem(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) return '이름을 적어 주세요.';
  if (trimmed.length > ROOM_NICKNAME_MAX) return `이름은 ${ROOM_NICKNAME_MAX}자까지예요.`;
  return null;
}
