import type { SessionRecord } from "../../runtime/frame-runtime";

/**
 * The postMessage bridge between canvas and frames. The frame side lives in
 * the served document (freeze/capture/key shim in daemon/document.ts, session
 * and walks in runtime/frame-runtime.ts); this is the canvas's vocabulary for
 * it. SessionRecord is the runtime's own type — one shape, both realms.
 */

export type { SessionRecord };

/** One element of the ancestry the shim found under a design-mode point (#23). */
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

export type FrameMessage =
	| { spool: "loaded"; frame: string }
	| { spool: "error"; frame: string; error: string }
	| { spool: "shot"; frame: string; url?: string; error?: string }
	| { spool: "session?"; frame: string }
	| { spool: "key"; frame: string; key: string }
	| { spool: "picked"; frame: string; id: number; chain: PickedHit[] }
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
		case "picked":
			return Array.isArray(m.chain) && typeof m.id === "number" ? (m as unknown as FrameMessage) : undefined;
		case "go":
		case "back":
			return typeof m.target === "string" ? (m as unknown as FrameMessage) : undefined;
		default:
			return undefined;
	}
}

export const freezeMessage = (on: boolean) => ({ spool: "freeze", on }) as const;
export const captureMessage = { spool: "capture" } as const;
export const pickMessage = (x: number, y: number, id: number) => ({ spool: "pick", x, y, id }) as const;
export const sessionReply = (record: SessionRecord | null) => ({ spool: "session", record }) as const;
