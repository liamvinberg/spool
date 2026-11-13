import {
	HAND_EVENTS,
	type HandEvent,
	INPUTS_MOST,
	MODS,
	PATH_DEEPEST,
	type SlideInput,
	type SlideInputs,
	type SlidePath,
	VALUE_LONGEST,
} from "../../deck/input-wire";

/**
 * What the presenter does in a live slide, given to the room's copy of it (spool#332). The presenter's stage records
 * the trusted input its live slide on show is given and says it; the room's stage replays it in its own copy of that
 * slide, and nowhere else: the hand's events, the wheel and keys made again there, at the same element, and the results
 * a made event cannot cause set as they stand in the presenter's copy: scroll offsets, what fields hold, the focus.
 * What only the browser's own hand draws (`:hover`, `:active`, `:focus` and the rest) the room's copy is given by a copy
 * of each such rule of its stylesheets that names an attribute the room sets instead.
 */

/** The slide on show in a stage, as input needs it: its copy's box, and whose copy it is. */
export interface OnShow {
	readonly key: string;
	readonly frame: string;
	readonly take: number;
	readonly box: HTMLElement;
}

/** How long after the hand last did something a scroll is still its doing, and said as it goes. */
const HAND_MS = 700;
/** How long a scroll the slide made itself must be still before where it stopped is said. */
const SETTLED_MS = 250;
/** Moves said once a frame, the last of each; a turn of the wheel summed. */
const MOVES = new Set<string>(["pointermove", "mousemove", "drag", "dragover"]);
/** Said once a frame with the moves, in order. */
const CROSSINGS = new Set<string>([
	"pointerover",
	"pointerenter",
	"pointerout",
	"pointerleave",
	"mouseover",
	"mouseenter",
	"mouseout",
	"mouseleave",
	"dragenter",
	"dragleave",
]);

const modsOf = (event: MouseEvent | KeyboardEvent) =>
	(event.shiftKey ? MODS.shift : 0) |
	(event.ctrlKey ? MODS.ctrl : 0) |
	(event.altKey ? MODS.alt : 0) |
	(event.metaKey ? MODS.meta : 0);

const share = (value: number, of: number) => (of > 0 ? Math.min(1, Math.max(0, value / of)) : 0);

/** The talk's screen as the document lays it out: its body, fitted into the viewport. */
let screenBox: DOMRect | undefined;
const screen = (): DOMRect => {
	screenBox ??= document.body.getBoundingClientRect();
	return screenBox;
};
addEventListener("resize", () => {
	screenBox = undefined;
});

/** Where a point of the document stands on the talk's screen, 0 to 1 across and down. */
const onScreen = (clientX: number, clientY: number) => {
	const box = screen();
	return { x: share(clientX - box.left, box.width), y: share(clientY - box.top, box.height) };
};

/** The point of the document at a share of the talk's screen. */
const ofScreen = (x: number, y: number) => {
	const box = screen();
	return { clientX: box.left + x * box.width, clientY: box.top + y * box.height };
};

/** An element's path from `box`, or undefined when it is not inside it. */
export function pathIn(box: Element, target: EventTarget | null): SlidePath | undefined {
	if (!(target instanceof Element) || !box.contains(target)) return undefined;
	const path: number[] = [];
	for (let at: Element = target; at !== box; ) {
		const parent = at.parentElement;
		if (parent === null || path.length >= PATH_DEEPEST) return undefined;
		path.push(Array.prototype.indexOf.call(parent.children, at));
		at = parent;
	}
	return path.reverse();
}

/** The element at `path` in `box`; undefined when the copy has no such element. */
export function elementAt(box: Element, path: SlidePath): Element | undefined {
	let at: Element | undefined = box;
	for (const step of path) {
		at = at.children[step];
		if (at === undefined) return undefined;
	}
	return at;
}

/** Runs `then` once the task running now is done: after whatever the browser does as one event's consequence. */
function afterTask(then: () => void): void {
	const channel = new MessageChannel();
	channel.port1.onmessage = () => {
		channel.port1.close();
		then();
	};
	channel.port2.postMessage(null);
}

// --- the presenter's stage: what its live slide is given ------------------------------------------------------------

