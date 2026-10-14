import { collapsedWords } from "../../daemon/edit-words";
import { comboMatches } from "../../ui/hotkey-combos";
import { shimConfig } from "./natives";
import { chainOf, elementFor, type Hit, ownerOf, wholeReturn } from "./pick";

/**
 * The in-place text edit (#255): the element itself becomes the field.
 *
 * A hand edits the words where they are drawn rather than in a box
 * somewhere else, so the element is made editable, focused, and given the
 * caret at the point that was clicked. Enter, Esc and a click away all
 * finish it and save (#339).
 *
 * While an edit is open the shim swallows the keys and the presses before
 * frame code sees them. That is not the chrome bending the frame: the
 * keystrokes are the edit's, and a prototype that binds a bare letter to a
 * drawer would otherwise open one on every word typed into it. The default
 * actions are untouched, which is what puts the characters in and moves the
 * caret. Nothing else about the document changes, and the attribute comes
 * off the moment the edit ends.
 *
 * And the structural gesture (#317, #340): elements out of the document or one
 * beside another, each held by the ask that made it so undo and redo put the
 * very nodes back.
 */

/** An element's child nodes as they stand, the words of each text node with it. */
interface Snapshot {
	node: ChildNode;
	text: string | null;
	children: Snapshot[];
}

interface Pinned {
	name: string;
	value: string;
	priority: string;
}

interface Editing {
	el: HTMLElement;
	id: unknown;
	composing: boolean;
	finish: boolean;
	text: string;
	before: Snapshot[];
	pinned: Pinned[];
	editable: string | null;
	spellcheck: string | null;
}

/** What a commit says of the words: text nodes and inline elements alike. */
type WordNode = { text: string } | { tag: string; nodes: WordNode[] };

let editing: Editing | null = null;
let swallowUntilClick = false;
const editingKeys = new Set<string>();
// the edits this document has committed, by ask: the words before and after
// each, held as the very nodes React owns, so undo and redo put back the
// same objects rather than a copy React would go on updating blind (#314)
const edits = new Map<unknown, { el: HTMLElement; before: Snapshot[]; after: Snapshot[] }>();
const EDITS_HELD = 100;

// what a bounded map does when it fills: the oldest ask goes, because a
// document held open all day must not grow one entry per keystroke
function evictOldest(held: Map<unknown, unknown>): void {
	for (const key of held.keys()) {
		if (held.size <= EDITS_HELD) break;
		held.delete(key);
	}
}

// The properties an open edit must not be allowed to decide (#324).
//
// Chromium's rule for [contenteditable] hands the element break-word
// wrapping, pre-wrap whitespace and a focus outline drawn round whatever
// that reflow produced. The element's box is the thing the ring is drawn
// round, so it is pinned at the values it was already drawn with and let
// go again when the edit ends.
const EDIT_PINNED = ["overflow-wrap", "word-break", "line-break", "white-space", "outline"];

function pinLayout(el: HTMLElement): Pinned[] {
	const style = getComputedStyle(el);
	const held: Pinned[] = [];
	for (const name of EDIT_PINNED) {
		held.push({ name, value: el.style.getPropertyValue(name), priority: el.style.getPropertyPriority(name) });
		el.style.setProperty(name, style.getPropertyValue(name), "important");
	}
	return held;
}

function unpinLayout(el: HTMLElement, held: readonly Pinned[]): void {
	for (const one of held) {
		if (one.value === "") el.style.removeProperty(one.name);
		else el.style.setProperty(one.name, one.value, one.priority);
	}
}

// every text node under the element, in document order
function textNodesOf(el: Element): Text[] {
	const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
	const nodes: Text[] = [];
	for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node as Text);
	return nodes;
}

// the words the element is already drawing, written back as its own, so the
// pre-wrap an open edit forces has no source line break left to draw. The
// collapsing rule is written and tested once in daemon/edit-words.ts
function settleWords(el: Element): void {
	const nodes = textNodesOf(el);
	const collapsed = collapsedWords(nodes.map((node) => node.nodeValue || ""));
	for (let i = 0; i < nodes.length; i++) {
		const node = nodes[i] as Text;
		if (node.nodeValue !== collapsed[i]) node.nodeValue = collapsed[i] as string;
	}
}

