import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { Cover } from "../../cover";
import type { TerminalCoverState } from "../../daemon/projection";
import { frameDocumentUrl } from "../api";
import { Thumbnail } from "../thumbnail";
import type { FrameState } from "./lifecycle";
import { freezeMessage } from "./protocol";

/**
 * One frame on the canvas, rendering whatever the lifecycle says:
 *   picture    — the still (or a quiet placeholder), no iframe in the DOM
 *   refreshing — a document booting behind the still, only to be photographed
 *   held       — a document with its time stopped, only to answer the rail
 *                and the Select tool; its picture is what you see
 *   live       — the frame you went inside: the real thing, and the only
 *                document anyone ever looks at
 *
 * The still stands in for every frame but the one you are inside, at every
 * zoom, for as long as you are not inside it (#112). Freezing is
 * `content-visibility: hidden` on the iframe's own wrapper — Chromium stops the
 * nested document's rAF, style, layout and paint at engine level (#84) — and it
 * waits for the boot, because a document locked before it ever laid out has no
 * size to lay out into and nothing for the rail to read.
 *
 * memo'd hard: pans and zooms must never re-render shells — React
 * reconciling an iframe whose src changed reloads it and resets its state.
 */

export interface CoverPlan {
	/** The cover layer sits fully opaque over the (missing or booting) frame. */
	cover: boolean;
	image: "cover" | "placeholder" | "terminal-message";
	/** The 55% veil + mono "booting" label — the honest boot cover. */
	badge: boolean;
	message?: string;
}

/**
 * The cover law (#8, #28, #112): the still covers everything but the frame you
 * went inside, and covers that one until its loaded report. The veil +
 * "booting" badge belongs to a boot somebody asked for — going inside, or a
 * frame with nothing at all to stand in for it. The canvas borrows frames of
 * its own accord to photograph them, and announcing those is how one arrival
 * turns into seconds of badges rolling across the screen; a borrowed frame
 * holds its still and boots out of sight. A walk arrival is quiet the same way,
 * on the freshest still it has — its stored one (#110), a picture of a freshly
 * booted frame and so of the state a reboot lands in.
 */
export function coverPlan(input: {
	state: FrameState;
	ready: boolean;
	/** Whether this is the frame you went inside — looked at whether or not its time runs. */
	entered: boolean;
	/** Whether the frame has a cover to stand in for it at all. */
	covered: boolean;
	/** Whether this boot is a walk arrival — quiet, however it ends up covered. */
	walk: boolean;
	terminalCover?: TerminalCoverState | undefined;
}): CoverPlan {
	const { state, ready, entered, covered, walk, terminalCover } = input;
	if (terminalCover?.kind === "stale" || terminalCover?.kind === "never-run") {
		return {
			cover: true,
			image: "terminal-message",
			badge: false,
			message: terminalCover.message,
		};
	}
	return {
		// The frame you went inside is the one document anybody looks at, and it
		// stays that while ⌘ holds its time still.
		cover: (state !== "live" && !entered) || !ready,
		image: covered ? "cover" : "placeholder",
		// Going inside is the whole of "a boot somebody asked for". A borrowed
		// frame boots out of sight, and badging those is how one arrival becomes
		// seconds of badges rolling across the screen.
		badge: entered && !ready && !walk,
	};
}

