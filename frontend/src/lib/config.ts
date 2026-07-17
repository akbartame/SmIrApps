// In dev, vite.config.ts proxies /api -> backend REST and /ws -> backend WS,
// so these stay relative and no .env is required to get started. Override
// via .env if you deploy the frontend separately from the backend.
export const API_BASE = import.meta.env.VITE_API_URL ?? '/api';
export const WS_URL =
  import.meta.env.VITE_WS_URL ??
  `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
