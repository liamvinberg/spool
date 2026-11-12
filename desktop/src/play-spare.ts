// The warm play window (spool#301).
//
// A press on play used to wait on a new window: made hidden, loaded, and shown
// once it had painted, a fifth of a second at best. So while a canvas is open
// the app keeps one play window made, loaded and hidden on a page of the
// daemon's that draws nothing but the play window's dark and its bar's strip
// (`/player-assets/spare`), and a press adopts it: placed, titled, shown, and only then
// pointed at the play URL. The next one is made once that play has revealed
// its frame, so making it never competes with the play it replaces.
//
// It waits on the origin a play loads on, so the walk from its page to the
// player's is a same-origin navigation and the strip stays up until the
// player's own bar paints over it. It holds nothing for a frame: no handoff,
// no token, no script. The play URL it is pointed at mints the single-use
// handoff for that play, exactly as a window made for the press does.
//
// What is decided here is decided as plain facts in, a verdict out, because
// none of it can be watched without a screen and all of it has to hold: when a
// spare is taken, when it is thrown away, and when the next one is made.

/** A spare as the app knows it. */
export interface SpareFacts {
	/** The origin its page is on, which is the only origin a play may adopt it from. */
	origin: string;
	/** The daemon that served its page, as `daemonIdentity` names one. */
	daemon: string;
	/** Its page answered and painted: shown now, it shows the strip. */
	ready: boolean;
}

/** What the app is standing on when a spare is weighed. */
export interface SpareSurroundings {
	/** Spool's window is open on a daemon's canvas. */
	canvasOpen: boolean;
	/** The daemon the canvas is on, as `daemonIdentity` names one; none while there is none. */
	daemon: string | undefined;
	/** The window is on another machine's daemon, whose page this app's daemon did not serve. */
	remote: boolean;
	quitting: boolean;
	/** A daemon that answered the spare's page with an error: an older one, which has no such page. */
	refusedBy: string | undefined;
	/** Play windows whose frame has not been revealed yet. */
	awaitingReveal: number;
}

/** One daemon, one run of it: a restart, or another port, is another daemon with other assets. */
export function daemonIdentity(origin: string, pid: number): string {
	return `${origin}#${pid}`;
}

/**
 * What a press does with the spare: adopt it, leave it and make a window of its
 * own, or throw it away first because it stands on a daemon that is gone.
 */
export function spareForPlay(
	spare: SpareFacts | undefined,
	playOrigin: string,
	daemon: string | undefined,
): "adopt" | "fresh" | "discard" {
	if (spare === undefined) return "fresh";
	if (daemon === undefined || spare.daemon !== daemon) return "discard";
	// a play on another origin, a remote project's, leaves this one for the next local play
	if (spare.origin !== playOrigin) return "fresh";
	// still on its way: a window made now is no slower than waiting for it
	if (!spare.ready) return "fresh";
	return "adopt";
}

/** Whether a spare still has a reason to be: a canvas open on the daemon that served it. */
export function keepSpare(spare: SpareFacts, now: SpareSurroundings): boolean {
	return now.canvasOpen && !now.remote && !now.quitting && now.daemon === spare.daemon;
}

/**
 * Whether to make the next spare. Only with a canvas open on this Mac's own
 * daemon, never while a play is still bringing its frame up, and never again
 * from a daemon that refused the page.
 */
export function shouldMakeSpare(spare: SpareFacts | undefined, now: SpareSurroundings): boolean {
	return (
		spare === undefined &&
		now.canvasOpen &&
		!now.remote &&
		!now.quitting &&
		now.daemon !== undefined &&
		now.refusedBy !== now.daemon &&
		now.awaitingReveal === 0
	);
}

/**
 * Whether a window's failed load leaves it with nothing to show: its own page
 * failed, not a frame inside it, and not a load another navigation replaced
 * (Chromium's -3), as recording's reopen does. A play window that fails so
 * will never reveal its frame, so it holds the next spare back no longer; a
 * play that is only slow holds it back however long it takes.
 */
export function loadFailedForGood(code: number, isMainFrame: boolean): boolean {
	return isMainFrame && code !== -3;
}

/** The spare's page on a daemon. */
export function spareUrl(origin: string): string {
	return `${origin}/player-assets/spare`;
}
