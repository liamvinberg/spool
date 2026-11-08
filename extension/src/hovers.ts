/**
 * What the site's own script changes on the page as the hand moves over it, watched while the picker is open, so a
 * reference can do it again with no script of the site's. CSS `:hover` comes with the sheets; this is the rest: a card
 * that sets `data-active` on its media, a player that fades its controls in from a style, a video that plays as the
 * hand comes and stops as it goes.
 *
 * A change counts when it starts just after the hand came onto something, not just after a scroll, and an element
 * that changes while the hand is still (a progress bar, a carousel on a timer) never counts again. It is the hover of
 * the nearest box holding both the hand and what changed, and is known for sure once it went back as the hand left.
 * One under way when the page is taken goes into the reference at rest, as it was before the hand came.
 */

/** an element's attribute, or `:playing` for a video: "1" while it plays */
type Value = string | null;

interface Change {
	el: Element;
	name: string;
	/** what it was before the hand came */
	rest: Value;
	/** what the hand made it, as it last stood while the hand was on the trigger */
	hover: Value;
	trigger: Element;
	/** when the hand came onto what set it off: the changes one coming sets off share the box they are the hover of */
	came: number;
	/** the hand has left the trigger and it hasn't gone back yet */
	left: boolean;
}

/** What a capture reads: per element, what the hand changes and what it rests at, and the triggers by id. */
export interface Hovers {
	/** `[trigger id, name, value while hovered]`, for each change the element takes */
	sets: Map<Element, Array<[string, string, Value]>>;
	/** the values to write for an element hovered as it is taken, instead of the ones it has now */
	rest: Map<Element, Map<string, Value>>;
	triggers: Map<Element, string>;
}

export interface HoverWatch {
	read(): Hovers;
	stop(): void;
}

/** how soon after the hand comes onto something a change counts as its doing */
const SOON_MS = 700;
/** how long the hand is still before a change can't be its doing */
const STILL_MS = 1200;
/** how long after a scroll a change is the scroll's doing (a reveal, a lazy image) */
const SCROLL_MS = 400;
/** what loading changes, never the hand */
const LOADING = new Set(["src", "srcset", "sizes", "loading", "decoding", "preload", "poster", "fetchpriority"]);
/** how many elements' changes are kept at most, so a busy page can't grow them forever */
const MOST = 2000;