export interface InputRecorder {
	/** a slide went on show: a live one's results, as they stand, are said, so the room's copy starts from them */
	shown(): void;
	/** say again where the live slide on show stands, for a room that opened late */
	recall(): void;
	/** a copy let go: one that was given input is said to start over */
	letGo(key: string, frame: string, take: number): void;
}

/** Records the trusted input the live slide on show is given, said through `send`. */
export function recordInput(options: {
	/** the live slide on show, when one is */
	live(): OnShow | undefined;
	send(inputs: SlideInputs): void;
}): InputRecorder {
	/** what each copy's results stand at: its scroll offsets, its fields and its focus, by what they are of */
	const results = new Map<string, Map<string, SlideInput>>();
	/** the copies given input since they were rendered */
	const used = new Set<string>();
	let batch: { on: OnShow; input: SlideInput[] } | undefined;
	let frame = 0;
	let handUntil = 0;
	let clicking = false;
	/** scrolls the slide made itself, said once they have settled */
	const drifting = new Set<Element>();
	let settling: ReturnType<typeof setTimeout> | undefined;

	const flush = () => {
		if (frame !== 0) cancelAnimationFrame(frame);
		frame = 0;
		const was = batch;
		batch = undefined;
		if (was === undefined || was.input.length === 0) return;
		for (let at = 0; at < was.input.length; at += INPUTS_MOST)
			options.send({ frame: was.on.frame, take: was.on.take, input: was.input.slice(at, at + INPUTS_MOST) });
	};
	/** Said at once when `now`, else with the frame's moves: a move replaces the one before it, a wheel's turns add up. */
	const queue = (on: OnShow, input: SlideInput, now: boolean) => {
		if (batch !== undefined && batch.on.key !== on.key) flush();
		batch ??= { on, input: [] };
		used.add(on.key);
		const list = batch.input;
		const last = list.at(-1);
		if (input.kind === "wheel" && last?.kind === "wheel" && same(last.path, input.path)) {
			list[list.length - 1] = { ...input, dx: last.dx + input.dx, dy: last.dy + input.dy };
		} else {
			if (input.kind === "hand" && MOVES.has(input.type)) {
				// where the hand is now, rather than where it was earlier this frame, unless it crossed something since
				let before = list.length - 1;
				while (before >= 0 && !isMove(list[before], input.type)) before--;
				if (before >= 0 && list.slice(before + 1).every((one) => one.kind === "hand" && MOVES.has(one.type)))
					list.splice(before, 1);
			} else if (input.kind === "scroll") {
				const before = list.findIndex((one) => one.kind === "scroll" && same(one.path, input.path));
				if (before >= 0) list.splice(before, 1);
			}
			list.push(input);
		}
		if (now) flush();
		else if (frame === 0) frame = requestAnimationFrame(flush);
	};
	const remember = (on: OnShow, what: string, input: SlideInput) => {
		const held = results.get(on.key) ?? new Map<string, SlideInput>();
		held.set(what, input);
		results.set(on.key, held);
	};
	const sayResults = (on: OnShow | undefined) => {
		const held = on === undefined ? undefined : results.get(on.key);
		if (on === undefined || held === undefined || held.size === 0) return;
		flush();
		batch = { on, input: [...held.values()] };
		flush();
	};
	const hand = (event: Event) => {
		handUntil = event.timeStamp + HAND_MS;
	};

	const heard = (event: Event) => {
		if (!event.isTrusted || !(event instanceof MouseEvent)) return;
		const on = options.live();
		if (on === undefined) return;
		const path = pathIn(on.box, event.target);
		if (path === undefined) return;
		const type = event.type as HandEvent;
		// a click the browser makes of one being made (a label's, its control's) is made again by the room's copy itself
		if (type === "click") {
			if (clicking) return;
			clicking = true;
			afterTask(() => {
				clicking = false;
			});
		}
		if (type === "pointerdown" || type === "pointerup" || event.buttons !== 0) hand(event);
		const related =
			type.endsWith("over") || type.endsWith("out") || type.endsWith("enter") || type.endsWith("leave")
				? pathIn(on.box, event.relatedTarget)
				: undefined;
		queue(
			on,
			{
				kind: "hand",
				type,
				path,
				...onScreen(event.clientX, event.clientY),
				button: Math.max(-1, Math.min(4, event.button)),
				buttons: event.buttons & 31,
				mods: modsOf(event),
				detail: Math.max(0, Math.min(1000, event.detail)),
				...(related === undefined ? {} : { related }),
			},
			!MOVES.has(type) && !CROSSINGS.has(type),
		);
	};
	for (const type of HAND_EVENTS) addEventListener(type, heard, { capture: true, passive: true });

	// the wheel the pen did not take: it scrolls the slide
	addEventListener(
		"wheel",
		(event) => {
			if (!event.isTrusted) return;
			const on = options.live();
			const path = on === undefined ? undefined : pathIn(on.box, event.target);
			if (on === undefined || path === undefined) return;
			hand(event);
			queue(
				on,
				{
					kind: "wheel",
					path,
					...onScreen(event.clientX, event.clientY),
					dx: event.deltaX,
					dy: event.deltaY,
					mode: event.deltaMode,
					mods: modsOf(event),
				},
				false,
			);
		},
		{ capture: true, passive: true },
	);

	const key = (event: KeyboardEvent) => {
		if (!event.isTrusted) return;
		const on = options.live();
		if (on === undefined) return;
		const target = event.target;
		// a slide holding the keys with nothing of it focused hears them in its document
		const path =
			target === document.body || target === document.documentElement || target === document
				? null
				: pathIn(on.box, target);
		if (path === undefined) return;
		hand(event);
		queue(
			on,
			{
				kind: "key",
				type: event.type === "keyup" ? "keyup" : "keydown",
				path,
				key: event.key.slice(0, 64),
				code: event.code.slice(0, 64),
				mods: modsOf(event),
				repeat: event.repeat,
			},
			true,
		);
	};
	addEventListener("keydown", key, { capture: true });
	addEventListener("keyup", key, { capture: true });

	// where it scrolled to: as the hand scrolls it, once a frame; as the slide scrolls itself, once it stops
	const scrolled = (on: OnShow, element: Element) => {
		const path = pathIn(on.box, element);
		if (path === undefined) return undefined;
		const input: SlideInput = { kind: "scroll", path, top: element.scrollTop, left: element.scrollLeft };
		remember(on, `scroll ${path.join(".")}`, input);
		return input;
	};
	addEventListener(
		"scroll",
		(event) => {
			const on = options.live();
			const element = event.target;
			if (on === undefined || !(element instanceof Element) || !on.box.contains(element)) return;
			const input = scrolled(on, element);
			if (input === undefined) return;
			if (event.timeStamp <= handUntil) {
				queue(on, input, false);
				return;
			}
			drifting.add(element);
			clearTimeout(settling);
			settling = setTimeout(() => {
				const now = options.live();
				for (const one of drifting) {
					const settled = now === undefined ? undefined : scrolled(now, one);
					if (now !== undefined && settled !== undefined) queue(now, settled, false);
				}
				drifting.clear();
			}, SETTLED_MS);
		},
		{ capture: true, passive: true },
	);

	// what a field holds, as it changed
	const changed = (event: Event) => {
		if (!event.isTrusted) return;
		const on = options.live();
		const field = event.target;
		if (
			on === undefined ||
			!(
				field instanceof HTMLInputElement ||
				field instanceof HTMLTextAreaElement ||
				field instanceof HTMLSelectElement
			)
		)
			return;
		const path = pathIn(on.box, field);
		if (path === undefined) return;
		const checkable = field instanceof HTMLInputElement && (field.type === "checkbox" || field.type === "radio");
		const input: SlideInput = {
			kind: "value",
			path,
			event: event.type === "change" ? "change" : "input",
			value: field.value.slice(0, VALUE_LONGEST),
			...(checkable ? { checked: field.checked } : {}),
		};
		remember(on, `value ${path.join(".")}`, input);
		queue(on, input, true);
	};
	addEventListener("input", changed, { capture: true });
	addEventListener("change", changed, { capture: true });

	// what has the focus
	addEventListener(
		"focusin",
		(event) => {
			const on = options.live();
			const path = on === undefined ? undefined : pathIn(on.box, event.target);
			if (on === undefined || path === undefined) return;
			const element = event.target as Element;
			const input: SlideInput = { kind: "focus", path, visible: element.matches(":focus-visible") };
			remember(on, "focus", input);
			queue(on, input, true);
		},
		true,
	);
	addEventListener(
		"focusout",
		(event) => {
			const on = options.live();
			if (on === undefined || pathIn(on.box, event.target) === undefined) return;
			if (pathIn(on.box, event.relatedTarget) !== undefined) return;
			const input: SlideInput = { kind: "focus", path: null, visible: false };
			remember(on, "focus", input);
			queue(on, input, true);
		},
		true,
	);

	return {
		shown() {
			flush();
			sayResults(options.live());
		},
		recall() {
			sayResults(options.live());
		},
		letGo(key, frame, take) {
			results.delete(key);
			if (!used.delete(key)) return;
			if (batch?.on.key === key) batch = undefined;
			options.send({ frame, take, input: [{ kind: "afresh" }] });
		},
	};
}

