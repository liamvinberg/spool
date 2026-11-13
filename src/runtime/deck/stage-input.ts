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
 * What only the browser's own hand draws (`:hover`, `:active`, `:focus` and the rest) the room's stage draws by an
 * attribute it sets instead, each such rule of its stylesheets rewritten to name it.
 */

/** The slide on show in a stage, as input needs it: its copy's box, and whose copy it is. */
export interface OnShow {
	readonly key: string;
	readonly frame: string;
	readonly take: number;
	readonly box: HTMLElement;
}

/** A copy of a slide, by its frame and the take it was rendered for: the stage's key for it. */
export const copyKey = (frame: string, take: number): string => `${frame}#${take}`;

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
	/** the elements of each copy that scrolled, and whether its focus was ever said: what its standing is read from */
	const scrolledIn = new Map<string, Map<string, SlidePath>>();
	const focusSaid = new Set<string>();
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
	/**
	 * Where the copy stands now, as results: the offsets of what scrolled, what every field holds and where the focus is,
	 * read from the copy itself, so a field emptied by the slide's own code is said empty.
	 */
	const standing = (on: OnShow): SlideInput[] => {
		const said: SlideInput[] = [];
		const scrolled = scrolledIn.get(on.key);
		for (const [what, path] of scrolled ?? []) {
			const element = elementAt(on.box, path);
			if (element === undefined) scrolled?.delete(what);
			else said.push({ kind: "scroll", path, top: element.scrollTop, left: element.scrollLeft });
		}
		for (const field of on.box.querySelectorAll("input, textarea, select")) {
			const input = fieldValue(on, field, "input");
			if (input !== undefined) said.push(input);
		}
		const focused = pathIn(on.box, document.activeElement);
		if (focused !== undefined || focusSaid.has(on.key)) {
			const visible = focused !== undefined && document.activeElement?.matches(":focus-visible") === true;
			said.push({ kind: "focus", path: focused ?? null, visible });
		}
		return said;
	};
	const sayStanding = (on: OnShow | undefined) => {
		if (on === undefined) return;
		const said = standing(on);
		if (said.length === 0) return;
		flush();
		batch = { on, input: said };
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
		const held = scrolledIn.get(on.key) ?? new Map<string, SlidePath>();
		held.set(path.join("."), path);
		scrolledIn.set(on.key, held);
		const input: SlideInput = { kind: "scroll", path, top: element.scrollTop, left: element.scrollLeft };
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
		const input =
			on === undefined ? undefined : fieldValue(on, event.target, event.type === "change" ? "change" : "input");
		if (on !== undefined && input !== undefined) queue(on, input, true);
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
			focusSaid.add(on.key);
			queue(on, { kind: "focus", path, visible: element.matches(":focus-visible") }, true);
		},
		true,
	);
	addEventListener(
		"focusout",
		(event) => {
			const on = options.live();
			if (on === undefined || pathIn(on.box, event.target) === undefined) return;
			if (pathIn(on.box, event.relatedTarget) !== undefined) return;
			queue(on, { kind: "focus", path: null, visible: false }, true);
		},
		true,
	);

	return {
		shown() {
			flush();
			// read once the frame showing it has been laid out and painted, never inside the step
			const on = options.live();
			if (on !== undefined)
				requestAnimationFrame(() =>
					afterTask(() => (options.live()?.key === on.key ? sayStanding(on) : undefined)),
				);
		},
		recall() {
			sayStanding(options.live());
		},
		letGo(key, frame, take) {
			scrolledIn.delete(key);
			focusSaid.delete(key);
			if (!used.delete(key)) return;
			if (batch?.on.key === key) batch = undefined;
			options.send({ frame, take, input: [{ kind: "afresh" }] });
		},
	};
}

/** What a field of the copy holds, as a result to say: undefined for no field of it, and for a file's, no copy can be given. */
function fieldValue(on: OnShow, field: EventTarget | null, event: "input" | "change"): SlideInput | undefined {
	if (
		!(
			field instanceof HTMLInputElement ||
			field instanceof HTMLTextAreaElement ||
			field instanceof HTMLSelectElement
		) ||
		(field instanceof HTMLInputElement && field.type === "file")
	)
		return undefined;
	const path = pathIn(on.box, field);
	if (path === undefined) return undefined;
	return {
		kind: "value",
		path,
		event,
		value: field.value.slice(0, VALUE_LONGEST),
		...(checkable(field) ? { checked: (field as HTMLInputElement).checked } : {}),
	};
}

const checkable = (field: Element) =>
	field instanceof HTMLInputElement && (field.type === "checkbox" || field.type === "radio");

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

/**
 * How much input is held for a copy the room has not put on show yet, or while it holds its picture, the oldest let go
 * past it: each input weighs one, and a field's value one more for every 256 characters it holds.
 */
