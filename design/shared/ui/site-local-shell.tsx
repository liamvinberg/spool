import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { cn } from "shared/lib/utils";
import { SpoolMark } from "shared/ui/spool-mark";

/**
 * The chrome every local.spool.page state wears, plus the primitives its frames
 * share. Same job as site-section.tsx: the composition that does not change
 * lives here once, so a state is a composition instead of a re-typing of a
 * header.
 *
 * The page is 1440x900 and nothing in it is measured at runtime — children
 * position absolutely in page coordinates, so a shot, the canvas and the player
 * all agree. Header: the lockup and one link out to the marketing site. Footer:
 * a hairline, the state's own footnote on the left, the repo on the right.
 *
 * CopyCommand is site-hub's CommandLine, carried over rather than reinvented:
 * the reflow-proof swap where only the trailing "$" crossfades with the copy
 * glyph, so the line box is identical at rest, on hover and once copied. The
 * prompt names the working directory, which is how "inside a project" is said
 * the terminal way and why these blocks need no label above them.
 *
 * DoorPlate is the settled direction: the address is the page's hero object, and
 * every state is the same doorplate reading differently. Nothing on this page is
 * ever a control — it probes on load, re-checks on a slow beat, and hands over
 * the moment Spool answers — so the plate's bottom strip is a readout, not a
 * toolbar, and the page's whole vocabulary is three marks:
 *
 *   thread, moving   the page is listening
 *   thread, steady   Spool answered
 *   ink              something is in the way (a wall, or the wrong tenant)
 */

export const PORT_URL = "http://127.0.0.1:7766";
export const PORT_LABEL = "127.0.0.1:7766";

/* ---------- copy, verbatim from the landing so behaviour matches ---------- */

async function copyText(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		try {
			const ta = document.createElement("textarea");
			ta.value = text;
			ta.setAttribute("readonly", "");
			ta.style.position = "fixed";
			ta.style.top = "0";
			ta.style.left = "0";
			ta.style.width = "1px";
			ta.style.height = "1px";
			ta.style.opacity = "0";
			document.body.appendChild(ta);
			ta.focus();
			ta.select();
			ta.setSelectionRange(0, text.length);
			const ok = document.execCommand("copy");
			document.body.removeChild(ta);
			return ok;
		} catch {
			return false;
		}
	}
}

