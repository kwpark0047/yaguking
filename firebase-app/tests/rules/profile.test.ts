import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, Timestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { emulatorHost, member, now, seedConfirmedMember, startRulesEnv } from './setup';

/** 회원 프로필 갱신 — 닉네임 예약, 최애 구단·선수, 최초 레벨 테스트(3·4단계가 쓴다). */
describe.skipIf(!emulatorHost)('프로필 갱신 규칙', () => {
  let env: RulesTestEnvironment;

  beforeAll(async () => {
    env = await startRulesEnv('profile');
  });
  beforeEach(async () => {
    await env.clearFirestore();
    await seedConfirmedMember(env, 'alice');
  });
  afterAll(async () => {
    await env.cleanup();
  });

  /** 닉네임 바꾸기 = 프로필 갱신 + 예약 문서를 한 묶음으로 */
  function setNickname(db: ReturnType<typeof member>, uid: string, nickname: string) {
    const batch = writeBatch(db);
    batch.update(doc(db, `users/${uid}`), { nickname, updatedAt: now() });
    batch.set(doc(db, `nicknames/${nickname.toLowerCase()}`), { uid });
    return batch.commit();
  }

  describe('닉네임', () => {
    it('예약과 함께 바꾸면 된다', async () => {
      await assertSucceeds(setNickname(member(env, 'alice'), 'alice', '빠른중견수12'));
    });

    it('예약 없이 프로필만 바꾸면 거절한다', async () => {
      const db = member(env, 'alice');
      await assertFails(updateDoc(doc(db, 'users/alice'), { nickname: '빠른중견수12', updatedAt: now() }));
    });

    it('남이 쓰는 닉네임은 대소문자가 달라도 못 쓴다', async () => {
      await seedConfirmedMember(env, 'bob');
      await assertSucceeds(setNickname(member(env, 'bob'), 'bob', 'Slugger'));
      await assertFails(setNickname(member(env, 'alice'), 'alice', 'slugger'));
      await assertFails(setNickname(member(env, 'alice'), 'alice', 'SLUGGER'));
    });

    it('짧거나 길거나 앞뒤 공백이 있으면 거절한다', async () => {
      const db = member(env, 'alice');
      await assertFails(setNickname(db, 'alice', '가'));
      await assertFails(setNickname(db, 'alice', '가'.repeat(17)));
      await assertFails(setNickname(db, 'alice', ' 공백앞'));
    });

    it('남의 예약은 지울 수 없고, 자기 예약은 지울 수 있다', async () => {
      await assertSucceeds(setNickname(member(env, 'alice'), 'alice', '앨리스'));
      await seedConfirmedMember(env, 'bob');
      await assertFails(deleteDoc(doc(member(env, 'bob'), 'nicknames/앨리스')));
      await assertSucceeds(deleteDoc(doc(member(env, 'alice'), 'nicknames/앨리스')));
    });

    it('만 14세 확인 전 회원은 닉네임을 예약할 수 없다', async () => {
      await env.withSecurityRulesDisabled(async (context) => {
        const { setDoc } = await import('firebase/firestore');
        await setDoc(doc(context.firestore(), 'users/carol'), { createdAt: Timestamp.now() });
      });
      await assertFails(setNickname(member(env, 'carol'), 'carol', '캐럴'));
    });
  });

  describe('최애 구단·선수', () => {
    const update = (data: object) =>
      updateDoc(doc(member(env, 'alice'), 'users/alice'), { ...data, updatedAt: now() });

    it('구단 1~3개, 실제 구단만, 중복 없이', async () => {
      await assertSucceeds(update({ favoriteTeams: ['lg'] }));
      await assertSucceeds(update({ favoriteTeams: ['lg', 'kia', 'hanwha'] }));
      await assertFails(update({ favoriteTeams: [] }));
      await assertFails(update({ favoriteTeams: ['lg', 'kia', 'nc', 'kt'] }));
      await assertFails(update({ favoriteTeams: ['lg', 'lg'] }));
      await assertFails(update({ favoriteTeams: ['lg', 'yankees'] }));
    });

    it('선수는 자유 입력 0~3명, 각 1~20자', async () => {
      await assertSucceeds(update({ favoritePlayers: [] }));
      await assertSucceeds(update({ favoritePlayers: ['홍길동', '김야구'] }));
      await assertFails(update({ favoritePlayers: ['a', 'b', 'c', 'd'] }));
      await assertFails(update({ favoritePlayers: ['가'.repeat(21)] }));
      await assertFails(update({ favoritePlayers: [''] }));
    });

    it('갱신 시각은 서버 시각이어야 한다', async () => {
      await assertFails(
        updateDoc(doc(member(env, 'alice'), 'users/alice'), {
          favoriteTeams: ['lg'],
          updatedAt: Timestamp.fromMillis(0),
        }),
      );
    });

    it('정해지지 않은 필드(레벨·XP 등)는 고칠 수 없다', async () => {
      await assertFails(update({ level: 7 }));
      await assertFails(update({ ageConfirmedAt: now() }));
    });
  });

  describe('최초 레벨 테스트', () => {
    const levelTest = (overrides: object = {}) => ({
      completedAt: now(),
      correct: 14,
      total: 20,
      tier: 4,
      byCategory: { rules: 4 },
      ...overrides,
    });
    const update = (test: object) =>
      updateDoc(doc(member(env, 'alice'), 'users/alice'), { levelTest: test, updatedAt: now() });

    it('한 번 남길 수 있고, 다시는 바꿀 수 없다', async () => {
      await assertSucceeds(update(levelTest()));
      await assertFails(update(levelTest({ correct: 20, tier: 7 })));
    });

    it('맞힌 수가 문항 수보다 많거나 등급이 범위 밖이면 거절한다', async () => {
      await assertFails(update(levelTest({ correct: 21 })));
      await assertFails(update(levelTest({ tier: 8 })));
      await assertFails(update(levelTest({ tier: 0 })));
    });

    it('완료 시각을 지어낼 수 없다', async () => {
      await assertFails(update(levelTest({ completedAt: Timestamp.fromMillis(0) })));
    });
  });
});
