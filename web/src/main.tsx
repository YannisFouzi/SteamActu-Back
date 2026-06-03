import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

// Embedded login bridge (Chrome extension): Steam OpenID can't run inside our
// iframe, so the host opens it in a top-level popup. That popup stores the
// session under this same origin, firing a `storage` event here — reload so the
// feed picks the freshly-minted session up. Guarded to the embedded case; the
// standalone page navigates through OpenID itself.
if (window.parent !== window) {
  window.addEventListener('storage', (e) => {
    if (e.key === 'gn_session' && e.newValue) {
      window.location.reload();
    }
  });
}

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('#root not found');
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
