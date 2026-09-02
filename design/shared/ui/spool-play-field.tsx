import { motion, useReducedMotion } from "motion/react";
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "shared/lib/utils";
import { CartEmptyExpressive, CartEmptyReorder, CartEmptyRestrained } from "shared/ui/coffee-empty-takes";
import { CoffeeScreen, type CoffeeScreenName } from "shared/ui/coffee-screens";

/**
 * The canvas under the playable frames: one camera, the project's own frames on
 * it, and room left below for the ones a turn has not written yet.
 *
 * The camera never moves between the specimens, so what changes between them is
 * only what the turn did. Leaving the second row empty until a sub-agent writes
 * something is the whole reason an arrival lands: the frames arrive into space
 * that was already there.
 *
 * Takes hold their column and arrive on their own clock. The columns are name
 * order, because that is how the folder sorts and where the designers put their
 * frame.json; the arrivals are not, because whoever finishes first arrives
 * first — in the capture behind this, `--c` lands a minute before `--b` and the
 * middle column sits open in between. Nothing here sorts arrivals.
 *
 * Frames are authored 240x520 and drawn 152 wide, which is 39% of a real 390pt
 * device — the zoom the header reads.
 */

const NAT_W = 240;
const NAT_H = 520;
const FW = 152;
const FH = 329;
const S = FW / NAT_W;

const COLS = [114, 310, 506] as const;
const ROW_1 = 46;
const ROW_2 = 437;
const LABEL_LIFT = 22;

const ARRIVE = [0.22, 0.61, 0.36, 1] as const;

export interface BaseFrame {
	readonly name: string;
	readonly screen: CoffeeScreenName;
	/** a frame the coffee screens do not hold, drawn by its own component at the same natural size */
	readonly render?: (() => ReactNode) | undefined;
}

/** what a take is doing right now, read off the capture by the frame that owns it */
export interface TakeState {
	readonly name: string;
	/** its frame.tsx has been written, so the folder is a frame and spool has it */
	readonly arrived: boolean;
	/** the document booted, so there is something to paint rather than a socket */
	readonly painted: boolean;
	/** climbs on every later write of the source — spool re-renders, so the canvas blinks */
	readonly revision: number;
}

const BASE: readonly BaseFrame[] = [
	{ name: "menu", screen: "menu" },
	{ name: "cart", screen: "cart" },
	{ name: "receipt", screen: "receipt" },
];

const TAKES: Record<string, () => ReactNode> = {
	"cart--empty": CartEmptyRestrained,
	"cart--empty-b": CartEmptyReorder,
	"cart--empty-c": CartEmptyExpressive,
};

/**
 * A frame drawn small, by the same component the canvas draws it with.
 *
 * This is what lets a picture in the rail be a picture of the frame rather than
 * a stand-in for one. The captures elide their base64 payloads, but every image
 * in them came back from a Read of `.spool/verify/<frame>.png` — so the frame is
 * always one the project already has, and drawing it here is not a fiction.
 */
export function FrameThumb({ name, width }: { name: string; width: number }) {
	const screen = BASE.find((frame) => frame.name === name)?.screen;
	const Take = TAKES[name];
	if (screen === undefined && Take === undefined) return null;
	const scale = width / NAT_W;
	return (
		<div style={{ width, height: Math.round(NAT_H * scale) }}>
			<div className="origin-top-left" style={{ width: NAT_W, height: NAT_H, transform: `scale(${scale})` }}>
				{screen === undefined ? <Take /> : <CoffeeScreen screen={screen} />}
			</div>
		</div>
	);
}

/**
 * One thing the hands are pointing at, where it lives. `box` is in the frame's
 * own 240×520 coordinates; a mark with no box is the whole frame, which is what
 * a frame selection is.
 */
export interface Outline {
	readonly id: string;
	readonly frame: string;
	readonly box?: { readonly x: number; readonly y: number; readonly w: number; readonly h: number } | undefined;
	readonly label?: string | undefined;
}

