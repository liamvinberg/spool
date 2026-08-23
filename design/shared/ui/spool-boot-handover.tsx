import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { cn } from "../lib/utils";
import { ChevronIcon, FolderIcon } from "./spool-icons";
import { SpoolMark } from "./spool-mark";

/**
 * The other half of a loading state: the moment it ends, and the moments it
 * has to end badly.
 *
 * Four takes, one per frame, all of them sitting in `BootShell` so the only
 * variable is the field. They are built on what the canvas actually holds at
 * T0, which is more than it uses: the app shell has already fetched
 * /api/projects, so `frameCount` is an exact integer and `covers` is up to
 * three real thumbnails, freshest capture first. Frame *names* and geometry
 * arrive later, with /frames — so a boot may draw pictures before it can
 * caption them, and that asymmetry is what `carry` is built on.
 *
 * `carry` and `gate` and `none` loop the whole sequence on a timer so the
 * transition is visible on a canvas nobody is clicking. The loop is a
 * prototyping device and belongs to these frames only: nothing in the shipped
 * boot should replay itself. `stall` does not loop, because a failure screen
 * is read rather than watched; its only motion is the elapsed counter, which
 * ticks in real seconds.
 *
 * The measurement strip in `gate` is an instrument, not chrome. It exists to
 * make a number arguable and would not ship.
 */

const EASE = [0.22, 1, 0.36, 1] as const;

/** the field inside BootShell: 1440 minus the two rails, 900 minus the bar */
const FIELD_W = 892;

const dotGrid = {
	backgroundImage:
		"radial-gradient(circle, color-mix(in srgb, var(--color-text) 6%, transparent) 1px, transparent 1px)",
	backgroundSize: "8px 8px",
};

/**
 * A looping timeline. `durations` are the ms each step lasts, in order; after
 * the last one it wraps to zero. Module-level constants only, so the identity
 * stays stable across renders.
 */
function useTimeline(durations: readonly number[]): number {
	const [step, setStep] = useState(0);
	useEffect(() => {
		const timer = window.setTimeout(
			() => setStep((current) => (current + 1) % durations.length),
			durations[step] ?? 1000,
		);
		return () => window.clearTimeout(timer);
	}, [durations, step]);
	return step;
}

/* -------------------------------------------------------------- the field */

type CoverKind = "app" | "page" | "phone" | "mark";

interface Seat {
	readonly name: string;
	readonly x: number;
	readonly y: number;
	readonly w: number;
	readonly h: number;
	readonly art: CoverKind;
}

/** what the project holds, at the zoom fitCamera is about to settle on */
const SEATS: readonly Seat[] = [
	{ name: "spool-home", x: 38, y: 108, w: 252, h: 158, art: "page" },
	{ name: "spool-canvas", x: 326, y: 108, w: 252, h: 158, art: "app" },
	{ name: "spool-player", x: 614, y: 108, w: 252, h: 158, art: "page" },
	{ name: "menu", x: 38, y: 320, w: 74, h: 160, art: "phone" },
	{ name: "cart", x: 126, y: 320, w: 74, h: 160, art: "phone" },
	{ name: "receipt", x: 214, y: 320, w: 74, h: 160, art: "phone" },
	{ name: "spool-system", x: 326, y: 320, w: 252, h: 158, art: "page" },
	{ name: "spool-find", x: 614, y: 320, w: 252, h: 158, art: "app" },
	{ name: "spool-empty-project", x: 38, y: 532, w: 252, h: 158, art: "mark" },
	{ name: "spool-agent", x: 326, y: 532, w: 252, h: 158, art: "app" },
	{ name: "spool-canvas-menu", x: 614, y: 532, w: 252, h: 158, art: "app" },
];

function Bar({ w, className }: { w: string | number; className?: string }) {
	return <span className={cn("block h-[3px] rounded-full bg-border-raised", className)} style={{ width: w }} />;
}

