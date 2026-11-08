import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { kstDate, kstMonthKey } from '@/lib/game/attendance';
import { loadLeaderboard } from '@/lib/game/engagement';
import { WELCOME_BONUS_POINTS, welcomeBonusOpen } from '@/lib/game/welcome';

/**
 * 회원 전용 미리보기(docs/signup-boost.md S3) — 비회원·로그인 전 홈에서 가입하면 열리는 4가지를 보여 준다.
 * 비회원(익명 로그인)이면 이번 달 1위 포인트를 하나 붙인다(등수 문서 1번 읽기, 10분 기억 — 등수 화면과 같은 읽기).
 * 로그인 전에는 읽지 않는다(등수는 로그인한 사람만 읽는다).
 */
export function MemberPerks({ signedIn }: { signedIn: boolean }) {
  const [topPoints, setTopPoints] = useState<number | null>(null);

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    loadLeaderboard(kstMonthKey())
      .then((board) => {
        if (!cancelled && board?.top[0]) setTopPoints(board.top[0].points);
      })
      .catch(() => undefined); // 숫자 하나 안 보일 뿐이다
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  const bonus = welcomeBonusOpen(kstDate());
  const perks = [
    ['🗓️', '매일 출석 도장', '하루 10P, 7일 연속이면 +30P'],
    ['🏆', '월간 등수', topPoints !== null ? `이번 달 1위는 지금 ${topPoints}P` : '출석과 공식전 점수로 매달 겨뤄요'],
    ['⚾', '오늘의 공식전', '하루 5문제, 모두 같은 문제로 공정하게'],
    ['💡', '문제 풀이 힌트', bonus ? `가입 축하 ${WELCOME_BONUS_POINTS}P로 바로 써요` : '반반·초성·시간 +5초'],
  ] as const;

  return (
    <section aria-label="회원이 되면" className="sticker flex flex-col gap-3 p-4">
      <h2 className="font-cute text-xl">회원이 되면 열려요</h2>
      <ul className="grid gap-2 sm:grid-cols-2">
        {perks.map(([icon, title, detail]) => (
          <li key={title} className="flex items-start gap-2 text-sm break-keep">
            <span aria-hidden="true" className="text-xl">
              {icon}
            </span>
            <span>
              <span className="block font-semibold">{title}</span>
              <span className="text-ink-2">{detail}</span>
            </span>
          </li>
        ))}
      </ul>
      <Link
        to="/auth?mode=signup"
        className="flex min-h-12 items-center justify-center rounded-option font-semibold"
        style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
      >
        지금 가입 — 기록은 그대로 이어져요
      </Link>
    </section>
  );
}
