import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { countDueNotes } from '@/lib/game/persist';

/**
 * 홈의 "오늘 복습할 문제 N개"(docs/retention-plan.md C) — 경기를 한 적 있는 사람(회원·비회원)만, 집계 읽기 1.
 * Firestore를 쓰므로 홈에서 들어갈 때 불러온다(첫 화면 묶음에 SDK를 넣지 않는다). 0개거나 못 읽으면 아무것도 안 보인다.
 */
export default function ReviewDue({ uid, style }: { uid: string; style: React.CSSProperties }) {
  const [due, setDue] = useState(0);
  useEffect(() => {
    let cancelled = false;
    countDueNotes(uid)
      .then((count) => !cancelled && setDue(count))
      .catch((error) => console.warn('countDueNotes', error));
    return () => {
      cancelled = true;
    };
  }, [uid]);
  if (due === 0) return null;
  return (
    <Link to="/notes" className="flex min-h-14 items-center justify-center rounded-option border-2 font-semibold" style={style}>
      오늘 복습할 문제 {due}개 <span aria-hidden="true">→</span>
    </Link>
  );
}
