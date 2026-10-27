import { particleCap, type EffectStep } from './catalog';

/**
 * 폭죽·꽃가루·반짝이 캔버스(docs/effects-plan.md §3·§7). **처음 축하가 필요할 때** 따로 받는다(celebrate.ts의 import()).
 *
 * - 화면 맨 위에 투명 캔버스 하나, 누를 수 없고(`pointer-events: none`) 화면 읽기에서 숨김
 * - requestAnimationFrame 하나로 모든 입자, 입자가 없으면 루프를 멈추고 캔버스를 뗀다
 * - devicePixelRatio는 2까지, 입자 수 상한(particleCap), 탭이 가려지면 바로 지운다
 * 바깥 라이브러리를 쓰지 않는다.
 */
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  decay: number;
  color: string;
  size: number;
  spin: number;
  kind: 'spark' | 'paper' | 'rocket';
  /** 로켓이 터질 높이(px) */
  burstAt?: number;
  colors?: string[];
}

let canvas: HTMLCanvasElement | null = null;
let context: CanvasRenderingContext2D | null = null;
let particles: Particle[] = [];
let frame = 0;
const timers = new Set<number>();

function ensureCanvas(): CanvasRenderingContext2D | null {
  if (canvas && context) return context;
  canvas = document.createElement('canvas');
  canvas.className = 'effects-layer';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);
  context = canvas.getContext('2d');
  resize();
  return context;
}

function resize() {
  if (!canvas || !context) return;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(window.innerWidth * ratio);
  canvas.height = Math.round(window.innerHeight * ratio);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function teardown() {
  cancelAnimationFrame(frame);
  frame = 0;
  for (const timer of timers) window.clearTimeout(timer);
  timers.clear();
  particles = [];
  canvas?.remove();
  canvas = null;
  context = null;
}

function room(): number {
  return particleCap(window.innerWidth, navigator.hardwareConcurrency) - particles.length;
}

function add(particle: Particle) {
  if (room() > 0) particles.push(particle);
}

function burst(x: number, y: number, count: number, speed: number, colors: string[], kind: 'spark' | 'paper') {
  const n = Math.min(count, room());
  for (let i = 0; i < n; i++) {
    const angle = Math.random() * Math.PI * 2;
    const velocity = speed * (0.35 + Math.random() * 0.65);
    add({
      x,
      y,
      vx: Math.cos(angle) * velocity,
      vy: Math.sin(angle) * velocity - (kind === 'paper' ? 3 : 0),
      life: 1,
      decay: kind === 'paper' ? 0.006 + Math.random() * 0.008 : 0.012 + Math.random() * 0.014,
      color: colors[i % colors.length]!,
      size: kind === 'paper' ? 4 + Math.random() * 3 : 2 + Math.random() * 1.2,
      spin: Math.random() * Math.PI,
      kind,
    });
  }
}

function tick() {
  frame = 0;
  if (!context) return;
  const width = window.innerWidth;
  const height = window.innerHeight;
  context.clearRect(0, 0, width, height);
  const alive: Particle[] = [];
  for (const p of particles) {
    if (p.kind === 'rocket') {
      p.y += p.vy;
      context.globalAlpha = 1;
      context.fillStyle = '#ffffff';
      context.beginPath();
      context.arc(p.x, p.y, 2, 0, Math.PI * 2);
      context.fill();
      if (p.y <= (p.burstAt ?? 0)) burst(p.x, p.y, 60, 4.4, p.colors ?? ['#ffffff'], 'spark');
      else alive.push(p);
      continue;
    }
    p.vx *= 0.98;
    p.vy = p.vy * 0.98 + (p.kind === 'paper' ? 0.12 : 0.06);
    p.x += p.vx;
    p.y += p.vy;
    p.life -= p.decay;
    p.spin += 0.18;
    if (p.life <= 0 || p.y > height + 20) continue;
    context.globalAlpha = Math.max(0, Math.min(1, p.life));
    context.fillStyle = p.color;
    if (p.kind === 'paper') {
      context.save();
      context.translate(p.x, p.y);
      context.rotate(p.spin);
      context.fillRect(-p.size, -p.size / 2.5, p.size * 2, p.size / 1.25);
      context.restore();
    } else {
      context.beginPath();
      context.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      context.fill();
    }
    alive.push(p);
  }
  context.globalAlpha = 1;
  particles = alive;
  if (particles.length > 0 || timers.size > 0) frame = requestAnimationFrame(tick);
  else teardown();
}

function start() {
  if (!frame) frame = requestAnimationFrame(tick);
}

export interface Area {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** 계획(steps)을 재생한다. area는 위치(x·y 0~1)의 기준 — 없으면 화면 전체 */
export function play(steps: readonly EffectStep[], colors: Record<string, string[]>, area?: Area) {
  if (!ensureCanvas()) return;
  const box = area ?? { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
  for (const s of steps) {
    const timer = window.setTimeout(() => {
      timers.delete(timer);
      const palette = colors[s.palette] ?? ['#ffffff'];
      const x = box.left + box.width * s.x;
      const y = box.top + box.height * s.y;
      if (s.part === 'firework') {
        const fromY = window.innerHeight + 10;
        const burstAt = Math.max(40, window.innerHeight * s.y);
        add({ x, y: fromY, vx: 0, vy: -(fromY - burstAt) / 30, life: 1, decay: 0, color: '#fff', size: 2, spin: 0, kind: 'rocket', burstAt, colors: palette });
      } else if (s.part === 'confetti') {
        burst(x, y, s.count, 5, palette, 'paper');
      } else {
        burst(x, y, s.count, 2.6, palette, 'spark');
      }
      start();
    }, s.at);
    timers.add(timer);
  }
  start();
}

if (typeof window !== 'undefined') {
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) teardown();
  });
}
