import { useEffect, useId, useState } from 'react';
import { currentMode, EFFECTS_CHOICES, readChoice, saveChoice, type EffectsChoice } from '@/lib/effects/preference';
import { onSoundChange, readSound, saveSound, VOLUME_LABEL, type SoundSettings, type Volume } from '@/lib/sound/sound';

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

/** "소리" — 끄기(기본)·작게·보통·크게 한 칸. 전체 판(설정 화면)은 "버튼 소리"도 */
export function SoundSetting({ compact = false }: { compact?: boolean }) {
  const [settings, setSettings] = useState<SoundSettings>(readSound);
  const id = useId();
  useEffect(() => onSoundChange(setSettings), []);
  const value = settings.on ? settings.volume : 'off';
  const update = (next: SoundSettings) => {
    setSettings(next);
    saveSound(next);
  };
  return (
    <div className={compact ? 'flex items-center gap-2 text-xs' : 'flex flex-col gap-1 text-sm'}>
      <label htmlFor={id} className={compact ? 'text-ink-2' : undefined}>
        소리
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => {
          const choice = event.target.value;
          update(choice === 'off' ? { ...settings, on: false } : { ...settings, on: true, volume: choice as Volume });
        }}
        className={compact ? 'min-h-11 rounded-option border px-2' : 'min-h-11 rounded-option border px-3'}
        style={{ borderColor: 'var(--line)', backgroundColor: 'var(--hero-button-bg, var(--bg-card))', color: 'inherit' }}
      >
        <option value="off">끄기</option>
        {(Object.keys(VOLUME_LABEL) as Volume[]).map((volume) => (
          <option key={volume} value={volume}>
            {VOLUME_LABEL[volume]}
          </option>
        ))}
      </select>
      {!compact && (
        <>
          <label className="flex min-h-11 items-center gap-2">
            <input type="checkbox" checked={settings.taps} onChange={(event) => update({ ...settings, taps: event.target.checked })} />
            버튼 누를 때 소리
          </label>
          <p className="text-xs text-ink-2 break-keep">타격·홈런·아웃 같은 효과음이에요. 휴대폰 무음 모드에서는 나지 않을 수 있어요.</p>
        </>
      )}
    </div>
  );
}

/** 경기 화면 머리줄의 소리 켜고 끄기 단추 */
export function SoundToggle() {
  const [settings, setSettings] = useState<SoundSettings>(readSound);
  useEffect(() => onSoundChange(setSettings), []);
  return (
    <button
      type="button"
      aria-pressed={settings.on}
      aria-label="소리"
      onClick={() => saveSound({ ...settings, on: !settings.on })}
      className="flex min-h-11 min-w-11 items-center justify-center rounded-full"
      title={settings.on ? '소리 끄기' : '소리 켜기'}
    >
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 9v6h4l5 4V5L8 9H4z" />
        {settings.on ? <path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" /> : <path d="M17 9l5 6M22 9l-5 6" />}
      </svg>
    </button>
  );
}
