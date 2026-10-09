// Await loading so the official APP_READY event cannot outrun registration.
// Carry the host's cache key into the bundled entry for release upgrades.
import { captureStartup } from './startup.js';
captureStartup(window.SillyTavern?.getContext?.());
const entry = new URL('./dist/index.js', import.meta.url);
entry.search = new URL(import.meta.url).search || '?v=0.2.1';
await import(entry.href);
