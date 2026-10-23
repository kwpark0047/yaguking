import { PlayClient } from '@/components/game/PlayClient';
import { TrialStarter } from '@/components/game/TrialStarter';
import { resolveOwnerFromCookies } from '@/server/auth/resolveOwner';
import { getOrStartTrial } from '@/server/play/resume';

/**
 * V01 랜딩 = 1번 타석 (08 문서 §3).
 *
 * 첫 투구까지 0탭이다. 로그인·약관·모달·튜토리얼을 앞세우지 않는다.
 * 진행 중 경기가 있으면 이어서 보여주므로 새로고침이 체험 횟수를 깎지 않는다.
 */
export const dynamic = 'force-dynamic';

export default async function LandingPage() {
  const owner = await resolveOwnerFromCookies();

  // 쿠키가 없으면 서버에서 세션을 만들 수 없다(쿠키 설정 불가). 클라이언트에 맡긴다.
  if (!owner) return <TrialStarter />;

  try {
    const session = await getOrStartTrial(owner);
    return <PlayClient initial={session} />;
  } catch {
    // 체험 소진·문항 부족 등은 대체 진입에서 사람이 읽을 메시지로 보여준다.
    return <TrialStarter />;
  }
}
