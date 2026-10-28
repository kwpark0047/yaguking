import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './app/globals.css';
import './app/fonts.css';
import { watchEffectsMode } from './lib/effects/preference';
import { registerServiceWorker, watchInstall } from './lib/pwa/install';
import { watchSound } from './lib/sound/sound';

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