export function watchHovers(doc: Document, ignore: (el: Element) => boolean = () => false): HoverWatch {
	const view = doc.defaultView;
	let at: Element | null = null;
	let came = Number.NEGATIVE_INFINITY;
	let moved = Number.NEGATIVE_INFINITY;
	let scrolled = Number.NEGATIVE_INFINITY;
	const pending = new Map<Element, Map<string, Change>>();
	const known = new Map<Element, Map<string, Change>>();
	const noisy = new WeakMap<Element, Set<string>>();

	const take = (map: Map<Element, Map<string, Change>>, el: Element, name: string) => {
		const of = map.get(el);
		const one = of?.get(name);
		of?.delete(name);
		if (of?.size === 0) map.delete(el);
		return one;
	};
	const put = (map: Map<Element, Map<string, Change>>, change: Change) => {
		slot(map, change.el, () => new Map<string, Change>()).set(change.name, change);
	};

	const changed = (el: Element, name: string, was: Value, now: Value) => {
		if (same(name, was, now) || LOADING.has(name) || name.startsWith("data-spool-") || ignore(el)) return;
		if (noisy.get(el)?.has(name)) return;
		const t = performance.now();
		if (t - moved > STILL_MS) {
			// it moves on its own
			slot(noisy, el, () => new Set<string>()).add(name);
			take(pending, el, name);
			take(known, el, name);
			return;
		}
		const under = pending.get(el)?.get(name);
		if (under === undefined) {
			if (at === null || t - came > SOON_MS || t - scrolled < SCROLL_MS || pending.size + known.size >= MOST) return;
			let trigger = common(at, el);
			if (trigger === null || !small(trigger, view)) return;
			const together = [...pending.values()].flatMap((of) => [...of.values()]).filter((one) => one.came === came);
			for (const one of together) {
				const both = common(one.trigger, trigger);
				if (both !== null && small(both, view)) trigger = both;
			}
			for (const one of together) if (holds(trigger, one.trigger)) one.trigger = trigger;
			put(pending, { el, name, rest: was, hover: now, trigger, came, left: false });
			return;
		}
		if (same(name, now, under.rest)) {
			take(pending, el, name);
			if (under.left) put(known, under);
			return;
		}
		if (!under.left) under.hover = now;
	};

	const watcher = new MutationObserver((records) => {
		// several records of one attribute in a batch: each one's new value is the next one's old
		for (let i = 0; i < records.length; i++) {
			const r = records[i] as MutationRecord;
			const name = r.attributeName;
			if (name === null || !(r.target instanceof Element)) continue;
			let now: Value | undefined;
			for (let j = i + 1; j < records.length && now === undefined; j++) {
				const next = records[j] as MutationRecord;
				if (next.target === r.target && next.attributeName === name) now = next.oldValue;
			}
			changed(r.target, name, r.oldValue, now === undefined ? r.target.getAttribute(name) : now);
		}
	});
	watcher.observe(doc.documentElement, { attributes: true, attributeOldValue: true, subtree: true });

	const over = (e: Event) => {
		const target = e.composedPath()[0];
		if (!(target instanceof Element) || ignore(target)) return;
		at = target;
		came = performance.now();
		moved = came;
		for (const of of pending.values())
			for (const one of of.values()) if (at !== null && holds(one.trigger, at)) one.left = false;
	};
	const out = (e: Event) => {
		const to = (e as PointerEvent).relatedTarget;
		at = to instanceof Element ? to : null;
		moved = performance.now();
		for (const of of pending.values())
			for (const one of of.values()) if (at === null || !holds(one.trigger, at)) one.left = true;
	};
	const move = () => {
		moved = performance.now();
	};
	const scroll = () => {
		scrolled = performance.now();
	};
	const play = (e: Event) => {
		if (e.target instanceof HTMLMediaElement) changed(e.target, ":playing", null, "1");
	};
	const pause = (e: Event) => {
		if (e.target instanceof HTMLMediaElement) changed(e.target, ":playing", "1", null);
	};
	const listeners: Array<[EventTarget, string, (e: Event) => void]> = [
		[doc, "pointerover", over],
		[doc, "pointerout", out],
		[doc, "pointermove", move],
		[doc, "scroll", scroll],
		[doc, "play", play],
		[doc, "pause", pause],
	];
	for (const [target, type, fn] of listeners) target.addEventListener(type, fn, { capture: true, passive: true });

	return {
		read() {
			const triggers = new Map<Element, string>();
			const sets = new Map<Element, Array<[string, string, Value]>>();
			const rest = new Map<Element, Map<string, Value>>();
			const id = (trigger: Element) => {
				return slot(triggers, trigger, () => `h${triggers.size + 1}`);
			};
			const add = (one: Change) => {
				slot(sets, one.el, () => []).push([id(one.trigger), one.name, one.hover]);
			};
			for (const of of known.values()) {
				for (const one of of.values()) if (pending.get(one.el)?.has(one.name) !== true) add(one);
			}
			// under way now: taken at rest, and the hand's value kept for its hover
			for (const of of pending.values()) {
				for (const one of of.values()) {
					add(one);
					slot(rest, one.el, () => new Map<string, Value>()).set(one.name, one.rest);
				}
			}
			return { sets, rest, triggers };
		},
		stop() {
			watcher.disconnect();
			for (const [target, type, fn] of listeners) target.removeEventListener(type, fn, { capture: true });
		},
	};
}

/** what a map holds for a key, put there first when it holds nothing */
function slot<K extends object, V>(map: Map<K, V> | WeakMap<K, V>, key: K, make: () => V): V {
	const had = map.get(key);
	if (had !== undefined) return had;
	const made = make();
	map.set(key, made);
	return made;
}

/** the same value, a style written another way (`opacity:0` and `opacity: 0;`) included */
function same(name: string, a: Value, b: Value): boolean {
	if (a === b) return true;
	if (a === null || b === null || name !== "style") return false;
	const plain = (s: string) => s.replace(/\s+/g, "").replace(/;+$/, "");
	return plain(a) === plain(b);
}

/** the nearest element holding both, across shadow roots; null past the body */
function common(a: Element, b: Element): Element | null {
	for (let n: Element | null = b; n !== null; n = up(n)) {
		if (n.localName === "body" || n.localName === "html" || n.localName === "head") return null;
		if (holds(n, a)) return n;
	}
	return null;
}

function up(n: Element): Element | null {
	if (n.parentElement !== null) return n.parentElement;
	const root = n.getRootNode();
	return root instanceof ShadowRoot ? root.host : null;
}

function holds(box: Element, el: Element): boolean {
	for (let n: Element | null = el; n !== null; n = up(n)) if (n === box) return true;
	return false;
}

/** a box the hand can be said to hover: no bigger than a good part of the window */
function small(el: Element, view: Window | null): boolean {
	if (view === null) return true;
	const r = el.getBoundingClientRect();
	return r.width * r.height <= view.innerWidth * view.innerHeight * 0.5;
}
