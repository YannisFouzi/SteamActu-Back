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

// lock-closed-outline (Ionicons v5) — the locked-library / locked-wishlist empty
// state, mirroring the mobile EmptyStateMessage iconName "lock-closed-outline".
export function LockIcon({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true">
      <path
        d="M336 208v-95a80 80 0 00-160 0v95"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={32}
      />
      <rect
        x="96"
        y="208"
        width="320"
        height="272"
        rx="48"
        ry="48"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={32}
      />
    </svg>
  );
}

// [+] control (silent follow), mirrors the mobile FollowToggle: a plus when not
// followed, a checkmark once followed. Ionicons v5 "add" / "checkmark" paths.
export function AddIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true">
      <path
        d="M256 112v288M400 256H112"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={32}
      />
    </svg>
  );
}

export function CheckmarkIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true">
      <path
        d="M416 128L192 384l-96-96"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={32}
      />
    </svg>
  );
}

// Main-nav icons, mirrored from the mobile bottom tab bar (MainTabNavigator):
// newspaper-outline / game-controller-outline / person-circle-outline. Exact
// Ionicons v5 path data so the web view shows the same glyphs as the app.
export function NewspaperIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true">
      <path
        d="M368 415.86V72a24.07 24.07 0 00-24-24H72a24.07 24.07 0 00-24 24v352a40.12 40.12 0 0040 40h328"
        fill="none"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth={32}
      />
      <path
        d="M416 464h0a48 48 0 01-48-48V128h72a24 24 0 0124 24v264a48 48 0 01-48 48z"
        fill="none"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth={32}
      />
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={32}
        d="M240 128h64M240 192h64M112 256h192M112 320h192M112 384h192"
      />
      <path
        fill="currentColor"
        d="M176 208h-64a16 16 0 01-16-16v-64a16 16 0 0116-16h64a16 16 0 0116 16v64a16 16 0 01-16 16z"
      />
    </svg>
  );
}

export function GameControllerIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true">
      <path
        d="M467.51 248.83c-18.4-83.18-45.69-136.24-89.43-149.17A91.5 91.5 0 00352 96c-26.89 0-48.11 16-96 16s-69.15-16-96-16a99.09 99.09 0 00-27.2 3.66C89 112.59 61.94 165.7 43.33 248.83c-19 84.91-15.56 152 21.58 164.88 26 9 49.25-9.61 71.27-37 25-31.2 55.79-40.8 119.82-40.8s93.62 9.6 118.66 40.8c22 27.41 46.11 45.79 71.42 37.16 41.02-14.01 40.44-79.13 21.43-165.04z"
        fill="none"
        stroke="currentColor"
        strokeMiterlimit={10}
        strokeWidth={32}
      />
      <circle cx="292" cy="224" r="20" fill="currentColor" />
      <path
        fill="currentColor"
        d="M336 288a20 20 0 1120-19.95A20 20 0 01336 288z"
      />
      <circle cx="336" cy="180" r="20" fill="currentColor" />
      <circle cx="380" cy="224" r="20" fill="currentColor" />
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={32}
        d="M160 176v96M208 224h-96"
      />
    </svg>
  );
}

export function PersonCircleIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true">
      <path
        fill="currentColor"
        d="M258.9 48C141.92 46.42 46.42 141.92 48 258.9c1.56 112.19 92.91 203.54 205.1 205.1 117 1.6 212.48-93.9 210.88-210.88C462.44 140.91 371.09 49.56 258.9 48zm126.42 327.25a4 4 0 01-6.14-.32 124.27 124.27 0 00-32.35-29.59C321.37 329 289.11 320 256 320s-65.37 9-90.83 25.34a124.24 124.24 0 00-32.35 29.58 4 4 0 01-6.14.32A175.32 175.32 0 0180 259c-1.63-97.31 78.22-178.76 175.57-179S432 158.81 432 256a175.32 175.32 0 01-46.68 119.25z"
      />
      <path
        fill="currentColor"
        d="M256 144c-19.72 0-37.55 7.39-50.22 20.82s-19 32-17.57 51.93C191.11 256 221.52 288 256 288s64.83-32 67.79-71.24c1.48-19.74-4.8-38.14-17.68-51.82C293.39 151.44 275.59 144 256 144z"
      />
    </svg>
  );
}

// people (filled) — the Family Share badge glyph, same as the mobile GameCard.
export function PeopleIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true">
      <path
        fill="currentColor"
        d="M336 256c-20.56 0-40.44-9.18-56-25.84-15.13-16.25-24.37-37.92-26-61-1.74-24.62 5.77-47.26 21.14-63.76S312 80 336 80c23.83 0 45.38 9.06 60.7 25.52 15.47 16.62 23 39.22 21.26 63.63-1.67 23.11-10.9 44.77-26 61C376.44 246.82 356.57 256 336 256zm66-88zM467.83 432H204.18a27.71 27.71 0 01-22-10.67 30.22 30.22 0 01-5.26-25.79c8.42-33.81 29.28-61.85 60.32-81.08C264.79 297.4 299.86 288 336 288c36.85 0 71 9 98.71 26.05 31.11 19.13 52 47.33 60.38 81.55a30.27 30.27 0 01-5.32 25.78A27.68 27.68 0 01467.83 432zM147 260c-35.19 0-66.13-32.72-69-72.93-1.42-20.6 5-39.65 18-53.62 12.86-13.83 31-21.45 51-21.45s38 7.66 50.93 21.57c13.1 14.08 19.5 33.09 18 53.52-2.87 40.2-33.8 72.91-68.93 72.91zM212.66 291.45c-17.59-8.6-40.42-12.9-65.65-12.9-29.46 0-58.07 7.68-80.57 21.62-25.51 15.83-42.67 38.88-49.6 66.71a27.39 27.39 0 004.79 23.36A25.32 25.32 0 0041.72 400h111a8 8 0 007.87-6.57c.11-.63.25-1.26.41-1.88 8.48-34.06 28.35-62.84 57.71-83.82a8 8 0 00-.63-13.39c-1.57-.92-3.37-1.89-5.42-2.89z"
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
