import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import {
  doc,
  getDoc,
  increment,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { GUEST_DAILY_GAMES } from '@/lib/game/guestLimit';
import { emulatorHost, guest, kstDayKey, member, now, seedConfirmedMember, startRulesEnv } from './setup';

/** 경기 기록·비회원 하루 제한·누적 기록·오답노트 (4단계가 쓴다). */
describe.skipIf(!emulatorHost)('기록 규칙', () => {
  let env: RulesTestEnvironment;

  beforeAll(async () => {
    env = await startRulesEnv('records');
  });
  beforeEach(async () => {
    await env.clearFirestore();
    await seedConfirmedMember(env, 'alice');
  });
  afterAll(async () => {
    await env.cleanup();
  });

  const game = (overrides: object = {}) => ({
    mode: 'practice',
    createdAt: now(),
    innings: 1,
    runs: 2,
    pa: 3,
    atBats: [{ r: 'HR' }, { r: 'K' }, { r: '1B' }],
    ...overrides,
  });

  /** 비회원 경기 = 경기 + 오늘 카운터 +1 을 한 묶음으로 */
  async function guestGame(db: Firestore, uid: string, id: string) {
    const dayRef = doc(db, `users/${uid}/daily/${kstDayKey()}`);
    const current = await getDoc(dayRef);
    const batch = writeBatch(db);
    batch.set(doc(db, `users/${uid}/games/${id}`), game());
    batch.set(dayRef, { count: (current.exists() ? (current.get('count') as number) : 0) + 1 });
    return batch.commit();
  }

  describe('개인 경기', () => {
    it('확인을 마친 회원은 경기를 남긴다(제한 없음)', async () => {
      const db = member(env, 'alice');
      for (const id of ['g1', 'g2', 'g3']) {
        await assertSucceeds(setDoc(doc(db, `users/alice/games/${id}`), game()));
      }
    });

    it('만 14세 확인 전 회원은 못 남긴다', async () => {
      await assertFails(setDoc(doc(member(env, 'nobody'), 'users/nobody/games/g1'), game()));
    });

    it('남의 기록에는 못 쓰고 못 읽는다', async () => {
      await seedConfirmedMember(env, 'mallory');
      await assertFails(setDoc(doc(member(env, 'mallory'), 'users/alice/games/g1'), game()));
      await assertSucceeds(setDoc(doc(member(env, 'alice'), 'users/alice/games/g1'), game()));
      await assertFails(getDoc(doc(member(env, 'mallory'), 'users/alice/games/g1')));
    });

    it('한 번 남긴 경기는 고칠 수 없다', async () => {
      const db = member(env, 'alice');
      await assertSucceeds(setDoc(doc(db, 'users/alice/games/g1'), game()));
      await assertFails(updateDoc(doc(db, 'users/alice/games/g1'), { runs: 99 }));
    });

    it('모양이 어긋나면 거절한다 — 시각·범위·타석 수', async () => {
      const db = member(env, 'alice');
      await assertFails(setDoc(doc(db, 'users/alice/games/a'), game({ createdAt: Timestamp.fromMillis(0) })));
      await assertFails(setDoc(doc(db, 'users/alice/games/b'), game({ runs: 100 })));
      await assertFails(setDoc(doc(db, 'users/alice/games/c'), game({ pa: 5 })));
      await assertFails(setDoc(doc(db, 'users/alice/games/d'), game({ mode: 'official' })));
      await assertFails(setDoc(doc(db, 'users/alice/games/e'), game({ xp: 1000 })));
    });
  });

  describe(`비회원 하루 ${GUEST_DAILY_GAMES}경기`, () => {
    it(`카운터와 함께 ${GUEST_DAILY_GAMES}경기까지 남기고 그다음은 막는다`, async () => {
      const db = guest(env, 'anon');
      for (let game = 1; game <= GUEST_DAILY_GAMES; game++) await assertSucceeds(guestGame(db, 'anon', `g${game}`));
      await assertFails(guestGame(db, 'anon', 'over'));
    });

    it('카운터를 올리지 않고 경기만 남기면 거절한다', async () => {
      await assertFails(setDoc(doc(guest(env, 'anon'), 'users/anon/games/g1'), game()));
    });

    it('다른 날짜의 카운터로 우회할 수 없다', async () => {
      const db = guest(env, 'anon');
      await assertFails(setDoc(doc(db, 'users/anon/daily/1'), { count: 1 }));
    });

    it('카운터를 거꾸로 돌리거나 건너뛸 수 없다', async () => {
      const db = guest(env, 'anon');
      await assertSucceeds(guestGame(db, 'anon', 'g1'));
      await assertFails(updateDoc(doc(db, `users/anon/daily/${kstDayKey()}`), { count: 0 }));
    });
  });

  describe('누적 기록(비공식)', () => {
    const summary = (overrides: object = {}) => ({
      games: 1,
      pa: 4,
      ab: 3,
      h: 2,
      hr: 1,
      bb: 1,
      so: 1,
      runs: 2,
      xp: 30,
      updatedAt: now(),
      ...overrides,
    });

    it('경기마다 한 번씩 늘린다', async () => {
      const db = member(env, 'alice');
      await assertSucceeds(setDoc(doc(db, 'users/alice/summary/main'), summary()));
      await assertSucceeds(setDoc(doc(db, 'users/alice/summary/main'), summary({ games: 2 })));
      await assertFails(setDoc(doc(db, 'users/alice/summary/main'), summary({ games: 10 })));
    });

    it('앞뒤가 안 맞는 숫자는 거절한다', async () => {
      const db = member(env, 'alice');
      await assertFails(setDoc(doc(db, 'users/alice/summary/main'), summary({ h: 5, ab: 3 })));
      await assertFails(setDoc(doc(db, 'users/alice/summary/main'), summary({ hr: 3, h: 2 })));
      await assertFails(setDoc(doc(db, 'users/alice/summary/other'), summary()));
    });
  });

  describe('오답노트', () => {
    const note = (questionId: string, overrides: object = {}) => ({
      questionId,
      wrongCount: 1,
      lastWrongAt: now(),
      stage: 0,
      nextReviewAt: Timestamp.fromMillis(Date.now() + 86_400_000),
      mastered: false,
      ...overrides,
    });

    it('비회원도 남길 수 있다(가입하면 그대로 이어진다)', async () => {
      const db = guest(env, 'anon');
      await assertSucceeds(setDoc(doc(db, 'users/anon/wrongNotes/q0123456789ab'), note('q0123456789ab')));
    });

    it('문서 ID와 문항 ID가 같아야 하고, 단계는 0~4', async () => {
      const db = member(env, 'alice');
      await assertFails(setDoc(doc(db, 'users/alice/wrongNotes/q0123456789ab'), note('q000000000000')));
      await assertFails(setDoc(doc(db, 'users/alice/wrongNotes/q0123456789ab'), note('q0123456789ab', { stage: 5 })));
      await assertFails(setDoc(doc(db, 'users/alice/wrongNotes/not-a-question'), note('not-a-question')));
    });

    it('미래 시각으로 틀렸다고 적을 수 없다', async () => {
      const db = member(env, 'alice');
      await assertFails(
        setDoc(
          doc(db, 'users/alice/wrongNotes/q0123456789ab'),
          note('q0123456789ab', { lastWrongAt: Timestamp.fromMillis(Date.now() + 3_600_000) }),
        ),
      );
    });
  });

  describe('읽지 않는 저장 — 증가 연산(6단계)', () => {
    /** 앱이 실제로 쓰는 묶음: 경기 + 누적(증가) + 카운터(증가) + 오답(증가). 읽기 없이 */
    function savedGame(db: Firestore, uid: string, id: string, wrongId = 'q0123456789ab') {
      const batch = writeBatch(db);
      batch.set(doc(db, `users/${uid}/games/${id}`), game());
      const counters = { games: increment(1), pa: increment(3), ab: increment(3), h: increment(2), hr: increment(1) };
      batch.set(
        doc(db, `users/${uid}/summary/main`),
        { ...counters, bb: increment(0), so: increment(1), runs: increment(2), xp: increment(30), updatedAt: serverTimestamp() },
        { merge: true },
      );
      if (uid !== 'alice') batch.set(doc(db, `users/${uid}/daily/${kstDayKey()}`), { count: increment(1) }, { merge: true });
      batch.set(
        doc(db, `users/${uid}/wrongNotes/${wrongId}`),
        {
          questionId: wrongId,
          wrongCount: increment(1),
          lastWrongAt: serverTimestamp(),
          stage: 0,
          nextReviewAt: Timestamp.fromMillis(Date.now() + 86_400_000),
          mastered: false,
        },
        { merge: true },
      );
      return batch.commit();
    }

    it(`비회원: 증가 연산으로도 하루 ${GUEST_DAILY_GAMES}경기까지, 그다음은 막힌다`, async () => {
      const db = guest(env, 'anon');
      for (let game = 1; game <= GUEST_DAILY_GAMES; game++) await assertSucceeds(savedGame(db, 'anon', `g${game}`));
      await assertFails(savedGame(db, 'anon', 'over'));
    });

    it('회원: 누적·오답 횟수가 서버에서 올라간다', async () => {
      const db = member(env, 'alice');
      await assertSucceeds(savedGame(db, 'alice', 'g1'));
      await assertSucceeds(savedGame(db, 'alice', 'g2'));
      const summary = await getDoc(doc(db, 'users/alice/summary/main'));
      const note = await getDoc(doc(db, 'users/alice/wrongNotes/q0123456789ab'));
      expect([summary.get('games'), summary.get('h'), note.get('wrongCount')]).toEqual([2, 4, 2]);
    });

    it('증가 연산으로 경기 수를 2씩 올리거나 안타를 타수보다 많게 할 수 없다', async () => {
      const db = member(env, 'alice');
      await assertSucceeds(savedGame(db, 'alice', 'g1'));
      await assertFails(
        setDoc(doc(db, 'users/alice/summary/main'), { games: increment(2), updatedAt: serverTimestamp() }, { merge: true }),
      );
      await assertFails(
        setDoc(
          doc(db, 'users/alice/summary/main'),
          { games: increment(1), h: increment(5), updatedAt: serverTimestamp() },
          { merge: true },
        ),
      );
    });

    it('오답노트에 없어진 필드(처음 틀린 시각)는 받지 않는다', async () => {
      const db = member(env, 'alice');
      await assertFails(
        setDoc(doc(db, 'users/alice/wrongNotes/q0123456789ab'), {
          questionId: 'q0123456789ab',
          wrongCount: 1,
          firstWrongAt: now(),
          lastWrongAt: now(),
          stage: 0,
          nextReviewAt: now(),
          mastered: false,
        }),
      );
    });
  });
});
