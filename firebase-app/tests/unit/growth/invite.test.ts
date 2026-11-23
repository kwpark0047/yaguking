import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as job from '../../../ops/invite.mjs';
import {
  eventOn,
  INVITE_ACTIVE_DAYS,
  INVITE_ACTIVE_WINDOW_DAYS,
  INVITE_CODE_CHARS,
  INVITE_EVENTS,
  INVITE_KEY,
  INVITE_LINK_WITHIN_DAYS,
  INVITE_MILESTONES,
  INVITE_MONTHLY_CAP,
  INVITE_POINTS,
  INVITE_START,
  inviteLink,
  invitesOpen,
  isInviteCode,
  makeInviteCode,
  normalizeInviteCode,
  parseInvite,
  withoutInvite,
} from '@/lib/growth/invite';
import { ACQUISITION_PRIVACY_EFFECTIVE, INVITE_PRIVACY_EFFECTIVE, PRIVACY_VERSIONS, upcomingVersion } from '@/content/privacy';
import { parseAcquisition } from '@/lib/growth/acquisition';

const rules = readFileSync(join(__dirname, '../../../firestore.rules'), 'utf8');
const kst = (date: string) => Date.parse(`${date}T00:00:00+09:00`);

describe('친구 초대 — 앱·운영자 PC·규칙·처리방침이 같은 값', () => {
  it('시작일·보상·기준·칭호·이벤트가 ops/invite.mjs와 같다', () => {
    expect(job.INVITE_START).toBe(INVITE_START);
    expect(job.INVITE_POINTS).toEqual({ ...INVITE_POINTS });
    expect(job.INVITE_MONTHLY_CAP).toBe(INVITE_MONTHLY_CAP);
    expect(job.INVITE_ACTIVE_WINDOW_DAYS).toBe(INVITE_ACTIVE_WINDOW_DAYS);
    expect(job.INVITE_ACTIVE_DAYS).toBe(INVITE_ACTIVE_DAYS);
    expect(job.INVITE_MILESTONES).toEqual(INVITE_MILESTONES.map(({ count, title, points }) => ({ count, title, points })));
    expect(job.INVITE_EVENTS).toEqual(INVITE_EVENTS.map(({ id, start, end, multiplier }) => ({ id, start, end, multiplier })));
  });

  it('운영자 결정(2026-11-18): 100P·50P, 7일 안 2일, 월 10명, 첫 이벤트는 12월 스카우트 주간 2배', () => {
    expect(INVITE_POINTS).toEqual({ inviter: 100, invitee: 50 });
    expect([INVITE_ACTIVE_WINDOW_DAYS, INVITE_ACTIVE_DAYS, INVITE_MONTHLY_CAP]).toEqual([7, 2, 10]);
    expect(INVITE_EVENTS[0]).toMatchObject({ start: '2026-12-01', multiplier: 2 });
  });

  it('규칙: 코드 형식, 가입 후 7일 안에만 연결, 남의 코드만', () => {
    expect(rules).toContain("matches('^[A-HJ-NP-Z2-9]{6}$')");
    expect(rules).toContain(`duration.value(${INVITE_LINK_WITHIN_DAYS}, 'd')`);
    expect(rules).toContain('.data.uid != uid');
    for (const char of '0O1I') expect(INVITE_CODE_CHARS).not.toContain(char);
  });

  it('처리방침 개정판 시행일 = 초대를 여는 날, 유입 출처 판 다음 판, 오늘(11-18) 기준 7일 뒤 이상', () => {
    expect(INVITE_PRIVACY_EFFECTIVE).toBe(INVITE_START);
    expect(upcomingVersion(ACQUISITION_PRIVACY_EFFECTIVE)?.effective).toBe(INVITE_START);
    expect(kst(INVITE_START) - kst('2026-11-18')).toBeGreaterThanOrEqual(7 * 86_400_000);
    // 초대 판(다음 판 — 팀 판 — 은 tests/unit/squad.test.ts)
    const latest = PRIVACY_VERSIONS.find((version) => version.effective === INVITE_START)!;
    expect(latest.effective).toBe(INVITE_START);
    const text = JSON.stringify(latest.sections);
    expect(text).toContain(INVITE_KEY);
    expect(text).toContain('친구 초대 운영');
    expect(text).toContain('나를 초대한 회원에게 내 닉네임');
    expect(text).toContain(`시행일: ${INVITE_START}`);
    expect(latest.changes.join(' ')).toContain('월간 등수에는 넣지 않습니다');
  });

  it('개정은 위탁·국외 이전·제3자 제공·권리·아동·보안을 바꾸지 않는다(공개 범위에 초대 한 줄만 더함)', () => {
    const at = PRIVACY_VERSIONS.findIndex((version) => version.effective === INVITE_START);
    const before = PRIVACY_VERSIONS[at - 1]!;
    const latest = PRIVACY_VERSIONS[at]!;
    const of = (version: typeof latest, id: string) => version.sections.find((section) => section.id === id);
    for (const id of ['outsourcing', 'overseas', 'third-party', 'rights', 'children', 'security']) expect(JSON.stringify(of(latest, id))).toBe(JSON.stringify(of(before, id)));
    expect(of(latest, 'public')!.items!.slice(0, -1)).toEqual(of(before, 'public')!.items);
  });
});

