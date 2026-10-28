import { useCallback, useEffect, useState } from 'react';
import { VIEW_STALE_MS, type ViewId } from '@/lib/admin/views';
import { readView, type View } from './views';
import { ErrorText, fmtTime, line } from './ui';

/**
 * 화면을 열 때 보기 문서 하나만 읽는다(읽기 1). 없으면 "새로 만들기"를 권하고, 오래됐으면 알린다 — 자동으로 다시
 * 만들지 않는다(그러면 열 때마다 읽기가 늘어난다). `rebuild`는 원본을 읽어 보기를 다시 쓴다.
 */
export function useView<T>(id: ViewId, rebuild: () => Promise<unknown>) {
  const [view, setView] = useState<View<T> | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    readView<T>(id)
      .then(setView)
      .catch(() => setError('불러오지 못했어요.'));
  }, [id]);

  useEffect(load, [load]);

  const refresh = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await rebuild();
      load();
    } catch (reason) {
      console.error('보기 새로 만들기 실패', id, reason);
      setError('새로 만들지 못했어요. 연결을 확인해 주세요.');
    } finally {
      setBusy(false);
    }
  }, [rebuild, load, id]);

  return { view, busy, error, refresh, reload: load };
}

/** 보기 머리: 만든 시각 · 오래됨 알림 · 새로 만들기 버튼 */
export function ViewBar({
  updatedAt,
  busy,
  error,
  onRefresh,
  cost,
}: {
  updatedAt: number | null;
  busy: boolean;
  error: string | null;
  onRefresh: () => void;
  cost: string;
}) {
  const stale = updatedAt !== null && Date.now() - updatedAt > VIEW_STALE_MS;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-ink-2">{updatedAt ? `${fmtTime(updatedAt)}에 만든 내용` : '아직 만든 적이 없어요'}</span>
        {stale && (
          <span className="rounded-full border px-2 py-0.5 text-xs" style={line}>
            30분 넘게 지남
          </span>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={onRefresh}
          className="min-h-11 rounded-option border-2 px-3 text-sm font-semibold disabled:opacity-60"
          style={line}
        >
          {busy ? '만드는 중…' : '새로 만들기'}
        </button>
      </div>
      <p className="text-xs text-ink-2 break-keep">열 때는 읽기 1번. 새로 만들기는 {cost}.</p>
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}
