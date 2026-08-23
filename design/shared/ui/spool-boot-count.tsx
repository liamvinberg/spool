import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { cn } from "../lib/utils";

/**
 * Four takes on the one honest question the boot can answer: can the wait
 * carry a number, and which number is true?
 *
 * What the app actually knows, in order:
 *   T0            /api/projects has already answered. frameCount is exact and
 *                 up to three real covers are in hand, freshest capture first.
 *   then          /api/p/:project/state — camera, active page, arrows.
 *   then          /api/p/:project/frames — pages and every frame's geometry,
 *                 all at once. One step, so nothing between mount and `loaded`
 *                 can fill a bar without lying.
 *   only then     a real stream: covers fetched per frame, documents mounted a
 *                 couple at a time by the lifecycle sweep.
 *
 * So the count is true at the first pixel, the two middle steps are honestly
 * indeterminate, and only the tail is per-item progress. Every take here is
 * built against that shape rather than around it.
 */

/** the dogfood project, as the sibling boot takes already count it */
export const FRAME_COUNT = 61;

/**
 * One integer walking a fixed loop. Coarse enough that a counting number is
 * smooth without re-rendering the field sixty times a second, and seeded off
 * zero so a still capture lands mid-idea rather than on the first beat.
 */
function useTick(steps: number, periodMs: number, seed: number): number {
	const [step, setStep] = useState(() => Math.round(seed * steps) % steps);
	useEffect(() => {
		const timer = setInterval(() => setStep((current) => (current + 1) % steps), periodMs);
		return () => clearInterval(timer);
	}, [steps, periodMs]);
	return step;
}

/* ------------------------------------------------------------------- tally */

const TALLY_COLS = 8;
const TALLY_CELL_W = 56;
const TALLY_CELL_H = 35;
const TALLY_GAP = 10;
const TALLY_STEPS = 100;
/** the fraction of the loop spent waiting on /frames, where nothing is countable */
const TALLY_ASK_END = 0.18;
const TALLY_FILL_END = 0.86;

/**
 * The count is the field. Every frame in the project gets one cell, so a
 * four-frame project is a short row and a four-hundred-frame project is a wall
 * — the wait is sized before a single position is known.
 *
 * The block is a packed grid rather than the real layout, because the real
 * layout arrives in the same answer as the frames themselves. While the daemon
 * is being asked the whole block breathes as one, which is what indeterminate
 * looks like when you refuse to fake a bar. Once covers start landing the
 * cells light one at a time, in arrival order, and that wavefront is true.
 */
export function TallyBoot() {
	const step = useTick(TALLY_STEPS, 45, 0.52);
	const t = step / TALLY_STEPS;
	const asking = t < TALLY_ASK_END;
	const filled = asking
		? 0
		: Math.min(
				FRAME_COUNT,
				Math.round(((t - TALLY_ASK_END) / (TALLY_FILL_END - TALLY_ASK_END)) * FRAME_COUNT),
			);
	const width = TALLY_COLS * TALLY_CELL_W + (TALLY_COLS - 1) * TALLY_GAP;

	return (
		<div className="flex h-full items-center justify-center pb-16">
			<div className="flex flex-col gap-4" style={{ width }}>
				<motion.div
					className="flex flex-wrap"
					style={{ width, gap: TALLY_GAP }}
					animate={asking ? { opacity: [0.6, 1, 0.6] } : { opacity: 1 }}
					transition={
						asking
							? { duration: 1.4, ease: "easeInOut", repeat: Number.POSITIVE_INFINITY }
							: { duration: 0.2 }
					}
				>
					{Array.from({ length: FRAME_COUNT }, (_, index) => {
						const lit = index < filled;
						const front = lit && index >= filled - 2;
						return (
							<div
								key={index}
								className={cn(
									"rounded-xs transition-colors duration-200",
									front
										? "border border-thread bg-thread/80"
										: lit
											? "border border-border-raised bg-raised"
											: "border border-border-raised/60 bg-transparent",
								)}
								style={{ width: TALLY_CELL_W, height: TALLY_CELL_H }}
							/>
						);
					})}
				</motion.div>
				<div className="flex items-baseline justify-between font-mono text-muted/70 text-xs leading-xs">
					<span>design/frames</span>
					<span className="tabular-nums">{asking ? `${FRAME_COUNT} frames` : `covers ${filled}/${FRAME_COUNT}`}</span>
				</div>
			</div>
		</div>
	);
}

