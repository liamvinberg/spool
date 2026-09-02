import { motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "shared/lib/utils";
import { SpoolMark } from "shared/ui/spool-mark";

/**
 * site-letter--log. The landing as the build log I kept while making it.
 *
 * The argument: the honest order of a personal tool is chronological. Nobody
 * decides to build a canvas; they lose an afternoon, fix it, lose another one,
 * fix that. So the page is seven dated entries, and the instructions fall out of
 * the story at the point where they actually happened. Install is the entry
 * where it went on npm. The empty first run is the entry where it stopped being
 * a bug. The license is today.
 *
 * The left column is the index: the thread with a node per entry, the entry you
 * are reading lit. It tracks the real scroll position rather than a hover, so
 * the page always says where you are in the six months.
 *
 * Every entry carries one drawn thing at its right. Read only the left column
 * and you have the story; read only the right and you have the manual.
 */

const EASE = [0.22, 1, 0.36, 1] as const;

/* ---------- copy to clipboard, the house behavior ---------- */

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

function CommandLine({ command, prompt = "~ $" }: { command: string; prompt?: string }) {
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
			onClick={() => {
				void handleCopy();
			}}
			aria-label={copied ? `Copied ${command}` : `Copy ${command}`}
			className="group/cmd block w-full cursor-pointer text-left font-mono text-[14px] leading-[26px] focus-visible:outline-none"
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
			<span className="text-text">{command}</span>
		</button>
	);
}

/* ---------- marks ---------- */

function Mono({ children }: { children: string }) {
	return <span className="rounded-xs bg-raised/70 px-1 py-px font-mono text-[14px] text-text">{children}</span>;
}

