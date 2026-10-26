import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '@/auth/AuthProvider';
import { BoxScore } from '@/components/game/BoxScore';
import { QuestionView } from '@/components/game/QuestionView';
import { ScoreBoard } from '@/components/game/ScoreBoard';
import { loadQuestions, type OptionLabel, type Question } from '@/content/questions';
import { startAsGuest } from '@/lib/auth/actions';
import { authErrorMessage } from '@/lib/auth/messages';
import { formatElapsed, RESULT_PRESENTATION, resultLabel, UPGRADE_LABEL } from '@/lib/game/labels';
import {
  answerAtBat,
  boxScoreOf,
  isFinished,
  pickQuestion,
  plannedDifficulty,
  startMatch,
  xpOf,
  type Match,
  type PlayedAtBat,
} from '@/lib/game/match';
import { guestGamesLeft, recentlySeen, rememberSeen, saveMatch } from '@/lib/game/persist';

type Phase =
  | { kind: 'loading' }
  | { kind: 'limit' }
  | { kind: 'error'; message: string }
  | { kind: 'question'; question: Question }
  | { kind: 'verdict'; question: Question; atBat: PlayedAtBat }
  | { kind: 'saving' }
  | { kind: 'done'; wrongSaved: number; saveFailed: boolean };

/**
 * 개인 퀴즈 — 1이닝(3아웃). **비공식**: 정답과 시계가 기기에 있다.
 *
 * - 로그인하지 않았으면 비회원(익명)으로 바로 시작한다 — 첫 투구까지 0탭(08 문서 §3)
 * - 비회원은 하루 2판(보안 규칙이 막고, 화면이 미리 알린다)
 * - 경기는 끝날 때 한 번만 저장한다(무료 쓰기 한도). 틀린 문항은 오답노트로
 */
