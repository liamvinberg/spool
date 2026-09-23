import { captureRasterSize, coverCaptureScale, LIVE_MIN_CSS_PX } from "../../cover";

export { parseStampRef, type StampRef } from "../../stamp";

import { type ClipboardCopyRequest, parseClipboardCopyRequest } from "../../runtime/clipboard-protocol";
import type { SessionRecord } from "../../runtime/frame-runtime";
import type { AccelKeyName } from "../../runtime/platform-keys";
import { isWalkId } from "../../runtime/walk-protocol";
import type { Box } from "./camera";

/**
 * The postMessage bridge between canvas and frames. The frame side lives in
 * the served document (capture/key shim in daemon/document.ts, session and
 * walks in runtime/frame-runtime.ts). This is the canvas's vocabulary for it.
 * SessionRecord is the runtime's own type, with one shape in both realms.
 */

export type { SessionRecord };

/** One element of the ancestry the shim found under a Select-tool point (#23). */
export interface PickedHit {
	selector: string;
	tag: string;
	outerHtml: string;
	/** Frame-local geometry of the picked element, for the outline overlay. */
	rect: { x: number; y: number; w: number; h: number };
	/**
	 * The element's line boxes, when it is drawn as more than one (#321).
	 *
	 * An inline element that wraps has a box per line; `rect` is the box around
	 * all of them at once, which is not a shape the element has anywhere on
	 * screen. Absent for everything drawn as a single box, which is nearly
	 * everything, so a chain carries no more than it has to.
	 */
	rects?: readonly { x: number; y: number; w: number; h: number }[];
	radius: number;
	/**
	 * Whether the element has words of its own (#321).
	 *
	 * What decides whether the bottom of a descent is a text element or an
	 * empty container: a double-click on the first opens its words, and on the
	 * second there is nothing under the pointer and nothing to type into.
	 */
	words?: boolean;
	/**
	 * What the element is actually drawn with, for the rows the rail shows
	 * (#323).
	 *
	 * The rail's first source is the class literal parsed at the stamp; this is
	 * the second, and it is the only one that can answer for a property a
	 * project's own stylesheet set. Present only where a selection asked for it
	 * — a hover asks for a chain many times a second and draws none of it.
	 */
	computed?: Readonly<Record<string, string>>;
	/**
	 * The row of a list this element is drawn as (#324).
	 *
	 * A `.map()` renders one JSX element once per entry, so the stamp is every
	 * row at once and a delete on it would take them all. This is the one thing
	 * only the running document knows: the stamp of the element the map
	 * renders, where in the array it stands, and its own root in the document.
	 * Present only where a selection asked for it, and only inside a list.
	 */
	item?: { map: string; index: number; selector: string };
	/**
	 * The sides what is in the element runs past the box it is in (#324).
	 *
	 * A width a hand wrote under the content's own min-content width leaves the
	 * words standing outside their box. The ring keeps the border box, because
	 * that is what the handles drag and what the file says; this is what makes
	 * the difference visible instead of leaving it as a ring that looks wrong.
	 */
	spills?: readonly ("right" | "bottom")[];
	/** Nearest data-spool-source stamp, "frames/…/frame.tsx:line:col". */
	source: string | null;
	/** True when the stamp sits on an ancestor — JS-created DOM (#6 degrade). */
	generated: boolean;
}

/**
 * The (frame, selector) pair as one identity — picks match on nothing else.
 *
 * It lives beside the hit rather than in the overlay because it is what names a
 * pick everywhere: the outline out on the canvas, the chip in the composer, and
 * the removal that has to reach from one to the other (#116).
 */
export const pickKey = (frame: string, selector: string): string => `${frame}\0${selector}`;

interface FrameWheelZoomMessage {
	spool: "zoom";
	frame: string;
	kind: "wheel";
	x: number;
	y: number;
	deltaY: number;
	deltaMode: number;
}

export type FrameZoomMessage = FrameWheelZoomMessage | { spool: "zoom"; frame: string; kind: "in" | "out" };

