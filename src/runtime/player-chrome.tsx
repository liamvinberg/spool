import type { ComponentType, RefObject } from "react";
import { Fragment, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ExternalLinkDialog } from "./external-link-dialog";
import { exitChordLabel } from "./term-keys";

/**
 * The stage and pill (#24), matching Paper screens v1 "05 · player": the
 * frame letterboxed at native size on the near-black stage, or scaled to
 * fill a smaller viewport, and one floating pill — back, the name-stack, a
 * hairline, restart, the motion toggle, the hint toggle, close. Styling
 * lives in the served document's chrome stylesheet; this component owns
 * structure and wiring.
 */

export interface PlayerController {
	subscribe(listener: () => void): () => void;
	version(): number;
	read(): {
		frame: string;
		stack: string[];
		motion: boolean;
		hint: boolean;
		arrival: number;
		externalHref: string | null;
	};
	geometry(frame: string): { w: number; h: number };
	/** Stamps of this frame's coded-navigation elements, for the hint layer (#34). */
	hintStamps(frame: string): string[];
	/** Whether this screen is a terminal frame (#44) — the pill shows its exit chord. */
	terminal(frame: string): boolean;
	back(): void;
	restart(): void;
	toggleMotion(): void;
	toggleHint(): void;
	dismissExternal(): void;
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
	const { frame, stack, motion, hint, arrival, externalHref } = controller.read();
	const { w, h } = controller.geometry(frame);
	const viewport = useViewport();
	const scrollRef = useRef<HTMLDivElement | null>(null);
	const stamps = useMemo(() => controller.hintStamps(frame), [controller, frame]);
	const terminal = controller.terminal(frame);
	const Screen = frames[frame];
	// the session's history is unbounded (#5); the readout is not — a loop-
	// heavy walk shows its tail, the full path rides the title
	const trail = stack.slice(-3);
	const buried = stack.length - trail.length;

