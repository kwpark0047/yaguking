import type { ReactNode } from 'react';

/** 관리자 화면 공통 조각 — 이용자 앱의 색 토큰을 그대로 쓴다 */
export const primary = { backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' };
export const line = { borderColor: 'var(--line)' };
export const field = { borderColor: 'var(--line)', backgroundColor: 'var(--bg-card)' };

/** 한국 시각으로 "2026-10-27 13:05" */
export function fmtTime(ms: number | null | undefined): string {
  if (!ms) return '—';
  const kst = new Date(ms + 9 * 3_600_000);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${kst.getUTCFullYear()}-${pad(kst.getUTCMonth() + 1)}-${pad(kst.getUTCDate())} ${pad(kst.getUTCHours())}:${pad(kst.getUTCMinutes())}`;
}

/** datetime-local 입력값(한국 시각) ↔ ms */
export function toLocalInput(ms: number): string {
  return fmtTime(ms).replace(' ', 'T');
}
export function fromLocalInput(value: string): number {
  return Date.parse(`${value}:00+09:00`);
}

export function PageTitle({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-2xl font-bold">{children}</h1>
      {note && <p className="text-sm text-ink-2 break-keep">{note}</p>}
    </div>
  );
}

export function StatCard({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <section className="sticker flex flex-col gap-1 p-4" aria-label={label}>
      <h2 className="text-sm text-ink-2">{label}</h2>
      <p className="num-tabular text-3xl font-bold">{value}</p>
      {hint && <p className="text-xs text-ink-2 break-keep">{hint}</p>}
    </section>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="text-sm" style={{ color: 'var(--out)' }}>
      {children}
    </p>
  );
}
