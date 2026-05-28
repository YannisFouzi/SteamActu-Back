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

// Navigate the CURRENT window instead of opening a popup. The SPA is rendered
// full-page in Steam's main window (via MainWindowBrowserManager.ShowURL), so
// assigning location navigates that same window to the target — no popup. The
// Steam back arrow (and the NEWS header button) return to the feed. Works
// identically in a standalone browser tab.
export function openExternal(url: string): void {
  window.location.assign(url);
}