export function PlayField({
	outlines = [],
	lit = null,
	onLight,
	base = BASE,
	takes = [],
	entered = null,
	onEnter,
	onExit,
	selected = [],
	pointed = null,
	center = null,
}: {
	/** what the composer's chips name, drawn where the human can tell them apart */
	outlines?: readonly Outline[];
	lit?: string | null | undefined;
	onLight?: ((id: string | null) => void) | undefined;
	/** the project's own frames, on the top row in canvas order */
	base?: readonly BaseFrame[];
	/** the row below, one entry per frame the turn is writing */
	takes?: readonly TakeState[];
	/**
	 * Frames selected by something other than the hands — a rail row that landed
	 * you here (#143). It wears the ring an outline gives a frame selection,
	 * because that is what it is: `openConnection` at `canvas.tsx:2233` selects its
	 * target rather than inventing a state for arrived-at.
	 */
	selected?: readonly string[];
	/** the frame the rail is pointing at without having gone there, the way a chip lights its box */
	pointed?: string | null | undefined;
	/** the frame the camera is holding in the middle of the viewport */
	center?: string | null | undefined;
	/**
	 * The frame the hands are inside (#139). It keeps the ring every selected
	 * frame wears — `overlays.tsx:108` puts entered and selected in one list — and
	 * trades its name for the badge `frame-label.tsx` swaps in, because inside a
	 * frame the only thing worth saying is that it is live and how to get out.
	 */
	entered?: string | null;
	onEnter?: ((frame: string) => void) | undefined;
	onExit?: (() => void) | undefined;
}) {
	// esc leaves, from anywhere — the entered frame owns the keyboard, so the
	// canvas has to hear the one key that takes it back
	useEffect(() => {
		if (entered === null || onExit === undefined) return;
		const leave = (event: KeyboardEvent) => {
			if (event.key === "Escape") onExit();
		};
		window.addEventListener("keydown", leave);
		return () => window.removeEventListener("keydown", leave);
	}, [entered, onExit]);

	// A lone mark carries its name unprompted, because nothing else on screen
	// says it. Past one, nothing does: the labels sit above their boxes and two
	// picks in one list are close enough that a badge lands on its neighbour. The
	// chip already holds the name — out here the job is only which one, and full
	// opacity against faint says that without a word.
	const named = outlines.length === 1;
	const camera = useCamera(center, base, takes);
	return (
		<motion.div
			className="absolute inset-0"
			ref={camera.viewport}
			// a fresh mount is already there: switching page is a cut in the shipped code
			// (`switchToPage` takes the arrival camera rather than animating to it), and a
			// pan from wherever the last page was looking would be a journey nobody took
			initial={false}
			animate={{ x: camera.x, y: camera.y }}
			transition={camera.still ? { duration: 0 } : { duration: 0.42, ease: ARRIVE }}
		>
			<Threads base={base} />
			{base.map((frame, index) => {
				const mine = outlines.filter((mark) => mark.frame === frame.name);
				const whole = mine.find((mark) => mark.box === undefined);
				const parts = mine.filter((mark) => mark.box !== undefined);
				return (
					<Slot
						key={frame.name}
						left={COLS[index] ?? 0}
						top={ROW_1}
						name={frame.name}
						selected={whole !== undefined || selected.includes(frame.name)}
						entered={entered === frame.name}
						lit={
							pointed === frame.name || (whole !== undefined && (lit === whole.id || lit === "*"))
						}
						onLight={whole === undefined || onLight === undefined ? undefined : () => onLight(whole.id)}
						onLeave={onLight === undefined ? undefined : () => onLight(null)}
						onEnter={onEnter === undefined ? undefined : () => onEnter(frame.name)}
						pointed={pointed === frame.name}
						overlay={
							parts.length === 0 ? null : (
								<>
									{parts.map((mark) => (
										<ElementOutline
											key={mark.id}
											mark={mark}
											lit={lit === mark.id || lit === "*"}
											named={named}
											onLight={onLight}
										/>
									))}
								</>
							)
						}
					>
						<div className="origin-top-left" style={{ width: NAT_W, height: NAT_H, transform: `scale(${S})` }}>
							{frame.render === undefined ? <CoffeeScreen screen={frame.screen} /> : frame.render()}
						</div>
					</Slot>
				);
			})}
			{takes.map((take, index) =>
				take.arrived ? (
					<Take
						key={take.name}
						left={COLS[index] ?? 0}
						take={take}
						selected={selected.includes(take.name)}
						pointed={pointed === take.name}
					/>
				) : null,
			)}
		</motion.div>
	);
}

/**
 * The camera, which exists only so a rail row can land a frame in the middle of
 * the viewport (#143). It is one translate rather than a real camera: this field
 * draws one zoom and the frames sit on a fixed grid, so centring is arithmetic on
 * a box whose position is already known.
 *
 * `centerOn` at `camera.ts:70` is the real one, and it keeps the zoom — landing on
 * a frame is going to where it is, never deciding how close you wanted to be.
 * This does the same by never touching scale.
 */
