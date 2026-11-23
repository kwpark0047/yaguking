import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DELETE_REASONS, guardianApproveProblem } from '@/admin/members';
import { confirmedMember, memberStatus, membersSummary, type MemberViewRow } from '@/lib/admin/views';
import * as ops from '../../ops/admin.mjs';

const rules = readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8');

const row = (extra: Partial<MemberViewRow> = {}): MemberViewRow => ({
  uid: 'u',
  email: null,
  emailVerified: true,
  providers: ['password'],
  createdAt: 0,
  lastSignInAt: 0,
  disabled: false,
  admin: false,
  ageConfirmedAt: null,
  nickname: null,
  favoriteTeams: [],
  levelTest: null,
  games: 0,
  hits: 0,
  atBats: 0,
  homeRuns: 0,
  lastGameAt: null,
  ...extra,
});

describe('가입자 관리 — 관리자 화면·운영자 PC·규칙이 같은 값', () => {
  it('계정 삭제 사유 목록이 셋 다 같다(이용약관 확정 전 — 제재 사유 없음)', () => {
    expect([...ops.DELETE_REASONS]).toEqual([...DELETE_REASONS]);
    expect(rules).toContain(`in [${DELETE_REASONS.map((reason) => `'${reason}'`).join(', ')}]`);
    expect(DELETE_REASONS.join(' ')).not.toMatch(/위반|정지|제재/);
  });

  it('작업 종류는 계정 동기화·계정 삭제·초대 보상 취소', () => {
    expect(rules).toContain("request.resource.data.type in ['syncAccounts', 'deleteAccount', 'revokeInvite']");
  });
});

describe('보호자 동의 승인 확인', () => {
  const request = { code: 'ABC234', email: 'Mom@Example.com', deadline: 1_000 };
  it('코드·보낸 주소가 같고 기한 안일 때만 통과(대소문자·공백 무시)', () => {
    expect(guardianApproveProblem(request, { code: ' abc234 ', senderEmail: ' mom@example.com ' }, 500)).toBeNull();
    expect(guardianApproveProblem(request, { code: 'ABC235', senderEmail: 'mom@example.com' }, 500)).toMatch(/동의 코드/);
    expect(guardianApproveProblem(request, { code: 'ABC234', senderEmail: 'dad@example.com' }, 500)).toMatch(/달라요/);
    expect(guardianApproveProblem(request, { code: 'ABC234', senderEmail: 'mom' }, 500)).toMatch(/보낸 주소/);
    expect(guardianApproveProblem(request, { code: 'ABC234', senderEmail: 'mom@example.com' }, 2_000)).toMatch(/기한/);
  });
});

describe('회원 상태 — 보호자 동의', () => {
  it('동의 기다림은 따로 표시하고, 동의 받은 자녀는 확인된 회원으로 센다', () => {
    expect(memberStatus(row({ guardian: 'pending' }), 0)).toBe('guardian-pending');
    expect(memberStatus(row({ guardian: 'consented' }), 0)).toBe('needs-profile');
    expect(memberStatus(row(), 0)).toBe('needs-age');
    expect(confirmedMember(row({ guardian: 'consented' }))).toBe(true);
    const summary = membersSummary([row({ guardian: 'pending', createdAt: 0 }), row({ guardian: 'consented' }), row({ ageConfirmedAt: 1 })], 10 * 86_400_000);
    expect(summary).toMatchObject({ members: 2, guardianPending: 1, stuckSignups: 0 });
  });
});