const isMove = (input: SlideInput | undefined, type: string) => input?.kind === "hand" && input.type === type;
const same = (a: SlidePath, b: SlidePath) => a.length === b.length && a.every((step, at) => step === b[at]);

// --- the room's stage: its copy given what the presenter's was --------------------------------------------------------

let replayingNow = false;

/** The room's stage is making an event in its copy just now: what the stage hears of it is no hand's or key's of its own. */
export function replaying(): boolean {
	return replayingNow;
}

export interface InputReplayer {
	/** the presenter's input, for the room's copy of its slide */
	give(inputs: SlideInputs): void;
	/** a copy went on show, or off it: input that waited for it is given now */
	shown(): void;
	/** a copy let go: it starts with nothing of the presenter's */
	letGo(key: string): void;
}

/** The most words of input held for a copy the room has not put on show yet. */
const WAITING_MOST = 64;

/** The element each replayed pointer is held by, as a slide took it. */
const capturedBy = new Map<number, Element>();

/**
 * A slide that takes the pointer as the hand presses it (`setPointerCapture`) is lent the replayed one: no pointer of
 * the room's own is down, so the browser would refuse it, and the slide would throw.
 */
function lendPointerCapture(): void {
	const proto = Element.prototype;
	const set = proto.setPointerCapture;
	const release = proto.releasePointerCapture;
	const has = proto.hasPointerCapture;
	proto.setPointerCapture = function (this: Element, id: number) {
		if (replayingNow) capturedBy.set(id, this);
		else set.call(this, id);
	};
	proto.releasePointerCapture = function (this: Element, id: number) {
		if (capturedBy.get(id) === this) capturedBy.delete(id);
		else release.call(this, id);
	};
	proto.hasPointerCapture = function (this: Element, id: number) {
		return capturedBy.get(id) === this || has.call(this, id);
	};
}

