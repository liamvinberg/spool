import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { cn } from "shared/lib/utils";
import { SpoolMark } from "shared/ui/spool/mark";

/**
 * site-letter--colophon. The landing as the back matter of a book.
 *
 * The argument: a personal page does not have to be prose. A colophon is the
 * page where the maker says who set the type, on what, and under what terms,
 * and it is warm precisely because it refuses to sell. So this page is a record:
 * one question per row, a mono label on the left, my own answer in the middle,
 * and the evidence for that answer standing in the right margin.
 *
 * The evidence is the point. `install` carries the command, `mac app` carries
 * the DMG, `first run` carries the empty canvas drawn at postage-stamp size,
 * and `what I use it on` carries all 142 frames of spool's own design folder as
 * 142 marks, grouped by page. A claim with its receipt beside it.
 *
 * Nothing here is centered and nothing is a card. The rules do the holding.
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
			className="group/cmd block w-full cursor-pointer text-left font-mono text-[14px] leading-6 focus-visible:outline-none"
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
	return <span className="rounded-xs bg-raised/70 px-1 py-px font-mono text-[13px] text-text">{children}</span>;
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

/* ---------- the evidence drawn in the margin ---------- */

/** the thing itself, small: frames on a field with the thread running between. */
function CanvasMark() {
	const reduce = useReducedMotion() === true;
	return (
		<div className="w-[300px]">
			<div
				className="relative h-[152px] overflow-hidden rounded-md border border-border bg-canvas"
				style={{
					backgroundImage:
						"radial-gradient(circle, color-mix(in srgb, var(--color-text) 7%, transparent) 1px, transparent 1px)",
					backgroundSize: "12px 12px",
				}}
			>
				{[
					{ x: 18, y: 20, w: 84, h: 54, lit: false },
					{ x: 132, y: 20, w: 84, h: 54, lit: true },
					{ x: 75, y: 92, w: 84, h: 54, lit: false },
				].map((r) => (
					<div
						key={`${r.x}-${r.y}`}
						className={cn(
							"absolute overflow-hidden rounded-[3px] border bg-surface",
							r.lit ? "border-thread/55" : "border-border-raised/80",
						)}
						style={{ left: r.x, top: r.y, width: r.w, height: r.h }}
					>
						<div className="space-y-[5px] p-2">
							<div className="h-[6px] w-[60%] rounded-[1px] bg-raised" />
							<div className="h-[3px] w-[82%] rounded-full bg-border-raised" />
							<div className="mt-[6px] h-[8px] w-[42%] rounded-[2px] bg-thread/70" />
						</div>
					</div>
				))}
				<svg
					className="pointer-events-none absolute inset-0"
					width="100%"
					height="152"
					viewBox="0 0 300 152"
					fill="none"
					aria-hidden="true"
				>
					<path d="M102 47 C 117 47, 117 47, 128 47" stroke="var(--color-thread)" strokeWidth="1.4" />
					<path d="M132 47 L 128 44 L 128 50 Z" fill="var(--color-thread)" />
					<path d="M174 74 C 174 92, 163 92, 159 92" stroke="var(--color-thread)" strokeWidth="1.4" />
				</svg>
				{reduce ? null : (
					<motion.span
						className="absolute block h-[5px] w-[5px] rounded-full bg-thread"
						style={{ left: 100, top: 45 }}
						animate={{ x: [0, 28], opacity: [0, 1, 0] }}
						transition={{ duration: 2.1, repeat: Number.POSITIVE_INFINITY, repeatDelay: 1.2 }}
					/>
				)}
			</div>
			<p className="mt-2.5 font-mono text-2xs text-muted leading-4">design/frames, drawn</p>
		</div>
	);
}

