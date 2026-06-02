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

// Origin of the Steam Desktop client UI — the only host that embeds this SPA in
// an <iframe> (the Millennium plugin). Standalone (Chrome) is never iframed.
const STEAM_CLIENT_ORIGIN = 'https://steamloopback.host';

// Opens an external page (a Steam news/community/store URL, a support link…).
// When the SPA runs inside the Steam client it lives in an <iframe>; navigating
// that iframe would nest a Steam page inside our feed ("Steam in Steam"), so we
// ask the host plugin (parent window) to open the URL natively in Steam instead.
// Standalone in a browser tab, there is no parent → navigate normally.
export function openExternal(url: string): void {
  if (window.parent !== window) {
    window.parent.postMessage(
      { type: 'gamenews-open-url', url },
      STEAM_CLIENT_ORIGIN,
    );
    return;
  }
  window.location.assign(url);
}
