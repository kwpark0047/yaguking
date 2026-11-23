import {
  arrayRemove,
  arrayUnion,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  writeBatch,
  collection,
} from 'firebase/firestore';
import { roomCode } from '@/lib/data/keys';
import type { RoomDoc } from '@/lib/data/types';
import { firestore } from '@/lib/firebase/db';
import { MATCH_SIDE_MAX } from '@/lib/squad/squad';
import { countReads, countWrites } from '@/lib/firebase/meter';
import { ROOM_QUESTION_SECONDS, scoreOf, type BattleAnswer } from './battle';
import { toRoomView, type RoomView } from './view';

export type { RoomView };

/**
 * 친구 대결 방 — Firestore 읽기·쓰기와 실시간 구독(docs/data-model.md §1).
 *
 * 비용: 누가 답할 때마다 방 안 N명에게 읽기 1번씩 → 10문항이면 약 10·N². 그래서
 * 정원 기본 4명, 끝난 방은 구독을 끊는다(화면 쪽). 방 문서는 시작·종료 때만 바뀐다.
 */

export interface SeatView {
  uid: string;
  nickname: string;
  /** 팀 대항전에서 그 사람의 팀 코드 */
  squad: string | null;
  score: number;
  answers: BattleAnswer[];
}

export class RoomJoinError extends Error {
  constructor(readonly reason: 'missing' | 'started' | 'full' | 'team' | 'teams-full' | 'side-full') {
    super(reason);
  }
}

const roomRef = (code: string) => doc(firestore(), 'rooms', code);
const seatRef = (code: string, uid: string) => doc(firestore(), 'rooms', code, 'players', uid);

const seat = (nickname: string, squad: string | null = null) => ({
  nickname,
  joinedAt: serverTimestamp(),
  score: 0,
  answers: [],
  ...(squad ? { squad } : {}),
});

/**
 * 방 만들기 = 방 + 방장 자리(한 묶음). 코드가 이미 쓰이면 규칙이 거절하므로
 * (덮어쓰기는 "수정"이라 막힌다) 새 코드로 몇 번 다시 해 본다.
 */