function useCamera(
	center: string | null | undefined,
	base: readonly BaseFrame[],
	takes: readonly TakeState[],
): { viewport: React.RefObject<HTMLDivElement | null>; x: number; y: number; still: boolean } {
	const still = useReducedMotion() === true;
	const viewport = useRef<HTMLDivElement | null>(null);
	const [size, setSize] = useState<{ w: number; h: number } | null>(null);

	useLayoutEffect(() => {
		const node = viewport.current;
		if (node === null) return;
		const measure = () => setSize({ w: node.clientWidth, h: node.clientHeight });
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(node);
		return () => observer.disconnect();
	}, []);

	if (center == null || size === null) return { viewport, x: 0, y: 0, still };
	const row = base.findIndex((frame) => frame.name === center);
	const column = row === -1 ? takes.findIndex((take) => take.name === center) : row;
	if (column === -1) return { viewport, x: 0, y: 0, still };
	const left = COLS[column] ?? 0;
	const top = row === -1 ? ROW_2 : ROW_1;
	return { viewport, x: Math.round(size.w / 2 - (left + FW / 2)), y: Math.round(size.h / 2 - (top + FH / 2)), still };
}

function Slot({
	left,
	top,
	name,
	selected = false,
	entered = false,
	lit = false,
	pointed = false,
	onLight,
	onLeave,
	onEnter,
	overlay,
	children,
}: {
	left: number;
	top: number;
	name: string;
	selected?: boolean;
	entered?: boolean;
	lit?: boolean;
	/** a rail row is naming this frame under the cursor, which is a weaker claim than selected */
	pointed?: boolean;
	onLight?: (() => void) | undefined;
	onLeave?: (() => void) | undefined;
	onEnter?: (() => void) | undefined;
	overlay?: ReactNode;
	children: ReactNode;
}) {
	return (
		<div
			className="absolute flex flex-col"
			style={{ left, top: top - LABEL_LIFT, width: FW }}
			onMouseEnter={onLight}
			onMouseLeave={onLeave}
			onDoubleClick={onEnter}
		>
			<div className="flex h-[22px] min-w-0 items-center font-mono text-xs leading-3">
				{entered ? (
					<span className="rounded-xs bg-thread px-1.5 py-[3px] font-mono text-2xs text-on-thread leading-3">
						live · esc exits
					</span>
				) : (
					<span className={cn("min-w-0 truncate", selected || pointed ? "text-thread" : "text-text")}>{name}</span>
				)}
			</div>
			<div className="relative" style={{ width: FW, height: FH }}>
				<div className="overflow-hidden rounded-lg" style={{ width: FW, height: FH }}>
					{children}
				</div>
				{selected || pointed ? (
					<span
						className={cn(
							"pointer-events-none absolute rounded-lg border border-thread transition-opacity duration-150",
							// pointed is a weaker claim than selected and says so at the same
							// strength a chip's unlit accent does, so hovering a row cannot be
							// mistaken for having gone there
							lit && selected ? "opacity-100" : selected ? "opacity-55" : "opacity-35",
						)}
						style={{ inset: -1 }}
					/>
				) : null}
				{overlay}
			</div>
		</div>
	);
}

/**
 * A frame a sub-agent just wrote, landing.
 *
 * It arrives as an empty socket, because that is what a frame is until React
 * commits, breathes while it boots, and paints when the document is there. Every
 * later write of the same file blinks it once more: spool re-renders on source
 * change, so a frame the human is already looking at redraws under them, and the
 * one thing this canvas must not say is that arriving was finishing.
 *
 * No colour. Activity out here is motion, the same as it is in the rail.
 */
