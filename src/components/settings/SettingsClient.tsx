'use client';

import { useEffect, useState } from 'react';
import { StylePicker } from '@/components/theme/StylePicker';
import { TeamPicker, type TeamOption } from '@/components/theme/TeamPicker';
import { NICKNAME_MESSAGE, validateNickname } from '@/lib/game/nickname';
import { applyDocumentTeam } from '@/lib/theme/documentTeam';
import type { StylePreference } from '@/lib/theme/style';

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
export function SettingsClient({
  teamThemes,
  stylePreference,
}: {
  teamThemes: boolean;
  /** 이 기기에 저장된 화면 스타일(쿠키) */
  stylePreference: StylePreference;
}) {
  const [nickname, setNickname] = useState('');
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [classicMode, setClassicMode] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmNickname, setConfirmNickname] = useState('');

  /**
   * 계정 삭제. 되돌릴 수 없으므로 닉네임을 정확히 입력해야 버튼이 열린다.
   * 서버도 같은 값을 다시 확인한다 — 화면 검증만 믿지 않는다.
   */
  async function removeAccount() {
    setPending(true);
    setError(null);

    const response = await fetch('/api/v1/me', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmNickname: confirmNickname.trim() }),
    });
    const body = await response.json();
    setPending(false);

    if (!body.success) {
      setError(body.error.message);
      return;
    }

    // 세션이 서버에서 무효화됐다. 랜딩으로 완전히 새로 들어간다.
    window.location.href = '/';
  }

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
      return false;
    }
    setMessage('저장했습니다.');
    return true;
  }

  async function chooseTeam(team: TeamOption) {
    const previousId = teamId;
    const previousSlug = teams.find((t) => t.id === previousId)?.slug ?? null;

    // 고르는 순간 화면 색을 바꾼다. 저장이 실패하면 되돌린다.
    if (teamThemes) applyDocumentTeam(team.slug);
    setTeamId(team.id);

    const saved = await save({ primaryTeamId: team.id });
    if (!saved) {
      if (teamThemes) applyDocumentTeam(previousSlug);
      setTeamId(previousId);
    }
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
          {teamThemes && ' 화면 색은 바로 바뀝니다.'}
        </p>
        <TeamPicker
          teams={teams}
          selectedId={teamId}
          disabled={pending}
          teamThemes={teamThemes}
          onSelect={(team) => void chooseTeam(team)}
        />
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
        <StylePicker initial={stylePreference} />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">내 데이터</h2>
        <p className="text-xs text-ink-2 break-keep">
          닉네임, 통산 성적, XP 내역, 경기와 타석 기록을 JSON 파일로 내려받습니다.
        </p>
        <a
          href="/api/v1/me/export"
          download
          className="flex min-h-14 items-center justify-center rounded-option border px-4 text-sm font-semibold"
          style={{ borderColor: 'var(--line)' }}
        >
          내 데이터 내보내기
        </a>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--out)' }}>
          계정 삭제
        </h2>
        <p className="text-xs text-ink-2 break-keep">
          계정과 함께 통산 성적, XP, 경기 기록이 모두 사라집니다.
          <strong> 되돌릴 수 없습니다.</strong> 기록을 보관하려면 먼저 내보내기를
          받아 두세요.
        </p>

        {!deleteOpen ? (
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            className="min-h-14 rounded-option border px-4 text-sm"
            style={{ borderColor: 'var(--out)', color: 'var(--out)' }}
          >
            계정 삭제
          </button>
        ) : (
          <div
            className="flex flex-col gap-2 rounded-option border p-3"
            style={{ borderColor: 'var(--out)' }}
          >
            <label htmlFor="confirm-nickname" className="text-sm break-keep">
              삭제하려면 닉네임 <strong>{nickname}</strong> 을(를) 그대로 입력하세요.
            </label>
            <input
              id="confirm-nickname"
              value={confirmNickname}
              onChange={(event) => setConfirmNickname(event.target.value)}
              className="min-h-14 rounded-option border px-3"
              style={{ borderColor: 'var(--line)', backgroundColor: 'var(--bg-card)' }}
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pending || confirmNickname.trim() !== nickname.trim()}
                onClick={() => void removeAccount()}
                className="min-h-14 flex-1 rounded-option px-4 text-sm font-semibold disabled:opacity-50"
                style={{ backgroundColor: 'var(--out)', color: '#fff' }}
              >
                영구 삭제
              </button>
              <button
                type="button"
                onClick={() => {
                  setDeleteOpen(false);
                  setConfirmNickname('');
                }}
                className="min-h-14 flex-1 rounded-option border px-4 text-sm"
                style={{ borderColor: 'var(--line)' }}
              >
                취소
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
