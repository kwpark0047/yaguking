'use client';

import { useEffect, useState } from 'react';
import { NICKNAME_MESSAGE, validateNickname } from '@/lib/game/nickname';

interface TeamOption {
  id: string;
  name: string;
  shortName: string;
}

const CLASSIC_MODE_KEY = 'yk.classicMode';

/**
 * V17 설정.
 *
 * 대표 구단 변경은 **다음 날부터 적용**되고 진행 중 집계에 소급되지 않는다는
 * 점을 바꾸기 전에 알린다 (01 문서 §3, 06 문서 D2).
 *
 * 클래식 모드는 야구 비유 대신 점수제 표기를 쓰는 토글이다. 내부 판정은
 * 동일하며 전환율·완주율 A/B 측정 대상이다 (06 문서 §4.4).
 * 브라우저 저장소는 기기별 편의 설정에만 쓰고, 서버 기록과 섞지 않는다.
 */
export function SettingsClient() {
  const [nickname, setNickname] = useState('');
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [classicMode, setClassicMode] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      setClassicMode(window.localStorage.getItem(CLASSIC_MODE_KEY) === '1');
    } catch {
      // 사생활 보호 모드 등에서 접근이 막힐 수 있다. 기본값으로 둔다.
    }

    let cancelled = false;
    async function load() {
      const [meResponse, teamsResponse] = await Promise.all([
        fetch('/api/v1/me', { cache: 'no-store' }),
        fetch('/api/v1/teams', { cache: 'no-store' }),
      ]);
      const me = await meResponse.json();
      const teamList = await teamsResponse.json();
      if (cancelled) return;

      if (me.success) {
        setNickname(me.data.profile?.nickname ?? me.data.suggestedNickname);
        setTeamId(me.data.profile?.primaryTeamId ?? null);
      } else {
        setError('프로필을 불러오지 못했습니다.');
      }
      if (teamList.success) setTeams(teamList.data);
      setLoaded(true);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(next: { nickname?: string; primaryTeamId?: string | null }) {
    setPending(true);
    setError(null);
    setMessage(null);

    const response = await fetch('/api/v1/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    });
    const body = await response.json();
    setPending(false);

    if (!body.success) {
      setError(body.error.message);
      return;
    }
    setMessage('저장했습니다.');
  }

  function toggleClassic(value: boolean) {
    setClassicMode(value);
    try {
      window.localStorage.setItem(CLASSIC_MODE_KEY, value ? '1' : '0');
    } catch {
      setError('이 브라우저에서는 설정을 저장할 수 없습니다.');
    }
  }

  if (!loaded) return <p className="text-sm text-ink-2">불러오는 중…</p>;

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <p className="text-sm" style={{ color: 'var(--out)' }} role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="text-sm" style={{ color: 'var(--on-base)' }} role="status">
          {message}
        </p>
      )}

      <section className="flex flex-col gap-2">
        <label htmlFor="nickname" className="text-sm font-semibold">
          닉네임
        </label>
        <input
          id="nickname"
          value={nickname}
          maxLength={16}
          onChange={(event) => setNickname(event.target.value)}
          className="min-h-14 rounded-option border px-3"
          style={{ borderColor: 'var(--line)', backgroundColor: 'var(--bg-card)' }}
        />
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            const problem = validateNickname(nickname);
            if (problem) {
              setError(NICKNAME_MESSAGE[problem]);
              return;
            }
            void save({ nickname: nickname.trim() });
          }}
          className="min-h-14 rounded-option font-semibold disabled:opacity-60"
          style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
        >
          닉네임 저장
        </button>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">대표 구단</h2>
        <p className="text-xs text-ink-2 break-keep">
          변경은 다음 날부터 적용됩니다. 진행 중인 집계에는 소급되지 않습니다.
        </p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-5">
          {teams.map((team) => (
            <button
              key={team.id}
              type="button"
              disabled={pending}
              aria-pressed={teamId === team.id}
              onClick={() => {
                setTeamId(team.id);
                void save({ primaryTeamId: team.id });
              }}
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
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">클래식 모드</h2>
        <label className="flex min-h-14 items-center justify-between gap-3 rounded-option border px-3" style={{ borderColor: 'var(--line)' }}>
          <span className="text-sm break-keep">
            야구 비유 대신 점수제로 표기합니다. 판정 규칙은 동일합니다.
          </span>
          <input
            type="checkbox"
            checked={classicMode}
            onChange={(event) => toggleClassic(event.target.checked)}
            className="size-6 shrink-0"
          />
        </label>
        <p className="text-xs text-ink-2">
          이 설정은 이 브라우저에만 저장됩니다. 표기 전환은 단계 9에서 화면에
          연결합니다.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">내 데이터</h2>
        <p className="text-xs text-ink-2 break-keep">
          데이터 내보내기와 계정 삭제는 개인정보 처리방침 확정과 함께 제공합니다.
          미성년자 처리 정책을 포함해 법적 검토가 끝나지 않은 보류 항목입니다.
        </p>
      </section>
    </div>
  );
}
