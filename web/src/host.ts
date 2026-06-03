// Bridge to the embedding host. This SPA renders inside an <iframe> in two
// hosts: the Millennium plugin (Steam Desktop) and the Chrome extension (Steam
// website). Some actions can't be done from inside the iframe and must be
// performed by the host in its own top-level context:
//   - opening an external Steam page (avoid nesting "Steam in Steam"),
//   - starting Steam OpenID login (Steam's login page refuses to be framed).
// We post these to the parent; the host validates our origin before acting.
export function isEmbedded(): boolean {
  try {
    return window.parent !== window;
  } catch {
    // Cross-origin access to window.parent throws → we are embedded.
    return true;
  }
}

// Posted with targetOrigin '*' on purpose: the parent origin differs per host
// (steamloopback.host for the plugin, steamcommunity.com / store.steampowered.com
// for the extension) and the payload is a non-secret public URL. Each host
// listener authenticates the message by checking event.origin === our feed
// origin and the message type, so a wildcard target is safe here.
export function postToHost(type: string, payload: Record<string, unknown> = {}): void {
  try {
    window.parent.postMessage({ type, ...payload }, '*');
  } catch {
    /* ignore — not embedded or parent unavailable */
  }
}
