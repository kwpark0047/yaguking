/**
 * 게임 소리(docs/sound-plan.md) — 소리 파일 없이 Web Audio로 그 자리에서 합성한다(받을 파일 0, 저작권 없음).
 *
 * - 기본 **끔**. 설정은 기기에만(`yk_sound`, 처리방침 §10). 서버 읽기·쓰기 0
 * - 브라우저는 사용자가 누르기 전에는 소리를 막는다 → 소리가 켜져 있으면 첫 누름 때 소리 장치를 켠다(unlock)
 * - 무음 스위치 존중: 지원하는 브라우저는 audioSession 'ambient'(다른 앱 음악도 끊지 않음)
 * - 짧고 작게: 모든 소리는 압축기를 지나고, 동시에 3개까지, 같은 소리는 0.1초 안에 다시 울리지 않는다
 * - 소리만으로 알리는 정보는 없다(모든 순간에 글자·화면 표시가 있다)
 */
export type SoundName =
  | 'tap'
  | 'pitch'
  | 'tick'
  | 'timeout'
  | 'hit'
  | 'extraBase'
  | 'homeRun'
  | 'walk'
  | 'out'
  | 'inningEnd'
  | 'upgrade'
  | 'gameEnd0'
  | 'gameEnd1'
  | 'gameEnd3'
  | 'tierReveal'
  | 'rankReveal'
  | 'duelWin'
  | 'levelUp'
  | 'welcome';

export type Volume = 'low' | 'mid' | 'high';

export interface SoundSettings {
  on: boolean;
  volume: Volume;
  /** 버튼 누름 "톡" — 따로 켠다 */
  taps: boolean;
}

export const SOUND_KEY = 'yk_sound';
export const DEFAULT_SOUND: SoundSettings = { on: false, volume: 'mid', taps: false };
export const VOLUME_GAIN: Record<Volume, number> = { low: 0.3, mid: 0.6, high: 0.9 };
export const VOLUME_LABEL: Record<Volume, string> = { low: '작게', mid: '보통', high: '크게' };

export function readSound(): SoundSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(SOUND_KEY) ?? 'null') as Partial<SoundSettings> | null;
    if (!saved) return DEFAULT_SOUND;
    return {
      on: saved.on === true,
      volume: saved.volume === 'low' || saved.volume === 'high' ? saved.volume : 'mid',
      taps: saved.taps === true,
    };
  } catch {
    return DEFAULT_SOUND;
  }
}

export function saveSound(settings: SoundSettings): void {
  try {
    const isDefault = !settings.on && settings.volume === 'mid' && !settings.taps;
    if (isDefault) localStorage.removeItem(SOUND_KEY);
    else localStorage.setItem(SOUND_KEY, JSON.stringify(settings));
  } catch {
    // 기억하지 못해도 이번 화면에는 적용된다
  }
  current = settings;
  if (settings.on) unlock();
  else void context?.suspend();
  for (const listener of listeners) listener(settings);
}

