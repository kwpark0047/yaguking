import { AuthForm } from '@/components/auth/AuthForm';
import { sanitizeReturnTo } from '@/lib/auth/returnTo';

export const dynamic = 'force-dynamic';

/** 로그인·가입. `?mode=signup`이면 가입 문구로 보인다(흐름은 같다). */
export default async function AuthPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string; error?: string; mode?: string }>;
}) {
  const params = await searchParams;
  return (
    <AuthForm
      returnTo={sanitizeReturnTo(params.returnTo)}
      mode={params.mode === 'signup' ? 'signup' : 'login'}
      {...(params.error ? { error: params.error } : {})}
    />
  );
}
