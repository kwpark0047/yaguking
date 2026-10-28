import { useState } from 'react';
import { useInstall } from '@/lib/pwa/install';
import { Dialog, InstallActions } from './InstallGuide';

/**
 * 머리줄 별표 — 즐겨찾기(북마크) 하는 법. 브라우저는 사이트가 스스로 북마크하는 것을 막아서, 기기에 맞는 단축키·메뉴를 알려 준다.
 * 휴대폰은 북마크 대신 홈 화면에 추가(PWA) 안내를 함께 보여 준다.
 */
export function BookmarkButton() {
  const [open, setOpen] = useState(false);
  const state = useInstall();
  const mobile = state.platform === 'ios' || state.platform === 'android';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="flex min-h-11 min-w-11 items-center justify-center rounded-full border-2 text-lg"
        style={{ borderColor: 'var(--line)' }}
      >
        <span aria-hidden="true">☆</span>
        <span className="sr-only">즐겨찾기 방법</span>
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={mobile ? '홈 화면에 추가' : '즐겨찾기에 추가'}>
        {mobile ? (
          <>
            <p className="text-sm break-keep">홈 화면에 야구왕을 두면 앱처럼 바로 열려요.</p>
            <InstallActions />
            <p className="text-xs text-ink-2 break-keep">
              북마크만 하려면 브라우저 메뉴의 <strong>☆(북마크)</strong>를 누르세요.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm break-keep" role="note">
              키보드에서{' '}
              <kbd className="rounded border px-1.5 py-0.5 font-semibold" style={{ borderColor: 'var(--line)' }}>
                {state.platform === 'mac' ? '⌘ Cmd + D' : 'Ctrl + D'}
              </kbd>
              를 누르면 즐겨찾기(북마크)에 추가돼요.
            </p>
            {!state.installed && (state.canPrompt || state.manual) && (
              <section aria-label="앱으로 설치" className="flex flex-col gap-2 border-t pt-3" style={{ borderColor: 'var(--line)' }}>
                <p className="text-sm font-semibold">앱처럼 쓰려면 설치도 할 수 있어요</p>
                <InstallActions />
              </section>
            )}
          </>
        )}
      </Dialog>
    </>
  );
}