/**
 * A plain wheel the entered frame could not scroll with: nothing under the
 * cursor had room left in that direction, so the shim chains it out to the
 * canvas as a pan, the way a browser chains a scroll to the parent page.
 */
export interface FrameScrollMessage {
	spool: "scroll";
	frame: string;
	deltaX: number;
	deltaY: number;
	deltaMode: number;
	shiftKey: boolean;
}

/**
 * A frame reporting a modifier key it saw move. The frame does not decide which
 * one is the platform's accel modifier — it names what happened and the canvas
 * applies the rule, so the platform question stays in one place.
 */
export interface FrameModifierMessage {
	spool: "modifier";
	frame: string;
	modifier: AccelKeyName;
	held: boolean;
}

/**
 * A middle-button drag inside an entered frame, relayed in screen coordinates
 * so the canvas can pan out from under it — the frame owns every other press.
 */
export interface FramePanMessage {
	spool: "pan";
	frame: string;
	phase: "start" | "move" | "end";
	x: number;
	y: number;
}

/** Frame-local boxes of the elements the canvas asked about, keyed by the
 * anchor each side derives — `path:line:col` for a point and `path:from-to`
 * for a range; null when no element renders for it. */
export type SiteBoxes = Record<string, Box | null>;

/** One anchor the canvas wants located: its stamp position, and for data-go
 * sites the target as a DOM fallback — a component-wrapped element stamps
 * where it is authored (shared/ui), never at the site. A ui.go site carries
 * no target: its only truths are the stamp and the frame edge (#34).
 *
 * `through` makes it a range instead: every stamp this file authored between
 * `line` and it, unioned into one box. That is how a write becomes a mark — the
 * daemon owns the file and answers lines, and only the document can turn lines
 * into pixels (#214). A range carries no target and takes no fallback: a write
 * nothing on screen came from has no box, and the frame edge would be a lie. */
export interface SiteAnchor {
	path: string;
	line: number;
	col: number;
	target?: string;
	through?: number;
}

export interface CaptureSourceMessage {
	spool: "capture-source";
	frame: string;
	id: string;
	svg: Blob;
	width: number;
	height: number;
	dpr: number;
	targetWidth: number;
}

export interface CaptureSourceErrorMessage {
	spool: "capture-source";
	frame: string;
	id: string;
	error: string;
}

export type CaptureSourceReply = CaptureSourceMessage | CaptureSourceErrorMessage;

export type FrameMessage =
	| ClipboardCopyRequest
	| { spool: "loaded"; frame: string }
	| { spool: "arrived"; frame: string }
	| { spool: "content-size"; frame: string; id: number; width: number; height: number | null }
	| { spool: "error"; frame: string; error: string }
	| { spool: "shot"; frame: string; url?: string; error?: string }
	| CaptureSourceReply
	| { spool: "session?"; frame: string }
	| { spool: "state"; frame: string; scenario: string; state: Record<string, unknown> }
	| { spool: "key"; frame: string; key: string }
	| FrameModifierMessage
	| FramePanMessage
	| FrameZoomMessage
	| FrameScrollMessage
	| { spool: "picked"; frame: string; id: number; chain: PickedHit[] }
	| { spool: "edit-open"; frame: string; id: number; ok: boolean; text: string }
	| { spool: "edited"; frame: string; id: number; commit: boolean; nodes: EditedNode[]; owner: string | null }
	| { spool: "restored"; frame: string; id: number; ok: boolean }
	| { spool: "classed"; frame: string; id: number; ok: boolean }
	| { spool: "altered"; frame: string; id: number; ok: boolean; owner: string | null }
	| { spool: "site-boxes"; frame: string; id: number; boxes: SiteBoxes }
	| { spool: "external"; frame: string; href: string }
	| { spool: "go"; frame: string; target: string; session?: SessionRecord; id?: number }
	| { spool: "back"; frame: string; target: string; session?: SessionRecord; id?: number };

