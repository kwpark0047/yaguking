'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  abandonPlaySession,
  fetchPlayState,
  submitAtBatRequest,
} from '@/lib/api/client';
import { LIMIT_MS } from '@/lib/engine';
import { MODE_LABEL } from '@/lib/game/labels';
import { AnswerGrid } from './AnswerGrid';
import { AtBatLog } from './AtBatLog';
import { Countdown } from './Countdown';
import { QuestionCard } from './QuestionCard';
import { ScoreBoard } from './ScoreBoard';
import { VerdictOverlay } from './VerdictOverlay';
import { InfoPanel } from '@/components/shell/InfoPanel';
import { ErrorNotice } from '@/components/shell/states/ErrorNotice';
import { StyleMenu } from '@/components/theme/StyleMenu';
import type {
  AtBatDto,
  AtBatLogEntryDto,
  ScoreboardDto,
  StartSessionDto,
  SubmitAtBatDto,
} from '@/types/api';

/**
 * 경기 화면 상태 머신 (08 문서 §4.2).
 *
 *   COUNTDOWN(첫 타석 3초) → ACTIVE → SUBMITTING → VERDICT
 *     → (3아웃) INNING_END → ACTIVE
 *     → (목표 초과) FINISHED
 *
 * 규칙:
 *  - 화면 타이머는 표시용이고 **서버 판정이 최종**이다.
 *  - 제출 실패 시 같은 요청을 자동 재시도하지 않는다. `GET state`로 확정
 *    여부를 먼저 확인한다.
 *  - 보기 선택이 곧 제출이므로 선택 후 0.4초 입력을 잠근다.
 */

const COUNTDOWN_MS = 3000;
const AUTO_ADVANCE_MS = 1600;
const INNING_INTERSTITIAL_MS = 1200;
const INPUT_LOCK_MS = 400;
const TICK_MS = 100;

type Phase =
  | 'countdown'
  | 'active'
  | 'submitting'
  | 'verdict'
  | 'inningEnd'
  | 'finished'
  | 'reconnect';