export function beginEdit(selector: string, x: unknown, y: unknown, id: unknown): void {
	endEdit(false);
	const frame = shimConfig().frame;
	const el = elementFor(selector) as HTMLElement | null;
	if (!el) {
		parent.postMessage({ spool: "edit-open", frame, id, ok: false, text: "" }, "*");
		return;
	}
	// the snapshot is of the words the file wrote; the collapse and the pin
	// are what the caret arrives into, and both come off at the end
	const before = snapshotOf(el);
	settleWords(el);
	const pinned = pinLayout(el);
	editing = {
		el,
		id,
		composing: false,
		finish: false,
		text: wordsOf(nodesOf(el)),
		before,
		pinned,
		editable: el.getAttribute("contenteditable"),
		spellcheck: el.getAttribute("spellcheck"),
	};
	el.setAttribute("contenteditable", "plaintext-only");
	el.setAttribute("spellcheck", "false");
	try {
		el.focus({ preventScroll: true });
	} catch {
		try {
			el.focus();
		} catch {}
	}
	try {
		caretAt(el, x, y);
	} catch {}
	parent.postMessage({ spool: "edit-open", frame, id, ok: true, text: editing.text }, "*");
}

export function endEdit(commit: boolean): void {
	if (!editing) return;
	if (commit && editing.composing) {
		editing.finish = true;
		return;
	}
	const held = editing;
	editing = null;
	const el = held.el;
	if (held.editable === null) el.removeAttribute("contenteditable");
	else el.setAttribute("contenteditable", held.editable);
	if (held.spellcheck === null) el.removeAttribute("spellcheck");
	else el.setAttribute("spellcheck", held.spellcheck);
	unpinLayout(el, held.pinned);
	// the focus leaving is the edit's own, and the page hears it no more
	// than it heard the focus arrive
	quiet = true;
	try {
		el.blur();
	} catch {}
	quiet = false;
	// a commit leaves the typed words standing, because the DOM is the
	// preview and the file is about to say the same thing; only an edit the
	// canvas abandons puts them back
	if (!commit) restore(el, held.before);
	else {
		edits.set(held.id, { el, before: held.before, after: snapshotOf(el) });
		evictOldest(edits);
	}
	parent.postMessage(
		{
			spool: "edited",
			frame: shimConfig().frame,
			id: held.id,
			commit: commit === true,
			nodes: commit ? nodesOf(el) : [],
			owner: commit ? ownerOf(el) : null,
		},
		"*",
	);
}

// The element's children as they stand: the nodes themselves and the words
// each text node holds, so putting them back is putting back these objects.
function snapshotOf(el: Node): Snapshot[] {
	return Array.from(el.childNodes, (node) => ({
		node,
		text: node.nodeType === 3 ? node.nodeValue : null,
		children: node.nodeType === 1 ? snapshotOf(node) : [],
	}));
}

function restore(el: Element, snapshot: readonly Snapshot[]): void {
	for (const held of snapshot) {
		if (held.node.nodeType === 3) held.node.nodeValue = held.text;
		else if (held.node.nodeType === 1) restore(held.node as Element, held.children);
	}
	el.replaceChildren(...snapshot.map((held) => held.node));
}

// The words before or after one committed edit, put back on the same
// element; nothing to put back once the document has moved on from it.
function restoreEdit(id: unknown, way: unknown): boolean {
	const edit = edits.get(id);
	if (!edit?.el.isConnected) return false;
	restore(edit.el, way === "before" ? edit.before : edit.after);
	return true;
}

// what a commit says: the child nodes, text and inline elements alike
function nodesOf(el: Element): WordNode[] {
	const nodes: WordNode[] = [];
	for (const node of el.childNodes) {
		if (node.nodeType === 3) nodes.push({ text: node.nodeValue || "" });
		else if (node.nodeType === 1) {
			const child = node as Element;
			nodes.push({ tag: child.localName, nodes: child.localName === "br" ? [] : nodesOf(child) });
		}
	}
	return nodes;
}

