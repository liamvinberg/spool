import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { Cover } from "../../cover";
import { frameDocumentUrl } from "../api";
import { Thumbnail } from "../thumbnail";
import type { FrameState } from "./lifecycle";

/**
 * One frame on the canvas, rendering whatever the lifecycle says:
 *   picture: the still (or a quiet placeholder), no iframe in the DOM
 *   refreshing: a document booting behind the still, only to be photographed
 *   held: a document behind its still, only to answer the rail and
 *                the Select tool
 *   live: a readable document or the frame you went inside
 *
 * A readable HTML frame stays visible while Select owns the pointer. Below the
 * readable threshold its held document remains behind its still.
 *
 * memo'd hard: pans and zooms must never re-render shells — React
 * reconciling an iframe whose src changed reloads it and resets its state.
 */

export interface CoverPlan {
	/** The cover layer sits fully opaque over the (missing or booting) frame. */
	cover: boolean;
	image: "cover" | "placeholder";
	/** The 55% veil + mono "booting" label — the honest boot cover. */
	badge: boolean;
}

/**
 * The cover law (#8, #28, #112, #177): the still covers everything but the frame
 * you went inside, and covers that one until its loaded report. The veil +
 * "booting" badge belongs to a boot somebody asked for — going inside, or a
 * frame with nothing at all to stand in for it. The canvas borrows frames of
 * its own accord to photograph them, and announcing those is how one arrival
 * turns into seconds of badges rolling across the screen; a borrowed frame
 * holds its still and boots out of sight. A walk arrival is quiet the same way,
 * on the freshest still it has — its stored one (#110), a picture of a freshly
 * booted frame and so of the state a reboot lands in.
 *
 * A frame nobody went inside waits past loaded for its arrival report (#177).
 * Loaded is mid-arrival: an entry animation is at its beginning where the still
 * photographed its end, and a canvas frame may not have drawn a tick, so fading
 * there swaps a settled picture for black or a replayed entrance and then back.
 * Nothing was asking to interact with a frame the zoom promoted, so the wait
 * costs nothing; the frame you asked to go into keeps fading at loaded, because
 * watching the entrance play is what going in looks like.
 */
export function coverPlan(input: {
	state: FrameState;
	ready: boolean;
	/** Whether the document has reported that it finished arriving (#177). */
	settled: boolean;
	/** Whether this is the frame you went inside — looked at whether or not its time runs. */
	entered: boolean;
	/** Whether the frame has a cover to stand in for it at all. */
	covered: boolean;
	/** Whether this boot is a walk arrival — quiet, however it ends up covered. */
	walk: boolean;
	/**
	 * Whether the document this frame's last paint came from is still on
	 * screen while its replacement boots behind it (#253's no blink).
	 *
	 * A hand edit reloads the frame it just wrote, and a still is the wrong
	 * thing to reach for there: the picture on file is of the words before the
	 * edit, so covering with it would flash the old frame back. Holding the
	 * outgoing document is both truer and quieter, and while it holds there is
	 * nothing for a cover to stand in for.
	 */
	holding?: boolean;
}): CoverPlan {
	const { state, ready, settled, entered, covered, walk, holding = false } = input;
	return {
		// A live frame is what the canvas is showing, whether it is entered or
		// Select currently owns the pointer above it.
		cover: !holding && ((state !== "live" && !entered) || !ready || (!entered && !settled)),
		image: covered ? "cover" : "placeholder",
		// Going inside is the whole of "a boot somebody asked for". A borrowed
		// frame boots out of sight, and badging those is how one arrival becomes
		// seconds of badges rolling across the screen.
		badge: !holding && entered && !ready && !walk,
	};
}

