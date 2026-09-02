import { motion, useReducedMotion } from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "shared/lib/utils";
import { SpoolMark } from "shared/ui/spool/mark";

/**
 * site-terminal--doors. The spool.page landing argued from the way in.
 *
 * The take: there are two doors and they are drawn as one object. The Mac app
 * is a file you drag; npm is a line you paste. Neither is the fallback for the
 * other, so they share one module, one hairline and one baseline, and their two
 * paths bend down into a single node carrying the canvas URL. The whole claim of
 * the page is in that node: whichever door you pick, the same thing opens.
 *
 * The terminal appears once and small: one line, the width of the command, with
 * the prompt naming the working directory. It is a detail of a designed page
 * rather than the page's costume.
 *
 * Everything below the fold is the first minute after the door: the empty
 * project, "+" pointed at a folder you already have, the tabs that stack up,
 * spool's own design folder as the proof, and the licence.
 */

/* ---------- craft primitives ---------- */

const EASE = [0.22, 1, 0.36, 1] as const;

/** section reveal: fade and a short rise, driven by the page's own scroller. */
function useReveal<T extends HTMLElement>(rootRef: React.RefObject<HTMLDivElement | null>) {
	const ref = useRef<T | null>(null);
	const [shown, setShown] = useState(false);
	useEffect(() => {
		const el = ref.current;
		const root = rootRef.current;
		if (el === null || root === null) return;
		const io = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) if (entry.isIntersecting) setShown(true);
			},
			{ root, rootMargin: "0px 0px -12% 0px", threshold: 0.12 },
		);
		io.observe(el);
		return () => {
			io.disconnect();
		};
	}, [rootRef]);
	return { ref, shown };
}

function Reveal({
	rootRef,
	delay = 0,
	className,
	children,
}: {
	rootRef: React.RefObject<HTMLDivElement | null>;
	delay?: number;
	className?: string;
	children: ReactNode;
}) {
	const { ref, shown } = useReveal<HTMLDivElement>(rootRef);
	const reduce = useReducedMotion() === true;
	return (
		<motion.div
			ref={ref}
			className={className}
			initial={false}
			animate={{ opacity: shown ? 1 : 0, y: shown || reduce ? 0 : 18 }}
			transition={{ duration: reduce ? 0.2 : 0.62, ease: EASE, delay: shown ? delay : 0 }}
		>
			{children}
		</motion.div>
	);
}

async function copyText(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		return false;
	}
}

function Tick({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 12 12" fill="none" aria-hidden="true" className={className}>
			<path
				d="M2.5 6.4 4.9 8.7 9.5 3.4"
				stroke="currentColor"
				strokeWidth="1.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function CopyGlyph({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 12 12" fill="none" aria-hidden="true" className={className}>
			<rect x="4.4" y="4.4" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.1" />
			<path
				d="M2.7 7.6h-.45a.8.8 0 0 1-.8-.8V2.3a.8.8 0 0 1 .8-.8h4.5a.8.8 0 0 1 .8.8v.5"
				stroke="currentColor"
				strokeWidth="1.1"
				strokeLinecap="round"
			/>
		</svg>
	);
}

