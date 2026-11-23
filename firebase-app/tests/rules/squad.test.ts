import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc, Timestamp, updateDoc, writeBatch, type Firestore } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { emulatorHost, guest, member, seedConfirmedMember, startRulesEnv } from './setup';

/**
 * 팀(2단계)·팀 대항전(3단계)·보호자 동의(만 14세 미만) 규칙 — 한 묶음의 짝(인원·op·팀원 자리·신청서·내 팀 코드),
 * 한 사람 한 팀, 나간 뒤 7일, 감독·코치 권한, 자녀 계정은 가족팀만.
 */
const LOGO = { frame: 'shield', symbol: 'ball', primary: 'navy', secondary: 'gold', initials: 'YK' };
const A = 'TEAMA2';
const B = 'TEAMB3';
const F = 'FAMXLY';

describe.skipIf(!emulatorHost)('팀 규칙', () => {
  let env: RulesTestEnvironment;

  beforeAll(async () => {
    env = await startRulesEnv('squad');
  }, 60_000);
  beforeEach(async () => {
    await env.clearFirestore();
    for (const [uid, nickname] of [
      ['alice', '앨리스'],
      ['bob', '밥돌이'],
      ['dan', '댄댄'],
      ['erin', '에린이'],
    ]) {
      await seedConfirmedMember(env, uid!, { nickname });
    }
    // 보호자 동의를 받은 자녀 계정
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users/kid'), {
        under14At: Timestamp.now(),
        guardianConsentAt: Timestamp.now(),
        createdAt: Timestamp.now(),
        nickname: '막내둥이',
      });
    });
  });
  afterAll(async () => {
    await env.cleanup();
  });

  const create = (db: Firestore, uid: string, code: string, extra: object = {}, opts: { member?: boolean; pointer?: boolean } = {}) => {
    const batch = writeBatch(db);
    batch.set(doc(db, 'squads', code), {
      name: '동네 직관단',
      kind: 'friends',
      logo: LOGO,
      captain: uid,
      coach: null,
      size: 1,
      op: { uid, t: 'in' },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      ...extra,
    });
    if (opts.member !== false) batch.set(doc(db, 'squads', code, 'members', uid), { nickname: nickOf[uid] ?? uid, joinedAt: serverTimestamp(), child: false });
    if (opts.pointer !== false) batch.update(doc(db, 'users', uid), { squad: code, updatedAt: serverTimestamp() });
    return batch.commit();
  };
  const nickOf: Record<string, string> = { alice: '앨리스', bob: '밥돌이', dan: '댄댄', erin: '에린이', kid: '막내둥이' };

  const request = (db: Firestore, uid: string, code: string, child = false) => {
    const batch = writeBatch(db);
    batch.set(doc(db, 'squads', code, 'requests', uid), { nickname: nickOf[uid], child, requestedAt: serverTimestamp() });
    batch.update(doc(db, 'users', uid), { squad: code, updatedAt: serverTimestamp() });
    return batch.commit();
  };

  const approve = (db: Firestore, code: string, uid: string, size: number, child = false, opts: { deleteRequest?: boolean; nextSize?: number } = {}) => {
    const batch = writeBatch(db);
    batch.set(doc(db, 'squads', code, 'members', uid), { nickname: nickOf[uid], joinedAt: serverTimestamp(), child });
    if (opts.deleteRequest !== false) batch.delete(doc(db, 'squads', code, 'requests', uid));
    batch.update(doc(db, 'squads', code), { size: opts.nextSize ?? size + 1, op: { uid, t: 'in' }, updatedAt: serverTimestamp() });
    return batch.commit();
  };

  const leave = (db: Firestore, uid: string, code: string, size: number, change: object = {}, opts: { leftAt?: boolean } = {}) => {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'squads', code, 'members', uid));
    batch.update(doc(db, 'squads', code), { size: size - 1, op: { uid, t: 'out' }, updatedAt: serverTimestamp(), ...change });
    batch.update(doc(db, 'users', uid), { squad: null, ...(opts.leftAt === false ? {} : { squadLeftAt: serverTimestamp() }), updatedAt: serverTimestamp() });
    return batch.commit();
  };

  /** 앨리스 팀(A)에 밥이 들어온 상태 */
  async function aliceWithBob() {
    await assertSucceeds(create(member(env, 'alice'), 'alice', A));
    await assertSucceeds(request(member(env, 'bob'), 'bob', A));
    await assertSucceeds(approve(member(env, 'alice'), A, 'bob', 1));
  }

  it('만들기: 팀 + 감독 자리 + 내 팀 코드 한 묶음만', async () => {
    const db = member(env, 'alice');
    await assertFails(create(db, 'alice', A, {}, { member: false }));
    await assertFails(create(db, 'alice', A, {}, { pointer: false }));
    await assertFails(create(db, 'alice', A, { size: 2 }));
    await assertFails(create(db, 'alice', A, { captain: 'bob' }));
    await assertFails(create(db, 'alice', A, { logo: { ...LOGO, primary: 'gold' } })); // 주색 = 보조색
    await assertFails(create(db, 'alice', A, { logo: { ...LOGO, frame: 'heart' } }));
    await assertFails(create(db, 'alice', A, { name: '가' }));
    await assertFails(create(db, 'alice', A, { kind: 'school' }));
    await assertFails(create(db, 'alice', 'TEAM01')); // 0·1 금지
    await assertSucceeds(create(db, 'alice', A));
    await assertFails(create(db, 'alice', B)); // 이미 팀원 — 한 사람 한 팀
    await assertFails(create(member(env, 'bob'), 'bob', A)); // 이미 있는 코드
    await assertFails(create(member(env, 'kid'), 'kid', F, { kind: 'family' })); // 자녀 계정은 못 만든다
    await assertFails(create(guest(env, 'gus'), 'gus', B));
  });

  it('읽기: 팀 하나는 확인된 회원, 목록은 관리자만, 팀원 자리는 팀원끼리', async () => {
    await aliceWithBob();
    await assertSucceeds(getDoc(doc(member(env, 'dan'), 'squads', A)));
    await assertFails(getDocs(collection(member(env, 'dan'), 'squads')));
    await assertFails(getDoc(doc(guest(env, 'gus'), 'squads', A)));
    await assertSucceeds(getDocs(collection(member(env, 'bob'), 'squads', A, 'members')));
    await assertFails(getDocs(collection(member(env, 'dan'), 'squads', A, 'members')));
  });

  it('신청: 신청서 + 내 팀 코드, 내 닉네임으로. 자녀 계정은 가족팀에만', async () => {
    await assertSucceeds(create(member(env, 'alice'), 'alice', A));
    await assertSucceeds(create(member(env, 'erin'), 'erin', F, { kind: 'family' }));
    const bob = member(env, 'bob');
    await assertFails(setDoc(doc(bob, 'squads', A, 'requests', 'bob'), { nickname: '밥돌이', child: false, requestedAt: serverTimestamp() })); // 내 팀 코드 없이
    const wrongName = writeBatch(bob);
    wrongName.set(doc(bob, 'squads', A, 'requests', 'bob'), { nickname: '앨리스', child: false, requestedAt: serverTimestamp() });
    wrongName.update(doc(bob, 'users', 'bob'), { squad: A, updatedAt: serverTimestamp() });
    await assertFails(wrongName.commit());
    await assertFails(request(bob, 'bob', A, true)); // 자녀 표시를 속이기
    await assertSucceeds(request(bob, 'bob', A));
    await assertFails(request(member(env, 'kid'), 'kid', A, true)); // 친구팀
    await assertSucceeds(request(member(env, 'kid'), 'kid', F, true)); // 가족팀
    // 신청서는 본인·감독만 읽는다
    await assertSucceeds(getDoc(doc(member(env, 'alice'), 'squads', A, 'requests', 'bob')));
    await assertFails(getDoc(doc(member(env, 'dan'), 'squads', A, 'requests', 'bob')));
  });

  it('승인: 감독·코치만, 자리 + 신청서 지우기 + 인원 하나', async () => {
    await assertSucceeds(create(member(env, 'alice'), 'alice', A));
    await assertSucceeds(request(member(env, 'bob'), 'bob', A));
    await assertFails(approve(member(env, 'bob'), A, 'bob', 1)); // 본인이 승인
    await assertFails(approve(member(env, 'alice'), A, 'bob', 1, false, { deleteRequest: false }));
    await assertFails(approve(member(env, 'alice'), A, 'bob', 1, false, { nextSize: 3 }));
    await assertFails(approve(member(env, 'alice'), A, 'bob', 1, true)); // 자녀 표시가 신청서와 다름
    await assertFails(approve(member(env, 'alice'), A, 'dan', 1)); // 신청서 없음
    await assertSucceeds(approve(member(env, 'alice'), A, 'bob', 1));
    // 코치도 승인할 수 있다
    await assertSucceeds(updateDoc(doc(member(env, 'alice'), 'squads', A), { coach: 'bob', updatedAt: serverTimestamp() }));
    await assertSucceeds(request(member(env, 'dan'), 'dan', A));
    await assertSucceeds(approve(member(env, 'bob'), A, 'dan', 2));
  });

  it('9명이 넘으면 신청·승인이 막힌다', async () => {
    await assertSucceeds(create(member(env, 'alice'), 'alice', A));
    await env.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), 'squads', A), { size: 9 });
    });
    await assertFails(request(member(env, 'bob'), 'bob', A));
  });

  it('나가기: 자리 지우기 + 인원 하나 + 내 팀 코드 비우기 + 나간 시각. 그 뒤 7일 동안 다른 팀 못 감', async () => {
    await aliceWithBob();
    await assertSucceeds(create(member(env, 'dan'), 'dan', B));
    const bob = member(env, 'bob');
    await assertFails(updateDoc(doc(bob, 'users', 'bob'), { squad: B, updatedAt: serverTimestamp() })); // 팀원인데 코드만 바꾸기
    await assertFails(leave(bob, 'bob', A, 2, {}, { leftAt: false }));
    await assertFails(leave(bob, 'bob', A, 3)); // 인원이 안 맞음
    await assertSucceeds(leave(bob, 'bob', A, 2));
    await assertFails(request(bob, 'bob', B)); // 7일
    await env.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), 'users', 'bob'), { squadLeftAt: Timestamp.fromMillis(Date.now() - 8 * 86_400_000) });
    });
    await assertSucceeds(request(bob, 'bob', B));
  });

  it('내보내기는 감독만, 감독은 내보낼 수 없다', async () => {
    await aliceWithBob();
    const kick = (db: Firestore, uid: string) => {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'squads', A, 'members', uid));
      batch.update(doc(db, 'squads', A), { size: 1, op: { uid, t: 'out' }, updatedAt: serverTimestamp() });
      return batch.commit();
    };
    await assertFails(kick(member(env, 'bob'), 'alice'));
    await assertFails(kick(member(env, 'dan'), 'bob'));
    await assertSucceeds(kick(member(env, 'alice'), 'bob'));
    // 내보내진 사람은 자기 팀 코드를 비울 수 있다(나간 시각 없이)
    await assertSucceeds(updateDoc(doc(member(env, 'bob'), 'users', 'bob'), { squad: null, updatedAt: serverTimestamp() }));
  });

  it('감독이 나가면 어른 팀원에게 넘긴다(자녀 계정에는 못 넘김). 혼자면 팀을 없앤다', async () => {
    await assertSucceeds(create(member(env, 'alice'), 'alice', F, { kind: 'family' }));
    await assertSucceeds(request(member(env, 'kid'), 'kid', F, true));
    await assertSucceeds(approve(member(env, 'alice'), F, 'kid', 1, true));
    await assertSucceeds(request(member(env, 'bob'), 'bob', F));
    await assertSucceeds(approve(member(env, 'alice'), F, 'bob', 2));
    const alice = member(env, 'alice');
    await assertFails(leave(alice, 'alice', F, 3)); // 감독을 안 넘김
    await assertFails(leave(alice, 'alice', F, 3, { captain: 'kid' }));
    await assertFails(updateDoc(doc(alice, 'squads', F), { coach: 'kid', updatedAt: serverTimestamp() })); // 자녀는 코치 불가
    await assertSucceeds(leave(alice, 'alice', F, 3, { captain: 'bob' }));
    // 밥 혼자 남게 하고(자녀 내보내기) 나가면 팀이 없어진다
    const bob = member(env, 'bob');
    const kickKid = writeBatch(bob);
    kickKid.delete(doc(bob, 'squads', F, 'members', 'kid'));
    kickKid.update(doc(bob, 'squads', F), { size: 1, op: { uid: 'kid', t: 'out' }, updatedAt: serverTimestamp() });
    await assertSucceeds(kickKid.commit());
    const last = writeBatch(bob);
    last.delete(doc(bob, 'squads', F, 'members', 'bob'));
    last.delete(doc(bob, 'squads', F));
    last.update(doc(bob, 'users', 'bob'), { squad: null, squadLeftAt: serverTimestamp(), updatedAt: serverTimestamp() });
    await assertSucceeds(last.commit());
  });

  it('감독 일: 이름·로고·코치·감독 넘기기는 감독만, 종류·숨김·배지는 못 바꾼다', async () => {
    await aliceWithBob();
    const alice = member(env, 'alice');
    const edit = (db: Firestore, change: object) => updateDoc(doc(db, 'squads', A), { ...change, updatedAt: serverTimestamp() });
    await assertSucceeds(edit(alice, { name: '새 이름', logo: { ...LOGO, symbol: 'tiger', initials: '김' } }));
    await assertFails(edit(member(env, 'bob'), { name: '밥의 팀' }));
    await assertFails(edit(alice, { kind: 'family' }));
    await assertFails(edit(alice, { hidden: false }));
    await assertFails(edit(alice, { badge: { week: '2026-12-14', rank: 1 } }));
    await assertFails(edit(alice, { coach: 'dan' })); // 팀원 아님
    await assertFails(edit(alice, { coach: 'alice' })); // 감독이 코치
    await assertSucceeds(edit(alice, { captain: 'bob' }));
    await assertFails(edit(alice, { name: '되찾기' })); // 이제 감독 아님
  });

  it('리그 순위표는 확인된 회원이, 팀원 주간 기록은 팀원만 읽고, 아무도 못 쓴다', async () => {
    await aliceWithBob();
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'squadLeague/2026-12-14'), { week: '2026-12-14', squads: [] });
      await setDoc(doc(context.firestore(), 'squads', A, 'weeks', '2026-12-14'), { score: 100, members: [] });
    });
    await assertSucceeds(getDoc(doc(member(env, 'dan'), 'squadLeague/2026-12-14')));
    await assertFails(getDoc(doc(guest(env, 'gus'), 'squadLeague/2026-12-14')));
    await assertFails(setDoc(doc(member(env, 'alice'), 'squadLeague/2026-12-14'), { squads: [] }));
    await assertSucceeds(getDoc(doc(member(env, 'bob'), 'squads', A, 'weeks', '2026-12-14')));
    await assertFails(getDoc(doc(member(env, 'dan'), 'squads', A, 'weeks', '2026-12-14')));
    await assertFails(setDoc(doc(member(env, 'alice'), 'squads', A, 'weeks', '2026-12-14'), { score: 999 }));
  });
});

