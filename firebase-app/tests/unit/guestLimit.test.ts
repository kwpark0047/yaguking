import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PRIVACY_VERSIONS } from '@/content/privacy';
import { GUEST_DAILY_GAMES } from '@/lib/game/guestLimit';

/** 비회원 하루 경기 수 — 코드 한 곳(guestLimit.ts)과 규칙·처리방침이 같은 수를 말한다 */
describe('비회원 하루 경기 수', () => {
  it('보안 규칙의 daily 카운터 상한 = GUEST_DAILY_GAMES', () => {
    const rules = readFileSync(join(__dirname, '../../firestore.rules'), 'utf8');
    const caps = [...rules.matchAll(/request\.resource\.data\.count <= (\d+);/g)].map((match) => Number(match[1]));
    expect(caps).toEqual([GUEST_DAILY_GAMES]);
    expect(rules).toContain(`비회원은 하루 ${GUEST_DAILY_GAMES}경기`);
  });

  it('처리방침의 모든 판이 같은 수를 적는다', () => {
    for (const version of PRIVACY_VERSIONS) {
      const text = JSON.stringify(version.sections);
      expect(text, version.effective).toContain(`하루 ${GUEST_DAILY_GAMES}판`);
      expect(text, version.effective).not.toMatch(new RegExp(`하루 (?!${GUEST_DAILY_GAMES}판)\\d+판`));
    }
  });
});
