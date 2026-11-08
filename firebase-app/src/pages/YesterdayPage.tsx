import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '@/auth/AuthProvider';
import { QuestionView } from '@/components/game/QuestionView';
import { SiteHeader } from '@/components/layout/SiteHeader';
import type { OptionLabel } from '@/content/questions';
import { startAsGuest } from '@/lib/auth/actions';
import { kstDate } from '@/lib/game/attendance';
import { createAttempt, loadAttempt, loadKey, loadLatestSet, markSignupClick, submitAnswer } from '@/lib/kbo/quiz';
import { KBO_QUESTION_MS, dateLabel, headlineOf, isPlayable, kboQuizOpen, type KboKey, type KboSet } from '@/lib/kbo/set';
import { playSound } from '@/lib/sound/sound';

const primary = { backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' };
const secondary = { borderColor: 'var(--line)', backgroundColor: 'var(--hero-button-bg)' };
const button = 'flex min-h-12 items-center justify-center rounded-option px-4 font-semibold';

type Result = { index: number; choice: OptionLabel | null; key: KboKey };
type Phase =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'empty' }
  | { kind: 'status'; set: KboSet }
  | { kind: 'intro'; set: KboSet }
  | { kind: 'question'; set: KboSet; index: number }
  | { kind: 'sending'; set: KboSet }
  | { kind: 'answered'; set: KboSet; index: number; result: Result }
  | { kind: 'done'; set: KboSet };

/**
 * 어제의 KBO 퀴즈(저장소 맨 위 docs/daily-kbo-quiz/03-design.md) — 비회원도 푼다. 정답은 기기에 없고, 답을 낸 뒤에야
 * 규칙이 그 문제의 정답을 연다. 점수는 공식 등수·출석에 들어가지 않는다.
 */