export function PlayPage() {
  const { user, isGuest } = useAuth();
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [match, setMatch] = useState<Match>(startMatch);
  const [guestLeft, setGuestLeft] = useState<number | null>(null);
  const bank = useRef<Question[]>([]);
  const used = useRef(new Set<string>());
  const seen = useRef(new Set<string>());
  const starting = useRef(false);

  const nextQuestion = useCallback((current: Match) => {
    const difficulty = plannedDifficulty(current.atBats.length + 1, Math.random());
    return pickQuestion(bank.current, difficulty, used.current, seen.current, Math.random);
  }, []);

  const begin = useCallback(async () => {
    const fresh = startMatch();
    setMatch(fresh);
    used.current = new Set();
    seen.current = recentlySeen();
    const first = nextQuestion(fresh);
    if (!first) {
      setPhase({ kind: 'error', message: '출제할 문항이 없어요.' });
      return;
    }
    used.current.add(first.id);
    setPhase({ kind: 'question', question: first });
  }, [nextQuestion]);

  // 로그인 확인(없으면 비회원으로) → 비회원 남은 판 → 문제은행 → 시작
  useEffect(() => {
    if (user === undefined || starting.current) return;
    if (user === null) {
      starting.current = true;
      startAsGuest()
        .catch((error) => setPhase({ kind: 'error', message: authErrorMessage(error) }))
        .finally(() => {
          starting.current = false;
        });
      return;
    }
    starting.current = true;
    void (async () => {
      try {
        if (user.isAnonymous) {
          const left = await guestGamesLeft(user.uid);
          setGuestLeft(left);
          if (left <= 0) {
            setPhase({ kind: 'limit' });
            return;
          }
        }
        bank.current = await loadQuestions();
        await begin();
      } catch {
        setPhase({ kind: 'error', message: '경기를 준비하지 못했어요. 연결을 확인해 주세요.' });
      }
    })();
  }, [user, begin]);

  function answer(question: Question, choice: OptionLabel | null, elapsedMs: number) {
    const { match: next, atBat } = answerAtBat(match, question, choice, elapsedMs);
    setMatch(next);
    setPhase({ kind: 'verdict', question, atBat });
  }

  async function finish(final: Match) {
    if (!user) return;
    setPhase({ kind: 'saving' });
    rememberSeen(final.atBats.map((atBat) => atBat.questionId));
    try {
      const { wrongSaved } = await saveMatch({
        uid: user.uid,
        isGuest: user.isAnonymous,
        mode: 'practice',
        atBats: final.atBats,
        runs: final.state.runs,
        xp: xpOf(final.atBats, final.state.finished),
      });
      if (user.isAnonymous) setGuestLeft((left) => (left === null ? null : Math.max(0, left - 1)));
      setPhase({ kind: 'done', wrongSaved, saveFailed: false });
    } catch {
      setPhase({ kind: 'done', wrongSaved: 0, saveFailed: true });
    }
  }

  function next() {
    if (isFinished(match)) {
      void finish(match);
      return;
    }
    const question = nextQuestion(match);
    if (!question) {
      void finish(match);
      return;
    }
    used.current.add(question.id);
    setPhase({ kind: 'question', question });
  }

  const scoreboard = {
    inning: Math.min(match.state.inning, 1),
    outs: match.state.inningEnded ? 3 : match.state.outs,
    bases: match.state.bases,
    runs: match.state.runs,
    streak: match.streak,
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col">
      <header className="flex items-center justify-between gap-2 px-4 py-2">
        <Link to="/" className="flex min-h-11 items-center text-sm text-ink-2 underline">
          ◀ 나가기
        </Link>
        <span className="rounded-full px-3 py-1 text-xs font-semibold" style={{ backgroundColor: 'var(--bg-card)' }}>
          비공식 1이닝{isGuest && guestLeft !== null ? ` · 오늘 ${guestLeft}판 남음` : ''}
        </span>
      </header>

      {(phase.kind === 'question' || phase.kind === 'verdict') && (
        <ScoreBoard scoreboard={scoreboard} inningsTarget={1} />
      )}

      <main className="flex flex-1 flex-col gap-4 px-4 py-4">
        {phase.kind === 'loading' && <p className="text-sm text-ink-2">경기를 준비하는 중…</p>}

        {phase.kind === 'error' && (
          <p role="alert" className="text-sm" style={{ color: 'var(--out)' }}>
            {phase.message}
          </p>
        )}

        {phase.kind === 'limit' && (
          <section className="sticker flex flex-col gap-3 p-5" aria-labelledby="limit-title">
            <h1 id="limit-title" className="font-cute text-2xl">
              오늘 비회원 경기를 다 했어요
            </h1>
            <p className="text-sm text-ink-2 break-keep">
              비회원은 하루 2판까지예요. 가입하면 지금까지의 기록이 그대로 이어지고 제한 없이 할 수 있어요.
            </p>
            <Link
              to="/auth?mode=signup&returnTo=%2Fplay"
              className="squishy font-cute flex min-h-14 items-center justify-center text-xl"
              style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
            >
              가입하기
            </Link>
          </section>
        )}

        {phase.kind === 'question' && (
          <QuestionView
            question={phase.question}
            onAnswer={(choice, elapsed) => answer(phase.question, choice, elapsed)}
          />
        )}

        {phase.kind === 'verdict' && (
          <Verdict
            question={phase.question}
            atBat={phase.atBat}
            last={isFinished(match)}
            onNext={next}
          />
        )}

        {phase.kind === 'saving' && <p className="text-sm text-ink-2">기록을 저장하는 중…</p>}

        {phase.kind === 'done' && (
          <Results
            match={match}
            wrongSaved={phase.wrongSaved}
            saveFailed={phase.saveFailed}
            onRetrySave={() => void finish(match)}
            canPlayAgain={!isGuest || (guestLeft ?? 0) > 0}
            onPlayAgain={() => void begin()}
          />
        )}
      </main>
    </div>
  );
}

