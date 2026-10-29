import { useEffect, useRef, useState } from 'react';
import { CATEGORY_TITLE, type OptionLabel, type Question } from '@/content/questions';
import { LIMIT_MS } from '@/lib/engine';
import { DIFFICULTY_LABEL } from '@/lib/game/labels';
import { playSound } from '@/lib/sound/sound';

const KEY_TO_LABEL: Record<string, OptionLabel> = {
  '1': 'A',
  '2': 'B',
  '3': 'C',
  '4': 'D',
  a: 'A',
  s: 'B',
  d: 'C',
  f: 'D',
};

/**
 * 문제 하나 — 보기 4개와 15초 시계(엔진의 LIMIT_MS).
 *
 * 시간은 **이 기기가 잰다**(서버가 없다). 그래서 결과는 비공식이다.
 * 보기는 누르면 바로 제출된다. 키보드 1~4 또는 A·S·D·F로도 고른다.
 * 남은 시간은 글자로도 보이고, 시계 막대는 장식이라 낭독에서 뺀다.
 * 기록 기준일을 항상 적는다 — 기준이 없으면 시간이 지나 정답이 바뀔 수 있다.
 */
export function QuestionView({
  question,
  onAnswer,
  limitMs = LIMIT_MS,
  fresh = false,
}: {
  /** 화면에 보이는 부분만 — 정답은 받지 않는다(오늘의 공식전 문제에는 정답이 없다) */
  question: Pick<Question, 'id' | 'category' | 'difficulty' | 'recordAsOf' | 'seasonScope' | 'stem' | 'options'>;
  /** choice=null이면 시간 초과 */
  onAnswer: (choice: OptionLabel | null, elapsedMs: number) => void;
  /** 제한 시간 — 찬스 이벤트 보너스(초성 정답)면 3초 길다 */
  limitMs?: number;
  /** 최신 경기 특집 문항 — "최신 경기" 표시 */
  fresh?: boolean;
}) {
  const startedAt = useRef(performance.now());
  const sectionRef = useRef<HTMLElement>(null);
  const answered = useRef(false);
  const [left, setLeft] = useState(limitMs);
  /** 남은 3·2·1초 "틱"을 이미 울린 초(소리 켠 사람만) */
  const ticked = useRef(4);

  // 문항이 바뀌면 시계를 다시 맞추고 투구 소리
  useEffect(() => {
    startedAt.current = performance.now();
    answered.current = false;
    ticked.current = 4;
    setLeft(limitMs);
    playSound('pitch');
    // 큰 글자(대)에서는 문제가 바뀌면 문제 맨 위로 — 보기가 화면 아래로 이어진다(docs/game-look-plan.md §2)
    if (document.documentElement.dataset.text === 'l') sectionRef.current?.scrollIntoView?.({ block: 'start' });
  }, [question.id]);

  // 시계·키보드 처리기는 문항마다 한 번 건다. 최신 onAnswer는 ref로 본다.
  const onAnswerRef = useRef(onAnswer);
  onAnswerRef.current = onAnswer;

  function submit(choice: OptionLabel | null) {
    if (answered.current) return;
    answered.current = true;
    if (choice !== null) playSound('tap');
    const elapsed = performance.now() - startedAt.current;
    onAnswerRef.current(choice, choice === null ? limitMs + 1 : elapsed);
  }
  const submitRef = useRef(submit);
  submitRef.current = submit;

  useEffect(() => {
    const timer = window.setInterval(() => {
      const remaining = limitMs - (performance.now() - startedAt.current);
      setLeft(Math.max(0, remaining));
      const second = Math.ceil(remaining / 1000);
      if (second >= 1 && second <= 3 && second < ticked.current && !answered.current) {
        ticked.current = second;
        playSound('tick');
      }
      if (remaining <= 0) submitRef.current(null);
    }, 100);
    return () => window.clearInterval(timer);
  }, [question.id]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest?.('input, textarea, select')) return;
      const label = KEY_TO_LABEL[event.key.toLowerCase()];
      if (label) submitRef.current(label);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [question.id]);

  const ratio = left / limitMs;

  return (
    <section key={question.id} ref={sectionRef} className="g-card fx-pitch-in flex flex-col gap-4" aria-labelledby="question-stem">
      <div className="g-timer -mx-1 flex items-center gap-3 px-1 py-1">
        <div
          aria-hidden="true"
          className="h-2 flex-1 overflow-hidden rounded-full"
          style={{ backgroundColor: 'var(--bg-field)' }}
        >
          <div
            className="h-full rounded-full"
            style={{
              width: `${ratio * 100}%`,
              backgroundColor: ratio > 0.3 ? 'var(--accent)' : 'var(--out)',
              transition: 'width 100ms linear',
            }}
          />
        </div>
        <span className="g-num num-tabular shrink-0 text-right font-semibold">
          {(left / 1000).toFixed(1)}초
        </span>
      </div>

      <p className="g-meta flex flex-wrap items-center gap-x-2 gap-y-1 text-ink-2">
        {fresh && (
          <span className="rounded-full px-2 font-semibold" style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}>
            최신 경기
          </span>
        )}
        <span>{CATEGORY_TITLE[question.category]}</span>
        <span aria-hidden="true">·</span>
        <span>{DIFFICULTY_LABEL[question.difficulty]}</span>
        <span aria-hidden="true">·</span>
        <span>기준일 {question.recordAsOf}</span>
        {question.seasonScope && (
          <>
            <span aria-hidden="true">·</span>
            <span>{question.seasonScope}</span>
          </>
        )}
      </p>

      <h2 id="question-stem" className="g-stem font-medium break-keep">
        {question.stem}
      </h2>

      <div role="group" aria-label="보기" className="flex flex-col gap-2">
        {question.options.map((option) => (
          <button
            key={option.label}
            type="button"
            onClick={() => submit(option.label)}
            className="g-option-button flex min-h-14 items-center gap-3 rounded-option border-2 px-3 py-2 text-left"
            style={{ borderColor: 'var(--line)', backgroundColor: 'var(--bg-card)' }}
          >
            <span className="g-medal g-label font-cute">{option.label}</span>
            <span className="g-option break-keep">{option.text}</span>
          </button>
        ))}
      </div>
      <p className="g-meta text-ink-2">보기를 누르면 바로 제출돼요. 숫자 키 1~4 또는 A·S·D·F로도 고를 수 있어요.</p>
    </section>
  );
}