/**
 * The rail can only say the total. Pages arrive in the same answer as the
 * geometry, so a list of them here before that would be invented.
 */
export function TallyRail() {
	return (
		<div className="flex h-8 items-center border-border border-b pr-3.5 pl-3.5 font-mono text-muted/60 text-sm leading-sm">
			<span className="tabular-nums">{FRAME_COUNT} frames</span>
		</div>
	);
}

/* ------------------------------------------------------------------ covers */

export interface BootCover {
	readonly name: string;
	readonly src: string;
}

const COVER_W = 256;
const COVER_H = 160;

/**
 * Show only what is genuinely in hand. At the first pixel the app holds three
 * real cover thumbnails and a count, so the field draws exactly that: three
 * pictures, freshest capture on the left, and one line saying how many of the
 * project they are.
 *
 * Nothing here fills, because nothing here can. The hairline under the row
 * shuttles for as long as the daemon is being asked, which is the only
 * truthful reading of that stretch.
 */
export function CoversBoot({ covers }: { covers: readonly BootCover[] }) {
	return (
		<div className="flex h-full flex-col items-center justify-center gap-7 pb-16">
			<div className="flex items-start gap-5">
				{covers.map((cover, index) => (
					<motion.div
						key={cover.name}
						className="flex flex-col gap-1.5"
						style={{ width: COVER_W }}
						animate={{ opacity: [0.55, 1, 0.55] }}
						transition={{
							duration: 3.2,
							delay: index * 0.45,
							ease: "easeInOut",
							repeat: Number.POSITIVE_INFINITY,
						}}
					>
						<span className="min-w-0 truncate font-mono text-muted text-sm leading-4">{cover.name}</span>
						<div
							className="overflow-hidden rounded-md border border-border-raised bg-surface"
							style={{ width: COVER_W, height: COVER_H }}
						>
							<img src={cover.src} alt="" className="h-full w-full object-cover" />
						</div>
					</motion.div>
				))}
			</div>
			<div className="flex flex-col items-center gap-3">
				<span className="font-mono text-muted/70 text-xs leading-xs tabular-nums">
					{covers.length} covers · {FRAME_COUNT} frames
				</span>
				<div className="h-px w-[140px] overflow-hidden bg-border-raised">
					<motion.div
						className="h-full w-[44px] bg-thread"
						animate={{ x: [0, 96, 0] }}
						transition={{ duration: 1.8, ease: "easeInOut", repeat: Number.POSITIVE_INFINITY }}
					/>
				</div>
			</div>
		</div>
	);
}

/* ------------------------------------------------------------------ budget */

const BUDGET_STEPS = 120;
const BUDGET_ASK_END = 0.16;
const BUDGET_COUNT_END = 0.9;

/** more digits, more presence: four frames is a small wait and says so */
function numeralSize(value: number): number {
	if (value >= 100) return 152;
	if (value >= 10) return 116;
	return 88;
}

/**
 * One number, and it is the number that is left. Not a bar, not a percentage,
 * and no preview of frames the app cannot place yet — every decrement is one
 * real cover arriving, so the readout can only ever be behind the truth, never
 * ahead of it.
 *
 * Its size is bound to how many digits it has, which is the cheapest way to
 * make a four-frame wait and a four-hundred-frame wait different objects. The
 * countdown shrinks the numeral as it goes, so the wait visibly gets lighter.
 */
export function BudgetBoot() {
	const step = useTick(BUDGET_STEPS, 40, 0.5);
	const t = step / BUDGET_STEPS;
	const asking = t < BUDGET_ASK_END;
	const progress = Math.min(1, Math.max(0, (t - BUDGET_ASK_END) / (BUDGET_COUNT_END - BUDGET_ASK_END)));
	const left = asking ? FRAME_COUNT : Math.round(FRAME_COUNT * (1 - progress));

	return (
		<div className="flex h-full items-center justify-center pb-16">
			<motion.div
				className="flex flex-col items-center gap-4"
				animate={{ opacity: asking ? 0.4 : left === 0 ? 0.25 : 1 }}
				transition={{ duration: 0.5, ease: "easeOut" }}
			>
				<span
					className="font-mono text-text leading-none tabular-nums transition-[font-size] duration-500 ease-out"
					style={{ fontSize: numeralSize(left) }}
				>
					{left}
				</span>
				<span className="font-mono text-muted/70 text-xs leading-xs">
					{asking ? "opening" : left === 0 ? "ready" : "frames left"}
				</span>
			</motion.div>
		</div>
	);
}