// the words as one string, a line break for each <br>, which is what the
// canvas measures an ended edit against to know whether anything changed
function wordsOf(nodes: readonly WordNode[]): string {
	return nodes.map((node) => ("text" in node ? node.text : node.tag === "br" ? "\n" : wordsOf(node.nodes))).join("");
}

type Alteration =
	| { kind: "moved"; el: Element; parent: ParentNode; from: ChildNode | null; to: ChildNode | null }
	| { kind: "gone"; gone: Array<{ el: Element; parent: ParentNode; next: ChildNode | null }> };

const alters = new Map<unknown, Alteration>();

export interface Altered {
	ok: boolean;
	owner: string | null;
	chain?: Hit[];
	held?: true;
}

export function alterElement(
	id: unknown,
	selectors: readonly unknown[],
	act: unknown,
	place: unknown,
	sources: unknown,
): Altered {
	const found: Element[] = [];
	for (let i = 0; i < selectors.length; i++) {
		const one = elementFor(selectors[i] as string);
		if (!one) return { ok: false, owner: null };
		found.push(one);
	}
	const el = found[0];
	if (!el) return { ok: false, owner: null };
	const owner = ownerOf(el);
	// a move the file has already taken (#340): the element beside its
	// sibling, here too, so the document held in front of the reload shows
	// the new order and the ring can follow it there
	if (act === "move") {
		const beside = found[1];
		const parent = el.parentNode;
		if (!beside || !parent || beside.parentNode !== parent) return { ok: false, owner };
		const from = el.nextSibling;
		parent.insertBefore(el, place === "before" ? beside : beside.nextSibling);
		alters.set(id, { kind: "moved", el, parent, from, to: el.nextSibling });
		evictOldest(alters);
		return { ok: true, owner, chain: chainOf(el, true) };
	}
	if (act !== "delete") return { ok: false, owner };
	// a multi-pick goes as one alteration, so undo puts every node back
	// under one press. Taken in document order and put back in reverse,
	// which is what keeps each one's next sibling connected when it is (#323)
	const taken = withTwins(found, sources);
	const gone: Array<{ el: Element; parent: ParentNode; next: ChildNode | null }> = [];
	for (const one of taken) {
		const parent = one.parentNode;
		if (!parent) return { ok: false, owner };
		gone.push({ el: one, parent, next: one.nextSibling });
	}
	alters.set(id, { kind: "gone", gone });
	evictOldest(alters);
	// what the file may well refuse stays on screen until it has answered,
	// and goes then, on the canvas's word: an element drawn more than once,
	// or one that is the whole of a component, would otherwise vanish and
	// come back (#317)
	const asked = sources as { includes(stamp: string | null): boolean } | null | undefined;
	if (
		taken.length > found.length ||
		found.some((one) => asked?.includes(one.getAttribute("data-spool-source")) && wholeReturn(one))
	) {
		return { ok: true, owner, held: true };
	}
	for (const one of gone) one.parent.removeChild(one.el);
	return { ok: true, owner };
}

// What a delete takes out of the file is everywhere this document draws it:
// the same element rendered again by a component drawn twice, or the same
// call made twice. The file loses all of them, so the document does too,
// and the page on screen is the one the file now says without a reload.
function withTwins(found: readonly Element[], sources: unknown): Element[] {
	const all = found.slice();
	if (Array.isArray(sources)) {
		const drawn = (stamp: string) => document.querySelectorAll(`[data-spool-source="${CSS.escape(stamp)}"]`);
		for (const source of sources) if (typeof source === "string") for (const twin of drawn(source)) all.push(twin);
		for (const el of found) {
			const own = el.getAttribute?.("data-spool-source");
			if (!own) continue;
			for (const twin of drawn(own)) if (sources.includes(ownerOf(twin))) all.push(twin);
		}
	}
	const unique = all.filter((el, i) => all.indexOf(el) === i);
	return unique
		.filter((el) => !unique.some((other) => other !== el && other.contains(el)))
		.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
}

