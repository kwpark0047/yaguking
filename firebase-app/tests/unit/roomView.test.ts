import { describe, expect, it } from 'vitest';
import { toRoomView } from '@/lib/room/view';

/** 친구 대결 방 문서 → 화면용 방. 덜 갖춰진 방은 null(화면이 죽지 않게) */
describe('toRoomView', () => {
  const full = { hostUid: 'h', status: 'waiting', maxPlayers: 4, playerIds: ['h'], questionIds: ['q1', 'q2'] };

  it('갖춰진 방은 그대로', () => {
    expect(toRoomView('ABC234', full)).toEqual({ code: 'ABC234', ...full });
  });

  it('참가를 보내는 사이 방이 지워지면 오는 "명단만 있는 문서"는 null', () => {
    expect(toRoomView('ABC234', { playerIds: ['h', 'me'] })).toBeNull();
  });

  it('필드가 빠지거나 모양이 틀리면 null', () => {
    expect(toRoomView('ABC234', undefined)).toBeNull();
    expect(toRoomView('ABC234', { ...full, questionIds: undefined })).toBeNull();
    expect(toRoomView('ABC234', { ...full, status: 'gone' })).toBeNull();
    expect(toRoomView('ABC234', { ...full, playerIds: 'h' })).toBeNull();
    expect(toRoomView('ABC234', { ...full, maxPlayers: '4' })).toBeNull();
  });
});
