import { memo, useCallback, useEffect, useRef, useState } from "react";
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

/** A walk arrival's cover (#28): the still taken just before the reboot. */
export interface WalkBoot {
	/** The self-capture data URL — absent when the target had none to give. */
	still?: string | undefined;
}

export interface CoverPlan {
	/** The cover layer sits fully opaque over the (missing or booting) frame. */
	cover: boolean;
	image: "still" | "thumb" | "placeholder";
	/** The 55% veil + mono "booting" label — the honest boot cover. */
	badge: boolean;
}

/**
 * The cover law (#8, #28): a boot is covered until its loaded report. A
 * standard boot wears the veil + "booting" badge; a walk arrival never does —
 * it holds the freshest still it has (the just-taken capture, else the cached
 * thumbnail) so the screen settles into life instead of visibly reloading.
 */
export function coverPlan(input: {
	state: FrameState;
	ready: boolean;
	hasThumb: boolean;
	walk: WalkBoot | null;
}): CoverPlan {
	const { state, ready, hasThumb, walk } = input;
	return {
		cover: state === "hibernated" || !ready,
		image: walk?.still !== undefined ? "still" : hasThumb ? "thumb" : "placeholder",
		badge: state !== "hibernated" && !ready && walk === null,
	};
}

export const FrameShell = memo(function FrameShell({
	project,
	name,
	state,
	ready,
	interactive,
	docNonce,
	thumbNonce,
	hasThumb,
	walkBoot,
	onIframe,
}: {
	project: string;
	name: string;
	state: FrameState;
	ready: boolean;
	/** Whether the entered iframe currently owns pointer input. */
	interactive: boolean;
	/** Bumped by SSE source changes — a new nonce reloads the document. */
	docNonce: number;
	/** Bumped when the cached thumbnail changes — refreshes covers. */
	thumbNonce: number;
	hasThumb: boolean;
	/** Set while the current boot is a walk arrival (#28) — quiet cover. */
	walkBoot: WalkBoot | undefined;
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
	const covered = state === "hibernated" || !ready;
	const [veil, setVeil] = useState(covered);
	useEffect(() => {
		if (covered) {
			setVeil(true);
			return;
		}
		const linger = setTimeout(() => setVeil(false), 220);
		return () => clearTimeout(linger);
	}, [covered]);

	// The walk marker is latched for the cover's whole appearance: the parent
	// retires it on the loaded report, but the still must survive the fade.
	// A marker retired while the frame is still covered (a broken boot, an
	// edit mid-walk) drops the latch — the honest cover returns.
	const [walkCover, setWalkCover] = useState<WalkBoot | null>(null);
	if ((covered || veil) && walkBoot !== undefined && walkCover !== walkBoot) setWalkCover(walkBoot);
	else if (covered && walkBoot === undefined && walkCover !== null) setWalkCover(null);
	else if (!covered && !veil && walkCover !== null) setWalkCover(null);

	const plan = coverPlan({ state, ready, hasThumb, walk: walkCover });

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
					style={{ pointerEvents: interactive ? "auto" : "none" }}
				/>
			)}
			{(plan.cover || veil) && (
				<div
					className="absolute inset-0"
					style={{ opacity: plan.cover ? 1 : 0, transition: "opacity 180ms ease-out" }}
				>
					{plan.image === "still" ? (
						<img
							src={walkCover?.still}
							alt={name}
							draggable={false}
							className="absolute inset-0 h-full w-full object-cover object-top"
						/>
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
