import { accelKeyName, accelLabel, applePlatform, currentPlatform } from "../runtime/platform-keys";

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
 * Exactness bends only where a layout spells the key itself: character tokens
 * (`slash`, `question`, `plus`, `minus`, `equals`) ignore shift because on
 * many layouts shift is how the character is typed at all (`+` is ⇧= on US,
 * `=` is ⇧0 on Swedish); a shifted digit matches by `event.code`, because ⇧1
 * is `!` before it is a 1; and `space` ignores modifiers entirely, because
 * hold-to-pan has always borrowed the Hand no matter what else is held.
 * `any` says the same of any key (`any+escape`): whatever else is held.
 *
 * Bracket keys (`bracketleft`, `bracketright`) match by physical key, so ⌘] sits
 * in the same place on every layout (⌘¨ on Swedish); their face is the
 * layout's own glyph once `learnKeyboardLayout` has read it.
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
	/** `any+`: matches whatever modifiers are held */
	any: boolean;
	/** normalized key token; `null` for a bare modifier-hold combo */
	key: string | null;
}

const NAMED_KEYS = new Set([
	"space",
	"escape",
	"enter",
	"tab",
	"backspace",
	"delete",
	"f2",
	"plus",
	"minus",
	"equals",
	"slash",
	"question",
	"comma",
	"arrowleft",
	"arrowright",
	"arrowup",
	"arrowdown",
	"bracketleft",
	"bracketright",
]);

export function parseCombo(combo: string): ParsedCombo {
	const parsed: ParsedCombo = { accel: false, ctrl: false, shift: false, alt: false, any: false, key: null };
	for (const token of combo.split("+")) {
		if (token === "any") parsed.any = true;
		else if (token === "accel") parsed.accel = true;
		else if (token === "ctrl") parsed.ctrl = true;
		else if (token === "shift") parsed.shift = true;
		else if (token === "alt") parsed.alt = true;
		else if (/^[a-z0-9]$/.test(token) || NAMED_KEYS.has(token)) {
			if (parsed.key !== null) throw new Error(`combo "${combo}" names two keys`);
			parsed.key = token;
		} else throw new Error(`combo "${combo}" holds an unknown token "${token}"`);
	}
	// a hold combo is one bare modifier and nothing else: the key going down is
	// the whole gesture, which is how ⌘ arms the deep ring and ⌥ the measure
	const held = [parsed.accel, parsed.ctrl, parsed.shift, parsed.alt].filter(Boolean).length;
	if (parsed.any && (held > 0 || parsed.key === null)) throw new Error(`combo "${combo}" holds any beside a modifier`);
	if (parsed.key === null && !((parsed.accel || parsed.alt) && held === 1)) {
		throw new Error(`combo "${combo}" names no key`);
	}
	return parsed;
}

/** The `event.key` a named token stands for, where the token is key-matched. */
const KEY_OF: Record<string, string> = {
	escape: "Escape",
	enter: "Enter",
	tab: "Tab",
	backspace: "Backspace",
	delete: "Delete",
	f2: "F2",
	plus: "+",
	minus: "-",
	equals: "=",
	slash: "/",
	question: "?",
	comma: ",",
	arrowleft: "ArrowLeft",
	arrowright: "ArrowRight",
	arrowup: "ArrowUp",
	arrowdown: "ArrowDown",
};

/** Character tokens a layout may spell with shift: match the character, not the chord. */
const SHIFT_AGNOSTIC = new Set(["slash", "question", "plus", "minus", "equals"]);

/** Keys matched by where they sit rather than what they type. */
const CODE_OF: Record<string, string> = {
	bracketleft: "BracketLeft",
	bracketright: "BracketRight",
};

/**
 * A combo lowered to plain data for matching: no grammar left in it, so it
 * travels as JSON to where the grammar is not (the frame shim relays by it).
 */
export interface ComboMatch {
	/** a bare modifier going down: `alt`, or the platform's accel key */
	hold: "alt" | "accel" | null;
	/** whatever modifiers are held */
	any: boolean;
	accel: boolean;
	ctrl: boolean;
	alt: boolean;
	/** `null`: either way */
	shift: boolean | null;
	/** the `event.code` to match; else `key` is */
	code: string | null;
	key: string | null;
	/** compare `event.key` lowercased */
	fold: boolean;
}

export function lowerCombo(combo: ParsedCombo): ComboMatch {
	const match: ComboMatch = {
		hold: null,
		any: combo.any,
		accel: combo.accel,
		ctrl: combo.ctrl,
		alt: combo.alt,
		shift: combo.shift,
		code: null,
		key: null,
		fold: false,
	};
	const key = combo.key;
	if (key === null) return { ...match, hold: combo.alt ? "alt" : "accel" };
	// hold-to-pan borrows the Hand under any modifier, as it always has
	if (key === "space") return { ...match, any: true, code: "Space" };
	if (SHIFT_AGNOSTIC.has(key)) match.shift = null;
	const code = CODE_OF[key];
	if (code !== undefined) return { ...match, code };
	if (/^[0-9]$/.test(key)) {
		// shifted digits match by code (⇧1 is "!" on most layouts); bare digits
		// by key, exactly as the old handler read them
		return combo.shift ? { ...match, code: `Digit${key}` } : { ...match, key };
	}
	// ⌥ spells a letter as something else on a Mac (⌥B is ∫), so under it the key's place is the letter
	if (/^[a-z]$/.test(key))
		return combo.alt ? { ...match, code: `Key${key.toUpperCase()}` } : { ...match, key, fold: true };
	return { ...match, key: KEY_OF[key] ?? null };
}