export function PlayClient({ initial }: { initial: StartSessionDto }) {
  const router = useRouter();
  const sessionId = initial.sessionId;
  const mode = initial.mode;
  const goal = initial.goal;
  const resultHref = `/play/${sessionId}/result`;

  const [scoreboard, setScoreboard] = useState<ScoreboardDto>(initial.scoreboard);
  const [atBat, setAtBat] = useState<AtBatDto | null>(initial.atBat);
  const [verdict, setVerdict] = useState<SubmitAtBatDto | null>(null);
  const [log, setLog] = useState<AtBatLogEntryDto[]>([]);
  const [phase, setPhase] = useState<Phase>(
    initial.atBat.sequence === 1 ? 'countdown' : 'active',
  );
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [explanationOpen, setExplanationOpen] = useState(false);
  const [autoAdvanceMs, setAutoAdvanceMs] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ message: string; requestId?: string } | null>(
    null,
  );
  const [offline, setOffline] = useState(false);
  const [exitPrompt, setExitPrompt] = useState(false);
  /** 화면 스타일 메뉴. 열려 있으면 판정 후 자동 진행과 답 단축키를 멈춘다. */
  const [styleMenuOpen, setStyleMenuOpen] = useState(false);
  const trialRemaining = initial.guestTrialRemaining;

  const lockUntil = useRef(0);

  /**
   * 로컬 마감 시각. 렌더 중에 `Date.now()`를 부르면 서버와 클라이언트가 다른
   * 값을 계산해 하이드레이션이 깨지므로, 마운트 후 effect에서만 정한다.
   * 서버가 준 remainingMs를 기준으로 삼아 클라이언트 시계 오차를 피한다.
   */
  const [deadlineLocalMs, setDeadlineLocalMs] = useState<number | null>(null);

  useEffect(() => {
    setDeadlineLocalMs(atBat ? Date.now() + atBat.remainingMs : null);
  }, [atBat]);

  // ── 오프라인 감지 ───────────────────────────────────────────────────
  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  // ── 첫 타석 카운트다운 ──────────────────────────────────────────────
  const [countdownLeft, setCountdownLeft] = useState(COUNTDOWN_MS);
  useEffect(() => {
    if (phase !== 'countdown') return;
    const started = Date.now();
    const id = window.setInterval(() => {
      const left = COUNTDOWN_MS - (Date.now() - started);
      if (left <= 0) {
        window.clearInterval(id);
        setCountdownLeft(0);
        setPhase('active');
      } else {
        setCountdownLeft(left);
      }
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [phase]);

  const appendLog = useCallback(
    (source: AtBatDto, resolved: SubmitAtBatDto) => {
      setLog((prev) => [
        ...prev,
        {
          sequence: source.sequence,
          inning: scoreboard.inning,
          result: resolved.result,
          elapsedMs: resolved.elapsedMs,
          isCorrect: resolved.isCorrect,
          category: source.category,
          difficulty: source.difficulty,
        },
      ]);
    },
    [scoreboard.inning],
  );

  const applyVerdict = useCallback(
    (source: AtBatDto, data: SubmitAtBatDto) => {
      setVerdict(data);
      setScoreboard(data.scoreboard);
      appendLog(source, data);
      setExplanationOpen(false);
      setPhase('verdict');
    },
    [appendLog],
  );

  const resync = useCallback(async () => {
    const result = await fetchPlayState(sessionId);
    if (!result.ok) {
      setPhase('reconnect');
      setNotice(result.message);
      setFailure({ message: result.message, requestId: result.requestId });
      return;
    }

    setScoreboard(result.data.scoreboard);
    if (result.data.status !== 'active' || !result.data.atBat) {
      setPhase('finished');
      setNotice('서버 기준으로 경기가 종료되었습니다.');
      router.push(resultHref);
      return;
    }

    setAtBat(result.data.atBat);
    setVerdict(null);
    setChosenId(null);
    setPhase('active');
    setNotice('서버 기준으로 처리되었습니다.');
  }, [sessionId, router, resultHref]);

  // ── 제출 ────────────────────────────────────────────────────────────
  const submit = useCallback(
    async (optionId?: string) => {
      if (!atBat) return;
      if (Date.now() < lockUntil.current) return;
      if (phase !== 'active') return;

      lockUntil.current = Date.now() + INPUT_LOCK_MS;
      setChosenId(optionId ?? null);
      setPhase('submitting');

      const result = await submitAtBatRequest(sessionId, {
        sequence: atBat.sequence,
        ...(optionId === undefined ? {} : { optionId }),
        submissionId: crypto.randomUUID(),
      });

      if (result.ok) {
        applyVerdict(atBat, result.data);
        return;
      }

      // 마감 초과는 서버가 이미 아웃으로 확정했고 detail에 결과가 들어 있다.
      if (result.code === 'ANSWER_DEADLINE_EXCEEDED' && result.detail) {
        applyVerdict(atBat, result.detail as SubmitAtBatDto);
        return;
      }

      if (result.code === 'NETWORK') {
        setPhase('reconnect');
        setNotice('제출 결과를 확인하지 못했습니다. 다시 보내지 않고 상태를 확인합니다.');
        return;
      }

      if (
        result.code === 'ALREADY_SUBMITTED' ||
        result.code === 'SEQUENCE_MISMATCH' ||
        result.code === 'SESSION_FINISHED'
      ) {
        await resync();
        return;
      }

      setPhase('reconnect');
      setNotice(result.message);
      setFailure({ message: result.message, requestId: result.requestId });
    },
    [atBat, phase, sessionId, resync, applyVerdict],
  );

  // ── 타이머 만료 → 시간초과 확정 요청 ────────────────────────────────
  useEffect(() => {
    if (phase !== 'active' || !atBat || offline || deadlineLocalMs === null) return;
    const id = window.setInterval(() => {
      if (Date.now() >= deadlineLocalMs) {
        window.clearInterval(id);
        void submit(undefined);
      }
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [phase, atBat, offline, submit, deadlineLocalMs]);

  // ── 자동 전환 (해설을 열면 멈춘다) ──────────────────────────────────
  const advance = useCallback(() => {
    if (!verdict) return;

    if (verdict.finished) {
      // 결과·가입 게이트는 V03이 담당한다 (08 문서 §5).
      setPhase('finished');
      router.push(resultHref);
      return;
    }
    if (!verdict.next) {
      void resync();
      return;
    }

    const next = verdict.next;
    const go = () => {
      setAtBat(next);
      setVerdict(null);
      setChosenId(null);
      setPhase('active');
    };

    if (verdict.inningEnded) {
      setPhase('inningEnd');
      window.setTimeout(go, INNING_INTERSTITIAL_MS);
      return;
    }
    go();
  }, [verdict, resync, router, resultHref]);

  useEffect(() => {
    if (phase !== 'verdict') {
      setAutoAdvanceMs(null);
      return;
    }
    // 해설을 펼쳤거나 화면 메뉴를 열었으면 다음 타석으로 넘어가지 않는다.
    // 메뉴를 고르는 사이 화면이 바뀌어 버리면 무엇을 바꿨는지 볼 수 없다.
    if (explanationOpen || styleMenuOpen) {
      setAutoAdvanceMs(null);
      return;
    }

    const started = Date.now();
    setAutoAdvanceMs(AUTO_ADVANCE_MS);
    const id = window.setInterval(() => {
      const left = AUTO_ADVANCE_MS - (Date.now() - started);
      if (left <= 0) {
        window.clearInterval(id);
        setAutoAdvanceMs(null);
        advance();
      } else {
        setAutoAdvanceMs(left);
      }
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [phase, explanationOpen, styleMenuOpen, advance]);

  // ── 키보드 (08 문서 §8.1) ───────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      // 입력 요소(화면 메뉴의 라디오 등) 안에서 누른 키는 단축키가 아니다.
      // 그대로 두면 메뉴에서 A를 누르는 순간 1번 보기로 답이 제출된다.
      const target = event.target as HTMLElement | null;
      if (target?.closest?.('input, textarea, select, [data-shortcuts="off"]')) return;
      if (styleMenuOpen) return;

      if (event.key === 'Escape') {
        setExitPrompt((prev) => !prev);
        return;
      }

      if (phase === 'active' && atBat) {
        const index = ['1', '2', '3', '4'].indexOf(event.key);
        const letter = ['a', 's', 'd', 'f'].indexOf(event.key.toLowerCase());
        const position = index >= 0 ? index : letter;
        const option = position >= 0 ? atBat.options[position] : undefined;
        if (option) {
          event.preventDefault();
          void submit(option.id);
        }
        return;
      }

      if (phase === 'verdict') {
        if (event.key === 'Enter') {
          event.preventDefault();
          advance();
        }
        if (event.key === ' ') {
          event.preventDefault();
          setExplanationOpen((prev) => !prev);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [phase, atBat, submit, advance, styleMenuOpen]);

  // ── 나가기 / 다시 하기 ──────────────────────────────────────────────
  async function confirmExit() {
    await abandonPlaySession(sessionId);
    setExitPrompt(false);
    setPhase('finished');
    router.push(resultHref);
  }

  const inputsDisabled = phase !== 'active' || offline;
  const revealedCorrectId = verdict?.reveal?.correctOption.id ?? null;
  const displayAtBat = atBat;

  return (
    <div className="lg:grid lg:grid-cols-[1fr_320px] lg:gap-6">
      <div className="flex min-w-0 flex-col">
        {/* 헤더 */}
        <header className="flex items-center justify-between gap-2 px-4 py-2">
          <button
            type="button"
            onClick={() => setExitPrompt(true)}
            className="min-h-11 text-sm text-ink-2"
          >
            ◀ 나가기
          </button>
          <div className="flex min-w-0 items-center gap-1">
            <span className="truncate text-xs text-ink-2">
              {MODE_LABEL[mode] ?? mode}
              {trialRemaining !== null && ` · 오늘 체험 ${trialRemaining}이닝 남음`}
            </span>
            {/*
              비회원의 화면 스타일 진입점. 랜딩이 곧 첫 타석이라 여기에 둔다.
              타석 제한 시간은 서버 기준이라 메뉴를 여는 동안에도 흐른다 — 막지는
              않는다(고대비가 당장 필요한 사람에게는 한 타석보다 플레이 자체가
              중요하다). 대신 그 사실을 알린다.
            */}
            <StyleMenu
              warning={
                phase === 'active' ? '타석 시간은 멈추지 않습니다. 다 고르면 닫아 주세요.' : null
              }
              onOpenChange={setStyleMenuOpen}
            />
          </div>
        </header>

        <ScoreBoard
          scoreboard={scoreboard}
          inningsTarget={goal.kind === 'innings' ? goal.target : 1}
        />

        {offline && (
          <p
            className="px-4 py-2 text-sm"
            style={{ backgroundColor: 'var(--out)', color: '#fff' }}
            role="alert"
          >
            오프라인입니다. 연결되면 경기를 이어갑니다.
          </p>
        )}

        {notice && (
          <p className="px-4 py-2 text-xs text-ink-2" role="status">
            {notice}
          </p>
        )}

        {exitPrompt && (
          <div
            className="m-4 rounded-card border p-4"
            style={{ borderColor: 'var(--out)' }}
          >
            <p className="text-sm">
              지금 나가면 이 경기는 중도 종료됩니다. 기록은 남지만 공식 집계에는
              들어가지 않습니다.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => void confirmExit()}
                className="min-h-11 rounded-option px-3 text-sm font-semibold"
                style={{ backgroundColor: 'var(--out)', color: '#fff' }}
              >
                나가기
              </button>
              <button
                type="button"
                onClick={() => setExitPrompt(false)}
                className="min-h-11 rounded-option border px-3 text-sm"
                style={{ borderColor: 'var(--line)' }}
              >
                계속하기
              </button>
            </div>
          </div>
        )}

        {/* md 2열: 좌 로그 / 우 경기. lg에서는 로그가 우측 패널로 간다. */}
        <div className="md:grid md:grid-cols-[2fr_3fr] md:gap-4 md:px-4">
          <section
            className="hidden md:block lg:hidden"
            aria-label="타석 로그"
          >
            <h2 className="mb-2 text-sm font-semibold">타석 로그</h2>
            <AtBatLog entries={log} />
          </section>

          <div className="flex min-w-0 flex-col gap-3 p-4 md:p-0">
            {phase === 'countdown' && (
              <div
                className="flex min-h-40 flex-col items-center justify-center gap-2"
                role="status"
              >
                <p className="num-tabular text-5xl font-bold">
                  {Math.max(1, Math.ceil(countdownLeft / 1000))}
                </p>
                <p className="text-sm text-ink-2">첫 타석이 곧 시작됩니다</p>
              </div>
            )}

            {phase === 'inningEnd' && (
              <div
                className="flex min-h-40 flex-col items-center justify-center gap-2"
                role="status"
              >
                <p className="text-2xl font-bold">
                  {Math.max(1, scoreboard.inning - 1)}회 종료
                </p>
                <p className="num-tabular text-sm text-ink-2">
                  현재 {scoreboard.runs}득점 · 주자와 아웃이 초기화됩니다
                </p>
              </div>
            )}

            {phase === 'finished' && (
              <p className="text-sm text-ink-2" role="status">
                경기가 끝났습니다. 결과 화면으로 이동합니다…
              </p>
            )}

            {phase === 'reconnect' && (
              <ErrorNotice
                message={
                  failure?.message ??
                  '제출 결과를 확인하지 못했습니다. 같은 요청을 다시 보내지 않고 서버 상태를 확인합니다.'
                }
                requestId={failure?.requestId}
                action={
                  <button
                    type="button"
                    onClick={() => void resync()}
                    className="min-h-11 self-start rounded-option px-4 text-sm font-semibold"
                    style={{
                      backgroundColor: 'var(--accent)',
                      color: 'var(--accent-ink)',
                    }}
                  >
                    상태 확인
                  </button>
                }
              />
            )}

            {displayAtBat &&
              (phase === 'active' ||
                phase === 'submitting' ||
                phase === 'verdict' ||
                phase === 'countdown') && (
                <>
                  <QuestionCard atBat={displayAtBat} />

                  <Countdown
                    deadlineAtMs={deadlineLocalMs}
                    totalMs={LIMIT_MS}
                    paused={phase !== 'active' || offline}
                  />

                  <AnswerGrid
                    options={displayAtBat.options}
                    disabled={inputsDisabled}
                    chosenId={chosenId}
                    correctId={revealedCorrectId}
                    onSelect={(optionId) => void submit(optionId)}
                  />

                  {phase === 'submitting' && (
                    <p className="text-xs text-ink-2" role="status">
                      판정 확인 중…
                    </p>
                  )}

                  {phase === 'verdict' && verdict && (
                    <VerdictOverlay
                      verdict={verdict}
                      explanationOpen={explanationOpen}
                      onToggleExplanation={() => setExplanationOpen((prev) => !prev)}
                      onNext={advance}
                      autoAdvanceMs={autoAdvanceMs}
                    />
                  )}
                </>
              )}
          </div>
        </div>
      </div>

      {/* lg 우측 정보 패널 — 읽기 전용 */}
      <div className="hidden lg:block">
        <InfoPanel entries={log} />
      </div>
    </div>
  );
}