/** the first run, at postage-stamp size: chrome, a lit "+", and nothing else. */
function EmptyRunMark() {
	const reduce = useReducedMotion() === true;
	return (
		<div className="w-[300px] overflow-hidden rounded-md border border-border bg-canvas">
			<div className="flex h-[26px] items-center gap-2 border-border border-b px-2.5">
				<SpoolMark className="h-3 w-[10px] text-thread" />
				<span className="font-mono text-2xs text-muted leading-none">no project open</span>
				<motion.span
					className="ml-auto flex h-4 w-4 items-center justify-center rounded-xs border border-thread/60 text-thread"
					animate={reduce ? undefined : { opacity: [0.55, 1, 0.55] }}
					transition={{ duration: 2.6, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
				>
					<PlusGlyph className="h-2 w-2" />
				</motion.span>
			</div>
			<div className="flex h-[112px]">
				<div className="w-[76px] shrink-0 border-border border-r" />
				<div
					className="flex-1"
					style={{
						backgroundImage:
							"radial-gradient(circle, color-mix(in srgb, var(--color-text) 7%, transparent) 1px, transparent 1px)",
						backgroundSize: "12px 12px",
					}}
				/>
			</div>
		</div>
	);
}

/** projects are folders, so the tab strip is where "several" becomes visible. */
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
		<div className="w-[300px]">
			<div className="flex flex-wrap gap-1.5">
				{PROJECTS.map((p) => (
					<span
						key={p.name}
						className={cn(
							"rounded-xs border px-2 py-1 font-mono text-2xs leading-none",
							p.live === true
								? "border-thread/55 bg-thread/10 text-thread"
								: "border-border bg-canvas text-muted",
						)}
					>
						{p.name}
					</span>
				))}
			</div>
			<p className="mt-3 font-mono text-2xs text-muted leading-4">six folders on this machine</p>
		</div>
	);
}

/**
 * The dogfood, counted. Twelve clusters, one mark per frame, 142 marks. The
 * page you are reading was drawn in the cluster called site.
 */
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

function FrameGrid() {
	const reduce = useReducedMotion() === true;
	let seen = 0;
	return (
		<div className="w-[340px]">
			<div className="flex flex-wrap gap-x-4 gap-y-4">
				{PAGES.map((page) => {
					const here = page.name === "site";
					const start = seen;
					seen += page.n;
					return (
						<div key={page.name}>
							<div
								className={cn(
									"mb-1.5 font-mono text-2xs leading-none",
									here ? "text-thread" : "text-muted",
								)}
							>
								{page.name} {page.n}
							</div>
							<div
								className="flex flex-wrap gap-[3px]"
								style={{ width: Math.min(page.n, 9) * 8 - 3 }}
							>
								{Array.from({ length: page.n }, (_, i) => (
									<motion.span
										key={`${page.name}-${String(i)}`}
										className={cn(
											"block h-[5px] w-[5px] rounded-[1px]",
											here ? "bg-thread" : "bg-border-raised",
										)}
										initial={reduce ? false : { opacity: 0, scale: 0.6 }}
										whileInView={{ opacity: 1, scale: 1 }}
										viewport={{ once: true, amount: 0.4 }}
										transition={{
											duration: 0.3,
											ease: EASE,
											delay: reduce ? 0 : (start + i) * 0.004,
										}}
									/>
								))}
							</div>
						</div>
					);
				})}
			</div>
			<p className="mt-4 font-mono text-2xs text-muted leading-4">
				{TOTAL} frames · twelve pages · this one is in site
			</p>
		</div>
	);
}

