import { useEffect, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router';
import { useAuth } from '@/auth/AuthProvider';
import { QuestionView } from '@/components/game/QuestionView';
import { CATEGORY_TITLE, loadQuestions, type CategorySlug, type OptionLabel, type Question } from '@/content/questions';
import { LIMIT_MS } from '@/lib/engine';
import { LEVEL_TEST_SIZE, buildLevelTest, tierFor } from '@/lib/game/levelTest';
import type { PlayedAtBat } from '@/lib/game/match';
import { saveMatch } from '@/lib/game/persist';
import { tierStyle, tierTheme } from '@/lib/theme/tiers';

type Phase =
  | { kind: 'intro' }
  | { kind: 'question'; index: number }
  | { kind: 'feedback'; index: number; correct: boolean }
  | { kind: 'saving' }
  | { kind: 'done'; saveFailed: boolean }
  | { kind: 'error' };

/**
 * 최초 레벨 테스트 — 20문항, 문항당 15초. **회원 1회**(규칙이 한 번만 받는다).
 * 끝나면 등급 인증 카드(육성선수 … 명예의 전당). 등급은 기기가 계산한 **비공식** 값이다.
 *
 * 문제은행 사정상 4개 영역(규칙·상식, 한국시리즈, 선수 기록, 구단 역사)으로 낸다
 * (src/lib/game/levelTest.ts).
 */
export function LevelTestPage() {
  const { user, profile, refreshProfile } = useAuth();
  const [phase, setPhase] = useState<Phase>({ kind: 'intro' });
  const [questions, setQuestions] = useState<Question[]>([]);
  const answers = useRef<PlayedAtBat[]>([]);

  useEffect(() => {
    loadQuestions()
      .then((bank) => setQuestions(buildLevelTest(bank)))
      .catch(() => setPhase({ kind: 'error' }));
  }, []);

  if (user === undefined || profile.status === 'loading') return null;
  if (!user || user.isAnonymous) {
    return <Navigate to="/auth?mode=signup&returnTo=%2Flevel-test" replace />;
  }
  const alreadyDone = profile.status === 'ready' && profile.data.levelTestDone;

  const correctCount = () => answers.current.filter((answer) => answer.correct).length;

  function answer(question: Question, choice: OptionLabel | null, elapsedMs: number, index: number) {
    const correct = choice === question.correct && elapsedMs <= LIMIT_MS;
    answers.current.push({
      questionId: question.id,
      difficulty: question.difficulty,
      choice,
      correct,
      elapsedMs: Math.round(elapsedMs),
      result: correct ? '1B' : 'K',
      upgraded: false,
      upgradeReason: null,
      rbi: 0,
      inning: 1,
    });
    setPhase({ kind: 'feedback', index, correct });
  }

  async function finish() {
    setPhase({ kind: 'saving' });
    const byCategory: Record<string, number> = {};
    for (const [index, item] of answers.current.entries()) {
      const category = questions[index]!.category;
      byCategory[category] = (byCategory[category] ?? 0) + (item.correct ? 1 : 0);
    }
    const correct = correctCount();
    try {
      await saveMatch({
        uid: user!.uid,
        isGuest: false,
        mode: 'levelTest',
        atBats: answers.current,
        runs: 0,
        xp: 0,
        levelTest: { correct, total: answers.current.length, tier: tierFor(correct, answers.current.length), byCategory },
      });
      await refreshProfile();
      setPhase({ kind: 'done', saveFailed: false });
    } catch {
      setPhase({ kind: 'done', saveFailed: true });
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-4 px-4 py-6">
      <Link to="/" className="flex min-h-11 items-center self-start text-sm text-ink-2 underline">
        ◀ 나가기
      </Link>

      {phase.kind === 'error' && (
        <p role="alert" className="text-sm" style={{ color: 'var(--out)' }}>
          문항을 불러오지 못했어요. 연결을 확인해 주세요.
        </p>
      )}

      {phase.kind === 'intro' && (
        <section className="flex flex-col gap-4" aria-labelledby="intro-title">
          <h1 id="intro-title" className="font-cute text-3xl">
            레벨 테스트
          </h1>
          {alreadyDone ? (
            <p className="text-sm text-ink-2">레벨 테스트는 한 번만 할 수 있어요. 이미 끝냈어요.</p>
          ) : (
            <>
              <p className="text-sm text-ink-2 break-keep">
                {LEVEL_TEST_SIZE}문제, 문제마다 15초예요. 결과로 처음 등급이 정해져요. 한 번만 할 수 있어요.
              </p>
              <button
                type="button"
                disabled={questions.length === 0}
                onClick={() => setPhase({ kind: 'question', index: 0 })}
                className="squishy font-cute min-h-14 text-xl disabled:opacity-60"
                style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
              >
                시작하기
              </button>
            </>
          )}
        </section>
      )}

      {phase.kind === 'question' && questions[phase.index] && (
        <>
          <p className="num-tabular text-sm text-ink-2" aria-live="polite">
            {phase.index + 1} / {questions.length}
          </p>
          <QuestionView
            question={questions[phase.index]!}
            onAnswer={(choice, elapsed) => answer(questions[phase.index]!, choice, elapsed, phase.index)}
          />
        </>
      )}

      {phase.kind === 'feedback' && (
        <section className="sticker flex flex-col gap-3 p-4" role="status">
          <p className="font-cute text-2xl" style={{ color: phase.correct ? 'var(--on-base)' : 'var(--out)' }}>
            {phase.correct ? '정답!' : '아쉬워요'}
          </p>
          <button
            type="button"
            autoFocus
            onClick={() =>
              phase.index + 1 < questions.length
                ? setPhase({ kind: 'question', index: phase.index + 1 })
                : void finish()
            }
            className="squishy font-cute min-h-14 text-xl"
            style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
          >
            {phase.index + 1 < questions.length ? '다음 문제' : '결과 보기'}
          </button>
        </section>
      )}

      {phase.kind === 'saving' && <p className="text-sm text-ink-2">결과를 저장하는 중…</p>}

      {phase.kind === 'done' && (
        <TierCard
          correct={correctCount()}
          total={answers.current.length}
          byCategory={answers.current.reduce<Record<string, [number, number]>>((acc, item, index) => {
            const category = questions[index]!.category;
            const [right, all] = acc[category] ?? [0, 0];
            acc[category] = [right + (item.correct ? 1 : 0), all + 1];
            return acc;
          }, {})}
          saveFailed={phase.saveFailed}
          onRetry={() => void finish()}
        />
      )}
    </main>
  );
}

/** 등급 인증 카드 — 등급색·테두리는 기존 등급 테마(tiers.ts)를 쓴다 */
function TierCard({
  correct,
  total,
  byCategory,
  saveFailed,
  onRetry,
}: {
  correct: number;
  total: number;
  byCategory: Record<string, [number, number]>;
  saveFailed: boolean;
  onRetry: () => void;
}) {
  const tier = tierTheme(tierFor(correct, total));

  return (
    <section className="flex flex-col gap-4" aria-labelledby="tier-title">
      <div
        data-tier={tier.level}
        data-ornament={tier.ornament}
        style={tierStyle(tier)}
        className="tier-frame sticker flex flex-col items-center gap-2 p-6 text-center"
      >
        <p className="text-sm text-ink-2">처음 등급</p>
        <h1 id="tier-title" className="font-cute text-4xl" style={{ color: 'var(--tier)' }}>
          Lv.{tier.level} {tier.name}
        </h1>
        <p className="num-tabular text-sm">
          {total}문제 중 {correct}문제 정답
        </p>
        <ul className="mt-2 flex flex-col gap-1 text-sm text-ink-2">
          {Object.entries(byCategory).map(([category, [right, all]]) => (
            <li key={category} className="num-tabular">
              {CATEGORY_TITLE[category as CategorySlug] ?? category} {right}/{all}
            </li>
          ))}
        </ul>
        <p className="text-xs text-ink-2">기기에서 채점한 비공식 등급이에요.</p>
      </div>
      {saveFailed && (
        <div role="alert" className="flex flex-col gap-2 text-sm" style={{ color: 'var(--out)' }}>
          결과를 저장하지 못했어요.
          <button type="button" onClick={onRetry} className="min-h-11 underline">
            다시 저장하기
          </button>
        </div>
      )}
      <Link
        to="/play"
        className="squishy font-cute flex min-h-14 items-center justify-center text-xl"
        style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
      >
        게임 시작
      </Link>
    </section>
  );
}
