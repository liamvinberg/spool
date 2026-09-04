import { captureRasterSize, coverCaptureScale, LIVE_MIN_CSS_PX } from "../../cover";
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
	radius: number;
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

/** A stamp taken apart: "frames/cart/frame.tsx:10:5" → rel, line, col. */
export interface StampRef {
	rel: string;
	line: number;
	col: number;
}

export function parseStampRef(source: string | null | undefined): StampRef | undefined {
	const [, rel, line, col] = source?.match(/^(.+):(\d+):(\d+)$/) ?? [];
	if (rel === undefined || line === undefined || col === undefined) return undefined;
	return { rel, line: Number.parseInt(line, 10), col: Number.parseInt(col, 10) };
}

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
	| { spool: "measured"; frame: string; id: number; reading: SpacingReading | null }
	| { spool: "edit-open"; frame: string; id: number; ok: boolean; text: string }
	| { spool: "edited"; frame: string; id: number; commit: boolean; text: string }
	| { spool: "site-boxes"; frame: string; id: number; boxes: SiteBoxes }
	| FrameDroppedMessage
	| { spool: "external"; frame: string; href: string }
	| { spool: "go"; frame: string; target: string; session?: SessionRecord; id?: number }
	| { spool: "back"; frame: string; target: string; session?: SessionRecord; id?: number };

/**
 * A file dropped on the element the canvas armed (#260).
 *
 * The drop lands inside the frame's own document, so this relay is the only
 * way the canvas ever hears about it. The `File` rides as itself rather than
 * as bytes: it is structured-cloneable, and the daemon wants a name and a body
 * either way.
 */
export interface FrameDroppedMessage {
	spool: "dropped";
	frame: string;
	selector: string;
	file: File;
}

/**
 * What the canvas arms a frame with: the one element a drop on it means
 * something for, or nothing.
 *
 * Nothing is the resting state, and it is the parity law rather than caution.
 * A frame whose own prototype takes a drop has to behave exactly as its bare
 * document does, so the shim intercepts nothing until the canvas names an
 * element — which it does only for a single selected image.
 */
export const dropTargetMessage = (selector: string | null) => ({ spool: "drop-target", selector }) as const;

