import './sdk-ui.css';
import { initializeAxiom, notifyAxiom } from './lib/axiom';
import { createRoot } from 'react-dom/client';
import { Shell } from './Shell';
import './styles.css';
import './desktop/desktop.css';
import './desktop/interactions.css';
import './personal/personal.css';
import './personal/video-ux.css';
import './typography.css';
import './desktop/video-ux.css';
import './desktop/shapes.css';
import './desktop/chat-mode.css';
import './desktop/navigation.css';
import './desktop/motion.css';
import './desktop/endpoints.css';
import './desktop/onboarding.css';
import './desktop/providers.css';
import './desktop/settings.css';
import './desktop/rich-text.css';
import './desktop/sdk-controls.css';
import './desktop/images.css';
try { document.documentElement.dataset.reduceMotion = String(localStorage.getItem('client-reduce-motion') === 'true'); } catch { /* Preferences are optional. */ }
void initializeAxiom().then(() => {
  createRoot(document.getElementById('root')!).render(<Shell/>);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    window.dispatchEvent(new CustomEvent('client-ready'));
    document.getElementById('launch-splash')?.remove();
  }));
}).catch(error => {
  document.getElementById('launch-splash')?.remove();
  notifyAxiom(error instanceof Error ? error.message : 'AXIOM AI tidak dapat dimuat.');
  const root = document.getElementById('root')!;
  const heading = document.createElement('h1');
  heading.textContent = 'AXIOM AI';
  const text = document.createElement('p');
  text.textContent = 'Sesi atau riwayat tidak dapat dimuat. Masuk kembali atau coba muat ulang.';
  const retry = document.createElement('button');
  retry.textContent = 'Muat ulang';
  retry.onclick = () => location.reload();
  root.replaceChildren(heading, text, retry);
});
import './desktop/temporary-chat.css';

import './desktop/mobile.css';
import './mobile/mobile.css';
import './mobile/home.css';
import './mobile/navigation.css';
import './mobile/search.css';
import './mobile/sdk-controls.css';
import './mobile/endpoints.css';
import './mobile/theme.css';

import './mobile/motion.css';

import './mobile/response-actions.css';

import './mobile/edge-fades.css';
import './mobile/composer-motion.css';

import './mobile/voice-attachments.css';
import './mobile/media-rich-text.css';
import './axiom.css';
