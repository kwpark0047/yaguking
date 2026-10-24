import { redirect } from 'next/navigation';
import { OnboardingClient } from '@/components/onboarding/OnboardingClient';
import { sanitizeReturnTo, withFlag } from '@/lib/auth/returnTo';
import { getAuthUserId } from '@/lib/supabase/server';
import { teamThemesEnabled } from '@/lib/theme/themeSwitch';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const params = await searchParams;
  const returnTo = sanitizeReturnTo(params.returnTo);

  /**
   * 다른 보호 화면과 같은 규칙을 따른다.
   *
   * 이 체크가 없으면 비로그인 방문자에게 "로그인이 필요합니다" 오류를 띄운 채
   * 닉네임 입력 폼을 그대로 보여 주게 된다. 입력하고 다음을 누른 뒤에야
   * 실패하므로 사용자가 헛수고를 한다.
   */
  const userId = await getAuthUserId();
  if (!userId) {
    redirect(withFlag('/auth', 'returnTo', withFlag('/onboarding', 'returnTo', returnTo)));
  }

  return <OnboardingClient returnTo={returnTo} teamThemes={teamThemesEnabled()} />;
}
