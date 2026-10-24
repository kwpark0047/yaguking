'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { TeamPicker, type TeamOption } from '@/components/theme/TeamPicker';
import { NICKNAME_MESSAGE, validateNickname } from '@/lib/game/nickname';
import { applyDocumentTeam } from '@/lib/theme/documentTeam';

/**
 * V05 온보딩 — 2단계 (06 문서 §7.4).
 *
 *   1) 닉네임: **추천값이 미리 채워져 있다.** 그대로 다음을 눌러도 된다.
 *   2) 대표 구단 1개: 팬 페넌트레이스 참가 조건이며, 변경은 다음 날부터
 *      적용된다는 점을 **고르기 전에** 알린다.
 *
 * 선수 TOP3와 레벨 테스트는 없다. 끝나면 원래 보던 화면으로 돌아간다.
 */
export function OnboardingClient({
  returnTo,
  teamThemes,
}: {
  returnTo: string;
  /** 서버의 TEAM_THEMES 스위치. false면 구단 색 미리보기를 하지 않는다. */
  teamThemes: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [nickname, setNickname] = useState('');
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [meResponse, teamsResponse] = await Promise.all([
        fetch('/api/v1/me', { cache: 'no-store' }),
        fetch('/api/v1/teams', { cache: 'no-store' }),
      ]);

      const me = await meResponse.json();
      const teamList = await teamsResponse.json();
      if (cancelled) return;

      if (!me.success) {
        setError('로그인이 필요합니다.');
        setLoaded(true);
        return;
      }

      setNickname(me.data.profile?.nickname ?? me.data.suggestedNickname);
      setTeamId(me.data.profile?.primaryTeamId ?? null);
      if (teamList.success) setTeams(teamList.data);
      setLoaded(true);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(team: TeamOption) {
    const previous = teams.find((t) => t.id === teamId)?.slug ?? null;

    // 고르는 순간 화면 전체를 그 구단 테마로 바꿔 보여 준다.
    if (teamThemes) applyDocumentTeam(team.slug);
    setTeamId(team.id);
    setPending(true);
    setError(null);

    const response = await fetch('/api/v1/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname: nickname.trim(), primaryTeamId: team.id }),
    });
    const body = await response.json();
    setPending(false);

    if (!body.success) {
      // 저장이 안 됐으면 미리보기도 되돌린다. 화면 색이 실제 설정과 어긋나면 안 된다.
      if (teamThemes) applyDocumentTeam(previous);
      setTeamId(teams.find((t) => t.slug === previous)?.id ?? null);
      setError(body.error.message);
      setStep(1);
      return;
    }

    router.replace(returnTo);
  }

  if (!loaded) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4">
        <p className="text-sm text-ink-2">불러오는 중…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 px-4 py-8">
      <p className="text-xs text-ink-2">{step} / 2</p>

      {error && (
        <p className="text-sm" style={{ color: 'var(--out)' }} role="alert">
          {error}
        </p>
      )}

      {step === 1 && (
        <>
          <h1 className="text-2xl font-bold">닉네임을 정해 주세요</h1>
          <p className="text-sm text-ink-2">추천 닉네임을 그대로 써도 됩니다.</p>
          <label htmlFor="nickname" className="sr-only">
            닉네임
          </label>
          <input
            id="nickname"
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            maxLength={16}
            className="min-h-14 rounded-option border px-3 text-lg"
            style={{ borderColor: 'var(--line)', backgroundColor: 'var(--bg-card)' }}
          />
          <button
            type="button"
            onClick={() => {
              const problem = validateNickname(nickname);
              if (problem) {
                setError(NICKNAME_MESSAGE[problem]);
                return;
              }
              setError(null);
              setStep(2);
            }}
            className="min-h-14 rounded-option font-semibold"
            style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
          >
            다음
          </button>
        </>
      )}

      {step === 2 && (
        <>
          <h1 className="text-2xl font-bold">대표 구단을 골라 주세요</h1>
          <p className="text-sm text-ink-2 break-keep">
            팬 페넌트레이스에 이 구단으로 참가합니다. 변경은 다음 날부터
            적용되며, 진행 중인 집계에 소급되지 않습니다.
          </p>

          {teamThemes && (
            <p className="text-xs text-ink-2 break-keep">
              고르면 화면 색이 그 구단 테마로 바로 바뀝니다.
            </p>
          )}

          <TeamPicker
            teams={teams}
            selectedId={teamId}
            disabled={pending}
            teamThemes={teamThemes}
            onSelect={(team) => void save(team)}
          />

          <button
            type="button"
            onClick={() => setStep(1)}
            className="min-h-11 text-sm text-ink-2 underline"
          >
            이전
          </button>
        </>
      )}
    </main>
  );
}
