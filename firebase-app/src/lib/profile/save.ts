import { deleteUser, type User } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  writeBatch,
  type DocumentReference,
} from 'firebase/firestore';
import { nicknameKey } from '@/lib/data/keys';
import { firestore } from '@/lib/firebase/db';
import { countReads, countWrites } from '@/lib/firebase/meter';

export interface ProfileInput {
  nickname: string;
  favoriteTeams: string[];
  favoritePlayers: string[];
}

export class NicknameTakenError extends Error {
  constructor() {
    super('이미 다른 선수가 쓰는 닉네임이에요.');
  }
}

/** 이 닉네임을 다른 사람이 쓰는가(대소문자 무시). 읽기 1번 — 저장 전에 빠르게 알려 준다. */
export async function isNicknameTaken(nickname: string, uid: string): Promise<boolean> {
  const snapshot = await getDoc(doc(firestore(), 'nicknames', nicknameKey(nickname)));
  countReads('isNicknameTaken', 1);
  return snapshot.exists() && snapshot.get('uid') !== uid;
}

/**
 * 프로필 저장 — **한 묶음(batch)**으로 쓴다. 규칙이 "프로필 닉네임"과 "닉네임 예약"이
 * 같은 묶음에서 서로 맞는지 확인하기 때문이다(docs/data-model.md §2).
 *
 * - 닉네임이 바뀌면 새 예약을 잡고 옛 예약을 놓는다
 * - 대소문자만 바뀌면 예약 문서는 같으므로 건드리지 않는다(예약 수정은 규칙이 막는다)
 */
export async function saveProfile(
  uid: string,
  input: ProfileInput,
  previousNickname: string | null,
): Promise<void> {
  const db = firestore();
  const nickname = input.nickname.trim();
  const batch = writeBatch(db);
  let writes = 1; // 프로필
  const update: Record<string, unknown> = {
    favoriteTeams: input.favoriteTeams,
    favoritePlayers: input.favoritePlayers,
    updatedAt: serverTimestamp(),
  };

  if (nickname !== previousNickname) {
    update.nickname = nickname;
    const newKey = nicknameKey(nickname);
    const oldKey = previousNickname ? nicknameKey(previousNickname) : null;
    if (newKey !== oldKey) {
      if (await isNicknameTaken(nickname, uid)) throw new NicknameTakenError();
      batch.set(doc(db, 'nicknames', newKey), { uid });
      writes += 1;
      if (oldKey) {
        batch.delete(doc(db, 'nicknames', oldKey));
        writes += 1;
      }
    }
  }

  batch.update(doc(db, 'users', uid), update);
  try {
    await batch.commit();
    countWrites('saveProfile', writes);
  } catch (error) {
    // 확인과 저장 사이에 누가 먼저 잡았을 수 있다
    if ((error as { code?: string }).code === 'permission-denied' && (await isNicknameTaken(nickname, uid))) {
      throw new NicknameTakenError();
    }
    throw error;
  }
}

/**
 * 계정과 **모든 기록**을 지운다(설정 › 계정 삭제, 되돌릴 수 없음).
 *
 * 서버가 없어 하위 문서를 한 번에 지우는 기능이 없다. 기기가 목록을 읽어 하나씩 지운다
 * (읽기·삭제가 문서 수만큼 든다). 친구 대결 방의 자리는 방과 함께 정리된다(8단계 정리 작업).
 * 계정 삭제는 최근 로그인을 요구할 수 있다 — 그러면 다시 로그인하라고 알린다.
 */
export class RecentLoginRequiredError extends Error {
  constructor() {
    super('보안을 위해 로그아웃했다가 다시 로그인한 뒤 지워 주세요.');
  }
}

/** Firebase는 계정 삭제에 최근(약 5분) 로그인을 요구한다. 여유를 두고 4분으로 본다. */
const RECENT_LOGIN_MS = 4 * 60 * 1000;

export async function deleteAccountAndData(user: User, nickname: string | null): Promise<void> {
  // 기록을 먼저 지웠는데 마지막 계정 삭제가 "최근 로그인 필요"로 실패하면 프로필 없는
  // 계정만 남는다. 그래서 지우기 **전에** 확인한다.
  const lastSignIn = Date.parse(user.metadata.lastSignInTime ?? '');
  if (!Number.isFinite(lastSignIn) || Date.now() - lastSignIn > RECENT_LOGIN_MS) {
    throw new RecentLoginRequiredError();
  }
  await deleteUserRecords(user.uid, nickname);
  await deleteUser(user);
}

/**
 * 한 사람의 Firestore 기록을 모두 지운다 — 경기·오답노트·누적·이번 달 연습·출석·칭호·비회원 카운터·닉네임 예약·프로필.
 * 월간 등수 문서에 남은 닉네임은 다음 날 새벽 운영자 PC 작업이 지운다(ops/monthly.mjs).
 * 계정 삭제(설정)와 만 14세 미만 응답이 함께 쓴다. 비회원으로 쌓은 기록도 같은 uid 아래에 있어
 * 함께 지워진다(가입은 계정 연결이라 uid가 그대로다). 하위 문서를 읽는 만큼 읽기·삭제가 든다.
 */
export async function deleteUserRecords(uid: string, nickname: string | null): Promise<void> {
  const db = firestore();
  const refs: DocumentReference[] = [];
  for (const name of ['games', 'wrongNotes', 'summary', 'monthly', 'attendance', 'awards', 'daily']) {
    const snapshot = await getDocs(collection(db, 'users', uid, name));
    countReads('deleteUserRecords', Math.max(1, snapshot.size));
    refs.push(...snapshot.docs.map((item) => item.ref));
  }
  if (nickname) refs.push(doc(db, 'nicknames', nicknameKey(nickname)));
  refs.push(doc(db, 'users', uid));

  // 한 묶음은 최대 500개
  for (let start = 0; start < refs.length; start += 450) {
    const batch = writeBatch(db);
    for (const ref of refs.slice(start, start + 450)) batch.delete(ref);
    await batch.commit();
  }
}
