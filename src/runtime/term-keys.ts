/**
 * Terminal key intents (#42), pure so the parity law is testable: every key
 * belongs to the TUI except the one exit chord — the platform modifier +
 * Escape, which terminals have never transmitted, so no TUI can want it.
 * Zoom keeps only its wheel gesture; zoom chords are keys, and keys are the
 * process's.
 */

import { accelLabel, currentPlatform } from "./platform-keys";

export type TermKeyIntent = "exit" | "tui";

export interface KeyLike {
	key: string;
	metaKey: boolean;
	ctrlKey: boolean;
}

/**
 * A deliberate union rather than the exclusive accel read: ctrl+esc is a chord
 * no TUI wants on any platform, so taking either modifier costs the process
 * nothing and gives the one way out a second spelling.
 */
export function termKeyIntent(event: KeyLike, exitChord = true): TermKeyIntent {
	return exitChord && (event.metaKey || event.ctrlKey) && event.key === "Escape" ? "exit" : "tui";
}

export function exitChipLabel(code: number): string {
	return `exited ${code}`;
}

/** The exit chord as a given platform spells it. "esc" is a word, not ⎋:
 * the chrome fonts don't carry that glyph, and its system fallback renders
 * as an unreadable slashed circle. */
export function exitChordLabel(platform = currentPlatform()): string {
	return `${accelLabel(platform)}esc`;
}
