import type { Terminal } from "@xterm/headless";

const visibleByTerminal = new WeakMap<Terminal, boolean>();

/**
 * DECTCEM is parser state, not buffer state. Track it through xterm's public
 * parser seam so stills and serialized replays agree with the live terminal.
 */
export function trackCursorVisibility(term: Terminal): void {
	visibleByTerminal.set(term, true);
	term.parser.registerCsiHandler({ prefix: "?", final: "h" }, (params) => {
		if (params.flat().includes(25)) visibleByTerminal.set(term, true);
		return false;
	});
	term.parser.registerCsiHandler({ prefix: "?", final: "l" }, (params) => {
		if (params.flat().includes(25)) visibleByTerminal.set(term, false);
		return false;
	});
	term.parser.registerCsiHandler({ intermediates: "!", final: "p" }, () => {
		// DECSTR resets DECTCEM to its default, visible state. This lives outside
		// xterm's exposed buffer, just like the explicit private-mode handlers.
		visibleByTerminal.set(term, true);
		return false;
	});
}

export function cursorVisible(term: Terminal): boolean {
	const visible = visibleByTerminal.get(term);
	if (visible === undefined) throw new Error("spool: cursor visibility is not tracked for this terminal");
	return visible;
}

export function resetCursorVisibility(term: Terminal): void {
	if (!visibleByTerminal.has(term)) throw new Error("spool: cursor visibility is not tracked for this terminal");
	visibleByTerminal.set(term, true);
}

export function serializedCursorVisibility(term: Terminal): string {
	return cursorVisible(term) ? "\x1b[?25h" : "\x1b[?25l";
}