/** a cover: the picture spool has on disk for a frame, drawn small enough to scale */
function CoverArt({ kind }: { kind: CoverKind }) {
	if (kind === "phone") {
		return (
			<div className="flex h-full w-full flex-col bg-bg">
				<div className="flex items-center justify-between px-2 pt-2 pb-1.5">
					<Bar w={14} />
					<span className="h-1.5 w-1.5 rounded-full bg-thread/70" />
				</div>
				<div className="space-y-1.5 px-2">
					<span className="block h-2 w-[68%] rounded-[1px] bg-raised" />
					<Bar w="86%" />
				</div>
				<div className="mt-2.5 space-y-1.5 px-2">
					{["78%", "62%", "70%"].map((width) => (
						<div key={width} className="flex items-center gap-1.5">
							<span className="h-3 w-3 shrink-0 rounded-[2px] bg-surface" />
							<Bar w={width} />
						</div>
					))}
				</div>
				<span className="mx-2 mt-auto mb-2 block h-3.5 rounded-[2px] bg-thread/70" />
			</div>
		);
	}
	if (kind === "mark") {
		return (
			<div className="flex h-full w-full items-center justify-center bg-canvas" style={dotGrid}>
				<SpoolMark className="h-6 w-[19px] text-thread/25" />
			</div>
		);
	}
	if (kind === "page") {
		return (
			<div className="flex h-full w-full flex-col bg-bg">
				<div className="flex items-center gap-1.5 border-border border-b px-2.5 py-2">
					<span className="h-1.5 w-1.5 rounded-full bg-thread" />
					<Bar w={26} />
				</div>
				<div className="space-y-2 px-2.5 pt-3">
					<span className="block h-2.5 w-[64%] rounded-[2px] bg-raised" />
					<Bar w="88%" />
					<Bar w="72%" />
				</div>
				<div className="mt-3 flex gap-1.5 px-2.5">
					<span className="w-px shrink-0 self-stretch bg-thread/60" />
					<div className="space-y-1.5 py-0.5">
						<Bar w={64} />
						<Bar w={48} />
					</div>
				</div>
				<div className="mt-auto flex items-center gap-1.5 px-2.5 pb-2.5">
					<span className="h-4 w-14 rounded-[3px] bg-thread/75" />
					<span className="h-4 w-9 rounded-[3px] border border-border-raised" />
				</div>
			</div>
		);
	}
	return (
		<div className="flex h-full w-full flex-col bg-bg">
			<div className="flex h-[12%] shrink-0 items-center gap-1.5 border-border border-b px-2">
				<span className="h-1.5 w-1.5 rounded-full bg-thread" />
				<Bar w={20} />
			</div>
			<div className="flex min-h-0 flex-1">
				<div className="w-[21%] shrink-0 space-y-1.5 border-border border-r px-2 pt-2">
					{["70%", "52%", "62%"].map((width) => (
						<Bar key={width} w={width} />
					))}
				</div>
				<div className="relative min-w-0 flex-1 bg-canvas" style={dotGrid}>
					<span className="absolute top-[22%] left-[12%] h-[42%] w-[26%] rounded-[2px] border border-border-raised bg-bg" />
					<span className="absolute top-[30%] left-[52%] h-[42%] w-[26%] rounded-[2px] border border-border-raised bg-bg" />
					<span className="absolute top-[46%] left-[38%] h-px w-[14%] bg-thread/70" />
				</div>
				<div className="w-[17%] shrink-0 space-y-1.5 border-border border-l px-2 pt-2">
					<Bar w="60%" />
					<Bar w="44%" />
				</div>
			</div>
		</div>
	);
}

function SeatArt({ seat }: { seat: Seat }) {
	return (
		<div className="h-full w-full overflow-hidden rounded-[3px] border border-border-raised">
			<CoverArt kind={seat.art} />
		</div>
	);
}

