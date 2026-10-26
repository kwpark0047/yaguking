import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { kstDayKey, nicknameKey, ROOM_CODE_ALPHABET, roomCode } from '@/lib/data/keys';

/** 문서 ID 규칙 — firestore.rules와 같아야 한다(어긋나면 쓰기가 거절된다). */
const rules = readFileSync(fileURLToPath(new URL('../../../firestore.rules', import.meta.url)), 'utf8');

describe('한국 날짜 키', () => {
  it('KST 자정(UTC 15:00)에 바뀐다', () => {
    const beforeMidnightKst = Date.UTC(2026, 9, 25, 14, 59, 59);
    const afterMidnightKst = Date.UTC(2026, 9, 25, 15, 0, 0);
    expect(Number(kstDayKey(afterMidnightKst))).toBe(Number(kstDayKey(beforeMidnightKst)) + 1);
  });

  it('정수 문자열이다 — 규칙의 int(...)와 같다(소수점 없음)', () => {
    expect(kstDayKey(Date.UTC(2026, 9, 26, 3))).toMatch(/^\d+$/);
    expect(rules).toContain('int((request.time.toMillis() + 32400000) / 86400000)');
  });
});

describe('방 코드', () => {
  it('규칙의 형식(^[A-Z2-9]{6}$)을 따르고 헷갈리는 글자가 없다', () => {
    expect(rules).toContain("code.matches('^[A-Z2-9]{6}$')");
    for (let i = 0; i < 200; i += 1) expect(roomCode()).toMatch(/^[A-Z2-9]{6}$/);
    expect(ROOM_CODE_ALPHABET).not.toMatch(/[01OIL]/);
  });
});

describe('닉네임 키', () => {
  it('대소문자를 구분하지 않는다 — 규칙의 .lower()와 같다', () => {
    expect(nicknameKey('Slugger')).toBe(nicknameKey('SLUGGER'));
    expect(rules).toContain('nickname.lower()');
  });
});
