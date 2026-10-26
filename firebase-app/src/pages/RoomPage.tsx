import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useAuth } from '@/auth/AuthProvider';
import { useGuestFallback } from '@/auth/useGuestFallback';
import { QuestionView } from '@/components/game/QuestionView';
import { loadQuestions, type OptionLabel, type Question } from '@/content/questions';
import { dataErrorMessage } from '@/lib/firebase/errors';
import { byId } from '@/lib/game/persist';
import {
  RoomJoinError,
  closeRoom,
  finishRoom,
  joinRoom,
  leaveRoom,
  startRoom,
  submitAnswers,
  watchRoom,
  watchSeats,
  type RoomView,
  type SeatView,
} from '@/lib/room/api';
import {
  everyoneDone,
  judge,
  normalizeRoomCode,
  pointsFor,
  scoreOf,
  standings,
  type BattleAnswer,
  type Standing,
} from '@/lib/room/battle';
import { ROOM_NICKNAME_MAX, rememberGuestName, rememberedGuestName, roomNicknameProblem } from '@/lib/room/nickname';

const primary = { backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' };
const secondary = { borderColor: 'var(--line)' };

const JOIN_ERROR: Record<RoomJoinError['reason'], string> = {
  missing: '방이 닫혔거나 없는 방이에요.',
  started: '이미 시작한 방이에요.',
  full: '방이 꽉 찼어요.',
};

/**
 * 친구 대결 방 — 대기실 → 각자 풀기 → 최종 순위. 방과 자리를 **실시간 구독**한다.
 *
 * - 모두 같은 문항을 각자 속도로 푼다. 답할 때마다 내 자리에 답 하나를 더한다(규칙이 하나씩만 받음)
 * - 다 같이 끝나면 방장 기기가 방을 "끝"으로 바꾼다. 안 끝나는 사람이 있으면 방장이 끝낸다
 * - 끝난 방은 아무도 쓰지 않으니 구독이 남아도 읽기가 늘지 않는다
 */
export function RoomPage() {
  const { code: rawCode } = useParams();
  const code = normalizeRoomCode(rawCode ?? '');
  const { user, isGuest, profile } = useAuth();
  const signInError = useGuestFallback();
  const navigate = useNavigate();

  const [room, setRoom] = useState<RoomView | null | undefined>(undefined);
  const [seats, setSeats] = useState<SeatView[] | null>(null);
  const [bank, setBank] = useState<Map<string, Question> | null>(null);
  const [mine, setMine] = useState<BattleAnswer[] | null>(null);
  const [feedback, setFeedback] = useState<{ answer: BattleAnswer; question: Question } | null>(null);
  const [unsent, setUnsent] = useState(false);
  const [guestName, setGuestName] = useState(() => rememberedGuestName());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const finishing = useRef(false);

  const uid = user?.uid ?? null;
  const joined = !!room && !!uid && room.playerIds.includes(uid);
  const isHost = !!room && room.hostUid === uid;
  const total = room?.questionIds.length ?? 0;

  useEffect(() => {
    if (!code || !uid) return;
    return watchRoom(code, setRoom, (reason) => setError(dataErrorMessage(reason, '방을 불러오지 못했어요. 연결을 확인해 주세요.')));
  }, [code, uid]);

  // 자리는 방에 들어간 사람만 구독한다(구경꾼의 읽기를 줄인다)
  useEffect(() => {
    if (!code || !joined) return;
    return watchSeats(code, setSeats, (reason) => setError(dataErrorMessage(reason, '참가자를 불러오지 못했어요.')));
  }, [code, joined]);

  useEffect(() => {
    loadQuestions()
      .then((questions) => setBank(byId(questions)))
      .catch(() => setError('문항을 불러오지 못했어요.'));
  }, []);

  // 새로고침해도 이어서 푼다 — 내 자리에 쌓인 답에서 시작
  const mySeat = seats?.find((seat) => seat.uid === uid);
  useEffect(() => {
    if (mine === null && mySeat) setMine(mySeat.answers);
  }, [mine, mySeat]);

  // 다 같이 끝나면 방장이 방을 끝낸다
  useEffect(() => {
    if (!code || !isHost || room?.status !== 'playing' || !seats || finishing.current) return;
    if (everyoneDone(seats, total)) {
      finishing.current = true;
      finishRoom(code).catch(() => {
        finishing.current = false;
      });
    }
  }, [code, isHost, room?.status, seats, total]);

  const table = useMemo(() => standings(seats ?? []), [seats]);

  if (!code) {
    return (
      <Shell>
        <p role="alert">방 코드가 올바르지 않아요.</p>
        <BackToLobby />
      </Shell>
    );
  }

  const name = (!isGuest && profile.status === 'ready' ? profile.data.nickname : guestName.trim()) ?? '';

  async function join(event: FormEvent) {
    event.preventDefault();
    if (!uid || !code) return;
    const problem = roomNicknameProblem(name);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      if (isGuest) rememberGuestName(name);
      await joinRoom(code, uid, name);
    } catch (reason) {
      setError(reason instanceof RoomJoinError ? JOIN_ERROR[reason.reason] : dataErrorMessage(reason, '들어가지 못했어요. 다시 해 주세요.'));
    } finally {
      setBusy(false);
    }
  }

  async function run(action: () => Promise<void>, failure: string, after?: () => void) {
    setBusy(true);
    setError(null);
    try {
      await action();
      after?.();
    } catch (reason) {
      setError(dataErrorMessage(reason, failure));
    } finally {
      setBusy(false);
    }
  }

  async function send(answers: BattleAnswer[]) {
    try {
      await submitAnswers(code!, uid!, answers);
      setUnsent(false);
    } catch {
      setUnsent(true);
    }
  }

  function answer(question: Question, choice: OptionLabel | null, elapsedMs: number) {
    const result = judge(question, choice, elapsedMs);
    const next = [...(mine ?? []), result];
    setMine(next);
    setFeedback({ answer: result, question });
    void send(next);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/room/${code}`);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const alerts = (
    <>
      {(error ?? signInError) && (
        <p role="alert" className="text-sm" style={{ color: 'var(--out)' }}>
          {error ?? signInError}
        </p>
      )}
      {unsent && (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-sm" style={{ color: 'var(--out)' }}>
          답을 보내지 못했어요.
          <button type="button" onClick={() => mine && void send(mine)} className="min-h-11 underline">
            다시 보내기
          </button>
        </div>
      )}
    </>
  );

  if (room === undefined) {
    return (
      <Shell>
        {alerts}
        {!error && !signInError && <p className="text-sm text-ink-2">방을 찾는 중…</p>}
      </Shell>
    );
  }

  if (room === null) {
    return (
      <Shell>
        <h1 className="font-cute text-3xl">방이 없어요</h1>
        <p className="text-sm text-ink-2">방장이 방을 닫았거나 코드가 틀렸어요.</p>
        <BackToLobby />
      </Shell>
    );
  }

  // 아직 들어가지 않은 사람
  if (!joined) {
    const full = room.playerIds.length >= room.maxPlayers;
    return (
      <Shell>
        <h1 className="font-cute text-3xl">친구 대결 {code}</h1>
        {alerts}
        {room.status !== 'waiting' || full ? (
          <>
            <p className="text-sm">{room.status !== 'waiting' ? JOIN_ERROR.started : JOIN_ERROR.full}</p>
            <BackToLobby />
          </>
        ) : (
          <form onSubmit={join} className="flex flex-col gap-3">
            <p className="num-tabular text-sm text-ink-2">
              {room.playerIds.length} / {room.maxPlayers}명 · {total}문제
            </p>
            {isGuest && (
              <label className="flex flex-col gap-1 text-sm">
                방에서 쓸 이름 (1~{ROOM_NICKNAME_MAX}자)
                <input
                  value={guestName}
                  onChange={(event) => setGuestName(event.target.value)}
                  maxLength={ROOM_NICKNAME_MAX}
                  className="min-h-14 rounded-option border px-3 text-lg"
                  style={{ borderColor: 'var(--line)', backgroundColor: 'var(--bg-card)' }}
                />
              </label>
            )}
            <button type="submit" disabled={busy || !uid} className="squishy font-cute min-h-14 text-xl disabled:opacity-60" style={primary}>
              참가하기
            </button>
          </form>
        )}
      </Shell>
    );
  }

  if (room.status === 'waiting') {
    const count = seats?.length ?? room.playerIds.length;
    return (
      <Shell>
        <h1 className="font-cute text-3xl">대기실</h1>
        {alerts}
        <section className="sticker flex flex-col items-center gap-2 p-4 text-center" aria-labelledby="code-title">
          <h2 id="code-title" className="text-sm text-ink-2">
            방 코드
          </h2>
          <p className="num-tabular font-cute text-4xl tracking-[0.3em]">{code}</p>
          <button type="button" onClick={() => void copyLink()} className="min-h-11 text-sm underline">
            {copied ? '링크를 복사했어요' : '초대 링크 복사'}
          </button>
        </section>
        <p className="num-tabular text-sm text-ink-2" aria-live="polite">
          {count} / {room.maxPlayers}명 · {total}문제 · 문제당 15초
        </p>
        <ul className="flex flex-col gap-2" aria-label="참가자">
          {(seats ?? []).map((seat) => (
            <li key={seat.uid} className="sticker flex min-h-12 items-center justify-between gap-2 px-3">
              <span className="font-semibold">
                {seat.nickname}
                {seat.uid === uid && <span className="text-ink-2"> (나)</span>}
              </span>
              {seat.uid === room.hostUid && <span className="text-xs text-ink-2">방장</span>}
            </li>
          ))}
        </ul>
        {isHost ? (
          <>
            <button
              type="button"
              disabled={busy || count < 2}
              onClick={() => void run(() => startRoom(code), '시작하지 못했어요. 다시 해 주세요.')}
              className="squishy font-cute min-h-14 text-xl disabled:opacity-60"
              style={primary}
            >
              시작하기
            </button>
            {count < 2 && <p className="text-xs text-ink-2">2명 이상이면 시작할 수 있어요. 코드를 친구에게 알려 주세요.</p>}
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(() => closeRoom(code, uid!), '방을 닫지 못했어요.', () => navigate('/room'))}
              className="min-h-12 rounded-option border-2 font-semibold"
              style={secondary}
            >
              방 닫기
            </button>
          </>
        ) : (
          <>
            <p className="text-sm text-ink-2">방장이 시작하기를 기다리는 중…</p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(() => leaveRoom(code, uid!), '나가지 못했어요.', () => navigate('/room'))}
              className="min-h-12 rounded-option border-2 font-semibold"
              style={secondary}
            >
              방에서 나가기
            </button>
          </>
        )}
      </Shell>
    );
  }

  if (room.status === 'finished') {
    return (
      <Shell>
        <Results table={table} uid={uid} total={total} />
        <p className="text-xs text-ink-2">기기에서 채점한 비공식 대결이에요. 랭킹·XP에는 들어가지 않아요.</p>
        <Link to="/room" className="squishy font-cute flex min-h-14 items-center justify-center text-xl" style={primary}>
          새 대결
        </Link>
        <Link to="/" className="flex min-h-11 items-center justify-center underline">
          메인으로
        </Link>
      </Shell>
    );
  }

  // 경기 중
  const answered = mine?.length ?? 0;
  const question = bank && answered < total ? bank.get(room.questionIds[answered]!) : undefined;

  return (
    <Shell>
      {alerts}
      {feedback ? (
        <section className="sticker flex flex-col gap-3 p-4" role="status">
          <p className="font-cute text-2xl" style={{ color: feedback.answer.correct ? 'var(--on-base)' : 'var(--out)' }}>
            {feedback.answer.correct ? `정답! +${pointsFor(feedback.answer)}점` : feedback.answer.choice ? '아쉬워요' : '시간 초과'}
          </p>
          <p className="text-sm text-ink-2">
            정답: {feedback.question.correct}.{' '}
            {feedback.question.options.find((option) => option.label === feedback.question.correct)?.text}
          </p>
          <button
            type="button"
            autoFocus
            onClick={() => setFeedback(null)}
            className="squishy font-cute min-h-14 text-xl"
            style={primary}
          >
            {answered < total ? '다음 문제' : '순위 보기'}
          </button>
        </section>
      ) : question ? (
        <>
          <p className="num-tabular text-sm text-ink-2" aria-live="polite">
            {answered + 1} / {total} · 내 점수 {scoreOf(mine ?? [])}
          </p>
          <QuestionView question={question} onAnswer={(choice, elapsed) => answer(question, choice, elapsed)} />
        </>
      ) : mine === null || !bank ? (
        <p className="text-sm text-ink-2">불러오는 중…</p>
      ) : (
        <section className="flex flex-col gap-3" aria-labelledby="wait-title">
          <h1 id="wait-title" className="font-cute text-3xl">
            다 풀었어요!
          </h1>
          <p className="text-sm text-ink-2">친구들이 끝나면 최종 순위가 나와요.</p>
          {isHost && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(() => finishRoom(code), '끝내지 못했어요.')}
              className="min-h-12 rounded-option border-2 font-semibold"
              style={secondary}
            >
              기다리지 않고 지금 끝내기
            </button>
          )}
        </section>
      )}
      <LiveBoard table={table} uid={uid} total={total} />
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-4 px-4 py-6">
      <Link to="/room" className="flex min-h-11 items-center self-start text-sm text-ink-2 underline">
        ◀ 나가기
      </Link>
      {children}
    </main>
  );
}

function BackToLobby() {
  return (
    <Link to="/room" className="squishy font-cute flex min-h-14 items-center justify-center text-xl" style={primary}>
      친구 대결로
    </Link>
  );
}

/** 경기 중 진행 상황 — 몇 문제 풀었는지와 점수. 자주 바뀌므로 낭독하지 않는다 */
function LiveBoard({ table, uid, total }: { table: Standing[]; uid: string | null; total: number }) {
  return (
    <section className="flex flex-col gap-2" aria-labelledby="live-title">
      <h2 id="live-title" className="text-sm font-semibold">
        지금 순위
      </h2>
      <ol className="flex flex-col gap-1 text-sm">
        {table.map((row) => (
          <li key={row.uid} className="num-tabular flex justify-between gap-2">
            <span>
              {row.rank}. {row.nickname}
              {row.uid === uid && ' (나)'}
            </span>
            <span className="text-ink-2">
              {row.answered}/{total} · {row.score}점
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Results({ table, uid, total }: { table: Standing[]; uid: string | null; total: number }) {
  const me = table.find((row) => row.uid === uid);
  return (
    <section className="flex flex-col gap-3" aria-labelledby="result-title">
      <h1 id="result-title" className="font-cute text-3xl">
        {me?.rank === 1 ? '우승!' : '최종 순위'}
      </h1>
      {me && (
        <p className="num-tabular text-sm">
          {table.length}명 중 {me.rank}위 · {me.score}점
        </p>
      )}
      <ol className="flex flex-col gap-2" aria-label="최종 순위">
        {table.map((row) => (
          <li
            key={row.uid}
            className="sticker num-tabular flex min-h-12 items-center justify-between gap-2 px-3"
            style={row.uid === uid ? { borderColor: 'var(--accent)' } : undefined}
          >
            <span className="font-semibold">
              {row.rank}위 {row.nickname}
              {row.uid === uid && <span className="text-ink-2"> (나)</span>}
            </span>
            <span className="text-sm">
              {row.score}점 · 정답 {row.correct}/{total}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