/** the name a frame wears on the field; it arrives with /frames, never before */
function SeatLabel({ seat }: { seat: Seat }) {
	return (
		<span
			className="absolute truncate font-mono text-muted text-sm leading-4"
			style={{ left: seat.x, top: seat.y - 19, width: seat.w }}
		>
			{seat.name}
		</span>
	);
}

/* --------------------------------------------------------------- the rail */

interface RailPage {
	readonly name: string;
	readonly count: number;
}

const RAIL_PAGES: readonly RailPage[] = [
	{ name: "agent", count: 20 },
	{ name: "app", count: 11 },
	{ name: "booting", count: 5 },
	{ name: "components", count: 4 },
	{ name: "directing", count: 2 },
	{ name: "explorer", count: 1 },
	{ name: "manipulate", count: 9 },
	{ name: "play-tab", count: 4 },
	{ name: "site", count: 5 },
];

const FRAME_COUNT = RAIL_PAGES.reduce((total, page) => total + page.count, 0);

function PageRow({ page }: { page: RailPage }) {
	const active = page.name === "app";
	return (
		<div className={cn("relative flex h-8 items-center pr-3.5", active && "bg-surface")}>
			{active ? <span className="absolute top-1.5 bottom-1.5 left-0 w-[2px] rounded-full bg-thread" /> : null}
			<span className="flex h-8 w-6 shrink-0 items-center justify-center text-muted">
				<ChevronIcon open={false} className="h-2.5 w-2.5" />
			</span>
			<FolderIcon className={cn("mr-2 h-3.5 w-3.5 shrink-0", active ? "text-thread" : "text-muted")} />
			<span
				className={cn("min-w-0 flex-1 truncate font-mono text-sm leading-sm", active ? "text-text" : "text-muted")}
			>
				{page.name}
			</span>
			<span className="font-mono text-2xs text-muted/60 leading-3">{page.count}</span>
		</div>
	);
}

/**
 * The rail hands over on the same beat as the field. Before /frames answers it
 * can only say how many frames the project has, because that number came from
 * /api/projects and the page names did not.
 */
export function HandoverRail({ landed }: { landed: boolean }) {
	return (
		<AnimatePresence mode="wait" initial={false}>
			{landed ? (
				<motion.div
					key="pages"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1, transition: { duration: 0.26, ease: "easeOut" } }}
					exit={{ opacity: 0, transition: { duration: 0.2 } }}
				>
					{RAIL_PAGES.map((page, index) => (
						<motion.div
							key={page.name}
							initial={{ opacity: 0, x: -4 }}
							animate={{
								opacity: 1,
								x: 0,
								transition: { duration: 0.3, ease: EASE, delay: 0.04 + index * 0.022 },
							}}
						>
							<PageRow page={page} />
						</motion.div>
					))}
				</motion.div>
			) : (
				<motion.div
					key="count"
					className="flex h-8 items-center pr-3.5 pl-[26px]"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1, transition: { duration: 0.24, ease: "easeOut" } }}
					exit={{ opacity: 0, transition: { duration: 0.16 } }}
				>
					<span className="font-mono text-muted/45 text-sm leading-sm">{FRAME_COUNT} frames</span>
				</motion.div>
			)}
		</AnimatePresence>
	);
}

/* ------------------------------------------------------------------ carry */

/** the three covers /api/projects already handed the shell, freshest first */
const CARRIED = ["spool-canvas", "cart", "spool-system"] as const;

const WAIT_SCALE = 1.15;
const WAIT_GAP = 30;
const WAIT_CENTER_Y = 352;

interface CarriedPose {
	readonly seat: Seat;
	readonly dx: number;
	readonly dy: number;
}