export function parseFrameMessage(data: unknown): FrameMessage | undefined {
	if (typeof data !== "object" || data === null) return undefined;
	const m = data as Record<string, unknown>;
	if (typeof m.spool !== "string" || typeof m.frame !== "string") return undefined;
	switch (m.spool) {
		case "content-size":
			return typeof m.id === "number" &&
				Number.isSafeInteger(m.id) &&
				typeof m.width === "number" &&
				Number.isSafeInteger(m.width) &&
				m.width > 0 &&
				(m.height === null || (typeof m.height === "number" && Number.isSafeInteger(m.height) && m.height > 0))
				? { spool: "content-size", frame: m.frame, id: m.id, width: m.width, height: m.height }
				: undefined;
		case "copy":
			return parseClipboardCopyRequest(data);
		case "loaded":
		case "arrived":
		case "error":
		case "shot":
		case "session?":
			return m as unknown as FrameMessage;
		case "state":
			return typeof m.scenario === "string" && isPlainRecord(m.state) ? (m as unknown as FrameMessage) : undefined;
		case "capture-source":
			return captureSourceMessage(m) || captureSourceErrorMessage(m)
				? (m as unknown as CaptureSourceReply)
				: undefined;
		case "key":
			return typeof m.key === "string" ? (m as unknown as FrameMessage) : undefined;
		case "modifier":
			return (m.modifier === "Meta" || m.modifier === "Control") && typeof m.held === "boolean"
				? (m as unknown as FrameMessage)
				: undefined;
		case "pan":
			return (m.phase === "start" || m.phase === "move" || m.phase === "end") && finite(m.x) && finite(m.y)
				? (m as unknown as FrameMessage)
				: undefined;
		case "zoom":
			if (m.kind === "in" || m.kind === "out") {
				return m as unknown as FrameMessage;
			}
			return m.kind === "wheel" &&
				finite(m.x) &&
				finite(m.y) &&
				finite(m.deltaY) &&
				(m.deltaMode === 0 || m.deltaMode === 1 || m.deltaMode === 2)
				? (m as unknown as FrameMessage)
				: undefined;
		case "scroll":
			return finite(m.deltaX) &&
				finite(m.deltaY) &&
				(m.deltaMode === 0 || m.deltaMode === 1 || m.deltaMode === 2) &&
				typeof m.shiftKey === "boolean"
				? (m as unknown as FrameMessage)
				: undefined;
		case "picked":
			return Array.isArray(m.chain) && typeof m.id === "number" ? (m as unknown as FrameMessage) : undefined;
		case "edit-open":
			return typeof m.id === "number" && typeof m.ok === "boolean" && typeof m.text === "string"
				? (m as unknown as FrameMessage)
				: undefined;
		case "edited":
			return typeof m.id === "number" &&
				typeof m.commit === "boolean" &&
				Array.isArray(m.nodes) &&
				(m.owner === null || typeof m.owner === "string")
				? (m as unknown as FrameMessage)
				: undefined;
		case "restored":
		case "classed":
			return typeof m.id === "number" && typeof m.ok === "boolean" ? (m as unknown as FrameMessage) : undefined;
		case "altered":
			return typeof m.id === "number" &&
				typeof m.ok === "boolean" &&
				(m.owner === null || typeof m.owner === "string")
				? (m as unknown as FrameMessage)
				: undefined;
		case "site-boxes":
			return typeof m.boxes === "object" && m.boxes !== null && typeof m.id === "number"
				? (m as unknown as FrameMessage)
				: undefined;
		case "external":
			return webHref(m.href) ? (m as unknown as FrameMessage) : undefined;
		case "go":
		case "back": {
			if (typeof m.target !== "string") return undefined;
			if (!Object.hasOwn(m, "id")) {
				return hasExactKeys(m, ["spool", "frame", "target"]) ? (m as unknown as FrameMessage) : undefined;
			}
			return hasExactKeys(m, ["spool", "frame", "target", "session", "id"]) &&
				isWalkId(m.id) &&
				isSessionRecord(m.session)
				? (m as unknown as FrameMessage)
				: undefined;
		}
		default:
			return undefined;
	}
}

type WalkMessage = Extract<FrameMessage, { spool: "go" | "back" }>;
export function clipboardCopyAllowed(known: boolean, active: boolean, blocked: boolean): boolean {
	return known && active && !blocked;
}

