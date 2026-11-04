import { type ExperimentId, experimentDefault } from "../settings/experiments";

declare global {
	interface Window {
		__SPOOL_EXPERIMENTS__?: readonly string[];
	}
}

/**
 * Whether one experimental feature (`settings/experiments.ts`) is on in this page.
 *
 * The daemon writes the ones this machine has on into the canvas document's
 * boot script, read from config.json as the page is served. That is what makes
 * a feature that is off absent rather than hidden: the page knows before its
 * first paint, so it never renders once and disappears. It is also why a switch
 * moved in Settings shows after a reload and not before: nothing flips under a
 * frame that is open.
 *
 * A page no daemon booted (spool.page, a test) has no list and runs every
 * feature at its default.
 */
export function experimentOn(id: ExperimentId): boolean {
	const on = typeof window === "undefined" ? undefined : window.__SPOOL_EXPERIMENTS__;
	if (!Array.isArray(on)) return experimentDefault(id);
	return on.includes(id);
}