const CARRIED_POSES: readonly CarriedPose[] = (() => {
	const seats = CARRIED.map((name) => SEATS.find((seat) => seat.name === name)).filter(
		(seat): seat is Seat => seat !== undefined,
	);
	const rowWidth = seats.reduce((total, seat) => total + seat.w * WAIT_SCALE, 0) + WAIT_GAP * (seats.length - 1);
	let cursor = (FIELD_W - rowWidth) / 2;
	return seats.map((seat) => {
		const centreX = cursor + (seat.w * WAIT_SCALE) / 2;
		cursor += seat.w * WAIT_SCALE + WAIT_GAP;
		return { seat, dx: centreX - (seat.x + seat.w / 2), dy: WAIT_CENTER_Y - (seat.y + seat.h / 2) };
	});
})();

const CARRY_STEPS = [2200, 2600, 460] as const;

/**
 * The loading state does not go away, it becomes the canvas.
 *
 * What is on screen during the wait is the only thing the canvas really has at
 * T0: three real covers off disk and a count. When /frames answers, those three
 * are not replaced. They travel to the geometry they were just told about, the
 * other eight resolve around them, the names arrive on top, and the camera fits
 * over all of it as one gesture. A returning project is mostly this frame
 * already, which is why a second open feels instant and a cold one does not.
 */
export function CarryHandover({ landed, hidden }: { landed: boolean; hidden: boolean }) {
	const settled = landed && !hidden;
	return (
		<motion.div
			className="absolute inset-0"
			style={{ transformOrigin: "50% 46%" }}
			animate={{ scale: settled ? 1 : 1.045 }}
			transition={settled ? { duration: 0.72, ease: EASE } : { duration: 0 }}
		>
			{SEATS.map((seat, index) => {
				const pose = CARRIED_POSES.find((candidate) => candidate.seat.name === seat.name);
				if (pose !== undefined) {
					const order = CARRIED_POSES.indexOf(pose);
					return (
						<motion.div
							key={seat.name}
							className="absolute"
							style={{ left: seat.x, top: seat.y, width: seat.w, height: seat.h }}
							animate={
								settled
									? { x: 0, y: 0, scale: 1, opacity: 1 }
									: { x: pose.dx, y: pose.dy, scale: WAIT_SCALE, opacity: hidden ? 0 : 1 }
							}
							transition={
								settled
									? { duration: 0.62, ease: EASE, delay: order * 0.05 }
									: {
											x: { duration: 0 },
											y: { duration: 0 },
											scale: { duration: 0 },
											opacity: { duration: hidden ? 0.34 : 0.3, ease: "easeOut" },
										}
							}
						>
							<SeatArt seat={seat} />
						</motion.div>
					);
				}
				return (
					<motion.div
						key={seat.name}
						className="absolute"
						style={{ left: seat.x, top: seat.y, width: seat.w, height: seat.h }}
						animate={settled ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.985 }}
						transition={
							settled
								? { duration: 0.44, ease: EASE, delay: 0.16 + index * 0.028 }
								: { duration: hidden ? 0.24 : 0 }
						}
					>
						<SeatArt seat={seat} />
					</motion.div>
				);
			})}
			{SEATS.map((seat, index) => (
				<motion.div
					key={`${seat.name}-label`}
					className="absolute inset-0"
					animate={{ opacity: settled ? 1 : 0 }}
					transition={settled ? { duration: 0.34, ease: "easeOut", delay: 0.3 + index * 0.02 } : { duration: 0.2 }}
				>
					<SeatLabel seat={seat} />
				</motion.div>
			))}
			<motion.span
				className="-translate-x-1/2 absolute left-1/2 font-mono text-muted/55 text-sm leading-sm"
				style={{ top: WAIT_CENTER_Y + (160 * WAIT_SCALE) / 2 + 26 }}
				animate={{ opacity: settled || hidden ? 0 : 1 }}
				transition={{ duration: settled ? 0.2 : 0.3, ease: "easeOut" }}
			>
				spool · {FRAME_COUNT} frames
			</motion.span>
		</motion.div>
	);
}