function Verdict({
  question,
  atBat,
  last,
  onNext,
}: {
  question: Question;
  atBat: PlayedAtBat;
  last: boolean;
  onNext: () => void;
}) {
  const presentation = RESULT_PRESENTATION[atBat.result];
  const timedOut = atBat.choice === null;
  const tone = presentation.tone === 'hr' ? 'var(--hr)' : presentation.tone === 'out' ? 'var(--out)' : 'var(--on-base)';
  const correctOption = question.options.find((option) => option.label === question.correct);
  const nextButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    nextButton.current?.focus();
  }, []);

  return (
    <section className="sticker flex flex-col gap-3 p-4" aria-labelledby="verdict-title">
      <div role="status" className="flex flex-col gap-2">
        <p id="verdict-title" className="flex items-center gap-2 text-xl font-bold" style={{ color: tone }}>
          <span aria-hidden="true">{presentation.icon}</span>
          {resultLabel(atBat.result, timedOut)}
          {atBat.rbi > 0 && <span className="num-tabular text-sm text-ink-2">{atBat.rbi}타점</span>}
        </p>
        {atBat.upgradeReason && (
          <p className="text-sm" style={{ color: 'var(--accent)' }}>
            {UPGRADE_LABEL[atBat.upgradeReason]}
          </p>
        )}
        <p className="text-sm text-ink-2">
          정답: {question.correct}. {correctOption?.text}
        </p>
        <p className="num-tabular text-xs text-ink-2">
          응답 {timedOut ? '시간 초과' : formatElapsed(atBat.elapsedMs)}
        </p>
      </div>
      {question.explanation && <p className="text-sm leading-relaxed break-keep">{question.explanation}</p>}
      <p className="text-xs text-ink-2">
        출처: {question.source.name} (검증 {question.source.verifiedAt})
      </p>
      <button
        ref={nextButton}
        type="button"
        onClick={onNext}
        className="squishy font-cute min-h-14 text-xl"
        style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
      >
        {last ? '결과 보기' : '다음 타석'}
      </button>
    </section>
  );
}

function Results({
  match,
  wrongSaved,
  saveFailed,
  onRetrySave,
  canPlayAgain,
  onPlayAgain,
}: {
  match: Match;
  wrongSaved: number;
  saveFailed: boolean;
  onRetrySave: () => void;
  canPlayAgain: boolean;
  onPlayAgain: () => void;
}) {
  const box = boxScoreOf(match);
  const xp = xpOf(match.atBats, match.state.finished);

  return (
    <section className="flex flex-col gap-4" aria-labelledby="result-title">
      <h1 id="result-title" className="font-cute text-center text-3xl">
        경기 종료 · <span className="num-tabular">{match.state.runs}</span>득점
      </h1>
      <BoxScore box={box} runs={match.state.runs} />
      <p className="text-center text-sm text-ink-2">
        비공식 XP <span className="num-tabular font-semibold">+{xp}</span>
        {wrongSaved > 0 && ` · 틀린 ${wrongSaved}문항을 오답노트에 담았어요`}
      </p>
      {saveFailed && (
        <div role="alert" className="flex flex-col gap-2 text-sm" style={{ color: 'var(--out)' }}>
          기록을 저장하지 못했어요.
          <button type="button" onClick={onRetrySave} className="min-h-11 underline">
            다시 저장하기
          </button>
        </div>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        {canPlayAgain && (
          <button
            type="button"
            onClick={onPlayAgain}
            className="squishy font-cute min-h-14 flex-1 text-xl"
            style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
          >
            한 판 더
          </button>
        )}
        <Link
          to="/notes"
          className="flex min-h-14 flex-1 items-center justify-center rounded-option border-2 font-semibold"
          style={{ borderColor: 'var(--line)' }}
        >
          오답노트
        </Link>
      </div>
    </section>
  );
}
