import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { TerminalCoverState } from "../../daemon/projection";
import { frameDocumentUrl } from "../api";
import { Thumbnail } from "../thumbnail";
import type { FrameState } from "./lifecycle";
import { freezeMessage } from "./protocol";

/**
 * One frame on the canvas, rendering whatever the lifecycle says:
 *   hibernated — thumbnail (or quiet placeholder), no iframe in the DOM
 *   warm       — iframe mounted, time frozen inside, crisp at any zoom
 *   live       — the real thing; pointer events only when entered
 *
 * memo'd hard: pans and zooms must never re-render shells — React
 * reconciling an iframe whose src changed reloads it and resets its state.
 */

export interface CoverPlan {
	/** The cover layer sits fully opaque over the (missing or booting) frame. */
	cover: boolean;
	image: "thumb" | "placeholder" | "terminal-message";
	/** The 55% veil + mono "booting" label — the honest boot cover. */
	badge: boolean;
	message?: string;
}

/**
 * The cover law (#8, #28): a boot is covered until its loaded report. The veil
 * + "booting" badge belongs to a boot somebody asked for — going inside, or a
 * frame with nothing at all to stand in for it. The canvas mounts frames of its
 * own accord all the time, a few per sweep, and announcing those is how one
 * arrival turns into seconds of badges rolling across the screen; an ambient
 * mount holds its still instead and simply becomes real. A walk arrival has
 * always worked this way, on the freshest still it has — its stored one (#110),
 * a picture of a freshly booted frame and so of the state a reboot lands in.
 */
export function coverPlan(input: {
	state: FrameState;
	ready: boolean;
	hasThumb: boolean;
	/** Whether this boot is one the person asked for by going inside. */
	entered: boolean;
	/** Whether this boot is a walk arrival — quiet, however it ends up covered. */
	walk: boolean;
	terminalCover?: TerminalCoverState | undefined;
}): CoverPlan {
	const { state, ready, hasThumb, entered, walk, terminalCover } = input;
	if (terminalCover?.kind === "stale" || terminalCover?.kind === "never-run") {
		return {
			cover: true,
			image: "terminal-message",
			badge: false,
			message: terminalCover.message,
		};
	}
	return {
		cover: state === "hibernated" || !ready,
		image: hasThumb ? "thumb" : "placeholder",
		badge: state !== "hibernated" && !ready && !walk && (entered || !hasThumb),
	};
}

export const FrameShell = memo(function FrameShell({
	project,
	name,
	state,
	ready,
	entered,
	stilled,
	interactive,
	docNonce,
	thumbNonce,
	hasThumb,
	terminalCover,
	walkArrival,
	onIframe,
}: {
	project: string;
	name: string;
	state: FrameState;
	ready: boolean;
	/** Whether this is the frame gone inside — its boot is announced, and it never stills. */
	entered: boolean;
	/**
	 * The camera is changing zoom and this frame has a still sharp enough to
	 * stand in for it. Painting a mounted document at each new scale is the
	 * whole of the zoom stutter; the still is one texture the compositor
	 * already knows how to scale, and it is a picture of this frame, so the
	 * swap is invisible.
	 */
	stilled: boolean;
	/** Whether the entered iframe currently owns pointer input. */
	interactive: boolean;
	/** Bumped by SSE source changes — a new nonce reloads the document. */
	docNonce: number;
	/** Bumped when the cached thumbnail changes — refreshes covers. */
	thumbNonce: number;
	hasThumb: boolean;
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

	// warm = time stopped inside (#8); re-sent when ready flips so a booting
	// frame receives its freeze once the shim's listener exists
	// biome-ignore lint/correctness/useExhaustiveDependencies(ready): the re-send on boot is the point
	useEffect(() => {
		elRef.current?.contentWindow?.postMessage(freezeMessage(state === "warm"), "*");
	}, [state, ready]);

	// The cover: shown while nothing is mounted or a mounted frame hasn't
	// booted, then fades — no white flash on entry (#8 thumbnail-then-hydrate).
	const unavailableTerminal = terminalCover?.kind === "stale" || terminalCover?.kind === "never-run";
	const covered = unavailableTerminal || state === "hibernated" || !ready;
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
	const plan = coverPlan({ state, ready, hasThumb, entered, walk: walkArrival, terminalCover });

	return (
		<>
			{state !== "hibernated" && (
				<iframe
					ref={refCb}
					key={docNonce}
					title={name}
					sandbox="allow-scripts"
					src={frameDocumentUrl(project, name, docNonce)}
					className="block h-full w-full border-0 bg-white"
					style={{
						pointerEvents: interactive ? "auto" : "none",
						// unpainted, not unmounted: the document keeps its state,
						// its scroll, and its boot, and comes straight back
						visibility: stilled ? "hidden" : "visible",
					}}
				/>
			)}
			{/* The stand-in, mounted for as long as the document is. A still first
			    mounted when the gesture starts is still decoding when it is needed,
			    and the frame shows blank instead — so it waits here, loaded and
			    unpainted, and a gesture only flips it visible. No fade either way:
			    it is the same picture, and a transition between them would only
			    ever read as a ghost of one over the other. */}
			{state !== "hibernated" && hasThumb && (
				<Thumbnail
					project={project}
					frame={name}
					nonce={thumbNonce}
					alt={name}
					draggable={false}
					// a fresh capture replaces this image while the canvas is in
					// use; decoding it off the main thread keeps that invisible
					decoding="async"
					className="pointer-events-none absolute inset-0 h-full w-full object-cover object-top"
					style={{ visibility: stilled ? "visible" : "hidden" }}
				/>
			)}
			{(plan.cover || veil) && (
				<div
					className="absolute inset-0"
					style={{ opacity: plan.cover ? 1 : 0, transition: "opacity 180ms ease-out" }}
				>
					{plan.image === "terminal-message" ? (
						<div className="absolute inset-0 flex items-center justify-center bg-surface px-8 text-center">
							<span className="max-w-lg font-mono text-xs leading-relaxed text-muted">{plan.message}</span>
						</div>
					) : plan.image === "thumb" ? (
						<Thumbnail
							project={project}
							frame={name}
							nonce={thumbNonce}
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
