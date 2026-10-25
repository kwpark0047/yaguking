import { loadPublicQuestion } from '@/lib/db/queries/questions';
import { getDb } from '@/lib/db/sql';
import type { StartSessionDto } from '@/types/api';
import { findPendingAtBat, toPublicAtBat } from './atBatRow';
import { findGuestSession, remainingTrials, type Owner } from './owner';
import { assertOwner, goalOf, loadSession, type PlaySessionRow } from './sessionRow';
import { startSession } from './startSession';

/**
 * 진행 중인 경기를 화면이 쓰는 DTO로 복원한다. 진행 중 타석이 없으면 null.
 */
export async function loadResumableSession(
  sessionId: string,
  owner: Owner,
): Promise<StartSessionDto | null> {
  const db = getDb();
  const session = await loadSession(db, sessionId);
  await assertOwner(db, session, owner);

  if (session.status !== 'active') return null;

  const pending = await findPendingAtBat(db, sessionId);
  if (!pending) return null;

  return buildDto(session, pending, owner);
}

/**
 * `/play`에서 새 경기를 시작할 때의 모드.
 *
 * 회원은 **공식 3이닝**이다. 체험은 공식 집계가 없어(XP·통산·랭킹 미반영) 회원이
 * 메인 페이지의 "게임 시작"을 눌렀는데 기록이 안 쌓이는 일이 실제로 있었다
 * (2026-10-26, 메인 페이지가 소개 화면이 되면서 회원도 이 경로로 들어오게 됨).
 * 모드 목록(V07)의 첫 공식 모드와 같다. 오늘의 야구는 하루 한 번 보너스가 붙는
 * 특별 모드라 기본값으로 두지 않는다.
 */
export function defaultModeFor(owner: Owner): 'official_3' | 'trial' {
  return owner.kind === 'user' ? 'official_3' : 'trial';
}

/**
 * 경기 시작 화면(`/play`, 0탭 진입)용.
 *
 * **새로고침이 체험 횟수를 깎지 않도록** 이 소유자의 진행 중 경기를 먼저 찾는다.
 * 없을 때만 새 경기를 시작한다 — 비회원은 체험, 회원은 공식(`defaultModeFor`).
 *
 * 회원은 **공식 경기만** 이어 간다. 이 경로가 회원에게 체험을 열던 시절에 만들어진
 * 미완료 체험이 남아 있으면, 그걸 이어 가는 한 "게임 시작"이 계속 체험이 된다.
 * 모드 목록에서 직접 고른 체험은 `/play/[id]`로 가므로 여기서 건너뛰어도 잃지 않는다.
 * 체험은 하루 2이닝이므로 페이지 로드마다 세션을 새로 만들면 두 번 새로고침에
 * 소진된다.
 */
export async function getOrStartGame(owner: Owner): Promise<StartSessionDto> {
  const db = getDb();

  const guest = owner.kind === 'guest' ? await findGuestSession(db, owner.tokenHash) : null;

  const rows = await db<PlaySessionRow[]>`
    select id, user_id, guest_session_id, mode, innings_target, pa_target,
           current_inning, outs, bases, runs, streak, official,
           day_key::text as day_key, status
      from public.play_sessions
     where status = 'active'
       and ${
         owner.kind === 'user'
           ? db`user_id = ${owner.userId} and official`
           : db`guest_session_id = ${guest?.id ?? null}`
       }
     order by started_at desc
     limit 1
  `;

  const active = rows[0];
  if (active) {
    const pending = await findPendingAtBat(db, active.id);
    if (pending) return buildDto(active, pending, owner, guest);
  }

  return startSession({ mode: defaultModeFor(owner) }, owner);
}

async function buildDto(
  session: PlaySessionRow,
  pending: Awaited<ReturnType<typeof findPendingAtBat>>,
  owner: Owner,
  guestRow?: Awaited<ReturnType<typeof findGuestSession>>,
): Promise<StartSessionDto> {
  const db = getDb();
  if (!pending) throw new Error('pending at-bat required');

  const question = await loadPublicQuestion(db, pending.question_id);
  const [nowRow] = await db<{ now: Date }[]>`select clock_timestamp() as now`;
  const goal = goalOf(session);

  const guest =
    guestRow ??
    (owner.kind === 'guest' ? await findGuestSession(db, owner.tokenHash) : null);

  return {
    sessionId: session.id,
    mode: session.mode,
    official: session.official,
    goal: {
      kind: goal.kind,
      target: goal.kind === 'innings' ? goal.innings : goal.pa,
    },
    scoreboard: {
      inning: session.current_inning,
      outs: session.outs,
      bases: session.bases,
      runs: session.runs,
      streak: session.streak,
    },
    atBat: toPublicAtBat(pending, question, nowRow?.now ?? new Date()),
    guestTrialRemaining: guest ? remainingTrials(guest) : null,
  };
}
