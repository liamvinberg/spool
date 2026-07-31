import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "../../../shared/lib/utils";
import { CoffeeScreen, type CoffeeScreenName } from "../../../shared/ui/coffee-screens";
import type { Held } from "./held";

/**
 * The canvas, with nothing on it that was not already on it.
 *
 * It is its own copy of `shared/ui/spool-play-field.tsx` rather than that file
 * with a layer over it, because there is no layer: everything this direction says
 * is said by a frame's own weight, size and body, and all three of those live
 * inside that file's private `Slot`. Grid, scale, label row, ring and the link
 * graph are its unchanged — same 240x520 authored box, same 152px draw, same 39%
 * the header reads — so this canvas and the parent's can be put side by side and
 * differ only in what the agent's state is made of.
 *
 * **Three properties, three things.** How much of the canvas is still lit says
 * which frame is held and whether a call is open. The held frame's size says a
 * picture is being taken of the whole of it. The held frame's body says a write
 * landed in it. Nothing is added anywhere, so nothing has a side to dock on, a
 * gutter to fit in, or a legend to learn.
 *
 * **The human's chrome never recedes.** A name, a selection ring and a walk arrow
 * are spool drawing *about* a frame; the weight is the frame itself. So a frame
 * that has gone back keeps its ring at full strength and its name at full
 * strength, and the two languages are never once in the same pixels. The ring does
 * ride the shot's contraction, because a ring is drawn around a box and that box
 * moved: chrome tracking its subject is not the agent moving the human's mark.
 */

const NAT_W = 240;
const NAT_H = 520;
const FW = 152;
const FH = 329;
const S = FW / NAT_W;

const COLS = [114, 310, 506] as const;
const ROW_1 = 46;
const LABEL_LIFT = 22;

const ARRIVE = [0.22, 0.61, 0.36, 1] as const;

/* ---------- the one property, and its three settings ----------
 * Every frame on this canvas is `#FEFEFE` on a `#161616` field, which is the fact
 * the `--wall` designer ran into from the other side: a mark drawn *on* a frame
 * has to know what colour that frame is, and nothing here is drawn on one. A frame
 * going back is the frame's own opacity over the canvas it already sits on, so a
 * dark frame recedes toward the same ground by the same rule and no surface has to
 * be known. What is not solved is that the direction needs the frame and the
 * canvas to differ at all: on this canvas that gap is 254 against 22 and enormous,
 * and on a canvas of dark frames there would be almost nothing to spend. */

/** the field, while the agent is holding one of them and nothing is open */
const BACK = 0.72;
/** a second multiplier while a call is open, so held and working are one quantity at two settings */
const OPEN = 0.78;
/** the shot's contraction: the one call whose subject is the whole rectangle */
const SHOT = 0.974;

/** the settle in and out of a hold; there are exactly two of these in a whole turn */
const SETTLE = { duration: 0.4, ease: ARRIVE } as const;
/**
 * The live step, and it is a step rather than a slide.
 *
 * Five of the twelve calls run under 320ms and the shortest is a 186ms `look`, so
 * anything that eases in over a quarter of a second never arrives before the call
 * it is reporting has ended. 110ms is short enough that a 186ms call spends 76ms
 * of itself at its floor, and it is the same 110ms back, so nothing flickers.
 */
const STEP = { duration: 0.11, ease: "linear" } as const;
const TAKE = { duration: 0.24, ease: ARRIVE } as const;
/** one write, drawn as the frame's own socket showing through for a beat */
const REDRAW = { duration: 0.3, ease: ARRIVE } as const;
/**
 * How dark a redraw is allowed to get, and it is the recession that sets it.
 *
 * The socket is `#0E0E0E` over a `#FEFEFE` frame, so a cover at `a` leaves
 * `254 − 240a`, and a receded neighbour sits at 189. They meet at 0.27. Anything
 * past that and the held frame is briefly darker than the frames it is supposed to
 * be held against — fourteen times in this turn, for about a tenth of a second
 * each — which would mean the one thing this direction says stops being true while
 * the thing it is reporting happens. So the blink's floor is not a taste call, it
 * is whatever the field went back to.
 */
const SOCKET = 0.26;

