import { OnboardingClient } from '@/components/onboarding/OnboardingClient';
import { sanitizeReturnTo } from '@/lib/auth/returnTo';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const params = await searchParams;
  return <OnboardingClient returnTo={sanitizeReturnTo(params.returnTo)} />;
}
