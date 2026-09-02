import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../../../shared/lib/utils";
import { SpoolMark } from "../../../shared/ui/spool-mark";

/**
 * site-field--rail, the eight documents the rail is a table of contents for.
 * Each is drawn at the size the camera fits it to, so the type here is the type
 * you read, at 100%, with the field showing around the edges.
 */

export const EASE = [0.22, 1, 0.36, 1] as const;

export const dotGrid = {
	backgroundImage:
		"radial-gradient(circle, color-mix(in srgb, var(--color-text) 9%, transparent) 1px, transparent 1px)",
	backgroundSize: "32px 32px",
};

export const dotGridMini = {
	backgroundImage:
		"radial-gradient(circle, color-mix(in srgb, var(--color-text) 8%, transparent) 1px, transparent 1px)",
	backgroundSize: "14px 14px",
};

/* ---------- glyphs ---------- */

export function Tick({ className }: { className?: string }) {
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

export function CopyGlyph({ className }: { className?: string }) {
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

export function ArrowDown({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 12 12" fill="none" aria-hidden="true" className={className}>
			<path
				d="M6 1.75v7.5M2.9 6.4 6 9.5l3.1-3.1"
				stroke="currentColor"
				strokeWidth="1.2"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

export function ArrowUpRight({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 12 12" fill="none" aria-hidden="true" className={className}>
			<path
				d="M3.5 8.5 8.5 3.5M4.6 3.5h3.9v3.9"
				stroke="currentColor"
				strokeWidth="1.2"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

export function PlusGlyph({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 12 12" className={className} fill="none" aria-hidden="true">
			<path d="M6 2.25v7.5M2.25 6h7.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
		</svg>
	);
}

export function FolderGlyph({ className }: { className?: string }) {
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

export function FrameGlyph({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 14 14" className={className} fill="none" aria-hidden="true">
			<path d="M3 1.75h5l3 3v7.5H3z" stroke="currentColor" strokeWidth="1.15" strokeLinejoin="round" />
			<path d="M8 1.75v3h3" stroke="currentColor" strokeWidth="1.15" strokeLinejoin="round" />
		</svg>
	);
}

export function Bar({ w, className }: { w: string | number; className?: string }) {
	return <div className={cn("h-[3px] rounded-full bg-border-raised", className)} style={{ width: w }} />;
}

async function copyText(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		return false;
	}
}

export function CommandLine({
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
			onClick={(e) => {
				e.stopPropagation();
				void handleCopy();
			}}
			aria-label={copied ? `Copied ${command}` : `Copy ${command}`}
			className={cn("group/cmd block w-full cursor-pointer text-left focus-visible:outline-none", className)}
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

/* ---------- 1. start ---------- */

export function StartDoc() {
	return (
		<div className="flex h-full w-full flex-col bg-bg p-16">
			<div className="flex shrink-0 items-center gap-2.5">
				<SpoolMark className="h-5 w-4 text-thread" title="spool" />
				<span className="font-semibold text-md tracking-tight">spool</span>
			</div>
			<div className="flex flex-1 flex-col justify-center">
				<h1 className="max-w-[780px] font-semibold text-[56px] leading-[0.97] tracking-[-0.022em]">
					A canvas where the frames are alive.
				</h1>
				<p className="mt-6 max-w-[560px] text-[17px] text-muted leading-[27px]">
					Your agent writes TSX frames into the design folder of your repo. You arrange them on a canvas,
					link them into flows, and click through the result the way a user would. The code is the document.
				</p>
				<div className="mt-10 flex gap-5">
					<span className="w-px shrink-0 self-stretch bg-thread/70" />
					<div className="w-[420px] font-mono text-[16px] leading-[31px]">
						<CommandLine prompt="~ $" command="npm i -g spool.page" />
						<CommandLine prompt="~/tvarso $" command="spool init" />
					</div>
				</div>
			</div>
			<div className="flex shrink-0 items-end justify-between">
				<p className="max-w-[400px] text-[14px] text-muted leading-[22px]">
					The rail on the left is this page. Every row in it is a frame standing on the canvas behind this
					one.
				</p>
				<p className="font-mono text-[11px] text-muted/60">press f to see all of them</p>
			</div>
		</div>
	);
}

/* ---------- 2. install ---------- */

export function InstallDoc() {
	return (
		<div className="flex h-full w-full flex-col bg-bg p-14">
			<h2 className="shrink-0 font-semibold text-[34px] leading-[1.05] tracking-[-0.02em]">Install it</h2>
			<div className="mt-9 flex flex-1 gap-6">
				<span className="w-px shrink-0 bg-thread/70" />
				<div className="w-full font-mono text-[17px] leading-[34px]">
					<CommandLine prompt="~ $" command="npm i -g spool.page" />
					<CommandLine prompt="~/tvarso $" command="spool init" />
					<CommandLine prompt="~/tvarso $" command="spool serve" />
				</div>
			</div>
			<div className="shrink-0 space-y-4">
				<p className="max-w-[520px] text-[15px] text-muted leading-[24px]">
					Node 22+, and the canvas wants Chrome. macOS and Linux run it directly; on Windows use WSL.
				</p>
				<p className="max-w-[520px] font-mono text-[12px] text-muted/60 leading-[20px]">
					npm blocking install scripts? npm i -g spool.page --allow-scripts=esbuild
				</p>
			</div>
		</div>
	);
}

/* ---------- 3. mac ---------- */

export function MacDoc() {
	return (
		<div className="flex h-full w-full bg-bg">
			<div className="flex w-[46%] shrink-0 flex-col justify-between border-border border-r p-12">
				<h2 className="font-semibold text-[34px] leading-[1.05] tracking-[-0.02em]">Or take the Mac app</h2>
				<p className="text-[15px] text-muted leading-[24px]">
					It is the same daemon in a window, bundled with the published package, and it puts an icon in your
					dock. Everything still runs on your own machine.
				</p>
				<a
					href="https://github.com/liamvinberg/spool/releases/latest/download/Spool.dmg"
					className="group flex w-fit items-center gap-2.5 rounded-sm border border-border-raised px-4 py-2.5 font-mono text-sm text-text transition-colors duration-200 hover:border-thread/60"
				>
					Spool.dmg
					<ArrowDown className="h-3.5 w-3.5 text-muted transition-colors duration-200 group-hover:text-thread" />
				</a>
			</div>
			<div className="relative flex-1 p-10" style={dotGridMini}>
				<div className="h-full w-full overflow-hidden rounded-[8px] border border-border bg-bg">
					<div className="flex h-7 items-center gap-1.5 border-border border-b px-3">
						<span className="h-2.5 w-2.5 rounded-full bg-raised" />
						<span className="h-2.5 w-2.5 rounded-full bg-raised" />
						<span className="h-2.5 w-2.5 rounded-full bg-raised" />
						<span className="ml-3 font-mono text-[10px] text-muted/80">Spool</span>
					</div>
					<div className="flex h-full">
						<div className="w-[86px] shrink-0 space-y-2 border-border border-r p-2.5">
							<div className="h-2 w-[70%] rounded-[1px] bg-raised" />
							<Bar w="86%" />
							<Bar w="62%" />
							<Bar w="74%" />
						</div>
						<div className="relative flex-1" style={dotGridMini}>
							<div className="absolute top-5 left-6 h-[74px] w-[112px] rounded-[4px] border border-thread/50 bg-surface p-2.5">
								<div className="h-2 w-[54%] rounded-[1px] bg-raised" />
								<div className="mt-2 space-y-1.5">
									<Bar w="82%" />
									<Bar w="60%" />
								</div>
								<div className="mt-3 h-3 w-[46px] rounded-[2px] bg-thread/70" />
							</div>
							<div className="absolute top-[120px] left-[150px] h-[64px] w-[96px] rounded-[4px] border border-border-raised bg-surface p-2.5">
								<div className="space-y-1.5">
									<Bar w="88%" />
									<Bar w="66%" />
									<Bar w="72%" />
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

/* ---------- 4. open ---------- */

const DISK: readonly { name: string; note?: string }[] = [
	{ name: "ferry-booking" },
	{ name: "kaffe" },
	{ name: "notes-cli" },
	{ name: "tvarso", note: "design/" },
	{ name: "spool", note: "design/" },
];

export function OpenDoc() {
	const [hover, setHover] = useState("tvarso");
	return (
		<div className="flex h-full w-full flex-col bg-bg">
			<div className="shrink-0 px-12 pt-12 pb-8">
				<h2 className="font-semibold text-[34px] leading-[1.05] tracking-[-0.02em]">Point + at a folder</h2>
				<p className="mt-4 max-w-[560px] text-[15px] text-muted leading-[24px]">
					Any folder on your machine. spool walks up to the repo root, finds design/ or offers to scaffold
					it, and the project gets its own tab.
				</p>
			</div>
			<div className="mx-12 mb-12 flex-1 overflow-hidden rounded-[6px] border border-border-raised">
				<div className="flex h-11 items-center gap-2.5 border-border border-b px-4">
					<FolderGlyph className="h-3.5 w-3.5 shrink-0 text-muted" />
					<span className="font-mono text-sm text-text">~/code</span>
					<span className="ml-auto font-mono text-[10px] text-muted/60">5 folders</span>
				</div>
				{DISK.map((row) => {
					const on = row.name === hover;
					return (
						<button
							type="button"
							key={row.name}
							onPointerEnter={() => setHover(row.name)}
							onFocus={() => setHover(row.name)}
							className={cn(
								"flex h-10 w-full cursor-pointer items-center gap-2.5 px-4 text-left transition-colors duration-150 focus-visible:outline-none",
								on && "bg-surface",
							)}
						>
							<FolderGlyph className={cn("h-3.5 w-3.5 shrink-0", on ? "text-thread" : "text-muted")} />
							<span className={cn("font-mono text-sm", on ? "text-text" : "text-muted")}>
								{row.name}/
							</span>
							{row.note === undefined ? null : (
								<span
									className={cn(
										"ml-auto rounded-xs px-1.5 py-[2px] font-mono text-[10px] transition-colors duration-150",
										on ? "bg-thread text-on-thread" : "text-muted/50",
									)}
								>
									{row.note}
								</span>
							)}
						</button>
					);
				})}
			</div>
		</div>
	);
}

/* ---------- 5. projects ---------- */

const TABS = ["spool", "tvarso", "kaffe", "ferry-booking"] as const;

export function ProjectsDoc() {
	const [active, setActive] = useState<string>("tvarso");
	return (
		<div className="flex h-full w-full flex-col bg-bg">
			<div className="flex h-12 shrink-0 items-center gap-5 border-border border-b px-5">
				<span className="flex select-none items-center gap-2">
					<SpoolMark className="h-[18px] w-3.5 text-thread" title="spool" />
					<span className="font-semibold text-md leading-sm tracking-tight">spool</span>
				</span>
				<nav aria-label="Projects" className="flex items-center gap-1">
					{TABS.map((name) => {
						const on = name === active;
						return (
							<button
								type="button"
								key={name}
								aria-pressed={on}
								onClick={(e) => {
									e.stopPropagation();
									setActive(name);
								}}
								className={cn(
									"flex h-[26px] cursor-pointer items-center rounded-md px-3 text-base transition-colors duration-150 focus-visible:outline-none",
									on
										? "border border-border-raised bg-raised font-medium text-text"
										: "text-muted hover:text-text",
								)}
							>
								{name}
							</button>
						);
					})}
					<span className="flex h-[26px] w-[26px] items-center justify-center text-muted">
						<PlusGlyph className="h-2.5 w-2.5" />
					</span>
				</nav>
				<span className="ml-auto font-mono text-[11px] text-muted/70">localhost:7766</span>
			</div>
			<div className="flex flex-1 items-center gap-10 px-12">
				<p className="w-[380px] shrink-0 text-[15px] text-muted leading-[24px]">
					Four repos, four tabs, one daemon on port 7766. Switching is instant because every project's files
					stay where they are and spool only reads them.
				</p>
				<div className="flex gap-3">
					{[0, 1, 2, 3].map((i) => (
						<div
							key={i}
							className={cn(
								"h-[96px] w-[136px] rounded-[4px] border p-3",
								i === 1 ? "border-thread/50 bg-surface" : "border-border-raised bg-surface/60",
							)}
						>
							<div className="h-2 w-[58%] rounded-[1px] bg-raised" />
							<div className="mt-2.5 space-y-1.5">
								<Bar w="84%" />
								<Bar w="62%" />
							</div>
							{i === 1 ? <div className="mt-3 h-3 w-[52px] rounded-[2px] bg-thread/70" /> : null}
						</div>
					))}
				</div>
			</div>
		</div>
	);
}

/* ---------- 6. watch ---------- */

const CLIP_LENGTH = 134;

const CHAPTERS: readonly { at: number; label: string }[] = [
	{ at: 0, label: "install and spool init" },
	{ at: 46, label: "the agent writes a frame" },
	{ at: 92, label: "walking the flow" },
];

function timecode(seconds: number) {
	const s = Math.floor(seconds);
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function ClipScene({ index }: { index: number }) {
	if (index === 1) {
		return (
			<div className="flex h-full w-full">
				<div className="w-[46%] shrink-0 border-border border-r bg-canvas p-6">
					<div className="space-y-2.5">
						{["68%", "44%", "80%", "56%", "72%", "38%", "64%"].map((w, i) => (
							<div key={w + String(i)} className="flex items-center gap-2.5">
								<span className="h-[3px] w-2.5 rounded-full bg-border-raised/70" />
								<div className="h-[3px] rounded-full bg-border-raised" style={{ width: w }} />
							</div>
						))}
						<div className="flex items-center gap-2.5">
							<span className="h-[3px] w-2.5 rounded-full bg-border-raised/70" />
							<div className="h-[3px] w-[30%] rounded-full bg-border-raised" />
							<motion.span
								className="block h-4 w-[2px] bg-thread"
								animate={{ opacity: [1, 0.1] }}
								transition={{ duration: 0.7, repeat: Number.POSITIVE_INFINITY, repeatType: "reverse" }}
							/>
						</div>
					</div>
				</div>
				<div className="flex-1 p-8" style={dotGridMini}>
					<div className="h-4 w-[68%] rounded-[2px] bg-raised" />
					<div className="mt-2.5 h-4 w-[44%] rounded-[2px] bg-raised" />
					<div className="mt-7 flex gap-3">
						<span className="w-px self-stretch bg-thread/60" />
						<div className="space-y-2 py-0.5">
							<Bar w={104} />
							<Bar w={72} />
						</div>
					</div>
					<div className="mt-8 h-7 w-[96px] rounded-[3px] bg-thread/75" />
				</div>
			</div>
		);
	}
	if (index === 2) {
		return (
			<div className="relative h-full w-full" style={dotGridMini}>
				{[60, 250, 440].map((lx, i) => (
					<div
						key={lx}
						className={cn(
							"absolute overflow-hidden rounded-[5px] border bg-surface p-3.5",
							i === 1 ? "border-thread/60" : "border-border-raised",
						)}
						style={{ left: lx, top: 60, width: 148, height: 172 }}
					>
						<div className="h-2.5 w-[62%] rounded-[1px] bg-raised" />
						<div className="mt-3 space-y-2">
							<Bar w="86%" />
							<Bar w="64%" />
							<Bar w="72%" />
						</div>
						<div className="mt-5 h-5 w-full rounded-[2px] bg-thread/60" />
					</div>
				))}
				<svg
					className="pointer-events-none absolute inset-0 overflow-visible"
					aria-hidden="true"
					fill="none"
					width="100%"
					height="100%"
				>
					<path d="M212 146 L 244 146" stroke="var(--color-thread)" strokeWidth="1.5" />
					<path d="M402 146 L 434 146" stroke="var(--color-thread)" strokeWidth="1.5" />
				</svg>
			</div>
		);
	}
	return (
		<div className="flex h-full w-full flex-col justify-center gap-3 bg-canvas px-12 font-mono text-[15px] leading-[26px]">
			<div>
				<span className="text-muted">~ $ </span>
				<span className="text-text">npm i -g spool.page</span>
			</div>
			<div className="text-muted/70">added 1 package in 4s</div>
			<div className="mt-2">
				<span className="text-muted">~/tvarso $ </span>
				<span className="text-text">spool init</span>
			</div>
			<div className="text-muted/70">design/ scaffolded · project registered</div>
			<div className="text-thread">opening localhost:7766</div>
		</div>
	);
}

export function WatchDoc() {
	const [playing, setPlaying] = useState(false);
	const [at, setAt] = useState(0);

	useEffect(() => {
		if (!playing) return;
		const id = window.setInterval(() => {
			setAt((v) => {
				const next = v + 0.2;
				if (next >= CLIP_LENGTH) {
					setPlaying(false);
					return 0;
				}
				return next;
			});
		}, 200);
		return () => window.clearInterval(id);
	}, [playing]);

	let scene = 0;
	for (let i = 0; i < CHAPTERS.length; i++) {
		const chapter = CHAPTERS[i];
		if (chapter !== undefined && at >= chapter.at) scene = i;
	}
	const chapter = CHAPTERS[scene];

	return (
		<div className="flex h-full w-full flex-col bg-bg">
			<div className="relative flex-1 overflow-hidden border-border border-b">
				<ClipScene index={scene} />
				<button
					type="button"
					aria-label={playing ? "Pause the walkthrough" : "Play the walkthrough"}
					onClick={(e) => {
						e.stopPropagation();
						setPlaying((p) => !p);
					}}
					className={cn(
						"absolute inset-0 flex cursor-pointer items-center justify-center transition-colors duration-300 focus-visible:outline-none",
						playing ? "bg-bg/0 hover:bg-bg/25" : "bg-bg/70",
					)}
				>
					<motion.span
						className="flex h-[76px] w-[76px] items-center justify-center rounded-full border border-thread/60 bg-bg/85"
						animate={{ opacity: playing ? 0 : 1, scale: playing ? 0.9 : 1 }}
						whileHover={{ scale: playing ? 0.9 : 1.06 }}
						transition={{ duration: 0.24, ease: EASE }}
					>
						<svg viewBox="0 0 12 12" fill="currentColor" aria-hidden="true" className="h-5 w-5 text-thread">
							<path d="M3.4 1.8 9.4 6 3.4 10.2Z" />
						</svg>
					</motion.span>
				</button>
			</div>
			<div className="flex h-[74px] shrink-0 items-center gap-5 px-8">
				<span className="font-mono text-xs text-muted tabular-nums">
					{timecode(at)} / {timecode(CLIP_LENGTH)}
				</span>
				<div className="relative h-[3px] flex-1 rounded-full bg-border-raised">
					<div
						className="absolute inset-y-0 left-0 rounded-full bg-thread transition-[width] duration-200 ease-linear"
						style={{ width: `${(at / CLIP_LENGTH) * 100}%` }}
					/>
					{CHAPTERS.map((c) => (
						<span
							key={c.at}
							className="absolute top-[-3px] h-[9px] w-px bg-bg"
							style={{ left: `${(c.at / CLIP_LENGTH) * 100}%` }}
						/>
					))}
				</div>
				<span className="w-[190px] text-right font-mono text-xs text-muted/70">
					{chapter === undefined ? "" : chapter.label}
				</span>
			</div>
		</div>
	);
}

/* ---------- 7. design ---------- */

const PAGES: readonly { name: string; count: number }[] = [
	{ name: "agent", count: 27 },
	{ name: "app", count: 7 },
	{ name: "booting", count: 20 },
	{ name: "components", count: 7 },
	{ name: "directing", count: 1 },
	{ name: "dock", count: 7 },
	{ name: "explorer", count: 8 },
	{ name: "manipulate", count: 14 },
	{ name: "picker", count: 6 },
	{ name: "play-inline", count: 3 },
	{ name: "play-tab", count: 4 },
	{ name: "site", count: 11 },
	{ name: "variants", count: 45 },
];

const TILES: readonly { x: number; y: number; w: number; h: number; lit?: boolean }[] = [
	{ x: 30, y: 26, w: 150, h: 88 },
	{ x: 196, y: 26, w: 112, h: 88 },
	{ x: 324, y: 38, w: 170, h: 76, lit: true },
	{ x: 510, y: 26, w: 96, h: 126 },
	{ x: 622, y: 38, w: 130, h: 84 },
	{ x: 30, y: 130, w: 92, h: 112 },
	{ x: 138, y: 130, w: 170, h: 112 },
	{ x: 324, y: 130, w: 130, h: 66 },
	{ x: 324, y: 212, w: 130, h: 88 },
	{ x: 470, y: 168, w: 136, h: 74 },
	{ x: 622, y: 138, w: 130, h: 104 },
	{ x: 30, y: 258, w: 122, h: 78 },
	{ x: 168, y: 258, w: 140, h: 78 },
	{ x: 470, y: 258, w: 136, h: 64 },
	{ x: 622, y: 258, w: 130, h: 64 },
];

export function DesignDoc() {
	return (
		<div className="flex h-full w-full overflow-hidden bg-bg">
			<div className="flex w-[248px] shrink-0 flex-col border-border border-r">
				<div className="flex h-11 shrink-0 items-center gap-2 border-border border-b px-4">
					<span className="font-semibold text-base">Pages</span>
					<span className="font-mono text-muted text-xs">13</span>
				</div>
				<div className="flex-1 py-2">
					{PAGES.map((p) => (
						<div
							key={p.name}
							className={cn(
								"relative flex h-8 items-center gap-2 px-4",
								p.name === "site" && "bg-surface",
							)}
						>
							{p.name === "site" ? (
								<span className="absolute top-1.5 bottom-1.5 left-0 w-[2px] rounded-full bg-thread" />
							) : null}
							<FolderGlyph
								className={cn("h-3.5 w-3.5 shrink-0", p.name === "site" ? "text-thread" : "text-muted")}
							/>
							<span
								className={cn(
									"min-w-0 flex-1 truncate font-mono text-sm",
									p.name === "site" ? "text-text" : "text-muted",
								)}
							>
								{p.name}
							</span>
							<span className="font-mono text-2xs text-muted/60 tabular-nums">{p.count}</span>
						</div>
					))}
				</div>
			</div>
			<div className="flex flex-1 flex-col">
				<div className="shrink-0 border-border border-b px-8 py-7">
					<h2 className="font-semibold text-[28px] leading-[1.1] tracking-[-0.02em]">
						I design spool in spool
					</h2>
					<p className="mt-3 max-w-[420px] text-[14px] text-muted leading-[22px]">
						This repo's design folder holds 160 frames across 13 pages. Every screen you are reading is one
						of them, checked into git beside the source it argues about.
					</p>
				</div>
				<div className="relative flex-1" style={dotGridMini}>
					{TILES.map((t) => (
						<div
							key={`${t.x}-${t.y}`}
							className={cn(
								"absolute rounded-[3px] border bg-surface p-2",
								t.lit === true ? "border-thread/55" : "border-border-raised",
							)}
							style={{ left: t.x, top: t.y, width: t.w, height: t.h }}
						>
							<div className="h-2 w-[56%] rounded-[1px] bg-raised" />
							<div className="mt-2 space-y-1.5">
								<Bar w="82%" />
								<Bar w="58%" />
							</div>
							{t.lit === true ? <div className="mt-2.5 h-2.5 w-[40%] rounded-[1px] bg-thread/60" /> : null}
						</div>
					))}
					<p className="absolute right-6 bottom-5 font-mono text-[11px] text-muted/60">
						~/code/spool/design · 160 frames
					</p>
				</div>
			</div>
		</div>
	);
}

/* ---------- 8. license ---------- */

export function LicenseDoc() {
	return (
		<div className="flex h-full w-full flex-col justify-between bg-bg p-12">
			<div>
				<h2 className="font-semibold text-[52px] leading-[1] tracking-[-0.02em]">MIT</h2>
				<p className="mt-4 max-w-[520px] text-[17px] text-muted leading-[27px]">
					Fork it, rework it, rename it, ship it. It is a tool for designing things, so make it your own.
				</p>
			</div>
			<div className="flex items-end justify-between">
				<a
					href="https://github.com/liamvinberg/spool"
					className="inline-flex items-center gap-1.5 font-mono text-sm text-text transition-colors duration-200 hover:text-thread"
				>
					github.com/liamvinberg/spool
					<ArrowUpRight className="h-3 w-3 opacity-70" />
				</a>
				<span className="font-mono text-[11px] text-muted/60">third-party parts keep their own licenses</span>
			</div>
		</div>
	);
}
