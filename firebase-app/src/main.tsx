import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './app/globals.css';
import './app/fonts.css';
import { watchEffectsMode } from './lib/effects/preference';
import { registerServiceWorker, watchInstall } from './lib/pwa/install';
import { watchDisplay } from './lib/display/preference';
import { watchSound } from './lib/sound/sound';
import { captureAcquisition } from './lib/growth/acquisition';
import { captureInvite } from './lib/growth/invite';

// 유입 출처(docs/measurement-plan.md 2단계) — 처음 들어온 주소의 홍보 링크 표시만, 화면을 그리기 전에(주소창에서 지운다)
captureAcquisition();
// 친구 초대 — 링크의 초대 코드를 가입할 때까지 기기에(주소창에서 지운다)
captureInvite();
// 글자 크기·테마(docs/game-look-plan.md) — 효과 설정보다 먼저(고대비 테마면 효과가 차분해진다)
watchDisplay();
watchEffectsMode();
watchSound();
// 홈 화면에 추가(PWA) — 설치 이벤트는 일찍 오므로 화면보다 먼저 붙잡는다. 서비스 워커는 운영 빌드에서만
watchInstall();
registerServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
