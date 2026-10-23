import { getDb } from '@/lib/db/sql';
import { buildBoxScore, formatRate } from '@/lib/engine';
import type { AtBatResult } from '@/lib/engine';
import { levelName } from '@/lib/game/labels';
import type { ShareCardDto } from '@/types/api';

/**
 * 공유 카드 데이터 (08 문서 §5.5).
 *
 * **공개 조회다.** 공유 링크를 받은 사람이 로그인 없이 볼 수 있어야 하므로
 * 소유권을 확인하지 않는다. 대신 담는 정보를 좁힌다:
 *
 *   담는 것 — 닉네임, 등급, 득점, 타석, 타율, OPS
 *   담지 않는 것 — 이메일·실명, 정확한 플레이 시각, **문항 본문과 정답**
 *
 * 세션 UUID가 사실상 접근 토큰 역할을 한다. 추측할 수 없는 값이지만,
 * 링크를 받은 사람은 누구나 이 요약을 볼 수 있다는 전제로 설계한다.
 */
export async function getShareCard(sessionId: string): Promise<ShareCardDto | null> {
  const db = getDb();

  const [session] = await db<
    { id: string; runs: number; user_id: string | null; status: string }[]
  >`
    select id, runs, user_id, status
      from public.play_sessions
     where id = ${sessionId}
  `;

  if (!session || session.status === 'active') return null;

  const rows = await db<{ result: AtBatResult; rbi: number }[]>`
    select result, rbi
      from public.at_bats
     where session_id = ${sessionId}
       and result is not null
     order by sequence
  `;

  const box = buildBoxScore(rows.map((row) => ({ result: row.result, rbi: row.rbi })));

  let nickname = '비회원';
  let level = 1;

  if (session.user_id) {
    const [profile] = await db<{ nickname: string }[]>`
      select nickname from public.profiles where id = ${session.user_id}
    `;
    const [stats] = await db<{ level: number }[]>`
      select level from public.user_private_stats where user_id = ${session.user_id}
    `;
    nickname = profile?.nickname ?? '비회원';
    level = stats?.level ?? 1;
  }

  return {
    nickname,
    levelName: levelName(level),
    runs: session.runs,
    pa: box.pa,
    avg: formatRate(box.avg),
    ops: formatRate(box.ops),
  };
}
