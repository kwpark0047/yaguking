import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { useAuth } from '@/auth/AuthProvider';
import { PlayerInputs } from '@/components/profile/PlayerInputs';
import { TeamRankPicker } from '@/components/profile/TeamRankPicker';
import { signOutUser } from '@/lib/auth/actions';
import {
  NicknameTakenError,
  RecentLoginRequiredError,
  deleteAccountAndData,
  saveProfile,
} from '@/lib/profile/save';
import { nicknameProblem, normalizePlayers, playersProblem } from '@/lib/profile/validate';
import { applyDocumentTeam } from '@/lib/theme/documentTeam';
import { teamThemesEnabled } from '@/lib/theme/themeSwitch';

const inputStyle = { borderColor: 'var(--line)', backgroundColor: 'var(--bg-card)' };

/**
 * 설정 — 닉네임·최애 구단·최애 선수 바꾸기, 로그아웃, 계정 삭제.
 * 계정 삭제는 닉네임을 정확히 입력해야 열린다(되돌릴 수 없다).
 */
export function SettingsPage() {
  const navigate = useNavigate();
  const { user, profile, refreshProfile } = useAuth();
  const [nickname, setNickname] = useState('');
  const [teams, setTeams] = useState<string[]>([]);
  const [players, setPlayers] = useState<string[]>([]);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [confirmName, setConfirmName] = useState('');

  useEffect(() => {
    if (profile.status !== 'ready') return;
    setNickname(profile.data.nickname ?? '');
    setTeams(profile.data.favoriteTeams);
    setPlayers(profile.data.favoritePlayers);
  }, [profile]);

  if (user === undefined || profile.status === 'loading') return null;
  if (!user || user.isAnonymous) return <Navigate to="/auth?mode=login&returnTo=%2Fsettings" replace />;
  if (profile.status === 'error') {
    // 빈 양식을 보여 주면 저장 버튼으로 프로필을 덮어쓸 수 있다. 다시 읽게 한다.
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4 py-8">
        <h1 className="font-cute text-3xl">설정</h1>
        <p role="alert" className="text-sm" style={{ color: 'var(--out)' }}>
          프로필을 불러오지 못했어요. 연결을 확인해 주세요.
        </p>
        <button
          type="button"
          onClick={() => void refreshProfile()}
          className="squishy font-cute min-h-14 text-xl"
          style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
        >
          다시 불러오기
        </button>
      </main>
    );
  }
  const current = profile.status === 'ready' ? profile.data : null;

  async function save() {
    const problem = nicknameProblem(nickname) ?? playersProblem(players);
    if (problem || teams.length === 0) {
      setMessage({ kind: 'error', text: problem ?? '최애 구단 1위는 꼭 골라 주세요.' });
      return;
    }
    setPending(true);
    setMessage(null);
    try {
      await saveProfile(
        user!.uid,
        { nickname, favoriteTeams: teams, favoritePlayers: normalizePlayers(players) },
        current?.nickname ?? null,
      );
      await refreshProfile();
      setMessage({ kind: 'ok', text: '저장했어요.' });
    } catch (caught) {
      setMessage({
        kind: 'error',
        text: caught instanceof NicknameTakenError ? caught.message : '저장하지 못했어요. 다시 시도해 주세요.',
      });
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    setPending(true);
    setMessage(null);
    try {
      await deleteAccountAndData(user!, current?.nickname ?? null);
      applyDocumentTeam(null);
      navigate('/', { replace: true });
    } catch (caught) {
      setMessage({
        kind: 'error',
        text:
          caught instanceof RecentLoginRequiredError
            ? caught.message
            : '지우지 못했어요. 다시 시도해 주세요.',
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 py-8">
      <Link to="/" className="flex min-h-11 items-center self-start text-sm text-ink-2 underline">
        ← 야구왕
      </Link>
      <h1 className="font-cute text-3xl">설정</h1>

      {message && (
        <p
          role={message.kind === 'error' ? 'alert' : 'status'}
          className="text-sm"
          style={{ color: message.kind === 'error' ? 'var(--out)' : 'var(--on-base)' }}
        >
          {message.text}
        </p>
      )}

      <section aria-labelledby="profile-title" className="flex flex-col gap-3">
        <h2 id="profile-title" className="font-cute text-xl">
          프로필
        </h2>
        <label className="flex flex-col gap-1 text-sm">
          닉네임 (2~16자)
          <input
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            maxLength={20}
            className="min-h-12 rounded-option border px-3 text-base"
            style={inputStyle}
          />
        </label>
        <p className="text-sm">최애 구단 (누른 순서가 순위)</p>
        <TeamRankPicker
          ranked={teams}
          disabled={pending}
          onChange={(next) => {
            setTeams(next);
            if (teamThemesEnabled()) applyDocumentTeam(next[0] ?? null);
          }}
        />
        <p className="text-sm">최애 선수 (선택)</p>
        <PlayerInputs values={players} onChange={setPlayers} disabled={pending} />
        <button
          type="button"
          disabled={pending}
          onClick={() => void save()}
          className="squishy font-cute min-h-14 text-xl disabled:opacity-60"
          style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
        >
          저장하기
        </button>
      </section>

      <section aria-labelledby="account-title" className="flex flex-col gap-3">
        <h2 id="account-title" className="font-cute text-xl">
          계정
        </h2>
        <p className="text-sm text-ink-2">{user.email ?? '이메일 없음'}</p>
        <button
          type="button"
          onClick={() => void signOutUser().then(() => navigate('/', { replace: true }))}
          className="min-h-12 rounded-option border-2 font-semibold"
          style={{ borderColor: 'var(--line)' }}
        >
          로그아웃
        </button>
      </section>

      <section aria-labelledby="delete-title" className="sticker flex flex-col gap-3 p-4">
        <h2 id="delete-title" className="font-semibold">
          계정 삭제
        </h2>
        <p className="text-sm text-ink-2 break-keep">
          계정과 경기 기록·오답노트·누적 기록이 모두 지워지고 되돌릴 수 없어요. 확인하려면
          닉네임을 그대로 입력해 주세요.
        </p>
        <label className="flex flex-col gap-1 text-sm">
          닉네임 확인
          <input
            value={confirmName}
            onChange={(event) => setConfirmName(event.target.value)}
            className="min-h-12 rounded-option border px-3 text-base"
            style={inputStyle}
          />
        </label>
        <button
          type="button"
          disabled={pending || !current?.nickname || confirmName.trim() !== current.nickname}
          onClick={() => void remove()}
          className="min-h-12 rounded-option border-2 font-semibold disabled:opacity-50"
          style={{ borderColor: 'var(--out)', color: 'var(--out)' }}
        >
          계정과 기록 모두 지우기
        </button>
      </section>
    </main>
  );
}