/** Replays the presenter's input in the room's copy of the live slide on show, and only there. */
export function replayInput(options: {
	/** the room's copy of a live slide on show, while the room shows the talk as it is (not black, not held) */
	live(): OnShow | undefined;
	/** the live slide's copy the room is to show next, not on show yet */
	coming(): { readonly frame: string; readonly take: number } | undefined;
	/** the room's copy of this slide and take is let go, if it is not on show, to be rendered afresh */
	afresh(frame: string, take: number): void;
}): InputReplayer {
	lendPointerCapture();
	const used = new Set<string>();
	let waiting: SlideInputs[] = [];
	const marks = new Marks();
	let carried: DataTransfer | undefined;
	let on: OnShow | undefined;

	const give = (inputs: SlideInputs) => {
		const live = options.live();
		// the presenter's copy starts over: the room's does too, unless it is the one on show
		const key = `${inputs.frame}#${inputs.take}`;
		if (inputs.input.some((one) => one.kind === "afresh") && used.has(key) && live?.key !== key) {
			used.delete(key);
			options.afresh(inputs.frame, inputs.take);
		}
		if (live !== undefined && live.frame === inputs.frame && live.take === inputs.take) {
			if (on?.key !== live.key) {
				marks.clear();
				on = live;
			}
			mirrorPseudoClasses();
			used.add(live.key);
			for (const input of inputs.input) replay(live, input);
			return;
		}
		const next = options.coming();
		if (next !== undefined && next.frame === inputs.frame && next.take === inputs.take) {
			waiting = [...waiting, inputs].slice(-WAITING_MOST);
		}
	};

	const replay = (live: OnShow, input: SlideInput) => {
		replayingNow = true;
		try {
			switch (input.kind) {
				case "hand":
					return hand(live, input);
				case "wheel": {
					const target = elementAt(live.box, input.path) ?? pointAt(live.box, input.x, input.y);
					if (target === undefined) return;
					target.dispatchEvent(
						new WheelEvent("wheel", {
							...mouseInit(input.x, input.y, input.mods),
							deltaX: input.dx,
							deltaY: input.dy,
							deltaMode: input.mode,
						}),
					);
					return;
				}
				case "key": {
					// a key the presenter's slide heard with nothing of it focused goes to the slide, never past its box
					const target =
						input.path === null ? (marks.focused(live.box) ?? live.box) : elementAt(live.box, input.path);
					target?.dispatchEvent(
						new KeyboardEvent(input.type, {
							bubbles: true,
							cancelable: true,
							composed: true,
							view: window,
							key: input.key,
							code: input.code,
							repeat: input.repeat,
							...modsInit(input.mods),
						}),
					);
					return;
				}
				case "scroll": {
					const target = elementAt(live.box, input.path);
					if (target !== undefined && (target.scrollTop !== input.top || target.scrollLeft !== input.left))
						target.scrollTo({ top: input.top, left: input.left, behavior: "instant" });
					return;
				}
				case "value":
					return value(elementAt(live.box, input.path), input);
				case "focus":
					return marks.focus(
						live.box,
						input.path === null ? undefined : elementAt(live.box, input.path),
						input.visible,
					);
				case "afresh":
					return;
			}
		} finally {
			replayingNow = false;
		}
	};

	const hand = (live: OnShow, input: Extract<SlideInput, { kind: "hand" }>) => {
		const target = elementAt(live.box, input.path) ?? pointAt(live.box, input.x, input.y);
		if (target === undefined) return;
		const related = input.related === undefined ? null : (elementAt(live.box, input.related) ?? null);
		const crossing = input.type.endsWith("enter") || input.type.endsWith("leave");
		const init: PointerEventInit = {
			...mouseInit(input.x, input.y, input.mods),
			bubbles: !crossing,
			cancelable: !crossing,
			button: input.button,
			buttons: input.buttons,
			detail: input.detail,
			relatedTarget: related,
		};
		if (input.type.startsWith("pointer")) {
			target.dispatchEvent(
				new PointerEvent(input.type, {
					...init,
					pointerId: 1,
					pointerType: "mouse",
					isPrimary: true,
					width: 1,
					height: 1,
					pressure: input.buttons === 0 ? 0 : 0.5,
				}),
			);
		} else if (input.type.startsWith("drag") || input.type === "drop") {
			if (input.type === "dragstart" || carried === undefined) carried = new DataTransfer();
			target.dispatchEvent(new DragEvent(input.type, { ...init, dataTransfer: carried }));
			if (input.type === "dragend") carried = undefined;
		} else {
			target.dispatchEvent(new MouseEvent(input.type, init));
		}
		// what the browser's own hand would draw
		if (input.type === "pointerover" || input.type === "pointermove") marks.hover(live.box, target);
		else if (input.type === "pointerout" && related === null) marks.hover(live.box, undefined);
		if (input.type === "pointerdown" && input.button === 0) marks.press(live.box, target);
		else if (input.type === "pointerup" || input.type === "pointercancel" || input.type === "dragstart")
			marks.press(live.box, undefined);
		if (input.type === "pointerup" || input.type === "pointercancel") capturedBy.delete(1);
	};

	return {
		give,
		shown() {
			const live = options.live();
			if (live?.key !== on?.key) {
				marks.clear();
				on = undefined;
			}
			const held = waiting;
			waiting = [];
			if (live === undefined) return;
			for (const inputs of held) if (inputs.frame === live.frame && inputs.take === live.take) give(inputs);
		},
		letGo(key) {
			used.delete(key);
		},
	};
}