function DownArrow({ className }: { className?: string }) {
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

function PlayTri({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 10 10" fill="currentColor" aria-hidden="true" className={className}>
			<path d="M2.6 1.5 8.4 5 2.6 8.5Z" />
		</svg>
	);
}

function PlusGlyph({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 12 12" fill="none" aria-hidden="true" className={className}>
			<path d="M6 2.25v7.5M2.25 6h7.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
		</svg>
	);
}

/* ---------- the drawn things beside the entries ---------- */

/** march: six screens at once, which was the whole first idea. */
function GridMark() {
	return (
		<div
			className="grid w-[360px] grid-cols-3 gap-2 rounded-md border border-border bg-canvas p-3"
			style={{
				backgroundImage:
					"radial-gradient(circle, color-mix(in srgb, var(--color-text) 7%, transparent) 1px, transparent 1px)",
				backgroundSize: "12px 12px",
			}}
		>
			{[0, 1, 2, 3, 4, 5].map((i) => (
				<div
					key={i}
					className="overflow-hidden rounded-[3px] border border-border-raised/70 bg-surface"
					style={{ height: 64 }}
				>
					<div className="space-y-[5px] p-2">
						<div className="h-[6px] rounded-[1px] bg-raised" style={{ width: `${52 + i * 6}%` }} />
						<div className="h-[3px] w-[82%] rounded-full bg-border-raised" />
						<div className="h-[3px] w-[56%] rounded-full bg-border-raised" />
						<div
							className={cn(
								"mt-[8px] h-[8px] w-[40%] rounded-[2px]",
								i === 2 ? "bg-thread/75" : "bg-border-raised",
							)}
						/>
					</div>
				</div>
			))}
		</div>
	);
}

/** may: the first run, and the one thing on it that does anything. */
function EmptyMark() {
	const reduce = useReducedMotion() === true;
	return (
		<div className="w-[360px] overflow-hidden rounded-md border border-border bg-canvas">
			<div className="flex h-[28px] items-center gap-2 border-border border-b px-3">
				<SpoolMark className="h-3 w-[10px] text-thread" />
				<span className="font-mono text-2xs text-muted leading-none">no project open</span>
				<span className="relative ml-auto flex h-[18px] w-[18px] items-center justify-center rounded-xs border border-thread/60 text-thread">
					{reduce ? null : (
						<motion.span
							className="absolute inset-0 rounded-xs border border-thread"
							animate={{ opacity: [0.7, 0], scale: [1, 1.7] }}
							transition={{ duration: 2.2, repeat: Number.POSITIVE_INFINITY, ease: "easeOut" }}
						/>
					)}
					<PlusGlyph className="h-2.5 w-2.5" />
				</span>
			</div>
			<div className="flex h-[128px]">
				<div className="w-[88px] shrink-0 border-border border-r" />
				<div
					className="flex flex-1 items-center justify-center"
					style={{
						backgroundImage:
							"radial-gradient(circle, color-mix(in srgb, var(--color-text) 7%, transparent) 1px, transparent 1px)",
						backgroundSize: "12px 12px",
					}}
				>
					<span className="font-mono text-2xs text-muted/80">no frames yet</span>
				</div>
			</div>
		</div>
	);
}

/** june: a project is a folder, so several is the normal case. */
const PROJECTS: readonly { name: string; live?: boolean }[] = [
	{ name: "spool", live: true },
	{ name: "tvarso" },
	{ name: "kaffe" },
	{ name: "eidra-intranet" },
	{ name: "havsband" },
	{ name: "notaskar" },
];

function ProjectsMark() {
	return (
		<div className="w-[360px]">
			<div className="flex flex-wrap gap-1.5">
				{PROJECTS.map((p) => (
					<span
						key={p.name}
						className={cn(
							"inline-flex items-center gap-2 rounded-xs border px-2.5 py-1.5 font-mono text-2xs leading-none",
							p.live === true
								? "border-thread/55 bg-thread/10 text-thread"
								: "border-border bg-canvas text-muted",
						)}
					>
						<span
							className={cn(
								"block h-[5px] w-[5px] rounded-full",
								p.live === true ? "bg-thread" : "bg-border-raised",
							)}
						/>
						{p.name}
					</span>
				))}
			</div>
			<p className="mt-3 font-mono text-2xs text-muted leading-4">
				~/projects, one canvas each, all of it in git
			</p>
		</div>
	);
}

/** august: the dogfood, as bars, because the point is the shape of the spend. */
const PAGES: readonly { name: string; n: number }[] = [
	{ name: "variants", n: 45 },
	{ name: "agent", n: 27 },
	{ name: "booting", n: 20 },
	{ name: "manipulate", n: 14 },
	{ name: "site", n: 10 },
	{ name: "app", n: 7 },
	{ name: "picker", n: 6 },
	{ name: "components", n: 4 },
	{ name: "play-tab", n: 4 },
	{ name: "play-inline", n: 3 },
	{ name: "directing", n: 1 },
	{ name: "explorer", n: 1 },
];

const TOTAL = PAGES.reduce((sum, p) => sum + p.n, 0);
const WIDEST = 45;

function DogfoodMark() {
	const reduce = useReducedMotion() === true;
	return (
		<div className="w-[360px]">
			{PAGES.map((p, i) => {
				const here = p.name === "site";
				return (
					<div key={p.name} className="flex items-center gap-3 py-[3px]">
						<span
							className={cn(
								"w-[84px] shrink-0 text-right font-mono text-2xs leading-none",
								here ? "text-thread" : "text-muted",
							)}
						>
							{p.name}
						</span>
						<motion.span
							className={cn("block h-[7px] rounded-[1px]", here ? "bg-thread" : "bg-border-raised")}
							initial={reduce ? false : { width: 0 }}
							whileInView={{ width: (p.n / WIDEST) * 224 }}
							viewport={{ once: true, amount: 0.5 }}
							transition={{ duration: 0.55, ease: EASE, delay: reduce ? 0 : i * 0.04 }}
							style={reduce ? { width: (p.n / WIDEST) * 224 } : undefined}
						/>
						<span
							className={cn(
								"font-mono text-2xs leading-none",
								here ? "text-thread" : "text-muted/70",
							)}
						>
							{p.n}
						</span>
					</div>
				);
			})}
			<p className="mt-3 font-mono text-2xs text-muted leading-4">
				{TOTAL} frames, twelve pages, one of them this page
			</p>
		</div>
	);
}

function VideoMark() {
	const reduce = useReducedMotion() === true;
	return (
		<div className="group/vid w-[360px] cursor-pointer">
			<div
				className="relative h-[203px] overflow-hidden rounded-md border border-border bg-canvas"
				style={{
					backgroundImage:
						"radial-gradient(circle, color-mix(in srgb, var(--color-text) 8%, transparent) 1px, transparent 1px)",
					backgroundSize: "14px 14px",
				}}
			>
				{[
					{ x: 30, y: 32, w: 100, h: 64 },
					{ x: 172, y: 32, w: 100, h: 64 },
					{ x: 101, y: 118, w: 100, h: 64 },
				].map((r) => (
					<div
						key={`${r.x}-${r.y}`}
						className="absolute overflow-hidden rounded-[3px] border border-border-raised/80 bg-surface"
						style={{ left: r.x, top: r.y, width: r.w, height: r.h }}
					>
						<div className="space-y-[5px] p-2">
							<div className="h-[6px] w-[62%] rounded-[1px] bg-raised" />
							<div className="h-[3px] w-[84%] rounded-full bg-border-raised" />
							<div className="h-[3px] w-[52%] rounded-full bg-border-raised" />
							<div className="mt-[7px] h-[9px] w-[44%] rounded-[2px] bg-thread/70" />
						</div>
					</div>
				))}
				<svg
					className="pointer-events-none absolute inset-0"
					width="100%"
					height="203"
					viewBox="0 0 360 203"
					fill="none"
					aria-hidden="true"
				>
					<path d="M130 64 C 151 64, 151 64, 172 64" stroke="var(--color-thread)" strokeWidth="1.4" />
					<path d="M222 96 C 222 118, 205 118, 201 118" stroke="var(--color-thread)" strokeWidth="1.4" />
				</svg>
				<div className="absolute inset-0 flex items-center justify-center">
					<motion.span
						className="flex h-12 w-12 items-center justify-center rounded-full border border-thread/70 bg-bg/80 text-thread"
						animate={reduce ? undefined : { scale: [1, 1.05, 1] }}
						transition={{ duration: 3.4, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
					>
						<PlayTri className="ml-[2px] h-3.5 w-3.5" />
					</motion.span>
				</div>
			</div>
			<div className="mt-3 flex items-baseline justify-between font-mono text-muted text-xs">
				<span className="transition-colors duration-150 group-hover/vid:text-text">
					Empty folder to a walkable flow
				</span>
				<span>2:48</span>
			</div>
		</div>
	);
}

function DmgMark() {
	return (
		<a
			href="https://spool.page"
			className="group/dmg flex w-[360px] items-center gap-3 rounded-md border border-border bg-canvas px-4 py-3.5 transition-colors duration-150 hover:border-border-raised"
		>
			<SpoolMark className="h-6 w-5 shrink-0 text-thread" />
			<div className="min-w-0 flex-1">
				<div className="font-mono text-[13px] text-text leading-none">Spool.dmg</div>
				<div className="mt-1.5 font-mono text-2xs text-muted leading-none">4.1 MB · Apple silicon</div>
			</div>
			<span className="text-muted transition-colors duration-150 group-hover/dmg:text-thread">
				<DownArrow className="h-4 w-4" />
			</span>
		</a>
	);
}

function LicenseMark() {
	return (
		<div className="w-[360px] rounded-md border border-border bg-canvas px-5 py-5">
			<div className="font-mono text-2xs text-muted leading-none">LICENSE.md</div>
			<p className="mt-3 text-[15px] text-text leading-[26px]">
				Fork it, rework it, rename it, ship it. It is a tool for designing things; make it your own if you
				want to.
			</p>
			<div className="mt-4 flex items-baseline gap-3 border-border border-t pt-3 font-mono text-2xs text-muted">
				<span className="text-thread">MIT</span>
				<span>github.com/liamvinberg/spool</span>
			</div>
		</div>
	);
}

/* ---------- the entries ---------- */

interface LogEntry {
	id: string;
	date: string;
	lead: string;
	body: React.ReactNode;
	side?: React.ReactNode;
}

const ENTRIES: readonly LogEntry[] = [
	{
		id: "march",
		date: "march",
		lead: "The first version was six iframes in a grid.",
		body: (
			<>
				I wanted to see six screens at once, running, with no design file standing between me and them.
				That was the whole idea and it has not changed since. Everything after this is the idea surviving
				contact with a real repository.
			</>
		),
		side: <GridMark />,
	},
	{
		id: "april",
		date: "april",
		lead: "It went on npm, so I could install it on the other machine.",
		body: (
			<>
				Which is the only reason it is public. Node 22 and up, and Chrome for the canvas. macOS and Linux
				both work; on Windows, run it under WSL. The frames live in <Mono>design/</Mono> inside your repo
				and go into git with everything else.
			</>
		),
		side: (
			<div className="w-[360px]">
				<CommandLine prompt="~ $" command="npm i -g spool.page" />
				<CommandLine prompt="~/your-app $" command="spool init" />
				<CommandLine prompt="~/your-app $" command="spool serve" />
				<p className="mt-3 font-mono text-2xs text-muted leading-4">
					localhost:7766 · your machine only
				</p>
			</div>
		),
	},
	{
		id: "may",
		date: "may",
		lead: "The empty first run stopped being a bug.",
		body: (
			<>
				For weeks I felt bad that a fresh install shows you an empty canvas. Then I watched someone open it
				and the <Mono>+</Mono> in the corner did the entire job. Press it, pick a folder with code in it,
				and that folder is a project from then on.
			</>
		),
		side: <EmptyMark />,
	},
	{
		id: "june",
		date: "june",
		lead: "Six projects open at once.",
		body: (
			<>
				A project is a folder, so there is no number worth naming as a limit. Each canvas sits beside the
				code it describes, which is how it stays true: when the code moves, the frames are in the same
				commit.
			</>
		),
		side: <ProjectsMark />,
	},
	{
		id: "july",
		date: "july",
		lead: "I put it in a window.",
		body: (
			<>
				Some days I want a dock icon and no terminal in the loop. The Mac app is an Electron window on the
				same local daemon, and it bundles the published package, so the app and the command stay on one
				version.
			</>
		),
		side: <DmgMark />,
	},
	{
		id: "august",
		date: "august",
		lead: "142 frames of my own medicine.",
		body: (
			<>
				spool's own design folder crossed {TOTAL} frames this month, across twelve pages. Every screen that
				shipped was drawn there before it was built, and I threw away twenty five landing pages before this
				one. It is the only claim on this page that comes with receipts.
			</>
		),
		side: <DogfoodMark />,
	},
	{
		id: "today",
		date: "today",
		lead: "It is as much yours as mine.",
		body: (
			<>
				MIT, in the strong sense. If the pages rail annoys you it is one file, <Mono>sidebar.tsx</Mono>, and
				you should change it. I would rather read your fork than your feature request, though the issues
				are open too and I answer them. If you get somewhere with it I have not, I would like to see.
			</>
		),
		side: <LicenseMark />,
	},
];

/* ---------- the index: the thread, one node per entry ---------- */

function Index({ active }: { active: number }) {
	return (
		<nav className="sticky top-[120px] w-[152px] shrink-0">
			<div className="relative">
				<span
					className="absolute top-[7px] bottom-[7px] left-[3px] w-px"
					style={{
						background:
							"linear-gradient(to bottom, color-mix(in srgb, var(--color-thread) 45%, transparent), color-mix(in srgb, var(--color-thread) 10%, transparent))",
					}}
				/>
				{ENTRIES.map((e, i) => {
					const on = i === active;
					return (
						<div key={e.id} className="relative flex h-[30px] items-center pl-[22px]">
							<motion.span
								className="absolute left-0 block rounded-full"
								initial={false}
								animate={{
									width: on ? 7 : 5,
									height: on ? 7 : 5,
									left: on ? 0 : 1,
									backgroundColor: on
										? "var(--color-thread)"
										: "var(--color-border-raised)",
								}}
								transition={{ duration: 0.22, ease: EASE }}
							/>
							<motion.span
								className="font-mono text-xs leading-none"
								initial={false}
								animate={{ color: on ? "var(--color-text)" : "var(--color-muted)" }}
								transition={{ duration: 0.22, ease: EASE }}
							>
								{e.date}
							</motion.span>
						</div>
					);
				})}
			</div>
			<p className="mt-8 pl-[22px] font-mono text-2xs text-muted leading-4">
				six months
				<br />
				one person
			</p>
		</nav>
	);
}

/* ---------- the page ---------- */

export default function SiteLetterLog() {
	const [active, setActive] = useState(0);
	const nodes = useRef<(HTMLElement | null)[]>([]);

	const measure = useCallback(() => {
		const line = window.innerHeight * 0.42;
		let next = 0;
		nodes.current.forEach((el, i) => {
			if (el === null) return;
			if (el.getBoundingClientRect().top <= line) next = i;
		});
		setActive(next);
	}, []);

	useEffect(() => {
		measure();
		window.addEventListener("scroll", measure, { passive: true });
		window.addEventListener("resize", measure);
		return () => {
			window.removeEventListener("scroll", measure);
			window.removeEventListener("resize", measure);
		};
	}, [measure]);

	return (
		<div className="min-h-full w-full bg-bg font-sans text-text antialiased [font-synthesis:none]">
			<div className="mx-auto w-[1240px] pb-[140px]">
				<header className="flex items-center justify-between border-border border-b py-7">
					<div className="flex items-center gap-2.5">
						<SpoolMark className="h-5 w-4 text-thread" title="spool" />
						<span className="font-semibold text-md tracking-tight">spool</span>
					</div>
					<nav className="flex items-center gap-7 font-mono text-muted text-xs">
						<span className="text-text">spool.page</span>
						<span className="transition-colors duration-150 hover:text-text">github</span>
						<span className="transition-colors duration-150 hover:text-text">docs</span>
					</nav>
				</header>

				<div className="grid grid-cols-[560px_1fr] items-end gap-[52px] pt-[92px] pb-[72px]">
					<div>
						<h1 className="font-semibold text-[54px] leading-[1.02] tracking-[-0.026em]">
							Six months of me
							<br />
							refusing to guess.
						</h1>
						<p className="mt-8 max-w-[520px] text-[17px] text-text/82 leading-[29px]">
							spool is a canvas that runs the frames your agent writes into your repo. I built it for
							my own work in March and I have used it every day since. Below is the log I kept, and the
							instructions sit inside it at the point where they happened.
						</p>
					</div>
					<div className="justify-self-end">
						<VideoMark />
					</div>
				</div>

				<div className="flex items-start gap-[64px] border-border border-t pt-[60px]">
					<Index active={active} />

					<div className="min-w-0 flex-1">
						{ENTRIES.map((e, i) => (
							<motion.section
								key={e.id}
								ref={(el: HTMLElement | null) => {
									nodes.current[i] = el;
								}}
								className={cn(
									"grid grid-cols-[500px_1fr] gap-x-[52px] py-11",
									i > 0 && "border-border border-t",
								)}
								initial={{ opacity: 0, y: 12 }}
								whileInView={{ opacity: 1, y: 0 }}
								viewport={{ once: true, amount: 0.25 }}
								transition={{ duration: 0.45, ease: EASE }}
							>
								<div>
									<div className="font-mono text-muted text-xs">{e.date}</div>
									<h2 className="mt-4 font-medium text-[24px] leading-[32px] tracking-[-0.014em]">
										{e.lead}
									</h2>
									<p className="mt-5 text-[16px] text-text/80 leading-[28px]">{e.body}</p>
								</div>
								<div className="justify-self-end pt-1">{e.side}</div>
							</motion.section>
						))}
					</div>
				</div>

				<footer className="mt-[72px] flex items-baseline justify-between border-border border-t pt-7 font-mono text-muted text-xs">
					<span>Written in Stockholm. The log continues in the issues.</span>
					<span className="text-text">Liam Vinberg</span>
				</footer>
			</div>
		</div>
	);
}
