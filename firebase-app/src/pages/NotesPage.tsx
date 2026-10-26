import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router';
import { useAuth } from '@/auth/AuthProvider';
import { QuestionView } from '@/components/game/QuestionView';
import { loadQuestions, type OptionLabel, type Question } from '@/content/questions';
import { LIMIT_MS } from '@/lib/engine';
import { byId, loadWrongNotes, saveReview, type WrongNote } from '@/lib/game/persist';
import { REVIEW_DAYS, dueNotes } from '@/lib/game/review';

type Mode =
  | { kind: 'list' }
  | { kind: 'review'; queue: WrongNote[]; index: number }
  | { kind: 'reviewFeedback'; queue: WrongNote[]; index: number; correct: boolean };

const dateText = (ms: number) =>
  new Date(ms).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', timeZone: 'Asia/Seoul' });

/**
 * 오답노트 — 틀린 문항을 1·3·7·14일 간격으로 다시 푼다(01 PRD F08).
 * 비회원도 쓴다(가입하면 그대로 이어진다). 한 번에 최대 100개를 읽는다(무료 읽기 한도).
 */
export function NotesPage() {
  const { user } = useAuth();
  const [notes, setNotes] = useState<WrongNote[] | null>(null);
  const [bank, setBank] = useState<Map<string, Question>>(new Map());
  const [mode, setMode] = useState<Mode>({ kind: 'list' });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    Promise.all([loadWrongNotes(user.uid), loadQuestions()])
      .then(([loaded, questions]) => {
        setNotes(loaded);
        setBank(byId(questions));
      })
      .catch(() => setError('오답노트를 불러오지 못했어요. 연결을 확인해 주세요.'));
  }, [user]);

  const due = useMemo(() => dueNotes(notes ?? [], Date.now()), [notes]);

  if (user === undefined) return null;
  if (user === null) return <Navigate to="/" replace />;

  async function answer(note: WrongNote, queue: WrongNote[], index: number, choice: OptionLabel | null, elapsed: number) {
    const question = bank.get(note.questionId);
    const correct = !!question && choice === question.correct && elapsed <= LIMIT_MS;
    setMode({ kind: 'reviewFeedback', queue, index, correct });
    try {
      const updated = await saveReview(user!.uid, note, correct);
      setNotes((current) => current?.map((item) => (item.questionId === updated.questionId ? updated : item)) ?? null);
    } catch {
      setError('복습 결과를 저장하지 못했어요.');
    }
  }

  const current = mode.kind !== 'list' ? mode.queue[mode.index] : undefined;
  const question = current ? bank.get(current.questionId) : undefined;

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-4 px-4 py-6">
      <Link to="/" className="flex min-h-11 items-center self-start text-sm text-ink-2 underline">
        ← 야구왕
      </Link>
      <h1 className="font-cute text-3xl">오답노트</h1>

      {error && (
        <p role="alert" className="text-sm" style={{ color: 'var(--out)' }}>
          {error}
        </p>
      )}

      {mode.kind === 'list' && notes === null && !error && <p className="text-sm text-ink-2">불러오는 중…</p>}

      {mode.kind === 'list' && notes !== null && (
        <>
          <p className="text-sm text-ink-2 break-keep">
            틀린 문제는 {REVIEW_DAYS.join('·')}일 뒤에 다시 나와요. 14일 복습까지 맞히면 익힌 문제가 돼요.
          </p>
          {notes.length === 0 ? (
            <p className="sticker p-4 text-sm">아직 틀린 문제가 없어요. 한 판 해 볼까요?</p>
          ) : (
            <>
              <button
                type="button"
                disabled={due.length === 0}
                onClick={() => setMode({ kind: 'review', queue: due, index: 0 })}
                className="squishy font-cute min-h-14 text-xl disabled:opacity-60"
                style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
              >
                {due.length > 0 ? `복습 시작 (${due.length}문제)` : '오늘 복습할 문제가 없어요'}
              </button>
              <ul className="flex flex-col gap-2" aria-label="틀린 문제">
                {notes.map((note) => {
                  const item = bank.get(note.questionId);
                  return (
                    <li key={note.questionId} className="sticker flex flex-col gap-1 p-3">
                      <p className="text-sm break-keep">{item?.stem ?? '지금은 없는 문제예요'}</p>
                      <p className="text-xs text-ink-2">
                        {note.mastered
                          ? '익힌 문제'
                          : `틀린 횟수 ${note.wrongCount} · 다음 복습 ${dateText(note.nextReviewAt)}`}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </>
      )}

      {mode.kind === 'review' && current && question && (
        <>
          <p className="num-tabular text-sm text-ink-2" aria-live="polite">
            복습 {mode.index + 1} / {mode.queue.length}
          </p>
          <QuestionView
            question={question}
            onAnswer={(choice, elapsed) => void answer(current, mode.queue, mode.index, choice, elapsed)}
          />
        </>
      )}

      {mode.kind === 'reviewFeedback' && question && (
        <section className="sticker flex flex-col gap-3 p-4" role="status">
          <p className="font-cute text-2xl" style={{ color: mode.correct ? 'var(--on-base)' : 'var(--out)' }}>
            {mode.correct ? '정답! 다음 복습은 더 뒤에 나와요' : '다시 틀렸어요. 내일 또 나와요'}
          </p>
          <p className="text-sm text-ink-2">
            정답: {question.correct}. {question.options.find((option) => option.label === question.correct)?.text}
          </p>
          {question.explanation && <p className="text-sm break-keep">{question.explanation}</p>}
          <button
            type="button"
            autoFocus
            onClick={() =>
              mode.index + 1 < mode.queue.length
                ? setMode({ kind: 'review', queue: mode.queue, index: mode.index + 1 })
                : setMode({ kind: 'list' })
            }
            className="squishy font-cute min-h-14 text-xl"
            style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
          >
            {mode.index + 1 < mode.queue.length ? '다음 복습' : '목록으로'}
          </button>
        </section>
      )}
    </main>
  );
}
