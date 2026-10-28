import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { arrayUnion, deleteDoc, doc, getDoc, increment, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { kstDayOfMonth, kstMonthKey, previousMonth } from '@/lib/game/attendance';
import { emulatorHost, guest, member, seedConfirmedMember, startRulesEnv } from './setup';

/** 매일 출석·이번 달 연습 점수·칭호·월간 등수(docs/engagement-plan.md) */
describe.skipIf(!emulatorHost)('출석·월간 등수 규칙', () => {
  let env: RulesTestEnvironment;
  const month = kstMonthKey();
  const today = kstDayOfMonth();
  const otherDay = today === 1 ? 2 : today - 1;

  beforeAll(async () => {
    env = await startRulesEnv('engagement');
  });
  beforeEach(async () => {
    await env.clearFirestore();
    await seedConfirmedMember(env, 'alice');
  });
  afterAll(async () => {
    await env.cleanup();
  });

  const seed = (path: string, data: object) =>
    env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), path), data);
    });
  const stamp = (db: ReturnType<typeof member>, uid = 'alice', m = month) =>
    setDoc(doc(db, `users/${uid}/attendance/${m}`), { days: arrayUnion(today), updatedAt: serverTimestamp() }, { merge: true });

  describe('출석 도장', () => {
    it('확인 회원은 오늘(서버 기준) 하나를 찍고, 같은 날 두 번은 안 된다', async () => {
      const db = member(env, 'alice');
      await assertSucceeds(stamp(db));
      await assertFails(stamp(db)); // 이미 있는 날 — 목록이 그대로라 거절
      await assertFails(
        setDoc(doc(db, `users/alice/attendance/${month}`), { days: [today, today], updatedAt: serverTimestamp() }),
      );
    });

    it('이전 날 뒤에 오늘을 붙인다 — 다른 날을 붙이거나 목록을 바꾸면 거절', async () => {
      await seed(`users/alice/attendance/${month}`, { days: [otherDay], updatedAt: new Date() });
      const db = member(env, 'alice');
      await assertFails(
        updateDoc(doc(db, `users/alice/attendance/${month}`), { days: [otherDay, otherDay === 2 ? 3 : 2], updatedAt: serverTimestamp() }),
      );
      await assertFails(updateDoc(doc(db, `users/alice/attendance/${month}`), { days: [today], updatedAt: serverTimestamp() }));
      await assertSucceeds(stamp(db));
    });

    it('어제·다른 달 문서, 기기 시각, 다른 필드는 거절', async () => {
      const db = member(env, 'alice');
      await assertFails(setDoc(doc(db, `users/alice/attendance/${month}`), { days: [otherDay], updatedAt: serverTimestamp() }));
      await assertFails(stamp(db, 'alice', previousMonth(month)));
      await assertFails(setDoc(doc(db, `users/alice/attendance/${month}`), { days: [today], updatedAt: new Date() }));
      await assertFails(
        setDoc(doc(db, `users/alice/attendance/${month}`), { days: [today], updatedAt: serverTimestamp(), points: 999 }),
      );
    });

    it('비회원·확인 전 회원·남의 문서는 거절, 본인만 읽고 지운다', async () => {
      await assertFails(stamp(guest(env, 'gus'), 'gus'));
      await assertFails(stamp(member(env, 'newbie'), 'newbie'));
      await assertFails(stamp(member(env, 'bob'), 'alice'));
      await assertSucceeds(stamp(member(env, 'alice')));
      await assertFails(getDoc(doc(member(env, 'bob'), `users/alice/attendance/${month}`)));
      await assertSucceeds(getDoc(doc(member(env, 'alice'), `users/alice/attendance/${month}`)));
      await assertSucceeds(deleteDoc(doc(member(env, 'alice'), `users/alice/attendance/${month}`)));
    });
  });

  describe('이번 달 연습 점수(비공식)', () => {
    const add = (db: ReturnType<typeof member>, uid: string, xp: number, m = month) =>
      setDoc(doc(db, `users/${uid}/monthly/${m}`), { games: increment(1), xp: increment(xp), updatedAt: serverTimestamp() }, { merge: true });

    it('경기마다 1판씩, 이번 달 문서만 — 회원·비회원 모두', async () => {
      const db = member(env, 'alice');
      await assertSucceeds(add(db, 'alice', 80));
      await assertSucceeds(add(db, 'alice', 40));
      await assertFails(add(db, 'alice', 40, previousMonth(month)));
      await assertSucceeds(add(guest(env, 'gus'), 'gus', 60));
    });

    it('판 수를 건너뛰거나 점수를 줄이면 거절', async () => {
      await seed(`users/alice/monthly/${month}`, { games: 3, xp: 200, updatedAt: new Date() });
      const db = member(env, 'alice');
      await assertFails(updateDoc(doc(db, `users/alice/monthly/${month}`), { games: 5, xp: 300, updatedAt: serverTimestamp() }));
      await assertFails(updateDoc(doc(db, `users/alice/monthly/${month}`), { games: 4, xp: 100, updatedAt: serverTimestamp() }));
      await assertSucceeds(updateDoc(doc(db, `users/alice/monthly/${month}`), { games: 4, xp: 260, updatedAt: serverTimestamp() }));
    });
  });

  describe('칭호·등수 — 운영자 PC만 쓴다', () => {
    it('칭호는 본인만 읽고 지울 수 있고, 아무도 쓸 수 없다', async () => {
      await seed(`users/alice/awards/${month}`, { month, rank: 1, titles: ['king'] });
      await assertSucceeds(getDoc(doc(member(env, 'alice'), `users/alice/awards/${month}`)));
      await assertFails(getDoc(doc(member(env, 'bob'), `users/alice/awards/${month}`)));
      await assertFails(setDoc(doc(member(env, 'alice'), `users/alice/awards/next`), { rank: 1 }));
      await assertSucceeds(deleteDoc(doc(member(env, 'alice'), `users/alice/awards/${month}`)));
    });

    it('등수 문서는 로그인한 누구나 읽고(비회원 포함), 아무도 쓰지 못한다. uid 목록은 아무도 못 읽는다', async () => {
      await seed(`leaderboards/${month}`, { month, top: [] });
      await seed(`leaderboardKeys/${month}`, { uids: ['alice'] });
      await assertSucceeds(getDoc(doc(member(env, 'alice'), `leaderboards/${month}`)));
      await assertSucceeds(getDoc(doc(guest(env, 'gus'), `leaderboards/${month}`)));
      await assertFails(getDoc(doc(env.unauthenticatedContext().firestore() as never, `leaderboards/${month}`)));
      await assertFails(setDoc(doc(member(env, 'alice'), `leaderboards/${month}`), { month, top: [] }));
      await assertFails(getDoc(doc(member(env, 'alice'), `leaderboardKeys/${month}`)));
    });

    it('이벤트 설정(출석 2배 날): 관리자만 읽고 쓰고, 공식전 현황(운영자 PC)은 못 바꾼다', async () => {
      const admin = env
        .authenticatedContext('boss', { admin: true, email_verified: true, firebase: { sign_in_provider: 'google.com' as never } })
        .firestore() as unknown as ReturnType<typeof member>;
      const events = (db: ReturnType<typeof member>, data: object) =>
        setDoc(doc(db, 'adminConfig/events'), { updatedAt: serverTimestamp(), by: 'boss', ...data }, { merge: true });
      await assertSucceeds(events(admin, { doubleDays: ['2026-11-20'] }));
      await assertSucceeds(getDoc(doc(admin, 'adminConfig/events')));
      await assertFails(events(member(env, 'alice'), { doubleDays: ['2026-11-21'] }));
      await assertFails(getDoc(doc(member(env, 'alice'), 'adminConfig/events')));
      await assertFails(events(admin, { doubleDays: '2026-11-20' })); // 목록만
      await assertFails(events(admin, { doubleDays: [], official: { remaining: 999 } }));
      await assertFails(events(admin, { doubleDays: [], by: 'someone' }));
      await assertFails(setDoc(doc(admin, 'adminConfig/other'), { doubleDays: [], updatedAt: serverTimestamp(), by: 'boss' }));
      // 운영자 PC가 공식전 현황을 쓴 뒤에도 관리자는 2배 날만 고칠 수 있다
      await seed('adminConfig/events', { doubleDays: [], official: { remaining: 10 }, updatedAt: new Date(), by: 'boss' });
      await assertSucceeds(events(admin, { doubleDays: ['2026-11-22'] }));
    });

    it('닉네임 숨기기는 참·거짓만', async () => {
      const db = member(env, 'alice');
      await assertSucceeds(updateDoc(doc(db, 'users/alice'), { rankingHidden: true, updatedAt: serverTimestamp() }));
      await assertFails(updateDoc(doc(db, 'users/alice'), { rankingHidden: 'yes', updatedAt: serverTimestamp() }));
    });
  });
});