/** A walk is sequenced (carries an id) from every frame document; a bare one is nobody's. */
export function walkRejectionReason(
	message: WalkMessage,
	known: boolean,
	active: boolean,
	targetExists: boolean,
	blocked: boolean,
): "inactive" | "missing" | undefined {
	if (!active || message.id === undefined || !known || blocked) return "inactive";
	return targetExists ? undefined : "missing";
}

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const CAPTURE_ID = /^[0-9a-f]{32}$/;
const MAX_CAPTURE_SVG_BYTES = 16 * 1024 * 1024;
const MAX_CAPTURE_SOURCE_EDGE = 32 * 1024;

function captureSourceMessage(message: Record<string, unknown>): boolean {
	if (
		!hasExactKeys(message, ["spool", "frame", "id", "svg", "width", "height", "dpr", "targetWidth"]) ||
		typeof message.id !== "string" ||
		!CAPTURE_ID.test(message.id) ||
		!(message.svg instanceof Blob) ||
		message.svg.type !== "image/svg+xml" ||
		message.svg.size === 0 ||
		message.svg.size > MAX_CAPTURE_SVG_BYTES ||
		!boundedInteger(message.width, 1, MAX_CAPTURE_SOURCE_EDGE) ||
		!boundedInteger(message.height, 1, MAX_CAPTURE_SOURCE_EDGE) ||
		!finite(message.dpr) ||
		message.dpr <= 0 ||
		message.dpr > 2 ||
		(message.targetWidth !== 0 && message.targetWidth !== LIVE_MIN_CSS_PX)
	) {
		return false;
	}
	// Exports that fit at native size may reduce their pixel density in the
	// worker. The source bounds and the worker's output budget still apply.
	const scale = message.targetWidth > 0 ? coverCaptureScale(message.width) : Math.min(message.dpr, 1);
	return captureRasterSize(message.width, message.height, scale) !== undefined;
}

function captureSourceErrorMessage(message: Record<string, unknown>): boolean {
	return (
		hasExactKeys(message, ["spool", "frame", "id", "error"]) &&
		typeof message.id === "string" &&
		CAPTURE_ID.test(message.id) &&
		typeof message.error === "string" &&
		message.error.length > 0 &&
		message.error.length <= 240
	);
}

function boundedInteger(value: unknown, min: number, max: number): value is number {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max;
}

