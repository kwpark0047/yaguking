import { useEffect, useId, useState } from 'react';
import { currentMode, EFFECTS_CHOICES, readChoice, saveChoice, type EffectsChoice } from '@/lib/effects/preference';

/** "화면 효과" 켜기·줄이기·끄기 — 기기에만 저장(yk_effects). 비회원도 쓸 수 있게 홈·설정에 둔다 */
export function EffectsSetting({ compact = false }: { compact?: boolean }) {
  const [choice, setChoice] = useState<EffectsChoice>(readChoice);
  const id = useId();
  return (
    <div className={compact ? 'flex items-center gap-2 text-xs' : 'flex flex-col gap-1 text-sm'}>
      <label htmlFor={id} className={compact ? 'text-ink-2' : undefined}>
        화면 효과
      </label>
      <select
        id={id}
        value={choice}
        onChange={(event) => {
          const next = event.target.value as EffectsChoice;
          setChoice(next);
          saveChoice(next);
        }}
        className={compact ? 'min-h-11 rounded-option border px-2' : 'min-h-11 rounded-option border px-3'}
        style={{ borderColor: 'var(--line)', backgroundColor: 'var(--hero-button-bg, var(--bg-card))', color: 'inherit' }}
      >
        {EFFECTS_CHOICES.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {!compact && (
        <p className="text-xs text-ink-2 break-keep">
          폭죽·꽃가루 같은 축하 효과예요. 기기에서 동작 줄이기를 켜 두었으면 설정과 상관없이 효과가 나오지 않아요.
        </p>
      )}
    </div>
  );
}

/** 늦게 뜨는 화면을 기다릴 때 — 0.3초가 넘을 때만 보인다(CSS 지연) */
export function LoadingBall({ label = '불러오는 중…' }: { label?: string }) {
  return (
    <p role="status" className="fx-loading flex items-center justify-center gap-2 py-6 text-sm text-ink-2">
      <span className="fx-ball" aria-hidden="true" />
      {label}
    </p>
  );
}

/**
 * 0에서 target까지 숫자를 굴린다(전광판처럼). 화면 효과가 꺼져 있으면 바로 최종값.
 * 1초도 안 걸리고 알림 영역(live region)에 두지 않으므로, 화면 읽기가 그 줄에 닿을 때는 이미 최종값이다.
 */
export function useCountUp(target: number, durationMs = 600): number {
  const [shown, setShown] = useState(() => (currentMode() === 'none' || target <= 0 ? target : 0));
  useEffect(() => {
    if (currentMode() === 'none' || target <= 0) {
      setShown(target);
      return;
    }
    const started = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      const progress = Math.min(1, (now - started) / durationMs);
      setShown(Math.round(target * progress));
      if (progress < 1) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs]);
  return shown;
}