export async function createRoom(input: {
  uid: string;
  nickname: string;
  maxPlayers: number;
  questionIds: string[];
  /** 팀 대항전 — 방장의 팀 코드(팀원이어야 한다 — 규칙) */
  squad?: string | null;
}): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const code = roomCode();
    const batch = writeBatch(firestore());
    batch.set(roomRef(code), {
      hostUid: input.uid,
      status: 'waiting',
      createdAt: serverTimestamp(),
      maxPlayers: input.maxPlayers,
      playerIds: [input.uid],
      questionIds: input.questionIds,
      questionSeconds: ROOM_QUESTION_SECONDS,
      ...(input.squad ? { teamMatch: true, squads: [input.squad] } : {}),
    });
    batch.set(seatRef(code, input.uid), seat(input.nickname, input.squad ?? null));
    try {
      await batch.commit();
      countWrites('createRoom', 2);
      return code;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

/** 참가 = 명단 끝에 나를 더하기 + 내 자리(한 묶음). 이미 명단에 있으면 아무것도 안 한다 */
export async function joinRoom(code: string, uid: string, nickname: string, squad: string | null = null): Promise<void> {
  const snapshot = await getDoc(roomRef(code));
  countReads('joinRoom', 1);
  if (!snapshot.exists()) throw new RoomJoinError('missing');
  const room = snapshot.data() as RoomDoc;
  if (room.playerIds.includes(uid)) return;
  if (room.status !== 'waiting') throw new RoomJoinError('started');
  if (room.playerIds.length >= room.maxPlayers) throw new RoomJoinError('full');
  // 팀 대항전: 팀원만, 팀은 둘까지, 한 팀 MATCH_SIDE_MAX명까지(자리를 읽어 센다 — 최대 10)
  if (room.teamMatch) {
    if (!squad) throw new RoomJoinError('team');
    const squads = room.squads ?? [];
    if (!squads.includes(squad) && squads.length >= 2) throw new RoomJoinError('teams-full');
    const seats = await getDocs(collection(firestore(), 'rooms', code, 'players'));
    countReads('joinRoom', Math.max(1, seats.size));
    if (seats.docs.filter((item) => item.get('squad') === squad).length >= MATCH_SIDE_MAX) throw new RoomJoinError('side-full');
  }
  const batch = writeBatch(firestore());
  batch.update(roomRef(code), room.teamMatch ? { playerIds: arrayUnion(uid), squads: arrayUnion(squad) } : { playerIds: arrayUnion(uid) });
  batch.set(seatRef(code, uid), seat(nickname, room.teamMatch ? squad : null));
  await batch.commit();
  countWrites('joinRoom', 2);
}

/** 대기 중에 나간다(방장이 아닌 사람). 명단에서 빼고 자리를 지운다 */
export async function leaveRoom(code: string, uid: string): Promise<void> {
  const batch = writeBatch(firestore());
  batch.update(roomRef(code), { playerIds: arrayRemove(uid) });
  batch.delete(seatRef(code, uid));
  await batch.commit();
  countWrites('leaveRoom', 2);
}

/** 방장이 대기 중인 방을 닫는다. 다른 사람의 자리 문서는 남는다(관리 스크립트가 정리, 8단계) */
export async function closeRoom(code: string, uid: string): Promise<void> {
  const batch = writeBatch(firestore());
  batch.delete(seatRef(code, uid));
  batch.delete(roomRef(code));
  await batch.commit();
  countWrites('closeRoom', 2);
}

export async function startRoom(code: string): Promise<void> {
  await updateDoc(roomRef(code), { status: 'playing', startedAt: serverTimestamp() });
  countWrites('startRoom', 1);
}

export async function finishRoom(code: string): Promise<void> {
  await updateDoc(roomRef(code), { status: 'finished', finishedAt: serverTimestamp() });
  countWrites('finishRoom', 1);
}

/**
 * 답 하나를 더한다. 배열 전체를 쓴다 — arrayUnion은 똑같은 답(시간 초과 두 번 등)을
 * 하나로 합쳐 버려 규칙의 "하나씩 늘어야 한다"에 걸린다.
 */
export async function submitAnswers(code: string, uid: string, answers: BattleAnswer[]): Promise<void> {
  await updateDoc(seatRef(code, uid), { answers, score: scoreOf(answers), updatedAt: serverTimestamp() });
  countWrites('submitAnswers', 1);
}

/** 방 문서 구독. 없어지면 null */
export function watchRoom(code: string, onChange: (room: RoomView | null) => void, onError: (error: unknown) => void) {
  return onSnapshot(
    roomRef(code),
    (snapshot) => {
      if (!snapshot.metadata.fromCache) countReads('watchRoom', 1);
      if (!snapshot.exists()) return onChange(null);
      const room = toRoomView(code, snapshot.data());
      // 덜 갖춰진 방(view.ts): 내 변경이 아직 서버에 안 갔으면 서버 답을 기다리고(곧 방 또는 "없음"이 온다),
      // 서버에서 온 것이면 없는 방으로 본다
      if (!room && snapshot.metadata.hasPendingWrites) return;
      onChange(room);
    },
    onError,
  );
}

/** 자리 구독(참가 순서) */
export function watchSeats(code: string, onChange: (seats: SeatView[]) => void, onError: (error: unknown) => void) {
  return onSnapshot(
    collection(firestore(), 'rooms', code, 'players'),
    (snapshot) => {
      if (!snapshot.metadata.fromCache) countReads('watchSeats', snapshot.docChanges().length);
      const seats = snapshot.docs
        .map((item) => ({ uid: item.id, data: item.data({ serverTimestamps: 'estimate' }) }))
        .sort((a, b) => (a.data.joinedAt?.toMillis?.() ?? Infinity) - (b.data.joinedAt?.toMillis?.() ?? Infinity))
        .map(({ uid, data }) => ({
          uid,
          nickname: String(data.nickname ?? ''),
          squad: typeof data.squad === 'string' ? data.squad : null,
          score: Number(data.score ?? 0),
          answers: (data.answers ?? []) as BattleAnswer[],
        }));
      onChange(seats);
    },
    onError,
  );
}

