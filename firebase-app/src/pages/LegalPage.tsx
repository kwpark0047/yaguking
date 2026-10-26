import { Link } from 'react-router';

/**
 * 이용약관·개인정보처리방침 자리 페이지 (Firebase판).
 *
 * 기존 앱의 처리방침(2026-10-26 시행)은 Supabase·Vercel 기준이라 그대로 쓸 수 없다.
 * Firebase판 문안(위탁: Google, 로그인 데이터 국외 이전 등)은 9단계에서 쓴다.
 * 그때까지 확정 전이라는 사실만 밝힌다 — 내용을 지어 넣지 않는다.
 */
export function LegalPage({ kind }: { kind: 'terms' | 'privacy' }) {
  const title = kind === 'terms' ? '이용약관' : '개인정보처리방침';
  const other =
    kind === 'terms'
      ? { to: '/privacy', label: '개인정보처리방침' }
      : { to: '/terms', label: '이용약관' };

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-4 px-4 py-8">
      <Link to="/" className="flex min-h-11 items-center self-start text-sm text-ink-2 underline">
        ← 야구왕
      </Link>
      <h1 className="font-cute text-3xl">{title}</h1>
      <section aria-labelledby="legal-status" className="sticker flex flex-col gap-2 p-5">
        <h2 id="legal-status" className="flex items-center gap-2 font-semibold">
          <span
            className="rounded-full px-2 py-0.5 text-xs"
            style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
          >
            확정 전
          </span>
          Firebase판 문안을 준비하고 있어요
        </h2>
        <p className="text-sm text-ink-2 break-keep">
          서비스 운영 환경이 바뀌어 문안을 새로 쓰고 있어요. 확정되면 이 자리에 전문과 시행일을
          게시합니다.
        </p>
      </section>
      <Link to={other.to} className="flex min-h-11 items-center self-start text-sm underline">
        {other.label} 보기
      </Link>
    </main>
  );
}