function isSessionRecord(value: unknown): value is SessionRecord {
	if (!isRecord(value) || !hasExactKeys(value, ["scenario", "state", "stack"])) return false;
	return (
		typeof value.scenario === "string" &&
		isRecord(value.state) &&
		Array.isArray(value.stack) &&
		value.stack.every((name) => typeof name === "string")
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
	const own = Object.keys(value);
	return own.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function webHref(value: unknown): value is string {
	if (typeof value !== "string") return false;
	try {
		const url = new URL(value);
		return (url.protocol === "http:" || url.protocol === "https:") && url.username === "" && url.password === "";
	} catch {
		return false;
	}
}

export const freezeMessage = (on: boolean) => ({ spool: "freeze", on }) as const;
/**
 * Ask a freshly loaded document to say when it has finished arriving (#177) —
 * fonts, entry animations, a quiet DOM. `settleMs` is the frame's own budget for
 * that wait, spent inside the frame; the caller keeps a deadline of its own,
 * because a document that never answers is exactly the one this asks about.
 */
export const arriveMessage = (settleMs: number) => ({ spool: "arrive", settleMs }) as const;
/**
 * `targetWidth` asks for a sharp cover at the live threshold; 0 asks for a full-resolution export.
 * `id` binds the reply to the exact request and frame document.
 * `settleMs` is how long the frame may wait for its own fonts and entry
 * animations before it photographs itself — the caller owns that budget,
 * because a walk's cover is wanted inside its own arrival and an ambient
 * refresh can afford to wait for the truth.
 */
export const captureMessage = (id: string, targetWidth: number, settleMs: number) =>
	({ spool: "capture", id, targetWidth, settleMs }) as const;
/** `computed` is a selection asking for the drawn style of each rung it answers with (#323). */
export const pickMessage = (x: number, y: number, id: number, computed = false) =>
	({ spool: "pick", x, y, id, computed }) as const;
/**
 * The keyboard half of the selection ladder (#254): the pointer names a rung
 * by where it is, and ⌘⏎ and Tab have to name one by kinship instead. An empty
 * selector stands for the boot root, so `child` off nothing is the frame's own
 * root element — the rung a descent from the frame lands on.
 *
 * `self` is the element itself, which is how a selection survives its own edit
 * (#258): the rail's write reloads the document out from under the pick, and
 * the same selector asked for again is the rung the fields were just in.
 *
 * The answer is a `picked` reply and nothing new: the ancestry of the kin, so
 * the canvas learns the target and the chain it now holds in one message, and
 * an empty chain is a rung that does not exist.
 */
export type KinStep = "child" | "next" | "previous" | "self";
export const kinMessage = (selector: string, step: KinStep, id: number, computed = false) =>
	({ spool: "kin", selector, step, id, computed }) as const;

/**
 * The in-place text edit (#255): the element's own words become the field,
 * with the caret where the click landed. The frame answers `edit-open` at
 * once — a selector nothing answers to is `ok: false` — and `edited` when
 * Enter, Esc or a click away has ended it. `endEditMessage` is the canvas's
 * own way to end one, which is what a click out on the field means.
 */
export const editMessage = (selector: string, x: number, y: number, id: number) =>
	({ spool: "edit", selector, x, y, id }) as const;
export const endEditMessage = (commit: boolean) => ({ spool: "edit-end", commit }) as const;

/**
 * One child node of an edited element (#314), as the frame hands them back:
 * a text node's words, or an element with its own children.
 */
export type EditedNode = { text: string } | { tag: string; nodes: EditedNode[] };

/**
 * The DOM half of undo and redo (#314): the words of one committed edit put
 * back to before or forward to after, on the very nodes the frame still
 * holds. `ask` pairs the answer with the press that made it.
 */
export const restoreMessage = (id: number, way: "before" | "after", ask: number) =>
	({ spool: "restore", id, way, ask }) as const;

/**
 * A structural gesture, in the document (#317): the element out of it, hidden,
 * shown, or one attribute set. The frame answers with whether it could and with
 * the call one owner up, which is the only place that knows it — a delete of
 * something that is all of a shared component lands on that call instead.
 */
export const alterMessage = (
	id: number,
	/** several only for a delete of a multi-pick, which is one ask and one undo (#323) */
	selectors: readonly string[],
	act: "delete" | "hide" | "show" | "attribute",
	name?: string,
	value?: string,
) => ({ spool: "alter", id, selectors, act, name, value }) as const;

/** How a save moved the stamps on its line, for a document that is not reloaded for it (#314). */
export const restampMessage = (file: string, shifts: readonly { line: number; column: number; delta: number }[]) =>
	({ spool: "restamp", file, shifts }) as const;

/**
 * The rail's preview (#315): CSS declarations set inline on the element the
 * moment a value is typed or stepped, and lifted again with `null`. Nothing
 * leaves the canvas for the daemon while this is happening.
 */
export const styleMessage = (selector: string, declarations: Readonly<Record<string, string | null>> | null) =>
	({ spool: "style", selector, declarations }) as const;

/**
 * The file has the class (#315): the literal as it was and as it is, so the
 * frame swaps the tokens that changed on the element, the stylesheet the
 * document now compiles to, and the ask the frame's `classed` answers.
 */
export const classMessage = (selector: string, was: string, now: string, css: string | undefined, id: number) =>
	({ spool: "class", selector, was, now, css, id }) as const;
export const sessionReply = (record: SessionRecord | null) => ({ spool: "session", record }) as const;

/** The page's state handed to a sibling frame after one of them wrote. */
export const sharedStateMessage = (state: Record<string, unknown>) => ({ spool: "state", state }) as const;

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);
export const sitesMessage = (sites: SiteAnchor[], id: number) => ({ spool: "sites", sites, id }) as const;