/**
 * Whether a press is a lowered combo; the frame shim bundles it too
 * (runtime/frame-shim/keys.ts). `accelKey` is the platform's accel key name,
 * for hold combos.
 */
export function comboMatches(event: ComboEvent, match: ComboMatch, accelKey: string | null): boolean {
	if (match.hold !== null) return event.key === (match.hold === "alt" ? "Alt" : accelKey);
	if (!match.any) {
		if (match.alt !== event.altKey) return false;
		if (match.shift !== null && match.shift !== event.shiftKey) return false;
		if (match.accel) {
			if (!event.metaKey && !event.ctrlKey) return false;
		} else if (match.ctrl) {
			if (!event.ctrlKey || event.metaKey) return false;
		} else if (event.metaKey || event.ctrlKey) return false;
	}
	if (match.code !== null) return event.code === match.code;
	return (match.fold ? event.key.toLowerCase() : event.key) === match.key;
}

export function matchesCombo(event: ComboEvent, combo: ParsedCombo, platform = currentPlatform()): boolean {
	return comboMatches(event, lowerCombo(combo), accelKeyName(platform));
}

/** The face a key token shows: glyphs where the app already draws them. */
const FACE_OF: Record<string, string> = {
	space: "space",
	escape: "esc",
	enter: "↵",
	tab: "⇥",
	backspace: "⌫",
	delete: "⌫",
	f2: "F2",
	plus: "+",
	minus: "-",
	equals: "=",
	slash: "/",
	question: "?",
	comma: ",",
	arrowleft: "←",
	arrowright: "→",
	arrowup: "↑",
	arrowdown: "↓",
	bracketleft: "[",
	bracketright: "]",
};

/** What this keyboard's layout prints on a physical key, once read. */
const layoutGlyphs = new Map<string, string>();

/**
 * Read the layout's own glyphs for the keys matched by place, so the sheet
 * shows ⌘¨ where a Swedish board has it. Chromium's Keyboard API only; where
 * it is missing the US faces stand. Resolves whether anything was learned.
 */
export async function learnKeyboardLayout(
	keyboard = typeof navigator === "undefined"
		? undefined
		: (navigator as { keyboard?: { getLayoutMap?: () => Promise<Map<string, string>> } }).keyboard,
): Promise<boolean> {
	if (keyboard?.getLayoutMap === undefined) return false;
	try {
		const map = await keyboard.getLayoutMap();
		let learned = false;
		for (const code of Object.values(CODE_OF)) {
			const glyph = map.get(code);
			if (glyph === undefined || glyph === layoutGlyphs.get(code)) continue;
			layoutGlyphs.set(code, glyph);
			learned = true;
		}
		return learned;
	} catch {
		// a page without permission or focus keeps the US faces
		return false;
	}
}

/**
 * How a combo is shown. The accel modifier takes the platform face the trash
 * toast already wears (`⌘Z`, `ctrl+Z`); ⇧ ⌥ ⌫ stay glyphs everywhere, the
 * face the context menu has always drawn.
 */
export function formatCombo(combo: string, platform = currentPlatform()): string {
	const parsed = parseCombo(combo);
	const apple = applePlatform(platform);
	let face = "";
	if (parsed.accel) face += accelLabel(platform);
	if (parsed.ctrl) face += apple ? "⌃" : "ctrl+";
	if (parsed.shift && (parsed.key === null || !SHIFT_AGNOSTIC.has(parsed.key))) face += "⇧";
	if (parsed.alt) face += "⌥";
	if (parsed.key === null) return face.replace(/\+$/, "");
	if (/^[a-z]$/.test(parsed.key)) return face + parsed.key.toUpperCase();
	if (/^[0-9]$/.test(parsed.key)) return face + parsed.key;
	const code = CODE_OF[parsed.key];
	const glyph = code === undefined ? undefined : layoutGlyphs.get(code)?.toUpperCase();
	return face + (glyph ?? FACE_OF[parsed.key] ?? parsed.key);
}

/** Electron's names for the keys whose token is not already one. */
const ACCELERATOR_KEY_OF: Record<string, string> = {
	space: "Space",
	escape: "Escape",
	enter: "Enter",
	tab: "Tab",
	backspace: "Backspace",
	delete: "Delete",
	f2: "F2",
	plus: "Plus",
	minus: "-",
	equals: "=",
	slash: "/",
	comma: ",",
	arrowleft: "Left",
	arrowright: "Right",
	arrowup: "Up",
	arrowdown: "Down",
	bracketleft: "[",
	bracketright: "]",
};

/**
 * The Electron menu accelerator for a combo (`accel+n` is `CmdOrCtrl+N`), so
 * the Mac app's menu wears the register's keys. Undefined where a menu cannot
 * say it: a bare hold, `any`, or a character the layout spells with shift.
 */
export function electronAccelerator(combo: string): string | undefined {
	const parsed = parseCombo(combo);
	if (parsed.key === null || parsed.any) return undefined;
	const key = /^[a-z0-9]$/.test(parsed.key) ? parsed.key.toUpperCase() : ACCELERATOR_KEY_OF[parsed.key];
	if (key === undefined) return undefined;
	const modifiers: string[] = [];
	if (parsed.accel) modifiers.push("CmdOrCtrl");
	if (parsed.ctrl) modifiers.push("Ctrl");
	if (parsed.alt) modifiers.push("Alt");
	if (parsed.shift && !SHIFT_AGNOSTIC.has(parsed.key)) modifiers.push("Shift");
	return [...modifiers, key].join("+");
}
