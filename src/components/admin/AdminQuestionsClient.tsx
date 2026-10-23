'use client';

import { useCallback, useEffect, useState } from 'react';
import { DIFFICULTY_LABEL } from '@/lib/game/labels';
import type { AdminQuestionDto } from '@/types/api';

/**
 * 문항 검수 콘솔 (08 문서 V19).
 *
 * 게시 조건(보기 4개 · 정답 1개 · 출처 1건)은 화면에서 미리 보여 주되
 * **최종 차단은 DB 트리거**가 한다. 화면 검증만 믿으면 API를 직접 호출해
 * 우회할 수 있다.
 */
const STATUS_TABS = [
  { value: 'draft', label: '작성 중' },
  { value: 'published', label: '게시됨' },
  { value: '', label: '전체' },
] as const;

export function AdminQuestionsClient() {
  const [status, setStatus] = useState<string>('draft');
  const [items, setItems] = useState<AdminQuestionDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const query = status ? `?status=${status}` : '';
    const response = await fetch(`/api/v1/admin/questions${query}`, {
      cache: 'no-store',
    });
    const body = await response.json();
    setLoading(false);

    if (!body.success) {
      setError(body.error.message);
      setItems([]);
      return;
    }
    setItems(body.data);
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function publish(id: string) {
    setMessage(null);
    setError(null);

    const response = await fetch(`/api/v1/admin/questions/${id}/publish`, {
      method: 'POST',
    });
    const body = await response.json();

    if (!body.success) {
      setError(body.error.message);
      return;
    }
    setMessage('게시했습니다.');
    await load();
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
      <h1 className="text-2xl font-bold">문항 검수</h1>

      <p className="text-xs text-ink-2 break-keep">
        데이터 사용권 확보 전에는 자체 작성 문항과 검증된 공개 사실만 등록합니다.
        자동 생성 초안도 이 화면의 승인을 거쳐야 출제됩니다.
      </p>

      <div className="flex gap-2" role="tablist">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={status === tab.value}
            onClick={() => setStatus(tab.value)}
            className="min-h-11 flex-1 rounded-option border text-sm"
            style={{
              borderColor: status === tab.value ? 'var(--accent)' : 'var(--line)',
              fontWeight: status === tab.value ? 600 : 400,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="text-sm" style={{ color: 'var(--out)' }} role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="text-sm" style={{ color: 'var(--on-base)' }} role="status">
          {message}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-ink-2">불러오는 중…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-ink-2">문항이 없습니다.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex flex-col gap-2 rounded-card border p-3"
              style={{ borderColor: 'var(--line)' }}
            >
              <p className="text-sm break-keep">{item.stem}</p>

              <p className="flex flex-wrap gap-x-2 gap-y-1 text-xs text-ink-2">
                <span>{item.categorySlug}</span>
                <span aria-hidden="true">·</span>
                <span>{DIFFICULTY_LABEL[item.difficulty]}</span>
                <span aria-hidden="true">·</span>
                <span>기준일 {item.recordAsOf}</span>
                <span aria-hidden="true">·</span>
                <span>{item.status}</span>
              </p>

              <p className="flex flex-wrap gap-x-3 text-xs">
                <span style={{ color: item.optionCount === 4 ? 'var(--on-base)' : 'var(--out)' }}>
                  보기 {item.optionCount}/4
                </span>
                <span style={{ color: item.correctCount === 1 ? 'var(--on-base)' : 'var(--out)' }}>
                  정답 {item.correctCount}/1
                </span>
                <span style={{ color: item.sourceCount >= 1 ? 'var(--on-base)' : 'var(--out)' }}>
                  출처 {item.sourceCount}건
                </span>
              </p>

              {item.status !== 'published' && (
                <button
                  type="button"
                  disabled={!item.publishable}
                  onClick={() => void publish(item.id)}
                  className="min-h-11 self-start rounded-option px-4 text-sm font-semibold disabled:opacity-50"
                  style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
                >
                  {item.publishable ? '게시 승인' : '조건 미충족'}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
