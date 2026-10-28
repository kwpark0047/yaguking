import { useEffect, useRef, useState } from 'react';
import { ROOM_FLAG_LABEL, roomFlags, roomProgress, type RoomViewRow } from '@/lib/admin/views';
import { useView, ViewBar } from '../useView';
import { cleanupExpiredRooms, logView, rebuildRooms, type RoomsView } from '../views';
import { ErrorText, PageTitle, fmtTime, line } from '../ui';

type Tab = 'waiting' | 'playing' | 'finished' | 'expired';
const TAB_LABEL: Record<Tab, string> = { waiting: '대기', playing: '진행', finished: '끝', expired: '24시간 지남' };
const STATUS_LABEL: Record<RoomViewRow['status'], string> = { waiting: '대기', playing: '진행', finished: '끝' };

const ago = (ms: number, now: number) => {
  const minutes = Math.max(0, Math.round((now - ms) / 60_000));
  return minutes < 60 ? `${minutes}분 전` : minutes < 1440 ? `${Math.round(minutes / 60)}시간 전` : `${Math.round(minutes / 1440)}일 전`;
};

/**
 * 대결 방(docs/admin-dashboard-plan.md §4) — 열 때 보기 하나(읽기 1). 실시간 구독은 하지 않는다(보는 동안 방 안
 * 사람 수만큼 읽기가 늘어난다). 이름표가 보이므로 열 때 관리자 기록을 남긴다.
 */
export function RoomsPage() {
  const { view, busy, error, refresh } = useView<RoomsView>('rooms', rebuildRooms);
  const [tab, setTab] = useState<Tab>('playing');
  const [open, setOpen] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const logged = useRef(false);
  const now = Date.now();

  useEffect(() => {
    if (!view || logged.current) return;
    logged.current = true;
    void logView('view-rooms', 'rooms', `${view.data.rows.length}개`).catch(() => undefined);
  }, [view]);

  const rows = view?.data.rows ?? [];
  const inTab = (room: RoomViewRow) => {
    const expired = roomFlags(room, now).includes('expired');
    return tab === 'expired' ? expired : !expired && room.status === tab;
  };
  const shown = rows.filter(inTab);
  const expiredCount = rows.filter((room) => roomFlags(room, now).includes('expired')).length;

  async function cleanup() {
    setMessage(null);
    setActionError(null);
    try {
      const removed = await cleanupExpiredRooms(rows);
      await refresh();
      setMessage(`지난 방 ${removed}개를 정리했어요.`);
    } catch {
      setActionError('정리하지 못했어요.');
    }
  }

  return (
    <>
      <PageTitle note="기기에서 채점한 비공식 대결. 24시간 지난 방은 매일 03:30 정리 작업이 지웁니다.">대결 방</PageTitle>
      <ViewBar updatedAt={view?.updatedAt ?? null} busy={busy} error={error} onRefresh={() => void refresh()} cost="방 최대 100개와 각 방의 자리를 읽습니다" />
      {view === undefined && !error && <p className="text-sm text-ink-2">불러오는 중…</p>}
      {view && (
        <>
          <div className="flex flex-wrap gap-1" role="group" aria-label="방 상태">
            {(Object.keys(TAB_LABEL) as Tab[]).map((value) => {
              const count = rows.filter((room) => {
                const expired = roomFlags(room, now).includes('expired');
                return value === 'expired' ? expired : !expired && room.status === value;
              }).length;
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={tab === value}
                  onClick={() => setTab(value)}
                  className={`min-h-11 rounded-option border-2 px-3 text-sm font-semibold ${tab === value ? '' : 'text-ink-2'}`}
                  style={tab === value ? { borderColor: 'var(--accent)' } : line}
                >
                  {TAB_LABEL[value]} {count}
                </button>
              );
            })}
          </div>
          {tab === 'expired' && expiredCount > 0 && (
            <button type="button" onClick={() => void cleanup()} className="min-h-11 self-start rounded-option border-2 px-4 text-sm font-semibold" style={line}>
              지난 방 {expiredCount}개 지금 정리
            </button>
          )}
          {message && (
            <p role="status" className="text-sm">
              {message}
            </p>
          )}
          {actionError && <ErrorText>{actionError}</ErrorText>}
          {shown.length === 0 ? (
            <p className="text-sm text-ink-2">해당하는 방이 없어요.</p>
          ) : (
            <ul className="flex flex-col gap-2" aria-label="대결 방 목록">
              {shown.map((room) => {
                const flags = roomFlags(room, now);
                const host = room.seats.find((seat) => seat.uid === room.hostUid);
                return (
                  <li key={room.code} className="sticker flex flex-col gap-2 p-3 text-sm">
                    <button
                      type="button"
                      aria-expanded={open === room.code}
                      onClick={() => setOpen(open === room.code ? null : room.code)}
                      className="flex min-h-11 flex-wrap items-center justify-between gap-2 text-left"
                    >
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-semibold">{room.code}</span>
                        <span>{STATUS_LABEL[room.status]}</span>
                        <span className="text-ink-2">
                          {room.players}/{room.maxPlayers}명 · {room.questions}문제 · {ago(room.createdAt, now)} · 방장 {host?.nickname ?? room.hostUid.slice(0, 6)}
                        </span>
                      </span>
                      <span className="flex flex-wrap gap-1">
                        {room.status === 'playing' && <span className="num-tabular text-xs text-ink-2">진행 {Math.round(roomProgress(room) * 100)}%</span>}
                        {flags.map((flag) => (
                          <span key={flag} className="rounded-full border-2 px-2 py-0.5 text-xs" style={{ borderColor: 'var(--out)' }}>
                            {ROOM_FLAG_LABEL[flag]}
                          </span>
                        ))}
                      </span>
                    </button>
                    {open === room.code && <RoomDetail room={room} />}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </>
  );
}

function RoomDetail({ room }: { room: RoomViewRow }) {
  const seats = [...room.seats].sort((a, b) => b.score - a.score);
  return (
    <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={`${room.code} 참가자`}>
      <p className="text-xs text-ink-2">
        만든 시각 {fmtTime(room.createdAt)}
        {room.startedAt ? ` · 시작 ${fmtTime(room.startedAt)}` : ''}
      </p>
      <table className="w-full min-w-[28rem] border-collapse text-left">
        <thead>
          <tr>
            {['순위', '이름표', '점수', '정답/답함', '마지막 답'].map((head) => (
              <th key={head} scope="col" className="border-b-2 px-2 py-1 text-xs" style={line}>
                {head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {seats.map((seat, index) => (
            <tr key={seat.uid}>
              <td className="num-tabular border-b px-2 py-1" style={line}>{index + 1}</td>
              <th scope="row" className="border-b px-2 py-1 font-normal" style={line}>
                {seat.nickname}
                {seat.uid === room.hostUid ? ' (방장)' : ''}
              </th>
              <td className="num-tabular border-b px-2 py-1" style={line}>{seat.score}</td>
              <td className="num-tabular border-b px-2 py-1" style={line}>
                {seat.correct}/{seat.answered} (전체 {room.questions})
              </td>
              <td className="num-tabular border-b px-2 py-1" style={line}>{fmtTime(seat.lastAnswerAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