let current: SoundSettings | null = null;
const listeners = new Set<(settings: SoundSettings) => void>();
export function onSoundChange(listener: (settings: SoundSettings) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
const settingsNow = () => (current ??= readSound());

/** 경기 종료 소리: 득점 단계(축하 효과와 같은 기준 — 0 / 1~2 / 3+) */
export function gameEndSound(runs: number): SoundName {
  return runs >= 3 ? 'gameEnd3' : runs >= 1 ? 'gameEnd1' : 'gameEnd0';
}

/** 판정 → 소리 */
export function verdictSound(result: string, timedOut: boolean): SoundName {
  if (timedOut) return 'timeout';
  return ({ HR: 'homeRun', '3B': 'extraBase', '2B': 'extraBase', '1B': 'hit', BB: 'walk', K: 'out' } as const)[result as 'HR'] ?? 'out';
}

// ── 엔진 ─────────────────────────────────────────────────────────────────────
let context: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;
const lastPlayed = new Map<SoundName, number>();
let playing = 0;
export const MAX_AT_ONCE = 3;

function ensureContext(): AudioContext | null {
  if (context) return context;
  const Ctor = typeof window === 'undefined' ? undefined : (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  if (!Ctor) return null;
  try {
    const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
    if (session) session.type = 'ambient';
  } catch {
    // 지원하지 않으면 그대로
  }
  context = new Ctor();
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -18;
  compressor.ratio.value = 6;
  master = context.createGain();
  master.connect(compressor).connect(context.destination);
  const length = Math.floor(context.sampleRate * 1.5);
  noiseBuffer = context.createBuffer(1, length, context.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return context;
}

/** 누름 처리기 안에서 불러 소리 장치를 켠다(브라우저 자동 재생 정책) */
export function unlock(): void {
  if (!settingsNow().on) return;
  const ctx = ensureContext();
  if (ctx && ctx.state !== 'running') void ctx.resume();
}

/** 앱 시작 때 한 번: 첫 누름에 장치를 켜고, 탭이 가려지면 멈춘다 */
export function watchSound(): void {
  if (typeof window === 'undefined') return;
  const first = () => unlock();
  window.addEventListener('pointerdown', first, { capture: true });
  window.addEventListener('keydown', first, { capture: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) void context?.suspend();
    else if (settingsNow().on) void context?.resume();
  });
}

interface Tone {
  at: number;
  freq: number;
  to?: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
}
interface Noise {
  at: number;
  dur: number;
  filter: BiquadFilterType;
  freq: number;
  to?: number;
  gain?: number;
  attack?: number;
}

function tone(ctx: AudioContext, out: AudioNode, t0: number, { at, freq, to, dur, type = 'sine', gain = 0.5 }: Tone) {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  const start = t0 + at;
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, start + dur);
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(gain, start + Math.min(0.01, dur / 4));
  env.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(env).connect(out);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

function noise(ctx: AudioContext, out: AudioNode, t0: number, { at, dur, filter, freq, to, gain = 0.4, attack = 0.005 }: Noise) {
  if (!noiseBuffer) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  const biquad = ctx.createBiquadFilter();
  biquad.type = filter;
  const start = t0 + at;
  biquad.frequency.setValueAtTime(freq, start);
  if (to) biquad.frequency.exponentialRampToValueAtTime(to, start + dur);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(gain, start + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  src.connect(biquad).connect(env).connect(out);
  src.start(start);
  src.stop(start + dur + 0.02);
}

const C5 = 523.25;
const E5 = 659.25;
const G5 = 783.99;
const C6 = 1046.5;

/** 소리마다 합성 방법. 값(음 높이·길이)은 여기 한 곳 */
const RECIPES: Record<SoundName, (ctx: AudioContext, out: AudioNode, t: number) => number> = {
  tap: (c, o, t) => (tone(c, o, t, { at: 0, freq: 1200, dur: 0.04, type: 'triangle', gain: 0.15 }), 0.05),
  pitch: (c, o, t) => (noise(c, o, t, { at: 0, dur: 0.3, filter: 'bandpass', freq: 2400, to: 600, gain: 0.25, attack: 0.08 }), 0.3),
  tick: (c, o, t) => (tone(c, o, t, { at: 0, freq: 1800, dur: 0.05, type: 'square', gain: 0.12 }), 0.05),
  timeout: (c, o, t) => (tone(c, o, t, { at: 0, freq: 140, to: 90, dur: 0.4, type: 'sawtooth', gain: 0.3 }), 0.4),
  hit: (c, o, t) => {
    noise(c, o, t, { at: 0, dur: 0.08, filter: 'highpass', freq: 1800, gain: 0.6 });
    tone(c, o, t, { at: 0, freq: 2200, to: 1400, dur: 0.12, type: 'triangle', gain: 0.25 });
    return 0.15;
  },
  extraBase: (c, o, t) => {
    RECIPES.hit(c, o, t);
    noise(c, o, t, { at: 0.12, dur: 0.5, filter: 'bandpass', freq: 900, gain: 0.18, attack: 0.15 });
    return 0.6;
  },
  homeRun: (c, o, t) => {
    noise(c, o, t, { at: 0, dur: 0.1, filter: 'highpass', freq: 1500, gain: 0.8 });
    tone(c, o, t, { at: 0, freq: 2600, to: 1500, dur: 0.15, type: 'triangle', gain: 0.35 });
    noise(c, o, t, { at: 0.15, dur: 1.0, filter: 'bandpass', freq: 800, gain: 0.3, attack: 0.35 });
    noise(c, o, t, { at: 0.55, dur: 0.25, filter: 'lowpass', freq: 400, gain: 0.5 });
    noise(c, o, t, { at: 0.8, dur: 0.25, filter: 'lowpass', freq: 350, gain: 0.45 });
    return 1.2;
  },
  walk: (c, o, t) => (tone(c, o, t, { at: 0, freq: E5, dur: 0.3, gain: 0.3 }), 0.3),
  out: (c, o, t) => {
    tone(c, o, t, { at: 0, freq: 392, dur: 0.16, type: 'triangle', gain: 0.35 });
    tone(c, o, t, { at: 0.16, freq: 262, dur: 0.24, type: 'triangle', gain: 0.35 });
    return 0.4;
  },
  inningEnd: (c, o, t) => {
    tone(c, o, t, { at: 0, freq: 2000, dur: 0.18, type: 'square', gain: 0.1 });
    tone(c, o, t, { at: 0.22, freq: 2000, dur: 0.28, type: 'square', gain: 0.1 });
    return 0.5;
  },
  upgrade: (c, o, t) => {
    [C5, E5, G5].forEach((freq, i) => tone(c, o, t, { at: i * 0.1, freq, dur: 0.16, type: 'triangle', gain: 0.3 }));
    return 0.4;
  },
  gameEnd0: (c, o, t) => {
    tone(c, o, t, { at: 0, freq: G5, dur: 0.25, gain: 0.25 });
    tone(c, o, t, { at: 0.25, freq: E5, dur: 0.35, gain: 0.25 });
    return 0.6;
  },
  gameEnd1: (c, o, t) => {
    [C5, E5, G5, C6].forEach((freq, i) => tone(c, o, t, { at: i * 0.12, freq, dur: i === 3 ? 0.4 : 0.14, type: 'triangle', gain: 0.3 }));
    return 0.8;
  },
  gameEnd3: (c, o, t) => {
    [C5, E5, G5, C6, G5, C6].forEach((freq, i) =>
      tone(c, o, t, { at: i * 0.13, freq, dur: i === 5 ? 0.6 : 0.15, type: 'triangle', gain: 0.32 }),
    );
    noise(c, o, t, { at: 0.5, dur: 1.0, filter: 'bandpass', freq: 900, gain: 0.2, attack: 0.3 });
    return 1.5;
  },
  tierReveal: (c, o, t) => {
    for (let i = 0; i < 12; i++) noise(c, o, t, { at: i * 0.05, dur: 0.05, filter: 'lowpass', freq: 300, gain: 0.2 + i * 0.02 });
    tone(c, o, t, { at: 0.65, freq: C6, dur: 0.5, type: 'triangle', gain: 0.35 });
    noise(c, o, t, { at: 0.65, dur: 0.5, filter: 'highpass', freq: 5000, gain: 0.2 });
    return 1.2;
  },
  rankReveal: (c, o, t) => {
    [G5, C6].forEach((freq, i) => tone(c, o, t, { at: i * 0.14, freq, dur: 0.2, type: 'triangle', gain: 0.28 }));
    return 0.4;
  },
  duelWin: (c, o, t) => RECIPES.gameEnd3(c, o, t),
  levelUp: (c, o, t) => {
    [C5, E5, G5, C6].forEach((freq, i) => tone(c, o, t, { at: i * 0.09, freq, dur: 0.12, type: 'square', gain: 0.12 }));
    tone(c, o, t, { at: 0.4, freq: C6, to: C6 * 1.5, dur: 0.5, type: 'triangle', gain: 0.3 });
    return 0.9;
  },
  welcome: (c, o, t) => {
    [E5, G5, C6].forEach((freq, i) => tone(c, o, t, { at: i * 0.12, freq, dur: 0.35, gain: 0.25 }));
    return 0.6;
  },
};

/** 소리를 낸다. 꺼져 있거나 장치가 아직 안 켜졌으면 조용히 지나간다. `delay`초 뒤에 */
export function playSound(name: SoundName, delay = 0): void {
  const settings = settingsNow();
  if (!settings.on || (name === 'tap' && !settings.taps)) return;
  const ctx = ensureContext();
  if (!ctx || !master || ctx.state !== 'running') return;
  const now = ctx.currentTime;
  if (now - (lastPlayed.get(name) ?? -1) < 0.1 || playing >= MAX_AT_ONCE) return;
  lastPlayed.set(name, now);
  master.gain.value = VOLUME_GAIN[settings.volume];
  playing += 1;
  const length = RECIPES[name](ctx, master, now + delay);
  window.setTimeout(() => {
    playing -= 1;
  }, (length + delay) * 1000);
}
