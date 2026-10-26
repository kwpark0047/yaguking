import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, serverTimestamp, setDoc, Timestamp, type Firestore } from 'firebase/firestore';

/**
 * 보안 규칙 테스트 공통 준비. Firestore 에뮬레이터(JDK 21)가 필요하다 —
 * `npm run test:rules`가 에뮬레이터를 띄우고 FIRESTORE_EMULATOR_HOST를 넣는다.
 */
export const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;

/**
 * 테스트 파일마다 **다른 프로젝트 ID**를 쓴다. Vitest는 파일을 동시에 돌리는데,
 * 같은 프로젝트면 한 파일의 clearFirestore()가 다른 파일이 깔아 둔 데이터를 지운다
 * (실제로 그렇게 엉뚱하게 실패했다). 에뮬레이터는 프로젝트별로 데이터를 나눈다.
 */
export async function startRulesEnv(
  name: string,
  rulesFile = '../../firestore.rules',
): Promise<RulesTestEnvironment> {
  const [host, port] = (emulatorHost ?? '127.0.0.1:8080').split(':');
  return initializeTestEnvironment({
    projectId: `demo-yaguking-${name}`,
    firestore: {
      host: host!,
      port: Number(port),
      rules: readFileSync(fileURLToPath(new URL(rulesFile, import.meta.url)), 'utf8'),
    },
  });
}

// rules-unit-testing은 호환판 Firestore 형을 돌려주지만 모듈식 API와 함께 쓴다(공식 사용법).
export const member = (env: RulesTestEnvironment, uid: string): Firestore =>
  env.authenticatedContext(uid, { firebase: { sign_in_provider: 'password' } }).firestore() as unknown as Firestore;

export const guest = (env: RulesTestEnvironment, uid: string): Firestore =>
  env.authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } }).firestore() as unknown as Firestore;

/** 규칙을 건너뛰고 만 14세 확인을 마친 회원 프로필을 깔아 둔다. */
export async function seedConfirmedMember(env: RulesTestEnvironment, uid: string, extra: object = {}) {
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), `users/${uid}`), {
      ageConfirmedAt: Timestamp.now(),
      createdAt: Timestamp.now(),
      ...extra,
    });
  });
}

/** 한국 날짜 키 — 앱과 같은 함수를 쓴다(규칙의 kstDay()와 같아야 한다) */
export { kstDayKey } from '@/lib/data/keys';

export const now = serverTimestamp;
