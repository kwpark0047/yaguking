import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hideSquad, runSquads } from '../../ops/squad.mjs';
import { approveGuardian, expireGuardians, listGuardians } from '../../ops/guardian.mjs';
import { runMonthly, runWallets } from '../../ops/monthly.mjs';

/** 팀 0시 작업(ops/squad.mjs)·보호자 동의(ops/guardian.mjs) — 에뮬레이터에서 실제로. `npm run test:ops` */
const emulated = Boolean(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST);
const PROJECT = 'demo-yaguking';
const KST = 9 * 3_600_000;
/** 한국 시간 그날 0시 1분(운영자 PC 예약 작업 시각) */
const at = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d, 0, 1) - KST;
const LOGO = { frame: 'shield', symbol: 'ball', primary: 'navy', secondary: 'gold', initials: 'YK' };

describe.skipIf(!emulated)('팀 0시 작업(에뮬레이터)', () => {
  let app: App;
  let db: Firestore;
  let auth: Auth;

  beforeAll(async () => {
    app = initializeApp({ projectId: PROJECT }, 'squad-test');
    db = getFirestore(app);
    auth = getAuth(app);
    // 에뮬레이터 첫 요청은 느리다(10초를 넘기기도) — 시험 전에 한 번 깨운다
    await db.doc('warmup/x').get();
  }, 60_000);
  afterAll(async () => {
    await deleteApp(app);
  });
  beforeEach(async () => {
    await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
    await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
  });

  async function user(uid: string, extra: object = {}) {
    await db.doc(`users/${uid}`).set({ ageConfirmedAt: new Date(), createdAt: new Date(), nickname: `${uid}닉`, favoriteTeams: ['lg'], ...extra });
  }
  async function squad(code: string, members: { uid: string; child?: boolean; at?: number }[], extra: object = {}) {
    await db.doc(`squads/${code}`).set({
      name: `${code}팀`,
      kind: 'friends',
      logo: LOGO,
      captain: members[0]!.uid,
      coach: null,
      size: members.length,
      createdAt: new Date(),
      ...extra,
    });
    for (const [index, member] of members.entries()) {
      await db.doc(`squads/${code}/members/${member.uid}`).set({ nickname: `${member.uid}닉`, joinedAt: Timestamp.fromMillis(member.at ?? 1_000 + index), child: member.child === true });
      await db.doc(`users/${member.uid}`).set({ squad: code }, { merge: true });
    }
  }
  /** 공식전 점수(운영자 PC 채점 결과) */
  async function official(uid: string, days: Record<string, number>) {
    const byMonth = new Map<string, Record<string, number>>();
    for (const [day, points] of Object.entries(days)) {
      const key = day.replaceAll('-', '');
      byMonth.set(key.slice(0, 6), { ...(byMonth.get(key.slice(0, 6)) ?? {}), [key]: points });
    }
    for (const [month, map] of byMonth) await db.doc(`users/${uid}/officialMonth/${month}`).set({ days: map });
  }

  it('시작일 전에는 아무것도 하지 않는다', async () => {
    await user('alice');
    await squad('TEAMA2', [{ uid: 'alice' }]);
    expect((await runSquads({ db, now: at(2026, 12, 14) })).started).toBe(false);
    expect((await db.doc('squadLeague/2026-12-14').get()).exists).toBe(false);
  });

  it('정리: 탈퇴한 팀원·남의 팀 신청서를 지우고, 인원·감독·코치·닉네임을 맞춘다. 어른이 없으면 팀을 없앤다', async () => {
    for (const uid of ['alice', 'bob', 'carol', 'kid']) await user(uid);
    await squad('TEAMA2', [{ uid: 'gone' }, { uid: 'alice' }, { uid: 'kid', child: true }, { uid: 'bob' }], { coach: 'gone', size: 7 });
    await db.doc('users/alice').set({ nickname: '새닉' }, { merge: true });
    await db.doc('squads/TEAMA2/requests/carol').set({ nickname: 'carol닉', child: false, requestedAt: new Date() }); // carol은 다른 팀을 가리킴
    await db.doc('users/carol').set({ squad: 'TEAMB3' }, { merge: true });
    await squad('KIDSX2', [{ uid: 'gone2' }, { uid: 'kid2', child: true }]);
    await user('kid2', { guardianConsentAt: new Date(), squad: 'KIDSX2' });
    // 탈퇴한 회원 — 프로필이 없다(도우미가 만든 것을 지운다)
    await db.doc('users/gone').delete();
    await db.doc('users/gone2').delete();

    const report = await runSquads({ db, now: at(2026, 12, 15) });
    expect(report).toMatchObject({ started: true, squads: 1, removedMembers: 2, removedRequests: 1, removedSquads: 1, fixedSquads: 1 });
    const team = (await db.doc('squads/TEAMA2').get()).data()!;
    expect(team).toMatchObject({ size: 3, captain: 'alice', coach: null });
    expect((await db.doc('squads/TEAMA2/members/alice').get()).get('nickname')).toBe('새닉');
    expect((await db.doc('squads/TEAMA2/requests/carol').get()).exists).toBe(false);
    expect((await db.doc('squads/KIDSX2').get()).exists).toBe(false);
    expect((await db.doc('squads/KIDSX2/members/kid2').get()).exists).toBe(false);
  });

  it('리그: 이번 주 어제까지 상위 5명 평균, 참가 팀만 순위. 시작일 전 점수는 넣지 않는다', async () => {
    for (const uid of ['a1', 'a2', 'b1', 'c1']) await user(uid);
    await squad('TEAMA2', [{ uid: 'a1' }, { uid: 'a2' }]);
    await squad('TEAMB3', [{ uid: 'b1' }]);
    await squad('TEAMC4', [{ uid: 'c1' }]);
    await official('a1', { '2026-12-14': 999, '2026-12-15': 300, '2026-12-16': 200 });
    await official('a2', { '2026-12-15': 100 });
    await official('b1', { '2026-12-16': 450, '2026-12-17': 999 }); // 12-17은 오늘 — 넣지 않음

    await runSquads({ db, now: at(2026, 12, 17) });
    const league = (await db.doc('squadLeague/2026-12-14').get()).data()!;
    expect(league).toMatchObject({ week: '2026-12-14', from: '2026-12-15', through: '2026-12-16', final: false, count: 2 });
    expect(league.squads.map((row: { code: string; score: number; rank: number; players: number }) => [row.rank, row.code, row.score, row.players])).toEqual([
      [1, 'TEAMB3', 450, 1],
      [2, 'TEAMA2', 300, 2], // (500 + 100) / 2
    ]);
    const week = (await db.doc('squads/TEAMA2/weeks/2026-12-14').get()).data()!;
    expect(week).toMatchObject({ score: 300, rank: 2 });
    expect(week.members).toEqual([
      { nickname: 'a1닉', points: 500, days: 2 },
      { nickname: 'a2닉', points: 100, days: 1 },
    ]);
    expect((await db.doc('squads/TEAMC4/weeks/2026-12-14').get()).get('rank')).toBeNull();
  });

  it('월요일 0시: 지난주 확정 — 1~3위 팀 참가자 보너스 30·20·10P와 배지, 다시 돌려도 같다, 지갑에 더한다(등수 제외)', async () => {
    const codes = ['TEAMA2', 'TEAMB3', 'TEAMC4', 'TEAMD5'];
    for (const [index, code] of codes.entries()) {
      await user(`${code}x`);
      await user(`${code}y`);
      await squad(code, [{ uid: `${code}x` }, { uid: `${code}y` }]);
      await official(`${code}x`, { '2026-12-16': 400 - index * 100 });
    }
    // TEAMD5에 지난 배지가 있으면 지운다
    await db.doc('squads/TEAMD5').set({ badge: { week: '2026-12-07', rank: 1 } }, { merge: true });

    const report = await runSquads({ db, now: at(2026, 12, 21) });
    expect(report.finalized).toBe('2026-12-14');
    expect(report.rewarded).toBe(3);
    expect((await db.doc('squadLeague/2026-12-14').get()).get('final')).toBe(true);
    expect((await db.doc('users/TEAMA2x/meta/squads').get()).data()).toMatchObject({ bonus: 30, weeks: { '2026-12-14': 30 } });
    expect((await db.doc('users/TEAMC4x/meta/squads').get()).get('bonus')).toBe(10);
    expect((await db.doc('users/TEAMA2y/meta/squads').get()).exists).toBe(false); // 그 주에 안 푼 팀원
    expect((await db.doc('users/TEAMD5x/meta/squads').get()).exists).toBe(false); // 4위
    expect((await db.doc('squads/TEAMA2').get()).get('badge')).toEqual({ week: '2026-12-14', rank: 1 });
    expect((await db.doc('squads/TEAMD5').get()).get('badge')).toBeUndefined();

    const again = await runSquads({ db, now: at(2026, 12, 21) });
    expect(again.rewarded).toBe(0);
    expect((await db.doc('users/TEAMA2x/meta/squads').get()).get('bonus')).toBe(30);

    // 지갑: 출석 포인트 + 가입 축하 + 팀 보너스(월간 등수에는 넣지 않음)
    await runWallets({ db, now: at(2026, 12, 21) });
    const wallet = (await db.doc('users/TEAMA2x/wallet/main').get()).data()!;
    expect(wallet.earned).toBe(50 + 30);
    await runMonthly({ db, now: at(2026, 12, 21) });
    const board = (await db.doc('leaderboards/202612').get()).data();
    expect(JSON.stringify(board ?? {})).not.toMatch(/"points":(30|430)[,}]/);
    expect(JSON.stringify(board ?? {})).toContain('"points":400');
  });

  it('확정을 놓친 주는 다음 실행에서 확정한다', async () => {
    await user('a1');
    await squad('TEAMA2', [{ uid: 'a1' }]);
    await official('a1', { '2026-12-16': 300 });
    const report = await runSquads({ db, now: at(2026, 12, 22) }); // 월요일 실행을 놓치고 화요일
    expect(report.finalized).toBe('2026-12-14');
    expect((await db.doc('squadLeague/2026-12-14').get()).get('final')).toBe(true);
    expect((await db.doc('squadLeague/2026-12-21').get()).get('final')).toBe(false);
  });

  it('팀 이름 숨기기·다시 보이기 — 관리자 기록', async () => {
    await user('alice');
    await squad('TEAMA2', [{ uid: 'alice' }]);
    expect(await hideSquad({ db, code: 'TEAMA2' })).toMatchObject({ changed: true, hidden: true });
    expect((await db.doc('squads/TEAMA2').get()).get('hidden')).toBe(true);
    expect((await db.collection('adminLogs').where('action', '==', 'squad-hide').get()).size).toBe(1);
    expect(await hideSquad({ db, code: 'ZZZZZZ' })).toMatchObject({ changed: false });
  });

  it('월간 등수: 보호자 동의 계정은 익명 선수', async () => {
    await user('kid', { guardianConsentAt: new Date(), nickname: '막내둥이' });
    await db.doc('users/kid/attendance/202612').set({ days: [15, 16] });
    await runMonthly({ db, now: at(2026, 12, 17) });
    const board = JSON.stringify((await db.doc('leaderboards/202612').get()).data() ?? {});
    expect(board).not.toContain('막내둥이');
  });

  it('보호자 동의: 보낸 주소가 같을 때만 승인, 7일 지나면 계정·기록·로그인 삭제', async () => {
    const created = await auth.createUser({ uid: 'kid', email: 'kid@example.com', password: 'pw-123456' });
    expect(created.uid).toBe('kid');
    await db.doc('users/kid').set({ under14At: Timestamp.fromMillis(at(2026, 12, 15)), createdAt: Timestamp.fromMillis(at(2026, 12, 15)) });
    await db.doc('users/kid/private/guardian').set({ email: 'mom@example.com', code: 'ABC234', requestedAt: Timestamp.fromMillis(at(2026, 12, 15)) });
    await auth.createUser({ uid: 'kid2' });
    await db.doc('users/kid2').set({ under14At: Timestamp.fromMillis(at(2026, 12, 15)), createdAt: Timestamp.fromMillis(at(2026, 12, 15)) });
    await db.doc('users/kid2/private/guardian').set({ email: 'dad@example.com', code: 'XYZ789', requestedAt: Timestamp.fromMillis(at(2026, 12, 15)) });

    expect((await listGuardians({ db })).map((row) => row.code)).toEqual(['ABC234', 'XYZ789']);
    expect(await approveGuardian({ db, code: 'ABC234', email: 'someone@example.com', now: at(2026, 12, 16) })).toMatchObject({ approved: false });
    expect(await approveGuardian({ db, code: 'abc234', email: ' Mom@Example.com ', now: at(2026, 12, 16) })).toMatchObject({ approved: true, uid: 'kid' });
    const kid = (await db.doc('users/kid').get()).data()!;
    expect(kid.guardianConsentAt).toBeTruthy();
    expect(kid.guardianConsentVersion).toBe('2026-12-15');
    expect((await db.collection('adminLogs').where('action', '==', 'guardian-approve').get()).size).toBe(1);
    expect(await approveGuardian({ db, code: 'ABC234', email: 'mom@example.com', now: at(2026, 12, 16) })).toMatchObject({ approved: false }); // 이미 승인

    expect(await expireGuardians({ db, auth, now: at(2026, 12, 21) })).toMatchObject({ expired: 0 });
    expect(await expireGuardians({ db, auth, now: at(2026, 12, 23) })).toMatchObject({ expired: 1, deleted: 1 });
    expect((await db.doc('users/kid2').get()).exists).toBe(false);
    expect((await db.doc('users/kid2/private/guardian').get()).exists).toBe(false);
    await expect(auth.getUser('kid2')).rejects.toBeTruthy();
    expect((await db.doc('users/kid').get()).exists).toBe(true); // 동의 받은 계정은 그대로
  });
});
