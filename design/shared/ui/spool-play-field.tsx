import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "../lib/utils";
import { CartEmptyExpressive, CartEmptyReorder, CartEmptyRestrained } from "./coffee-empty-takes";
import { CoffeeScreen, type CoffeeScreenName } from "./coffee-screens";

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
}: {
	/** what the composer's chips name, drawn where the human can tell them apart */
	outlines?: readonly Outline[];
	lit?: string | null | undefined;
	onLight?: ((id: string | null) => void) | undefined;
	/** the project's own frames, on the top row in canvas order */
	base?: readonly BaseFrame[];
	/** the row below, one entry per frame the turn is writing */
	takes?: readonly TakeState[];
}) {
	// A lone mark carries its name unprompted, because nothing else on screen
	// says it. Past one, nothing does: the labels sit above their boxes and two
	// picks in one list are close enough that a badge lands on its neighbour. The
	// chip already holds the name — out here the job is only which one, and full
	// opacity against faint says that without a word.
	const named = outlines.length === 1;
	return (
		<div className="absolute inset-0">
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
						selected={whole !== undefined}
						lit={whole !== undefined && (lit === whole.id || lit === "*")}
						onLight={whole === undefined || onLight === undefined ? undefined : () => onLight(whole.id)}
						onLeave={onLight === undefined ? undefined : () => onLight(null)}
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
							<CoffeeScreen screen={frame.screen} />
						</div>
					</Slot>
				);
			})}
			{takes.map((take, index) =>
				take.arrived ? <Take key={take.name} left={COLS[index] ?? 0} take={take} /> : null,
			)}
		</div>
	);
}

function Slot({
	left,
	top,
	name,
	selected = false,
	lit = false,
	onLight,
	onLeave,
	overlay,
	children,
}: {
	left: number;
	top: number;
	name: string;
	selected?: boolean;
	lit?: boolean;
	onLight?: (() => void) | undefined;
	onLeave?: (() => void) | undefined;
	overlay?: ReactNode;
	children: ReactNode;
}) {
	return (
		<div
			className="absolute flex flex-col"
			style={{ left, top: top - LABEL_LIFT, width: FW }}
			onMouseEnter={onLight}
			onMouseLeave={onLeave}
		>
			<div className="flex h-[22px] min-w-0 items-center font-mono text-xs leading-3">
				<span className={cn("min-w-0 truncate", selected ? "text-thread" : "text-text")}>{name}</span>
			</div>
			<div className="relative" style={{ width: FW, height: FH }}>
				<div className="overflow-hidden rounded-lg" style={{ width: FW, height: FH }}>
					{children}
				</div>
				{selected ? (
					<span
						className={cn(
							"pointer-events-none absolute rounded-lg border border-thread transition-opacity duration-150",
							lit ? "opacity-100" : "opacity-55",
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
function Take({ left, take }: { left: number; take: TakeState }) {
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
				<span className="min-w-0 truncate text-text">{take.name}</span>
			</div>
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