// One alteration put back or forward. False when the document has moved on
// from it, which is the canvas's cue to reload the frame instead.
function unalter(id: unknown, way: unknown): boolean {
	const held = alters.get(id);
	if (!held) return false;
	if (held.kind === "moved") {
		const next = way === "before" ? held.from : held.to;
		if (!held.parent.isConnected || (next && next.parentNode !== held.parent)) return false;
		try {
			held.parent.insertBefore(held.el, next);
		} catch {
			return false;
		}
		return true;
	}
	if (way !== "before") {
		for (const one of held.gone) {
			if (one.el.isConnected) one.el.remove();
		}
		return true;
	}
	for (let i = held.gone.length - 1; i >= 0; i--) {
		const one = held.gone[i] as (typeof held.gone)[number];
		// a delete held on screen for the file's answer never left
		if (one.el.isConnected) continue;
		if (!one.parent.isConnected) return false;
		try {
			one.parent.insertBefore(one.el, one.next?.isConnected ? one.next : null);
		} catch {
			return false;
		}
	}
	return true;
}

/** One committed edit's words or one alteration, put back (`before`) or forward. */
export function restoreAsked(id: unknown, way: unknown): boolean {
	return alters.has(id) ? unalter(id, way) : restoreEdit(id, way);
}

// the caret where the click was, and after the words when there was no
// click or the browser cannot resolve a point inside them
function caretAt(el: Element, x: unknown, y: unknown): void {
	const selection = getSelection();
	if (!selection) return;
	let range: Range | null = null;
	if (typeof x === "number" && typeof y === "number") {
		if (typeof document.caretRangeFromPoint === "function") {
			range = document.caretRangeFromPoint(x, y);
		} else if (typeof document.caretPositionFromPoint === "function") {
			const at = document.caretPositionFromPoint(x, y);
			if (at) {
				range = document.createRange();
				range.setStart(at.offsetNode, at.offset);
				range.collapse(true);
			}
		}
	}
	// no point, or one outside the words: the caret goes after the last of
	// them, and never as a selection of them all (#339)
	if (!range || !el.contains(range.startContainer)) {
		range = document.createRange();
		range.selectNodeContents(el);
		range.collapse(false);
	}
	selection.removeAllRanges();
	selection.addRange(range);
}

// Whether a press inside the words would set something off: a link, a button
// or a form, above the edited element or standing under it. Editing a heading
// that wraps a link, or one with a link inside it, must not follow that link.
function wouldActivate(target: EventTarget | null): boolean {
	if (editing?.el.closest("a,button,form")) return true;
	return !!(
		target &&
		typeof (target as Element).closest === "function" &&
		(target as Element).closest("a,button,form")
	);
}

// The Edit tool is inert (#339): while the words are open the pointer is
// over them and nothing else, and the page hears none of it — no hover
// handler, no focus handler on the element the caret went into, nothing
// that would run the prototype under the hand. Only the listeners are
// kept out; the default actions still place the caret.
let quiet = false;

// The keys that went down in this document. A key released here that went
// down out on the canvas — the Enter that opened an edit, whose release
// lands after the focus has come in — is the canvas's, and the page never
// hears it (#339). Tracked by physical key, which a shift let go of first
// does not change.
const downHere = new Set<string>();

