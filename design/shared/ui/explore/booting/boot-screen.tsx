import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { cn } from "shared/lib/utils";
import { HandIcon, PanelCaret, SelectIcon } from "shared/ui/spool/icons";
import { SpoolMark } from "shared/ui/spool/mark";
import { SpoolShell } from "shared/ui/spool/shell";

/**
 * The gap between the canvas mounting and the project answering. Today the
 * rails and the field render empty for as long as the daemon takes, so a slow
 * answer is indistinguishable from a project with nothing in it.
 *
 * Four takes on what fills that gap, one per frame. The chrome under all four
 * is the shipped chrome at its emptiest — rails with their headers and nothing
 * in them, the tool bar where it always is — because the shell is up the whole
 * time. Only the field differs.
 */

const PAGES_W = 248;
const INSPECTOR_W = 300;

/** the tabs and zoom of a real session, so the bar reads as a machine mid-boot */
export function BootShell({ children, rail }: { children: ReactNode; rail?: ReactNode | undefined }) {
	return (
		<SpoolShell activeTab="spool" tabs={["upstream", "lek", "spool", "securesend-chat"]} zoom="100%" arrowsOn={true}>
			<BootChrome rail={rail}>{children}</BootChrome>
		</SpoolShell>
	);
}

/**
 * The chrome with nothing to draw. Copied from `spool-canvas-chrome` rather
 * than a flag added to it: the baseline frame is the app as it shipped, and a
 * boot state is a proposal until it is one.
 */
function BootChrome({ children, rail }: { children: ReactNode; rail?: ReactNode | undefined }) {
	return (
		<div className="flex h-full w-full overflow-hidden bg-bg">
			<aside className="flex shrink-0 flex-col border-border border-r bg-bg" style={{ width: PAGES_W }}>
				<div className="flex h-11 shrink-0 items-center justify-between border-border border-b pr-2 pl-3.5">
					<h1 className="font-semibold text-base leading-base">Pages</h1>
					<span className="flex h-7 w-7 items-center justify-center rounded-sm text-muted/60">
						<PanelCaret dir="left" className="h-3.5 w-2.5" />
					</span>
				</div>
				<div className="min-h-0 flex-1 overflow-hidden py-2">{rail}</div>
			</aside>
			<div className="relative min-w-0 flex-1 overflow-hidden bg-canvas">
				{children}
				<BootTools />
			</div>
			<aside
				aria-label="Inspector"
				className="flex shrink-0 flex-col border-border border-l bg-bg"
				style={{ width: INSPECTOR_W }}
			>
				<div className="flex h-11 shrink-0 items-stretch justify-between border-border border-b pr-2 pl-4">
					<div className="flex h-full items-stretch gap-5">
						{["elements", "connections"].map((tab) => (
							<span key={tab} className="flex h-full items-center font-mono text-muted/40 text-xs leading-xs">
								{tab}
							</span>
						))}
					</div>
					<span className="flex h-11 w-7 shrink-0 items-center justify-center text-muted/60">
						<PanelCaret dir="right" className="h-3.5 w-2.5" />
					</span>
				</div>
			</aside>
		</div>
	);
}

/** the tool bar is chrome, not canvas: it is up before the project answers */
function BootTools() {
	return (
		<div className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex justify-center">
			<div
				role="toolbar"
				aria-label="canvas tools"
				className="flex items-center gap-0.5 rounded-lg border border-border-raised bg-bg/90 p-1 backdrop-blur"
			>
				<span className="flex h-9 w-9 items-center justify-center rounded-md bg-raised text-text">
					<SelectIcon className="h-[18px] w-[18px]" />
				</span>
				<span className="flex h-9 w-9 items-center justify-center rounded-md text-muted">
					<HandIcon className="h-[18px] w-[18px]" />
				</span>
			</div>
		</div>
	);
}

/* ------------------------------------------------------------------ thread */

/**
 * One thread, pulled across the empty field and out the other side. It is the
 * same hairline the canvas draws between two frames, doing the one thing the
 * canvas never makes it do: travel. Nothing else moves, and nothing claims to
 * know how far along the boot is.
 */
export function ThreadBoot() {
	return (
		<div className="flex h-full items-center justify-center pb-16">
			<svg viewBox="0 0 420 72" className="h-[72px] w-[420px]" fill="none" aria-hidden="true">
				<title>opening</title>
				<motion.path
					d="M6 36C86 36 106 12 186 12C266 12 286 60 366 60C394 60 404 46 414 36"
					stroke="var(--color-thread)"
					strokeWidth={1.5}
					strokeLinecap="round"
					pathLength={1}
					strokeDasharray="1 1"
					initial={{ strokeDashoffset: 1 }}
					animate={{ strokeDashoffset: -1 }}
					transition={{ duration: 1.9, ease: "easeInOut", repeat: Number.POSITIVE_INFINITY }}
				/>
			</svg>
		</div>
	);
}

/* -------------------------------------------------------------------- wind */

/**
 * The mark winding on. The ribbon is already there at a twelfth of its weight,
 * and the thread lays into it from the bottom band up, the way a spool fills.
 * The logo is the loader: no second shape invented for the waiting.
 */
