import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { arrayUnion, doc, setDoc, Timestamp, updateDoc, writeBatch, type Firestore } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { emulatorHost, guest, member, now, seedConfirmedMember, startRulesEnv } from './setup';

/** 비공식 친구 대결 방 (5단계가 쓴다). 방 코드가 문서 ID다. */
describe.skipIf(!emulatorHost)('친구 대결 방 규칙', () => {
  let env: RulesTestEnvironment;

  beforeAll(async () => {
    env = await startRulesEnv('rooms');
  });
  beforeEach(async () => {
    await env.clearFirestore();
    await seedConfirmedMember(env, 'host');
    await seedConfirmedMember(env, 'p2');
  });
  afterAll(async () => {
    await env.cleanup();
  });

  const CODE = 'ABC234';

  const room = (overrides: object = {}) => ({
    hostUid: 'host',
    status: 'waiting',
    createdAt: now(),
    maxPlayers: 3,
    playerIds: ['host'],
    questionIds: ['q000000000001', 'q000000000002', 'q000000000003'],
    questionSeconds: 15,
    ...overrides,
  });

  const seat = (nickname: string) => ({ nickname, joinedAt: now(), score: 0, answers: [] });

  /** 방 만들기 = 방 + 방장 자리 */
  function createRoom(db: Firestore, overrides: object = {}) {
    const batch = writeBatch(db);
    batch.set(doc(db, `rooms/${CODE}`), room(overrides));
    batch.set(doc(db, `rooms/${CODE}/players/host`), seat('방장'));
    return batch.commit();
  }

  /** 참가 = 방 명단에 자기를 더하기 + 자기 자리 */
  function join(db: Firestore, uid: string) {
    const batch = writeBatch(db);
    batch.update(doc(db, `rooms/${CODE}`), { playerIds: arrayUnion(uid) });
    batch.set(doc(db, `rooms/${CODE}/players/${uid}`), seat(uid));
    return batch.commit();
  }

  it('방장이 방을 만들고 자기 자리를 잡는다', async () => {
    await assertSucceeds(createRoom(member(env, 'host')));
  });

  it('같은 코드의 방이 있으면 새로 만들 수 없다(덮어쓰기 금지)', async () => {
    await assertSucceeds(createRoom(member(env, 'host')));
    await assertFails(setDoc(doc(member(env, 'p2'), `rooms/${CODE}`), room({ hostUid: 'p2', playerIds: ['p2'] })));
  });

  it('코드 형식·인원·문항 수·제한 시간이 범위를 벗어나면 거절한다', async () => {
    const db = member(env, 'host');
    await assertFails(setDoc(doc(db, 'rooms/abc'), room()));
    await assertFails(setDoc(doc(db, `rooms/${CODE}`), room({ maxPlayers: 11 })));
    await assertFails(setDoc(doc(db, `rooms/${CODE}`), room({ questionIds: ['q1'] })));
    await assertFails(setDoc(doc(db, `rooms/${CODE}`), room({ questionSeconds: 60 })));
    await assertFails(setDoc(doc(db, `rooms/${CODE}`), room({ status: 'playing' })));
  });

  it('비회원도 참가할 수 있고, 정원을 넘으면 막힌다', async () => {
    await assertSucceeds(createRoom(member(env, 'host')));
    await assertSucceeds(join(member(env, 'p2'), 'p2'));
    await assertSucceeds(join(guest(env, 'g1'), 'g1'));
    await assertFails(join(guest(env, 'g2'), 'g2'));
  });

  it('남을 대신 넣거나, 명단 없이 자리만 만들 수 없다', async () => {
    await assertSucceeds(createRoom(member(env, 'host')));
    await assertFails(updateDoc(doc(member(env, 'p2'), `rooms/${CODE}`), { playerIds: ['host', 'someone'] }));
    await assertFails(setDoc(doc(member(env, 'p2'), `rooms/${CODE}/players/p2`), seat('p2')));
  });

  it('방장만 시작·종료하고, 2명 이상이어야 시작한다', async () => {
    const hostDb = member(env, 'host');
    await assertSucceeds(createRoom(hostDb));
    await assertFails(updateDoc(doc(hostDb, `rooms/${CODE}`), { status: 'playing', startedAt: now() }));

    await assertSucceeds(join(member(env, 'p2'), 'p2'));
    await assertFails(updateDoc(doc(member(env, 'p2'), `rooms/${CODE}`), { status: 'playing', startedAt: now() }));
    await assertFails(updateDoc(doc(hostDb, `rooms/${CODE}`), { status: 'playing', startedAt: Timestamp.fromMillis(0) }));
    await assertSucceeds(updateDoc(doc(hostDb, `rooms/${CODE}`), { status: 'playing', startedAt: now() }));

    await assertFails(join(guest(env, 'late'), 'late')); // 시작한 방에는 못 들어온다
    await assertSucceeds(updateDoc(doc(hostDb, `rooms/${CODE}`), { status: 'finished', finishedAt: now() }));
  });

  it('경기 중에 답은 자기 자리에 하나씩만 더한다', async () => {
    const hostDb = member(env, 'host');
    await assertSucceeds(createRoom(hostDb));
    const p2 = member(env, 'p2');
    await assertSucceeds(join(p2, 'p2'));

    const answer = (answers: object[], score: number) =>
      updateDoc(doc(p2, `rooms/${CODE}/players/p2`), { answers, score, updatedAt: now() });

    await assertFails(answer([{ c: 'A' }], 100)); // 시작 전
    await assertSucceeds(updateDoc(doc(hostDb, `rooms/${CODE}`), { status: 'playing', startedAt: now() }));

    await assertSucceeds(answer([{ c: 'A' }], 100));
    await assertFails(answer([{ c: 'A' }, { c: 'B' }, { c: 'C' }], 300)); // 몰아 쓰기
    await assertFails(
      updateDoc(doc(member(env, 'host'), `rooms/${CODE}/players/p2`), {
        answers: [{ c: 'A' }, { c: 'B' }],
        score: 0,
        updatedAt: now(),
      }),
    ); // 남의 자리
  });

  it('로그인하지 않으면 방을 볼 수도 만들 수도 없다', async () => {
    const anonymous = env.unauthenticatedContext().firestore();
    await assertFails(setDoc(doc(anonymous, `rooms/${CODE}`), room()));
  });
});
