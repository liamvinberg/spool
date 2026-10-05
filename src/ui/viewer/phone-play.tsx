import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { DesignFrame } from "../../daemon/design-projection";
import type { Box } from "../canvas/camera";
import type { SessionRecord } from "../canvas/protocol";
import { contained, isDesktop, type PhoneScreen, useScreen } from "./phone";
import { GROW, reducedMotion, usePlayedDocument, walkable } from "./viewer-player";

/** How far the right edge is pulled before letting go leaves, and how fast a shorter pull must be. */
const PULL_LEAVES = 90;
const PULL_FLICK = { far: 24, speed: 0.6 };
/** When the pull's hint shows, and goes, after a frame opens. */
const HINT_MS = { from: 700, to: 3400 };

interface Played {
	frame: string;
	arrival: number;
	/** The document this arrival plays, fixed when it arrives: a save never moves anyone mid-flow. */
	src: string;
}

/**
 * A frame played on a phone (DEV-115, DEV-161), with no chrome at all. A phone frame fills the whole screen, in a
 * fixed iframe at the window's full height, under the notch and the home bar, and pads itself by the safe areas
 * it is told. A desktop frame plays whole at its authored size, scaled: small and with its size upright, asking
 * for the phone to be turned, and as large as the screen allows turned.
 *
 * Walks inside it are the frame's own document asking to go, answered as the canvas answers them. Where there is
 * somewhere to go back to (`onClosed`), the frame grows out of its cover, a pull from the right edge shrinks it
 * back under the thumb, and turning a turned desktop frame upright again leaves it. The left edge stays iOS's.
 */
