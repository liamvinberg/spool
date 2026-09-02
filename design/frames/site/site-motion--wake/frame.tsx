import { type MotionValue, motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "../../../shared/lib/utils";
import { SpoolMark } from "../../../shared/ui/spool-mark";

/**
 * site-motion--wake. spool.page argued through one motion character: a frame is
 * a program, so it boots when it arrives.
 *
 * The incumbent (site-hub--composed) spends its scroll on a camera: the page
 * shrinks into a frame and the canvas appears around it. One continuous
 * scroll-linked transform, one subject. This take does the opposite. The camera
 * never moves. The scroll is a wake line, and what crosses it starts running on
 * its own clock: a terminal types, an empty project receives its first frame, a
 * picker cascades, a project tab switches and the canvas under it swaps, 142
 * cells fill in. Nothing here is scrubbed by the wheel; the wheel only decides
 * what is awake. That is the whole claim of the product, performed rather than
 * described.
 *
 * The left spine is the page's own rail: eight lowercase names, each one a
 * section, each tick sitting at the exact scroll offset that wakes it, so the
 * red fill passes through a tick at the moment its name lights. The page reads
 * as a canvas of frames because that is what it is.
 *
 * Sleep is real. Scroll back above a wake line and the section drains to its
 * still, because a running thing that cannot stop was never running. Transform
 * and opacity only; every loop and every sweep is off under
 * prefers-reduced-motion, where the sections simply arrive already awake.
 */

/* ---------- the stage ---------- */

const VIEW_W = 1440;
const VIEW_H = 900;

const SPINE_X = 132;
const SPINE_TOP = 60;
const SPINE_BOT = 840;
const COPY_X = 176;
const COPY_W = 452;
const TILE_X = 700;
const TILE_W = 592;

const FIRST_TOP = 1040;
const PITCH = 620;
const TRACK_H = 5540;
const MAX_SCROLL = TRACK_H - VIEW_H;

/** a section is present while its top sits below the header band, and gone above it. */
const presenceAt = (contentTopY: number) => clamp01((contentTopY - 60) / 140);

const EASE = [0.22, 1, 0.36, 1] as const;
const OUT = [0.16, 1, 0.3, 1] as const;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

const dots = {
	backgroundImage:
		"radial-gradient(circle, color-mix(in srgb, var(--color-text) 9%, transparent) 1px, transparent 1px)",
	backgroundSize: "22px 22px",
};

/* ---------- glyphs ---------- */

function DownGlyph({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 12 14" fill="none" aria-hidden="true" className={className}>
			<path
				d="M6 1.5v9M2.5 7 6 10.5 9.5 7"
				stroke="currentColor"
				strokeWidth="1.3"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function FrameGlyph({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 14 14" className={className} fill="none" aria-hidden="true">
			<path d="M3 1.75h5l3 3v7.5H3z" stroke="currentColor" strokeWidth="1.15" strokeLinejoin="round" />
			<path d="M8 1.75v3h3" stroke="currentColor" strokeWidth="1.15" strokeLinejoin="round" />
		</svg>
	);
}

function FolderGlyph({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 14 14" className={className} fill="none" aria-hidden="true">
			<path
				d="M1.75 3.5h3.5l1.25 1.5h5.75v5.5H1.75z"
				stroke="currentColor"
				strokeWidth="1.15"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function PlusGlyph({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 12 12" className={className} fill="none" aria-hidden="true">
			<path d="M6 2.25v7.5M2.25 6h7.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
		</svg>
	);
}

function DownloadGlyph({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 12 12" className={className} fill="none" aria-hidden="true">
			<path
				d="M6 1.75v6.1M3.4 5.4 6 8l2.6-2.6M2.25 10.25h7.5"
				stroke="currentColor"
				strokeWidth="1.2"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function PlayTri({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 10 10" fill="currentColor" aria-hidden="true" className={className}>
			<path d="M2.7 1.5 8.4 5 2.7 8.5Z" />
		</svg>
	);
}

/* ---------- the install line ---------- */

async function copyText(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		return false;
	}
}

function CommandLine({ prompt, command, size = 15 }: { prompt: string; command: string; size?: number }) {
	const [copied, setCopied] = useState(false);
	const timer = useRef<number | null>(null);

	useEffect(
		() => () => {
			if (timer.current !== null) window.clearTimeout(timer.current);
		},
		[],
	);

	return (
		<button
			type="button"
			aria-label={copied ? `Copied ${command}` : `Copy ${command}`}
			onClick={() => {
				void copyText(command).then((ok) => {
					if (!ok) return;
					setCopied(true);
					if (timer.current !== null) window.clearTimeout(timer.current);
					timer.current = window.setTimeout(() => setCopied(false), 1500);
				});
			}}
			className="group/cmd block cursor-pointer text-left font-mono leading-[28px] focus-visible:outline-none"
			style={{ fontSize: size }}
		>
			<span className="select-none text-muted">{prompt} </span>
			<span className="text-text">{command}</span>
			<span
				className={cn(
					"ml-3 text-2xs uppercase tracking-[0.08em] transition-opacity duration-150",
					copied ? "text-thread opacity-100" : "text-muted opacity-0 group-hover/cmd:opacity-100",
				)}
			>
				{copied ? "copied" : "copy"}
			</span>
		</button>
	);
}

/* ---------- wake ---------- */

/** how many wake lines the scroll has crossed, with 70px of hysteresis. */
function useStage(scrollY: MotionValue<number>, lines: readonly number[]) {
	const [stage, setStage] = useState(0);
	useEffect(() => {
		const apply = (v: number) => {
			setStage((was) => {
				let next = 0;
				for (const [i, line] of lines.entries()) {
					const crossed = i < was ? v > line - 70 : v > line;
					if (crossed) next = i + 1;
				}
				return next === was ? was : next;
			});
		};
		apply(scrollY.get());
		return scrollY.on("change", apply);
	}, [scrollY, lines]);
	return stage;
}

interface Waking {
	awake: boolean;
	reduce: boolean;
}

/**
 * The tile shell. Asleep it is a still: drained, sat down 22px, its content
 * replaced by the bars a cover draws. Awake it comes up, a red line sweeps it
 * once, and whatever lives inside starts its own timeline.
 */
function Tile({ awake, reduce, h, children }: Waking & { h: number; children: ReactNode }) {
	return (
		<motion.div
			className="relative overflow-hidden rounded-[10px] border border-border bg-canvas"
			style={{ width: TILE_W, height: h }}
			initial={false}
			animate={{
				opacity: awake ? 1 : 0.38,
				y: awake ? 0 : 22,
				scale: awake ? 1 : 0.988,
			}}
			transition={{ duration: reduce ? 0 : awake ? 0.5 : 0.22, ease: EASE }}
		>
			<motion.div
				className="absolute inset-0 p-7"
				initial={false}
				animate={{ opacity: awake ? 0 : 1 }}
				transition={{ duration: reduce ? 0 : 0.22, ease: "easeOut" }}
			>
				<div className="h-3 w-[46%] rounded-[2px] bg-raised" />
				<div className="mt-4 space-y-2.5">
					<div className="h-[3px] w-[72%] rounded-full bg-border-raised" />
					<div className="h-[3px] w-[58%] rounded-full bg-border-raised" />
					<div className="h-[3px] w-[64%] rounded-full bg-border-raised" />
				</div>
				<div className="mt-7 h-[38%] rounded-[6px] border border-border" />
			</motion.div>

			<motion.div
				className="absolute inset-0"
				initial={false}
				animate={{ opacity: awake ? 1 : 0 }}
				transition={{ duration: reduce ? 0 : 0.3, ease: EASE, delay: reduce || !awake ? 0 : 0.14 }}
			>
				{children}
			</motion.div>

			{reduce ? null : (
				<motion.div
					className="pointer-events-none absolute inset-x-0 z-20 h-[150px]"
					style={{
						top: 0,
						background:
							"linear-gradient(to bottom, transparent, color-mix(in srgb, var(--color-thread) 20%, transparent), transparent)",
					}}
					initial={false}
					animate={awake ? { y: [-170, h + 30], opacity: [0.95, 0] } : { y: -200, opacity: 0 }}
					transition={{ duration: 0.9, ease: OUT }}
				/>
			)}
		</motion.div>
	);
}

/* ---------- tile one: the hero canvas, awake from the first pixel ---------- */

interface MiniSpec {
	x: number;
	y: number;
	w: number;
	h: number;
	name: string;
	ring?: boolean;
}

const MINI: readonly MiniSpec[] = [
	{ x: 30, y: 74, w: 168, h: 110, name: "home" },
	{ x: 262, y: 46, w: 186, h: 118, name: "cart", ring: true },
	{ x: 140, y: 254, w: 176, h: 112, name: "checkout" },
	{ x: 396, y: 262, w: 162, h: 104, name: "receipt" },
];

function HeroCanvas({ reduce }: { reduce: boolean }) {
	return (
		<div className="relative h-full w-full overflow-hidden rounded-[10px] border border-border bg-canvas">
			<div className="absolute inset-0" style={dots} />

			<svg
				className="absolute inset-0 overflow-visible"
				width={620}
				height={460}
				fill="none"
				aria-hidden="true"
			>
				<path
					d="M198 128 C 232 128, 230 102, 262 102"
					stroke="var(--color-thread)"
					strokeWidth="1.5"
					opacity="0.85"
				/>
				<path
					d="M355 164 C 355 214, 262 216, 228 254"
					stroke="var(--color-thread)"
					strokeWidth="1.5"
					opacity="0.85"
				/>
				<path
					d="M316 310 C 350 310, 364 314, 396 314"
					stroke="var(--color-thread)"
					strokeWidth="1.5"
					opacity="0.85"
				/>
			</svg>

			{MINI.map((m) => (
				<div key={m.name} className="absolute" style={{ left: m.x, top: m.y, width: m.w }}>
					<div className="mb-1.5 flex items-center gap-1.5 font-mono text-2xs leading-none">
						<span className={m.ring === true ? "text-thread" : "text-muted/70"}>
							{m.ring === true ? "▶" : "▸"}
						</span>
						<span className={m.ring === true ? "text-thread" : "text-muted"}>{m.name}</span>
					</div>
					<div className="relative" style={{ height: m.h }}>
						<div className="h-full w-full overflow-hidden rounded-[4px] border border-border bg-surface">
							<div className="space-y-2 p-2.5">
								<div className="h-2 w-[62%] rounded-[1px] bg-raised" />
								<div className="h-[3px] w-[84%] rounded-full bg-border-raised" />
								<div className="h-[3px] w-[54%] rounded-full bg-border-raised" />
								<div className="mt-3 h-3.5 w-[46%] rounded-[2px] bg-thread/70" />
							</div>
						</div>
						{m.ring === true ? (
							<>
								<span className="pointer-events-none absolute inset-0 rounded-[4px] border-[1.5px] border-thread" />
								<span className="-bottom-[8px] -translate-x-1/2 absolute left-1/2 rounded-xs bg-thread px-1.5 py-[2px] font-mono text-[9px] text-on-thread leading-none">
									1440 × 900
								</span>
							</>
						) : null}
					</div>
				</div>
			))}

			{reduce ? null : (
				<motion.span
					className="absolute block h-[6px] w-[6px] rounded-full bg-thread"
					style={{ left: 195, top: 125 }}
					animate={{ x: [0, 67, 67, 0], y: [0, -26, -26, 0], opacity: [0, 1, 1, 0] }}
					transition={{ duration: 3.4, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
				/>
			)}

			<div className="absolute right-4 bottom-4 flex items-center gap-2 font-mono text-2xs text-muted leading-none">
				<motion.span
					className="block h-1.5 w-1.5 rounded-full bg-thread"
					animate={reduce ? undefined : { opacity: [1, 0.25, 1] }}
					transition={{ duration: 2.2, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
				/>
				4 frames · 3 flows
			</div>
		</div>
	);
}

/* ---------- tile two: the terminal that types itself ---------- */

const TERMINAL: readonly { prompt: string; text: string; kind: "in" | "out" }[] = [
	{ prompt: "~ $", text: "npm i -g spool.page", kind: "in" },
	{ prompt: "", text: "added 41 packages in 6s", kind: "out" },
	{ prompt: "~/tvarso $", text: "spool init", kind: "in" },
	{ prompt: "", text: "design/ created · project registered", kind: "out" },
	{ prompt: "~/tvarso $", text: "spool serve", kind: "in" },
	{ prompt: "", text: "http://localhost:7766", kind: "out" },
];

function TypedLine({ line, index, awake, reduce }: { line: (typeof TERMINAL)[number]; index: number; awake: boolean; reduce: boolean }) {
	const base = 0.16 + index * 0.42;
	const chars = [...line.text];
	return (
		<div className="flex gap-2 font-mono text-[13px] leading-[24px]">
			<span className="shrink-0 select-none text-muted">{line.prompt}</span>
			<span className={line.kind === "in" ? "text-text" : "text-muted"}>
				{line.kind === "out" || reduce ? (
					<motion.span
						className="inline-block"
						initial={false}
						animate={{ opacity: awake ? 1 : 0 }}
						transition={{ duration: reduce ? 0 : 0.2, delay: reduce || !awake ? 0 : base }}
					>
						{line.text}
					</motion.span>
				) : (
					chars.map((c, i) => (
						<motion.span
							// biome-ignore lint/suspicious/noArrayIndexKey: a character's identity is its position
							key={i}
							initial={false}
							animate={{ opacity: awake ? 1 : 0 }}
							transition={{ duration: 0.01, delay: awake ? base + i * 0.022 : 0 }}
						>
							{c === " " ? " " : c}
						</motion.span>
					))
				)}
			</span>
		</div>
	);
}

function TerminalTile({ awake, reduce }: Waking) {
	return (
		<div className="flex h-full w-full flex-col bg-bg">
			<div className="flex items-center justify-between border-border border-b px-4 py-2.5 font-mono text-2xs text-muted">
				<span>~/tvarso</span>
				<span>zsh</span>
			</div>
			<div className="flex-1 p-5">
				{TERMINAL.map((line, i) => (
					<TypedLine key={line.text} line={line} index={i} awake={awake} reduce={reduce} />
				))}
				<div className="flex gap-2 font-mono text-[13px] leading-[24px]">
					<span className="text-muted">~/tvarso $</span>
					<motion.span
						className="mt-[5px] block h-[14px] w-[7px] bg-thread"
						initial={false}
						animate={awake && !reduce ? { opacity: [1, 1, 0.1, 0.1] } : { opacity: awake ? 1 : 0 }}
						transition={
							awake && !reduce
								? { duration: 1.1, repeat: Number.POSITIVE_INFINITY, ease: "linear", delay: 2.7 }
								: { duration: 0.2 }
						}
					/>
				</div>
			</div>
		</div>
	);
}

/* ---------- tile three: the empty project receiving its first frame ---------- */

function SpoolShell({ children, rail }: { children: ReactNode; rail: ReactNode }) {
	return (
		<div className="flex h-full w-full flex-col bg-bg">
			<div className="flex h-[26px] shrink-0 items-center gap-2 border-border border-b px-3">
				<SpoolMark className="h-3 w-[10px] text-thread" />
				<span className="rounded-t-[3px] bg-surface px-2 py-[3px] font-mono text-[9px] text-text leading-none">
					tvarso
				</span>
				<span className="text-muted/70">
					<PlusGlyph className="h-2.5 w-2.5" />
				</span>
			</div>
			<div className="flex min-h-0 flex-1">
				<div className="w-[122px] shrink-0 border-border border-r bg-bg py-2">{rail}</div>
				<div className="relative min-w-0 flex-1 bg-canvas" style={dots}>
					{children}
				</div>
			</div>
		</div>
	);
}

function RailRow({ name, kind, active }: { name: string; kind: "dir" | "frame"; active?: boolean }) {
	return (
		<div
			className={cn(
				"flex h-[20px] items-center gap-1.5 px-2.5 font-mono text-[9px] leading-none",
				active === true ? "bg-raised text-thread" : "text-muted",
			)}
		>
			{kind === "dir" ? (
				<FolderGlyph className="h-2.5 w-2.5 shrink-0" />
			) : (
				<FrameGlyph className="h-2.5 w-2.5 shrink-0" />
			)}
			<span className="truncate">{name}</span>
		</div>
	);
}

function EmptyTile({ awake, reduce }: Waking) {
	const [written, setWritten] = useState(false);

	useEffect(() => {
		if (!awake) {
			setWritten(false);
			return;
		}
		if (reduce) {
			setWritten(true);
			return;
		}
		const id = window.setTimeout(() => setWritten(true), 1250);
		return () => window.clearTimeout(id);
	}, [awake, reduce]);

	return (
		<SpoolShell
			rail={
				<>
					<div className="px-2.5 pb-2 font-mono text-[9px] text-muted/60 leading-none">design/frames</div>
					<motion.div
						initial={false}
						animate={{ opacity: written ? 1 : 0, x: written ? 0 : -6 }}
						transition={{ duration: reduce ? 0 : 0.3, ease: EASE }}
					>
						<RailRow name="home" kind="frame" active />
					</motion.div>
				</>
			}
		>
			<motion.div
				className="absolute inset-0 flex items-center justify-center font-mono text-[11px] text-muted/70"
				initial={false}
				animate={{ opacity: written ? 0 : 1 }}
				transition={{ duration: reduce ? 0 : 0.28, ease: EASE }}
			>
				no frames yet
			</motion.div>

			<motion.div
				className="absolute"
				style={{ left: 96, top: 62, width: 190 }}
				initial={false}
				animate={{ opacity: written ? 1 : 0, y: written ? 0 : 10, scale: written ? 1 : 0.97 }}
				transition={{ duration: reduce ? 0 : 0.42, ease: EASE }}
			>
				<div className="mb-1.5 flex items-center gap-1.5 font-mono text-[9px] text-thread leading-none">
					<span>▶</span>
					<span>home</span>
				</div>
				<div className="relative h-[118px] overflow-hidden rounded-[4px] border border-border bg-surface">
					<div className="space-y-2 p-3">
						<div className="h-2.5 w-[64%] rounded-[1px] bg-raised" />
						<div className="h-[3px] w-[88%] rounded-full bg-border-raised" />
						<div className="h-[3px] w-[70%] rounded-full bg-border-raised" />
						<div className="h-[3px] w-[78%] rounded-full bg-border-raised" />
						<div className="mt-3 h-4 w-[52%] rounded-[2px] bg-thread/70" />
					</div>
					<span className="pointer-events-none absolute inset-0 rounded-[4px] border-[1.5px] border-thread" />
				</div>
			</motion.div>

			<div className="absolute right-3 bottom-3 font-mono text-[9px] text-muted/60 leading-none">
				{written ? "1 frame" : "0 frames"}
			</div>
		</SpoolShell>
	);
}

/* ---------- tile four: the picker ---------- */

const FOLDERS = ["~/tvarso", "~/kaffe", "~/projects/spool", "~/work/atlas", "~/scratch/tuesday"] as const;

function PickerTile({ awake, reduce }: Waking) {
	const [picked, setPicked] = useState(false);

	useEffect(() => {
		if (!awake) {
			setPicked(false);
			return;
		}
		if (reduce) {
			setPicked(true);
			return;
		}
		const id = window.setTimeout(() => setPicked(true), 1500);
		return () => window.clearTimeout(id);
	}, [awake, reduce]);

	return (
		<div className="relative flex h-full w-full items-center justify-center bg-bg">
			<div className="absolute inset-0" style={dots} />
			<motion.div
				className="relative w-[330px] overflow-hidden rounded-[8px] border border-border-raised bg-surface"
				initial={false}
				animate={{ opacity: awake ? 1 : 0, scale: awake ? 1 : 0.97 }}
				transition={{ duration: reduce ? 0 : 0.34, ease: EASE }}
			>
				<div className="flex items-center gap-2 border-border border-b px-3.5 py-2.5">
					<span className="text-thread">
						<PlusGlyph className="h-3 w-3" />
					</span>
					<span className="font-mono text-[11px] text-muted">open a folder</span>
				</div>
				<div className="py-1.5">
					{FOLDERS.map((f, i) => {
						const chosen = picked && i === 0;
						return (
							<motion.div
								key={f}
								className={cn(
									"flex items-center gap-2 px-3.5 py-[7px] font-mono text-[11px] leading-none transition-colors duration-200",
									chosen ? "bg-raised text-thread" : "text-muted",
								)}
								initial={false}
								animate={{ opacity: awake ? 1 : 0, x: awake ? 0 : -14 }}
								transition={{
									duration: reduce ? 0 : 0.3,
									ease: EASE,
									delay: reduce || !awake ? 0 : 0.1 + i * 0.06,
								}}
							>
								<FolderGlyph className={cn("h-3 w-3 shrink-0", chosen ? "text-thread" : "text-muted/70")} />
								<span>{f}</span>
								{i === 2 ? <span className="ml-auto text-[9px] text-muted/60">142 frames</span> : null}
							</motion.div>
						);
					})}
				</div>
				<div className="border-border border-t px-3.5 py-2 font-mono text-[9px] text-muted/60">
					↑↓ to move · ⏎ to open
				</div>
			</motion.div>

			<motion.div
				className="absolute top-4 left-4 flex items-center gap-1.5 rounded-[4px] border border-thread/50 bg-bg px-2 py-1 font-mono text-[10px] text-thread leading-none"
				initial={false}
				animate={{ opacity: picked ? 1 : 0, y: picked ? 0 : -8 }}
				transition={{ duration: reduce ? 0 : 0.32, ease: EASE }}
			>
				<FrameGlyph className="h-2.5 w-2.5" />
				tvarso
			</motion.div>
		</div>
	);
}

/* ---------- tile five: several projects, and the tab that switches ---------- */

const PROJECTS = [
	{ name: "tvarso", frames: 18, accentRow: "62%" },
	{ name: "kaffe", frames: 9, accentRow: "44%" },
	{ name: "spool", frames: 142, accentRow: "78%" },
] as const;

function ProjectsTile({ awake, reduce }: Waking) {
	const [active, setActive] = useState(0);

	useEffect(() => {
		if (!awake || reduce) return;
		const id = window.setInterval(() => setActive((a) => (a + 1) % PROJECTS.length), 2600);
		return () => window.clearInterval(id);
	}, [awake, reduce]);

	useEffect(() => {
		if (!awake) setActive(0);
	}, [awake]);

	return (
		<div className="flex h-full w-full flex-col bg-bg">
			<div className="flex h-[30px] shrink-0 items-center gap-1.5 border-border border-b px-3">
				<SpoolMark className="mr-1 h-3 w-[10px] text-thread" />
				{PROJECTS.map((p, i) => (
					<motion.span
						key={p.name}
						className={cn(
							"rounded-t-[3px] px-2.5 py-[4px] font-mono text-[10px] leading-none",
							i === active ? "bg-surface text-text" : "text-muted/70",
						)}
						initial={false}
						animate={{ opacity: awake ? 1 : 0, y: awake ? 0 : -6 }}
						transition={{ duration: reduce ? 0 : 0.28, ease: EASE, delay: reduce || !awake ? 0 : i * 0.07 }}
					>
						{p.name}
					</motion.span>
				))}
				<span className="ml-auto text-muted/60">
					<PlusGlyph className="h-2.5 w-2.5" />
				</span>
			</div>

			{/* all three canvases stay mounted and cross under the tabs, so the swap
			    never shows an empty field */}
			<div className="relative min-h-0 flex-1 overflow-hidden bg-canvas" style={dots}>
				{PROJECTS.map((p, i) => (
					<motion.div
						key={p.name}
						className="absolute inset-0 p-5"
						initial={false}
						animate={{ opacity: i === active ? 1 : 0, x: i === active ? 0 : 18 }}
						transition={{ duration: reduce ? 0 : 0.38, ease: EASE }}
					>
						<div className="flex gap-3">
							{[0, 1, 2].map((c) => (
								<div
									key={c}
									className="flex-1 overflow-hidden rounded-[4px] border border-border bg-surface"
									style={{ height: 96 + c * 14 + i * 6 }}
								>
									<div className="space-y-2 p-2.5">
										<div className="h-2 w-[58%] rounded-[1px] bg-raised" />
										<div
											className="h-[3px] rounded-full bg-border-raised"
											style={{ width: p.accentRow }}
										/>
										<div className="h-[3px] w-[46%] rounded-full bg-border-raised" />
										{c === 1 ? <div className="mt-2 h-3 w-[50%] rounded-[2px] bg-thread/70" /> : null}
									</div>
								</div>
							))}
						</div>
						<div className="mt-5 flex items-center gap-2 font-mono text-[10px] text-muted leading-none">
							<span className="text-thread">▶</span>
							<span>
								~/{p.name} · {p.frames} frames
							</span>
						</div>
					</motion.div>
				))}
			</div>
		</div>
	);
}

/* ---------- tile six: 142 cells ---------- */

const GRID_COLS = 16;
const GRID_COUNT = 142;
const SELF_INDEX = 98;

function DogfoodTile({ awake, reduce }: Waking) {
	return (
		<div className="flex h-full w-full flex-col bg-bg p-5">
			<div className="flex items-baseline justify-between font-mono text-[10px] leading-none">
				<span className="text-muted">design/frames</span>
				<span className="text-muted/60">12 pages · 142 frames</span>
			</div>

			<div className="mt-4 flex flex-wrap gap-[4px]">
				{Array.from({ length: GRID_COUNT }, (_, i) => {
					const col = i % GRID_COLS;
					const row = Math.floor(i / GRID_COLS);
					const self = i === SELF_INDEX;
					return (
						<motion.span
							// biome-ignore lint/suspicious/noArrayIndexKey: the cells are a count, not a list
							key={i}
							className={cn("block h-[17px] w-[28px] rounded-[2px]", self ? "bg-thread" : "bg-raised")}
							initial={false}
							animate={{ opacity: awake ? (self ? 1 : 0.85) : 0, scale: awake ? 1 : 0.7 }}
							transition={{
								duration: reduce ? 0 : 0.26,
								ease: EASE,
								delay: reduce || !awake ? 0 : (col + row) * 0.018,
							}}
						/>
					);
				})}
			</div>

			<motion.div
				className="mt-auto flex items-center gap-2 font-mono text-[10px] leading-none"
				initial={false}
				animate={{ opacity: awake ? 1 : 0 }}
				transition={{ duration: reduce ? 0 : 0.3, delay: reduce || !awake ? 0 : 0.75 }}
			>
				<span className="block h-2 w-3 rounded-[1px] bg-thread" />
				<span className="text-muted">
					the red one is this page: <span className="text-text">site/site-motion--wake</span>
				</span>
			</motion.div>
		</div>
	);
}

/* ---------- tile seven: the video slot ---------- */

function VideoTile({ awake, reduce }: Waking) {
	return (
		<div className="relative h-full w-full overflow-hidden bg-bg">
			<div className="absolute inset-0" style={dots} />
			<div className="absolute inset-0 flex flex-col items-center justify-center gap-5">
				<motion.button
					type="button"
					aria-label="Play the walkthrough"
					className="flex h-[64px] w-[64px] cursor-pointer items-center justify-center rounded-full border-[1.5px] border-thread text-thread transition-colors duration-200 hover:bg-thread hover:text-on-thread focus-visible:outline-none"
					initial={false}
					animate={{ opacity: awake ? 1 : 0, scale: awake ? 1 : 0.86 }}
					transition={
						reduce
							? { duration: 0 }
							: { type: "spring", stiffness: 320, damping: 22, mass: 0.7, delay: awake ? 0.12 : 0 }
					}
				>
					<PlayTri className="ml-[3px] h-[18px] w-[18px]" />
				</motion.button>
				<motion.div
					className="font-mono text-[11px] text-muted leading-none"
					initial={false}
					animate={{ opacity: awake ? 1 : 0, y: awake ? 0 : 6 }}
					transition={{ duration: reduce ? 0 : 0.3, ease: EASE, delay: reduce || !awake ? 0 : 0.24 }}
				>
					empty folder → first frame · 02:14
				</motion.div>
			</div>
			<div className="absolute inset-x-5 bottom-4 h-[3px] rounded-full bg-border-raised">
				<motion.div
					className="h-full origin-left rounded-full bg-thread"
					initial={false}
					animate={{ scaleX: awake ? 0.06 : 0 }}
					transition={{ duration: reduce ? 0 : 0.5, ease: EASE, delay: reduce || !awake ? 0 : 0.3 }}
					style={{ width: "100%" }}
				/>
			</div>
		</div>
	);
}

/* ---------- the sections ---------- */

interface Beat {
	id: string;
	label: string;
	title: string;
	body: ReactNode;
	foot?: ReactNode;
	tileH: number;
	Tile: (p: Waking) => ReactNode;
}

const BEATS: readonly Beat[] = [
	{
		id: "install",
		label: "install",
		title: "One line, then it is a command",
		body: (
			<>
				It publishes to npm as a global binary. Node 22+, and the canvas looks best in Chrome. If you would
				rather double-click something, there is a Mac build.
			</>
		),
		foot: (
			<span className="inline-flex items-center gap-2 rounded-[6px] border border-border-raised px-3 py-2 font-mono text-muted text-xs">
				<DownloadGlyph className="h-3 w-3 text-thread" />
				<span className="text-text">Spool.dmg</span>
				<span className="text-muted/60">macOS · Apple silicon</span>
			</span>
		),
		tileH: 344,
		Tile: (p) => <TerminalTile {...p} />,
	},
	{
		id: "first-run",
		label: "first-run",
		title: "The first canvas is empty",
		body: (
			<>
				A rail, a field, and <span className="font-mono text-text text-[14px]">no frames yet</span> in the
				middle of it. Your agent writes <span className="font-mono text-text text-[14px]">design/frames/home/frame.tsx</span>{" "}
				and the frame is on the canvas before you switch windows.
			</>
		),
		tileH: 330,
		Tile: (p) => <EmptyTile {...p} />,
	},
	{
		id: "picker",
		label: "picker",
		title: "Point it at any folder",
		body: (
			<>
				Press <span className="font-mono text-text text-[14px]">+</span> and pick a folder anywhere on your
				machine. spool opens the <span className="font-mono text-text text-[14px]">design/</span> it finds
				there, and writes one for a folder that is new to it.
			</>
		),
		tileH: 330,
		Tile: (p) => <PickerTile {...p} />,
	},
	{
		id: "projects",
		label: "projects",
		title: "Keep a few of them open",
		body: (
			<>
				Every project holds its own canvas, in its own repo, on your disk. The tabs along the top are how you
				cross between them, and the daemon serves all of them at once.
			</>
		),
		tileH: 330,
		Tile: (p) => <ProjectsTile {...p} />,
	},
	{
		id: "design",
		label: "design",
		title: "spool is designed in spool",
		body: (
			<>
				This page is a frame in spool's own <span className="font-mono text-text text-[14px]">design/</span>{" "}
				folder, sitting on the site page beside 141 others. I arrange them on the canvas and walk the flows the
				same way you will.
			</>
		),
		tileH: 330,
		Tile: (p) => <DogfoodTile {...p} />,
	},
	{
		id: "video",
		label: "video",
		title: "Two minutes, start to finish",
		body: (
			<>
				Watch me open a folder, ask for a frame, and click through the flow it lands in. Same loop you get on
				your own machine, at the speed it actually runs.
			</>
		),
		tileH: 330,
		Tile: (p) => <VideoTile {...p} />,
	},
];

const LINES: readonly number[] = BEATS.map((_, i) => FIRST_TOP + i * PITCH - 560);
const MIT_TOP = FIRST_TOP + BEATS.length * PITCH;
const MIT_LINE = MIT_TOP - 560;
const ALL_LINES: readonly number[] = [...LINES, MIT_LINE];

const RAIL_NAMES: readonly string[] = ["hero", ...BEATS.map((b) => b.label), "license"];

/**
 * One section: it arrives from the bottom as a still, wakes on its line, and
 * leaves by fading before it can reach the header. Presence is scroll-linked
 * because arrival is a position; everything inside runs on its own clock
 * because running is not a position.
 */
function Section({
	beat,
	top,
	awake,
	reduce,
	scrollY,
}: {
	beat: Beat;
	top: number;
	awake: boolean;
	reduce: boolean;
	scrollY: MotionValue<number>;
}) {
	const presence = useTransform(scrollY, (v: number) => presenceAt(top - v));
	const shown = awake;
	return (
		<motion.div className="absolute top-0 left-0" style={{ width: VIEW_W, opacity: presence }}>
			<motion.div
				className="absolute"
				style={{ left: COPY_X, top: top + 26, width: COPY_W }}
				initial={false}
				animate={{ opacity: shown ? 1 : 0.3, y: shown ? 0 : 16 }}
				transition={{ duration: reduce ? 0 : shown ? 0.46 : 0.2, ease: EASE }}
			>
				<h2 className="font-semibold text-[34px] leading-[1.08] tracking-[-0.02em]">{beat.title}</h2>
				<motion.p
					className="mt-5 text-[16px] text-muted leading-[26px]"
					initial={false}
					animate={{ opacity: shown ? 1 : 0, y: shown ? 0 : 10 }}
					transition={{ duration: reduce ? 0 : 0.4, ease: EASE, delay: reduce || !shown ? 0 : 0.1 }}
				>
					{beat.body}
				</motion.p>
				{beat.foot === undefined ? null : (
					<motion.div
						className="mt-7"
						initial={false}
						animate={{ opacity: shown ? 1 : 0, y: shown ? 0 : 8 }}
						transition={{ duration: reduce ? 0 : 0.4, ease: EASE, delay: reduce || !shown ? 0 : 0.2 }}
					>
						{beat.foot}
					</motion.div>
				)}
			</motion.div>

			<div className="absolute" style={{ left: TILE_X, top }}>
				<Tile awake={shown} reduce={reduce} h={beat.tileH}>
					{beat.Tile({ awake: shown, reduce })}
				</Tile>
			</div>
		</motion.div>
	);
}

/* ---------- the spine ---------- */

function Spine({ scrollY, stage }: { scrollY: MotionValue<number>; stage: number }) {
	const fill = useTransform(scrollY, (v: number) => clamp01(v / MAX_SCROLL));
	const ticks = [0, ...ALL_LINES.map((l) => l / MAX_SCROLL)];

	return (
		<div className="pointer-events-none absolute top-0 left-0" style={{ width: VIEW_W, height: VIEW_H }}>
			<div
				className="absolute w-px bg-border-raised/70"
				style={{ left: SPINE_X, top: SPINE_TOP, height: SPINE_BOT - SPINE_TOP }}
			/>
			<motion.div
				className="absolute w-px origin-top bg-thread"
				style={{ left: SPINE_X, top: SPINE_TOP, height: SPINE_BOT - SPINE_TOP, scaleY: fill }}
			/>
			{ticks.map((frac, i) => {
				const y = SPINE_TOP + clamp01(frac) * (SPINE_BOT - SPINE_TOP);
				const lit = stage >= i;
				const name = RAIL_NAMES[i] ?? "";
				return (
					<div key={name} className="absolute" style={{ left: 0, top: y, width: SPINE_X }}>
						<span
							className={cn(
								"-translate-y-1/2 absolute block rounded-full transition-all duration-300",
								lit ? "h-[7px] w-[7px] bg-thread" : "h-[5px] w-[5px] bg-border-raised",
							)}
							style={{ left: lit ? SPINE_X - 3 : SPINE_X - 2 }}
						/>
						<span
							className={cn(
								"-translate-y-1/2 absolute right-[26px] whitespace-nowrap font-mono text-2xs leading-none transition-colors duration-300",
								lit ? "text-thread" : "text-muted/45",
							)}
						>
							{name}
						</span>
					</div>
				);
			})}
		</div>
	);
}

/* ---------- the frame ---------- */

export default function SiteMotionWake() {
	const scrollRef = useRef<HTMLDivElement>(null);
	const reduce = useReducedMotion() === true;

	const raw = useMotionValue(0);
	const scrollY = useSpring(raw, { stiffness: 190, damping: 34, mass: 0.9 });
	const stage = useStage(raw, ALL_LINES);

	useEffect(() => {
		const el = scrollRef.current;
		if (!el) return;
		const measure = () => raw.set(el.scrollTop);
		el.addEventListener("scroll", measure, { passive: true });
		measure();
		return () => el.removeEventListener("scroll", measure);
	}, [raw]);

	const hintOpacity = useTransform(scrollY, [0, 260], [1, 0]);
	const heroOpacity = useTransform(scrollY, [180, 470], [1, 0]);
	// the standing install line steps aside for the footer, which says it again
	const ctaOpacity = useTransform(scrollY, [520, 900, 4180, 4420], [0, 1, 1, 0]);

	return (
		<div
			ref={scrollRef}
			className="h-full w-full overflow-y-auto overflow-x-hidden bg-bg font-sans text-text antialiased [font-synthesis:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
		>
			<div className="relative" style={{ height: TRACK_H, width: VIEW_W }}>
				{/* the chrome that never scrolls: the rail spine and the standing install line */}
				<div className="pointer-events-none sticky top-0 z-40" style={{ height: VIEW_H }}>
					<Spine scrollY={scrollY} stage={stage} />

					<div className="absolute flex items-center gap-2.5" style={{ left: COPY_X, top: 38 }}>
						<SpoolMark className="h-5 w-5 text-thread" title="spool" />
						<span className="font-semibold text-[15px] tracking-tight">spool</span>
					</div>
					<div
						className="absolute flex items-center gap-6 font-mono text-muted text-xs"
						style={{ right: 112, top: 42 }}
					>
						<span>spool.page</span>
						<span className="text-text">github.com/liamvinberg/spool</span>
					</div>

					<motion.div
						className="pointer-events-auto absolute flex items-center gap-4"
						style={{ left: COPY_X, top: 810, opacity: ctaOpacity }}
					>
						<span className="h-[26px] w-px bg-thread/70" />
						<CommandLine prompt="~ $" command="npm i -g spool.page" size={14} />
					</motion.div>
				</div>

				{/* the hero, awake before anyone scrolls */}
				<motion.div className="absolute top-0 left-0" style={{ width: VIEW_W, opacity: heroOpacity }}>
				<div className="absolute" style={{ left: COPY_X, top: 250, width: COPY_W }}>
					<h1 className="font-semibold text-[62px] leading-[0.98] tracking-[-0.025em]">
						Your prototype
						<br />
						is already
						<br />
						running
					</h1>
					<p className="mt-7 max-w-[430px] text-[17px] text-muted leading-[27px]">
						spool is a prototyping canvas for real code. Your agent writes TSX frames into design/ in your
						repo, you arrange them on a canvas, and you click through the flow the way a user will.
					</p>
					<div className="mt-8 flex gap-5">
						<span className="w-px shrink-0 self-stretch bg-thread/70" />
						<div>
							<CommandLine prompt="~ $" command="npm i -g spool.page" />
							<CommandLine prompt="~/your-app $" command="spool init" />
						</div>
					</div>
					<p className="mt-5 pl-[21px] font-mono text-muted text-xs">
						Node 22+ · best in Chrome · macOS and Linux
					</p>
				</div>

				<div className="absolute" style={{ left: 700, top: 236, width: 620, height: 460 }}>
					<HeroCanvas reduce={reduce} />
				</div>

				<motion.div
					className="absolute flex items-center gap-2.5 font-mono text-muted text-sm"
					style={{ left: COPY_X, top: 806, opacity: hintOpacity }}
				>
					<motion.span
						className="text-thread"
						animate={reduce ? undefined : { y: [0, 4, 0] }}
						transition={{ duration: 1.9, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
					>
						<DownGlyph className="h-3.5 w-3.5" />
					</motion.span>
					<span>Keep going. Each one boots as it arrives.</span>
				</motion.div>
				</motion.div>

				{/* the six sections, each one asleep until its line */}
				{BEATS.map((beat, i) => (
					<Section
						key={beat.id}
						beat={beat}
						top={FIRST_TOP + i * PITCH}
						awake={stage > i}
						reduce={reduce}
						scrollY={scrollY}
					/>
				))}

				{/* the license, which is the last thing worth saying */}
				<div className="absolute" style={{ left: COPY_X, top: MIT_TOP + 40, width: 1000 }}>
					<motion.h2
						className="font-semibold text-[46px] leading-[1.05] tracking-[-0.025em]"
						initial={false}
						animate={{ opacity: stage > BEATS.length ? 1 : 0.25, y: stage > BEATS.length ? 0 : 16 }}
						transition={{ duration: reduce ? 0 : 0.5, ease: EASE }}
					>
						MIT, and I mean the whole of it
					</motion.h2>
					<div className="mt-8 flex flex-wrap gap-x-4 gap-y-3">
						{["Fork it,", "rework it,", "rename it,", "ship it."].map((word, i) => (
							<motion.span
								key={word}
								className="font-mono text-[26px] text-thread leading-none"
								initial={false}
								animate={{
									opacity: stage > BEATS.length ? 1 : 0,
									y: stage > BEATS.length ? 0 : 14,
								}}
								transition={{
									duration: reduce ? 0 : 0.42,
									ease: EASE,
									delay: reduce || stage <= BEATS.length ? 0 : 0.15 + i * 0.08,
								}}
							>
								{word}
							</motion.span>
						))}
					</div>
					<motion.p
						className="mt-9 max-w-[520px] text-[16px] text-muted leading-[26px]"
						initial={false}
						animate={{ opacity: stage > BEATS.length ? 1 : 0 }}
						transition={{ duration: reduce ? 0 : 0.4, delay: reduce ? 0 : 0.4 }}
					>
						It is a tool for designing things. Make it your own if you want to, and tell me what you changed.
					</motion.p>
				</div>

				<div
					className="absolute flex items-center justify-between border-border border-t pt-7"
					style={{ left: COPY_X, top: TRACK_H - 150, width: VIEW_W - COPY_X - 112 }}
				>
					<div className="flex items-center gap-2.5">
						<SpoolMark className="h-4 w-4 text-thread" />
						<span className="text-muted text-sm">spool.page</span>
					</div>
					<span className="font-mono text-muted text-xs">github.com/liamvinberg/spool</span>
				</div>
			</div>
		</div>
	);
}