function modsInit(mods: number) {
	return {
		shiftKey: (mods & MODS.shift) !== 0,
		ctrlKey: (mods & MODS.ctrl) !== 0,
		altKey: (mods & MODS.alt) !== 0,
		metaKey: (mods & MODS.meta) !== 0,
	};
}

function mouseInit(x: number, y: number, mods: number): MouseEventInit {
	const { clientX, clientY } = ofScreen(x, y);
	return {
		bubbles: true,
		cancelable: true,
		composed: true,
		view: window,
		clientX,
		clientY,
		screenX: clientX,
		screenY: clientY,
		...modsInit(mods),
	};
}

/** The element of the slide at a place on the talk's screen, when the slide is what is there. */
function pointAt(box: Element, x: number, y: number): Element | undefined {
	const { clientX, clientY } = ofScreen(x, y);
	const found = document.elementFromPoint(clientX, clientY);
	return found !== null && box.contains(found) ? found : undefined;
}

const NATIVE_VALUE = {
	input: Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set,
	checked: Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "checked")?.set,
	textarea: Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set,
	select: Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set,
};

/**
 * A field set to what the presenter's holds, past the value React keeps beside it, and told so as typing tells it: a
 * field React holds hears its change as a change.
 */
function value(field: Element | undefined, input: Extract<SlideInput, { kind: "value" }>): void {
	let differs = false;
	if (field instanceof HTMLInputElement) {
		if (input.checked !== undefined && field.checked !== input.checked) {
			NATIVE_VALUE.checked?.call(field, input.checked);
			differs = true;
		} else if (input.checked === undefined && field.value !== input.value) {
			NATIVE_VALUE.input?.call(field, input.value);
			differs = true;
		}
	} else if (field instanceof HTMLTextAreaElement && field.value !== input.value) {
		NATIVE_VALUE.textarea?.call(field, input.value);
		differs = true;
	} else if (field instanceof HTMLSelectElement && field.value !== input.value) {
		NATIVE_VALUE.select?.call(field, input.value);
		differs = true;
	}
	if (!differs || field === undefined) return;
	field.dispatchEvent(new Event("input", { bubbles: true }));
	if (input.event === "change" || field instanceof HTMLSelectElement)
		field.dispatchEvent(new Event("change", { bubbles: true }));
}

