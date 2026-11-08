import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, serverTimestamp, setDoc, type Firestore } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { emulatorHost, guest, member, startRulesEnv } from './setup';

/** 소식 가져오기 규칙 — 가져온 소식은 관리자만 읽고 아무도 기기에서 쓰지 못한다. 피드 목록은 관리자만 */
describe.skipIf(!emulatorHost)('소식 가져오기 규칙', () => {
  let env: RulesTestEnvironment;
  const admin = (): Firestore =>
    env.authenticatedContext('boss', { admin: true, email_verified: true, firebase: { sign_in_provider: 'google.com' } }).firestore() as unknown as Firestore;
  const feeds = (by: string, count = 1) => ({ feeds: Array.from({ length: count }, (_, index) => ({ id: `f${index}` })), updatedAt: serverTimestamp(), by });

  beforeAll(async () => {
    env = await startRulesEnv('news-feed');
  });
  beforeEach(async () => {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'newsItems/a'), { title: '소식' });
    });
  });
  afterAll(async () => {
    await env.cleanup();
  });

  it('가져온 소식은 관리자만 읽고, 관리자도 쓰지 못한다', async () => {
    await assertSucceeds(getDoc(doc(admin(), 'newsItems/a')));
    await assertFails(setDoc(doc(admin(), 'newsItems/b'), { title: 'x' }));
    for (const db of [guest(env, 'g1'), member(env, 'm1')]) {
      await assertFails(getDoc(doc(db, 'newsItems/a')));
      await assertFails(setDoc(doc(db, 'newsItems/b'), { title: 'x' }));
    }
  });

  it('피드 목록은 관리자가 20개까지', async () => {
    await assertSucceeds(setDoc(doc(admin(), 'adminConfig/newsFeeds'), feeds('boss', 20)));
    await assertFails(setDoc(doc(admin(), 'adminConfig/newsFeeds'), feeds('boss', 21)));
    await assertFails(setDoc(doc(admin(), 'adminConfig/newsFeedRuns'), { runs: [], updatedAt: serverTimestamp(), by: 'boss' }));
    await assertFails(setDoc(doc(member(env, 'm1'), 'adminConfig/newsFeeds'), feeds('m1')));
  });
});