export function useCarryPhase(): { landed: boolean; hidden: boolean } {
	const step = useTimeline(CARRY_STEPS);
	return { landed: step === 1, hidden: step === 2 };
}

/* ------------------------------------------------------------------- gate */

const GATE_MS = 160;
const STRIP_W = 320;
const STRIP_MS = 1000;

interface Act {
	/** ms the daemon took to answer, at real speed: this frame does not slow time down */
	readonly answer: number;
	readonly note: string;
}

const ACTS: readonly Act[] = [
	{ answer: 74, note: "below the gate · no loader drawn" },
	{ answer: 940, note: "loader in at 160ms · out over 400ms" },
	{ answer: 240, note: "loader in at 160ms · out over 400ms" },
];

const GATE_STEPS = [74, 1900, 940, 2000, 240, 1900] as const;

/**
 * How long the daemon may take before a loader is allowed to exist.
 *
 * Three boots in a row over one field, at real speed, because real speed is the
 * whole argument: a 74ms wait is over before an eye can register that anything
 * was missing, so drawing something and taking it back is worse than drawing
 * nothing. The gate is one line of code, a delay on the fade-in, and a boot that
 * beats it never renders a pixel of loader. The exit is the other half: once the
 * loader is up it leaves over 400ms across the arriving canvas, so a boot that
 * crosses the gate by a hair still never blinks.
 */
export function GateHandover({ step, loader }: { step: number; loader: React.ReactNode }) {
	const act = ACTS[Math.floor(step / 2)] ?? ACTS[0];
	const waiting = step % 2 === 0;
	const landed = !waiting;
	if (act === undefined) return null;
	return (
		<>
			<motion.div
				className="absolute inset-0"
				style={{ transformOrigin: "50% 46%" }}
				animate={{ scale: landed ? 1 : 1.035 }}
				transition={landed ? { duration: 0.6, ease: EASE } : { duration: 0 }}
			>
				{SEATS.map((seat, index) => (
					<motion.div
						key={seat.name}
						className="absolute"
						style={{ left: seat.x, top: seat.y, width: seat.w, height: seat.h }}
						animate={{ opacity: landed ? 1 : 0, scale: landed ? 1 : 0.985 }}
						transition={landed ? { duration: 0.24, ease: EASE, delay: index * 0.022 } : { duration: 0.16 }}
					>
						<SeatArt seat={seat} />
					</motion.div>
				))}
				{SEATS.map((seat, index) => (
					<motion.div
						key={`${seat.name}-label`}
						className="absolute inset-0"
						animate={{ opacity: landed ? 1 : 0 }}
						transition={landed ? { duration: 0.26, ease: "easeOut", delay: 0.14 + index * 0.016 } : { duration: 0.14 }}
					>
						<SeatLabel seat={seat} />
					</motion.div>
				))}
			</motion.div>
			<AnimatePresence>
				{waiting ? (
					<motion.div
						key={`loader-${step}`}
						className="absolute inset-0"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1, transition: { delay: GATE_MS / 1000, duration: 0.18, ease: "easeOut" } }}
						exit={{ opacity: 0, transition: { duration: 0.4, ease: "easeOut" } }}
					>
						{loader}
					</motion.div>
				) : null}
			</AnimatePresence>
			<GateStrip act={act} actIndex={Math.floor(step / 2)} waiting={waiting} />
		</>
	);
}

export function useGateStep(): number {
	return useTimeline(GATE_STEPS);
}