function Take({
	left,
	take,
	selected = false,
	pointed = false,
}: {
	left: number;
	take: TakeState;
	selected?: boolean;
	pointed?: boolean;
}) {
	const still = useReducedMotion() === true;
	const Content = TAKES[take.name];
	return (
		<motion.div
			className="absolute flex flex-col"
			style={{ left, top: ROW_2 - LABEL_LIFT, width: FW }}
			initial={still ? false : { opacity: 0, y: 14, scale: 0.985 }}
			animate={{ opacity: 1, y: 0, scale: 1 }}
			transition={still ? { duration: 0 } : { duration: 0.44, ease: ARRIVE }}
		>
			<div className="flex h-[22px] min-w-0 items-center font-mono text-xs leading-3">
				<span className={cn("min-w-0 truncate", selected || pointed ? "text-thread" : "text-text")}>{take.name}</span>
			</div>
			{selected || pointed ? (
				<span
					className={cn(
						"pointer-events-none absolute z-20 rounded-lg border border-thread",
						selected ? "opacity-55" : "opacity-35",
					)}
					style={{ left: -1, top: LABEL_LIFT - 1, width: FW + 2, height: FH + 2 }}
				/>
			) : null}
			<div className="relative overflow-hidden rounded-lg" style={{ width: FW, height: FH }}>
				<motion.span
					key={take.revision}
					className="absolute inset-0 z-10 rounded-lg border border-border-raised bg-bg"
					initial={take.revision === 0 || still ? false : { opacity: 0.85 }}
					animate={take.painted ? { opacity: 0 } : still ? { opacity: 1 } : { opacity: [1, 0.55, 1] }}
					transition={
						take.painted
							? { duration: still ? 0 : 0.34, ease: ARRIVE }
							: still
								? { duration: 0 }
								: { duration: 2.4, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }
					}
				/>
				<motion.div
					className="absolute top-0 left-0 origin-top-left"
					style={{ width: NAT_W, height: NAT_H, transform: `scale(${S})` }}
					initial={false}
					animate={{ opacity: take.painted ? 1 : 0 }}
					transition={still ? { duration: 0 } : { duration: 0.36, ease: ARRIVE }}
				>
					{Content === undefined ? null : <Content />}
				</motion.div>
			</div>
		</motion.div>
	);
}

/**
 * The element a chip names, outlined where it lives. Selection chrome is spool's,
 * so it is drawn over the scaled frame at screen scale and stays a hairline
 * however far out the canvas is zoomed.
 *
 * Five of these is the case the composer cannot hold, and it is also the case
 * that proves the canvas can: two picks of the same list row are one string in
 * the rail and two boxes forty pixels apart out here. So the lit one is the loud
 * one and it is the only one wearing its name — the rest stay drawn but quiet,
 * which is what a selection of five has to look like to still read as five.
 */
function ElementOutline({
	mark,
	lit,
	named,
	onLight,
}: {
	mark: Outline;
	lit: boolean;
	named: boolean;
	onLight?: ((id: string | null) => void) | undefined;
}) {
	const source = mark.box;
	if (source === undefined) return null;
	const box = { left: source.x * S, top: source.y * S, width: source.w * S, height: source.h * S };
	return (
		<>
			<span
				className={cn(
					"absolute rounded-[3px] border border-thread transition-opacity duration-150",
					lit ? "opacity-100" : "opacity-45",
				)}
				style={box}
				onMouseEnter={onLight === undefined ? undefined : () => onLight(mark.id)}
				onMouseLeave={onLight === undefined ? undefined : () => onLight(null)}
			/>
			{named && mark.label !== undefined ? (
				<span
					className="pointer-events-none absolute whitespace-nowrap rounded-xs bg-thread px-1.5 py-[2px] font-mono text-2xs text-on-thread leading-3"
					style={{ left: box.left, top: box.top - 17 }}
				>
					{mark.label}
				</span>
			) : null}
		</>
	);
}

/**
 * The link graph along the top row: the first edge is unconditional, anything
 * after it sits inside a branch and draws faint. The takes each carry a
 * `data-go` of their own, but the gap between the rows is forty pixels at this
 * zoom and a thread crossing it would have to travel further sideways than down
 * — so the row below states its edges by being there, and the arrows stay where
 * they can be read.
 */
function Threads({ base }: { base: readonly BaseFrame[] }) {
	const edges = base.slice(1).map((_, index) => {
		const from = COLS[index] ?? 0;
		const to = COLS[index + 1] ?? 0;
		const x1 = from + FW + 3;
		const y1 = ROW_1 + 158;
		const x2 = to - 9;
		const y2 = ROW_1 + 186;
		return {
			d: `M${x1} ${y1}C${x1 + 16} ${y1} ${x2 - 12} ${y2} ${x2} ${y2}`,
			head: `m${x2 + 8} ${y2}-8-4.5v9Z`,
			faint: index > 0,
		};
	});
	return (
		<svg className="pointer-events-none absolute inset-0 h-full w-full" fill="none" aria-hidden="true">
			{edges.map((edge) => (
				<g key={edge.d} opacity={edge.faint ? 0.45 : 1}>
					<path d={edge.d} stroke="var(--color-thread)" strokeWidth="1.5" />
					<path d={edge.head} fill="var(--color-thread)" />
				</g>
			))}
		</svg>
	);
}
