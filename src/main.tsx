/**
 * @module main
 *
 * React renderer entry point for DocuSync.
 *
 * This file is referenced by `index.html` via:
 * ```html
 * <script type="module" src="/src/main.tsx"></script>
 * ```
 *
 * It mounts the root {@link App} component into `#root` under
 * `React.StrictMode`, which enables:
 * - Double-invocation of effects in development (to catch side-effect bugs)
 * - Deprecation warnings for unsafe lifecycle methods
 * - Detection of unexpected side effects
 *
 * **CSS import order matters:**
 * `index.css` is imported first so Tailwind base/reset rules apply before
 * any component-level styles that may rely on them.
 *
 * @packageDocumentation
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

// ── Mount ─────────────────────────────────────────────────────────────────────

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error(
    '[DocuSync] #root element not found in index.html. ' +
    'Ensure <div id="root"></div> exists in the HTML template.'
  );
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
