import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { useAuth } from '@/auth/AuthProvider';
import { PlayerInputs } from '@/components/profile/PlayerInputs';
import { TeamRankPicker } from '@/components/profile/TeamRankPicker';
import { needsAgeCheck } from '@/lib/auth/gate';
import { sanitizeReturnTo } from '@/lib/auth/returnTo';
import { suggestNickname } from '@/lib/game/nickname';
import { NicknameTakenError, isNicknameTaken, saveProfile } from '@/lib/profile/save';
import { nicknameProblem, normalizePlayers, playersProblem } from '@/lib/profile/validate';
import { applyDocumentTeam } from '@/lib/theme/documentTeam';
import { teamThemesEnabled } from '@/lib/theme/themeSwitch';

type Step = 1 | 2 | 3;

/**
 * 가입 후 프로필 설정 — 닉네임 → 최애 구단 TOP3(1위 필수) → 최애 선수(선택).
 * 01 PRD 가입 흐름. 레벨 테스트는 4단계에서 이 뒤에 붙는다.
 *
 * 닉네임은 **추천값이 미리 채워져** 있다(그대로 다음을 눌러도 된다). 구단을 고르면
 * 화면 전체가 1위 구단 테마로 바로 바뀐다.
 */
export function ProfileSetupPage() {
  const [params] = useSearchParams();
  const returnTo = sanitizeReturnTo(params.get('returnTo'));
  const navigate = useNavigate();
  const { user, profile, refreshProfile } = useAuth();

  const [step, setStep] = useState<Step>(1);
  const [nickname, setNickname] = useState('');
  const [teams, setTeams] = useState<string[]>([]);
  const [players, setPlayers] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // 이미 정한 값이 있으면 이어서, 없으면 닉네임 추천값
  useEffect(() => {
    if (profile.status !== 'ready') return;
    setNickname((current) => current || profile.data.nickname || suggestNickname());
    setTeams((current) => (current.length ? current : profile.data.favoriteTeams));
    setPlayers((current) => (current.length ? current : profile.data.favoritePlayers));
  }, [profile]);

  if (user === undefined || profile.status === 'loading') return null;
  if (!user || user.isAnonymous) return <Navigate to="/auth?mode=signup" replace />;
  if (needsAgeCheck(user, profile)) {
    return <Navigate to={`/welcome/age?returnTo=${encodeURIComponent('/welcome/profile')}`} replace />;
  }

  async function nextFromNickname() {
    const problem = nicknameProblem(nickname);
    if (problem) {
      setError(problem);
      return;
    }
    setPending(true);
    setError(null);
    try {
      if (await isNicknameTaken(nickname.trim(), user!.uid)) {
        setError('이미 다른 선수가 쓰는 닉네임이에요.');
        return;
      }
      setStep(2);
    } catch {
      setError('확인하지 못했어요. 연결을 확인하고 다시 시도해 주세요.');
    } finally {
      setPending(false);
    }
  }

  function chooseTeams(next: string[]) {
    setTeams(next);
    if (teamThemesEnabled()) applyDocumentTeam(next[0] ?? null);
  }

  async function finish() {
    const problem = playersProblem(players);
    if (problem) {
      setError(problem);
      return;
    }
    setPending(true);
    setError(null);
    try {
      const previous = profile.status === 'ready' ? profile.data.nickname : null;
      await saveProfile(
        user!.uid,
        { nickname, favoriteTeams: teams, favoritePlayers: normalizePlayers(players) },
        previous,
      );
      await refreshProfile();
      navigate(returnTo, { replace: true });
    } catch (caught) {
      if (caught instanceof NicknameTakenError) {
        setError(caught.message);
        setStep(1);
      } else {
        setError('저장하지 못했어요. 연결을 확인하고 다시 시도해 주세요.');
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4 py-8">
      <p className="text-xs text-ink-2" aria-live="polite">
        {step} / 3
      </p>

      {error && (
        <p role="alert" className="text-sm" style={{ color: 'var(--out)' }}>
          {error}
        </p>
      )}

      {step === 1 && (
        <>
          <h1 className="font-cute text-3xl">닉네임을 정해 주세요</h1>
          <p className="text-sm text-ink-2 break-keep">
            추천 닉네임을 그대로 써도 돼요. 랭킹과 친구 대결에 이 이름이 보여요.
          </p>
          <label className="flex flex-col gap-1 text-sm">
            닉네임 (2~16자)
            <input
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              maxLength={20}
              className="min-h-14 rounded-option border px-3 text-lg"
              style={{ borderColor: 'var(--line)', backgroundColor: 'var(--bg-card)' }}
            />
          </label>
          <button
            type="button"
            disabled={pending}
            onClick={() => void nextFromNickname()}
            className="squishy font-cute min-h-14 text-xl disabled:opacity-60"
            style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
          >
            다음
          </button>
        </>
      )}

      {step === 2 && (
        <>
          <h1 className="font-cute text-3xl">최애 구단을 골라 주세요</h1>
          <p className="text-sm text-ink-2 break-keep">
            누르는 순서대로 1·2·3위예요. 1위는 꼭 골라 주세요. 1위 구단 색으로 화면이 바뀌어요.
          </p>
          <TeamRankPicker ranked={teams} onChange={chooseTeams} disabled={pending} />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="min-h-14 flex-1 rounded-option border-2 font-semibold"
              style={{ borderColor: 'var(--line)' }}
            >
              이전
            </button>
            <button
              type="button"
              disabled={teams.length === 0}
              onClick={() => {
                setError(null);
                setStep(3);
              }}
              className="squishy font-cute min-h-14 flex-[2] text-xl disabled:opacity-50"
              style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
            >
              다음
            </button>
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <h1 className="font-cute text-3xl">최애 선수가 있나요?</h1>
          <p className="text-sm text-ink-2 break-keep">
            선택이에요. 이름을 직접 적어 주세요(최대 3명). 나중에 설정에서 바꿀 수 있어요.
          </p>
          <PlayerInputs values={players} onChange={setPlayers} disabled={pending} />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="min-h-14 flex-1 rounded-option border-2 font-semibold"
              style={{ borderColor: 'var(--line)' }}
            >
              이전
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => void finish()}
              className="squishy font-cute min-h-14 flex-[2] text-xl disabled:opacity-60"
              style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
            >
              {pending ? '저장하는 중…' : '시작하기'}
            </button>
          </div>
        </>
      )}
    </main>
  );
}