	return (
		<div className="spool-stage">
			<div className="spool-screen" style={{ width: w, height: h, transform: place(w, h, viewport) }}>
				<div
					ref={scrollRef}
					className="spool-screen-scroll"
					style={{ position: "relative", zIndex: 0, isolation: "isolate" }}
				>
					{Screen === undefined ? null : <Screen key={arrival} />}
				</div>
				{hint && <HintOverlay stamps={stamps} scrollRef={scrollRef} arrival={arrival} />}
				{externalHref !== null && (
					<ExternalLinkDialog
						href={externalHref}
						onStay={controller.dismissExternal}
						onOpen={controller.dismissExternal}
					/>
				)}
			</div>
			<div className="spool-pill" inert={externalHref !== null}>
				<button
					type="button"
					id="spool-back"
					aria-label="Back"
					disabled={externalHref !== null || stack.length === 0}
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
				{terminal && (
					<span
						className="spool-term-chord"
						title="the terminal owns every key — the chord hands the keyboard back"
					>
						{exitChordLabel(navigator.platform)}
					</span>
				)}
				<span className="spool-rule" />
				<button
					type="button"
					id="spool-restart"
					aria-label="Restart"
					disabled={externalHref !== null}
					onClick={controller.restart}
				>
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
					disabled={externalHref !== null}
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
				<button
					type="button"
					id="spool-hint"
					className={hint ? "spool-hint-toggle is-on" : "spool-hint-toggle"}
					aria-label="Hints"
					aria-pressed={hint}
					disabled={externalHref !== null}
					onClick={controller.toggleHint}
				>
					<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
						<rect
							x="2"
							y="3.5"
							width="10"
							height="7"
							rx="2"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.5"
						/>
					</svg>
				</button>
				<button
					type="button"
					id="spool-close"
					aria-label="Close"
					disabled={externalHref !== null}
					onClick={controller.close}
				>
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

interface HintBox {
	x: number;
	y: number;
	w: number;
	h: number;
	r: number;
}

/**
 * The hint layer (#34): one outline over every element that navigates — the
 * live [data-go] carriers plus the stamped ui.go carriers the config names.
 * Overlay chrome only, pointer-transparent, measured against the screen
 * viewport so scroll and scale never lie; the frame's own DOM is never
 * touched (the parity law).
 */
function HintOverlay({
	stamps,
	scrollRef,
	arrival,
}: {
	stamps: string[];
	scrollRef: RefObject<HTMLDivElement | null>;
	arrival: number;
}) {
	const [boxes, setBoxes] = useState<HintBox[]>([]);

	// biome-ignore lint/correctness/useExhaustiveDependencies(arrival): a screen swap re-measures — the new screen's elements are the point
	useEffect(() => {
		const scroller = scrollRef.current;
		if (scroller === null) return;
		const measure = () => {
			const screenRect = scroller.getBoundingClientRect();
			// the screen is transformed: divide measured pixels back to frame units
			const scale = scroller.clientWidth > 0 ? screenRect.width / scroller.clientWidth : 1;
			const carriers = new Set<Element>(scroller.querySelectorAll("[data-go]"));
			if (stamps.length > 0) {
				const wanted = new Set(stamps);
				for (const el of scroller.querySelectorAll("[data-spool-source]")) {
					const stamp = el.getAttribute("data-spool-source");
					if (stamp !== null && wanted.has(stamp)) carriers.add(el);
				}
			}
			setBoxes(
				[...carriers].map((el) => {
					const rect = el.getBoundingClientRect();
					let radius = 0;
					try {
						radius = Number.parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
					} catch {
						// a detached element outlines square rather than not at all
					}
					return {
						x: (rect.x - screenRect.x) / scale,
						y: (rect.y - screenRect.y) / scale,
						w: rect.width / scale,
						h: rect.height / scale,
						r: radius,
					};
				}),
			);
		};
		measure();
		scroller.addEventListener("scroll", measure, { passive: true });
		window.addEventListener("resize", measure);
		return () => {
			scroller.removeEventListener("scroll", measure);
			window.removeEventListener("resize", measure);
		};
	}, [stamps, scrollRef, arrival]);

	return (
		<div className="spool-hints" aria-hidden="true">
			{boxes.map((box, index) => (
				<div
					// biome-ignore lint/suspicious/noArrayIndexKey: boxes are rebuilt whole per measure — position is identity
					key={index}
					className="spool-hint"
					style={{ left: box.x, top: box.y, width: box.w, height: box.h, borderRadius: box.r }}
				/>
			))}
		</div>
	);
}

/**
 * A live terminal screen (#44): the same term document the canvas embeds,
 * hosted over the daemon's last grid as a boot poster — parity by
 * construction, one emulator, one host protocol. The walk arriving is the
 * enter gesture, so the document is focused as soon as it exists; the runtime
 * inside relays streaming, keys, and the exit chord to this host.
 */
export function TermScreen({
	src,
	poster,
	title,
	ensureFresh,
	register,
}: {
	src: string;
	poster: string;
	title: string;
	/** Resolves once the session may be joined — a restarted walk asks for a clean process first. */
	ensureFresh: () => Promise<void>;
	/** Scopes the walk's witness: the current screen's iframe, registered while mounted. */
	register: (el: HTMLIFrameElement | null) => void;
}) {
	const [ready, setReady] = useState(false);
	useEffect(() => {
		let alive = true;
		void ensureFresh().then(() => {
			if (alive) setReady(true);
		});
		return () => {
			alive = false;
		};
	}, [ensureFresh]);
	return (
		<div className="spool-term-screen">
			{/* biome-ignore lint/security/noDangerouslySetInnerHtml: the svg is the daemon's own grid rasterization, text-escaped at render */}
			<div className="spool-term-poster" aria-hidden dangerouslySetInnerHTML={{ __html: poster }} />
			{ready && (
				<iframe
					ref={(el) => {
						register(el);
						el?.focus();
					}}
					src={src}
					title={title}
					sandbox="allow-scripts"
					onLoad={(event) => event.currentTarget.focus()}
				/>
			)}
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
