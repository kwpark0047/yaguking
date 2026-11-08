import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { kstDate } from '@/lib/game/attendance';
import { loadCard, type KboCard } from '@/lib/kbo/quiz';
import { headlineOf, isPlayable, kboQuizOpen } from '@/lib/kbo/set';

/** 홈의 "어제의 KBO 퀴즈" 단추 — 묶음이 있을 때만 보인다. 묶음 문서를 기기당 하루 한 번 읽는다 */
export function KboQuizCard({ style }: { style: React.CSSProperties }) {
  const open = kboQuizOpen(kstDate());
  const [card, setCard] = useState<KboCard | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    loadCard()
      .then((loaded) => {
        if (!cancelled) setCard(loaded);
      })
      .catch(() => undefined); // 카드 하나 안 보일 뿐이다
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open || !card) return null;
  const playable = isPlayable(card.kind);
  return (
    <Link to="/yesterday" className="flex min-h-14 flex-col items-center justify-center rounded-option border-2 px-3 py-1 font-semibold" style={style}>
      <span>{headlineOf(card)}</span>
      <span className="text-xs font-normal text-ink-2">{playable ? `4지선다 ${card.total}문제 · 바로 정답 확인` : '자세히 보기'}</span>
    </Link>
  );
}