function ArrowUpRight({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 12 12" fill="none" aria-hidden="true" className={className}>
			<path
				d="M3.6 8.4 8.4 3.6M4.7 3.6h3.7v3.7"
				stroke="currentColor"
				strokeWidth="1.2"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function DownloadGlyph({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 14 14" fill="none" aria-hidden="true" className={className}>
			<path
				d="M7 1.8v7.4M3.9 6.3 7 9.4l3.1-3.1M2.4 11.9h9.2"
				stroke="currentColor"
				strokeWidth="1.3"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

const dotGrid = {
	backgroundImage:
		"radial-gradient(circle, color-mix(in srgb, var(--color-text) 8%, transparent) 1px, transparent 1px)",
	backgroundSize: "22px 22px",
	backgroundPosition: "-1px -1px",
} as const;

/* ---------- the small terminal element ---------- */

/**
 * One line, sized to the command. The prompt names the working directory, the
 * command is the machine's own lowercase, and the copy affordance lives inside
 * the same line box so nothing reflows between rest, hover and copied.
 */
function InstallLine({ prompt, command }: { prompt: string; command: string }) {
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
					timer.current = window.setTimeout(() => setCopied(false), 1600);
				});
			}}
			className={cn(
				"group/line flex h-[46px] w-full cursor-pointer items-center gap-3 rounded-md border bg-canvas px-4 text-left transition-colors duration-200 focus-visible:outline-none",
				copied ? "border-thread/45" : "border-border hover:border-border-raised",
			)}
		>
			<span className="select-none font-mono text-[13px] text-muted leading-none">{prompt}</span>
			<span className="min-w-0 flex-1 truncate font-mono text-[14px] text-text leading-none">{command}</span>
			<span className="relative block h-3.5 w-3.5 shrink-0">
				<CopyGlyph
					className={cn(
						"absolute inset-0 h-3.5 w-3.5 transition-opacity duration-200",
						copied ? "opacity-0" : "text-muted/70 opacity-100 group-hover/line:text-text",
					)}
				/>
				<Tick
					className={cn(
						"absolute inset-0 h-3.5 w-3.5 text-thread transition-opacity duration-200",
						copied ? "opacity-100" : "opacity-0",
					)}
				/>
			</span>
		</button>
	);
}

/* ---------- door one: the file you drag ---------- */

function AppIcon({ className }: { className?: string }) {
	return (
		<span
			className={cn(
				"relative flex items-center justify-center rounded-[22px] border border-border-raised",
				className,
			)}
			style={{ background: "linear-gradient(160deg, #232323 0%, #151515 78%)" }}
		>
			<SpoolMark className="h-[46%] w-[36%] text-thread" />
		</span>
	);
}

function ApplicationsIcon({ className }: { className?: string }) {
	return (
		<span
			className={cn(
				"relative flex items-center justify-center rounded-[22px] border border-border border-dashed",
				className,
			)}
		>
			<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-6 w-6 text-muted/60">
				<path
					d="M2.6 6.6h6.2l2 2.4h10.6v11H2.6z"
					stroke="currentColor"
					strokeWidth="1.3"
					strokeLinejoin="round"
				/>
			</svg>
		</span>
	);
}

/**
 * The drag drawn as one gesture: the icon leaves its rest, arcs, and settles
 * into Applications. It runs on hover of the whole door, so the door is the
 * hit target and the picture is the answer to "and then what".
 */
function DragPicture({ active }: { active: boolean }) {
	const reduce = useReducedMotion() === true;
	const play = active && !reduce;
	return (
		<div className="relative h-[104px] w-[408px]">
			<svg
				viewBox="0 0 408 104"
				fill="none"
				aria-hidden="true"
				className="absolute inset-0 h-full w-full overflow-visible"
			>
				<path
					d="M92 46 C 160 2, 236 2, 300 46"
					stroke="color-mix(in srgb, var(--color-text) 18%, transparent)"
					strokeWidth="1"
					strokeDasharray="3 5"
					strokeLinecap="round"
				/>
			</svg>
			<div className="absolute top-[22px] left-[300px]">
				<ApplicationsIcon className="h-[76px] w-[76px]" />
				<span className="mt-2.5 block text-center font-mono text-[10px] text-muted/60 leading-none">
					applications
				</span>
			</div>
			<motion.div
				className="absolute top-[22px] left-[16px]"
				initial={false}
				animate={
					play
						? {
								x: [0, 142, 284, 284],
								y: [0, -34, 0, 0],
								scale: [1, 1.05, 0.94, 0.94],
								opacity: [1, 1, 1, 0.28],
							}
						: { x: 0, y: 0, scale: 1, opacity: 1 }
				}
				transition={
					play
						? {
								duration: 1.6,
								times: [0, 0.45, 0.8, 1],
								ease: EASE,
								repeat: Number.POSITIVE_INFINITY,
								repeatDelay: 0.55,
							}
						: { duration: 0.34, ease: EASE }
				}
			>
				<AppIcon className="h-[76px] w-[76px]" />
				<span className="mt-2.5 block text-center font-mono text-[10px] text-muted/60 leading-none">
					spool.dmg
				</span>
			</motion.div>
		</div>
	);
}

