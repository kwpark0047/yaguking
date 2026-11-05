import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/app/fonts.css';
import './toss.css';
import { watchDisplay } from '@/lib/display/preference';
import { watchEffectsMode } from '@/lib/effects/preference';
import { watchSound } from '@/lib/sound/sound';
import { TossApp } from './TossApp';

// 앱인토스는 다크 모드를 지원하지 않는다 — 기기 설정과 상관없이 밝은 화면(토큰은 globals.css의 data-theme='light')
document.documentElement.dataset.theme = 'light';
watchDisplay();
watchEffectsMode();
watchSound();
// 서비스 워커·홈 화면 설치는 등록하지 않는다(앱 설치 유도 금지)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TossApp />
  </StrictMode>,
);
