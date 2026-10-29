import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { useAuth } from "@/auth/AuthProvider";
import { AdSlot } from "@/components/ads/AdSlot";
import { BoxScore } from "@/components/game/BoxScore";
import { LoadingBall, SoundToggle, useCountUp } from "@/components/effects/Effects";
import { ChanceEvent } from "@/components/game/ChanceEvent";
import { QuestionView } from "@/components/game/QuestionView";
import { ScoreBoard } from "@/components/game/ScoreBoard";
import {
  loadQuestions,
  type OptionLabel,
  type Question,
} from "@/content/questions";
import { startAsGuest } from "@/lib/auth/actions";
import { authErrorMessage } from "@/lib/auth/messages";
import {
  formatElapsed,
  levelChange,
  levelName,
  levelProgress,
  RESULT_PRESENTATION,
  resultLabel,
  UPGRADE_LABEL,
  type LevelChange,
} from "@/lib/game/labels";
import {
  answerAtBat,
  boxScoreOf,
  isFinished,
  pickQuestion,
  plannedDifficulty,
  rulesAllowed,
  FRESH_SLOTS,
  isFresh,
  XP,
  startMatch,
  xpOf,
  type Match,
  type PlayedAtBat,
} from "@/lib/game/match";
import {
  GUEST_DAILY_GAMES,
  guestGamesLeft,
  recentlySeen,
  readTotalXp,
  rememberSeen,
  saveMatch,
} from "@/lib/game/persist";
import { firstOfGame } from "@/lib/game/moments";
import {
  CHANCE_INTRO,
  CHANCE_TITLE,
  TIME_BONUS_MS,
  applyChanceBonus,
  bonusOf,
  chanceFor,
  succeeded,
  type ChanceKind,
  type ChanceOutcome,
  type ChanceReason,
  type ChanceRecord,
} from "@/lib/game/chance";
import { kstDate } from "@/lib/game/attendance";
import { LIMIT_MS } from "@/lib/engine";
import { gameEndSound, playSound, verdictSound } from "@/lib/sound/sound";
import { celebrate, resetGameEffects } from "@/lib/effects/celebrate";
import { currentMode } from "@/lib/effects/preference";
import { dataErrorMessage } from "@/lib/firebase/errors";

type Phase =
  | { kind: "loading" }
  | { kind: "limit" }
  | { kind: "error"; message: string }
  | { kind: "question"; question: Question }
  | { kind: "verdict"; question: Question; atBat: PlayedAtBat }
  | { kind: "chance"; chance: ChanceKind; reason: ChanceReason }
  | { kind: "saving" }
  | {
      kind: "done";
      wrongSaved: number;
      saveError: string | null;
      level: LevelChange | null;
    };


/**
 * 개인 퀴즈 — 1이닝(3아웃). **비공식**: 정답과 시계가 기기에 있다.
 *
 * - 로그인하지 않았으면 비회원(익명)으로 바로 시작한다 — 첫 투구까지 0탭(08 문서 §3)
 * - 비회원은 하루 GUEST_DAILY_GAMES판(보안 규칙이 막고, 화면이 미리 알린다)
 * - 경기는 끝날 때 한 번만 저장한다(무료 쓰기 한도). 틀린 문항은 오답노트로
 */
