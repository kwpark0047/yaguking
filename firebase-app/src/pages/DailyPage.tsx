import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { TextSizeToggle } from '@/components/display/DisplaySettings';
import { LoadingBall, SoundToggle } from '@/components/effects/Effects';
import { QuestionView } from '@/components/game/QuestionView';
import { loadQuestions, type Question } from '@/content/questions';
import { LIMIT_MS, resolveAtBat, type AtBatResult } from '@/lib/engine';
import { celebrate } from '@/lib/effects/celebrate';
import { kstDate } from '@/lib/game/attendance';
import {
  DAILY_TOTAL,
  dailySummary,
  loadDaily,
  pickDaily,
  recordAtBat,
  resultEmoji,
  shareText,
  todayRecord,
  type DailyRecord,
} from '@/lib/game/daily';
import { RESULT_PRESENTATION, resultLabel } from '@/lib/game/labels';
import { extraTimeFor, judgedElapsed } from '@/lib/game/match';
import { playSound, verdictSound } from '@/lib/sound/sound';

const primary = { backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' };
const secondary = { borderColor: 'var(--line)' };

type Phase =
  | { kind: 'loading' }
  | { kind: 'question'; index: number }
  | { kind: 'verdict'; index: number; result: AtBatResult; timedOut: boolean }
  | { kind: 'done' };

/**
 * 오늘의 1이닝(docs/retention-plan.md A) — 모두 같은 3문제, 하루 한 번. 기기에서만 채점·저장한다(Firestore를 쓰지 않아
 * 로그인 없이도, 비회원 하루 3판과 따로). 첫 문제 20초·판정은 개인 경기와 같다. 끝나면 이모지 한 줄로 공유.
 */
export function DailyPage() {
  const today = kstDate();
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [record, setRecord] = useState<DailyRecord>(() => todayRecord(loadDaily(), today));
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const streak = useRef(0);

  useEffect(() => {
    let cancelled = false;
    loadQuestions()
      .then((bank) => {
        if (cancelled) return;
        setQuestions(pickDaily(bank, today));
        // 진행은 기기 기록에서 이어진다(중간에 닫았으면 다음 문제부터)
        const done = todayRecord(loadDaily(), today).results.length;
        setPhase(done >= DAILY_TOTAL ? { kind: 'done' } : { kind: 'question', index: done });
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [today]);

  function answer(question: Question, index: number, choice: string | null, elapsedMs: number) {
    const judged = judgedElapsed(elapsedMs, extraTimeFor(index), choice !== null);
    const verdict = resolveAtBat(choice === question.correct, judged, question.difficulty, streak.current);
    streak.current = verdict.streakAfter;
    // 답하자마자 기기에 남긴다 — 다시 열어도 같은 문제를 다시 풀 수 없다
    setRecord(recordAtBat(record, today, verdict.result));
    setPhase({ kind: 'verdict', index, result: verdict.result, timedOut: choice === null });
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col">
      <header className="flex items-center justify-between gap-2 px-4 py-2">
        <Link to="/" className="flex min-h-11 shrink-0 items-center text-sm whitespace-nowrap text-ink-2 underline">
          ◀ 나가기
        </Link>
        <span className="min-w-0 truncate rounded-full px-3 py-1 text-xs font-semibold" style={{ backgroundColor: 'var(--bg-card)' }}>
          오늘의 1이닝 · {Number(today.slice(5, 7))}월 {Number(today.slice(8, 10))}일
        </span>
        <span className="flex shrink-0 items-center gap-1">
          <TextSizeToggle />
          <SoundToggle />
        </span>
      </header>

      <main className="flex flex-1 flex-col gap-4 px-4 py-4">
        {failed && <p role="alert">문제를 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.</p>}
        {!failed && phase.kind === 'loading' && <LoadingBall label="오늘의 문제를 준비하는 중…" />}

        {questions && phase.kind === 'question' && questions[phase.index] && (
          <>
            <p className="text-sm text-ink-2" aria-live="polite">
              {phase.index + 1} / {DAILY_TOTAL}번째 공 <span aria-hidden="true">{record.results.map(resultEmoji).join('')}</span>
            </p>
            <QuestionView
              question={questions[phase.index]!}
              limitMs={LIMIT_MS + extraTimeFor(phase.index)}
              timerNote={phase.index === 0 ? '첫 문제는 20초' : undefined}
              onAnswer={(choice, elapsed) => answer(questions[phase.index]!, phase.index, choice, elapsed)}
            />
          </>
        )}

        {questions && phase.kind === 'verdict' && questions[phase.index] && (
          <DailyVerdict
            question={questions[phase.index]!}
            result={phase.result}
            timedOut={phase.timedOut}
            last={phase.index + 1 >= DAILY_TOTAL}
            onNext={() => setPhase(phase.index + 1 >= DAILY_TOTAL ? { kind: 'done' } : { kind: 'question', index: phase.index + 1 })}
          />
        )}

        {phase.kind === 'done' && <DailyResult today={today} record={record} />}
      </main>
    </div>
  );
}

function DailyVerdict({
  question,
  result,
  timedOut,
  last,
  onNext,
}: {
  question: Question;
  result: AtBatResult;
  timedOut: boolean;
  last: boolean;
  onNext: () => void;
}) {
  const presentation = RESULT_PRESENTATION[result];
  const tone = presentation.tone === 'hr' ? 'var(--hr)' : presentation.tone === 'out' ? 'var(--out)' : 'var(--on-base)';
  const correct = question.options.find((option) => option.label === question.correct);
  const next = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    next.current?.focus();
    if (result === 'HR') celebrate({ kind: 'homeRun' });
    playSound(verdictSound(result, timedOut));
  }, [result, timedOut]);
  return (
    <section className="sticker flex flex-col gap-3 p-4" aria-labelledby="daily-verdict">
      <div role="status" className="flex flex-col gap-2">
        <p id="daily-verdict" className="g-verdict flex items-center gap-2 font-bold" style={{ color: tone }}>
          <span aria-hidden="true">{presentation.icon}</span>
          {resultLabel(result, timedOut)}
        </p>
        <p className="g-num text-ink-2">
          정답: {question.correct}. {correct?.text}
        </p>
      </div>
      {question.explanation && <p className="text-sm leading-relaxed break-keep">{question.explanation}</p>}
      <p className="text-xs text-ink-2">
        출처: {question.source.name} (검증 {question.source.verifiedAt})
      </p>
      <button ref={next} type="button" onClick={onNext} className="squishy font-cute min-h-14 text-xl" style={primary}>
        {last ? '결과 보기' : '다음 문제'}
      </button>
    </section>
  );
}

function DailyResult({ today, record }: { today: string; record: DailyRecord }) {
  const [shared, setShared] = useState<string | null>(null);
  const text = shareText(today, record.results, record.streak, `${location.origin}/daily`);

  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({ text });
        return;
      }
      await navigator.clipboard.writeText(text);
      setShared('결과를 복사했어요. 친구에게 붙여 넣어 보내 보세요.');
    } catch (error) {
      // 공유 창을 닫은 것(AbortError)은 실패가 아니다
      if ((error as Error).name !== 'AbortError') setShared('복사하지 못했어요. 아래 글을 길게 눌러 복사해 주세요.');
    }
  }

  return (
    <section className="sticker flex flex-col gap-3 p-4" aria-labelledby="daily-result">
      <h1 id="daily-result" className="font-cute text-2xl">
        오늘의 1이닝 끝!
      </h1>
      <p className="text-3xl" aria-label={dailySummary(record.results)}>
        {record.results.map(resultEmoji).join('')}
      </p>
      <p className="font-semibold">{dailySummary(record.results)}</p>
      <p className="text-sm text-ink-2">
        연속 {record.streak}일 · 최고 {record.best}일 · 내일 새 문제 3개가 나와요
      </p>
      <pre className="rounded-option border-2 p-3 text-sm whitespace-pre-wrap" style={secondary} aria-label="공유할 글">
        {text}
      </pre>
      <button type="button" onClick={() => void share()} className="squishy font-cute min-h-14 text-xl" style={primary}>
        결과 공유하기
      </button>
      {shared && <p role="status" className="text-sm">{shared}</p>}
      <div className="flex flex-col gap-2">
        <Link to="/play" className="flex min-h-14 items-center justify-center rounded-option border-2 font-semibold" style={secondary}>
          1이닝 경기 하러 가기
        </Link>
        <Link to="/" className="flex min-h-11 items-center justify-center text-sm underline">
          홈으로
        </Link>
      </div>
      <p className="text-xs text-ink-2">점수는 이 기기에서만 채점하는 비공식 기록이에요(등수에 들어가지 않아요).</p>
    </section>
  );
}
