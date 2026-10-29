import { describe, expect, it } from 'vitest';
import { SAME_ORIGIN_AUTH_ENABLED, SAME_ORIGIN_AUTH_HOSTS, authDomainFor } from '@/lib/firebase/sameOrigin';

/**
 * 로그인 처리 주소(authDomain) — 앱 주소와 같게(사파리·최신 크롬·홈 화면 앱의 "missing initial state" 오류 대응).
 * 구글 OAuth 등록 전까지는 꺼 둔다(SAME_ORIGIN_AUTH_ENABLED). 미리보기 채널·관리자 사이트·예전 주소는 언제나 설정값.
 */
describe('authDomain', () => {
  it('켜면 이용자 앱 주소에서는 그 주소', () => {
    expect(SAME_ORIGIN_AUTH_HOSTS).toContain('yaguking.web.app');
    expect(authDomainFor('yaguking.web.app', 'yaguking-bc25c.firebaseapp.com', true)).toBe('yaguking.web.app');
  });

  it('그 밖의 주소는 설정값', () => {
    for (const host of ['yaguking--preview-qeclifhr.web.app', 'yaguking-bc25c-admin.web.app', 'localhost', ''])
      expect(authDomainFor(host, 'yaguking-bc25c.firebaseapp.com', true)).toBe('yaguking-bc25c.firebaseapp.com');
  });

  it('지금(구글 OAuth 등록 전)은 꺼져 있어 예전 설정값 그대로', () => {
    expect(SAME_ORIGIN_AUTH_ENABLED).toBe(false);
    expect(authDomainFor('yaguking.web.app', 'yaguking-bc25c.firebaseapp.com')).toBe('yaguking-bc25c.firebaseapp.com');
  });
});