export function PlayPage() {
  const { user, isGuest } = useAuth();
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [match, setMatch] = useState<Match>(startMatch);
  const [guestLeft, setGuestLeft] = useState<number | null>(null);
  const bank = useRef<Question[]>([]);
  const used = useRef(new Set<string>());
  const seen = useRef(new Set<string>());
  const starting = useRef(false);
  /** 이번 경기의 찬스 이벤트(최대 2개)와, 다음 문제에 쓸 시간 보너스(초성 정답) */
  const chances = useRef<ChanceRecord[]>([]);
  const [timeBonus, setTimeBonus] = useState(false);
  /** 위쪽 띠(플레이 볼·3아웃 체인지) — 띄울 때마다 새 key(다시 그려 애니메이션을 처음부터) */
  const [banner, setBanner] = useState<{ key: number; text: string } | null>(
    null,
  );
  const showBanner = (text: string) => {
    if (currentMode() !== "none")
      setBanner((value) => ({ key: (value?.key ?? 0) + 1, text }));
  };

  const nextQuestion = useCallback((current: Match) => {
    const difficulty = plannedDifficulty(
      current.atBats.length + 1,
      Math.random(),
    );
    // 한 경기에서 규칙 문항은 절반 이하(docs/fun-plan.md §6) — 넘게 되면 규칙이 아닌 문항을 먼저
    const categoryOf = new Map(bank.current.map((q) => [q.id, q.category]));
    const categories = current.atBats.map(
      (atBat) => categoryOf.get(atBat.questionId) ?? "",
    );
    const rulesOk = rulesAllowed(categories);
    // 최신 경기 특집 — 정해진 타석에서는 아직 안 본 최신 경기 문항부터(없으면 보통대로)
    if (FRESH_SLOTS.includes(current.atBats.length)) {
      const today = kstDate();
      const fresh = bank.current.filter(
        (q) => isFresh(q, today) && !seen.current.has(q.id) && (rulesOk || q.category !== "rules"),
      );
      const pick = pickQuestion(fresh, difficulty, used.current, new Set(), Math.random);
      if (pick) return pick;
    }
    return pickQuestion(
      bank.current,
      difficulty,
      used.current,
      seen.current,
      Math.random,
      rulesOk ? undefined : (q) => q.category !== "rules",
    );
  }, []);

  const begin = useCallback(async () => {
    const fresh = startMatch();
    setMatch(fresh);
    used.current = new Set();
    seen.current = recentlySeen();
    const first = nextQuestion(fresh);
    if (!first) {
      setPhase({ kind: "error", message: "출제할 문항이 없어요." });
      return;
    }
    used.current.add(first.id);
    chances.current = [];
    setTimeBonus(false);
    resetGameEffects();
    showBanner("플레이 볼!");
    setPhase({ kind: "question", question: first });
  }, [nextQuestion]);

  // 로그인 확인(없으면 비회원으로) → 비회원 남은 판 → 문제은행 → 시작
  useEffect(() => {
    if (user === undefined || starting.current) return;
    if (user === null) {
      starting.current = true;
      startAsGuest()
        .catch((error) =>
          setPhase({ kind: "error", message: authErrorMessage(error) }),
        )
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
            setPhase({ kind: "limit" });
            return;
          }
        }
        bank.current = await loadQuestions();
        await begin();
      } catch (reason) {
        setPhase({
          kind: "error",
          message: dataErrorMessage(
            reason,
            "경기를 준비하지 못했어요. 연결을 확인해 주세요.",
          ),
        });
      }
    })();
  }, [user, begin]);

  function answer(
    question: Question,
    choice: OptionLabel | null,
    elapsedMs: number,
  ) {
    // 초성 퀴즈 보너스: 3초 더 받았고, 그만큼 빨리 친 것으로 판정(시간 초과는 그대로 시간 초과)
    const judged =
      timeBonus && choice !== null ? Math.max(0, elapsedMs - TIME_BONUS_MS) : elapsedMs;
    if (timeBonus) setTimeBonus(false);
    const { match: next, atBat } = answerAtBat(
      match,
      question,
      choice,
      judged,
    );
    setMatch(next);
    setPhase({ kind: "verdict", question, atBat });
    if (next.state.inningEnded && atBat.result === "K") showBanner("3아웃 체인지");
  }

  async function finish(final: Match) {
    if (!user) return;
    setPhase({ kind: "saving" });
    rememberSeen(final.atBats.map((atBat) => atBat.questionId));
    try {
      const gained =
        xpOf(final.atBats, final.state.finished) +
        chances.current.filter(succeeded).length * XP.chanceSuccess;
      const { wrongSaved } = await saveMatch({
        uid: user.uid,
        isGuest: user.isAnonymous,
        mode: "practice",
        atBats: final.atBats,
        runs: final.state.runs,
        xp: gained,
        events: chances.current,
      });
      if (user.isAnonymous)
        setGuestLeft((left) => (left === null ? null : Math.max(0, left - 1)));
      // 비공식 레벨 승급(docs/motion-plan.md §5) — 누적 XP 읽기 1번. 못 읽으면 레벨만 빼고 결과는 보인다
      const level = await readTotalXp(user.uid)
        .then((total) => levelChange(total, gained))
        .catch(() => null);
      setPhase({ kind: "done", wrongSaved, saveError: null, level });
    } catch (reason) {
      setPhase({
        kind: "done",
        wrongSaved: 0,
        saveError: dataErrorMessage(reason, "기록을 저장하지 못했어요."),
        level: null,
      });
    }
  }

  function next() {
    if (isFinished(match)) {
      void finish(match);
      return;
    }
    const chance = chanceFor(match, chances.current, Math.random);
    if (chance) {
      showBanner(`${CHANCE_INTRO[chance.reason]} — ${CHANCE_TITLE[chance.kind]}`);
      setPhase({ kind: "chance", chance: chance.kind, reason: chance.reason });
      return;
    }
    askNext(match);
  }

  function askNext(current: Match) {
    const question = nextQuestion(current);
    if (!question) {
      void finish(match);
      return;
    }
    used.current.add(question.id);
    setPhase({ kind: "question", question });
  }

  /** 찬스 이벤트 끝 — 보너스를 반영하고 다음 문제로(못해도 손해 없음) */
  function chanceDone(kind: ChanceKind, reason: ChanceReason, outcome: ChanceOutcome) {
    chances.current = [...chances.current, { kind, reason, outcome }];
    const bonus = bonusOf(kind, outcome);
    let current = match;
    if (bonus === "time") setTimeBonus(true);
    else if (bonus) {
      const { bonusRuns: _runs, ...applied } = applyChanceBonus(match, bonus);
      current = applied;
      setMatch(applied);
      if (bonus === "HR") celebrate({ kind: "homeRun" });
    }
    askNext(current);
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
      {banner && (
        <div
          key={banner.key}
          className="play-ball-banner font-cute"
          aria-hidden="true"
          onAnimationEnd={() => setBanner(null)}
        >
          {banner.text}
        </div>
      )}
      <header className="flex items-center justify-between gap-2 px-4 py-2">
        <Link
          to="/"
          className="flex min-h-11 items-center text-sm text-ink-2 underline"
        >
          ◀ 나가기
        </Link>
        <span
          className="rounded-full px-3 py-1 text-xs font-semibold"
          style={{ backgroundColor: "var(--bg-card)" }}
        >
          비공식 1이닝
          {isGuest && guestLeft !== null ? ` · 오늘 ${guestLeft}판 남음` : ""}
        </span>
        <SoundToggle />
      </header>

      {(phase.kind === "question" ||
        phase.kind === "verdict" ||
        phase.kind === "chance") && (
        <ScoreBoard scoreboard={scoreboard} inningsTarget={1} />
      )}

      <main className="flex flex-1 flex-col gap-4 px-4 py-4">
        {phase.kind === "loading" && (
          <LoadingBall label="경기를 준비하는 중…" />
        )}

        {phase.kind === "error" && (
          <p role="alert" className="text-sm" style={{ color: "var(--out)" }}>
            {phase.message}
          </p>
        )}

        {phase.kind === "limit" && (
          <section
            className="sticker flex flex-col gap-3 p-5"
            aria-labelledby="limit-title"
          >
            <h1 id="limit-title" className="font-cute text-2xl">
              오늘 비회원 경기를 다 했어요
            </h1>
            <p className="text-sm text-ink-2 break-keep">
              비회원은 하루 {GUEST_DAILY_GAMES}판까지예요. 가입하면 지금까지의
              기록이 그대로 이어지고 제한 없이 할 수 있어요.
            </p>
            <Link
              to="/auth?mode=signup&returnTo=%2Fplay"
              className="squishy font-cute flex min-h-14 items-center justify-center text-xl"
              style={{
                backgroundColor: "var(--accent)",
                color: "var(--accent-ink)",
              }}
            >
              가입하기
            </Link>
          </section>
        )}

        {phase.kind === "chance" && (
          <ChanceEvent
            key={chances.current.length}
            kind={phase.chance}
            reason={phase.reason}
            onDone={(outcome) => chanceDone(phase.chance, phase.reason, outcome)}
          />
        )}

        {phase.kind === "question" && timeBonus && (
          <p className="fx-badge self-start font-semibold">시간 +3초</p>
        )}

        {phase.kind === "question" && (
          <QuestionView
            limitMs={timeBonus ? LIMIT_MS + TIME_BONUS_MS : LIMIT_MS}
            question={phase.question}
            fresh={isFresh(phase.question, kstDate())}
            onAnswer={(choice, elapsed) =>
              answer(phase.question, choice, elapsed)
            }
          />
        )}

        {phase.kind === "verdict" && (
          <Verdict
            question={phase.question}
            atBat={phase.atBat}
            last={isFinished(match)}
            first={firstOfGame(match, phase.atBat)}
            onNext={next}
          />
        )}

        {phase.kind === "saving" && (
          <p className="text-sm text-ink-2">기록을 저장하는 중…</p>
        )}

        {phase.kind === "done" && (
          <Results
            match={match}
            wrongSaved={phase.wrongSaved}
            saveError={phase.saveError}
            level={phase.level}
            onRetrySave={() => void finish(match)}
            canPlayAgain={!isGuest || (guestLeft ?? 0) > 0}
            onPlayAgain={() => void begin()}
          />
        )}

        {/* 광고(docs/ads-plan.md) — 문제·결과 아래, 화면에 고정하지 않음(급히 누르다 광고를 누르지 않게). 찬스 이벤트 중에는 숨김 */}
        {(phase.kind === "question" || phase.kind === "verdict" || phase.kind === "done") && (
          <AdSlot slot="play-bottom" className="mt-6" />
        )}
      </main>
    </div>
  );
}