/* ------------------------------------------------------------------ ledger */

const LEDGER_STEPS = 120;
const TRACK_W = 72;
/** the lifecycle sweep mounts what the camera can see, so this row has its own denominator */
const IN_VIEW = 9;

type RowState =
	| { readonly kind: "waiting" }
	| { readonly kind: "pending" }
	| { readonly kind: "counting"; readonly done: number; readonly of: number }
	| { readonly kind: "ok" };

function span(t: number, from: number, to: number): RowState {
	if (t < from) return { kind: "waiting" };
	if (t >= to) return { kind: "ok" };
	return { kind: "pending" };
}

function stream(t: number, from: number, to: number, of: number): RowState {
	if (t < from) return { kind: "waiting" };
	if (t >= to) return { kind: "ok" };
	return { kind: "counting", done: Math.round(((t - from) / (to - from)) * of), of };
}

/**
 * The whole pipeline, printed, in the corner the rail already talks from. The
 * field is left alone, so nothing has to be un-drawn when the frames land.
 *
 * The structure is the argument. The count sits above a rule because it is not
 * a step: it is already true. The two middle rows carry a shuttle, because how
 * long the daemon takes to answer is genuinely unknown. Only the last two rows
 * carry a fraction, because only they arrive one item at a time.
 */
export function LedgerBoot() {
	const step = useTick(LEDGER_STEPS, 45, 0.58);
	const t = step / LEDGER_STEPS;

	const rows: readonly { label: string; state: RowState }[] = [
		{ label: "camera, page", state: span(t, 0, 0.14) },
		{ label: "pages, geometry", state: span(t, 0.14, 0.27) },
		{ label: "covers", state: stream(t, 0.27, 0.73, FRAME_COUNT) },
		{ label: "documents in view", state: stream(t, 0.46, 0.96, IN_VIEW) },
	];

	return (
		<div className="absolute bottom-8 left-6 flex w-[320px] flex-col gap-1.5">
			<div className="flex items-center justify-between border-border-raised border-b pb-2 font-mono text-xs leading-xs">
				<span className="text-muted/70">frames</span>
				<span className="text-text tabular-nums">{FRAME_COUNT}</span>
			</div>
			{rows.map((row) => (
				<div key={row.label} className="flex h-[22px] items-center gap-3 font-mono text-xs leading-xs">
					<span className="min-w-0 flex-1 truncate text-muted/70">{row.label}</span>
					<LedgerTrack state={row.state} />
					<span className="w-[46px] shrink-0 text-right text-muted/60 tabular-nums">
						{row.state.kind === "ok"
							? "ok"
							: row.state.kind === "counting"
								? `${row.state.done}/${row.state.of}`
								: ""}
					</span>
				</div>
			))}
		</div>
	);
}

/** three readings of one 64px rule: unknown, shuttling, or a real fraction */
function LedgerTrack({ state }: { state: RowState }) {
	if (state.kind === "waiting") {
		return <span className="h-[2px] shrink-0 rounded-full bg-border-raised/50" style={{ width: TRACK_W }} />;
	}
	if (state.kind === "ok") {
		return <span className="h-[2px] shrink-0 rounded-full bg-muted/45" style={{ width: TRACK_W }} />;
	}
	if (state.kind === "pending") {
		return (
			<span className="h-[2px] shrink-0 overflow-hidden rounded-full bg-border-raised" style={{ width: TRACK_W }}>
				<motion.span
					className="block h-full w-[22px] rounded-full bg-thread"
					animate={{ x: [0, TRACK_W - 22, 0] }}
					transition={{ duration: 1.5, ease: "easeInOut", repeat: Number.POSITIVE_INFINITY }}
				/>
			</span>
		);
	}
	return (
		<span className="h-[2px] shrink-0 overflow-hidden rounded-full bg-border-raised" style={{ width: TRACK_W }}>
			<span
				className="block h-full rounded-full bg-thread transition-[width] duration-200 ease-linear"
				style={{ width: `${(state.done / state.of) * 100}%` }}
			/>
		</span>
	);
}
