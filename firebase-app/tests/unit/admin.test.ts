import { describe, expect, it } from 'vitest';
import { adminDenial, maskEmail } from '@/lib/admin/access';
import { buildPublicNotices, noticeProblem, visibleNotices, type Notice } from '@/lib/admin/notices';
import { signupCheck, summarize } from '@/lib/admin/signupCheck';

describe('관리자 판별 = 규칙의 isAdmin()과 같은 조건', () => {
  const google = { firebase: { sign_in_provider: 'google.com' } };
  it('표시·이메일 인증·구글 로그인이 모두 있어야 한다', () => {
    expect(adminDenial({ admin: true, email_verified: true, ...google })).toBeNull();
    expect(adminDenial({ email_verified: true, ...google })).toBe('no-claim');
    expect(adminDenial({ admin: 'true', email_verified: true, ...google })).toBe('no-claim');
    expect(adminDenial({ admin: true, email_verified: false, ...google })).toBe('unverified');
    expect(adminDenial({ admin: true, email_verified: true, firebase: { sign_in_provider: 'password' } })).toBe('not-google');
  });

  it('이메일은 앞 두 글자와 도메인만', () => {
    expect(maskEmail('kwpark0047@gmail.com')).toBe('kw***@gmail.com');
    expect(maskEmail('a@b.c')).toBe('a***@b.c');
    expect(maskEmail(null)).toBe('(이메일 없음)');
  });
});

describe('가입 확인(점검 목록)', () => {
  const mirror = { emailVerified: true, providers: ['google.com'] };
  const profile = { ageConfirmed: true, nickname: '곰', favoriteTeams: ['lg'] };
  it('프로필이 없거나 14세 확인 전, 닉네임·구단 미완료, 완료를 구분한다', () => {
    expect(signupCheck(mirror, null).status).toBe('needs-age');
    expect(signupCheck(mirror, { ...profile, ageConfirmed: false }).status).toBe('needs-age');
    expect(signupCheck(mirror, { ...profile, nickname: null }).status).toBe('needs-profile');
    expect(signupCheck(mirror, { ...profile, favoriteTeams: [] }).status).toBe('needs-profile');
    expect(signupCheck(mirror, profile).status).toBe('complete');
  });

  it('이메일 미인증은 이메일·비밀번호 가입에만 표시(구글은 구글이 인증)', () => {
    expect(signupCheck({ emailVerified: false, providers: ['password'] }, profile).emailUnverified).toBe(true);
    expect(signupCheck({ emailVerified: false, providers: ['google.com'] }, profile).emailUnverified).toBe(false);
    const summary = summarize([signupCheck(mirror, profile), signupCheck(mirror, null), signupCheck({ emailVerified: false, providers: ['password'] }, null)]);
    expect(summary).toEqual({ total: 3, complete: 1, needsAge: 2, needsProfile: 0, emailUnverified: 1 });
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
