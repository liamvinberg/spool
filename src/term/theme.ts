/**
 * The pinned terminal palette (#42): one default dark theme shared by the
 * live emulator, the daemon's headless buffer, stills, and player screens —
 * a terminal frame looks identical everywhere it appears. Anchored to the
 * canvas's own darks (the error document's #111110 ground and #b5b3ad ink).
 */

export const TERM_BACKGROUND = "#111110";
export const TERM_FOREGROUND = "#d8d6d0";
export const TERM_CURSOR = "#f0efeb";
export const TERM_CURSOR_ACCENT = TERM_BACKGROUND;

/** ANSI 0–15, normal then bright. */
export const TERM_ANSI = [
	"#262623",
	"#f56a4d",
	"#7dc4a5",
	"#d9b96c",
	"#7aa4d9",
	"#b58cc4",
	"#6fbcbf",
	"#b5b3ad",
	"#52524d",
	"#f5896f",
	"#97d4b8",
	"#e5cc8f",
	"#97b8e5",
	"#c9a5d6",
	"#8fcfd2",
	"#f0efeb",
] as const;