/** the instrument: a measured record of the run that just happened, not chrome */
function GateStrip({ act, actIndex, waiting }: { act: Act; actIndex: number; waiting: boolean }) {
	const gateX = (STRIP_W * GATE_MS) / STRIP_MS;
	return (
		<div className="absolute bottom-6 left-6 flex flex-col gap-2">
			<span className="h-4 font-mono text-2xs text-muted/70 leading-4">
				{waiting ? "waiting on the daemon" : `daemon answered in ${act.answer}ms`}
			</span>
			<div className="relative h-px bg-border-raised" style={{ width: STRIP_W }}>
				<motion.span
					key={actIndex}
					className="absolute inset-y-0 left-0 origin-left bg-thread"
					style={{ width: STRIP_W }}
					initial={{ scaleX: 0 }}
					animate={{ scaleX: act.answer / STRIP_MS }}
					transition={{ duration: act.answer / 1000, ease: "linear" }}
				/>
				<span className="-top-[3px] absolute h-[7px] w-px bg-muted/55" style={{ left: gateX }} />
			</div>
			<div className="relative h-3 font-mono text-2xs text-muted/45 leading-3" style={{ width: STRIP_W }}>
				<span className="absolute left-0">0</span>
				<span className="absolute" style={{ left: gateX + 7 }}>
					gate 160ms
				</span>
				<span className="absolute right-0">1s</span>
			</div>
			<motion.span
				className="h-4 font-mono text-2xs text-muted/45 leading-4"
				animate={{ opacity: waiting ? 0 : 1 }}
				transition={{ duration: 0.24, ease: "easeOut" }}
			>
				{act.note}
			</motion.span>
		</div>
	);
}

/* ------------------------------------------------------------------- none */

const NONE_STEPS = [2200, 2600] as const;

/**
 * The project that really is empty.
 *
 * frameCount comes from /api/projects, which resolved before the canvas painted
 * a pixel, so a canvas opening on an empty project knows it is empty at T0. The
 * right loading state for zero frames is the shipped empty state, drawn
 * immediately and never taken back. Nothing crossfades, no word changes, and
 * there is no moment where a person could read "no frames yet" as a lie.
 *
 * One hairline under the copy is the whole tell: a thread travelling while
 * /frames is out, gone once it lands. The rail is where the handover actually
 * shows, because the page row is the only thing that answer added.
 */
export function NoneHandover({ landed }: { landed: boolean }) {
	return (
		<div className="flex h-full flex-col items-center justify-center pb-20">
			<div className="flex flex-col items-center gap-3">
				<SpoolMark className="h-7 w-[22px] text-thread opacity-40" />
				<h1 className="font-medium text-base leading-base">No frames yet.</h1>
				<p className="font-mono text-muted text-sm leading-sm">
					An agent births a frame by writing frames/&lt;name&gt;/frame.tsx
				</p>
				<p className="font-mono text-muted text-xs leading-xs">spool skill · spool url</p>
			</div>
			<div className="relative mt-9 h-px w-[168px] overflow-hidden">
				<motion.span
					className="absolute inset-y-0 w-12 bg-thread"
					animate={landed ? { opacity: 0 } : { x: [-48, 168], opacity: [0, 0.75, 0.75, 0] }}
					transition={
						landed
							? { duration: 0.32, ease: "easeOut" }
							: {
									duration: 1.5,
									times: [0, 0.18, 0.82, 1],
									ease: "easeInOut",
									repeat: Number.POSITIVE_INFINITY,
								}
					}
				/>
			</div>
		</div>
	);
}

/** the rail an empty project ends up with: one page, nothing under it */
export function NoneRail({ landed }: { landed: boolean }) {
	return (
		<motion.div
			className="relative flex h-8 items-center bg-surface pr-3.5"
			animate={{ opacity: landed ? 1 : 0, x: landed ? 0 : -4 }}
			transition={{ duration: landed ? 0.3 : 0.2, ease: EASE }}
		>
			<span className="absolute top-1.5 bottom-1.5 left-0 w-[2px] rounded-full bg-thread" />
			<span className="flex h-8 w-6 shrink-0 items-center justify-center text-muted">
				<ChevronIcon open={true} className="h-2.5 w-2.5" />
			</span>
			<FolderIcon className="mr-2 h-3.5 w-3.5 shrink-0 text-thread" />
			<span className="min-w-0 flex-1 truncate font-mono text-sm text-text leading-sm">frames</span>
			<span className="font-mono text-2xs text-muted/60 leading-3">0</span>
		</motion.div>
	);
}

