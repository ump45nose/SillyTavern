// Loaded before APP_READY by the official extension loader.
// Keep this awaited: a fire-and-forget import can miss the host's ready event.
await import('./dist/index.js');
