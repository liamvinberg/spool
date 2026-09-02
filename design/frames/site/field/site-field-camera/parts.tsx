import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { cn } from "shared/lib/utils";
import { SpoolMark } from "shared/ui/spool-mark";

/**
 * site-field--camera, the eight documents that stand on the field. Every one of
 * them is drawn at the size the camera parks on, so nothing here is a thumbnail
 * of something else: the type is the real type and the chrome is spool's own.
 */

/* ---------- primitives ---------- */

export const EASE = [0.22, 1, 0.36, 1] as const;

export const dotGrid = {
	backgroundImage:
		"radial-gradient(circle, color-mix(in srgb, var(--color-text) 9%, transparent) 1px, transparent 1px)",
	backgroundSize: "32px 32px",
};

export const dotGridMini = {
	backgroundImage:
		"radial-gradient(circle, color-mix(in srgb, var(--color-text) 8%, transparent) 1px, transparent 1px)",
	backgroundSize: "12px 12px",
};

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

/**
 * The install line. The path half of the prompt never moves; only the trailing
 * "$" crossfades with the copy glyph and the tick inside a fixed 1ch slot, so
 * rest, hover and copied share one line box and nothing reflows.
 */
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
			onClick={() => {
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

/* ---------- 1. landing ---------- */

export function LandingDoc() {
	return (
		<div className="flex h-full w-full flex-col bg-bg p-14">
			<div className="flex shrink-0 items-center gap-2.5">
				<SpoolMark className="h-5 w-4 text-thread" title="spool" />
				<span className="font-semibold text-md tracking-tight">spool</span>
			</div>

			<div className="flex flex-1 flex-col justify-center">
				<h1 className="max-w-[720px] font-semibold text-[52px] leading-[0.98] tracking-[-0.022em]">
					You are already on the canvas.
				</h1>
				<p className="mt-5 max-w-[520px] text-[17px] text-muted leading-[26px]">
					spool is a prototyping canvas for real code. Your agent writes TSX frames into your repo, you
					arrange them here, and you click through the flow the way a user would.
				</p>
				<div className="mt-10 flex gap-4">
					<span className="w-px shrink-0 self-stretch bg-thread/70" />
					<div className="w-[400px] font-mono text-[15px] leading-[29px]">
						<CommandLine prompt="~ $" command="npm i -g spool.page" />
						<CommandLine prompt="~/your-app $" command="spool init" />
					</div>
				</div>
			</div>

			<div className="flex shrink-0 items-end justify-between">
				<p className="font-mono text-muted text-xs">Node 22+ · best in Chrome</p>
				<p className="w-[244px] text-right font-mono text-[11px] text-muted/70 leading-[18px]">
					Nothing on this page is a picture. Scroll and the camera walks it.
				</p>
			</div>
		</div>
	);
}

/* ---------- 2. mac ---------- */

export function MacDoc() {
	return (
		<div className="flex h-full w-full flex-col bg-bg p-8">
			<div className="relative flex-1 overflow-hidden rounded-[6px] border border-border bg-canvas">
				<div className="flex h-6 items-center gap-1.5 border-border border-b bg-bg px-2.5">
					<span className="h-2 w-2 rounded-full bg-raised" />
					<span className="h-2 w-2 rounded-full bg-raised" />
					<span className="h-2 w-2 rounded-full bg-raised" />
					<span className="ml-2 font-mono text-[9px] text-muted/80">Spool</span>
				</div>
				<div className="relative h-full" style={dotGridMini}>
					<div className="absolute top-4 left-4 h-[52px] w-[86px] rounded-[3px] border border-border-raised bg-surface p-1.5">
						<div className="h-1.5 w-[60%] rounded-[1px] bg-raised" />
						<div className="mt-1.5 space-y-1">
							<Bar w="80%" />
							<Bar w="52%" />
						</div>
					</div>
					<div className="absolute top-[86px] left-[124px] h-[46px] w-[78px] rounded-[3px] border border-thread/50 bg-surface p-1.5">
						<div className="h-1.5 w-[50%] rounded-[1px] bg-raised" />
						<div className="mt-1.5 h-3 w-full rounded-[1px] bg-thread/60" />
					</div>
					<div className="absolute top-6 left-[236px] h-[62px] w-[70px] rounded-[3px] border border-border-raised bg-surface p-1.5">
						<div className="space-y-1">
							<Bar w="88%" />
							<Bar w="70%" />
							<Bar w="76%" />
						</div>
					</div>
				</div>
			</div>

			<div className="mt-6 flex items-end justify-between">
				<div>
					<h2 className="font-semibold text-lg leading-[24px] tracking-tight">Or take the Mac app</h2>
					<p className="mt-1.5 w-[220px] text-[13px] text-muted leading-[20px]">
						One window on the same daemon, with a dock icon.
					</p>
				</div>
				<a
					href="https://github.com/liamvinberg/spool/releases/latest/download/Spool.dmg"
					className="group flex items-center gap-2 rounded-sm border border-border-raised px-3 py-2 font-mono text-text text-xs transition-colors duration-200 hover:border-thread/60"
				>
					Spool.dmg
					<ArrowDown className="h-3 w-3 text-muted transition-colors duration-200 group-hover:text-thread" />
				</a>
			</div>
		</div>
	);
}

/* ---------- 3. first-run ---------- */

export function FirstRunDoc() {
	return (
		<div className="flex h-full w-full flex-col overflow-hidden bg-bg">
			<div className="flex h-8 shrink-0 items-center gap-4 border-border border-b px-3">
				<span className="flex items-center gap-1.5">
					<SpoolMark className="h-3.5 w-2.5 text-thread" />
					<span className="font-semibold text-xs tracking-tight">spool</span>
				</span>
				<span className="flex h-5 items-center rounded-sm border border-border-raised bg-raised px-2 font-mono text-[10px] text-text">
					your-app
				</span>
				<PlusGlyph className="h-2.5 w-2.5 text-muted" />
			</div>
			<div className="flex min-h-0 flex-1">
				<div className="flex w-[136px] shrink-0 flex-col border-border border-r">
					<div className="flex h-7 items-center gap-2 border-border border-b px-3">
						<span className="font-semibold text-[11px]">Pages</span>
						<span className="font-mono text-[10px] text-muted">0</span>
					</div>
					<div className="px-3 py-2 font-mono text-[10px] text-muted/60">no pages yet</div>
				</div>
				<div className="relative flex flex-1 flex-col items-center justify-center gap-3" style={dotGridMini}>
					<SpoolMark className="h-6 w-5 text-thread opacity-30" />
					<span className="font-mono text-muted/70 text-xs">no frames yet</span>
					<span className="font-mono text-[10px] text-muted/45">design/frames is empty</span>
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
		<div className="flex h-full w-full flex-col overflow-hidden bg-bg">
			<div className="flex h-11 shrink-0 items-center gap-2.5 border-border border-b px-4">
				<FolderGlyph className="h-3.5 w-3.5 shrink-0 text-muted" />
				<span className="font-mono text-sm text-text">~/code</span>
				<span className="ml-auto font-mono text-[10px] text-muted/60">5 folders</span>
			</div>
			<div className="flex-1 py-2">
				{DISK.map((row) => {
					const on = row.name === hover;
					return (
						<button
							type="button"
							key={row.name}
							onPointerEnter={() => setHover(row.name)}
							onFocus={() => setHover(row.name)}
							className={cn(
								"flex h-9 w-full cursor-pointer items-center gap-2.5 px-4 text-left transition-colors duration-150 focus-visible:outline-none",
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
			<div className="flex shrink-0 items-center justify-between border-border border-t px-4 py-3 font-mono text-[10px] text-muted/70">
				<span>↑↓ move · ⏎ open</span>
				<span>spool walks up to the repo root</span>
			</div>
		</div>
	);
}

/* ---------- 5. projects ---------- */

const TABS = ["spool", "tvarso", "kaffe", "ferry-booking"] as const;

export function ProjectsDoc() {
	const [active, setActive] = useState<string>("tvarso");
	return (
		<div className="flex h-full w-full flex-col overflow-hidden bg-bg">
			<div className="flex h-11 shrink-0 items-center gap-5 border-border border-b px-4">
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
								onClick={() => setActive(name)}
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
			<div className="relative flex-1" style={dotGridMini}>
				<div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-b from-transparent to-bg" />
				<div className="flex gap-3 p-4">
					<div className="h-[52px] w-[92px] rounded-[3px] border border-thread/45 bg-surface p-2">
						<div className="h-1.5 w-[54%] rounded-[1px] bg-raised" />
						<div className="mt-2 space-y-1">
							<Bar w="82%" />
							<Bar w="60%" />
						</div>
					</div>
					<div className="h-[52px] w-[92px] rounded-[3px] border border-border-raised bg-surface p-2">
						<div className="h-1.5 w-[70%] rounded-[1px] bg-raised" />
						<div className="mt-2 h-4 w-full rounded-[1px] bg-thread/50" />
					</div>
					<div className="h-[52px] w-[92px] rounded-[3px] border border-border-raised bg-surface p-2">
						<div className="space-y-1">
							<Bar w="88%" />
							<Bar w="66%" />
							<Bar w="74%" />
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

/* ---------- 6. walkthrough ---------- */

const CLIP_LENGTH = 134; // 2:14

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
				<div className="w-[46%] shrink-0 border-border border-r bg-canvas p-4">
					<div className="space-y-2">
						{["68%", "44%", "80%", "56%", "72%", "38%"].map((w, i) => (
							<div key={w + String(i)} className="flex items-center gap-2">
								<span className="h-[3px] w-2 rounded-full bg-border-raised/70" />
								<div className="h-[3px] rounded-full bg-border-raised" style={{ width: w }} />
							</div>
						))}
						<div className="flex items-center gap-2">
							<span className="h-[3px] w-2 rounded-full bg-border-raised/70" />
							<div className="h-[3px] w-[30%] rounded-full bg-border-raised" />
							<motion.span
								className="block h-3.5 w-[2px] bg-thread"
								animate={{ opacity: [1, 0.1] }}
								transition={{ duration: 0.7, repeat: Number.POSITIVE_INFINITY, repeatType: "reverse" }}
							/>
						</div>
					</div>
				</div>
				<div className="flex-1 p-5" style={dotGridMini}>
					<div className="h-3.5 w-[68%] rounded-[2px] bg-raised" />
					<div className="mt-2 h-3.5 w-[44%] rounded-[2px] bg-raised" />
					<div className="mt-5 flex gap-2">
						<span className="w-px self-stretch bg-thread/60" />
						<div className="space-y-2 py-0.5">
							<Bar w={78} />
							<Bar w={56} />
						</div>
					</div>
					<div className="mt-6 h-6 w-[76px] rounded-[3px] bg-thread/75" />
				</div>
			</div>
		);
	}
	if (index === 2) {
		return (
			<div className="relative h-full w-full" style={dotGridMini}>
				{[40, 190, 340].map((lx, i) => (
					<div
						key={lx}
						className={cn(
							"absolute overflow-hidden rounded-[4px] border bg-surface p-2.5",
							i === 1 ? "border-thread/60" : "border-border-raised",
						)}
						style={{ left: lx, top: 44, width: 118, height: 132 }}
					>
						<div className="h-2 w-[62%] rounded-[1px] bg-raised" />
						<div className="mt-2.5 space-y-1.5">
							<Bar w="86%" />
							<Bar w="64%" />
							<Bar w="72%" />
						</div>
						<div className="mt-4 h-4 w-full rounded-[2px] bg-thread/60" />
					</div>
				))}
				<svg
					className="pointer-events-none absolute inset-0 overflow-visible"
					aria-hidden="true"
					fill="none"
					width="100%"
					height="100%"
				>
					<path d="M162 110 L 186 110" stroke="var(--color-thread)" strokeWidth="1.4" />
					<path d="M312 110 L 336 110" stroke="var(--color-thread)" strokeWidth="1.4" />
				</svg>
			</div>
		);
	}
	return (
		<div className="flex h-full w-full flex-col justify-center gap-2.5 bg-canvas px-8 font-mono text-[13px] leading-[22px]">
			<div>
				<span className="text-muted">~ $ </span>
				<span className="text-text">npm i -g spool.page</span>
			</div>
			<div className="text-muted/70">added 1 package in 4s</div>
			<div className="mt-1">
				<span className="text-muted">~/tvarso $ </span>
				<span className="text-text">spool init</span>
			</div>
			<div className="text-muted/70">design/ scaffolded · project registered</div>
			<div className="text-thread">opening localhost:7766</div>
		</div>
	);
}

export function WalkthroughDoc() {
	const reduce = useReducedMotion() === true;
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
		<div className="flex h-full w-full flex-col overflow-hidden bg-bg">
			<div className="relative flex-1 overflow-hidden border-border border-b">
				<ClipScene index={scene} />
				<button
					type="button"
					aria-label={playing ? "Pause the walkthrough" : "Play the walkthrough"}
					onClick={() => setPlaying((p) => !p)}
					className={cn(
						"absolute inset-0 flex cursor-pointer items-center justify-center transition-colors duration-300 focus-visible:outline-none",
						playing ? "bg-bg/0 hover:bg-bg/25" : "bg-bg/70",
					)}
				>
					<motion.span
						className="flex h-16 w-16 items-center justify-center rounded-full border border-thread/60 bg-bg/85"
						animate={{ opacity: playing ? 0 : 1, scale: playing ? 0.9 : 1 }}
						whileHover={{ scale: playing ? 0.9 : 1.06 }}
						transition={{ duration: 0.24, ease: EASE }}
					>
						<svg viewBox="0 0 12 12" fill="currentColor" aria-hidden="true" className="h-4 w-4 text-thread">
							<path d="M3.4 1.8 9.4 6 3.4 10.2Z" />
						</svg>
					</motion.span>
				</button>
			</div>
			<div className="flex h-[62px] shrink-0 items-center gap-4 px-5">
				<span className="font-mono text-[11px] text-muted tabular-nums">
					{timecode(at)} / {timecode(CLIP_LENGTH)}
				</span>
				<div className="relative h-[3px] flex-1 rounded-full bg-border-raised">
					<div
						className="absolute inset-y-0 left-0 rounded-full bg-thread"
						style={{
							width: `${(at / CLIP_LENGTH) * 100}%`,
							transition: reduce ? undefined : "width 200ms linear",
						}}
					/>
					{CHAPTERS.map((c) => (
						<span
							key={c.at}
							className="absolute top-[-3px] h-[9px] w-px bg-bg"
							style={{ left: `${(c.at / CLIP_LENGTH) * 100}%` }}
						/>
					))}
				</div>
				<span className="w-[168px] text-right font-mono text-[11px] text-muted/70">
					{chapter === undefined ? "" : chapter.label}
				</span>
			</div>
		</div>
	);
}

/* ---------- 7. design ---------- */

export const PAGES: readonly { name: string; count: number }[] = [
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
	{ x: 24, y: 22, w: 96, h: 62 },
	{ x: 134, y: 22, w: 74, h: 62 },
	{ x: 222, y: 30, w: 110, h: 54, lit: true },
	{ x: 24, y: 98, w: 60, h: 78 },
	{ x: 98, y: 98, w: 110, h: 78 },
	{ x: 222, y: 98, w: 86, h: 46 },
	{ x: 222, y: 158, w: 86, h: 60 },
	{ x: 24, y: 190, w: 82, h: 54 },
	{ x: 120, y: 190, w: 88, h: 54 },
	{ x: 322, y: 30, w: 64, h: 88 },
	{ x: 322, y: 132, w: 64, h: 42 },
	{ x: 322, y: 188, w: 64, h: 56 },
];

export function DesignDoc() {
	return (
		<div className="flex h-full w-full overflow-hidden bg-bg">
			<div className="flex w-[248px] shrink-0 flex-col border-border border-r">
				<div className="flex h-10 shrink-0 items-center gap-2 border-border border-b px-4">
					<span className="font-semibold text-base">Pages</span>
					<span className="font-mono text-muted text-xs">13</span>
				</div>
				<div className="flex-1 py-1.5">
					{PAGES.map((p) => (
						<div
							key={p.name}
							className={cn(
								"relative flex h-[27px] items-center gap-2 px-4",
								p.name === "site" && "bg-surface",
							)}
						>
							{p.name === "site" ? (
								<span className="absolute top-1 bottom-1 left-0 w-[2px] rounded-full bg-thread" />
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
			<div className="relative flex flex-1 flex-col">
				<div className="flex h-10 shrink-0 items-center justify-between border-border border-b px-5 font-mono text-[11px]">
					<span className="text-muted">~/code/spool/design</span>
					<span className="text-muted/60">160 frames · 13 pages</span>
				</div>
				<div className="relative flex-1" style={dotGridMini}>
					{TILES.map((t) => (
						<div
							key={`${t.x}-${t.y}`}
							className={cn(
								"absolute rounded-[3px] border bg-surface p-1.5",
								t.lit === true ? "border-thread/55" : "border-border-raised",
							)}
							style={{ left: t.x, top: t.y, width: t.w, height: t.h }}
						>
							<div className="h-1.5 w-[56%] rounded-[1px] bg-raised" />
							<div className="mt-1.5 space-y-1">
								<Bar w="82%" />
								<Bar w="58%" />
							</div>
							{t.lit === true ? <div className="mt-2 h-2 w-[40%] rounded-[1px] bg-thread/60" /> : null}
						</div>
					))}
					<p className="absolute right-5 bottom-4 w-[196px] text-right text-[12px] text-muted leading-[19px]">
						This page is one of them.
					</p>
				</div>
			</div>
		</div>
	);
}

/* ---------- 8. license ---------- */

export function LicenseDoc() {
	return (
		<div className="flex h-full w-full flex-col justify-between bg-bg p-9">
			<div>
				<h2 className="font-semibold text-[42px] leading-[1] tracking-[-0.02em]">MIT</h2>
				<p className="mt-3 max-w-[420px] text-[17px] text-muted leading-[26px]">
					Fork it, rework it, rename it, ship it. It is a tool for designing things, so make it your own.
				</p>
			</div>
			<a
				href="https://github.com/liamvinberg/spool"
				className="inline-flex w-fit items-center gap-1.5 font-mono text-text text-xs transition-colors duration-200 hover:text-thread"
			>
				github.com/liamvinberg/spool
				<ArrowUpRight className="h-3 w-3 opacity-70" />
			</a>
		</div>
	);
}