function VideoMark() {
	const reduce = useReducedMotion() === true;
	return (
		<div className="group/vid w-[300px] cursor-pointer">
			<div
				className="relative h-[169px] overflow-hidden rounded-md border border-border bg-canvas"
				style={{
					backgroundImage:
						"radial-gradient(circle, color-mix(in srgb, var(--color-text) 8%, transparent) 1px, transparent 1px)",
					backgroundSize: "13px 13px",
				}}
			>
				{[
					{ x: 24, y: 26, w: 86, h: 56 },
					{ x: 142, y: 26, w: 86, h: 56 },
					{ x: 83, y: 100, w: 86, h: 56 },
				].map((r) => (
					<div
						key={`${r.x}-${r.y}`}
						className="absolute overflow-hidden rounded-[3px] border border-border-raised/80 bg-surface"
						style={{ left: r.x, top: r.y, width: r.w, height: r.h }}
					>
						<div className="space-y-[5px] p-2">
							<div className="h-[6px] w-[62%] rounded-[1px] bg-raised" />
							<div className="h-[3px] w-[84%] rounded-full bg-border-raised" />
							<div className="mt-[7px] h-[8px] w-[42%] rounded-[2px] bg-thread/70" />
						</div>
					</div>
				))}
				<div className="absolute inset-0 flex items-center justify-center">
					<motion.span
						className="flex h-10 w-10 items-center justify-center rounded-full border border-thread/70 bg-bg/80 text-thread"
						animate={reduce ? undefined : { scale: [1, 1.05, 1] }}
						transition={{ duration: 3.4, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
					>
						<PlayTri className="ml-[2px] h-3 w-3" />
					</motion.span>
				</div>
			</div>
			<div className="mt-2.5 flex items-baseline justify-between font-mono text-2xs text-muted">
				<span className="transition-colors duration-150 group-hover/vid:text-text">watch it once</span>
				<span>2:48</span>
			</div>
		</div>
	);
}

function Chip({ label, sub, arrow }: { label: string; sub: string; arrow?: boolean }) {
	return (
		<span className="group/chip inline-flex w-[300px] items-center gap-3 rounded-md border border-border bg-canvas px-3.5 py-3 transition-colors duration-150 hover:border-border-raised">
			<span className="font-mono text-[13px] text-text leading-none">{label}</span>
			<span className="font-mono text-2xs text-muted leading-none">{sub}</span>
			{arrow === true ? (
				<span className="ml-auto text-muted transition-colors duration-150 group-hover/chip:text-thread">
					<DownArrow className="h-3.5 w-3.5" />
				</span>
			) : null}
		</span>
	);
}

/* ---------- the record ---------- */

interface Entry {
	label: string;
	body: React.ReactNode;
	side?: React.ReactNode;
}

function Row({ entry }: { entry: Entry }) {
	return (
		<div className="grid grid-cols-[168px_560px_1fr] gap-x-[52px] border-border border-t py-9">
			<div className="pt-1 font-mono text-muted text-xs leading-5">{entry.label}</div>
			<div className="text-[16px] text-text/82 leading-[28px]">{entry.body}</div>
			<div>{entry.side}</div>
		</div>
	);
}

export default function SiteLetterColophon() {
	const entries: readonly Entry[] = [
		{
			label: "what it is",
			body: (
				<>
					A prototyping canvas for real code. Your agent writes TSX frames into <Mono>design/</Mono> in
					your repo. spool renders them on an infinite canvas, links them into flows, and plays the flow
					like an app you can click through.
				</>
			),
			side: <CanvasMark />,
		},
		{
			label: "who made it",
			body: (
				<>
					Me, alone so far. Liam, in Stockholm, twenty, one person doing product and front end at a small
					company. I built it because I kept designing screens somewhere they could not run. If parts of
					it feel like one person's opinion, that is what they are.
				</>
			),
			side: (
				<dl className="w-[300px] border-border border-t">
					{[
						{ k: "author", v: "Liam Vinberg" },
						{ k: "where", v: "Stockholm" },
						{ k: "since", v: "March 2026" },
						{ k: "team", v: "one" },
					].map((row) => (
						<div key={row.k} className="flex items-baseline justify-between border-border border-b py-2.5">
							<dt className="font-mono text-2xs text-muted">{row.k}</dt>
							<dd className="font-mono text-2xs text-text">{row.v}</dd>
						</div>
					))}
				</dl>
			),
		},
		{
			label: "install",
			body: (
				<>
					One line, from npm. You need Node 22 and up, and Chrome for the canvas. macOS and Linux both
					work; on Windows, run it under WSL.
				</>
			),
			side: (
				<div className="w-[300px]">
					<CommandLine prompt="~ $" command="npm i -g spool.page" />
					<CommandLine prompt="~/your-app $" command="spool init" />
				</div>
			),
		},
		{
			label: "mac app",
			body: (
				<>
					An Electron window on the same local daemon, for the days you want a dock icon instead of a
					terminal. It bundles the published package, so the two stay on one version.
				</>
			),
			side: <Chip label="Spool.dmg" sub="4.1 MB" arrow />,
		},
		{
			label: "first run",
			body: (
				<>
					Empty. spool has no idea yet which of your folders is a project. There is a <Mono>+</Mono> in
					the corner: press it, pick a folder with code in it, and that folder is a project from then on.
				</>
			),
			side: <EmptyRunMark />,
		},
		{
			label: "more than one",
			body: (
				<>
					A project is a folder, so you can have as many as you have folders. Each canvas lives beside
					the code it describes and goes into git with it. I keep six open and switch by name.
				</>
			),
			side: <ProjectsMark />,
		},
		{
			label: "what I use it on",
			body: (
				<>
					spool itself, every day. Its own design folder holds {TOTAL} frames across twelve pages, and
					every screen that shipped was drawn there before it was built. The versions that lost are still
					in the git history, which is where I go when I forget why something is the way it is.
				</>
			),
			side: <FrameGrid />,
		},
		{
			label: "if you prefer video",
			body: <>Two minutes and forty eight seconds, from an empty folder to a flow you can walk.</>,
			side: <VideoMark />,
		},
		{
			label: "license",
			body: (
				<>
					MIT. Fork it, rework it, rename it, ship it. It is a tool for designing things; make it your
					own if you want to. If the pages rail annoys you, it is one file and you should change it.
				</>
			),
			side: <Chip label="LICENSE.md" sub="MIT · 2026" />,
		},
		{
			label: "status",
			body: (
				<>
					Pre-1.0. Published, dogfooded daily, still moving. Issues are public and I answer them. I would
					rather read your fork than your feature request, though both are welcome.
				</>
			),
			side: <Chip label="v0.6.0" sub="npm · spool.page" />,
		},
	];

	return (
		<div className="min-h-full w-full bg-bg font-sans text-text antialiased [font-synthesis:none]">
			<div className="mx-auto w-[1240px] pb-[120px]">
				<header className="flex items-center justify-between border-border border-b py-7">
					<span className="font-mono text-muted text-xs">spool.page</span>
					<nav className="flex items-center gap-7 font-mono text-muted text-xs">
						<span className="transition-colors duration-150 hover:text-text">github</span>
						<span className="transition-colors duration-150 hover:text-text">docs</span>
						<span className="text-text">install</span>
					</nav>
				</header>

				<div className="grid grid-cols-[168px_560px_1fr] gap-x-[52px] pt-[100px] pb-[84px]">
					<div className="flex justify-end pt-[10px]">
						<SpoolMark className="h-[92px] w-[73px] text-thread" title="spool" />
					</div>
					<div>
						<h1 className="font-semibold text-[88px] leading-[0.86] tracking-[-0.032em]">spool</h1>
						<p className="mt-7 text-[22px] text-text leading-8">A canvas where the frames are alive.</p>
						<p className="mt-3 text-[16px] text-muted leading-[26px]">
							It runs on your machine, reads a folder of TSX files out of your repo, and plays them
							back as something you can click.
						</p>
					</div>
					<div className="w-[300px] pt-[14px]">
						<p className="text-[15px] text-text/80 leading-[26px]">
							What follows is the whole record: who wrote it, what it needs, what I use it on, and
							what you are allowed to do with it. I keep it here so nobody has to ask me.
						</p>
						<div className="mt-6 border-border border-t pt-4 font-mono text-2xs text-muted leading-[18px]">
							kept current by hand
							<br />
							last changed 1 September 2026
						</div>
					</div>
				</div>

				<div className="border-border border-b">
					{entries.map((e) => (
						<Row key={e.label} entry={e} />
					))}
				</div>

				<footer className="flex items-baseline justify-between pt-8 font-mono text-muted text-xs">
					<span>Set in Familjen Grotesk and Fragment Mono. Written in Stockholm.</span>
					<span className="text-text">Liam Vinberg</span>
				</footer>
			</div>
		</div>
	);
}
