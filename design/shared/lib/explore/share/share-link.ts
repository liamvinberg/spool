/**
 * What a shared link is made of, in one place, so the dialog, the unfurl and
 * the guest's own chrome all say the same numbers.
 *
 * The scope is the *link*, never the build: spool compiles the whole project
 * either way and the link decides how much of it a stranger can reach, because
 * flows cross frames and a per-frame build would cut them (spool-cloud#2).
 */

export type ShareScope = "frame" | "flow" | "page";
/** the open fork: a link that trails the canvas, or one pinned to the moment it was minted */
export type ShareMode = "live" | "frozen";

export interface ScopeOption {
	readonly scope: ShareScope;
	readonly label: string;
	readonly detail: string;
	readonly frames: number;
}

/** The kaffe fixture every share frame stands on: cart, and the two frames it walks to. */
export const SCOPES: readonly ScopeOption[] = [
	{ scope: "frame", label: "This frame", detail: "cart on its own. Its walks land nowhere.", frames: 1 },
	{ scope: "flow", label: "This flow", detail: "cart and the two frames its walks reach.", frames: 3 },
	{ scope: "page", label: "The whole page", detail: "Every frame on app, walk where they like.", frames: 7 },
];

export const MODES: readonly { mode: ShareMode; label: string; detail: string }[] = [
	{ mode: "live", label: "Live", detail: "The link follows the canvas. Every save is there on their next reload." },
	{ mode: "frozen", label: "Frozen", detail: "The link keeps this moment. What you do next stays yours." },
];

export const LINK = "spool.cloud/k/9f2c1a";

export function framesIn(scope: ShareScope): number {
	return SCOPES.find((option) => option.scope === scope)?.frames ?? 1;
}

export function countOf(scope: ShareScope): string {
	const frames = framesIn(scope);
	return frames === 1 ? "1 frame" : `${frames} frames`;
}

/** What the machine prints while the link is being made. Mono, lowercase, its own voice. */
export interface MintStep {
	readonly line: string;
	readonly state: "done" | "running" | "waiting";
}

export function mintLog(scope: ShareScope): readonly MintStep[] {
	return [
		{ line: `compiled ${countOf(scope)}`, state: "done" },
		{ line: "bundled 218 kB", state: "done" },
		{ line: "uploading", state: "running" },
	];
}
