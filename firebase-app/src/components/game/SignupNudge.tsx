import { useState } from 'react';
import { Link } from 'react-router';
import { kstDate } from '@/lib/game/attendance';
import { WELCOME_BONUS_POINTS, welcomeBonusOpen } from '@/lib/game/welcome';

/**
 * 잘한 순간의 가입 권유(docs/signup-boost.md S1) — 비회원이 2안타 이상·홈런을 친 경기 결과에서만 보인다.
 * "나중에"를 누르면 이 화면에서만 닫는다(기기에 기억하지 않는다 — 새 저장 키를 만들지 않음).
 */
export function SignupNudge({ summary }: { summary: string }) {
  const [closed, setClosed] = useState(false);
  if (closed) return null;
  const bonus = welcomeBonusOpen(kstDate());
  return (
    <section aria-label="가입 권유" className="sticker flex flex-col gap-2 p-4 break-keep">
      <p className="font-cute text-xl">이 기록, 내 이름으로 남길까요?</p>
      <p className="text-sm">
        {summary}! 가입하면 지금까지의 기록이 그대로 이어져요.
      </p>
      <ul className="list-disc pl-5 text-sm text-ink-2">
        <li>매일 출석 도장과 월간 등수</li>
        <li>하루 5문제 오늘의 공식전</li>
        <li>{bonus ? `힌트 포인트 ${WELCOME_BONUS_POINTS}P를 가입 축하로 바로` : '출석 포인트로 쓰는 힌트(반반·초성·시간 +5초)'}</li>
      </ul>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Link
          to="/auth?mode=signup"
          className="flex min-h-12 flex-1 items-center justify-center rounded-option font-semibold"
          style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
        >
          가입하고 기록 남기기
        </Link>
        <button type="button" onClick={() => setClosed(true)} className="min-h-12 flex-1 rounded-option border-2 font-semibold" style={{ borderColor: 'var(--line)' }}>
          나중에
        </button>
      </div>
    </section>
  );
}
