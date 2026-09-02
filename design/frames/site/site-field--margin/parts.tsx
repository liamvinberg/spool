import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../../../shared/lib/utils";
import { SpoolMark } from "../../../shared/ui/spool-mark";

/**
 * site-field--margin, the neighbours. Each of these is one small frame standing
 * on the field beside the paragraph it belongs to, 372 wide, drawn at 100%
 * because the camera in this take never zooms.
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
	backgroundSize: "11px 11px",
};

/* ---------- primitives ---------- */

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

/* ---------- the neighbours ---------- */

export function TerminalArtifact() {
	return (
		<div className="flex h-full w-full flex-col justify-center gap-1.5 bg-canvas px-5 font-mono text-[12px] leading-[21px]">
			<div>
				<span className="text-muted">~ $ </span>
				<span className="text-text">npm i -g spool.page</span>
			</div>
			<div className="text-muted/70">added 1 package in 4s</div>
			<div className="mt-1.5">
				<span className="text-muted">~/tvarso $ </span>
				<span className="text-text">spool init</span>
			</div>
			<div className="text-muted/70">design/ scaffolded</div>
			<div className="text-muted/70">project registered</div>
			<div className="mt-1.5 flex items-center gap-1.5 text-thread">
				opening localhost:7766
				<motion.span
					className="block h-3 w-[2px] bg-thread"
					animate={{ opacity: [1, 0.1] }}
					transition={{ duration: 0.75, repeat: Number.POSITIVE_INFINITY, repeatType: "reverse" }}
				/>
			</div>
		</div>
	);
}

export function MacArtifact() {
	return (
		<div className="flex h-full w-full flex-col bg-bg p-4">
			<div className="flex-1 overflow-hidden rounded-[5px] border border-border bg-canvas">
				<div className="flex h-5 items-center gap-1.5 border-border border-b bg-bg px-2">
					<span className="h-1.5 w-1.5 rounded-full bg-raised" />
					<span className="h-1.5 w-1.5 rounded-full bg-raised" />
					<span className="h-1.5 w-1.5 rounded-full bg-raised" />
					<span className="ml-2 font-mono text-[8px] text-muted/80">Spool</span>
				</div>
				<div className="relative h-full" style={dotGridMini}>
					<div className="absolute top-3 left-3 h-[52px] w-[86px] rounded-[3px] border border-border-raised bg-surface p-1.5">
						<div className="h-1.5 w-[58%] rounded-[1px] bg-raised" />
						<div className="mt-1.5 space-y-1">
							<Bar w="80%" />
							<Bar w="54%" />
						</div>
					</div>
					<div className="absolute top-[74px] left-[112px] h-[46px] w-[74px] rounded-[3px] border border-thread/50 bg-surface p-1.5">
						<div className="h-1.5 w-[50%] rounded-[1px] bg-raised" />
						<div className="mt-1.5 h-3 w-full rounded-[1px] bg-thread/60" />
					</div>
					<div className="absolute top-4 left-[210px] h-[62px] w-[62px] rounded-[3px] border border-border-raised bg-surface p-1.5">
						<div className="space-y-1">
							<Bar w="86%" />
							<Bar w="66%" />
							<Bar w="74%" />
						</div>
					</div>
				</div>
			</div>
			<div className="mt-3 flex shrink-0 items-center justify-between font-mono text-[10px] text-muted/70">
				<span>Spool.dmg · 92 MB</span>
				<span>Apple silicon and Intel</span>
			</div>
		</div>
	);
}

