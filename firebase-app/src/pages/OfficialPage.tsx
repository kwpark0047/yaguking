import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '@/auth/AuthProvider';
import { TextSizeToggle } from '@/components/display/DisplaySettings';
import { QuestionView } from '@/components/game/QuestionView';
import { engagementOpen, kstDate } from '@/lib/game/attendance';
import { OFFICIAL_POINTS, OFFICIAL_QUESTION_MS, OFFICIAL_TOTAL, gradeAttempt, roundIdOf } from '@/lib/game/official';
import {
  loadAttempt,
  loadQuestion,
  loadRound,
  startAttempt,
  submitAnswer,
  type OfficialAttempt,
  type OfficialQuestion,
  type OfficialRound,
} from '@/lib/game/officialRound';
import { playSound } from '@/lib/sound/sound';

const primary = { backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' };
const DAY = 86_400_000;

type Phase =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'none' }
  | { kind: 'ready'; round: OfficialRound }
  | { kind: 'playing'; round: OfficialRound; index: number; question: OfficialQuestion }
  | { kind: 'sending' }
  | { kind: 'done'; answered: number; total: number };

/** 규칙의 기한(문항당 16초 + 1초, 시작 시각부터) — 화면은 넘었는지 짐작만 한다(정하는 것은 규칙) */
const deadlineOf = (attempt: OfficialAttempt) => attempt.startedAt + (attempt.total * 16 + 1) * 1000;

/**
 * 오늘의 공식전(docs/engagement-plan.md §5) — 하루 한 번 5문제, 정답은 기기에 없다. 문제는 하나씩 열리고 답마다 서버
 * 시각이 찍힌다. 판정·점수는 다음 날 새벽 운영자 PC가 하고, 그 점수가 월간 등수에 들어간다.
 * 어제 공식전이 판정됐으면 내 결과와 정답·해설을 보여 준다.
 */