function Tick({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 12 12" fill="none" aria-hidden="true" className={cn("h-3 w-3 shrink-0", className)}>
			<path
				d="M2.5 6.5 5 8.75 9.5 3.5"
				stroke="currentColor"
				strokeWidth="1.6"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function CopyGlyph({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 12 12" fill="none" aria-hidden="true" className={cn("h-3 w-3 shrink-0", className)}>
			<rect x="4.25" y="4.25" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.2" />
			<path
				d="M2.75 7.75h-.5a.75.75 0 0 1-.75-.75V2.25a.75.75 0 0 1 .75-.75H7a.75.75 0 0 1 .75.75v.5"
				stroke="currentColor"
				strokeWidth="1.2"
				strokeLinecap="round"
			/>
		</svg>
	);
}

export function CopyCommand({
	command,
	prompt = "$",
	className,
}: {
	command: string;
	prompt?: string;
	className?: string;
}) {
	const [copied, setCopied] = useState(false);
	const timer = useRef<number | null>(null);

	useEffect(
		() => () => {
			if (timer.current !== null) window.clearTimeout(timer.current);
		},
		[],
	);

	async function handleCopy() {
		const ok = await copyText(command);
		if (!ok) return;
		setCopied(true);
		if (timer.current !== null) window.clearTimeout(timer.current);
		timer.current = window.setTimeout(() => setCopied(false), 1500);
	}

	const path = prompt.endsWith("$") ? prompt.slice(0, -1) : `${prompt} `;
	return (
		<button
			type="button"
			onClick={handleCopy}
			aria-label={copied ? `copied ${command}` : `copy ${command}`}
			className={cn(
				"group/cmd block w-full cursor-pointer text-left font-mono focus-visible:outline-none",
				className,
			)}
		>
			<span className="select-none text-muted">{path}</span>
			<span className="relative mr-[1ch] inline-block w-[1ch] select-none text-center align-baseline">
				<span
					className={cn(
						"text-muted transition-opacity duration-150",
						copied ? "opacity-0" : "group-hover/cmd:opacity-0 group-focus-visible/cmd:opacity-0",
					)}
				>
					$
				</span>
				<CopyGlyph
					className={cn(
						"-translate-x-1/2 -translate-y-1/2 absolute top-1/2 left-1/2 text-thread opacity-0 transition-opacity duration-150",
						!copied && "group-hover/cmd:opacity-100 group-focus-visible/cmd:opacity-100",
					)}
				/>
				<Tick
					className={cn(
						"-translate-x-1/2 -translate-y-1/2 absolute top-1/2 left-1/2 text-thread transition-opacity duration-150",
						copied ? "opacity-100" : "opacity-0",
					)}
				/>
			</span>
			{command}
		</button>
	);
}

/* ---------- the address, always a real link to the daemon ---------- */

export function PortLink({ className }: { className?: string }) {
	return (
		<a
			href={PORT_URL}
			className={cn(
				"font-mono text-text underline decoration-border-raised decoration-1 underline-offset-[3px] transition-colors hover:decoration-thread",
				className,
			)}
		>
			{PORT_LABEL}
		</a>
	);
}

/* ---------- the station on the thread: a dot inside its own halo ---------- */

export function ThreadNode({ className }: { className?: string }) {
	return (
		<span className={cn("relative block h-[9px] w-[9px]", className)}>
			<span className="absolute -inset-[5px] rounded-full border border-thread/25" />
			<span className="absolute inset-0 rounded-full border-[3px] border-bg bg-thread" />
		</span>
	);
}

/* ---------- the doorplate, and the geometry every state agrees on ---------- */

/** the page's centre line: the plate, the headline and the probe all sit on it */
export const PAGE_MID = 720;
export const PLATE_W = 560;
export const PLATE_H = 148;
export const PLATE_TOP = 236;
export const PLATE_BOTTOM = PLATE_TOP + PLATE_H;

/**
 * One beat, in seconds: the page's re-check interval, and the period of every
 * rhythm on it. The drop down the probe and the pulse in the strip share it and
 * both start at mount, so they stay in phase for the life of the page — the
 * strip brightens exactly as a check lands, which is one heartbeat rather than
 * two things fidgeting.
 */
export const PLATE_BEAT = 3.6;

/** the probe, entering the page from the browser above it */
export const PROBE_IN =
	"linear-gradient(to bottom, transparent 0%, color-mix(in srgb, var(--color-thread) 60%, transparent) 34%, color-mix(in srgb, var(--color-thread) 60%, transparent) 100%)";

/** the stretch the page cannot see down: a guess, so it is dashed and faint */
export const PROBE_GUESS =
	"repeating-linear-gradient(to bottom, color-mix(in srgb, var(--color-thread) 26%, transparent) 0 3px, transparent 3px 10px)";

/** a check travelling down the probe, landing on `to` and dying there */
export function ProbeDrop({ from, to, left = PAGE_MID }: { from: number; to: number; left?: number }) {
	const reduce = useReducedMotion();
	if (reduce) return null;
	const travel = to - from;
	return (
		<motion.span
			className="pointer-events-none absolute block w-px"
			style={{
				left,
				top: from - 26,
				height: 26,
				background: "linear-gradient(to bottom, transparent, color-mix(in srgb, var(--color-thread) 95%, transparent))",
				boxShadow: "0 0 9px 1px color-mix(in srgb, var(--color-thread) 26%, transparent)",
			}}
			animate={{
				y: [0, travel * 0.18, travel * 0.84, travel, travel],
				opacity: [0, 1, 1, 0, 0],
			}}
			transition={{
				duration: PLATE_BEAT,
				times: [0, 0.14, 0.52, 0.62, 1],
				repeat: Number.POSITIVE_INFINITY,
				ease: "easeInOut",
			}}
		/>
	);
}

/**
 * What the plate can read:
 *   listening   nothing answered, and the page is still going
 *   answering   Spool is there
 *   blocked     the check never left the browser, so there is no reading at all
 *   occupied    something answered and it is not Spool
 */
export type PlateState = "listening" | "answering" | "blocked" | "occupied";

export function DoorPlate({
	state,
	status,
	note,
	handover = false,
}: {
	state: PlateState;
	/** the reading, left of the strip — house lowercase */
	status: string;
	/** what the reading amounts to, right of the strip — house lowercase */
	note: React.ReactNode;
	/** the found state only: the door's far edge lighting up as it hands over */
	handover?: boolean;
}) {
	const reduce = useReducedMotion();
	const answered = state === "answering";
	const steady = answered || state === "occupied";

	return (
		<div
			className={cn(
				"relative overflow-hidden rounded-lg border bg-surface/60 transition-colors duration-200",
				answered ? "border-thread/35 group-hover/plate:border-thread/70" : "border-border",
			)}
			style={{ width: PLATE_W, height: PLATE_H, viewTransitionName: "site-local-plate" }}
		>
			{/* the probe's footprint on the door: thread when the check reached it,
			    ink when something else was behind it, nothing when it never arrived */}
			{state !== "blocked" ? (
				<span
					className={cn(
						"absolute -translate-x-1/2 top-0 block h-px w-[26px]",
						state === "occupied" ? "bg-muted" : "bg-thread",
					)}
					style={{ left: PLATE_W / 2 }}
				/>
			) : null}

			<div className="flex h-[100px] items-center justify-center">
				<span className="font-mono text-[54px] leading-none tracking-[-0.02em]">{PORT_LABEL}</span>
			</div>

			<div className="relative flex h-[47px] items-center justify-between border-border border-t px-5">
				{handover ? (
					<motion.span
						className="absolute bottom-0 left-0 block h-px w-full origin-left bg-thread"
						initial={reduce ? { scaleX: 1 } : { scaleX: 0 }}
						animate={reduce ? { scaleX: 1 } : { scaleX: [0, 1] }}
						transition={
							reduce ? { duration: 0 } : { duration: 4.4, repeat: Number.POSITIVE_INFINITY, ease: "linear" }
						}
					/>
				) : null}

				<span className="flex items-center gap-2.5 font-mono text-muted text-xs leading-none">
					<motion.span
						className={cn("h-1.5 w-1.5 shrink-0 rounded-full", state === "occupied" ? "bg-muted" : "bg-thread")}
						style={
							answered
								? { boxShadow: "0 0 8px 1px color-mix(in srgb, var(--color-thread) 35%, transparent)" }
								: undefined
						}
						animate={steady || reduce ? { opacity: state === "occupied" ? 0.7 : 1 } : { opacity: [0.3, 0.3, 0.95, 0.3] }}
						transition={
							steady || reduce
								? { duration: 0.3 }
								: {
										duration: PLATE_BEAT,
										times: [0, 0.42, 0.66, 1],
										repeat: Number.POSITIVE_INFINITY,
										ease: "easeInOut",
									}
						}
					/>
					{status}
				</span>
				<span className="font-mono text-muted/70 text-xs leading-none">{note}</span>
			</div>
		</div>
	);
}

/* ---------- the page ---------- */

export function SiteLocalShell({
	footnote,
	children,
}: {
	/** the state's own closing line, set at the foot */
	footnote: React.ReactNode;
	/** positioned absolutely in the 1440x900 page */
	children: React.ReactNode;
}) {
	return (
		<div className="relative h-full w-full overflow-hidden bg-bg font-sans text-text antialiased [font-synthesis:none]">
			<header className="absolute inset-x-14 top-9 z-20 flex items-center justify-between">
				<div className="flex items-center gap-2.5">
					<SpoolMark className="h-5 w-5 text-thread" title="spool" />
					<span className="font-semibold text-md tracking-tight">spool</span>
				</div>
				<a
					href="https://spool.page"
					className="font-mono text-muted text-xs leading-none transition-colors hover:text-text"
				>
					spool.page
				</a>
			</header>

			{children}

			<footer className="absolute inset-x-14 bottom-0 z-20 flex h-[72px] items-center justify-between border-border border-t">
				<div className="text-muted text-sm leading-[18px]">{footnote}</div>
				<span className="shrink-0 pl-8 font-mono text-muted text-xs leading-none">
					github.com/liamvinberg/spool
				</span>
			</footer>
		</div>
	);
}