export function EmptyArtifact() {
	return (
		<div className="flex h-full w-full flex-col overflow-hidden bg-bg">
			<div className="flex h-7 shrink-0 items-center gap-2.5 border-border border-b px-2.5">
				<SpoolMark className="h-3 w-2.5 text-thread" />
				<span className="flex h-4 items-center rounded-xs border border-border-raised bg-raised px-1.5 font-mono text-[9px] text-text">
					tvarso
				</span>
				<PlusGlyph className="h-2 w-2 text-muted" />
			</div>
			<div className="flex min-h-0 flex-1">
				<div className="w-[104px] shrink-0 border-border border-r">
					<div className="flex h-6 items-center gap-1.5 border-border border-b px-2.5">
						<span className="font-semibold text-[10px]">Pages</span>
						<span className="font-mono text-[9px] text-muted">0</span>
					</div>
					<div className="px-2.5 py-1.5 font-mono text-[9px] text-muted/60">no pages yet</div>
				</div>
				<div className="relative flex flex-1 flex-col items-center justify-center gap-2" style={dotGridMini}>
					<SpoolMark className="h-5 w-4 text-thread opacity-30" />
					<span className="font-mono text-[11px] text-muted/70">no frames yet</span>
					<span className="font-mono text-[9px] text-muted/45">design/frames is empty</span>
				</div>
			</div>
		</div>
	);
}

const DISK: readonly { name: string; note?: string }[] = [
	{ name: "ferry-booking" },
	{ name: "kaffe" },
	{ name: "notes-cli" },
	{ name: "tvarso", note: "design/" },
	{ name: "spool", note: "design/" },
];

