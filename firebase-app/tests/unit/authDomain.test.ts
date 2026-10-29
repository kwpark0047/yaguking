import { describe, expect, it } from 'vitest';
import { SAME_ORIGIN_AUTH_HOSTS, authDomainFor } from '@/lib/firebase/app';

/**
 * 로그인 처리 주소(authDomain) — 앱 주소와 같게(사파리·최신 크롬·홈 화면 앱의 "missing initial state" 오류 대응).
 * 미리보기 채널·관리자 사이트·예전 주소는 설정값 그대로.
 */
describe('authDomain', () => {
  it('이용자 앱 주소에서는 그 주소', () => {
    expect(SAME_ORIGIN_AUTH_HOSTS).toContain('yaguking.web.app');
    expect(authDomainFor('yaguking.web.app', 'yaguking-bc25c.firebaseapp.com')).toBe('yaguking.web.app');
  });

  it('그 밖의 주소는 설정값', () => {
    for (const host of ['yaguking--preview-qeclifhr.web.app', 'yaguking-bc25c-admin.web.app', 'localhost', ''])
      expect(authDomainFor(host, 'yaguking-bc25c.firebaseapp.com')).toBe('yaguking-bc25c.firebaseapp.com');
  });
});
