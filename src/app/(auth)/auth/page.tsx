import { AuthForm } from '@/components/auth/AuthForm';
import { sanitizeReturnTo } from '@/lib/auth/returnTo';

export const dynamic = 'force-dynamic';

export default async function AuthPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string; error?: string }>;
}) {
  const params = await searchParams;
  return (
    <AuthForm
      returnTo={sanitizeReturnTo(params.returnTo)}
      {...(params.error ? { error: params.error } : {})}
    />
  );
}