export function WindBoot() {
	return (
		<div className="flex h-full flex-col items-center justify-center gap-3.5 pb-16">
			<div className="relative h-[68px] w-[54px]">
				<SpoolMark className="absolute inset-0 h-full w-full text-thread/[0.14]" />
				<motion.div
					className="absolute inset-0"
					initial={{ clipPath: "inset(100% 0% 0% 0%)" }}
					animate={{ clipPath: ["inset(100% 0% 0% 0%)", "inset(0% 0% 0% 0%)", "inset(0% 0% 0% 0%)"] }}
					transition={{
						duration: 1.6,
						times: [0, 0.72, 1],
						ease: "easeInOut",
						repeat: Number.POSITIVE_INFINITY,
					}}
				>
					<SpoolMark className="h-full w-full text-thread" />
				</motion.div>
			</div>
			<span className="font-mono text-2xs text-muted/50 leading-3">spool</span>
		</div>
	);
}

/* ------------------------------------------------------------------ ghosts */

interface Ghost {
	readonly name: string;
	readonly x: number;
	readonly y: number;
	readonly w: number;
	readonly h: number;
}

/** what the project holds, at the zoom the camera is about to settle on */
const GHOSTS: readonly Ghost[] = [
	{ name: "spool-home", x: 56, y: 84, w: 288, h: 180 },
	{ name: "spool-canvas", x: 376, y: 84, w: 288, h: 180 },
	{ name: "spool-player", x: 56, y: 300, w: 288, h: 180 },
	{ name: "menu", x: 376, y: 300, w: 78, h: 169 },
	{ name: "cart", x: 474, y: 300, w: 78, h: 169 },
	{ name: "receipt", x: 572, y: 300, w: 78, h: 169 },
	{ name: "spool-system", x: 56, y: 516, w: 288, h: 180 },
	{ name: "spool-empty-project", x: 376, y: 516, w: 288, h: 180 },
];

const RAIL_ROWS: readonly { name: string; count: number }[] = [
	{ name: "app", count: 11 },
	{ name: "agent", count: 27 },
	{ name: "site", count: 5 },
	{ name: "manipulate", count: 9 },
];

const GHOST_CYCLE = 3.2;

/**
 * The field takes the shape of what is coming before it can draw it. Each
 * frame's outline lands at its own geometry, wearing its own name, and the
 * rail fills to the same beat — so the wait reads as the project assembling
 * rather than as a project with nothing in it.
 */
export function GhostsBoot() {
	return (
		<>
			{GHOSTS.map((ghost, index) => (
				<motion.div
					key={ghost.name}
					className="absolute flex flex-col gap-1.5"
					style={{ left: ghost.x, top: ghost.y }}
					initial={{ opacity: 0, y: 5 }}
					animate={{ opacity: [0, 1, 1, 0], y: [5, 0, 0, 0] }}
					transition={{
						duration: GHOST_CYCLE,
						times: [0, 0.14, 0.86, 1],
						delay: index * 0.07,
						ease: "easeOut",
						repeat: Number.POSITIVE_INFINITY,
						repeatDelay: 0.35,
					}}
				>
					<span
						className="min-w-0 truncate font-mono text-muted/55 text-sm leading-4"
						style={{ width: ghost.w }}
					>
						{ghost.name}
					</span>
					<div
						className="rounded-md border border-border-raised border-dashed bg-surface/40"
						style={{ width: ghost.w, height: ghost.h }}
					/>
				</motion.div>
			))}
		</>
	);
}

/** the rail fills on the same beat as the field, one row per page */
export function GhostsRail() {
	return (
		<>
			{RAIL_ROWS.map((row, index) => (
				<motion.div
					key={row.name}
					className="flex h-8 items-center pr-3.5 pl-[26px]"
					initial={{ opacity: 0 }}
					animate={{ opacity: [0, 1, 1, 0] }}
					transition={{
						duration: GHOST_CYCLE,
						times: [0, 0.14, 0.86, 1],
						delay: index * 0.07,
						ease: "easeOut",
						repeat: Number.POSITIVE_INFINITY,
						repeatDelay: 0.35,
					}}
				>
					<span className="min-w-0 flex-1 truncate font-mono text-muted text-sm leading-sm">{row.name}</span>
					<span className="font-mono text-2xs text-muted/60 leading-3">{row.count}</span>
				</motion.div>
			))}
		</>
	);
}

/* -------------------------------------------------------------------- line */

const STEPS: readonly string[] = ["reading design/frames", "61 frames · 9 pages", "placing"];

/**
 * The cheapest honest answer: leave the field alone and let the machine say
 * what it is doing, in the corner the rail already talks from. No shape is
 * drawn for the waiting, so nothing has to be un-drawn when the frames land.
 */
export function LineBoot() {
	const [step, setStep] = useState(0);
	useEffect(() => {
		const timer = setInterval(() => setStep((current) => (current + 1) % STEPS.length), 750);
		return () => clearInterval(timer);
	}, []);
	return (
		<div className="absolute bottom-4 left-4 flex items-center gap-1.5">
			<span className="font-mono text-muted/70 text-xs leading-xs">{STEPS[step]}</span>
			<motion.span
				className={cn("h-3 w-[6px] bg-thread")}
				animate={{ opacity: [1, 1, 0, 0] }}
				transition={{ duration: 0.9, times: [0, 0.5, 0.5, 1], repeat: Number.POSITIVE_INFINITY }}
			/>
		</div>
	);
}