export function parseFrameMessage(data: unknown): FrameMessage | undefined {
	if (typeof data !== "object" || data === null) return undefined;
	const m = data as Record<string, unknown>;
	if (typeof m.spool !== "string" || typeof m.frame !== "string") return undefined;
	switch (m.spool) {
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
		case "measured":
			return typeof m.id === "number" && (m.reading === null || isSpacingReading(m.reading))
				? (m as unknown as FrameMessage)
				: undefined;
		case "edit-open":
			return typeof m.id === "number" && typeof m.ok === "boolean" && typeof m.text === "string"
				? (m as unknown as FrameMessage)
				: undefined;
		case "edited":
			return typeof m.id === "number" && typeof m.commit === "boolean" && typeof m.text === "string"
				? (m as unknown as FrameMessage)
				: undefined;
		case "dropped":
			return typeof m.selector === "string" && m.selector !== "" && m.file instanceof File
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
	const scale = message.targetWidth > 0 ? coverCaptureScale(message.width) : message.dpr;
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

/**
 * A spacing reading, checked the way every other reply is: the shape the
 * decomposition indexes into, and finite numbers where it does arithmetic.
 */
function isSpacingReading(value: unknown): value is SpacingReading {
	if (!isRecord(value)) return false;
	return (
		(value.axis === "x" || value.axis === "y") &&
		finite(value.from) &&
		finite(value.to) &&
		finite(value.at) &&
		finite(value.step) &&
		finite(value.root) &&
		isMeasuredBox(value.first) &&
		isMeasuredBox(value.second) &&
		isMeasuredParent(value.parent)
	);
}

function isMeasuredBox(value: unknown): value is MeasuredBox {
	if (!isRecord(value) || !isRecord(value.rect) || !isRecord(value.margins)) return false;
	return (
		typeof value.selector === "string" &&
		typeof value.tag === "string" &&
		typeof value.className === "string" &&
		typeof value.display === "string" &&
		typeof value.rtl === "boolean" &&
		typeof value.loose === "boolean" &&
		finite(value.radius) &&
		["x", "y", "w", "h"].every((key) => finite((value.rect as Record<string, unknown>)[key])) &&
		["top", "right", "bottom", "left"].every((key) => finite((value.margins as Record<string, unknown>)[key]))
	);
}

function isMeasuredParent(value: unknown): value is MeasuredParent {
	return (
		isRecord(value) &&
		typeof value.selector === "string" &&
		typeof value.tag === "string" &&
		typeof value.className === "string" &&
		typeof value.display === "string" &&
		finite(value.gapX) &&
		finite(value.gapY)
	);
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
export const pickMessage = (x: number, y: number, id: number) => ({ spool: "pick", x, y, id }) as const;
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
export const kinMessage = (selector: string, step: KinStep, id: number) =>
	({ spool: "kin", selector, step, id }) as const;

/**
 * One element in a spacing reading (#261): what it is, where it is, and the
 * class literal it carries.
 *
 * The class comes off the live document rather than out of the file, because
 * the overlay names what *produced* the pixels — a token the compiler never
 * saw is not the one to go and edit, and a token the file writes but a variant
 * beats is not either.
 */
export interface MeasuredBox {
	selector: string;
	tag: string;
	/** the live class attribute, empty when the element carries none */
	className: string;
	rect: Box;
	radius: number;
	margins: { top: number; right: number; bottom: number; left: number };
	/** ltr or rtl, which is what `ms-` and `me-` resolve through */
	rtl: boolean;
	/** the computed display, which decides whether its block margins collapse */
	display: string;
	/** out of flow, so its block margins never collapse with a sibling's */
	loose: boolean;
}

/** The parent two neighbours share: the only element that can own their gap. */
export interface MeasuredParent {
	selector: string;
	tag: string;
	className: string;
	/** the computed display, which decides whether a gap applies at all */
	display: string;
	gapX: number;
	gapY: number;
}

/**
 * The raw facts behind a distance (#261), read off computed styles and handed
 * out undecomposed.
 *
 * The frame is the only place the boxes, the margins and the resolved
 * `--spacing` can be read, and it is the worst place to work out what they add
 * up to — so it reads and says nothing more. `measure-spacing.ts` does the
 * arithmetic and the attribution, where a test can reach it.
 */
export interface SpacingReading {
	axis: "x" | "y";
	/** frame-local: the facing edge of the box drawn first along the axis */
	from: number;
	/** the facing edge of the second, so `to - from` is the distance */
	to: number;
	/** the cross-axis line the bar is drawn on, frame-local */
	at: number;
	/** the two boxes in the order they are drawn along the axis */
	first: MeasuredBox;
	second: MeasuredBox;
	/** the parent both share — a reading is only ever taken between neighbours */
	parent: MeasuredParent;
	/** what one spacing step is worth here — `var(--spacing)` resolved */
	step: number;
	/** the root font size, for a token spelled in rem */
	root: number;
}

/**
 * The measurement overlay's ask (#261): the held element, and the point the
 * pointer is at under ⌥.
 *
 * The frame resolves the second element itself rather than being told one,
 * because the pointer usually rests on a word inside the card rather than on
 * the card — so the shim climbs from the point to whichever ancestor is the
 * held element's own neighbour, and answers for that. A point anywhere else
 * answers with no reading, because a distance only decomposes honestly with
 * nothing standing between its two ends.
 */
export const measureMessage = (selector: string, x: number, y: number, id: number) =>
	({ spool: "measure", selector, x, y, id }) as const;
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
export const sessionReply = (record: SessionRecord | null) => ({ spool: "session", record }) as const;

/** The page's state handed to a sibling frame after one of them wrote. */
export const sharedStateMessage = (state: Record<string, unknown>) => ({ spool: "state", state }) as const;

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);
export const sitesMessage = (sites: SiteAnchor[], id: number) => ({ spool: "sites", sites, id }) as const;
