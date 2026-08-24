import { AnimatePresence, motion } from "motion/react";
import { useRef, useState } from "react";
import { Scaled, TvarsoCheckout, type VariationId } from "../../../shared/ui/tvarso-checkout";
import {
	FIELD_H,
	FIELD_SCALE,
	FIELD_W,
	FrameLabel,
	Placed,
	PlayVerb,
	SelectionRing,
	StackIcon,
	VariantsScreen,
} from "../../../shared/ui/variants-shell";
import { useArrows, useCycle } from "../../../shared/lib/variants-cycle";
import { cn } from "../../../shared/lib/utils";

/**
 * The other reading of the third dimension: the variations already exist, and
 * they are behind the frame in time.
 *
 * Every one of these cards was on the canvas at some point this afternoon, and
 * the only place they survive is a git log nobody opens. So the frame gets a
 * track instead of a stack: scrub it and the card walks back through what it
 * has been, with the agent's own sentence about each step under it. Find one
 * worth keeping and fork it, and that moment becomes a sibling with a name.
 *
 * The claim: most variations are not authored, they are abandoned, and the
 * cheapest way to have four is to stop throwing three away. What it does not
 * answer is what happens on the next edit — a fork is a copy, and a copy stops
 * following the frame it came from.
 */

interface Moment {
	readonly at: string;
	readonly said: string;
	readonly render: VariationId;
	readonly name: string;
}

const HISTORY: readonly Moment[] = [
	{ at: "13:58", said: "First pass at the checkout, card only.", render: "card", name: "checkout" },
	{ at: "14:06", said: "Swapped the payment block for Swish.", render: "swish", name: "checkout--swish" },
	{ at: "14:11", said: "Added the invoice fields for companies.", render: "invoice", name: "checkout--invoice" },
	{ at: "14:19", said: "Tried a voucher field over the saved card.", render: "voucher", name: "checkout--voucher" },
	{ at: "14:26", said: "Emptied the cart to see the zero state.", render: "empty", name: "checkout--empty" },
	{ at: "now", said: "Back to card, which is the one that shipped.", render: "card", name: "checkout" },
];

const TRACK = 660;

