import { describe, expect, it } from 'vitest';
import { ADMIN_SITE_URL, adminDenial, maskEmail, signInProblem } from '@/lib/admin/access';
import { buildPublicNotices, noticeProblem, visibleNotices, type Notice } from '@/lib/admin/notices';

describe('관리자 판별 = 규칙의 isAdmin()과 같은 조건', () => {
  const google = { firebase: { sign_in_provider: 'google.com' } };
  it('표시·이메일 인증·구글 로그인이 모두 있어야 한다', () => {
    expect(adminDenial({ admin: true, email_verified: true, ...google })).toBeNull();
    expect(adminDenial({ email_verified: true, ...google })).toBe('no-claim');
    expect(adminDenial({ admin: 'true', email_verified: true, ...google })).toBe('no-claim');
    expect(adminDenial({ admin: true, email_verified: false, ...google })).toBe('unverified');
    expect(adminDenial({ admin: true, email_verified: true, firebase: { sign_in_provider: 'password' } })).toBe('not-google');
  });

  it('구글 로그인 실패: 막힘·닫힘·도메인·연결은 이유와 할 일, 모르는 코드는 코드를 보여 준다', () => {
    expect(signInProblem('auth/popup-blocked')).toMatch(/막았어요.*허용.*다시 눌러/);
    expect(signInProblem('auth/popup-closed-by-user')).toMatch(/닫혔어요.*다시 누르고/);
    expect(signInProblem('auth/unauthorized-domain')).toContain(ADMIN_SITE_URL);
    expect(signInProblem('auth/network-request-failed')).toContain('연결');
    expect(signInProblem('auth/cancelled-popup-request')).toBeNull();
    expect(signInProblem('auth/internal-error')).toBe('로그인하지 못했어요(auth/internal-error). 잠시 뒤 다시 시도해 주세요.');
    expect(signInProblem(undefined)).toBe('로그인하지 못했어요. 잠시 뒤 다시 시도해 주세요.');
  });

  it('이메일은 앞 두 글자와 도메인만', () => {
    expect(maskEmail('kwpark0047@gmail.com')).toBe('kw***@gmail.com');
    expect(maskEmail('a@b.c')).toBe('a***@b.c');
    expect(maskEmail(null)).toBe('(이메일 없음)');
  });
});

describe('공지사항', () => {
  const now = Date.UTC(2026, 9, 27, 3);
  const HOUR = 3_600_000;
  const notice = (id: string, overrides: Partial<Notice> = {}): Notice => ({
    id,
    title: id,
    body: '',
    startsAt: now - HOUR,
    endsAt: null,
    pinned: false,
    hidden: false,
    ...overrides,
  });

  it('입력 점검: 제목 필수·80자, 본문 2000자, 끝은 시작보다 뒤', () => {
    const ok = { title: '점검', body: '', startsAt: now, endsAt: null };
    expect(noticeProblem(ok)).toBeNull();
    expect(noticeProblem({ ...ok, title: '  ' })).toMatch(/제목/);
    expect(noticeProblem({ ...ok, title: '가'.repeat(81) })).toMatch(/80/);
    expect(noticeProblem({ ...ok, body: '가'.repeat(2001) })).toMatch(/2000/);
    expect(noticeProblem({ ...ok, endsAt: now })).toMatch(/뒤/);
  });

  it('공개 묶음: 숨김·끝난 공지는 빼고, 예약 공지는 싣고, 고정 먼저·최근 순, 20개까지, 숨김 표시는 싣지 않는다', () => {
    const list = [
      notice('old', { startsAt: now - 5 * HOUR }),
      notice('hidden', { hidden: true }),
      notice('ended', { endsAt: now - 1 }),
      notice('future', { startsAt: now + HOUR }),
      notice('pinned', { pinned: true, startsAt: now - 10 * HOUR }),
    ];
    const built = buildPublicNotices(list, now);
    expect(built.map((item) => item.id)).toEqual(['pinned', 'future', 'old']);
    expect(built[0]).not.toHaveProperty('hidden');
    expect(buildPublicNotices(Array.from({ length: 30 }, (_, i) => notice(`n${i}`)), now)).toHaveLength(20);
  });

  it('이용자 앱: 지금 공개 중인 것만(예약 전·끝난 것 제외), 고정 먼저', () => {
    const list = [notice('future', { startsAt: now + HOUR }), notice('a'), notice('p', { pinned: true, startsAt: now - 9 * HOUR })];
    expect(visibleNotices(list, now).map((item) => item.id)).toEqual(['p', 'a']);
  });
});