export function useNonePhase(): boolean {
	return useTimeline(NONE_STEPS) === 1;
}

/* ------------------------------------------------------------------ stall */

const THREAD_PATH = "M6 36C86 36 106 12 186 12C266 12 286 60 366 60C394 60 404 46 414 36";

/** the boot thread, cut where the answer should have been */
function CutThread() {
	return (
		<svg viewBox="0 0 420 72" className="h-[72px] w-[420px]" fill="none" aria-hidden="true">
			<motion.path
				d={THREAD_PATH}
				stroke="var(--color-thread)"
				strokeWidth={1.5}
				strokeLinecap="round"
				pathLength={1}
				strokeDasharray="0.56 1"
				animate={{ opacity: [0.9, 0.45, 0.9] }}
				transition={{ duration: 2.6, ease: "easeInOut", repeat: Number.POSITIVE_INFINITY }}
			/>
			<path
				d={THREAD_PATH}
				stroke="var(--color-border-raised)"
				strokeWidth={1.5}
				strokeLinecap="round"
				pathLength={1}
				strokeDasharray="0.32 1"
				strokeDashoffset={-0.68}
			/>
		</svg>
	);
}

function elapsedLabel(seconds: number): string {
	if (seconds < 60) return `${seconds}s`;
	return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

/**
 * The daemon that never answers.
 *
 * A wait becomes a failure at eight seconds, and from there the screen owes a
 * person three things: what broke, proof, and a way out. The proof block is the
 * request that is still open, so the elapsed counter keeps running in real
 * seconds while the screen is up. Retry is the loud verb because it is the one
 * that works most of the time; the commands underneath are for when it does
 * not.
 */
export function StallHandover() {
	const [seconds, setSeconds] = useState(18);
	useEffect(() => {
		const timer = window.setInterval(() => setSeconds((current) => current + 1), 1000);
		return () => window.clearInterval(timer);
	}, []);
	return (
		<div className="flex h-full flex-col items-center justify-center pb-20">
			<CutThread />
			<h1 className="mt-2 font-medium text-lg leading-lg">The local server is not answering.</h1>
			<p className="mt-3 max-w-[460px] text-center text-md text-muted leading-md">
				Your frames are on disk either way. spool reads them through the server on port 7767, and it has not
				replied since this canvas opened.
			</p>
			<div className="mt-7 flex w-[380px] flex-col gap-1.5 rounded-md border border-border-raised bg-surface px-3.5 py-3 font-mono text-2xs leading-4">
				<div className="flex items-center justify-between">
					<span className="text-muted">GET /api/p/spool/state</span>
					<span className="text-thread">no response</span>
				</div>
				<div className="flex items-center justify-between text-muted/55">
					<span>localhost:7767</span>
					<span>{elapsedLabel(seconds)}</span>
				</div>
			</div>
			<div className="mt-7 flex items-center gap-2">
				<button
					type="button"
					className="h-8 cursor-pointer rounded-sm bg-thread px-3.5 font-medium text-base text-on-thread leading-base"
				>
					Try again
				</button>
				<button
					type="button"
					className="h-8 cursor-pointer rounded-sm border border-border-raised px-3.5 text-base text-text leading-base hover:bg-surface"
				>
					Open the log
				</button>
			</div>
			<p className="mt-5 font-mono text-2xs text-muted/50 leading-3">spool status · spool stop · spool serve</p>
		</div>
	);
}

/** the tab keeps its name and loses its light: the project is open, the data is not */
export function StallRail() {
	return (
		<div className="flex h-8 items-center pr-3.5 pl-[26px]">
			<span className="font-mono text-muted/35 text-sm leading-sm">no answer</span>
		</div>
	);
}
