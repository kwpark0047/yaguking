'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { NICKNAME_MESSAGE, validateNickname } from '@/lib/game/nickname';

interface TeamOption {
  id: string;
  name: string;
  shortName: string;
}

/**
 * V05 온보딩 — 2단계 (06 문서 §7.4).
 *
 *   1) 닉네임: **추천값이 미리 채워져 있다.** 그대로 다음을 눌러도 된다.
 *   2) 대표 구단 1개: 팬 페넌트레이스 참가 조건이며, 변경은 다음 날부터
 *      적용된다는 점을 **고르기 전에** 알린다.
 *
 * 선수 TOP3와 레벨 테스트는 없다. 끝나면 원래 보던 화면으로 돌아간다.
 */
export function OnboardingClient({ returnTo }: { returnTo: string }) {
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

  async function save(primaryTeamId: string) {
    setPending(true);
    setError(null);

    const response = await fetch('/api/v1/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname: nickname.trim(), primaryTeamId }),
    });
    const body = await response.json();
    setPending(false);

    if (!body.success) {
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

          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-5">
            {teams.map((team) => (
              <button
                key={team.id}
                type="button"
                disabled={pending}
                onClick={() => {
                  setTeamId(team.id);
                  void save(team.id);
                }}
                aria-pressed={teamId === team.id}
                className="min-h-14 rounded-option border px-2 text-sm disabled:opacity-60"
                style={{
                  borderColor: teamId === team.id ? 'var(--accent)' : 'var(--line)',
                  backgroundColor: 'var(--bg-card)',
                }}
              >
                {team.shortName}
              </button>
            ))}
          </div>

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