export function guardEdits(): void {
	// A press inside the words places the caret and goes no further; a press
	// anywhere else is the click-away that commits, and the frame never sees it.
	const swallowWhileEditing = (event: Event): void => {
		if (!editing) {
			if (swallowUntilClick) {
				event.preventDefault();
				event.stopImmediatePropagation();
				if (event.type === "click") swallowUntilClick = false;
			}
			return;
		}
		if (editing.el.contains(event.target as Node | null)) {
			event.stopImmediatePropagation();
			if (event.type === "click" && wouldActivate(event.target)) event.preventDefault();
			return;
		}
		event.stopImmediatePropagation();
		event.preventDefault();
		if (event.type === "pointerdown") {
			swallowUntilClick = true;
			endEdit(true);
		}
	};
	for (const kind of [
		"pointerdown",
		"pointerup",
		"mousedown",
		"mouseup",
		"click",
		"dblclick",
		"auxclick",
		"contextmenu",
	]) {
		addEventListener(kind, swallowWhileEditing, true);
	}

	const keepOut = (event: Event): void => {
		if (editing || quiet) event.stopImmediatePropagation();
	};
	for (const kind of [
		"pointermove",
		"pointerover",
		"pointerout",
		"pointerenter",
		"pointerleave",
		"mousemove",
		"mouseover",
		"mouseout",
		"mouseenter",
		"mouseleave",
		"focusin",
		"focusout",
		"focus",
	]) {
		addEventListener(kind, keepOut, true);
	}

	// The other way a form under the words goes off, which no click carries.
	addEventListener(
		"submit",
		(event) => {
			if (!editing) return;
			const form = event.target as Node | null;
			if (!editing.el.contains(form) && !form?.contains?.(editing.el)) return;
			event.preventDefault();
			event.stopImmediatePropagation();
		},
		true,
	);

	// Blur saves: the element's, and the window's, which is what a click out on
	// the canvas is by the time anything here hears of it.
	addEventListener(
		"blur",
		(event) => {
			if (editing && (event.target === editing.el || event.target === window)) endEdit(true);
		},
		true,
	);

	addEventListener(
		"compositionstart",
		(event) => {
			if (editing) {
				editing.composing = true;
				event.stopImmediatePropagation();
			}
		},
		true,
	);
	addEventListener(
		"compositionend",
		(event) => {
			if (!editing) return;
			const held = editing;
			held.composing = false;
			event.stopImmediatePropagation();
			if (held.finish)
				setTimeout(() => {
					if (editing === held) endEdit(true);
				}, 0);
		},
		true,
	);
	for (const kind of ["beforeinput", "input", "keypress", "submit"])
		addEventListener(
			kind,
			(event) => {
				if (!editing) return;
				event.stopImmediatePropagation();
				if (kind === "submit") event.preventDefault();
			},
			true,
		);

	// Swallow the release half too. Relay modifier releases explicitly because
	// application key listeners on this same window must not receive edit keys.
	addEventListener(
		"keydown",
		(event) => {
			downHere.add(event.code);
		},
		true,
	);
	addEventListener("blur", () => {
		downHere.clear();
	});
	addEventListener(
		"keyup",
		(event) => {
			const stray = !downHere.delete(event.code);
			if (editing || editingKeys.delete(event.key) || stray) {
				event.stopImmediatePropagation();
				if (event.key === "Meta" || event.key === "Control")
					parent.postMessage(
						{ spool: "modifier", frame: shimConfig().frame, modifier: event.key, held: false },
						"*",
					);
				// a ⌥ that went down in the document before this one (a reload
				// mid-hold) comes up here: the canvas may have an overview open on it
				if (event.key === "Alt" && window.parent !== window)
					parent.postMessage({ spool: "hold", frame: shimConfig().frame, phase: "up" }, "*");
			}
		},
		true,
	);
}

/**
 * An open in-place edit owns the keyboard (#255): Enter and Esc both finish
 * it and save (#339), and every other key is the edit's rather than the
 * prototype's — the default action still types the character. True when an
 * edit took the key.
 */
export function editTakesKey(event: KeyboardEvent): boolean {
	if (!editing) return false;
	editingKeys.add(event.key);
	if (
		(event.key === "Escape" && !event.isComposing && !editing.composing) ||
		(event.key === "Enter" && !event.shiftKey && !event.isComposing && !editing.composing && event.keyCode !== 229)
	) {
		event.preventDefault();
		event.stopImmediatePropagation();
		endEdit(true);
		return true;
	}
	// A space is the element's own key before it is the text's: a button
	// takes it as a press and eats it, so words typed into one would come
	// out run together. The character is put in by hand instead, which is
	// the same thing the browser would have done with it.
	if (event.key === " " && !event.metaKey && !event.ctrlKey && !event.altKey) {
		event.preventDefault();
		event.stopImmediatePropagation();
		try {
			document.execCommand("insertText", false, " ");
		} catch {}
		return true;
	}
	// the window's tab keys wait for the edit to end: let through, the Mac
	// menu would close or leave the tab and the words with it
	for (const held of __SPOOL_EDIT_HELD_KEYS__) {
		if (comboMatches(event, held, null)) {
			event.preventDefault();
			break;
		}
	}
	event.stopImmediatePropagation();
	return true;
}
