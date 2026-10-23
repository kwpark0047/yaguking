'use client';

import { useState } from 'react';
import { formatRate } from '@/lib/engine';
import type { CareerBattingDto } from '@/types/api';

/** 통산 / 시즌 토글 (08 문서 V08). */
export function BattingToggle({
  career,
  season,
}: {
  career: CareerBattingDto | null;
  season: CareerBattingDto | null;
}) {
  const [scope, setScope] = useState<'career' | 'season'>('career');
  const data = scope === 'career' ? career : season;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex gap-2" role="tablist" aria-label="기록 범위">
        {(
          [
            ['career', '통산'],
            ['season', '시즌'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={scope === key}
            onClick={() => setScope(key)}
            className="min-h-11 flex-1 rounded-option border text-sm"
            style={{
              borderColor: scope === key ? 'var(--accent)' : 'var(--line)',
              fontWeight: scope === key ? 600 : 400,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {!data || data.pa === 0 ? (
        <p className="text-sm text-ink-2">
          {scope === 'career'
            ? '아직 기록이 없습니다. 공식 경기를 한 이닝 해 보세요.'
            : '이번 시즌 기록이 없습니다.'}
        </p>
      ) : (
        <>
          <dl className="grid grid-cols-4 gap-2 text-center">
            {[
              ['타석', String(data.pa)],
              ['타수', String(data.ab)],
              ['안타', String(data.h)],
              ['홈런', String(data.hr)],
              ['볼넷', String(data.bb)],
              ['삼진', String(data.so)],
              ['득점', String(data.r)],
              ['타율', formatRate(data.avg)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-option bg-bg-field p-2">
                <dt className="text-xs text-ink-2">{label}</dt>
                <dd className="num-tabular font-semibold">{value}</dd>
              </div>
            ))}
          </dl>

          <dl className="grid grid-cols-3 gap-2 text-center">
            {[
              ['출루율', formatRate(data.obp)],
              ['장타율', formatRate(data.slg)],
              ['OPS', formatRate(data.ops)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-option bg-bg-field p-2">
                <dt className="text-xs text-ink-2">{label}</dt>
                <dd className="num-tabular text-lg font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </section>
  );
}
