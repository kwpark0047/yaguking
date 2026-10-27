import type { RoomDoc } from '@/lib/data/types';

export interface RoomView {
  code: string;
  hostUid: string;
  status: RoomDoc['status'];
  maxPlayers: number;
  playerIds: string[];
  questionIds: string[];
}

const STATUSES: readonly RoomDoc['status'][] = ['waiting', 'playing', 'finished'];
const isStringList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

/**
 * 방 문서 → 화면용 방. 모양이 덜 갖춰졌으면 null.
 *
 * 덜 갖춰진 방이 실제로 온다: 누가 "참가"(명단에 나를 더하기)를 보내는 사이에 방장이 방을 지우면,
 * 그 사람 기기는 서버 답을 받기 전까지 **지워진 방 위에 내 변경만 얹은 문서**(`playerIds`만 있음)를 잠깐 보여 준다.
 * 그대로 쓰면 화면이 `questionIds.length`에서 죽었다(2026-10-27 E2E에서 발견).
 */
export function toRoomView(code: string, data: Partial<Record<keyof RoomDoc, unknown>> | undefined): RoomView | null {
  if (!data) return null;
  const { hostUid, status, maxPlayers, playerIds, questionIds } = data;
  if (typeof hostUid !== 'string' || !STATUSES.includes(status as RoomDoc['status'])) return null;
  if (typeof maxPlayers !== 'number' || !isStringList(playerIds) || !isStringList(questionIds)) return null;
  return { code, hostUid, status: status as RoomDoc['status'], maxPlayers, playerIds, questionIds };
}
