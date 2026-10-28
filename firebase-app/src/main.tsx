import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './app/globals.css';
import './app/fonts.css';
import { watchEffectsMode } from './lib/effects/preference';
import { watchSound } from './lib/sound/sound';

watchEffectsMode();
watchSound();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