function Verdict({
  question,
  atBat,
  last,
  first,
  onNext,
}: {
  question: Question;
  atBat: PlayedAtBat;
  last: boolean;
  first: "hit" | "homeRun" | null;
  onNext: () => void;
}) {
  const presentation = RESULT_PRESENTATION[atBat.result];
  const timedOut = atBat.choice === null;
  const tone =
    presentation.tone === "hr"
      ? "var(--hr)"
      : presentation.tone === "out"
        ? "var(--out)"
        : "var(--on-base)";
  const correctOption = question.options.find(
    (option) => option.label === question.correct,
  );
  const nextButton = useRef<HTMLButtonElement>(null);
  const ribbon = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    nextButton.current?.focus();
    // 효과는 글자를 꾸밀 뿐 — 결과는 아래 role="status"가 읽힌다. 효과 중에도 "다음 타석"은 바로 눌린다
    if (atBat.result === "HR") celebrate({ kind: "homeRun" });
    if (atBat.upgradeReason)
      celebrate({ kind: "upgrade" }, { origin: ribbon.current });
    // 소리(켠 사람만): 판정 → 승급 보너스 → 3아웃
    playSound(verdictSound(atBat.result, atBat.choice === null));
    if (atBat.upgradeReason) playSound("upgrade", 0.35);
    if (last && atBat.result === "K") playSound("inningEnd", 0.45);
  }, [atBat, last]);

  return (
    <section
      className="sticker flex flex-col gap-3 p-4"
      aria-labelledby="verdict-title"
    >
      <div role="status" className="flex flex-col gap-2">
        <p
          id="verdict-title"
          className="flex items-center gap-2 text-xl font-bold"
          style={{ color: tone }}
        >
          <span aria-hidden="true">{presentation.icon}</span>
          <span
            className={
              atBat.result === "HR"
                ? "fx-pop"
                : atBat.result === "K"
                  ? "fx-shake inline-block"
                  : undefined
            }
          >
            {resultLabel(atBat.result, timedOut)}
          </span>
          {atBat.rbi > 0 && (
            <span className="num-tabular text-sm text-ink-2">
              {atBat.rbi}타점
            </span>
          )}
        </p>
        {first === "homeRun" && (
          <p>
            <span className="fx-stamp font-cute">첫 홈런!</span>
          </p>
        )}
        {first === "hit" && (
          <p>
            <span className="fx-badge font-semibold">첫 안타!</span>
          </p>
        )}
        {atBat.upgradeReason && (
          <p ref={ribbon} className="fx-ribbon text-sm font-semibold">
            {UPGRADE_LABEL[atBat.upgradeReason]}
          </p>
        )}
        <p className="text-sm text-ink-2">
          정답: {question.correct}. {correctOption?.text}
        </p>
        <p className="num-tabular text-xs text-ink-2">
          응답 {timedOut ? "시간 초과" : formatElapsed(atBat.elapsedMs)}
        </p>
      </div>
      {question.explanation && (
        <p className="text-sm leading-relaxed break-keep">
          {question.explanation}
        </p>
      )}
      <p className="text-xs text-ink-2">
        출처: {question.source.name} (검증 {question.source.verifiedAt})
      </p>
      <button
        ref={nextButton}
        type="button"
        onClick={() => {
          playSound("tap");
          onNext();
        }}
        className="squishy font-cute min-h-14 text-xl"
        style={{ backgroundColor: "var(--accent)", color: "var(--accent-ink)" }}
      >
        {last ? "결과 보기" : "다음 타석"}
      </button>
    </section>
  );
}