export const FrameShell = memo(function FrameShell({
	project,
	name,
	state,
	ready,
	entered,
	interactive,
	docNonce,
	cover,
	coverSizes,
	terminal,
	terminalCover,
	walkArrival,
	onIframe,
}: {
	project: string;
	name: string;
	state: FrameState;
	ready: boolean;
	/**
	 * Whether this is the frame you went inside. It outlives `live`: holding the
	 * platform modifier freezes the frame you are in so an element can be reached
	 * without it moving, and a frame you are inside is one you are looking at
	 * however its time is running.
	 */
	entered: boolean;
	/** Whether the entered iframe currently owns pointer input. */
	interactive: boolean;
	/** A terminal frame: its freeze is a SIGSTOP the daemon owns, not a CSS lock. */
	terminal: boolean;
	/** Bumped by SSE source changes — a new nonce reloads the document. */
	docNonce: number;
	/** The frame's cover ladder (#111) — absent when it has none to show. */
	cover: Cover | undefined;
	/** The rung the camera asks for, as a CSS length, quantized to the rung boundaries. */
	coverSizes: string | undefined;
	/** Terminal-only current/stale/never-run cover truth from the projection. */
	terminalCover: TerminalCoverState | undefined;
	/** Set while the current boot is a walk arrival (#28) — quiet cover. */
	walkArrival: boolean;
	onIframe: (name: string, el: HTMLIFrameElement | null) => void;
}) {
	// stable ref callback: an inline arrow re-attaches per render, and the
	// detach side clears the frame's boot state (see lifecycle.onIframe)
	const elRef = useRef<HTMLIFrameElement | null>(null);
	const refCb = useCallback(
		(el: HTMLIFrameElement | null) => {
			elRef.current = el;
			onIframe(name, el);
		},
		[name, onIframe],
	);

	// A terminal's freeze is the one that no CSS can reach: `held` SIGSTOPs the
	// real process behind the frame (daemon/term-sessions.ts), and the message is
	// the only way to ask for it. html frames freeze at engine level instead, in
	// the wrapper's content-visibility below. Re-sent when ready flips so a
	// booting terminal receives its freeze once its runtime's listener exists.
	// biome-ignore lint/correctness/useExhaustiveDependencies(ready): the re-send on boot is the point
	useEffect(() => {
		if (terminal) elRef.current?.contentWindow?.postMessage(freezeMessage(state === "held"), "*");
	}, [state, ready, terminal]);

	// The cover: shown for every frame but the one you are inside, and over that
	// one until it boots, then fades — no white flash on entry (#8
	// thumbnail-then-hydrate).
	const unavailableTerminal = terminalCover?.kind === "stale" || terminalCover?.kind === "never-run";
	const covered = unavailableTerminal || (state !== "live" && !entered) || !ready;
	const [veil, setVeil] = useState(covered);
	useEffect(() => {
		if (covered) {
			setVeil(true);
			return;
		}
		const linger = setTimeout(() => setVeil(false), 220);
		return () => clearTimeout(linger);
	}, [covered]);

	// The marker needs no latch of its own: it only ever silences the badge, and
	// the badge is already gone by the time the cover fades. A marker the parent
	// retires while the frame is still covered — a broken boot, an edit mid-walk
	// — brings the honest cover straight back, which is the point.
	const plan = coverPlan({ state, ready, entered, covered: cover !== undefined, walk: walkArrival, terminalCover });

	return (
		<>
			{state !== "picture" && (
				<div
					className="absolute inset-0"
					style={{
						// Unpainted, not unmounted. Only the frame you went inside is
						// ever looked at; a borrowed frame has to run to finish
						// arriving, so it is hidden rather than stopped, and a held one
						// you are not inside is stopped outright below.
						visibility: state === "live" || entered ? "visible" : "hidden",
						// Time stopped at engine level (#84), which is strictly more
						// than the shim's own freeze could hold. Two conditions on it.
						// It waits for the boot, because a document locked before it
						// ever laid out has no size to lay out into and the rail would
						// find nothing in it to read. And it never locks the frame you
						// are inside: the lock is also a blindfold, and freezing that
						// one would put its old still under your cursor while you pick
						// against the DOM behind it. ⌘ over an entered frame takes the
						// pointer back and leaves its time running.
						contentVisibility: state === "held" && ready && !entered ? "hidden" : "visible",
					}}
				>
					<iframe
						ref={refCb}
						key={docNonce}
						title={name}
						sandbox="allow-scripts"
						src={frameDocumentUrl(project, name, docNonce)}
						className="block h-full w-full border-0 bg-white"
						style={{ pointerEvents: interactive ? "auto" : "none" }}
					/>
				</div>
			)}
			{/* The stand-in, decoded while you are inside and needed the instant you
			    leave. A still first mounted at that moment is still decoding when it
			    is wanted, and the frame shows blank instead. It names the same
			    addresses as the cover layer below, so the two are one request: the
			    browser caches a cover by URL, and both ask for the rung the same
			    `sizes` selects (#111). */}
			{(state === "live" || entered) && cover !== undefined && (
				<Thumbnail
					project={project}
					frame={name}
					cover={cover}
					sizes={coverSizes}
					alt={name}
					draggable={false}
					// a fresh capture replaces this image while the canvas is in
					// use; decoding it off the main thread keeps that invisible
					decoding="async"
					className="pointer-events-none absolute inset-0 h-full w-full object-cover object-top"
					style={{ visibility: "hidden" }}
				/>
			)}
			{(plan.cover || veil) && (
				<div
					data-frame-cover={name}
					// A still is what the canvas draws, never something it can hit: the
					// frame beneath owns the pointer, and the fade out of an entered
					// frame's cover must not swallow the first click into it.
					className="pointer-events-none absolute inset-0"
					style={{ opacity: plan.cover ? 1 : 0, transition: "opacity 180ms ease-out" }}
				>
					{plan.image === "terminal-message" ? (
						<div className="absolute inset-0 flex items-center justify-center bg-surface px-8 text-center">
							<span className="max-w-lg font-mono text-xs leading-relaxed text-muted">{plan.message}</span>
						</div>
					) : plan.image === "cover" && cover !== undefined ? (
						<Thumbnail
							project={project}
							frame={name}
							cover={cover}
							sizes={coverSizes}
							alt={name}
							draggable={false}
							className="absolute inset-0 h-full w-full object-cover object-top"
						/>
					) : (
						<div className="absolute inset-0 flex items-center justify-center bg-surface">
							<span className="font-mono text-sm text-muted">{name}</span>
						</div>
					)}
					{plan.badge && (
						<>
							{/* boot cover per the system page: bg veil at 55%, mono "booting" */}
							<div className="absolute inset-0 bg-bg opacity-55" />
							<div className="absolute inset-0 flex items-center justify-center">
								<span className="font-mono text-xs text-text">booting</span>
							</div>
						</>
					)}
				</div>
			)}
			{!interactive && <div className="absolute inset-0" />}
		</>
	);
});
