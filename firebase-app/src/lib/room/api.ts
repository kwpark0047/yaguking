import {
  arrayRemove,
  arrayUnion,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  writeBatch,
  collection,
} from 'firebase/firestore';
import { roomCode } from '@/lib/data/keys';
import type { RoomDoc } from '@/lib/data/types';
import { firestore } from '@/lib/firebase/db';
import { ROOM_QUESTION_SECONDS, scoreOf, type BattleAnswer } from './battle';

/**
 * 친구 대결 방 — Firestore 읽기·쓰기와 실시간 구독(docs/data-model.md §1).
 *
 * 비용: 누가 답할 때마다 방 안 N명에게 읽기 1번씩 → 10문항이면 약 10·N². 그래서
 * 정원 기본 4명, 끝난 방은 구독을 끊는다(화면 쪽). 방 문서는 시작·종료 때만 바뀐다.
 */

export interface RoomView {
  code: string;
  hostUid: string;
  status: RoomDoc['status'];
  maxPlayers: number;
  playerIds: string[];
  questionIds: string[];
}

export interface SeatView {
  uid: string;
  nickname: string;
  score: number;
  answers: BattleAnswer[];
}

export class RoomJoinError extends Error {
  constructor(readonly reason: 'missing' | 'started' | 'full') {
    super(reason);
  }
}

const roomRef = (code: string) => doc(firestore(), 'rooms', code);
const seatRef = (code: string, uid: string) => doc(firestore(), 'rooms', code, 'players', uid);

const seat = (nickname: string) => ({ nickname, joinedAt: serverTimestamp(), score: 0, answers: [] });

/**
 * 방 만들기 = 방 + 방장 자리(한 묶음). 코드가 이미 쓰이면 규칙이 거절하므로
 * (덮어쓰기는 "수정"이라 막힌다) 새 코드로 몇 번 다시 해 본다.
 */
export async function createRoom(input: {
  uid: string;
  nickname: string;
  maxPlayers: number;
  questionIds: string[];
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
    });
    batch.set(seatRef(code, input.uid), seat(input.nickname));
    try {
      await batch.commit();
      return code;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

/** 참가 = 명단 끝에 나를 더하기 + 내 자리(한 묶음). 이미 명단에 있으면 아무것도 안 한다 */
export async function joinRoom(code: string, uid: string, nickname: string): Promise<void> {
  const snapshot = await getDoc(roomRef(code));
  if (!snapshot.exists()) throw new RoomJoinError('missing');
  const room = snapshot.data() as RoomDoc;
  if (room.playerIds.includes(uid)) return;
  if (room.status !== 'waiting') throw new RoomJoinError('started');
  if (room.playerIds.length >= room.maxPlayers) throw new RoomJoinError('full');
  const batch = writeBatch(firestore());
  batch.update(roomRef(code), { playerIds: arrayUnion(uid) });
  batch.set(seatRef(code, uid), seat(nickname));
  await batch.commit();
}

/** 대기 중에 나간다(방장이 아닌 사람). 명단에서 빼고 자리를 지운다 */
export async function leaveRoom(code: string, uid: string): Promise<void> {
  const batch = writeBatch(firestore());
  batch.update(roomRef(code), { playerIds: arrayRemove(uid) });
  batch.delete(seatRef(code, uid));
  await batch.commit();
}

/** 방장이 대기 중인 방을 닫는다. 다른 사람의 자리 문서는 남는다(관리 스크립트가 정리, 8단계) */
export async function closeRoom(code: string, uid: string): Promise<void> {
  const batch = writeBatch(firestore());
  batch.delete(seatRef(code, uid));
  batch.delete(roomRef(code));
  await batch.commit();
}

export async function startRoom(code: string): Promise<void> {
  await updateDoc(roomRef(code), { status: 'playing', startedAt: serverTimestamp() });
}

export async function finishRoom(code: string): Promise<void> {
  await updateDoc(roomRef(code), { status: 'finished', finishedAt: serverTimestamp() });
}

/**
 * 답 하나를 더한다. 배열 전체를 쓴다 — arrayUnion은 똑같은 답(시간 초과 두 번 등)을
 * 하나로 합쳐 버려 규칙의 "하나씩 늘어야 한다"에 걸린다.
 */
export async function submitAnswers(code: string, uid: string, answers: BattleAnswer[]): Promise<void> {
  await updateDoc(seatRef(code, uid), { answers, score: scoreOf(answers), updatedAt: serverTimestamp() });
}

/** 방 문서 구독. 없어지면 null */
export function watchRoom(code: string, onChange: (room: RoomView | null) => void, onError: () => void) {
  return onSnapshot(
    roomRef(code),
    (snapshot) => {
      if (!snapshot.exists()) return onChange(null);
      const data = snapshot.data() as RoomDoc;
      onChange({
        code,
        hostUid: data.hostUid,
        status: data.status,
        maxPlayers: data.maxPlayers,
        playerIds: data.playerIds,
        questionIds: data.questionIds,
      });
    },
    onError,
  );
}

/** 자리 구독(참가 순서) */
export function watchSeats(code: string, onChange: (seats: SeatView[]) => void, onError: () => void) {
  return onSnapshot(
    collection(firestore(), 'rooms', code, 'players'),
    (snapshot) => {
      const seats = snapshot.docs
        .map((item) => ({ uid: item.id, data: item.data({ serverTimestamps: 'estimate' }) }))
        .sort((a, b) => (a.data.joinedAt?.toMillis?.() ?? Infinity) - (b.data.joinedAt?.toMillis?.() ?? Infinity))
        .map(({ uid, data }) => ({
          uid,
          nickname: String(data.nickname ?? ''),
          score: Number(data.score ?? 0),
          answers: (data.answers ?? []) as BattleAnswer[],
        }));
      onChange(seats);
    },
    onError,
  );
}