export function YesterdayPage() {
  const { user, isGuest } = useAuth();
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [results, setResults] = useState<Result[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const loadedFor = useRef<string | null>(null);
  const startingGuest = useRef(false);
  const open = kboQuizOpen(kstDate());
  const uid = user?.uid ?? null;

  /** 철회된 문제는 건너뛴다 — 규칙이 순서대로 답을 받으므로 빈 답을 남긴다 */
  const moveTo = useCallback(async (set: KboSet, signedInUid: string, from: number) => {
    let index = from;
    while (index < set.questions.length && set.withdrawn.includes(index)) {
      await submitAnswer(set.id, signedInUid, index, null);
      index += 1;
    }
    setPhase(index >= set.questions.length ? { kind: 'done', set } : { kind: 'question', set, index });
  }, []);

  useEffect(() => {
    if (!open) return;
    if (user === undefined) return;
    if (uid && loadedFor.current === uid) return;
    let cancelled = false;
    void (async () => {
      try {
        const { set } = await loadLatestSet();
        if (cancelled) return;
        if (!set) return setPhase({ kind: 'empty' });
        if (!isPlayable(set.kind)) return setPhase({ kind: 'status', set });
        // 풀 수 있는 묶음이 있을 때만 비회원 계정을 만든다(경기 없는 날에 계정을 늘리지 않는다)
        if (!uid) {
          if (!startingGuest.current) {
            startingGuest.current = true;
            await startAsGuest();
          }
          return;
        }
        loadedFor.current = uid;
        const attempt = await loadAttempt(set.id, uid);
        if (cancelled) return;
        if (!attempt) {
          await createAttempt(set.id, uid, set.questions.length, isGuest);
          if (!cancelled) setPhase({ kind: 'intro', set });
          return;
        }
        const answered = Object.keys(attempt.answers).length;
        if (answered === 0) return setPhase({ kind: 'intro', set });
        // 다시 들어와도 이미 낸 답과 정답을 보여 준다(정답 읽기는 낸 문제만)
        const shown = Object.keys(attempt.answers).map(Number).filter((index) => !set.withdrawn.includes(index));
        const keys = await Promise.all(shown.map((index) => loadKey(set.id, index)));
        if (cancelled) return;
        setResults(shown.map((index, position) => ({ index, choice: attempt.answers[String(index)] ?? null, key: keys[position]! })));
        await moveTo(set, uid, answered);
      } catch {
        loadedFor.current = null;
        if (!cancelled) setPhase({ kind: 'error' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, user, uid, isGuest, moveTo]);

  async function answer(set: KboSet, index: number, choice: OptionLabel | null) {
    if (!uid) return;
    setPhase({ kind: 'sending', set });
    setProblem(null);
    try {
      await submitAnswer(set.id, uid, index, choice);
      const key = await loadKey(set.id, index);
      const result = { index, choice, key };
      setResults((current) => [...current, result]);
      playSound(choice === key.correct ? 'hit' : 'out');
      setPhase({ kind: 'answered', set, index, result });
    } catch {
      setProblem('답을 보내지 못했어요. 연결을 확인하고 다시 들어와 주세요.');
      setPhase({ kind: 'error' });
    }
  }

  function next(set: KboSet, index: number) {
    if (!uid) return;
    moveTo(set, uid, index + 1).catch(() => setPhase({ kind: 'error' }));
  }

  const correctCount = results.filter((result) => result.choice === result.key.correct).length;
  const playable = (set: KboSet) => set.questions.length - set.withdrawn.length;

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-6 px-4 py-4">
      <SiteHeader />
      <main className="flex flex-col gap-4">
        <h1 className="font-cute text-3xl break-keep">어제의 KBO 퀴즈</h1>

        {!open && <p className="text-sm text-ink-2 break-keep">아직 열리지 않았어요. 곧 시작해요.</p>}
        {open && phase.kind === 'loading' && <p className="text-sm text-ink-2">불러오는 중…</p>}
        {open && phase.kind === 'error' && (
          <p role="alert" className="text-sm break-keep">
            {problem ?? '불러오지 못했어요. 잠시 뒤 다시 들어와 주세요.'}
          </p>
        )}
        {open && phase.kind === 'empty' && <Elsewhere title="오늘 퀴즈를 준비 중이에요" />}
        {open && phase.kind === 'status' && <Elsewhere title={headlineOf(phase.set)} />}

        {open && phase.kind === 'intro' && (
          <section aria-label="퀴즈 안내" className="sticker flex flex-col gap-3 p-4 break-keep">
            <p className="font-cute text-xl">{headlineOf(phase.set)}</p>
            <p className="text-sm">
              {phase.set.gamesDate && <>{dateLabel(phase.set.gamesDate)} 기록 · </>}4지선다 {playable(phase.set)}문제 · 문제마다 {KBO_QUESTION_MS / 1000}초
            </p>
            <p className="text-xs text-ink-2">답을 내면 바로 정답과 해설이 나와요. 낸 답은 고칠 수 없어요. 이 점수는 공식 등수에 들어가지 않아요.</p>
            <button type="button" className={button} style={primary} onClick={() => uid && moveTo(phase.set, uid, 0).catch(() => setPhase({ kind: 'error' }))}>
              시작
            </button>
          </section>
        )}

        {open && phase.kind === 'question' && (
          <div className="flex flex-col gap-2">
            <p className="num-tabular text-sm" aria-live="polite">
              {phase.index + 1} / {phase.set.questions.length}
            </p>
            <QuestionView
              key={phase.index}
              question={{ id: `${phase.set.id}-${phase.index}`, ...phase.set.questions[phase.index]! }}
              limitMs={KBO_QUESTION_MS}
              onAnswer={(choice) => void answer(phase.set, phase.index, choice)}
            />
          </div>
        )}
        {open && phase.kind === 'sending' && <p className="text-sm text-ink-2">확인하는 중…</p>}

        {open && phase.kind === 'answered' && (
          <section aria-label="결과" className="sticker flex flex-col gap-2 p-4 break-keep">
            <p role="status" className="font-cute text-2xl">
              {phase.result.choice === phase.result.key.correct ? '정답!' : phase.result.choice === null ? '시간 초과' : '아쉬워요'}
            </p>
            <Answer set={phase.set} result={phase.result} />
            <button type="button" className={`${button} mt-2`} style={primary} onClick={() => next(phase.set, phase.index)}>
              {phase.index + 1 < phase.set.questions.length ? '다음 문제' : '결과 보기'}
            </button>
          </section>
        )}

        {open && phase.kind === 'done' && (
          <section aria-label="최종 결과" className="flex flex-col gap-3">
            <p role="status" className="font-cute text-2xl break-keep">
              {results.length}문제 중 {correctCount}개 맞혔어요!
            </p>
            <div className="flex flex-col gap-2">
              {isGuest && uid && (
                <Link to="/auth?mode=signup" className={button} style={primary} onClick={() => void markSignupClick(phase.set.id, uid)}>
                  가입하고 기록 쌓기
                </Link>
              )}
              <Link to="/room" className={`${button} border-2`} style={secondary}>
                친구와 대결하기
              </Link>
              <Link to="/" className={`${button} border-2`} style={secondary}>
                메인으로
              </Link>
            </div>
            {isGuest && <p className="text-xs text-ink-2 break-keep">가입하면 지금까지 푼 기록이 그대로 이어져요. 출석과 월간 등수는 가입한 날부터 쌓여요.</p>}
            <ol className="flex flex-col gap-2">
              {results.map((result) => (
                <li key={result.index} className="sticker flex flex-col gap-1 p-3 break-keep">
                  <p className="text-sm font-semibold">{phase.set.questions[result.index]?.stem}</p>
                  <Answer set={phase.set} result={result} />
                </li>
              ))}
            </ol>
          </section>
        )}
      </main>
    </div>
  );
}

function Answer({ set, result }: { set: KboSet; result: Result }) {
  const options = set.questions[result.index]?.options ?? [];
  const text = (label: OptionLabel | null) => options.find((option) => option.label === label)?.text ?? '답 없음';
  return (
    <>
      <p className="text-sm">
        정답: <strong>{text(result.key.correct)}</strong>
        {result.choice !== result.key.correct && <span className="text-ink-2"> · 내 답: {text(result.choice)}</span>}
      </p>
      <p className="text-sm text-ink-2">{result.key.explanation}</p>
      <p className="text-xs text-ink-2">
        출처{' '}
        <a href={result.key.sourceUrl} target="_blank" rel="noreferrer noopener" className="underline">
          {result.key.sourceName}
        </a>{' '}
        · 기준일 {result.key.recordAsOf}
      </p>
    </>
  );
}

function Elsewhere({ title }: { title: string }) {
  return (
    <section className="sticker flex flex-col gap-3 p-4 break-keep">
      <p role="status" className="font-cute text-xl">
        {title}
      </p>
      <p className="text-sm text-ink-2">오늘의 1이닝이나 개인 경기는 언제든 할 수 있어요.</p>
      <Link to="/daily" className={button} style={primary}>
        오늘의 1이닝
      </Link>
      <Link to="/" className={`${button} border-2`} style={secondary}>
        메인으로
      </Link>
    </section>
  );
}