function Results({
  match,
  wrongSaved,
  saveError,
  level,
  onRetrySave,
  canPlayAgain,
  onPlayAgain,
}: {
  match: Match;
  wrongSaved: number;
  saveError: string | null;
  level: LevelChange | null;
  onRetrySave: () => void;
  canPlayAgain: boolean;
  onPlayAgain: () => void;
}) {
  const box = boxScoreOf(match);
  const xp = xpOf(match.atBats, match.state.finished);
  const runs = match.state.runs;
  const shownRuns = useCountUp(runs);

  useEffect(() => {
    celebrate({ kind: "gameEnd", runs });
    playSound(gameEndSound(runs));
  }, [runs]);

  return (
    <section className="flex flex-col gap-4" aria-labelledby="result-title">
      <h1 id="result-title" className="font-cute text-center text-3xl">
        경기 종료 · <span className="num-tabular">{shownRuns}</span>득점
      </h1>
      <BoxScore box={box} runs={match.state.runs} />
      <p className="text-center text-sm text-ink-2">
        비공식 XP <span className="num-tabular font-semibold">+{xp}</span>
        {wrongSaved > 0 && ` · 틀린 ${wrongSaved}문항을 오답노트에 담았어요`}
      </p>
      {level && <LevelPanel level={level} />}
      {saveError && (
        <div
          role="alert"
          className="flex flex-col gap-2 text-sm"
          style={{ color: "var(--out)" }}
        >
          {saveError}
          <button
            type="button"
            onClick={onRetrySave}
            className="min-h-11 underline"
          >
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
            style={{
              backgroundColor: "var(--accent)",
              color: "var(--accent-ink)",
            }}
          >
            한 판 더
          </button>
        )}
        <Link
          to="/notes"
          className="flex min-h-14 flex-1 items-center justify-center rounded-option border-2 font-semibold"
          style={{ borderColor: "var(--line)" }}
        >
          오답노트
        </Link>
      </div>
    </section>
  );
}

