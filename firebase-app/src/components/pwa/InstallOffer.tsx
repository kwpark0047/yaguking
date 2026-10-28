import { useState } from 'react';
import { dismissInstallOffer, promptInstall, useInstall } from '@/lib/pwa/install';
import { Dialog, InstallSteps } from './InstallGuide';

const primary = { backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' };

/**
 * 가입 직후 한 번 — 홈 화면에 추가 권유(docs/pwa.md). 화면 아래 카드라 가입 완료·게임을 막지 않는다.
 * 이미 설치했거나, "나중에"를 골랐거나, 이 브라우저에서 설치할 수 없으면 띄우지 않는다.
 * "앱 설치하기": 브라우저 설치 창이 있으면 그것을, 없으면(iOS 사파리 등) 따라 할 안내를 연다.
 */
export function InstallOffer({ onClose }: { onClose: () => void }) {
  const state = useInstall();
  const [guide, setGuide] = useState(false);

  if (state.installed || state.dismissed || !(state.canPrompt || state.manual)) return null;

  async function install() {
    const outcome = await promptInstall();
    if (outcome === 'unavailable') setGuide(true);
    else onClose();
  }

  function later() {
    dismissInstallOffer();
    onClose();
  }

  return (
    <>
      <aside aria-labelledby="install-offer-title" className="install-offer sticker flex flex-col gap-3 p-4">
        <p id="install-offer-title" className="font-semibold break-keep">
          ⚾ 야구왕을 홈 화면에 추가하고 언제든 야구 퀴즈에 도전하세요!
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={() => void install()} className="squishy font-cute min-h-12 flex-1 text-lg" style={primary}>
            앱 설치하기
          </button>
          <button type="button" onClick={later} className="min-h-12 flex-1 rounded-option border-2 font-semibold" style={{ borderColor: 'var(--line)' }}>
            나중에
          </button>
        </div>
      </aside>
      <Dialog
        open={guide}
        onClose={() => {
          setGuide(false);
          onClose();
        }}
        title="홈 화면에 추가"
      >
        <InstallSteps state={state} />
      </Dialog>
    </>
  );
}
