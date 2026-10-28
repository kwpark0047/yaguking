import { describe, expect, it } from 'vitest';
import { needsAgeCheck, needsProfileSetup, type ProfileData } from '@/lib/auth/gate';
import { authErrorMessage, emailProblem, passwordProblem } from '@/lib/auth/messages';

const data = (overrides: Partial<ProfileData> = {}): ProfileData => ({
  nickname: null,
  favoriteTeams: [],
  favoritePlayers: [],
  levelTestDone: false,
  rankingHidden: false,
  ...overrides,
});

/** 로그인 도우미 (Firebase판 1단계). */

describe('만 14세 확인이 필요한가', () => {
  const member = { isAnonymous: false };
  const guest = { isAnonymous: true };

  it('로그인하지 않았거나 비회원이면 묻지 않는다', () => {
    expect(needsAgeCheck(null, { status: 'missing' })).toBe(false);
    expect(needsAgeCheck(guest, { status: 'missing' })).toBe(false);
  });

  it('회원인데 프로필이 없거나 확인 전이면 묻는다', () => {
    expect(needsAgeCheck(member, { status: 'missing' })).toBe(true);
    expect(needsAgeCheck(member, { status: 'ready', ageConfirmed: false, data: data() })).toBe(true);
  });

  it('확인을 마쳤으면 묻지 않는다', () => {
    expect(needsAgeCheck(member, { status: 'ready', ageConfirmed: true, data: data() })).toBe(false);
  });

  it('프로필을 불러오는 중이거나 실패했으면 판단을 미룬다 — 엉뚱하게 보내지 않는다', () => {
    expect(needsAgeCheck(member, { status: 'loading' })).toBe(false);
    expect(needsAgeCheck(member, { status: 'error' })).toBe(false);
  });
});

describe('프로필 설정이 필요한가', () => {
  const member = { isAnonymous: false };

  it('닉네임이나 최애 구단 1위가 없으면 설정으로 보낸다', () => {
    expect(needsProfileSetup(member, { status: 'ready', ageConfirmed: true, data: data() })).toBe(true);
    expect(
      needsProfileSetup(member, { status: 'ready', ageConfirmed: true, data: data({ nickname: '야구왕' }) }),
    ).toBe(true);
  });

  it('둘 다 있으면 보내지 않는다(선수는 선택)', () => {
    const ready = data({ nickname: '야구왕', favoriteTeams: ['lg'] });
    expect(needsProfileSetup(member, { status: 'ready', ageConfirmed: true, data: ready })).toBe(false);
  });

  it('만 14세 확인 전·비회원·불러오는 중에는 묻지 않는다(확인이 먼저)', () => {
    expect(needsProfileSetup(member, { status: 'ready', ageConfirmed: false, data: data() })).toBe(false);
    expect(needsProfileSetup({ isAnonymous: true }, { status: 'missing' })).toBe(false);
    expect(needsProfileSetup(member, { status: 'loading' })).toBe(false);
  });
});

describe('로그인 오류 문장', () => {
  it('없는 계정과 틀린 비밀번호를 구분해 알려 주지 않는다 — 가입 여부를 캐낼 수 없게', () => {
    const notFound = authErrorMessage({ code: 'auth/user-not-found' });
    expect(authErrorMessage({ code: 'auth/wrong-password' })).toBe(notFound);
    expect(authErrorMessage({ code: 'auth/invalid-credential' })).toBe(notFound);
  });

  it('모르는 오류도 한국어 문장으로 답한다', () => {
    expect(authErrorMessage(new Error('boom'))).toMatch(/다시 시도/);
    expect(authErrorMessage({ code: 'auth/something-new' })).toMatch(/다시 시도/);
  });

  it('이미 가입된 이메일은 로그인으로 안내한다', () => {
    expect(authErrorMessage({ code: 'auth/email-already-in-use' })).toMatch(/로그인/);
  });
});

describe('가입 비밀번호', () => {
  it('8자보다 짧으면 거절한다', () => {
    expect(passwordProblem('short12', 'short12')).toMatch(/8자/);
  });

  it('확인이 다르면 거절한다', () => {
    expect(passwordProblem('long-enough', 'long-enougX')).toMatch(/일치/);
  });

  it('규칙을 지키면 통과한다', () => {
    expect(passwordProblem('long-enough', 'long-enough')).toBeNull();
  });
});

describe('이메일 칸 점검', () => {
  it('비었거나 형식이 틀리면 알려 준다(비밀번호보다 먼저)', () => {
    expect(emailProblem('  ')).toBe('이메일을 적어 주세요.');
    expect(emailProblem('name')).toMatch(/이메일 주소를 확인/);
    expect(emailProblem('name@example')).toMatch(/이메일 주소를 확인/);
    expect(emailProblem(' name@example.com ')).toBeNull();
  });
});
