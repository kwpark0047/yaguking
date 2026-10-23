import { ApiError } from '@/lib/api/errors';
import { getDb } from '@/lib/db/sql';
import type { Queryable } from '@/lib/db/types';
import { suggestNickname, validateNickname, NICKNAME_MESSAGE } from '@/lib/game/nickname';
import { getCareerBatting, type CareerBatting } from '@/server/stats/batting';

export interface ProfileRow {
  id: string;
  nickname: string;
  primary_team_id: string | null;
  onboarding_status: 'pending' | 'completed';
}

export interface MeDto {
  userId: string;
  profile: {
    nickname: string;
    primaryTeamId: string | null;
    primaryTeamName: string | null;
    onboardingStatus: 'pending' | 'completed';
  } | null;
  /** 프로필이 없을 때 입력란에 미리 채울 값 */
  suggestedNickname: string;
  career: CareerBatting | null;
  level: number;
  totalXp: number;
}

/**
 * 프로필이 없으면 만든다.
 *
 * 가입 직후(콜백)에 호출한다. 닉네임은 추천값으로 채워 두고 온보딩에서
 * 고치게 한다 — 입력란이 비어 있으면 그만큼 이탈한다 (06 문서 §7.4).
 *
 * 닉네임은 unique이므로 충돌 시 몇 번 다시 뽑는다.
 */
export async function ensureProfile(
  tx: Queryable,
  userId: string,
): Promise<ProfileRow> {
  const [existing] = await tx<ProfileRow[]>`
    select id, nickname, primary_team_id, onboarding_status
      from public.profiles
     where id = ${userId}
  `;
  if (existing) return existing;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const nickname =
      attempt < 6
        ? suggestNickname()
        : `${suggestNickname()}${Math.floor(Math.random() * 900) + 100}`.slice(0, 16);

    // 대상을 지정하지 않은 `on conflict do nothing`이어야 한다.
    // `on conflict (nickname)`으로 좁히면 **기본키(id) 충돌은 잡지 못하고 예외가 난다** —
    // 동시 승계(콜백 + 재시도)에서 한쪽이 500으로 떨어진다.
    const rows = await tx<ProfileRow[]>`
      insert into public.profiles (id, nickname, onboarding_status)
      values (${userId}, ${nickname}, 'pending')
      on conflict do nothing
      returning id, nickname, primary_team_id, onboarding_status
    `;
    if (rows[0]) return rows[0];

    // 여기까지 왔다면 id 충돌(동시 호출)이거나 닉네임 충돌이다.
    // id 충돌이면 기존 행이 있다. 없으면 닉네임을 다시 뽑아 재시도한다.
    const [raced] = await tx<ProfileRow[]>`
      select id, nickname, primary_team_id, onboarding_status
        from public.profiles
       where id = ${userId}
    `;
    if (raced) return raced;
  }

  throw new ApiError('INTERNAL_ERROR', '닉네임을 만들지 못했습니다. 다시 시도해 주세요.');
}

export async function getMe(userId: string): Promise<MeDto> {
  const db = getDb();

  const [profile] = await db<(ProfileRow & { team_name: string | null })[]>`
    select p.id, p.nickname, p.primary_team_id, p.onboarding_status,
           t.canonical_name as team_name
      from public.profiles p
      left join public.teams t on t.id = p.primary_team_id
     where p.id = ${userId}
  `;

  const [stats] = await db<{ total_xp: string; level: number }[]>`
    select total_xp::text as total_xp, level
      from public.user_private_stats
     where user_id = ${userId}
  `;

  const career = await getCareerBatting(db, userId);

  return {
    userId,
    profile: profile
      ? {
          nickname: profile.nickname,
          primaryTeamId: profile.primary_team_id,
          primaryTeamName: profile.team_name,
          onboardingStatus: profile.onboarding_status,
        }
      : null,
    suggestedNickname: profile?.nickname ?? suggestNickname(),
    career,
    level: stats?.level ?? 1,
    totalXp: Number(stats?.total_xp ?? '0'),
  };
}

/**
 * 온보딩 2단계 저장: 닉네임 + 대표 구단.
 * 대표 구단이 정해지면 온보딩 완료로 본다.
 */
export async function updateProfile(
  userId: string,
  input: { nickname?: string; primaryTeamId?: string | null },
): Promise<MeDto> {
  const db = getDb();

  if (input.nickname !== undefined) {
    const problem = validateNickname(input.nickname);
    if (problem) throw new ApiError('VALIDATION_ERROR', NICKNAME_MESSAGE[problem]);
  }

  await db.begin(async (tx) => {
    const profile = await ensureProfile(tx, userId);
    const nickname = input.nickname?.trim() ?? profile.nickname;
    const teamId =
      input.primaryTeamId === undefined ? profile.primary_team_id : input.primaryTeamId;

    if (teamId !== null) {
      const [team] = await tx<{ id: string }[]>`
        select id from public.teams where id = ${teamId}
      `;
      if (!team) throw new ApiError('VALIDATION_ERROR', '구단을 찾을 수 없습니다.');
    }

    const status = teamId === null ? 'pending' : 'completed';

    try {
      await tx`
        update public.profiles
           set nickname = ${nickname},
               primary_team_id = ${teamId},
               onboarding_status = ${status},
               updated_at = now()
         where id = ${userId}
      `;
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        (error as { code?: string }).code === '23505'
      ) {
        throw new ApiError('VALIDATION_ERROR', '이미 쓰이고 있는 닉네임입니다.');
      }
      throw error;
    }
  });

  return getMe(userId);
}