const WAITING_MOST = 16_384;
const weigh = (inputs: SlideInputs) =>
	inputs.input.reduce((sum, one) => sum + 1 + (one.kind === "value" ? Math.floor(one.value.length / 256) : 0), 0);

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
	let waitingWeight = 0;
	const marks = new Marks();
	let carried: DataTransfer | undefined;
	let on: OnShow | undefined;
	keepFocus(() => {
		const live = options.live();
		return live === undefined ? undefined : { box: live.box, marks };
	});

	const give = (inputs: SlideInputs) => {
		const live = options.live();
		// the presenter's copy starts over: the room's does too, unless it is the one on show
		const key = copyKey(inputs.frame, inputs.take);
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
		if (next === undefined || next.frame !== inputs.frame || next.take !== inputs.take) return;
		waiting.push(inputs);
		waitingWeight += weigh(inputs);
		while (waitingWeight > WAITING_MOST && waiting.length > 1) waitingWeight -= weigh(waiting.shift() as SlideInputs);
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
		} catch {
			// an input the copy cannot take (a value its field refuses) leaves the rest to be given
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
			// given to the copy now on show, held again for the one still to come, let go for any other
			const held = waiting;
			waiting = [];
			waitingWeight = 0;
			for (const inputs of held) give(inputs);
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
	// a field typed in or slid changes after the value it was given already stands: its change is heard all the same.
	// A box ticked is heard as the copy's own click ticked it, a choice from a list as its value was set, and only then.
	const changes = input.event === "change" || field instanceof HTMLSelectElement;
	if (field === undefined || (!differs && !(input.event === "change" && typedIn(field)))) return;
	if (differs) field.dispatchEvent(new Event("input", { bubbles: true }));
	if (changes) field.dispatchEvent(new Event("change", { bubbles: true }));
}

const typedIn = (field: Element) =>
	field instanceof HTMLTextAreaElement || (field instanceof HTMLInputElement && !checkable(field));

/**
 * In the room's copy of the live slide on show, the slide's own call to focus or blur (as a click it was given makes it)
 * moves the copy's focus marks, and never the window's focus: a stage with it takes the room's keys, which are the
 * talk's. Where the presenter's copy put its focus comes as a result all the same.
 */
function keepFocus(live: () => { box: Element; marks: Marks } | undefined): void {
	for (const proto of [HTMLElement.prototype, SVGElement.prototype]) {
		const focus = proto.focus;
		const blur = proto.blur;
		proto.focus = function (this: HTMLElement | SVGElement, options?: FocusOptions) {
			const on = live();
			if (on === undefined || !on.box.contains(this)) return focus.call(this, options);
			if (this.tabIndex >= 0 || this.hasAttribute("tabindex")) on.marks.focus(on.box, this, typedIn(this));
		};
		proto.blur = function (this: HTMLElement | SVGElement) {
			const on = live();
			if (on === undefined || !on.box.contains(this)) return blur.call(this);
			if (on.marks.focused(on.box) === this) on.marks.focus(on.box, undefined, false);
		};
	}
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
		this.unfocus();
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
		this.unfocus();
	}

	/** The focus's marks taken off, and no events: the caller says whatever is to be heard. */
	private unfocus(): void {
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

/** The sheets whose rules are rewritten, each once. */
const mirrored = new WeakSet<CSSStyleSheet>();
const PSEUDO = /:(hover|active|focus-visible|focus-within|focus)(?![\w-])/g;

/**
 * Each rule of the room stage's stylesheets that matches by the hand, the press or the focus (`:hover`, `:active`,
 * `:focus`, `:focus-visible`, `:focus-within`) is rewritten to match by the attribute the room sets instead: what a
 * made event can never cause, the copy draws, and a rule that matches by their absence (`:not(:hover)`) stops matching
 * as the presenter's stops. The room's stage has no hand or focus of its own to lose by it. A sheet is rewritten the
 * first time the room replays anything once it is in the document, and never again.
 */
export function mirrorPseudoClasses(): void {
	const sheets = [...document.styleSheets, ...(document.adoptedStyleSheets ?? [])];
	for (const sheet of sheets) {
		if (mirrored.has(sheet)) continue;
		mirrored.add(sheet);
		try {
			mirrorRules(sheet.cssRules);
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

function mirrorRules(rules: CSSRuleList): void {
	for (const rule of rules) {
		const nested = (rule as CSSRule & { cssRules?: CSSRuleList }).cssRules;
		if (nested !== undefined) mirrorRules(nested);
		if (!(rule instanceof CSSStyleRule)) continue;
		const selector = mirroredSelector(rule.selectorText);
		// a selector the attribute cannot stand in (a scrollbar's own part) is refused, and the rule kept as it was
		if (selector !== undefined) rule.selectorText = selector;
	}
}