export function PickerArtifact() {
	const [hover, setHover] = useState("tvarso");
	return (
		<div className="flex h-full w-full flex-col bg-bg">
			<div className="flex h-9 shrink-0 items-center gap-2 border-border border-b px-3">
				<FolderGlyph className="h-3 w-3 shrink-0 text-muted" />
				<span className="font-mono text-xs text-text">~/code</span>
				<span className="ml-auto font-mono text-[9px] text-muted/60">5 folders</span>
			</div>
			<div className="flex-1 py-1">
				{DISK.map((row) => {
					const on = row.name === hover;
					return (
						<button
							type="button"
							key={row.name}
							onPointerEnter={() => setHover(row.name)}
							onFocus={() => setHover(row.name)}
							className={cn(
								"flex h-9 w-full cursor-pointer items-center gap-2 px-3 text-left transition-colors duration-150 focus-visible:outline-none",
								on && "bg-surface",
							)}
						>
							<FolderGlyph className={cn("h-3 w-3 shrink-0", on ? "text-thread" : "text-muted")} />
							<span className={cn("font-mono text-xs", on ? "text-text" : "text-muted")}>
								{row.name}/
							</span>
							{row.note === undefined ? null : (
								<span
									className={cn(
										"ml-auto rounded-xs px-1.5 py-[1px] font-mono text-[9px] transition-colors duration-150",
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
			<div className="shrink-0 border-border border-t px-3 py-2 font-mono text-[9px] text-muted/60">
				↑↓ move · ⏎ open
			</div>
		</div>
	);
}

const TABS = ["spool", "tvarso", "kaffe", "ferry"] as const;

export function BarArtifact() {
	const [active, setActive] = useState<string>("tvarso");
	return (
		<div className="flex h-full w-full flex-col overflow-hidden bg-bg">
			<div className="flex h-9 shrink-0 items-center gap-2.5 border-border border-b px-2.5">
				<SpoolMark className="h-3.5 w-2.5 text-thread" />
				<nav aria-label="Projects" className="flex items-center gap-0.5">
					{TABS.map((name) => {
						const on = name === active;
						return (
							<button
								type="button"
								key={name}
								aria-pressed={on}
								onClick={() => setActive(name)}
								className={cn(
									"flex h-5 cursor-pointer items-center rounded-xs px-2 font-mono text-[10px] transition-colors duration-150 focus-visible:outline-none",
									on ? "border border-border-raised bg-raised text-text" : "text-muted hover:text-text",
								)}
							>
								{name}
							</button>
						);
					})}
					<span className="flex h-5 w-5 items-center justify-center text-muted">
						<PlusGlyph className="h-2 w-2" />
					</span>
				</nav>
			</div>
			<div className="relative flex-1 p-3" style={dotGridMini}>
				<div className="flex gap-2">
					{[0, 1, 2].map((i) => (
						<div
							key={i}
							className={cn(
								"h-[74px] w-[104px] rounded-[3px] border p-2",
								i === 0 ? "border-thread/50 bg-surface" : "border-border-raised bg-surface/60",
							)}
						>
							<div className="h-1.5 w-[56%] rounded-[1px] bg-raised" />
							<div className="mt-2 space-y-1">
								<Bar w="82%" />
								<Bar w="60%" />
							</div>
							{i === 0 ? <div className="mt-2.5 h-2.5 w-[42px] rounded-[1px] bg-thread/70" /> : null}
						</div>
					))}
				</div>
				<p className="absolute right-3 bottom-2.5 font-mono text-[9px] text-muted/60">localhost:7766</p>
			</div>
		</div>
	);
}

const CLIP_LENGTH = 134;

const CHAPTERS: readonly { at: number; label: string }[] = [
	{ at: 0, label: "install and init" },
	{ at: 46, label: "the agent writes" },
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
				<div className="w-[46%] shrink-0 space-y-1.5 border-border border-r bg-canvas p-3">
					{["68%", "44%", "80%", "56%", "72%"].map((w, i) => (
						<div key={w + String(i)} className="flex items-center gap-1.5">
							<span className="h-[3px] w-1.5 rounded-full bg-border-raised/70" />
							<div className="h-[3px] rounded-full bg-border-raised" style={{ width: w }} />
						</div>
					))}
					<div className="flex items-center gap-1.5">
						<span className="h-[3px] w-1.5 rounded-full bg-border-raised/70" />
						<div className="h-[3px] w-[28%] rounded-full bg-border-raised" />
						<motion.span
							className="block h-3 w-[2px] bg-thread"
							animate={{ opacity: [1, 0.1] }}
							transition={{ duration: 0.7, repeat: Number.POSITIVE_INFINITY, repeatType: "reverse" }}
						/>
					</div>
				</div>
				<div className="flex-1 p-3.5" style={dotGridMini}>
					<div className="h-2.5 w-[70%] rounded-[2px] bg-raised" />
					<div className="mt-2 h-2.5 w-[46%] rounded-[2px] bg-raised" />
					<div className="mt-4 flex gap-2">
						<span className="w-px self-stretch bg-thread/60" />
						<div className="space-y-1.5 py-0.5">
							<Bar w={62} />
							<Bar w={44} />
						</div>
					</div>
					<div className="mt-4 h-4 w-[58px] rounded-[2px] bg-thread/75" />
				</div>
			</div>
		);
	}
	if (index === 2) {
		return (
			<div className="relative h-full w-full" style={dotGridMini}>
				{[22, 138, 254].map((lx, i) => (
					<div
						key={lx}
						className={cn(
							"absolute overflow-hidden rounded-[3px] border bg-surface p-2",
							i === 1 ? "border-thread/60" : "border-border-raised",
						)}
						style={{ left: lx, top: 26, width: 90, height: 104 }}
					>
						<div className="h-1.5 w-[62%] rounded-[1px] bg-raised" />
						<div className="mt-2 space-y-1">
							<Bar w="86%" />
							<Bar w="64%" />
						</div>
						<div className="mt-3 h-3 w-full rounded-[1px] bg-thread/60" />
					</div>
				))}
				<svg
					className="pointer-events-none absolute inset-0 overflow-visible"
					aria-hidden="true"
					fill="none"
					width="100%"
					height="100%"
				>
					<path d="M118 78 L 134 78" stroke="var(--color-thread)" strokeWidth="1.3" />
					<path d="M234 78 L 250 78" stroke="var(--color-thread)" strokeWidth="1.3" />
				</svg>
			</div>
		);
	}
	return (
		<div className="flex h-full w-full flex-col justify-center gap-1.5 bg-canvas px-5 font-mono text-[11px] leading-[19px]">
			<div>
				<span className="text-muted">~ $ </span>
				<span className="text-text">npm i -g spool.page</span>
			</div>
			<div className="text-muted/70">added 1 package in 4s</div>
			<div>
				<span className="text-muted">~/tvarso $ </span>
				<span className="text-text">spool init</span>
			</div>
			<div className="text-thread">opening localhost:7766</div>
		</div>
	);
}

export function WatchArtifact() {
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
					onClick={() => setPlaying((p) => !p)}
					className={cn(
						"absolute inset-0 flex cursor-pointer items-center justify-center transition-colors duration-300 focus-visible:outline-none",
						playing ? "bg-bg/0 hover:bg-bg/25" : "bg-bg/70",
					)}
				>
					<motion.span
						className="flex h-12 w-12 items-center justify-center rounded-full border border-thread/60 bg-bg/85"
						animate={{ opacity: playing ? 0 : 1, scale: playing ? 0.9 : 1 }}
						whileHover={{ scale: playing ? 0.9 : 1.06 }}
						transition={{ duration: 0.24, ease: EASE }}
					>
						<svg viewBox="0 0 12 12" fill="currentColor" aria-hidden="true" className="h-3 w-3 text-thread">
							<path d="M3.4 1.8 9.4 6 3.4 10.2Z" />
						</svg>
					</motion.span>
				</button>
			</div>
			<div className="flex h-[42px] shrink-0 items-center gap-3 px-3.5">
				<span className="font-mono text-[10px] text-muted tabular-nums">
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
				<span className="w-[104px] truncate text-right font-mono text-[10px] text-muted/70">
					{chapter === undefined ? "" : chapter.label}
				</span>
			</div>
		</div>
	);
}

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

export function DesignArtifact() {
	return (
		<div className="flex h-full w-full flex-col overflow-hidden bg-bg">
			<div className="flex h-8 shrink-0 items-center justify-between border-border border-b px-3 font-mono text-[10px]">
				<span className="text-muted">~/code/spool/design</span>
				<span className="text-muted/60">160 · 13</span>
			</div>
			<div className="min-h-0 flex-1 py-1">
				{PAGES.map((p) => (
					<div
						key={p.name}
						className={cn(
							"relative flex h-[21px] items-center gap-1.5 px-3",
							p.name === "site" && "bg-surface",
						)}
					>
						{p.name === "site" ? (
							<span className="absolute top-1 bottom-1 left-0 w-[2px] rounded-full bg-thread" />
						) : null}
						<FolderGlyph
							className={cn("h-3 w-3 shrink-0", p.name === "site" ? "text-thread" : "text-muted/70")}
						/>
						<span
							className={cn(
								"min-w-0 flex-1 truncate font-mono text-[11px]",
								p.name === "site" ? "text-text" : "text-muted",
							)}
						>
							{p.name}
						</span>
						<span className="font-mono text-[10px] text-muted/55 tabular-nums">{p.count}</span>
					</div>
				))}
			</div>
		</div>
	);
}

export function RepoArtifact() {
	return (
		<div className="flex h-full w-full flex-col justify-between bg-bg p-4">
			<div className="flex items-baseline gap-2">
				<span className="font-mono text-[11px] text-muted">LICENSE.md</span>
				<span className="font-mono text-[11px] text-thread">MIT</span>
			</div>
			<div className="space-y-1.5 font-mono text-[10px] text-muted/60 leading-[16px]">
				<div>Permission is hereby granted, free of charge,</div>
				<div>to any person obtaining a copy of this software</div>
				<div>and associated documentation files ...</div>
			</div>
			<a
				href="https://github.com/liamvinberg/spool"
				className="inline-flex items-center gap-1.5 font-mono text-[11px] text-text transition-colors duration-200 hover:text-thread"
			>
				github.com/liamvinberg/spool
				<ArrowUpRight className="h-2.5 w-2.5 opacity-70" />
			</a>
		</div>
	);
}
