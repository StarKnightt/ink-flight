import '@fontsource/kristi/400.css';
import '@fontsource/caveat/latin-500.css';
import { wavedash } from './wavedash.js';

const q = new URLSearchParams(location.search);

// world-taste's browser check looks for its hook the moment the page has
// loaded, long before the world exists, so a placeholder goes up straight away
let worldIsReady;
window.__worldTaste = { ready: new Promise((r) => { worldIsReady = r; }), cameras: [] };
if (q.has('gallery')) {
  const { showGallery } = await import('./gallery.js');
  await showGallery(q.get('gallery') || 'land');
  wavedash.ready();
} else {
  // the loader is small and goes up first; the game arrives behind it
  const { papers } = await import('./draw/paper.js');
  document.documentElement.style.setProperty('--scrap', `url(${papers().pale.toDataURL()})`);
  const { Loader } = await import('./loader.js');
  const loader = new Loader();
  if (import.meta.env.DEV || q.has('debug')) window.__inkLoader = loader;
  loader.set(0.02);
  const { boot } = await import('./game.js');
  // boot calls wavedash.ready() once the world is drawing; if boot fails, still
  // lift Wavedash's loading screen so the page is not stuck behind it
  try { await boot(q, loader, worldIsReady); } finally { wavedash.ready(); }
}
