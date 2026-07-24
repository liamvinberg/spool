import type { SessionRecord } from "../../runtime/frame-runtime";
import type { Box } from "./camera";

/**
 * The postMessage bridge between canvas and frames. The frame side lives in
 * the served document (freeze/capture/key shim in daemon/document.ts, session
 * and walks in runtime/frame-runtime.ts); this is the canvas's vocabulary for
 * it. SessionRecord is the runtime's own type — one shape, both realms.
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

/** One element of a frame's live DOM as the tree walk serialized it (#58). */
export interface RawTreeNode {
	tag: string;
	selector: string;
	/** The element's own stamp — null for JS-created DOM, which inherits its parent's group. */
	source: string | null;
	/** Direct text children, collapsed and capped. */
	text: string;
	/** The accessible label — aria-label, alt, title, placeholder — for elements with no words of their own. */
	label: string;
	children: RawTreeNode[];
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

export interface FrameModifierMessage {
	spool: "modifier";
	frame: string;
	modifier: "Meta";
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

/** Frame-local boxes of navigation-site elements, keyed `path:line:col` of
 * the anchor each side derives; null when no element renders for it. */
export type SiteBoxes = Record<string, Box | null>;

/** One anchor the canvas wants located: its stamp position, and for data-go
 * sites the target as a DOM fallback — a component-wrapped element stamps
 * where it is authored (shared/ui), never at the site. A ui.go site carries
 * no target: its only truths are the stamp and the frame edge (#34). */
export interface SiteAnchor {
	path: string;
	line: number;
	col: number;
	target?: string;
}

export type FrameMessage =
	| { spool: "loaded"; frame: string }
	| { spool: "error"; frame: string; error: string }
	| { spool: "shot"; frame: string; url?: string; error?: string }
	| { spool: "session?"; frame: string }
	| { spool: "key"; frame: string; key: string }
	| FrameModifierMessage
	| FramePanMessage
	| FrameZoomMessage
	| { spool: "picked"; frame: string; id: number; chain: PickedHit[] }
	| { spool: "tree"; frame: string; id: number; roots: RawTreeNode[] }
	| { spool: "described"; frame: string; id: number; chains: PickedHit[][] }
	| { spool: "site-boxes"; frame: string; id: number; boxes: SiteBoxes }
	| { spool: "external"; frame: string; href: string }
	| { spool: "go"; frame: string; target: string; session?: SessionRecord }
	| { spool: "back"; frame: string; target: string; session?: SessionRecord };

export function parseFrameMessage(data: unknown): FrameMessage | undefined {
	if (typeof data !== "object" || data === null) return undefined;
	const m = data as Record<string, unknown>;
	if (typeof m.spool !== "string" || typeof m.frame !== "string") return undefined;
	switch (m.spool) {
		case "loaded":
		case "error":
		case "shot":
		case "session?":
			return m as unknown as FrameMessage;
		case "key":
			return typeof m.key === "string" ? (m as unknown as FrameMessage) : undefined;
		case "modifier":
			return m.modifier === "Meta" && typeof m.held === "boolean" ? (m as unknown as FrameMessage) : undefined;
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
		case "picked":
			return Array.isArray(m.chain) && typeof m.id === "number" ? (m as unknown as FrameMessage) : undefined;
		case "tree":
			return Array.isArray(m.roots) && typeof m.id === "number" ? (m as unknown as FrameMessage) : undefined;
		case "described":
			return Array.isArray(m.chains) && typeof m.id === "number" ? (m as unknown as FrameMessage) : undefined;
		case "site-boxes":
			return typeof m.boxes === "object" && m.boxes !== null && typeof m.id === "number"
				? (m as unknown as FrameMessage)
				: undefined;
		case "external":
			return webHref(m.href) ? (m as unknown as FrameMessage) : undefined;
		case "go":
		case "back":
			return typeof m.target === "string" ? (m as unknown as FrameMessage) : undefined;
		default:
			return undefined;
	}
}

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

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
export const captureMessage = { spool: "capture" } as const;
export const pickMessage = (x: number, y: number, id: number) => ({ spool: "pick", x, y, id }) as const;
// "tree?" asks, "tree" answers — distinct kinds, so a reply can never read as a request
export const treeMessage = (id: number) => ({ spool: "tree?", id }) as const;
export const describeMessage = (selectors: string[], id: number) => ({ spool: "describe", selectors, id }) as const;
export const sessionReply = (record: SessionRecord | null) => ({ spool: "session", record }) as const;
export const sitesMessage = (sites: SiteAnchor[], id: number) => ({ spool: "sites", sites, id }) as const;
