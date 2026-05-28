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

export function openExternal(url: string): void {
  window.open(url, '_blank', 'noopener');
}
