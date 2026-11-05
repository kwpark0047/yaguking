import { useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '@/auth/AuthProvider';
import { HAS_ACCOUNTS } from '@/lib/platform/features';
import { QuestionView } from '@/components/game/QuestionView';
import type { OptionLabel, Question } from '@/content/questions';
import { LIMIT_MS } from '@/lib/engine';
import { kstDate } from '@/lib/game/attendance';
import {
  HINT_COST,
  HINT_DESCRIPTION,
  HINT_ORDER,
  HINT_TIME_MS,
  HINT_TITLE,
  chosungHint,
  fiftyFifty,
  hintsOpen,
  type HintKind,
} from '@/lib/game/hints';

const NONE: readonly OptionLabel[] = [];
const line = { borderColor: 'var(--line)' };

/**
 * 힌트가 있는 문제 — 비공식 경기(개인 경기·오늘의 1이닝·오답노트 복습)에서만 쓴다(docs/hint-plan.md).
 * 공식전·레벨 테스트·친구 대결은 QuestionView를 그대로 쓴다. 문제마다 새로 그리도록 key={question.id}로 넣는다.
 * 시간은 힌트 창을 열어도 계속 흐른다. 포인트는 서버가 받아들인 뒤에야 힌트가 보인다.
 * Firestore를 쓰는 지갑은 회원이 힌트 창을 처음 열 때 불러온다(오늘의 1이닝은 로그인 없이도 Firestore를 부르지 않는다).
 */
export function QuestionWithHints({
  question,
  onAnswer,
  limitMs = LIMIT_MS,
  fresh = false,
  timerNote,
  hintsLeft,
}: {
  question: Question;
  /** hint: 이 문제에 쓴 힌트 */
  onAnswer: (choice: OptionLabel | null, elapsedMs: number, hint: HintKind | null) => void;
  limitMs?: number;
  fresh?: boolean;
  timerNote?: string;
  /** 이 경기에 더 쓸 수 있는 힌트 수 */
  hintsLeft: number;
}) {
  const { user, isGuest, profile } = useAuth();
  const member = !!user && !isGuest && profile.status === 'ready' && profile.ageConfirmed;
  const [panel, setPanel] = useState(false);
  const [points, setPoints] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [used, setUsed] = useState<HintKind | null>(null);

  const answer = (choice: OptionLabel | null, elapsedMs: number) => onAnswer(choice, elapsedMs, used);
  const shared = { question, fresh, timerNote, onAnswer: answer };
  if (!HAS_ACCOUNTS || !hintsOpen(kstDate())) return <QuestionView {...shared} limitMs={limitMs} />;

  async function openPanel() {
    setPanel((value) => !value);
    if (!member || points !== null) return;
    try {
      const { loadWallet } = await import('@/lib/game/wallet');
      setPoints(await loadWallet(user!.uid));
    } catch {
      setMessage('포인트를 불러오지 못했어요. 연결을 확인해 주세요.');
    }
  }

  async function spend(kind: HintKind) {
    setBusy(true);
    setMessage(null);
    const wallet = await import('@/lib/game/wallet');
    try {
      setPoints(await wallet.spendHint(user!.uid, HINT_COST[kind]));
      setUsed(kind);
      setPanel(false);
    } catch (error) {
      setMessage(error instanceof wallet.NotEnoughPoints ? '포인트가 모자라요.' : '힌트를 쓰지 못했어요. 포인트는 빠지지 않았어요. 연결을 확인해 주세요.');
    } finally {
      setBusy(false);
    }
  }

  const hintSlot = used ? (
    <p role="status" className="g-meta font-semibold break-keep">
      <span aria-hidden="true">💡 </span>
      {used === 'chosung' ? (
        <>
          정답의 초성: <span className="font-cute text-lg">{chosungHint(question)}</span>
        </>
      ) : used === 'fifty' ? (
        '틀린 보기 둘을 지웠어요'
      ) : (
        '시간을 5초 더 받았어요'
      )}
      {used !== 'time' && <span className="font-normal text-ink-2"> · 맞혀도 2루타까지</span>}
    </p>
  ) : (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        aria-expanded={panel}
        disabled={hintsLeft <= 0}
        onClick={() => void openPanel()}
        className="flex min-h-11 items-center self-start rounded-option border-2 px-3 text-sm font-semibold disabled:opacity-50"
        style={line}
      >
        <span aria-hidden="true">💡&nbsp;</span>
        {hintsLeft > 0 ? '힌트' : '이 경기 힌트를 다 썼어요'}
      </button>
      {panel &&
        (member ? (
          <div role="group" aria-label="힌트 고르기" className="flex flex-col gap-2 text-sm break-keep">
            <p>
              쓸 수 있는 포인트 <strong className="num-tabular">{points === null ? '…' : `${points}P`}</strong>
            </p>
            {HINT_ORDER.map((kind) => (
              <button
                key={kind}
                type="button"
                disabled={busy || points === null || points < HINT_COST[kind]}
                onClick={() => void spend(kind)}
                className="flex min-h-11 items-center justify-between gap-2 rounded-option border-2 px-3 text-left disabled:opacity-50"
                style={line}
              >
                <span>
                  <strong>{HINT_TITLE[kind]}</strong> <span className="text-ink-2">{HINT_DESCRIPTION[kind]}</span>
                </span>
                <span className="num-tabular shrink-0 font-semibold">{HINT_COST[kind]}P</span>
              </button>
            ))}
            {points !== null && points < Math.min(...HINT_ORDER.map((kind) => HINT_COST[kind])) && (
              <p className="text-ink-2">포인트가 모자라요. 출석하면 하루 10P가 쌓여요(다음 날 0시에 들어와요).</p>
            )}
            <p className="text-xs text-ink-2">반반·초성을 쓰면 맞혀도 2루타까지예요. 등수 포인트는 줄지 않아요. 시간은 계속 흘러요.</p>
            {message && <p role="alert" style={{ color: 'var(--out)' }}>{message}</p>}
          </div>
        ) : (
          <p className="text-sm break-keep">
            힌트는 출석 포인트로 써요.{' '}
            <Link to="/auth?mode=signup&returnTo=%2F" className="font-semibold underline">
              가입하고 출석하기
            </Link>
          </p>
        ))}
    </div>
  );

  return (
    <QuestionView
      {...shared}
      limitMs={limitMs + (used === 'time' ? HINT_TIME_MS : 0)}
      hidden={used === 'fifty' ? fiftyFifty(question) : NONE}
      hintSlot={hintSlot}
      fitKey={`${panel}-${used}`}
    />
  );
}