export function OfficialPage() {
  const { user, isGuest, profile } = useAuth();
  const member = !!user && !isGuest && profile.status === 'ready' && profile.ageConfirmed;
  const uid = member ? user!.uid : null;
  const [now] = useState(() => Date.now());
  const today = roundIdOf(now);
  const yesterday = roundIdOf(now - DAY);
  const open = engagementOpen(kstDate(now));
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [past, setPast] = useState<{ round: OfficialRound; attempt: OfficialAttempt | null } | null>(null);
  const [review, setReview] = useState<OfficialQuestion[] | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    if (!uid || !open) return;
    let cancelled = false;
    void (async () => {
      try {
        const [round, attempt, before] = await Promise.all([loadRound(today), loadAttempt(uid, today), loadRound(yesterday)]);
        const beforeAttempt = before ? await loadAttempt(uid, yesterday) : null;
        if (cancelled) return;
        if (before) setPast({ round: before, attempt: beforeAttempt });
        if (!round) return setPhase({ kind: 'none' });
        if (!attempt) return setPhase({ kind: 'ready', round });
        const answered = Object.keys(attempt.answers).length;
        // 새로고침해도 시계는 서버 시작 시각부터 흐른다 — 기한 안이면 이어서
        if (answered < attempt.total && Date.now() < deadlineOf(attempt) - 1000) {
          const question = await loadQuestion(today, answered);
          if (!cancelled) setPhase({ kind: 'playing', round, index: answered, question });
          return;
        }
        setPhase({ kind: 'done', answered, total: attempt.total });
      } catch {
        if (!cancelled) setPhase({ kind: 'error' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, open, today, yesterday]);

  async function start(round: OfficialRound) {
    if (busy.current) return;
    busy.current = true;
    setPhase({ kind: 'sending' });
    try {
      await startAttempt(uid!, today, round.total);
      playSound('go');
      setPhase({ kind: 'playing', round, index: 0, question: await loadQuestion(today, 0) });
    } catch {
      setPhase({ kind: 'error' });
    } finally {
      busy.current = false;
    }
  }

  async function answer(round: OfficialRound, index: number, choice: string | null) {
    if (busy.current) return;
    busy.current = true;
    setPhase({ kind: 'sending' });
    try {
      await submitAnswer(uid!, today, index, choice);
      const next = index + 1;
      if (next >= round.total) {
        playSound('inningEnd');
        setPhase({ kind: 'done', answered: round.total, total: round.total });
      } else {
        setPhase({ kind: 'playing', round, index: next, question: await loadQuestion(today, next) });
      }
    } catch {
      // 기한이 지나면 규칙이 받지 않는다 — 거기까지 낸 답으로 판정한다
      const attempt = await loadAttempt(uid!, today).catch(() => null);
      setPhase({ kind: 'done', answered: attempt ? Object.keys(attempt.answers).length : index, total: round.total });
    } finally {
      busy.current = false;
    }
  }

  async function showReview(round: OfficialRound) {
    const questions: OfficialQuestion[] = [];
    for (let index = 0; index < round.total; index += 1) questions.push(await loadQuestion(round.id, index));
    setReview(questions);
  }

  const pastResult = past?.round.revealed && past.attempt ? gradeAttempt(past.attempt.startedAt, past.attempt.answers, past.round.revealed.answers) : null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 px-4 py-8">
      <div className="flex items-center justify-between">
        <Link to="/" className="flex min-h-11 items-center text-sm text-ink-2 underline">
          ← 야구왕
        </Link>
        <TextSizeToggle />
      </div>
      <h1 className="font-cute text-3xl">오늘의 공식전</h1>

      {!open ? (
        <p className="sticker p-4 text-sm break-keep">월간 등수가 시작되는 날부터 열려요.</p>
      ) : !member ? (
        <p className="sticker flex flex-col gap-2 p-4 text-sm break-keep">
          공식전은 회원만 할 수 있어요. 점수가 월간 등수에 들어가요.
          <Link to="/auth?mode=signup&returnTo=%2Fofficial" className="flex min-h-11 items-center font-semibold underline">
            가입하기
          </Link>
        </p>
      ) : (
        <>
          {phase.kind === 'loading' && <p className="text-sm text-ink-2">불러오는 중…</p>}
          {phase.kind === 'error' && (
            <p role="alert" className="text-sm" style={{ color: 'var(--out)' }}>
              공식전을 불러오지 못했어요. 연결을 확인하고 다시 들어와 주세요.
            </p>
          )}
          {phase.kind === 'none' && <p className="sticker p-4 text-sm break-keep">오늘 공식전은 아직 준비 중이에요. 내일 다시 와 주세요.</p>}
          {phase.kind === 'ready' && (
            <section aria-labelledby="official-rules" className="sticker flex flex-col gap-3 p-4">
              <h2 id="official-rules" className="font-cute text-xl">
                하루 한 번, {phase.round.total}문제
              </h2>
              <ul className="flex list-disc flex-col gap-1 pl-5 text-sm break-keep">
                <li>
                  문제마다 {OFFICIAL_QUESTION_MS / 1000}초. 맞히면 {OFFICIAL_POINTS.correct}점 + 빨리 맞힐수록 최대 {OFFICIAL_POINTS.speedMax}점, 끝까지 풀면 +{OFFICIAL_POINTS.finish}점
                </li>
                <li>시작하면 멈출 수 없어요. 나갔다 와도 시간은 흘러요. 다시 풀 수 없어요.</li>
                <li>정답은 이 기기에 없어요. 새벽에 채점해 점수가 월간 등수에 들어가고, 내일 정답과 해설을 보여 드려요.</li>
              </ul>
              <button type="button" onClick={() => void start(phase.round)} className="squishy font-cute min-h-14 text-xl" style={primary}>
                공식전 시작
              </button>
            </section>
          )}
          {phase.kind === 'playing' && (
            <div className="flex flex-col gap-3">
              <p className="text-sm font-semibold" aria-live="polite">
                {phase.index + 1} / {phase.round.total}
              </p>
              <QuestionView
                question={{ id: `${today}-${phase.index}`, ...phase.question }}
                limitMs={OFFICIAL_QUESTION_MS}
                onAnswer={(choice) => void answer(phase.round, phase.index, choice)}
              />
            </div>
          )}
          {phase.kind === 'sending' && <p className="text-sm text-ink-2">보내는 중…</p>}
          {phase.kind === 'done' && (
            <p role="status" className="sticker flex flex-col gap-1 p-4 break-keep">
              <span className="font-cute text-xl">오늘 공식전 제출 완료</span>
              <span className="text-sm">
                {phase.answered} / {phase.total}문제에 답했어요. 결과는 내일 새벽 채점 뒤에 나와요.
              </span>
            </p>
          )}

          {past && (
            <section aria-labelledby="official-yesterday" className="flex flex-col gap-3">
              <h2 id="official-yesterday" className="font-cute text-xl">
                어제 공식전
              </h2>
              {!past.round.revealed ? (
                <p className="text-sm text-ink-2">채점 중이에요. 새벽 채점 뒤에 결과가 나와요.</p>
              ) : !pastResult ? (
                <p className="text-sm text-ink-2">어제는 참여하지 않았어요. 참여 {past.round.participants ?? 0}명.</p>
              ) : (
                <p className="sticker p-3 text-sm">
                  <strong>{pastResult.points}점</strong> · {pastResult.correct} / {past.round.total}문제 정답 · 참여 {past.round.participants ?? 0}명
                </p>
              )}
              {past.round.revealed && !review && (
                <button type="button" onClick={() => void showReview(past.round)} className="flex min-h-11 items-center self-start font-semibold underline">
                  어제 문제와 해설 보기
                </button>
              )}
              {past.round.revealed && review && (
                <ol aria-label="어제 문제와 해설" className="flex flex-col gap-3">
                  {review.map((question, index) => {
                    const mine = pastResult?.questions[index];
                    const answerLabel = past.round.revealed!.answers[index];
                    return (
                      <li key={index} className="sticker flex flex-col gap-1 p-3 text-sm break-keep">
                        <span className="font-semibold">
                          {index + 1}. {question.stem}
                        </span>
                        <span>
                          정답 {answerLabel} — {question.options.find((option) => option.label === answerLabel)?.text}
                        </span>
                        {mine && (
                          <span style={{ color: mine.correct ? 'var(--on-base)' : 'var(--out)' }}>
                            내 답 {mine.choice ?? '시간 초과'} · {mine.correct ? `맞힘 ${mine.points}점` : '틀림'}
                          </span>
                        )}
                        {past.round.revealed!.explanations[index] && <span className="text-ink-2">{past.round.revealed!.explanations[index]}</span>}
                        {past.round.revealed!.sources[index] && <span className="text-xs text-ink-2">출처: {past.round.revealed!.sources[index]}</span>}
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
          )}
          <p className="text-xs text-ink-2">하루 {OFFICIAL_TOTAL}문제 · 한국 시간 자정에 새 공식전이 열려요.</p>
        </>
      )}
    </main>
  );
}