describe('초대 코드·링크', () => {
  it('코드는 6자리, 헷갈리는 글자 없음', () => {
    for (let index = 0; index < 200; index += 1) expect(isInviteCode(makeInviteCode())).toBe(true);
    expect(makeInviteCode(() => 0)).toBe('AAAAAA');
    expect(makeInviteCode(() => 0.999999)).toBe('999999');
  });

  it('사람이 적은 코드를 고친다', () => {
    expect(normalizeInviteCode(' kx7p-2m ')).toBe('KX7P2M');
    expect(normalizeInviteCode('KX7P2')).toBeNull();
    expect(normalizeInviteCode('KX7P2O')).toBeNull(); // O는 쓰지 않는다
  });

  it('링크: 초대 코드 + 기존 유입 출처(앱 안 공유, 캠페인 invite)', () => {
    const link = inviteLink('https://yaguking.web.app', 'KX7P2M');
    const search = new URL(link).search;
    expect(parseInvite(search)).toBe('KX7P2M');
    expect(parseAcquisition(search)).toEqual({ source: 'share', campaign: 'invite' });
    expect(withoutInvite(link)).not.toContain('invite=');
    expect(parseInvite('?invite=bad')).toBeNull();
  });

  it('시행일 전에는 열리지 않는다(한국 날짜)', () => {
    expect(invitesOpen(kst('2026-11-30') + 86_399_000, INVITE_START)).toBe(false);
    expect(invitesOpen(kst('2026-12-01'), INVITE_START)).toBe(true);
  });

  it('이벤트 기간은 마지막 날 포함', () => {
    expect(eventOn('2026-11-30')).toBeNull();
    expect(eventOn('2026-12-01')?.multiplier).toBe(2);
    expect(eventOn('2026-12-14')?.multiplier).toBe(2);
    expect(eventOn('2026-12-15')).toBeNull();
  });
});

describe('활동 확인·합계(운영자 PC 순수 함수)', () => {
  it('연결한 날부터 7일 안에 서로 다른 2일 — 두 번째 날이 활동 확인일', () => {
    expect(job.activeDayOf(100, [100, 100])).toBeNull();
    expect(job.activeDayOf(100, [100, 103])).toBe(103);
    expect(job.activeDayOf(100, [99, 106])).toBeNull(); // 99는 연결 전, 107부터는 기간 밖
    expect(job.activeDayOf(100, [101, 106, 102])).toBe(102);
    expect(job.activeDayOf(100, [107, 108])).toBeNull();
  });

  it('보상받은 기록만 더하고, 3명·10명이면 칭호와 한 번 보너스', () => {
    const rewarded = (invitee: string, inviterPoints = 100) => ({ status: 'rewarded', inviter: 'A', invitee, inviterPoints, inviteePoints: 50 });
    const entries = [rewarded('b'), rewarded('c'), rewarded('d', 200), { status: 'joined', inviter: 'A', invitee: 'e' }, { status: 'revoked', inviter: 'A', invitee: 'f', inviterPoints: 0, inviteePoints: 0 }];
    const summary = job.summarize(entries);
    expect(summary.get('A')).toEqual({ bonus: 100 + 100 + 200 + 100, rewarded: 3, titles: ['scout'] });
    expect(summary.get('b')).toEqual({ bonus: 50, rewarded: 0, titles: [] });
    expect(summary.has('e')).toBe(false);
  });
});