describe.skipIf(!emulatorHost)('팀 대항전 규칙', () => {
  let env: RulesTestEnvironment;
  beforeAll(async () => {
    env = await startRulesEnv('squad-room');
  }, 60_000);
  beforeEach(async () => {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      for (const [uid, squad] of [
        ['alice', A],
        ['bob', B],
        ['dan', 'TEAMC4'],
        ['erin', null],
      ] as const) {
        await setDoc(doc(db, `users/${uid}`), { ageConfirmedAt: Timestamp.now(), createdAt: Timestamp.now(), nickname: uid, squad });
        if (squad) {
          await setDoc(doc(db, 'squads', squad), { name: squad, kind: 'friends', logo: LOGO, captain: uid, coach: null, size: 1 });
          await setDoc(doc(db, 'squads', squad, 'members', uid), { nickname: uid, joinedAt: Timestamp.now(), child: false });
        }
      }
      // 팀 코드만 있고 팀원이 아닌 사람(신청 중)
      await setDoc(doc(db, 'users/erin'), { squad: A }, { merge: true });
    });
  });
  afterAll(async () => {
    await env.cleanup();
  });

  const room = (uid: string, extra: object = {}) => ({
    hostUid: uid,
    status: 'waiting',
    createdAt: serverTimestamp(),
    maxPlayers: 10,
    playerIds: [uid],
    questionIds: ['q1', 'q2', 'q3'],
    questionSeconds: 15,
    ...extra,
  });
  const seat = (nickname: string, squad?: string | null) => ({ nickname, joinedAt: serverTimestamp(), score: 0, answers: [], ...(squad !== undefined ? { squad } : {}) });

  const openRoom = (db: Firestore, uid: string, squad: string, roomExtra: object = {}, seatSquad: string | null | undefined = squad) => {
    const batch = writeBatch(db);
    batch.set(doc(db, 'rooms', 'ROOM22'), room(uid, { teamMatch: true, squads: [squad], ...roomExtra }));
    batch.set(doc(db, 'rooms', 'ROOM22', 'players', uid), seat(uid, seatSquad));
    return batch.commit();
  };

  const join = (db: Firestore, uid: string, squads: string[], seatSquad: string | null | undefined) => {
    const batch = writeBatch(db);
    batch.update(doc(db, 'rooms', 'ROOM22'), { playerIds: ['alice', uid], squads });
    batch.set(doc(db, 'rooms', 'ROOM22', 'players', uid), seat(uid, seatSquad));
    return batch.commit();
  };

  it('만들기: 방장이 그 팀 팀원일 때, 자리에 내 팀 코드', async () => {
    await assertFails(openRoom(member(env, 'erin'), 'erin', A)); // 신청 중(팀원 아님)
    await assertFails(openRoom(member(env, 'alice'), 'alice', B)); // 남의 팀
    await assertFails(openRoom(member(env, 'alice'), 'alice', A, {}, null));
    await assertFails(openRoom(member(env, 'alice'), 'alice', A, { squads: [A, B] }));
    await assertSucceeds(openRoom(member(env, 'alice'), 'alice', A));
  });

  it('참가: 두 번째 팀은 끝에 더하고, 세 번째 팀·비회원·팀원 아닌 사람은 못 들어온다', async () => {
    await assertSucceeds(openRoom(member(env, 'alice'), 'alice', A));
    await assertFails(join(member(env, 'bob'), 'bob', [A], B)); // 내 팀을 안 더함
    await assertFails(join(member(env, 'bob'), 'bob', [A, B], A)); // 자리에 남의 팀
    await assertSucceeds(join(member(env, 'bob'), 'bob', [A, B], B));
    const third = member(env, 'dan');
    const batch = writeBatch(third);
    batch.update(doc(third, 'rooms', 'ROOM22'), { playerIds: ['alice', 'bob', 'dan'], squads: [A, B, 'TEAMC4'] });
    batch.set(doc(third, 'rooms', 'ROOM22', 'players', 'dan'), seat('dan', 'TEAMC4'));
    await assertFails(batch.commit());
    const gus = guest(env, 'gus');
    const guestJoin = writeBatch(gus);
    guestJoin.update(doc(gus, 'rooms', 'ROOM22'), { playerIds: ['alice', 'bob', 'gus'] });
    guestJoin.set(doc(gus, 'rooms', 'ROOM22', 'players', 'gus'), seat('gus'));
    await assertFails(guestJoin.commit());
  });

  it('보통 방에는 팀 코드가 없다', async () => {
    const db = member(env, 'alice');
    const batch = writeBatch(db);
    batch.set(doc(db, 'rooms', 'ROOM33'), room('alice'));
    batch.set(doc(db, 'rooms', 'ROOM33', 'players', 'alice'), seat('alice', A));
    await assertFails(batch.commit());
  });
});