export default function AxisTimelineFrame() {
	const cycle = useCycle(HISTORY.length, HISTORY.length - 1);
	const track = useRef<HTMLDivElement | null>(null);
	const [forked, setForked] = useState<readonly string[]>([]);
	useArrows(cycle);
	const moment = HISTORY[cycle.index] ?? HISTORY[HISTORY.length - 1]!;
	const now = cycle.index === HISTORY.length - 1;

	const scrub = (clientX: number) => {
		const box = track.current?.getBoundingClientRect();
		if (box === undefined) return;
		const ratio = Math.min(1, Math.max(0, (clientX - box.left) / box.width));
		cycle.go(Math.round(ratio * (HISTORY.length - 1)));
	};

	return (
		<VariantsScreen hint="drag along the track · ← → steps a moment at a time">
			<Placed x={130} y={116} z={2}>
				<FrameLabel
					name="checkout"
					selected
					stacked
					right={
						<>
							<span className={cn("font-mono text-2xs leading-3", now ? "text-muted" : "text-thread")}>
								{moment.at}
							</span>
							<PlayVerb />
						</>
					}
				/>
				<div className="relative" style={{ width: FIELD_W, height: FIELD_H }}>
					<div className="absolute inset-0 overflow-hidden rounded-[8px]">
						<AnimatePresence initial={false}>
							<motion.div
								key={cycle.index}
								className="absolute inset-0"
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								exit={{ opacity: 0 }}
								transition={{ duration: 0.12, ease: "linear" }}
							>
								<Scaled scale={FIELD_SCALE}>
									<TvarsoCheckout variation={moment.render} />
								</Scaled>
							</motion.div>
						</AnimatePresence>
					</div>
					{now ? (
						<SelectionRing size="360 × 620" />
					) : (
						<div className="pointer-events-none absolute -inset-[3px] rounded-[11px] border-[1.5px] border-thread border-dashed" />
					)}
				</div>
			</Placed>

			{/* what the agent said it was doing, beside what it did */}
			<div className="absolute top-[150px] left-[400px] flex w-[330px] flex-col gap-3">
				<span className="font-mono text-2xs text-muted/60 leading-3">{moment.at === "now" ? "now" : `at ${moment.at}`}</span>
				<motion.p key={moment.said} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="text-lg text-text leading-lg">
					{moment.said}
				</motion.p>
				<span className="font-mono text-2xs text-muted/45 leading-3">
					{now ? "this is what the file holds" : "this render is only in the history"}
				</span>
				<button
					type="button"
					disabled={now || forked.includes(moment.name)}
					onClick={() => setForked((current) => [...current, moment.name])}
					className={cn(
						"mt-1 flex h-8 w-fit items-center rounded-sm border px-3 font-mono text-xs leading-xs transition-colors",
						now
							? "border-border text-muted/35"
							: forked.includes(moment.name)
								? "border-border text-muted/45"
								: "border-border-raised text-muted hover:border-thread hover:text-text",
					)}
				>
					{forked.includes(moment.name) ? `kept as ${moment.name}` : `keep this as ${moment.name}`}
				</button>

				{forked.length === 0 ? null : (
					<div className="mt-4 flex flex-col gap-2 border-border border-t pt-4">
						<span className="flex items-center gap-2 font-mono text-2xs text-muted leading-3">
							<StackIcon className="h-3 w-3 text-thread" />
							kept · {forked.length}
						</span>
						<AnimatePresence initial={false}>
							{forked.map((name) => (
								<motion.span
									key={name}
									layout
									initial={{ opacity: 0, x: -6 }}
									animate={{ opacity: 1, x: 0 }}
									className="font-mono text-xs text-text/80 leading-[19px]"
								>
									{name}
								</motion.span>
							))}
						</AnimatePresence>
					</div>
				)}
			</div>

			{/* the track: every save this frame has had, this session */}
			<div className="absolute top-[576px] left-[130px]" style={{ width: TRACK }}>
				<div
					ref={track}
					role="slider"
					aria-label="History"
					aria-valuemin={0}
					aria-valuemax={HISTORY.length - 1}
					aria-valuenow={cycle.index}
					tabIndex={0}
					className="relative h-10 cursor-ew-resize touch-none"
					onPointerDown={(event) => {
						event.currentTarget.setPointerCapture(event.pointerId);
						scrub(event.clientX);
					}}
					onPointerMove={(event) => {
						if (event.currentTarget.hasPointerCapture(event.pointerId)) scrub(event.clientX);
					}}
				>
					<span className="absolute top-[19px] right-0 left-0 h-px bg-border-raised" />
					<motion.span
						className="absolute top-[19px] left-0 h-px bg-thread"
						initial={false}
						animate={{ width: (cycle.index / (HISTORY.length - 1)) * TRACK }}
						transition={{ type: "spring", stiffness: 460, damping: 40 }}
					/>
					{HISTORY.map((entry, index) => {
						const on = index === cycle.index;
						const past = index < cycle.index;
						return (
							<span
								key={entry.at}
								className="absolute top-0 flex h-10 -translate-x-1/2 flex-col items-center justify-center gap-2"
								style={{ left: (index / (HISTORY.length - 1)) * TRACK }}
							>
								<motion.span
									className={cn(
										"rounded-full",
										on ? "bg-thread" : past ? "bg-thread/50" : "bg-border-raised",
									)}
									initial={false}
									animate={{ width: on ? 10 : 6, height: on ? 10 : 6 }}
									transition={{ type: "spring", stiffness: 520, damping: 34 }}
								/>
								<span className={cn("font-mono text-2xs leading-3", on ? "text-text" : "text-muted/45")}>
									{entry.at}
								</span>
							</span>
						);
					})}
				</div>
				<span className="mt-3 block font-mono text-2xs text-muted/45 leading-3">
					six saves this afternoon · the rail shows one of them
				</span>
			</div>
		</VariantsScreen>
	);
}
