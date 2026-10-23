import { ApiError } from '@/lib/api/errors';
import { getDb } from '@/lib/db/sql';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import type { AccountExportDto } from '@/types/api';

/**
 * 내 데이터 내보내기 / 계정 삭제 (08 문서 V17).
 *
 * 외부에 서비스를 노출하려면 이 두 경로가 먼저 있어야 한다. 설정 화면에
 * "준비 중"만 띄운 채로는 개인정보 처리방침을 지킬 수 없다.
 */

/** 회원 본인이 가진 데이터를 한 덩어리로 내보낸다. */
export async function exportAccountData(userId: string): Promise<AccountExportDto> {
  const db = getDb();

  const [profile] = await db<
    {
      nickname: string;
      onboarding_status: string;
      created_at: Date;
      team_name: string | null;
    }[]
  >`
    select p.nickname, p.onboarding_status, p.created_at,
           t.canonical_name as team_name
      from public.profiles p
      left join public.teams t on t.id = p.primary_team_id
     where p.id = ${userId}
  `;

  if (!profile) throw new ApiError('NOT_FOUND', '프로필이 없습니다.');

  const stats = await db<
    { season_id: string | null; pa: number; ab: number; h: number; hr: number; bb: number; so: number; r: number }[]
  >`
    select season_id, pa, ab, h, hr, bb, so, r
      from public.user_batting_stats
     where user_id = ${userId}
  `;

  const xp = await db<{ amount: number; reason: string; created_at: Date }[]>`
    select amount, reason, created_at
      from public.xp_transactions
     where user_id = ${userId}
     order by created_at
  `;

  const sessions = await db<
    { id: string; mode: string; runs: number; official: boolean; status: string; started_at: Date; ended_at: Date | null }[]
  >`
    select id, mode, runs, official, status, started_at, ended_at
      from public.play_sessions
     where user_id = ${userId}
     order by started_at
  `;

  const atBats = await db<
    { session_id: string; sequence: number; result: string | null; elapsed_ms: number | null; is_correct: boolean | null; submitted_at: Date | null }[]
  >`
    select ab.session_id, ab.sequence, ab.result, ab.elapsed_ms, ab.is_correct, ab.submitted_at
      from public.at_bats ab
      join public.play_sessions s on s.id = ab.session_id
     where s.user_id = ${userId}
     order by ab.session_id, ab.sequence
  `;

  const zone = await db<
    { era_band: number; difficulty_band: number; attempts: number; correct: number }[]
  >`
    select era_band, difficulty_band, attempts, correct
      from public.user_zone_cells
     where user_id = ${userId}
  `;

  return {
    exportedAt: new Date().toISOString(),
    profile: {
      nickname: profile.nickname,
      primaryTeamName: profile.team_name,
      onboardingStatus: profile.onboarding_status,
      joinedAt: profile.created_at.toISOString(),
    },
    battingStats: stats.map((row) => ({
      scope: row.season_id === null ? 'career' : 'season',
      pa: row.pa,
      ab: row.ab,
      h: row.h,
      hr: row.hr,
      bb: row.bb,
      so: row.so,
      r: row.r,
    })),
    xpLedger: xp.map((row) => ({
      amount: row.amount,
      reason: row.reason,
      at: row.created_at.toISOString(),
    })),
    sessions: sessions.map((row) => ({
      id: row.id,
      mode: row.mode,
      runs: row.runs,
      official: row.official,
      status: row.status,
      startedAt: row.started_at.toISOString(),
      endedAt: row.ended_at ? row.ended_at.toISOString() : null,
    })),
    atBats: atBats.map((row) => ({
      sessionId: row.session_id,
      sequence: row.sequence,
      result: row.result,
      elapsedMs: row.elapsed_ms,
      isCorrect: row.is_correct,
      submittedAt: row.submitted_at ? row.submitted_at.toISOString() : null,
    })),
    zoneCells: zone,
  };
}

export interface DeleteAccountResult {
  deleted: true;
  /** 삭제 전 마지막으로 확인한 닉네임 */
  nickname: string;
}

/**
 * 계정과 그에 딸린 개인 데이터를 지운다. **되돌릴 수 없다.**
 *
 * `auth.users` 를 지우면 `profiles` 로 CASCADE 되고, 거기서 성적·XP·존 집계·
 * 경기·타석·선호 설정까지 함께 사라진다.
 * `growth_events` 와 `guest_sessions.claimed_by` 는 SET NULL 로 익명화된다.
 *
 * DB 행을 직접 지우지 않고 Auth 관리 API 를 쓰는 이유는 **세션과 리프레시
 * 토큰까지 함께 정리**되어야 하기 때문이다. 행만 지우면 발급된 토큰이
 * 남는다.
 */
export async function deleteAccount(userId: string): Promise<DeleteAccountResult> {
  const db = getDb();

  const [profile] = await db<{ nickname: string }[]>`
    select nickname from public.profiles where id = ${userId}
  `;

  const admin = createSupabaseAdminClient();
  const { error } = await admin.auth.admin.deleteUser(userId);

  if (error) {
    console.error(`[account/delete] 실패: ${error.message}`);
    throw new ApiError('INTERNAL_ERROR', '계정을 삭제하지 못했습니다.');
  }

  return { deleted: true, nickname: profile?.nickname ?? '' };
}