describe.skipIf(!emulatorHost)('보호자 동의 규칙(만 14세 미만)', () => {
  let env: RulesTestEnvironment;
  beforeAll(async () => {
    env = await startRulesEnv('guardian');
  }, 60_000);
  beforeEach(async () => {
    await env.clearFirestore();
  });
  afterAll(async () => {
    await env.cleanup();
  });

  const ask = (db: Firestore, uid: string, guardian: object | null = { email: 'mom@example.com', code: 'ABC234', requestedAt: serverTimestamp() }) => {
    const batch = writeBatch(db);
    batch.set(doc(db, 'users', uid), { under14At: serverTimestamp(), createdAt: serverTimestamp() });
    if (guardian) batch.set(doc(db, 'users', uid, 'private', 'guardian'), guardian);
    return batch.commit();
  };

  it('신청: 프로필(응답 시각) + 보호자 메일 주소·동의 코드 한 묶음, 동의는 기기가 못 쓴다', async () => {
    const kid = member(env, 'kid');
    await assertFails(ask(kid, 'kid', null));
    await assertFails(ask(kid, 'kid', { email: 'not-an-email', code: 'ABC234', requestedAt: serverTimestamp() }));
    await assertFails(ask(kid, 'kid', { email: 'mom@example.com', code: 'ABC234', requestedAt: serverTimestamp(), name: '엄마' }));
    await assertSucceeds(ask(kid, 'kid'));
    await assertFails(updateDoc(doc(kid, 'users', 'kid'), { guardianConsentAt: serverTimestamp(), updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(kid, 'users', 'kid', 'private', 'guardian'), { email: 'me@example.com' }));
    await assertFails(ask(guest(env, 'gus'), 'gus'));
  });

  it('동의 전: 기록·닉네임을 못 쓰고, 보호자 주소는 본인만 읽는다', async () => {
    await assertSucceeds(ask(member(env, 'kid'), 'kid'));
    const kid = member(env, 'kid');
    await assertFails(updateDoc(doc(kid, 'users', 'kid'), { nickname: '막내둥이', updatedAt: serverTimestamp() }));
    await assertSucceeds(getDoc(doc(kid, 'users', 'kid', 'private', 'guardian')));
    await assertFails(getDoc(doc(member(env, 'other'), 'users', 'kid', 'private', 'guardian')));
  });

  it('동의 뒤: 회원처럼 쓰되 초대 코드는 못 만든다', async () => {
    await assertSucceeds(ask(member(env, 'kid'), 'kid'));
    await env.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), 'users', 'kid'), { guardianConsentAt: Timestamp.now() });
    });
    const kid = member(env, 'kid');
    const name = writeBatch(kid);
    name.update(doc(kid, 'users', 'kid'), { nickname: '막내둥이', updatedAt: serverTimestamp() });
    name.set(doc(kid, 'nicknames', '막내둥이'), { uid: 'kid' });
    await assertSucceeds(name.commit());
    const invite = writeBatch(kid);
    invite.set(doc(kid, 'invites', 'KXDZZ2'), { uid: 'kid', createdAt: serverTimestamp() });
    invite.update(doc(kid, 'users', 'kid'), { inviteCode: 'KXDZZ2', updatedAt: serverTimestamp() });
    await assertFails(invite.commit());
  });
});
