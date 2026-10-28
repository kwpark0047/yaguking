import { useEffect, useRef, useState } from 'react';
import { chosungRound, type ChosungRound } from '@/content/chosung';
import { currentMode } from '@/lib/effects/preference';
import {
  CHANCE_INTRO,
  CHANCE_TITLE,
  ZONE_FIRST_SECONDS,
  ZONE_PITCHES,
  ZONE_SECONDS,
  timingOutcome,
  zonePitch,
  type ChanceKind,
  type ChanceOutcome,
  type ChanceReason,
  type ZonePitch,
} from '@/lib/game/chance';
import { playSound } from '@/lib/sound/sound';

/**
 * 찬스 이벤트 화면(docs/fun-plan.md) — 타이밍 배팅·스트라이크 판정·초성 퀴즈. 3~5초, 건너뛰기 항상.
 * 결과를 잠깐(1.2초) 보여 준 뒤 onDone. 못해도 손해 없음(경기 흐름은 문제 타석이 정한다).
 */
export function ChanceEvent({
  kind,
  reason,
  onDone,
  random = Math.random,
}: {
  kind: ChanceKind;
  reason: ChanceReason;
  onDone: (outcome: ChanceOutcome) => void;
  random?: () => number;
}) {
  const [result, setResult] = useState<{ outcome: ChanceOutcome; text: string } | null>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  function finish(outcome: ChanceOutcome, text: string) {
    if (result) return;
    setResult({ outcome, text });
    playSound(outcome === 'perfect' ? 'homeRun' : outcome === 'good' ? 'hit' : outcome === 'success' ? 'upgrade' : 'tap');
  }

  useEffect(() => {
    if (!result) return;
    const timer = window.setTimeout(() => doneRef.current(result.outcome), result.outcome === 'skipped' ? 0 : 1200);
    return () => window.clearTimeout(timer);
  }, [result]);

  return (
    <section className="sticker flex flex-col gap-3 p-4" aria-labelledby="chance-title">
      <p className="text-xs font-semibold" style={{ color: 'var(--accent)' }}>
        {CHANCE_INTRO[reason]} · 못해도 손해 없어요
      </p>
      <h1 id="chance-title" className="font-cute text-2xl">
        {CHANCE_TITLE[kind]}
      </h1>
      {kind === 'timing' && <TimingGame random={random} disabled={result !== null} onResult={finish} />}
      {kind === 'zone' && <ZoneGame random={random} disabled={result !== null} onResult={finish} />}
      {kind === 'chosung' && <ChosungGame random={random} disabled={result !== null} onResult={finish} />}
      {result ? (
        <p role="status" className="font-cute text-center text-xl">
          {result.text}
        </p>
      ) : (
        <button type="button" onClick={() => finish('skipped', '건너뛰었어요')} className="min-h-11 self-end text-sm underline">
          건너뛰기
        </button>
      )}
    </section>
  );
}

type OnResult = (outcome: ChanceOutcome, text: string) => void;

