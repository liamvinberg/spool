import { readFileSync } from "node:fs";
import { offsetOf } from "./jsx-span";
import { parseStamp } from "./selection";

/**
 * The call-site label (#58): DOM siblings sharing one stamp collapse into a
 * single inspector row, named after the call that repeats them — `cart.map(…)`.
 * The name is read from the stamped source: the nearest call chain whose
 * argument is the arrow (or parenthesized arrow body) the element opens.
 * Anything else — an element outside a call, a stamp the file outgrew —
 * answers undefined; the row then stands on its tag and count alone.
 */

const WINDOW = 240;

/** `ident(.prop)*(` followed only by an arrow preamble up to the element. */
const CALL_OPEN = /([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*\(/g;
const ARROW_PREAMBLE = /^\s*(?:\([^()]*\)|[A-Za-z_$][\w$]*)\s*=>\s*\(?\s*$/;

export function callSiteLabel(source: string, line: number, column: number): string | undefined {
	const start = offsetOf(source, line, column);
	if (start === undefined || source[start] !== "<") return undefined;

	const windowStart = Math.max(0, start - WINDOW);
	const window = source.slice(windowStart, start);
	let found: string | undefined;
	CALL_OPEN.lastIndex = 0;
	for (let match = CALL_OPEN.exec(window); match !== null; match = CALL_OPEN.exec(window)) {
		const chain = match[1];
		if (chain === undefined) continue;
		const between = window.slice(match.index + match[0].length);
		// the nearest qualifying call wins — keep scanning to the window's end
		if (ARROW_PREAMBLE.test(between)) found = `${chain}(…)`;
	}
	return found;
}

/** Each stamp's call-site label — null where there is no call, file, or stamp. */
export function stampLabels(root: string, stamps: readonly string[]): Record<string, string | null> {
	const files = new Map<string, string | undefined>();
	const labels: Record<string, string | null> = {};
	for (const source of stamps) {
		labels[source] = null;
		const stamp = parseStamp(root, source);
		if (stamp === undefined) continue;
		if (!files.has(stamp.file)) {
			try {
				files.set(stamp.file, readFileSync(stamp.file, "utf8"));
			} catch {
				files.set(stamp.file, undefined);
			}
		}
		const text = files.get(stamp.file);
		if (text === undefined) continue;
		labels[source] = callSiteLabel(text, stamp.line, stamp.column) ?? null;
	}
	return labels;
}