export const FrameShell = memo(function FrameShell({
	project,
	name,
	state,
	ready,
	settled,
	entered,
	interactive,
	docNonce,
	holdNonce,
	cover,
	walkArrival,
	onIframe,
}: {
	project: string;
	name: string;
	state: FrameState;
	ready: boolean;
	/** Whether the document reported it finished arriving (#177). */
	settled: boolean;
	/** Whether this is the frame you went inside. */
	entered: boolean;
	/** Whether the entered iframe currently owns pointer input. */
	interactive: boolean;
	/** Bumped by SSE source changes — a new nonce reloads the document. */
	docNonce: number;
	/**
	 * The document to keep on screen while the current one boots (#253's no
	 * blink), or null for every ordinary reload.
	 *
	 * A hand edit reloads the very frame it wrote, and a reload is a remount:
	 * the iframe goes white, the still comes back, and the frame the words were
	 * just typed into blinks its old self at you. So a self-caused reload keeps
	 * the outgoing document mounted, on top and inert, until the incoming one
	 * reports loaded — its last paint held, exactly as it was, then swapped.
	 * The canvas owns the timing, because it is the one that hears the report.
	 */
	holdNonce: number | null;
	/** The frame's immutable cover image, absent when it has none to show. */
	cover: Cover | undefined;
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

	// The cover: shown for every non-live frame, and over a live one until it
	// boots, then fades without a white flash on entry (#8
	// thumbnail-then-hydrate).
	// The marker needs no latch of its own: it only silences the badge, which is
	// already gone by the time the cover fades. If a broken boot or mid-walk edit
	// retires the marker while the frame stays covered, the honest cover returns.
	// the document still on screen while this one boots, when there is one
	const held = holdNonce !== null && holdNonce !== docNonce ? holdNonce : null;
	const plan = coverPlan({
		state,
		ready,
		settled,
		entered,
		covered: cover !== undefined,
		walk: walkArrival,
		holding: held !== null,
	});
	const [veil, setVeil] = useState(plan.cover);
	useEffect(() => {
		if (plan.cover) {
			setVeil(true);
			return;
		}
		const linger = setTimeout(() => setVeil(false), 220);
		return () => clearTimeout(linger);
	}, [plan.cover]);

	return (
		<>
			{state !== "picture" && (
				<div
					className="absolute inset-0"
					style={{
						// A held document stays mounted for Select and the rail, but its
						// still remains on screen below the readable threshold.
						visibility: state === "live" || entered ? "visible" : "hidden",
					}}
				>
					{held !== null && (
						// keyed by its own nonce so React matches it to the node already
						// on screen rather than mounting a second document of it, and
						// left without a ref so the frame's boot state belongs to the
						// one booting behind it
						<iframe
							key={held}
							title={`${name} (held)`}
							aria-hidden="true"
							tabIndex={-1}
							allow="clipboard-write"
							sandbox="allow-scripts"
							src={frameDocumentUrl(project, name, held)}
							className="absolute inset-0 block h-full w-full border-0 bg-white"
							style={{ pointerEvents: "none", zIndex: 1 }}
						/>
					)}
					<iframe
						ref={refCb}
						key={docNonce}
						title={name}
						// A frame document opened on its own may write the clipboard, so
						// embedding it must not take that away (#181). Chrome's default
						// clipboard-write allowlist is self, which never matches a sandboxed
						// frame's opaque origin, so the delegation has to be spelled out.
						allow="clipboard-write"
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
			    browser caches a cover by URL. */}
			{(state === "live" || entered) && cover !== undefined && (
				<Thumbnail
					project={project}
					frame={name}
					cover={cover}
					alt={name}
					draggable={false}
					// a fresh capture replaces this image while the canvas is in
					// use; decoding it off the main thread keeps that invisible
					decoding="async"
					className="pointer-events-none absolute inset-0 h-full w-full bg-surface object-contain object-left-top"
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
					{plan.image === "cover" && cover !== undefined ? (
						// The still at its true shape, never stretched to the box: a cover
						// is the document photographed at one footprint, and a resize gives
						// the frame another before the recapture lands. Those seconds — and
						// every tick of the resize drag itself — used to draw the old
						// picture smeared `object-cover` across the new box. Contained at
						// the top-left corner it stays the picture it is, over the same
						// surface the placeholder stands on, which reads as a frame awaiting
						// its next paint. A cover whose shape matches its box — every frame
						// not mid-resize — fills it edge to edge exactly as before.
						<Thumbnail
							project={project}
							frame={name}
							cover={cover}
							alt={name}
							draggable={false}
							className="absolute inset-0 h-full w-full bg-surface object-contain object-left-top"
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
