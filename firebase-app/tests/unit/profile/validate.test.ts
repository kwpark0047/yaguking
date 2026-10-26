import { describe, expect, it } from 'vitest';
import {
  nicknameProblem,
  normalizePlayers,
  playersProblem,
  toggleTeam,
} from '@/lib/profile/validate';

/** 프로필 입력 — firestore.rules와 같은 규칙(tests/rules/profile.test.ts가 규칙 쪽을 본다). */
describe('닉네임', () => {
  it('2~16자, 앞뒤 공백은 무시하고 길이를 잰다', () => {
    expect(nicknameProblem('야구왕')).toBeNull();
    expect(nicknameProblem('  야구왕  ')).toBeNull();
    expect(nicknameProblem('가')).toMatch(/2자/);
    expect(nicknameProblem('가'.repeat(17))).toMatch(/16자/);
    expect(nicknameProblem('   ')).toMatch(/입력/);
  });

  it("'/'는 쓸 수 없다 — 문서 ID로 쓰기 때문", () => {
    expect(nicknameProblem('a/b')).toMatch(/'\/'/);
  });
});

describe('최애 구단 TOP3', () => {
  it('누른 순서가 순위, 다시 누르면 빠지고 뒤가 올라온다', () => {
    let ranked = toggleTeam([], 'lg');
    ranked = toggleTeam(ranked, 'kia');
    ranked = toggleTeam(ranked, 'nc');
    expect(ranked).toEqual(['lg', 'kia', 'nc']);
    expect(toggleTeam(ranked, 'lg')).toEqual(['kia', 'nc']);
  });

  it('3개를 넘게 고를 수 없다', () => {
    expect(toggleTeam(['lg', 'kia', 'nc'], 'kt')).toEqual(['lg', 'kia', 'nc']);
  });
});

describe('최애 선수', () => {
  it('공백을 지우고 빈 칸·중복을 버린다, 최대 3명', () => {
    expect(normalizePlayers([' 홍길동 ', '', '홍길동', '김야구', '박타자', '이투수'])).toEqual([
      '홍길동',
      '김야구',
      '박타자',
    ]);
  });

  it('20자를 넘으면 알린다', () => {
    expect(playersProblem(['가'.repeat(21)])).toMatch(/20자/);
    expect(playersProblem(['홍길동'])).toBeNull();
  });
});
