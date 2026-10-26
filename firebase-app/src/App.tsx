import { Mascot } from '@/components/brand/Mascot';
import { usingEmulators } from '@/lib/env';

/**
 * 0단계 자리 화면. 1단계부터 로그인·온보딩·퀴즈 화면이 들어온다.
 * 테마 토큰(globals.css)과 캐릭터가 기존 앱과 같게 보이는지만 확인한다.
 */
export function App() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <Mascot className="h-40 w-40" />
      <h1 className="font-cute text-4xl">야구왕</h1>
      <p className="text-sm text-ink-2 break-keep">
        Firebase 무료 플랜판을 준비하고 있어요. 로그인·퀴즈·친구 대결은 다음 단계에서 열려요.
      </p>
      {usingEmulators && (
        <p className="rounded-full px-3 py-1 text-xs" style={{ backgroundColor: 'var(--bg-card)' }}>
          로컬 에뮬레이터 모드
        </p>
      )}
    </main>
  );
}
