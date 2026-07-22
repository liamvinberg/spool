import type { ComponentType } from "react";
import { Fragment, useEffect, useState, useSyncExternalStore } from "react";

/**
 * The stage and pill (#24), matching Paper screens v1 "05 · player": the
 * frame letterboxed at native size on the near-black stage, or scaled to
 * fill a smaller viewport, and one floating pill — back, the name-stack, a
 * hairline, restart, the motion toggle, close. Styling lives in the served
 * document's chrome stylesheet; this component owns structure and wiring.
 */

export interface PlayerController {
	subscribe(listener: () => void): () => void;
	version(): number;
	read(): { frame: string; stack: string[]; motion: boolean; arrival: number };
	geometry(frame: string): { w: number; h: number };
	back(): void;
	restart(): void;
	toggleMotion(): void;
	close(): void;
}

export function Player({
	frames,
	controller,
}: {
	frames: Record<string, ComponentType>;
	controller: PlayerController;
}) {
	useSyncExternalStore(controller.subscribe, controller.version);
	const { frame, stack, motion, arrival } = controller.read();
	const { w, h } = controller.geometry(frame);
	const viewport = useViewport();
	const Screen = frames[frame];
	// the session's history is unbounded (#5); the readout is not — a loop-
	// heavy walk shows its tail, the full path rides the title
	const trail = stack.slice(-3);
	const buried = stack.length - trail.length;

	return (
		<div className="spool-stage">
			<div className="spool-screen" style={{ width: w, height: h, transform: place(w, h, viewport) }}>
				<div className="spool-screen-scroll">{Screen === undefined ? null : <Screen key={arrival} />}</div>
			</div>
			<div className="spool-pill">
				<button
					type="button"
					id="spool-back"
					aria-label="Back"
					disabled={stack.length === 0}
					onClick={controller.back}
				>
					<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
						<path
							d="M10 3.5 L5.5 8 L10 12.5"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.5"
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
					</svg>
				</button>
				<span className="spool-stack" title={[...stack, frame].join(" / ")}>
					{buried > 0 && (
						<Fragment>
							<span>…</span>
							<span>/</span>
						</Fragment>
					)}
					{trail.map((name, position) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: the same frame can sit at two stack depths — position IS a name-stack entry's identity
						<Fragment key={`${position}:${name}`}>
							<span>{name}</span>
							<span>/</span>
						</Fragment>
					))}
					<span className="is-current">{frame}</span>
				</span>
				<span className="spool-rule" />
				<button type="button" id="spool-restart" aria-label="Restart" onClick={controller.restart}>
					<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
						<path
							d="M9.4 3.25 A5 5 0 1 1 6.3 3.3"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.5"
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
						<path
							d="M8.4 1.5 L6.3 3.3 L8 5"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.5"
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
					</svg>
				</button>
				<button
					type="button"
					id="spool-motion"
					className={motion ? "spool-motion is-on" : "spool-motion"}
					aria-label="Motion"
					aria-pressed={motion}
					onClick={controller.toggleMotion}
				>
					<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
						<path
							d="M1.5 7 Q3.25 2.8 5 7 T8.5 7 T12 7"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.5"
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
					</svg>
				</button>
				<button type="button" id="spool-close" aria-label="Close" onClick={controller.close}>
					<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
						<path
							d="M4 4 L12 12 M12 4 L4 12"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.5"
							strokeLinecap="round"
						/>
					</svg>
				</button>
			</div>
		</div>
	);
}

interface Viewport {
	vw: number;
	vh: number;
}

function useViewport(): Viewport {
	const [viewport, setViewport] = useState<Viewport>(() => ({ vw: window.innerWidth, vh: window.innerHeight }));
	useEffect(() => {
		const measure = () => setViewport({ vw: window.innerWidth, vh: window.innerHeight });
		window.addEventListener("resize", measure);
		return () => window.removeEventListener("resize", measure);
	}, []);
	return viewport;
}

/** Touch is the immersive context; anything with a fine pointer letterboxes. */
const coarsePointer = window.matchMedia("(pointer: coarse)").matches;

/**
 * Screens v1 placement, split by pointer. Fine pointer: always the artboard
 * posture — 28px from the top, scaled down until the frame clears the stage
 * margins (56 across, 120 below), so the pill never covers the frame's own
 * bottom UI. Coarse pointer — a phone — keeps full-bleed: scaled to the
 * whole viewport, centered, pill overlaying. Never above native size either
 * way: a small frame on a big stage sits at its own pixels.
 */
function place(w: number, h: number, { vw, vh }: Viewport): string {
	if (!coarsePointer) {
		const scale = Math.min(1, (vw - 56) / w, (vh - 120) / h);
		return `translate(${Math.round((vw - w * scale) / 2)}px, 28px) scale(${scale})`;
	}
	const scale = Math.min(1, vw / w, vh / h);
	return `translate(${(vw - w * scale) / 2}px, ${(vh - h * scale) / 2}px) scale(${scale})`;
}
