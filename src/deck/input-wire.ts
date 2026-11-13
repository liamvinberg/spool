/**
 * What the presenter does in a live slide, as the room's copy of the slide is given it (spool#332). The presenter's
 * stage reports the input its copy of the live slide on show is given, and the room's stage replays it in its own copy
 * of that slide: the causes (the hand over it, its buttons, the wheel, keys) as events made there, and the results a
 * made event cannot cause (a scroll offset, what a field holds, which element has the focus) set as they stand in the
 * presenter's copy. An element is named by its path from the slide's box, a position as a share of the talk's screen.
 *
 * Every word is checked where it is heard: the stage that says it runs slide code and can be made to say anything.
 */

/** An element of a slide's copy: the place of each element among its parent's children, from the slide's box down. */
export type SlidePath = readonly number[];

/** The hand's events a copy is given as the presenter's was: pointer, mouse and drag events. */
export const HAND_EVENTS = [
	"pointerover",
	"pointerenter",
	"pointerdown",
	"pointermove",
	"pointerup",
	"pointercancel",
	"pointerout",
	"pointerleave",
	"mouseover",
	"mouseenter",
	"mousedown",
	"mousemove",
	"mouseup",
	"mouseout",
	"mouseleave",
	"click",
	"dblclick",
	"auxclick",
	"contextmenu",
	"dragstart",
	"drag",
	"dragenter",
	"dragover",
	"dragleave",
	"drop",
	"dragend",
] as const;

export type HandEvent = (typeof HAND_EVENTS)[number];

/** Shift, Control, Alt and Meta held, as bits. */
export const MODS = { shift: 1, ctrl: 2, alt: 4, meta: 8 } as const;

export type SlideInput =
	/** the hand over the slide: on what, where on the talk's screen (0 to 1 across and down), and what it holds down */
	| {
			readonly kind: "hand";
			readonly type: HandEvent;
			readonly path: SlidePath;
			readonly x: number;
			readonly y: number;
			readonly button: number;
			readonly buttons: number;
			readonly mods: number;
			readonly detail: number;
			/** the element the hand came from or went to, for over and out, when it is in the slide */
			readonly related?: SlidePath;
	  }
	/** the wheel turned over the slide, by this much, in the unit `mode` names */
	| {
			readonly kind: "wheel";
			readonly path: SlidePath;
			readonly x: number;
			readonly y: number;
			readonly dx: number;
			readonly dy: number;
			readonly mode: number;
			readonly mods: number;
	  }
	/** a key pressed or let go in the slide; `path` null: in its document, nothing of the slide holding the focus */
	| {
			readonly kind: "key";
			readonly type: "keydown" | "keyup";
			readonly path: SlidePath | null;
			readonly key: string;
			readonly code: string;
			readonly mods: number;
			readonly repeat: boolean;
	  }
	/** an element of the slide scrolled to here, in px */
	| { readonly kind: "scroll"; readonly path: SlidePath; readonly top: number; readonly left: number }
	/** what a field of the slide holds, as `event` said it changed */
	| {
			readonly kind: "value";
			readonly path: SlidePath;
			readonly event: "input" | "change";
			readonly value: string;
			readonly checked?: boolean;
	  }
	/** the element of the slide that has the focus, and whether it shows it; null once nothing of the slide has */
	| { readonly kind: "focus"; readonly path: SlidePath | null; readonly visible: boolean }
	/** the presenter's copy was rendered afresh after it was used: the room's goes too, and both start over */
	| { readonly kind: "afresh" };

/** The input a live slide's copy was given, said in order: whose it is and what. */
export interface SlideInputs {
	/** the slide, by its frame, and its take */
	readonly frame: string;
	readonly take: number;
	readonly input: readonly SlideInput[];
}

/** The most inputs one word carries, the deepest path, the longest field value and key name a copy is given. */
export const INPUTS_MOST = 64;
export const PATH_DEEPEST = 128;
export const VALUE_LONGEST = 65_536;
const NAME_LONGEST = 64;
const FRAME_LONGEST = 1024;
/** No scroll offset, wheel turn or count is larger than this. */
const MOST = 10_000_000;

type Loose = Record<string, unknown>;

const isRecord = (value: unknown): value is Loose =>
	typeof value === "object" && value !== null && !Array.isArray(value);
const isCount = (value: unknown, most = MOST): value is number =>
	typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= most;