export function PhonePlay({
	frames,
	documentOf,
	walksAnywhere = false,
	start,
	coverOf,
	spotOf,
	onWalked,
	onClosed,
}: {
	frames: readonly DesignFrame[];
	documentOf: (frame: string) => string;
	/** Walk to any frame a document names: an outsider walking off the shared pages is told it isn't shared. */
	walksAnywhere?: boolean;
	/** The frame to play; another one while open is a walk to it. */
	start: string;
	/** A frame's cover, standing in until its document has drawn. */
	coverOf: (frame: string) => string | undefined;
	/** Where a frame's cover stands on screen, to grow out of and shrink back into; null where it isn't in sight. */
	spotOf: (frame: string) => Box | null;
	onWalked: (frame: string) => void;
	/** Leaving, for a frame played from somewhere it can go back to. */
	onClosed?: () => void;
}) {
	const screen = useScreen();
	const iframe = useRef<HTMLIFrameElement | null>(null);
	const layer = useRef<HTMLDivElement | null>(null);
	const backdrop = useRef<HTMLDivElement | null>(null);
	const session = useRef<SessionRecord | null>(null);
	const [played, setPlayed] = useState<Played>(() => ({ frame: start, arrival: 0, src: documentOf(start) }));
	const [drawn, setDrawn] = useState(-1);
	const [hint, setHint] = useState(false);
	const latest = useRef({ played, frames, documentOf, onWalked, onClosed, spotOf });
	latest.current = { played, frames, documentOf, onWalked, onClosed, spotOf };
	const geometry = frames.find((frame) => frame.name === played.frame) ?? { w: 390, h: 844 };
	const desktop = isDesktop(geometry);
	const box = desktop ? contained(screen, geometry) : null;
	const screenRef = useRef(screen);
	screenRef.current = screen;

	const walk = useCallback((frame: string) => {
		const { played, documentOf, onWalked } = latest.current;
		session.current = null;
		setPlayed({ frame, arrival: played.arrival + 1, src: documentOf(frame) });
		onWalked(frame);
	}, []);

	usePlayedDocument(iframe, session, {
		frame: () => latest.current.played.frame,
		walkable: (frame) => walkable(latest.current.frames, walksAnywhere, frame),
		walk,
		external: (href) => window.open(href, "_blank", "noopener,noreferrer"),
	});

	// the URL naming another frame while open (back and forward) walks to it
	useEffect(() => {
		if (latest.current.played.frame !== start) walk(start);
	}, [start, walk]);

	const leaving = useRef(false);
	const leave = useCallback(() => {
		const { onClosed, played, spotOf, frames } = latest.current;
		const el = layer.current;
		if (onClosed === undefined || leaving.current) return;
		leaving.current = true;
		const spot = spotOf(played.frame);
		if (el === null || reducedMotion()) {
			onClosed();
			return;
		}
		const geometry = frames.find((frame) => frame.name === played.frame) ?? { w: 390, h: 844 };
		backdrop.current?.animate([{ opacity: backdrop.current.style.opacity || 1 }, { opacity: 0 }], {
			...GROW,
			fill: "forwards",
		});
		el.animate(
			[
				{ transform: el.style.transform || "none", borderRadius: el.style.borderRadius || "0px", opacity: 1 },
				spot === null
					? { transform: el.style.transform || "none", opacity: 0 }
					: { transform: grownFrom(spot, shownOf(screenRef.current, geometry)), borderRadius: "12px", opacity: 1 },
			],
			{ ...GROW, fill: "forwards" },
		).onfinish = () => onClosed();
	}, []);

	// it grows out of its cover, as it opens
	// biome-ignore lint/correctness/useExhaustiveDependencies: only the frame it opened on grows
	useLayoutEffect(() => {
		const el = layer.current;
		const spot = latest.current.spotOf(start);
		if (el === null || spot === null || reducedMotion()) return;
		el.animate(
			[
				{ transform: grownFrom(spot, shownOf(screenRef.current, geometry)), borderRadius: "12px" },
				{ transform: "none", borderRadius: "0px" },
			],
			GROW,
		);
		backdrop.current?.animate([{ opacity: 0 }, { opacity: 1 }], GROW);
	}, []);

	// a turned desktop frame turned upright again is done with
	const wasTurned = useRef(screen.landscape);
	useEffect(() => {
		if (wasTurned.current && !screen.landscape && desktop) leave();
		wasTurned.current = screen.landscape;
	}, [screen.landscape, desktop, leave]);

	useEffect(() => {
		if (onClosed === undefined) return;
		const show = setTimeout(() => setHint(true), HINT_MS.from);
		const hide = setTimeout(() => setHint(false), HINT_MS.to);
		return () => {
			clearTimeout(show);
			clearTimeout(hide);
		};
	}, [onClosed]);

	// the pull from the right edge: the frame steps back under the thumb, and goes once pulled far or fast
	const pulling = useRef<{ x: number; at: number; far: number } | null>(null);
	const pulled = (far: number) => {
		const el = layer.current;
		if (el === null) return;
		const { w, h } = screenRef.current;
		const scale = 1 - (Math.min(far, 320) / 320) * 0.32;
		el.style.transform = `translate(${(-far * 0.45 + ((1 - scale) * w) / 2).toFixed(1)}px, ${(((1 - scale) * h) / 2).toFixed(1)}px) scale(${scale.toFixed(4)})`;
		el.style.borderRadius = `${((Math.min(far, 60) / 60) * 40).toFixed(1)}px`;
		if (backdrop.current !== null) backdrop.current.style.opacity = String(1 - (Math.min(far, 420) / 420) * 0.85);
	};
	const settle = () => {
		const el = layer.current;
		if (el === null) return;
		const from = { transform: el.style.transform, borderRadius: el.style.borderRadius };
		el.style.transform = "";
		el.style.borderRadius = "";
		if (backdrop.current !== null) backdrop.current.style.opacity = "";
		if (!reducedMotion()) el.animate([from, { transform: "none", borderRadius: "0px" }], GROW);
	};

	const cover = coverOf(played.frame);
	return (
		<div className="fixed inset-0 z-30 overflow-hidden" data-phone-play={played.frame}>
			<div ref={backdrop} className="absolute inset-0 bg-[#000]" />
			<div ref={layer} className="absolute inset-0 origin-top-left overflow-hidden bg-[#000]">
				{cover !== undefined && drawn !== played.arrival && (
					<img
						src={cover}
						alt=""
						draggable={false}
						className="absolute object-cover object-top"
						style={box === null ? { inset: 0, width: "100%", height: "100%" } : placed(box)}
					/>
				)}
				<iframe
					key={played.arrival}
					ref={iframe}
					src={played.src}
					title={played.frame}
					sandbox="allow-scripts"
					data-phone-frame=""
					className={
						box === null
							? "fixed top-0 left-0 h-dvh w-screen border-0 bg-[#fff] [@media(display-mode:standalone)]:h-screen"
							: "absolute top-0 left-0 origin-top-left border-0 bg-[#fff]"
					}
					style={{
						...(box === null
							? {}
							: {
									width: geometry.w,
									height: geometry.h,
									transform: `translate(${box.x}px, ${box.y}px) scale(${box.scale})`,
								}),
						opacity: cover !== undefined && drawn !== played.arrival ? 0 : 1,
					}}
					onLoad={() => setDrawn(played.arrival)}
				/>
			</div>
			{box !== null && !screen.landscape && (
				<span
					data-phone-turn=""
					className="pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded-sm border border-[#fff]/10 bg-[#000]/80 px-2.5 py-1.5 text-[#fff]/80 type-detail"
					style={{ top: box.y + box.h + 16 }}
				>
					{geometry.w} × {geometry.h} · turn the phone
				</span>
			)}
			{onClosed !== undefined && (
				<>
					<div
						data-phone-edge=""
						aria-hidden="true"
						className="absolute top-0 right-0 bottom-0 z-10 w-5 touch-none"
						onPointerDown={(event) => {
							event.currentTarget.setPointerCapture(event.pointerId);
							pulling.current = { x: event.clientX, at: event.timeStamp, far: 0 };
							setHint(false);
						}}
						onPointerMove={(event) => {
							const pull = pulling.current;
							if (pull === null) return;
							pull.far = Math.max(0, pull.x - event.clientX);
							pulled(pull.far);
						}}
						onPointerUp={(event) => {
							const pull = pulling.current;
							pulling.current = null;
							if (pull === null) return;
							const speed = pull.far / Math.max(1, event.timeStamp - pull.at);
							if (pull.far > PULL_LEAVES || (pull.far > PULL_FLICK.far && speed > PULL_FLICK.speed)) leave();
							else settle();
						}}
						onPointerCancel={() => {
							pulling.current = null;
							settle();
						}}
					/>
					{hint && (
						<span className="pointer-events-none absolute top-1/2 right-2 z-10 flex items-center gap-1.5 rounded-sm border border-[#fff]/10 bg-[#000]/80 py-1.5 pr-2.5 pl-2 text-[#fff] type-detail">
							‹ pull to go back
						</span>
					)}
				</>
			)}
		</div>
	);
}

/** Where the played frame shows inside the screen: all of it for a phone frame, its contained box for a desktop one. */
function shownOf(screen: PhoneScreen, frame: { w: number; h: number }): Box {
	return isDesktop(frame) ? contained(screen, frame) : { x: 0, y: 0, w: screen.w, h: screen.h };
}

/** The transform that puts what the screen shows over the frame's cover. */
function grownFrom(spot: Box, shown: Box): string {
	const scale = spot.w / shown.w;
	return `translate(${spot.x - shown.x * scale}px, ${spot.y - shown.y * scale}px) scale(${scale})`;
}

function placed(box: Box): { left: number; top: number; width: number; height: number } {
	return { left: box.x, top: box.y, width: box.w, height: box.h };
}