/** 타이밍 배팅 — 공이 존에 닿는 순간 누르기(화면 탭·스페이스·엔터). 동작 줄이기면 줄어드는 링 */
function TimingGame({ random, disabled, onResult }: { random: () => number; disabled: boolean; onResult: OnResult }) {
  const [phase, setPhase] = useState<'ready' | 'pitching'>('ready');
  const [progress, setProgress] = useState(0);
  const arrival = useRef(0);
  const curve = useRef((random() - 0.5) * 40);
  const duration = useRef(900 + random() * 500);
  const swung = useRef(false);
  const calm = currentMode() !== 'full';

  function start() {
    if (phase !== 'ready' || disabled) return;
    playSound('pitch');
    const startAt = performance.now() + 400;
    arrival.current = startAt + duration.current;
    setPhase('pitching');
    let frame = requestAnimationFrame(function step(now) {
      const p = (now - startAt) / duration.current;
      setProgress(Math.max(0, p));
      if (p > 1.3) {
        if (!swung.current) {
          swung.current = true;
          onResult('miss', '못 쳤어요 — 다음 기회에!');
        }
        return;
      }
      frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }

  function swing() {
    if (phase !== 'pitching' || swung.current || disabled) return;
    swung.current = true;
    const outcome = timingOutcome(performance.now() - arrival.current);
    onResult(outcome, outcome === 'perfect' ? '퍼펙트! 보너스 홈런' : outcome === 'good' ? '굿! 보너스 안타' : '헛스윙 — 아웃은 아니에요');
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== ' ' && event.key !== 'Enter') return;
      event.preventDefault();
      if (phase === 'ready') start();
      else swing();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const p = Math.min(progress, 1.3);
  const size = 10 + p * 34;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-ink-2 break-keep">
        {calm ? '바깥 원이 노란 원에 닿는 순간 누르세요.' : '공이 노란 존에 들어오는 순간 누르세요.'} (스페이스·엔터도 돼요)
      </p>
      <button
        type="button"
        onPointerDown={phase === 'pitching' ? swing : undefined}
        onClick={phase === 'ready' ? start : undefined}
        aria-label={phase === 'ready' ? '투구 시작' : '스윙'}
        className="relative h-56 w-full overflow-hidden rounded-2xl"
        style={{ background: '#0b1730', touchAction: 'manipulation' }}
      >
        <svg viewBox="0 0 200 200" className="absolute inset-0 m-auto h-full" aria-hidden="true">
          <rect x="70" y="95" width="60" height="70" rx="4" fill="none" stroke="#ffc53d" strokeWidth="3" />
          {phase === 'pitching' && !calm && (
            <circle
              cx={100 + curve.current * Math.sin(Math.min(p, 1) * Math.PI)}
              cy={30 + Math.min(p, 1.3) * 100}
              r={size / 2}
              fill="#fff"
              stroke="#e24b4a"
              strokeWidth="1.5"
            />
          )}
          {phase === 'pitching' && calm && (
            <>
              <circle cx="100" cy="130" r="22" fill="none" stroke="#ffc53d" strokeWidth="3" />
              <circle cx="100" cy="130" r={Math.max(4, 22 + (1 - Math.min(p, 1.3)) * 60)} fill="none" stroke="#fff" strokeWidth="3" />
            </>
          )}
        </svg>
        {phase === 'ready' && <span className="font-cute relative text-xl text-white">눌러서 투구 시작</span>}
      </button>
    </div>
  );
}

/** 스트라이크? 볼? — 3구 연속, 공마다 2초 */
function ZoneGame({ random, disabled, onResult }: { random: () => number; disabled: boolean; onResult: OnResult }) {
  const [index, setIndex] = useState(0);
  const [pitch, setPitch] = useState<ZonePitch>(() => zonePitch(random));
  const seconds = (pitchIndex: number) => (pitchIndex === 0 ? ZONE_FIRST_SECONDS : ZONE_SECONDS);
  const [left, setLeft] = useState(seconds(0) * 1000);
  const deadline = useRef(performance.now() + seconds(0) * 1000);

  useEffect(() => {
    if (disabled) return;
    deadline.current = performance.now() + seconds(index) * 1000;
    const timer = window.setInterval(() => {
      const rest = deadline.current - performance.now();
      setLeft(Math.max(0, rest));
      if (rest <= 0) {
        window.clearInterval(timer);
        onResult('fail', `시간 초과 — ${index}/${ZONE_PITCHES} 맞혔어요`);
      }
    }, 100);
    return () => window.clearInterval(timer);
    // 공이 바뀔 때마다 시계를 새로
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, disabled]);

  function answer(strike: boolean) {
    if (disabled) return;
    if (strike !== pitch.strike) {
      onResult('fail', `아쉬워요 — ${pitch.strike ? '스트라이크' : '볼'}였어요`);
      return;
    }
    playSound('tap');
    if (index + 1 >= ZONE_PITCHES) {
      onResult('success', '3개 모두! 보너스 볼넷');
      return;
    }
    setIndex(index + 1);
    setPitch(zonePitch(random));
  }

  // 존(0~1)을 그림 좌표로: 존은 x 60~140, y 40~140
  const cx = 60 + pitch.x * 80;
  const cy = 40 + pitch.y * 100;
  return (
    <div className="flex flex-col gap-2">
      <p className="num-tabular text-sm text-ink-2">
        {index + 1}/{ZONE_PITCHES}구 · {(left / 1000).toFixed(1)}초 — 실제 심판 판정과 다를 수 있어요(단순한 존)
      </p>
      <svg viewBox="0 0 200 180" className="mx-auto h-48 rounded-2xl" style={{ background: '#0b1730' }} role="img" aria-label="스트라이크 존과 공 자국">
        <rect x="60" y="40" width="80" height="100" fill="none" stroke="#ffc53d" strokeWidth="3" />
        {[86.7, 113.3].map((x) => (
          <line key={x} x1={x} y1="40" x2={x} y2="140" stroke="#ffc53d" strokeOpacity="0.35" />
        ))}
        {[73.3, 106.7].map((y) => (
          <line key={y} x1="60" y1={y} x2="140" y2={y} stroke="#ffc53d" strokeOpacity="0.35" />
        ))}
        <circle key={index} className="fx-pulse" cx={cx} cy={cy} r="7" fill="#fff" stroke="#e24b4a" strokeWidth="2" />
      </svg>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" disabled={disabled} onClick={() => answer(true)} className="min-h-14 rounded-option border-2 font-semibold" style={{ borderColor: 'var(--line)' }}>
          스트라이크
        </button>
        <button type="button" disabled={disabled} onClick={() => answer(false)} className="min-h-14 rounded-option border-2 font-semibold" style={{ borderColor: 'var(--line)' }}>
          볼
        </button>
      </div>
    </div>
  );
}

/** 초성 퀴즈 — 보기 셋, 5초 */
function ChosungGame({ random, disabled, onResult }: { random: () => number; disabled: boolean; onResult: OnResult }) {
  const [round] = useState<ChosungRound>(() => chosungRound(random));
  const [left, setLeft] = useState(5000);
  useEffect(() => {
    if (disabled) return;
    const end = performance.now() + 5000;
    const timer = window.setInterval(() => {
      const rest = end - performance.now();
      setLeft(Math.max(0, rest));
      if (rest <= 0) {
        window.clearInterval(timer);
        onResult('fail', `시간 초과 — 정답은 ${round.answer}`);
      }
    }, 100);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled]);
  return (
    <div className="flex flex-col gap-3">
      <p className="font-cute text-center text-4xl tracking-[0.3em]" aria-label={`초성 ${round.initials}`}>
        {round.initials}
      </p>
      <p className="text-center text-sm text-ink-2">
        힌트: {round.hint} · <span className="num-tabular">{(left / 1000).toFixed(1)}초</span>
      </p>
      <div className="grid gap-2">
        {round.options.map((option) => (
          <button
            key={option}
            type="button"
            disabled={disabled}
            onClick={() => onResult(option === round.answer ? 'success' : 'fail', option === round.answer ? '정답! 다음 문제 시간 +3초' : `아쉬워요 — 정답은 ${round.answer}`)}
            className="min-h-12 rounded-option border-2 font-semibold"
            style={{ borderColor: 'var(--line)', backgroundColor: 'var(--bg-card)' }}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}