/** The attributes the room's copy is given for what only the browser's own hand draws, by the class each stands for. */
const STANDS_FOR = {
	hover: "data-spool-hover",
	active: "data-spool-active",
	focus: "data-spool-focus",
	"focus-visible": "data-spool-focus-visible",
	"focus-within": "data-spool-focus-within",
} as const;

/** The marks the room's copy carries for the hand, the press and the focus, kept to its box. */
class Marks {
	private hovered: Element[] = [];
	private pressed: Element[] = [];
	private focusedOn: { element: Element; within: Element[]; visible: boolean } | undefined;

	hover(box: Element, target: Element | undefined): void {
		this.hovered = this.mark(STANDS_FOR.hover, this.hovered, box, target);
	}

	press(box: Element, target: Element | undefined): void {
		this.pressed = this.mark(STANDS_FOR.active, this.pressed, box, target);
	}

	focused(box: Element): Element | undefined {
		const element = this.focusedOn?.element;
		return element !== undefined && box.contains(element) ? element : undefined;
	}

	/**
	 * The focus moved to `target`, or away from the slide: the copy hears it leave and arrive as the presenter's did,
	 * and never takes the room's own focus.
	 */
	focus(box: Element, target: Element | undefined, visible: boolean): void {
		const was = this.focusedOn?.element;
		if (was === target && this.focusedOn?.visible === visible) return;
		if (was !== undefined && was !== target) {
			was.dispatchEvent(new FocusEvent("blur", { relatedTarget: target ?? null }));
			was.dispatchEvent(
				new FocusEvent("focusout", { bubbles: true, composed: true, relatedTarget: target ?? null }),
			);
		}
		for (const element of this.focusedOn?.within ?? []) element.removeAttribute(STANDS_FOR["focus-within"]);
		was?.removeAttribute(STANDS_FOR.focus);
		was?.removeAttribute(STANDS_FOR["focus-visible"]);
		this.focusedOn = undefined;
		if (target === undefined) return;
		const within = this.chain(box, target);
		for (const element of within) element.setAttribute(STANDS_FOR["focus-within"], "");
		target.setAttribute(STANDS_FOR.focus, "");
		if (visible) target.setAttribute(STANDS_FOR["focus-visible"], "");
		this.focusedOn = { element: target, within, visible };
		if (was !== target) {
			target.dispatchEvent(new FocusEvent("focus", { relatedTarget: was ?? null }));
			target.dispatchEvent(new FocusEvent("focusin", { bubbles: true, composed: true, relatedTarget: was ?? null }));
		}
	}