export interface FieldFrame {
	readonly name: string;
	readonly screen?: CoffeeScreenName | undefined;
	readonly render?: ((rev: number) => ReactNode) | undefined;
}

export function HeldField({
	frames,
	held,
	selected,
	onSelect,
}: {
	frames: readonly FieldFrame[];
	held: Held;
	/** the human's own pick, which this canvas has to survive sharing a rectangle with */
	selected: readonly string[];
	onSelect?: ((name: string) => void) | undefined;
}) {
	return (
		<div className="absolute inset-0">
			<Threads count={frames.length} />
			{frames.map((frame, index) => (
				<Slot
					key={frame.name}
					left={COLS[index] ?? 0}
					frame={frame}
					held={held}
					mine={held.frame === frame.name}
					selected={selected.includes(frame.name)}
					onSelect={onSelect === undefined ? undefined : () => onSelect(frame.name)}
				/>
			))}
		</div>
	);
}

function Slot({
	left,
	frame,
	held,
	mine,
	selected,
	onSelect,
}: {
	left: number;
	frame: FieldFrame;
	held: Held;
	mine: boolean;
	selected: boolean;
	onSelect?: (() => void) | undefined;
}) {
	const still = useReducedMotion() === true;
	// nobody is here, so nothing goes back. A field that receded with no lit frame in
	// it would be saying *one of these* and be wrong, which is also the answer when
	// the held frame is on another page
	const back = held.frame !== null && !mine;
	const shooting = mine && held.shooting;

	return (
		<div
			className="absolute flex flex-col"
			style={{ left, top: ROW_1 - LABEL_LIFT, width: FW }}
			onClick={onSelect}
		>
			{/* the name is spool's, not the frame's, so it stays where it is at the
			    strength it was */}
			<div className="flex h-[22px] min-w-0 items-center font-mono text-xs leading-3">
				<span className={cn("min-w-0 truncate", selected ? "text-thread" : "text-text")}>{frame.name}</span>
			</div>
			<motion.div
				className="relative"
				style={{ width: FW, height: FH }}
				initial={false}
				animate={{ scale: shooting && !still ? SHOT : 1 }}
				transition={still ? { duration: 0 } : TAKE}
			>
				<motion.div
					className="absolute inset-0 overflow-hidden rounded-lg"
					initial={false}
					animate={{ opacity: back ? BACK : 1 }}
					transition={still ? { duration: 0 } : SETTLE}
				>
					<motion.div
						className="h-full w-full"
						initial={false}
						animate={{ opacity: back && held.live ? OPEN : 1 }}
						transition={still ? { duration: 0 } : STEP}
					>
						<div className="origin-top-left" style={{ width: NAT_W, height: NAT_H, transform: `scale(${S})` }}>
							{frame.render === undefined ? (
								<CoffeeScreen screen={frame.screen ?? "menu"} />
							) : (
								frame.render(held.writes)
							)}
						</div>
					</motion.div>
					{/* the frame redrawing. spool re-renders on source change, so this is the
					    frame's own behaviour reported rather than a mark about it — and the
					    tightest gap between two writes in this capture is 573ms, so one never
					    lands on top of the last */}
					{mine && held.writes > 0 && !still ? (
						<motion.span
							key={held.writes}
							className="absolute inset-0 bg-bg"
							initial={{ opacity: SOCKET }}
							animate={{ opacity: 0 }}
							transition={REDRAW}
						/>
					) : null}
				</motion.div>
				{selected ? (
					<span
						className="pointer-events-none absolute rounded-lg border border-thread opacity-55"
						style={{ inset: -1 }}
					/>
				) : null}
			</motion.div>
		</div>
	);
}

/**
 * The link graph, `spool-play-field.tsx`'s unchanged: the first edge unconditional,
 * anything after it faint.
 *
 * It is here because it is the sharpest test of the rule. These are the accent, they
 * cross the frames that have gone back, and they do not go back with them — so the
 * canvas keeps saying everything it said about the project while the agent's state
 * runs underneath it.
 */
function Threads({ count }: { count: number }) {
	const edges = Array.from({ length: Math.max(0, count - 1) }, (_, index) => {
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
