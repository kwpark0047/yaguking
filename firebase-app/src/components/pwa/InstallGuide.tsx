import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { promptInstall, useInstall, type InstallState } from '@/lib/pwa/install';

const primary = { backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' };

/**
 * 창(브라우저 기본 <dialog>) — 키보드 Esc로 닫히고, 열린 동안 뒤쪽은 눌리지 않는다. 닫으면 연 단추로 초점이 돌아간다.
 */
export function Dialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  const titleId = useId();
  return (
    <dialog ref={ref} aria-labelledby={titleId} onClose={onClose} className="yk-dialog sticker m-auto w-[min(28rem,calc(100vw-2rem))] p-5 text-ink-1">
      <div className="flex flex-col gap-4">
        <h2 id={titleId} className="font-cute text-2xl">
          {title}
        </h2>
        {children}
        <button type="button" onClick={onClose} className="min-h-11 rounded-option border-2 font-semibold" style={{ borderColor: 'var(--line)' }}>
          닫기
        </button>
      </div>
    </dialog>
  );
}

/** 기기·브라우저별 홈 화면 추가 방법(설치 창이 없을 때) */
export function InstallSteps({ state }: { state: InstallState }) {
  if (state.installed) {
    return <p className="text-sm break-keep">이 기기에 이미 설치했어요. 홈 화면(앱 목록)에서 야구왕을 열면 돼요.</p>;
  }
  const steps: Record<InstallState['platform'], ReactNode> = {
    ios: state.iosSafari ? (
      <ol className="flex list-decimal flex-col gap-1 pl-5">
        <li>
          화면 아래(아이패드는 위)의 <strong>공유 단추</strong>(네모에서 위로 화살표)를 누르세요.
        </li>
        <li>
          목록을 내려 <strong>홈 화면에 추가</strong>를 고르세요.
        </li>
        <li>
          오른쪽 위 <strong>추가</strong>를 누르면 끝!
        </li>
      </ol>
    ) : (
      <p>
        아이폰·아이패드는 <strong>사파리</strong>에서 이 주소를 열고 공유 단추 → <strong>홈 화면에 추가</strong>를 고르세요. (iOS 16.4 이상은 크롬의 공유
        메뉴에도 있어요. 카카오톡 등 앱 안의 브라우저에서는 안 돼요.)
      </p>
    ),
    android: (
      <ol className="flex list-decimal flex-col gap-1 pl-5">
        <li>
          브라우저 오른쪽 위 <strong>메뉴(⋮)</strong>를 누르세요.
        </li>
        <li>
          <strong>앱 설치</strong> 또는 <strong>홈 화면에 추가</strong>를 고르세요.
        </li>
      </ol>
    ),
    mac: state.manual ? (
      <p>
        크롬·엣지는 주소창 오른쪽의 <strong>설치 아이콘</strong>을, 사파리는 메뉴 <strong>파일 → Dock에 추가</strong>를 누르세요.
      </p>
    ) : (
      <p>
        이 브라우저는 앱 설치를 지원하지 않아요. <strong>⌘ Cmd + D</strong>로 북마크하거나 크롬·엣지·사파리에서 열어 주세요.
      </p>
    ),
    desktop: state.manual ? (
      <p>
        주소창 오른쪽의 <strong>설치 아이콘</strong>을 누르거나, 메뉴(⋮ 또는 …)에서 <strong>앱 설치</strong>를 고르세요.
      </p>
    ) : (
      <p>
        이 브라우저는 앱 설치를 지원하지 않아요. <strong>Ctrl + D</strong>로 즐겨찾기에 넣거나 크롬·엣지에서 열어 주세요.
      </p>
    ),
  };
  return <div className="text-sm break-keep">{steps[state.platform]}</div>;
}

/** 설치 단추 + (설치 창이 없으면) 따라 하기 안내 — 설정·머리줄 창·가입 직후 권유가 함께 쓴다 */
export function InstallActions({ onDone }: { onDone?: (outcome: 'accepted' | 'dismissed') => void }) {
  const state = useInstall();
  const [message, setMessage] = useState<string | null>(null);

  async function install() {
    const outcome = await promptInstall();
    if (outcome === 'accepted') setMessage('설치했어요! 홈 화면에서 야구왕을 열어 보세요.');
    if (outcome === 'dismissed') setMessage('설치를 취소했어요. 언제든 다시 할 수 있어요.');
    if (outcome !== 'unavailable') onDone?.(outcome);
  }

  return (
    <div className="flex flex-col gap-3">
      {state.canPrompt && !state.installed ? (
        <button type="button" onClick={() => void install()} className="squishy font-cute min-h-14 text-xl" style={primary}>
          앱 설치하기
        </button>
      ) : (
        <InstallSteps state={state} />
      )}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </div>
  );
}