const isShare = (value: unknown): value is number =>
	typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
const isAmount = (value: unknown): value is number =>
	typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= MOST;
const isName = (value: unknown): value is string => typeof value === "string" && value.length <= NAME_LONGEST;
const HANDS = new Set<string>(HAND_EVENTS);

function parsePath(value: unknown): SlidePath | undefined {
	if (!Array.isArray(value) || value.length > PATH_DEEPEST) return undefined;
	return value.every((step) => isCount(step, 100_000)) ? (value as number[]) : undefined;
}

/** One input, checked; undefined when it is not one. */
export function parseSlideInput(value: unknown): SlideInput | undefined {
	if (!isRecord(value)) return undefined;
	switch (value.kind) {
		case "hand": {
			const path = parsePath(value.path);
			const related = value.related === undefined ? undefined : parsePath(value.related);
			if (path === undefined || (value.related !== undefined && related === undefined)) return undefined;
			if (typeof value.type !== "string" || !HANDS.has(value.type)) return undefined;
			// a pointer that moves changes no button: its button is -1
			const button = value.button;
			if (typeof button !== "number" || !Number.isInteger(button) || button < -1 || button > 4) return undefined;
			if (!isShare(value.x) || !isShare(value.y) || !isCount(value.buttons, 31)) return undefined;
			if (!isCount(value.mods, 15) || !isCount(value.detail, 1000)) return undefined;
			return {
				kind: "hand",
				type: value.type as HandEvent,
				path,
				x: value.x,
				y: value.y,
				button,
				buttons: value.buttons,
				mods: value.mods,
				detail: value.detail,
				...(related === undefined ? {} : { related }),
			};
		}
		case "wheel": {
			const path = parsePath(value.path);
			if (path === undefined || !isShare(value.x) || !isShare(value.y)) return undefined;
			if (!isAmount(value.dx) || !isAmount(value.dy) || !isCount(value.mode, 2) || !isCount(value.mods, 15))
				return undefined;
			return {
				kind: "wheel",
				path,
				x: value.x,
				y: value.y,
				dx: value.dx,
				dy: value.dy,
				mode: value.mode,
				mods: value.mods,
			};
		}
		case "key": {
			const path = value.path === null ? null : parsePath(value.path);
			if (path === undefined || (value.type !== "keydown" && value.type !== "keyup")) return undefined;
			if (!isName(value.key) || !isName(value.code) || !isCount(value.mods, 15) || typeof value.repeat !== "boolean")
				return undefined;
			return {
				kind: "key",
				type: value.type,
				path,
				key: value.key,
				code: value.code,
				mods: value.mods,
				repeat: value.repeat,
			};
		}
		case "scroll": {
			const path = parsePath(value.path);
			if (path === undefined || !isAmount(value.top) || !isAmount(value.left)) return undefined;
			return { kind: "scroll", path, top: value.top, left: value.left };
		}
		case "value": {
			const path = parsePath(value.path);
			if (path === undefined || (value.event !== "input" && value.event !== "change")) return undefined;
			if (typeof value.value !== "string" || value.value.length > VALUE_LONGEST) return undefined;
			if (value.checked !== undefined && typeof value.checked !== "boolean") return undefined;
			return {
				kind: "value",
				path,
				event: value.event,
				value: value.value,
				...(typeof value.checked === "boolean" ? { checked: value.checked } : {}),
			};
		}
		case "focus": {
			const path = value.path === null ? null : parsePath(value.path);
			if (path === undefined || typeof value.visible !== "boolean") return undefined;
			return { kind: "focus", path, visible: value.visible };
		}
		case "afresh":
			return { kind: "afresh" };
		default:
			return undefined;
	}
}

/** A word of input, checked whole: one input that is not one, and the word is none. */
export function parseSlideInputs(value: unknown): SlideInputs | undefined {
	if (!isRecord(value) || typeof value.frame !== "string" || value.frame.length > FRAME_LONGEST) return undefined;
	if (!isCount(value.take) || !Array.isArray(value.input) || value.input.length > INPUTS_MOST) return undefined;
	const input: SlideInput[] = [];
	for (const one of value.input) {
		const parsed = parseSlideInput(one);
		if (parsed === undefined) return undefined;
		input.push(parsed);
	}
	return { frame: value.frame, take: value.take, input };
}
