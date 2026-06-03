import { isEmbedded, postToHost } from './host';

export function maskSteamId(id: string): string {
  if (!id || id.length <= 6) return id || '';
  return `${id.slice(0, 3)}***${id.slice(-2)}`;
}

export function formatDateTime(ms: number, language: string): string {
  if (!ms) return '';
  const d = new Date(ms);
  const locale = language || undefined;
  const date = d.toLocaleDateString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const time = d.toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${date} • ${time}`;
}

// Opens an external page (a Steam news/community/store URL, a support link…).
// When embedded (Millennium plugin OR Chrome extension), navigating the iframe
// would nest a Steam page inside our feed ("Steam in Steam"), so we ask the host
// to open it in its own context (native Steam tab for the plugin, top-level for
// the extension). Standalone in a browser tab, there is no host → navigate.
export function openExternal(url: string): void {
  if (isEmbedded()) {
    postToHost('gamenews-open-url', { url });
    return;
  }
  window.location.assign(url);
}