/**
 * 비공식 레벨 — 진행 막대가 이번 경기만큼 차오르고, 레벨이 오르면 "승급!" 카드(docs/motion-plan.md §5 A안).
 * 기기에서 채점한 비공식 XP로 계산한다(공식 랭킹 아님).
 */
function LevelPanel({ level }: { level: LevelChange }) {
  const up = level.after > level.before;
  const [width, setWidth] = useState(() =>
    up ? 0 : levelProgress(level.before, level.xpBefore),
  );
  useEffect(() => {
    const frame = requestAnimationFrame(() =>
      setWidth(levelProgress(level.after, level.xpAfter)),
    );
    if (!up) return () => cancelAnimationFrame(frame);
    // 경기 종료 효과가 끝날 즈음 승급 축하
    const timer = window.setTimeout(() => {
      celebrate({ kind: "levelUp" });
      playSound("levelUp");
    }, 1400);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [level, up]);

  return (
    <section className="sticker flex flex-col gap-2 p-4" aria-labelledby="level-title">
      <h2 id="level-title" className="flex flex-wrap items-baseline gap-2">
        <span className="font-cute text-xl">
          Lv.{level.after} {levelName(level.after)}
        </span>
        <span className="text-xs text-ink-2">비공식 레벨 · 누적 XP {level.xpAfter}</span>
      </h2>
      {up && (
        <p className="flex flex-wrap items-center gap-2 font-semibold">
          <span className="fx-stamp font-cute">승급!</span>
          <span className="fx-rise-in" style={{ animationDelay: "200ms" }}>
            {levelName(level.before)}
          </span>
          <span aria-hidden="true">→</span>
          <span className="fx-rise-in" style={{ animationDelay: "450ms" }}>
            {levelName(level.after)}
          </span>
        </p>
      )}
      <div
        className="h-2.5 overflow-hidden rounded-full"
        style={{ backgroundColor: "var(--line)" }}
        role="progressbar"
        aria-label="다음 레벨까지"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(levelProgress(level.after, level.xpAfter) * 100)}
      >
        <div
          className="fx-bar h-full rounded-full"
          style={{ width: `${Math.round(width * 100)}%`, backgroundColor: "var(--accent)" }}
        />
      </div>
    </section>
  );
}
