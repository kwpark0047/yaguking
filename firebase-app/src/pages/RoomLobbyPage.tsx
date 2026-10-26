import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '@/auth/AuthProvider';
import { useGuestFallback } from '@/auth/useGuestFallback';
import { loadQuestions } from '@/content/questions';
import { dataErrorMessage } from '@/lib/firebase/errors';
import { createRoom } from '@/lib/room/api';
import {
  DEFAULT_QUESTION_COUNT,
  DEFAULT_ROOM_SIZE,
  ROOM_QUESTION_COUNTS,
  ROOM_SIZES,
  normalizeRoomCode,
  pickBattleQuestions,
} from '@/lib/room/battle';
import { ROOM_NICKNAME_MAX, rememberGuestName, rememberedGuestName, roomNicknameProblem } from '@/lib/room/nickname';

const primary = { backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' };
const field = { borderColor: 'var(--line)', backgroundColor: 'var(--bg-card)' };

/**
 * 친구 대결 — 방 만들기 / 코드로 들어가기. **비공식**: 점수는 랭킹·XP에 들어가지 않는다.
 * 비회원도 된다(받은 링크로 바로 들어오도록). 실시간 읽기가 인원의 제곱이라 정원 기본 4명.
 */
export function RoomLobbyPage() {
  const { user, isGuest, profile } = useAuth();
  const signInError = useGuestFallback();
  const navigate = useNavigate();
  const [size, setSize] = useState(DEFAULT_ROOM_SIZE);
  const [count, setCount] = useState(DEFAULT_QUESTION_COUNT);
  const [guestName, setGuestName] = useState(() => rememberedGuestName());
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const memberName = !isGuest && profile.status === 'ready' ? profile.data.nickname : null;

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    const name = memberName ?? guestName.trim();
    const problem = roomNicknameProblem(name);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (isGuest) rememberGuestName(name);
      const questionIds = pickBattleQuestions(await loadQuestions(), count);
      const roomCode = await createRoom({ uid: user.uid, nickname: name, maxPlayers: size, questionIds });
      navigate(`/room/${roomCode}`);
    } catch (reason) {
      setError(dataErrorMessage(reason, '방을 만들지 못했어요. 연결을 확인하고 다시 해 주세요.'));
      setBusy(false);
    }
  }

  function join(event: FormEvent) {
    event.preventDefault();
    const normalized = normalizeRoomCode(code);
    if (!normalized) {
      setError('방 코드는 영문·숫자 6자예요.');
      return;
    }
    if (isGuest) rememberGuestName(guestName.trim());
    navigate(`/room/${normalized}`);
  }

  const shownError = error ?? signInError;

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-5 px-4 py-6">
      <Link to="/" className="flex min-h-11 items-center self-start text-sm text-ink-2 underline">
        ← 야구왕
      </Link>
      <h1 className="font-cute text-3xl">친구 대결</h1>
      <p className="text-sm text-ink-2 break-keep">
        같은 문제를 동시에 풀고 점수를 겨뤄요. 정답 100점에 빠를수록 최대 50점을 더해요.
        비공식 대결이라 랭킹·XP에는 들어가지 않아요.
      </p>

      {shownError && (
        <p role="alert" className="text-sm" style={{ color: 'var(--out)' }}>
          {shownError}
        </p>
      )}

      {isGuest && (
        <label className="flex flex-col gap-1 text-sm">
          방에서 쓸 이름 (1~{ROOM_NICKNAME_MAX}자)
          <input
            value={guestName}
            onChange={(event) => setGuestName(event.target.value)}
            maxLength={ROOM_NICKNAME_MAX}
            className="min-h-14 rounded-option border px-3 text-lg"
            style={field}
          />
        </label>
      )}

      <form onSubmit={create} className="sticker flex flex-col gap-3 p-4" aria-labelledby="create-title">
        <h2 id="create-title" className="font-cute text-2xl">
          방 만들기
        </h2>
        <div className="flex gap-3">
          <label className="flex flex-1 flex-col gap-1 text-sm">
            정원
            <select
              value={size}
              onChange={(event) => setSize(Number(event.target.value))}
              className="min-h-12 rounded-option border px-2"
              style={field}
            >
              {ROOM_SIZES.map((option) => (
                <option key={option} value={option}>
                  {option}명
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-1 flex-col gap-1 text-sm">
            문제 수
            <select
              value={count}
              onChange={(event) => setCount(Number(event.target.value))}
              className="min-h-12 rounded-option border px-2"
              style={field}
            >
              {ROOM_QUESTION_COUNTS.map((option) => (
                <option key={option} value={option}>
                  {option}문제
                </option>
              ))}
            </select>
          </label>
        </div>
        {size > DEFAULT_ROOM_SIZE && (
          <p className="text-xs text-ink-2 break-keep">사람이 많을수록 무료 사용량을 빨리 써요(인원의 제곱).</p>
        )}
        <button
          type="submit"
          disabled={!user || busy}
          className="squishy font-cute min-h-14 text-xl disabled:opacity-60"
          style={primary}
        >
          {busy ? '만드는 중…' : '방 만들기'}
        </button>
      </form>

      <form onSubmit={join} className="sticker flex flex-col gap-3 p-4" aria-labelledby="join-title">
        <h2 id="join-title" className="font-cute text-2xl">
          코드로 들어가기
        </h2>
        <label className="flex flex-col gap-1 text-sm">
          방 코드 (6자)
          <input
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            maxLength={6}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            className="num-tabular min-h-14 rounded-option border px-3 text-2xl tracking-[0.3em]"
            style={field}
          />
        </label>
        <button
          type="submit"
          disabled={!user}
          className="min-h-14 rounded-option border-2 font-semibold disabled:opacity-60"
          style={{ borderColor: 'var(--line)' }}
        >
          들어가기
        </button>
      </form>
    </main>
  );
}
