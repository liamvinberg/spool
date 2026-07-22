import { memo, useCallback, useEffect, useRef, useState } from "react";
import { frameDocumentUrl, thumbUrl } from "../api";
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

export const FrameShell = memo(function FrameShell({
	project,
	name,
	state,
	ready,
	entered,
	docNonce,
	thumbNonce,
	hasThumb,
	onIframe,
}: {
	project: string;
	name: string;
	state: FrameState;
	ready: boolean;
	entered: boolean;
	/** Bumped by SSE source changes — a new nonce reloads the document. */
	docNonce: number;
	/** Bumped when the cached thumbnail changes — refreshes covers. */
	thumbNonce: number;
	hasThumb: boolean;
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

	const booting = state !== "hibernated" && !ready;

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
					style={{ pointerEvents: entered ? "auto" : "none" }}
				/>
			)}
			{(covered || veil) && (
				<div
					className="absolute inset-0"
					style={{ opacity: covered ? 1 : 0, transition: "opacity 180ms ease-out" }}
				>
					{hasThumb ? (
						<img
							src={thumbUrl(project, name, thumbNonce)}
							alt={name}
							draggable={false}
							className="absolute inset-0 h-full w-full object-cover object-top"
						/>
					) : (
						<div className="absolute inset-0 flex items-center justify-center bg-surface">
							<span className="font-mono text-sm text-muted">{name}</span>
						</div>
					)}
					{booting && (
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
			{!entered && <div className="absolute inset-0" />}
		</>
	);
});