	clear(): void {
		for (const element of this.hovered) element.removeAttribute(STANDS_FOR.hover);
		for (const element of this.pressed) element.removeAttribute(STANDS_FOR.active);
		this.hovered = [];
		this.pressed = [];
		const focused = this.focusedOn;
		if (focused === undefined) return;
		for (const element of focused.within) element.removeAttribute(STANDS_FOR["focus-within"]);
		focused.element.removeAttribute(STANDS_FOR.focus);
		focused.element.removeAttribute(STANDS_FOR["focus-visible"]);
		this.focusedOn = undefined;
	}

	/** `target` and what holds it, up to the slide's box and no further. */
	private chain(box: Element, target: Element): Element[] {
		const chain: Element[] = [];
		for (let at: Element | null = target; at !== null && box.contains(at); at = at.parentElement) {
			chain.push(at);
			if (at === box) break;
		}
		return chain;
	}

	private mark(name: string, was: Element[], box: Element, target: Element | undefined): Element[] {
		const now = target === undefined ? [] : this.chain(box, target);
		if (now.length === was.length && now.every((element, at) => element === was[at])) return was;
		const keep = new Set(now);
		for (const element of was) if (!keep.has(element)) element.removeAttribute(name);
		for (const element of now) element.setAttribute(name, "");
		return now;
	}
}

/** The sheets whose rules have their copies, each once. */
const mirrored = new WeakSet<CSSStyleSheet>();
const PSEUDO = /:(hover|active|focus-visible|focus-within|focus)(?![\w-])/g;

/**
 * Each rule of the document's stylesheets that matches by the hand, the press or the focus (`:hover`, `:active`,
 * `:focus`, `:focus-visible`, `:focus-within`) gets a copy beside it that matches by the attribute the room sets
 * instead: what a made event can never cause, the copy draws. A sheet is copied the first time the room replays
 * anything once it is in the document, and never again.
 */
export function mirrorPseudoClasses(): void {
	const sheets = [...document.styleSheets, ...(document.adoptedStyleSheets ?? [])];
	for (const sheet of sheets) {
		if (mirrored.has(sheet)) continue;
		mirrored.add(sheet);
		try {
			mirrorRules(sheet.cssRules, (text, at) => sheet.insertRule(text, at));
		} catch {
			// a sheet of another origin keeps its rules to itself
		}
	}
}

/** The selector with each such class standing for its attribute, or undefined when it names none. */
export function mirroredSelector(selector: string): string | undefined {
	PSEUDO.lastIndex = 0;
	if (!PSEUDO.test(selector)) return undefined;
	return selector.replace(PSEUDO, (_, name: keyof typeof STANDS_FOR) => `[${STANDS_FOR[name]}]`);
}

function mirrorRules(rules: CSSRuleList, insert: (text: string, at: number) => void): void {
	for (let at = rules.length - 1; at >= 0; at--) {
		const rule = rules[at];
		if (rule === undefined) continue;
		const nested = (rule as CSSRule & { cssRules?: CSSRuleList }).cssRules;
		const into = (rule as CSSRule & { insertRule?: (text: string, at: number) => number }).insertRule;
		if (nested !== undefined && typeof into === "function")
			mirrorRules(nested, (text, index) => into.call(rule, text, index));
		if (!(rule instanceof CSSStyleRule)) continue;
		const selector = mirroredSelector(rule.selectorText);
		if (selector === undefined || !rule.cssText.startsWith(rule.selectorText)) continue;
		try {
			insert(selector + rule.cssText.slice(rule.selectorText.length), at + 1);
		} catch {
			// a selector the attribute cannot stand in (a scrollbar's own part): the room goes without it
		}
	}
}
