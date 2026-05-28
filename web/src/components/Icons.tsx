// Ionicons v5 paths, mirrored from the mobile app so the web view shows the
// exact same bell (notifications / notifications-outline) and star glyphs.

export function BellIcon({ size = 22, filled }: { size?: number; filled: boolean }) {
  if (filled) {
    return (
      <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true">
        <path
          fill="currentColor"
          d="M256 480a80.06 80.06 0 0070.44-42.13 4 4 0 00-3.54-5.87H189.12a4 4 0 00-3.55 5.87A80.06 80.06 0 00256 480z"
        />
        <path
          fill="currentColor"
          d="M425.4 334.69c-7.32-12.83-23.05-23.5-23.05-66.69V233.66c0-66.61-26.78-114.18-72.59-138.93a16 16 0 01-7.85-12.16C319.06 60.65 299 40 273.7 40h-35.4c-25.31 0-45.32 20.65-48.21 42.57a16 16 0 01-7.85 12.16c-45.81 24.75-72.59 72.32-72.59 138.93V268c0 43.19-15.73 53.86-23 66.69-7 12.13-7.43 20.36 0 33.32C90.71 374.16 105 380 116.06 380h279.88c11.09 0 25.34-5.84 30.51-12-7.42-12.96-7.05-21.19-1.05-33.31z"
        />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true">
      <path
        d="M427.68 351.43C402 320 383.87 304 383.87 217.35 383.87 138 343.35 109.73 310 96c-4.43-1.82-8.6-6-9.95-10.55C294.2 65.54 277.8 48 256 48s-38.21 17.55-44 26.47c-1.35 4.6-5.52 8.71-9.95 10.53-33.39 13.75-73.87 41.92-73.87 121.35C128.13 304 110 320 84.32 351.43 73.68 364.45 83 384 101.61 384h308.78c18.55 0 27.94-19.21 17.29-32.57z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={32}
      />
      <path
        d="M320 384a64 64 0 01-128 0"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={32}
      />
    </svg>
  );
}

export function StarIcon({ size = 20, filled }: { size?: number; filled: boolean }) {
  if (filled) {
    return (
      <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true">
        <path
          fill="currentColor"
          d="M394 480a16 16 0 01-9.39-3L256 383.76 127.39 477a16 16 0 01-24.55-18.08L153 310.35 23 221.2a16 16 0 019-29.2h160.38l48.4-148.95a16 16 0 0130.44 0l48.4 149H480a16 16 0 019.05 29.2L359 310.35l50.13 148.53A16 16 0 01394 480z"
        />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true">
      <path
        d="M480 208H308L256 48l-52 160H32l140 96-54 160 138-100 138 100-54-160z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={32}
      />
    </svg>
  );
}
