import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './app/globals.css';
import './app/fonts.css';
import { watchEffectsMode } from './lib/effects/preference';
import { registerServiceWorker, watchInstall } from './lib/pwa/install';
import { watchDisplay } from './lib/display/preference';
import { watchSound } from './lib/sound/sound';

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
