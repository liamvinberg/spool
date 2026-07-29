import { accelLabel, applePlatform, currentPlatform } from "../runtime/platform-keys";

/**
 * Combo strings: the one spelling of a key chord, shared by the registry, the
 * dispatcher, and every place a shortcut is shown. A combo is modifier tokens
 * then one key token, joined by `+`: `accel+z`, `shift+1`, `ctrl+o`, `escape`.
 *
 * The modifier tokens carry the keyboard law from platform-keys.ts verbatim:
 *
 * - `accel` — ⌘ or ctrl as a union (`metaKey || ctrlKey`). Keyboard shortcuts
 *   keep the union deliberately: no press collides, and the zoom chords must
 *   claim whichever modifier the browser would have zoomed the page with.
 * - `ctrl` — the literal control key, never meta. The jump list rides it on
 *   every platform (vim's own chords), so it must not widen into accel.
 * - `shift`, `alt` — themselves.
 *
 * Matching is exact: a modifier the combo does not name must not be held, so
 * `t` can never fire under ⇧T and an unregistered ⌘-chord matches nothing.
 * Three keys bend the rules the way the old handler did: `slash` and
 * `question` ignore shift because some layouts spell them with it, and a
 * shifted digit matches by `event.code`, because ⇧1 is `!` before it is a 1.
 */

export interface ComboEvent {
	key: string;
	code: string;
	metaKey: boolean;
	ctrlKey: boolean;
	shiftKey: boolean;
	altKey: boolean;
}

export interface ParsedCombo {
	accel: boolean;
	ctrl: boolean;
	shift: boolean;
	alt: boolean;
	/** normalized key token; `null` for a bare `accel` hold combo */
	key: string | null;
}

const NAMED_KEYS = new Set([
	"space",
	"escape",
	"enter",
	"backspace",
	"delete",
	"plus",
	"minus",
	"equals",
	"slash",
	"question",
	"arrowleft",
	"arrowright",
	"arrowup",
	"arrowdown",
]);

export function parseCombo(combo: string): ParsedCombo {
	const parsed: ParsedCombo = { accel: false, ctrl: false, shift: false, alt: false, key: null };
	for (const token of combo.split("+")) {
		if (token === "accel") parsed.accel = true;
		else if (token === "ctrl") parsed.ctrl = true;
		else if (token === "shift") parsed.shift = true;
		else if (token === "alt") parsed.alt = true;
		else if (/^[a-z0-9]$/.test(token) || NAMED_KEYS.has(token)) {
			if (parsed.key !== null) throw new Error(`combo "${combo}" names two keys`);
			parsed.key = token;
		} else throw new Error(`combo "${combo}" holds an unknown token "${token}"`);
	}
	if (parsed.key === null && !(parsed.accel && !parsed.ctrl && !parsed.shift && !parsed.alt)) {
		throw new Error(`combo "${combo}" names no key`);
	}
	return parsed;
}

/** The `event.key` a named token stands for, where the token is key-matched. */
const KEY_OF: Record<string, string> = {
	escape: "Escape",
	enter: "Enter",
	backspace: "Backspace",
	delete: "Delete",
	plus: "+",
	minus: "-",
	equals: "=",
	slash: "/",
	question: "?",
	arrowleft: "ArrowLeft",
	arrowright: "ArrowRight",
	arrowup: "ArrowUp",
	arrowdown: "ArrowDown",
};

export function matchesCombo(event: ComboEvent, combo: ParsedCombo): boolean {
	// a bare accel combo is the platform's own modifier key going down; the
	// other platform's modifier stays an ordinary, unclaimed key here
	if (combo.key === null) {
		return event.key === (applePlatform(currentPlatform()) ? "Meta" : "Control");
	}
	if (combo.alt !== event.altKey) return false;
	const shiftAgnostic = combo.key === "slash" || combo.key === "question";
	if (!shiftAgnostic && combo.shift !== event.shiftKey) return false;
	if (combo.accel) {
		if (!event.metaKey && !event.ctrlKey) return false;
	} else if (combo.ctrl) {
		if (!event.ctrlKey || event.metaKey) return false;
	} else if (event.metaKey || event.ctrlKey) return false;
	if (combo.key === "space") return event.code === "Space";
	if (/^[0-9]$/.test(combo.key)) {
		// shifted digits match by code (⇧1 is "!" on most layouts); bare digits
		// by key, exactly as the old handler read them
		return combo.shift ? event.code === `Digit${combo.key}` : event.key === combo.key;
	}
	if (/^[a-z]$/.test(combo.key)) return event.key.toLowerCase() === combo.key;
	return event.key === KEY_OF[combo.key];
}

/** The face a key token shows: glyphs where the app already draws them. */
const FACE_OF: Record<string, string> = {
	space: "space",
	escape: "esc",
	enter: "↵",
	backspace: "⌫",
	delete: "⌫",
	plus: "+",
	minus: "-",
	equals: "=",
	slash: "/",
	question: "?",
	arrowleft: "←",
	arrowright: "→",
	arrowup: "↑",
	arrowdown: "↓",
};

/**
 * How a combo is shown. The accel modifier takes the platform face the trash
 * toast already wears (`⌘Z`, `ctrl+Z`); ⇧ ⌥ ⌫ stay glyphs everywhere, the
 * face the context menu has always drawn.
 */
export function formatCombo(combo: string): string {
	const parsed = parseCombo(combo);
	const apple = applePlatform(currentPlatform());
	let face = "";
	if (parsed.accel) face += accelLabel();
	if (parsed.ctrl) face += apple ? "⌃" : "ctrl+";
	if (parsed.shift && parsed.key !== "slash" && parsed.key !== "question") face += "⇧";
	if (parsed.alt) face += "⌥";
	if (parsed.key === null) return face.replace(/\+$/, "");
	if (/^[a-z]$/.test(parsed.key)) return face + parsed.key.toUpperCase();
	if (/^[0-9]$/.test(parsed.key)) return face + parsed.key;
	return face + (FACE_OF[parsed.key] ?? parsed.key);
}
