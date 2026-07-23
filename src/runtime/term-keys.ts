/**
 * Terminal key intents (#42), pure so the parity law is testable: every key
 * belongs to the TUI except the one exit chord — the platform modifier +
 * Escape, which terminals have never transmitted, so no TUI can want it.
 * Zoom keeps only its wheel gesture; zoom chords are keys, and keys are the
 * process's.
 */

export type TermKeyIntent = "exit" | "tui";

export interface KeyLike {
	key: string;
	metaKey: boolean;
	ctrlKey: boolean;
}

export function termKeyIntent(event: KeyLike): TermKeyIntent {
	return (event.metaKey || event.ctrlKey) && event.key === "Escape" ? "exit" : "tui";
}

export function exitChipLabel(code: number): string {
	return `exited ${code}`;
}