function Door({
	title,
	body,
	meta,
	children,
	onHover,
	className,
}: {
	title: string;
	body: string;
	meta: string;
	children: ReactNode;
	onHover?: (hovering: boolean) => void;
	className?: string;
}) {
	return (
		<div
			className={cn("flex flex-col px-11 pt-9 pb-9", className)}
			onMouseEnter={() => onHover?.(true)}
			onMouseLeave={() => onHover?.(false)}
		>
			<h2 className="font-medium text-[21px] text-text leading-none tracking-[-0.015em]">{title}</h2>
			<p className="mt-3.5 max-w-[400px] text-[14px] text-muted leading-[22px]">{body}</p>
			<div className="pt-8">{children}</div>
			<div className="mt-auto pt-8 font-mono text-[11px] text-muted/70 leading-none">{meta}</div>
		</div>
	);
}

/**
 * Both doors bend into one node. The node is the argument: the DMG and the npm
 * line hand you the identical address, on your own machine, in the same minute.
 */
function Converge() {
	const reduce = useReducedMotion() === true;
	return (
		<div className="relative h-[98px] w-full">
			<svg
				viewBox="0 0 1200 98"
				fill="none"
				aria-hidden="true"
				preserveAspectRatio="none"
				className="absolute inset-0 h-full w-full"
			>
				<path
					d="M300 0 C 300 48, 600 40, 600 88"
					stroke="color-mix(in srgb, var(--color-thread) 42%, transparent)"
					strokeWidth="1.2"
					vectorEffect="non-scaling-stroke"
				/>
				<path
					d="M900 0 C 900 48, 600 40, 600 88"
					stroke="color-mix(in srgb, var(--color-thread) 42%, transparent)"
					strokeWidth="1.2"
					vectorEffect="non-scaling-stroke"
				/>
			</svg>
			<span className="-translate-x-1/2 absolute top-[83px] left-1/2 block h-[9px] w-[9px]">
				<motion.span
					className="-inset-[6px] absolute rounded-full border border-thread/30"
					initial={false}
					animate={reduce ? undefined : { opacity: [0.35, 0.9, 0.35] }}
					transition={{ duration: 3.2, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
				/>
				<span className="absolute inset-0 rounded-full bg-thread" />
			</span>
		</div>
	);
}

/* ---------- the drawn product ---------- */

interface RailRow {
	name: string;
	count?: number;
	active?: boolean;
}

function PlusGlyph({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 12 12" fill="none" aria-hidden="true" className={className}>
			<path d="M6 2.2v7.6M2.2 6h7.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
		</svg>
	);
}

function SpoolWindow({ rows, plusLit }: { rows: readonly RailRow[]; plusLit: boolean }) {
	const reduce = useReducedMotion() === true;
	return (
		<div className="overflow-hidden rounded-lg border border-border-raised bg-bg">
			{/* the project bar: one tab per folder you opened, and the "+" */}
			<div className="flex h-[38px] items-stretch border-border border-b bg-canvas pr-2 pl-3">
				{["tvarso", "kaffe", "spool"].map((p, i) => (
					<div
						key={p}
						className={cn(
							"flex items-center gap-2 px-3.5 font-mono text-[11px] leading-none",
							i === 0 ? "text-text" : "text-muted/70",
						)}
					>
						<span
							className={cn(
								"block h-[5px] w-[5px] rounded-full",
								i === 0 ? "bg-thread" : "bg-border-raised",
							)}
						/>
						{p}
					</div>
				))}
				<div className="relative ml-1 flex items-center">
					<span
						className={cn(
							"flex h-[22px] w-[22px] items-center justify-center rounded-xs transition-colors duration-200",
							plusLit ? "bg-thread text-on-thread" : "text-muted",
						)}
					>
						<PlusGlyph className="h-3 w-3" />
					</span>
					{plusLit && !reduce ? (
						<motion.span
							className="-inset-[5px] pointer-events-none absolute rounded-md border border-thread/45"
							animate={{ opacity: [0.2, 0.8, 0.2], scale: [0.96, 1.04, 0.96] }}
							transition={{ duration: 2.4, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
						/>
					) : null}
				</div>
			</div>
			<div className="flex h-[398px]">
				{/* pages rail */}
				<div className="w-[178px] shrink-0 border-border border-r bg-canvas py-2.5">
					{rows.map((r) => (
						<div
							key={r.name}
							className={cn(
								"flex h-[26px] items-center gap-2 pr-3 pl-4 font-mono text-[11px] leading-none",
								r.active === true ? "bg-raised text-text" : "text-muted",
							)}
						>
							<span className={cn("text-[7px]", r.active === true ? "text-thread" : "text-muted/60")}>
								▸
							</span>
							<span className="min-w-0 flex-1 truncate">{r.name}</span>
							{r.count === undefined ? null : (
								<span className="text-[10px] text-muted/60">{r.count}</span>
							)}
						</div>
					))}
				</div>
				{/* the field, empty on purpose */}
				<div className="relative flex-1" style={dotGrid}>
					<div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
						<SpoolMark className="h-[26px] w-[20px] text-thread/30" />
						<span className="font-mono text-[12px] text-muted/80 leading-none">no frames yet</span>
					</div>
				</div>
			</div>
		</div>
	);
}

/* ---------- the proof ---------- */

const PAGES: readonly { name: string; n: number }[] = [
	{ name: "variants", n: 45 },
	{ name: "agent", n: 27 },
	{ name: "booting", n: 20 },
	{ name: "manipulate", n: 14 },
	{ name: "site", n: 11 },
	{ name: "explorer", n: 8 },
	{ name: "dock", n: 7 },
	{ name: "app", n: 7 },
	{ name: "picker", n: 6 },
	{ name: "components", n: 6 },
	{ name: "play-tab", n: 4 },
	{ name: "play-inline", n: 3 },
	{ name: "directing", n: 1 },
];

const TOTAL = PAGES.reduce((a, p) => a + p.n, 0);
const WIDEST = PAGES[0]?.n ?? 1;

function PageLedger({ rootRef }: { rootRef: React.RefObject<HTMLDivElement | null> }) {
	const { ref, shown } = useReveal<HTMLDivElement>(rootRef);
	const reduce = useReducedMotion() === true;
	return (
		<div ref={ref} className="w-full">
			{PAGES.map((p, i) => (
				<div key={p.name} className="flex h-[34px] items-center gap-5 border-border border-b last:border-b-0">
					<span className="w-[112px] shrink-0 font-mono text-[12px] text-muted leading-none">{p.name}</span>
					<div className="relative h-[3px] flex-1">
						<motion.span
							className="absolute inset-y-0 left-0 block rounded-full bg-thread/70"
							initial={false}
							animate={{ width: shown ? `${(p.n / WIDEST) * 100}%` : "0%" }}
							transition={{
								duration: reduce ? 0.2 : 0.85,
								ease: EASE,
								delay: shown && !reduce ? 0.04 * i : 0,
							}}
						/>
					</div>
					<span className="w-[34px] shrink-0 text-right font-mono text-[12px] text-text/80 leading-none tabular-nums">
						{p.n}
					</span>
				</div>
			))}
		</div>
	);
}

/* ---------- video ---------- */

function VideoSlot() {
	const [hover, setHover] = useState(false);
	return (
		<button
			type="button"
			onMouseEnter={() => setHover(true)}
			onMouseLeave={() => setHover(false)}
			className="group/vid block w-full cursor-pointer overflow-hidden rounded-lg border border-border bg-canvas text-left transition-colors duration-300 hover:border-border-raised focus-visible:outline-none"
		>
			<div className="relative flex aspect-[16/9] items-center justify-center" style={dotGrid}>
				<span
					className={cn(
						"flex h-[62px] w-[62px] items-center justify-center rounded-full border transition-all duration-300",
						hover ? "border-thread bg-thread" : "border-border-raised bg-bg/70",
					)}
				>
					<svg
						viewBox="0 0 12 12"
						fill="currentColor"
						aria-hidden="true"
						className={cn(
							"ml-[3px] h-3.5 w-3.5 transition-colors duration-300",
							hover ? "text-on-thread" : "text-text",
						)}
					>
						<path d="M2.6 1.5 10 6 2.6 10.5Z" />
					</svg>
				</span>
				<span className="absolute bottom-5 left-6 font-mono text-[11px] text-muted leading-none">
					getting started · 4:52
				</span>
			</div>
		</button>
	);
}

/* ---------- the page ---------- */

export default function SiteTerminalDoors() {
	const rootRef = useRef<HTMLDivElement | null>(null);
	const [dmgHover, setDmgHover] = useState(false);

	return (
		<div
			ref={rootRef}
			className="h-full w-full overflow-y-auto bg-bg font-sans text-text antialiased [font-synthesis:none]"
		>
			<div className="mx-auto w-[1200px]">
				{/* header */}
				<header className="flex h-[92px] items-center justify-between">
					<div className="flex items-center gap-2.5">
						<SpoolMark className="h-[19px] w-[15px] text-thread" title="spool" />
						<span className="font-medium text-[15px] tracking-[-0.01em]">spool</span>
					</div>
					<nav className="flex items-center gap-8 text-[13px] text-muted">
						<span className="font-mono text-[12px]">v0.6.0</span>
						<span className="cursor-pointer transition-colors duration-200 hover:text-text">Docs</span>
						<span className="flex cursor-pointer items-center gap-1.5 transition-colors duration-200 hover:text-text">
							GitHub
							<ArrowUpRight className="h-3 w-3" />
						</span>
					</nav>
				</header>

				{/* the fold: the headline, the two doors, the node they share */}
				<section className="pt-[36px]">
					<div className="flex items-end justify-between gap-16">
						<h1 className="w-[600px] shrink-0 font-semibold text-[56px] leading-[1.05] tracking-[-0.032em]">
							Two ways in.
							<br />
							Both land on the
							<br />
							same canvas.
						</h1>
						<p className="mb-[9px] w-[340px] shrink-0 text-[15px] text-muted leading-[24px]">
							spool is a prototyping canvas that lives in your project folder. Your agent writes the
							screens, you arrange them and click through the flow.
						</p>
					</div>

					<div className="mt-[52px] grid grid-cols-2 rounded-lg border border-border bg-canvas/40">
						<Door
							title="The Mac app"
							body="One file. Drag it to Applications and open it. It carries its own Node, so this is the whole setup."
							meta="spool.dmg · 84 mb · apple silicon"
							onHover={setDmgHover}
							className="border-border border-r"
						>
							<DragPicture active={dmgHover} />
							<button
								type="button"
								className="mt-7 flex h-[44px] w-fit cursor-pointer items-center gap-2.5 rounded-md bg-thread px-5 font-medium text-[14px] text-on-thread leading-none transition-opacity duration-200 hover:opacity-90 focus-visible:outline-none"
							>
								<DownloadGlyph className="h-3.5 w-3.5" />
								Download Spool.dmg
							</button>
						</Door>

						<Door
							title="From npm"
							body="One global install, then run spool inside any folder on your machine. Same daemon, same canvas."
							meta="node 22+ · macos, linux, wsl"
						>
							<div className="w-[428px]">
								<InstallLine prompt="~ $" command="npm i -g spool.page" />
								<div className="mt-3">
									<InstallLine prompt="~/tvarso $" command="spool" />
								</div>
								<p className="mt-5 text-[13px] text-muted leading-[21px]">
									spool prints the address and opens it for you.
								</p>
							</div>
						</Door>
					</div>

					<Converge />
					<div className="mt-[2px] flex flex-col items-center gap-2.5 pb-[64px]">
						<span className="font-mono text-[13px] text-text leading-none">
							canvas: http://localhost:7766/p/tvarso
						</span>
						<span className="text-[13px] text-muted leading-none">
							That address is yours. Nothing leaves the machine it runs on.
						</span>
					</div>
				</section>

				{/* first run */}
				<section className="grid grid-cols-[380px_1fr] gap-[72px] border-border border-t pt-[86px] pb-[96px]">
					<Reveal rootRef={rootRef}>
						<h2 className="font-semibold text-[38px] leading-[1.08] tracking-[-0.026em]">
							First run is empty.
						</h2>
						<p className="mt-5 text-[15px] text-muted leading-[25px]">
							spool holds nothing until you hand it a folder. Press <span className="text-text">+</span>{" "}
							and pick one. A repo you already have is the best place to start, and a{" "}
							<span className="font-mono text-[14px] text-text">design/</span> folder appears beside your
							source.
						</p>
						<p className="mt-5 text-[15px] text-muted leading-[25px]">
							Open as many as you like. Every folder keeps its own tab, and they all run off the one
							daemon.
						</p>
						<div className="mt-8 flex gap-4">
							<span className="w-px shrink-0 self-stretch bg-thread/60" />
							<p className="font-mono text-[12px] text-muted leading-[22px]">
								design/frames/&lt;page&gt;/&lt;name&gt;/frame.tsx
								<br />
								one folder, one component, one frame
							</p>
						</div>
					</Reveal>
					<Reveal rootRef={rootRef} delay={0.08}>
						<SpoolWindow
							plusLit
							rows={[
								{ name: "checkout", active: true },
								{ name: "onboarding" },
								{ name: "settings" },
							]}
						/>
					</Reveal>
				</section>

				{/* the proof */}
				<section className="grid grid-cols-[380px_1fr] gap-[72px] border-border border-t pt-[86px] pb-[96px]">
					<Reveal rootRef={rootRef}>
						<h2 className="font-semibold text-[38px] leading-[1.08] tracking-[-0.026em]">
							I made this for myself.
						</h2>
						<p className="mt-5 text-[15px] text-muted leading-[25px]">
							Then I kept using it. spool designs spool: its own canvas holds {TOTAL} frames across{" "}
							{PAGES.length} pages, and this page was drawn in one of them.
						</p>
						<p className="mt-5 text-[15px] text-muted leading-[25px]">
							Every bar below is a folder on disk you can open in an editor.
						</p>
					</Reveal>
					<Reveal rootRef={rootRef} delay={0.08}>
						<div className="flex items-baseline justify-between pb-6">
							<span className="font-semibold text-[46px] leading-none tracking-[-0.03em] tabular-nums">
								{TOTAL}
							</span>
							<span className="font-mono text-[12px] text-muted leading-none">
								design/frames · {PAGES.length} pages
							</span>
						</div>
						<PageLedger rootRef={rootRef} />
					</Reveal>
				</section>

				{/* the video */}
				<section className="border-border border-t pt-[86px] pb-[96px]">
					<Reveal rootRef={rootRef}>
						<div className="flex items-end justify-between pb-8">
							<h2 className="font-semibold text-[38px] leading-[1.08] tracking-[-0.026em]">
								Watch someone do it once.
							</h2>
							<p className="mb-2 w-[320px] text-[14px] text-muted leading-[23px]">
								Install, open a folder, and walk a three screen flow. Recorded in one take.
							</p>
						</div>
						<VideoSlot />
					</Reveal>
				</section>

				{/* licence and footer */}
				<section className="border-border border-t pt-[86px] pb-[64px]">
					<Reveal rootRef={rootRef}>
						<div className="flex items-end justify-between gap-16">
							<h2 className="max-w-[720px] font-semibold text-[44px] leading-[1.06] tracking-[-0.028em]">
								MIT. Fork it, rework it, rename it, ship it.
							</h2>
							<p className="mb-2 w-[300px] shrink-0 text-[14px] text-muted leading-[23px]">
								It is a tool for designing things. Make it your own if you want to.
							</p>
						</div>
					</Reveal>
				</section>

				<footer className="flex items-center justify-between border-border border-t py-8">
					<div className="flex items-center gap-2.5">
						<SpoolMark className="h-4 w-[13px] text-thread" />
						<span className="text-[13px] text-muted">spool.page</span>
					</div>
					<div className="flex items-center gap-7 font-mono text-[11px] text-muted/70">
						<span>github.com/liamvinberg/spool</span>
						<span>node 22+</span>
						<span>best in Chrome</span>
					</div>
				</footer>
			</div>
		</div>
	);
}
