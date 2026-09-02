import { motion, useReducedMotion } from "motion/react";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { cn } from "../../../shared/lib/utils";
import { SpoolMark } from "../../../shared/ui/spool-mark";
import { REAL_FRAME_TOTAL, TIDY_PAGES } from "../../../shared/ui/spool-real-pages";

/**
 * site-desk--disk. The Mac app argued from the disk it opens.
 *
 * The other takes sell the app as a thing you download. This one sells what
 * happens after: you press "+", you pick a folder you already have, and that
 * folder grows a design/ next to its src/. So the page is built as a seam. The
 * left of the hero is the filesystem, the right is the window looking at it, and
 * one thread crosses the gutter from a file row to the frame that file is. Every
 * section below reads the same way, disk on the left and the app on the right,
 * so the reader never loses which side of the seam a thing lives on.
 *
 * The proof at the bottom is this repository. TIDY_PAGES is spool's own
 * design/frames read off disk: twelve pages, 142 frames, every cover that page's
 * real canvas. A tool that designs itself is the only demo that cannot be staged.
 *
 * Scrolls inside the 1440x900 stage. Sections arrive on scroll with opacity and
 * a small rise, nothing that moves layout.
 */

const EASE = [0.22, 1, 0.36, 1] as const;

const dotGrid: CSSProperties = {
	backgroundImage:
		"radial-gradient(circle, color-mix(in srgb, var(--color-text) 10%, transparent) 1px, transparent 1px)",
	backgroundSize: "24px 24px",
	backgroundPosition: "-1px -1px",
};

const windowDepth: CSSProperties = {
	boxShadow: [
		"0 2px 2px rgba(0,0,0,0.28)",
		"0 20px 40px rgba(0,0,0,0.42)",
		"0 60px 120px -20px rgba(0,0,0,0.72)",
		"inset 0 1px 0 rgba(255,255,255,0.06)",
	].join(","),
};

/* ── glyphs ───────────────────────────────────────────────────────────── */

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

function FileGlyph({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 14 14" className={className} fill="none" aria-hidden="true">
			<path d="M3 1.75h5l3 3v7.5H3z" stroke="currentColor" strokeWidth="1.15" strokeLinejoin="round" />
			<path d="M8 1.75v3h3" stroke="currentColor" strokeWidth="1.15" strokeLinejoin="round" />
		</svg>
	);
}

function DownGlyph({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 14 14" className={className} fill="none" aria-hidden="true">
			<path
				d="M7 2v7.2M3.9 6.4 7 9.5l3.1-3.1M2.6 12h8.8"
				stroke="currentColor"
				strokeWidth="1.35"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function Tick({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 12 12" fill="none" aria-hidden="true" className={className}>
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
		<svg viewBox="0 0 12 12" fill="none" aria-hidden="true" className={className}>
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

async function copyText(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		return false;
	}
}

function CommandLine({ prompt, command }: { prompt: string; command: string }) {
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
			onClick={() => {
				void copyText(command).then((ok) => {
					if (!ok) return;
					setCopied(true);
					if (timer.current !== null) window.clearTimeout(timer.current);
					timer.current = window.setTimeout(() => setCopied(false), 1500);
				});
			}}
			aria-label={copied ? `Copied ${command}` : `Copy ${command}`}
			className="group/cmd flex w-full cursor-pointer items-center gap-2 text-left font-mono text-[13px] leading-6 focus-visible:outline-none"
		>
			<span className="select-none text-muted/80">{prompt}</span>
			<span className="text-text">{command}</span>
			<span className="relative ml-auto block h-3 w-3 shrink-0">
				<CopyGlyph
					className={cn(
						"absolute inset-0 text-muted opacity-0 transition-opacity duration-150",
						copied ? "" : "group-hover/cmd:opacity-100",
					)}
				/>
				<Tick
					className={cn(
						"absolute inset-0 text-thread transition-opacity duration-150",
						copied ? "opacity-100" : "opacity-0",
					)}
				/>
			</span>
		</button>
	);
}

/* ── arrive-on-scroll, opacity and rise only ──────────────────────────── */

function Arrive({
	children,
	delay = 0,
	className,
}: {
	children: React.ReactNode;
	delay?: number;
	className?: string;
}) {
	const reduce = useReducedMotion() === true;
	if (reduce) return <div className={className}>{children}</div>;
	return (
		<motion.div
			className={className}
			initial={{ opacity: 0, y: 18 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, amount: 0.25 }}
			transition={{ duration: 0.55, ease: EASE, delay }}
		>
			{children}
		</motion.div>
	);
}

/* ── the left of the seam: the disk ───────────────────────────────────── */

interface DiskRow {
	depth: number;
	name: string;
	kind: "dir" | "file";
	open?: boolean;
	tone?: "thread" | "on";
	note?: string;
}

const DISK: readonly DiskRow[] = [
	{ depth: 0, name: "projects", kind: "dir", open: true },
	{ depth: 1, name: "kaffe", kind: "dir" },
	{ depth: 1, name: "ledger", kind: "dir" },
	{ depth: 1, name: "tvarso", kind: "dir", open: true },
	{ depth: 2, name: "src", kind: "dir" },
	{ depth: 2, name: "design", kind: "dir", open: true, tone: "thread", note: "spool wrote this one" },
	{ depth: 3, name: "frames", kind: "dir", open: true },
	{ depth: 4, name: "checkout", kind: "dir", open: true },
	{ depth: 5, name: "cart", kind: "dir", open: true },
	{ depth: 6, name: "frame.tsx", kind: "file", tone: "on" },
	{ depth: 5, name: "pay", kind: "dir" },
	{ depth: 5, name: "receipt", kind: "dir" },
	{ depth: 3, name: "shared", kind: "dir" },
	{ depth: 2, name: "package.json", kind: "file" },
];

const ROW_H = 25;

function DiskTree() {
	return (
		<div className="w-[368px] select-none">
			<div className="flex items-center gap-2 pb-3 font-mono text-[11px] text-muted leading-none">
				<span className="text-text">~</span>
				<span className="h-px flex-1 bg-border" />
				<span>your disk</span>
			</div>
			<div className="relative">
				{DISK.map((row, i) => (
					<div
						key={`${row.depth}-${row.name}`}
						className={cn(
							"relative flex items-center gap-1.5 rounded-[4px] pr-2",
							row.tone === "on" && "bg-raised",
						)}
						style={{ height: ROW_H, paddingLeft: 4 + row.depth * 15 }}
					>
						<span
							className={cn(
								"w-2 shrink-0 text-center text-[7px] leading-none",
								row.tone === "thread" ? "text-thread" : "text-muted/50",
							)}
						>
							{row.kind === "dir" ? (row.open === true ? "▾" : "▸") : ""}
						</span>
						{row.kind === "dir" ? (
							<FolderGlyph
								className={cn(
									"h-3.5 w-3.5 shrink-0",
									row.tone === "thread" ? "text-thread" : "text-muted",
								)}
							/>
						) : (
							<FileGlyph
								className={cn("h-3.5 w-3.5 shrink-0", row.tone === "on" ? "text-thread" : "text-muted")}
							/>
						)}
						<span
							className={cn(
								"font-mono text-[12px] leading-none",
								row.tone === "thread" && "text-thread",
								row.tone === "on" && "text-text",
								row.tone === undefined && "text-muted",
							)}
						>
							{row.name}
							{row.kind === "dir" ? "/" : ""}
						</span>
						{row.note === undefined ? null : (
							<span className="ml-2 font-mono text-[10px] text-thread/70 leading-none">{row.note}</span>
						)}
						{i === 0 ? null : null}
					</div>
				))}
			</div>
		</div>
	);
}

/* ── the right of the seam: the window, cropped by the page edge ──────── */

function Bar({ w, className }: { w: string | number; className?: string }) {
	return <div className={cn("h-[3px] rounded-full bg-border-raised", className)} style={{ width: w }} />;
}

function CartWire() {
	return (
		<div className="flex h-full flex-col p-3">
			<div className="h-2 w-[58%] rounded-[1px] bg-raised" />
			<div className="mt-3 space-y-2.5">
				{[0, 1, 2].map((row) => (
					<div key={row} className="flex items-center gap-2">
						<span className="h-6 w-6 shrink-0 rounded-[3px] bg-raised" />
						<div className="flex-1 space-y-1.5">
							<Bar w={row === 1 ? "58%" : "76%"} />
							<Bar w="32%" />
						</div>
					</div>
				))}
			</div>
			<div className="mt-auto space-y-2">
				<div className="flex items-center justify-between">
					<Bar w={26} />
					<Bar w={34} className="bg-text/40" />
				</div>
				<span className="block h-[18px] w-full rounded-[3px] bg-thread/80" />
			</div>
		</div>
	);
}

function HeroWindow() {
	return (
		<div
			className="flex h-[556px] w-[800px] flex-col overflow-hidden rounded-l-[11px] border border-white/10 border-r-0 bg-bg"
			style={windowDepth}
		>
			<div className="relative flex h-[36px] shrink-0 items-center border-border border-b bg-surface px-3.5">
				<div className="flex items-center gap-2">
					{["#FF5F57", "#FEBC2E", "#28C840"].map((fill) => (
						<span key={fill} className="block h-[11px] w-[11px] rounded-full" style={{ background: fill }} />
					))}
				</div>
				<div className="ml-5 flex items-center gap-1.5">
					<FolderGlyph className="h-3 w-3 text-muted" />
					<span className="font-medium text-[12px] leading-none">tvarso</span>
				</div>
					<span className="ml-4 font-mono text-[10px] text-muted leading-none">~/projects/tvarso</span>
			</div>
			<div className="relative min-h-0 flex-1 overflow-hidden bg-canvas" style={dotGrid}>
				{/* the frame the highlighted file on the left renders as */}
				<div className="absolute" style={{ left: 96, top: 118, width: 196 }}>
					<div className="mb-1.5 flex items-center gap-1.5 font-mono text-[11px] leading-none">
						<span className="text-[8px] text-thread">▶</span>
						<span className="text-thread">cart</span>
					</div>
					<div className="relative">
						<div
							className="overflow-hidden rounded-[5px] border border-border bg-canvas"
							style={{ width: 196, height: 244 }}
						>
							<CartWire />
						</div>
						<span className="-inset-[3px] pointer-events-none absolute rounded-[8px] border-[1.5px] border-thread" />
						{[
							"-left-[7px] -top-[7px]",
							"-right-[7px] -top-[7px]",
							"-left-[7px] -bottom-[7px]",
							"-right-[7px] -bottom-[7px]",
						].map((pos) => (
							<span
								key={pos}
								className={cn(
									"absolute h-2 w-2 rounded-[1.5px] border-[1.5px] border-thread bg-on-thread",
									pos,
								)}
							/>
						))}
					</div>
				</div>
				<div className="absolute" style={{ left: 372, top: 96, width: 168 }}>
					<div className="mb-1.5 font-mono text-[11px] text-muted leading-none">▸ pay</div>
					<div
						className="space-y-2 overflow-hidden rounded-[5px] border border-border bg-canvas p-3"
						style={{ height: 206 }}
					>
						<div className="h-2 w-[44%] rounded-[1px] bg-raised" />
						{["78%", "56%", "68%"].map((w) => (
							<div key={w} className="rounded-[3px] border border-border-raised px-2 py-1.5">
								<Bar w={w} />
							</div>
						))}
						<span className="mt-2 block h-[18px] w-full rounded-[3px] border border-border-raised" />
					</div>
				</div>
				<div className="absolute" style={{ left: 372, top: 342, width: 168 }}>
					<div className="mb-1.5 font-mono text-[11px] text-muted leading-none">▸ receipt</div>
					<div
						className="flex flex-col items-center justify-center gap-2.5 overflow-hidden rounded-[5px] border border-border bg-canvas"
						style={{ height: 116 }}
					>
						<span className="flex h-7 w-7 items-center justify-center rounded-full border border-thread/60 text-thread">
							<Tick className="h-3.5 w-3.5" />
						</span>
						<Bar w={54} />
					</div>
				</div>
				<svg
					className="pointer-events-none absolute top-0 left-0 overflow-visible"
					width={800}
					height={520}
					fill="none"
					aria-hidden="true"
				>
					<path
						d="M 292 200 C 336 200, 336 168, 362 168"
						stroke="var(--color-thread)"
						strokeWidth="1.5"
						strokeLinecap="round"
						opacity="0.85"
					/>
					<path d="M 372 168 L 360 163 L 360 173 Z" fill="var(--color-thread)" opacity="0.85" />
					<path
						d="M 292 300 C 330 300, 330 396, 362 396"
						stroke="var(--color-thread)"
						strokeWidth="1.5"
						strokeLinecap="round"
						opacity="0.85"
					/>
					<path d="M 372 396 L 360 391 L 360 401 Z" fill="var(--color-thread)" opacity="0.85" />
				</svg>
			</div>
		</div>
	);
}

/** the one line that crosses the gutter: this file is that frame. */
function Seam() {
	const reduce = useReducedMotion() === true;
	return (
		<svg
			className="pointer-events-none absolute top-0 left-0 overflow-visible"
			width={1440}
			height={900}
			fill="none"
			aria-hidden="true"
		>
			<motion.path
				d="M 446 681 C 570 681, 610 545, 776 545"
				stroke="var(--color-thread)"
				strokeWidth="1.25"
				strokeDasharray="4 5"
				strokeLinecap="round"
				initial={reduce ? { opacity: 0.75 } : { opacity: 0 }}
				animate={{ opacity: 0.75 }}
				transition={{ duration: 0.6, ease: EASE, delay: 0.35 }}
			/>
			<motion.path
				d="M 786 545 L 774 540 L 774 550 Z"
				fill="var(--color-thread)"
				initial={reduce ? { opacity: 0.75 } : { opacity: 0 }}
				animate={{ opacity: 0.75 }}
				transition={{ duration: 0.4, ease: EASE, delay: 0.75 }}
			/>
			<circle cx="446" cy="681" r="3" fill="var(--color-thread)" />
		</svg>
	);
}

/* ── section 2: several projects, as a ruled table ────────────────────── */

interface ProjectRow {
	name: string;
	path: string;
	pages: string;
	frames: string;
	on?: boolean;
}

const PROJECTS: readonly ProjectRow[] = [
	{ name: "tvarso", path: "~/projects/tvarso", pages: "3 pages", frames: "12 frames", on: true },
	{ name: "kaffe", path: "~/projects/kaffe", pages: "1 page", frames: "6 frames" },
	{ name: "ledger", path: "~/work/ledger", pages: "5 pages", frames: "38 frames" },
	{ name: "spool", path: "~/projects/spool", pages: "12 pages", frames: "142 frames" },
];

function ProjectsTable() {
	return (
		<div className="w-full">
			<div className="flex items-center gap-1.5 rounded-t-[8px] border border-border bg-surface px-2.5 py-2">
				{PROJECTS.map((project) => (
					<span
						key={project.name}
						className={cn(
							"rounded-[5px] px-3 py-1.5 font-mono text-[12px] leading-none",
							project.on === true ? "bg-raised text-text" : "text-muted",
						)}
					>
						{project.name}
					</span>
				))}
				<span className="flex h-[26px] w-[26px] items-center justify-center rounded-[5px] text-muted">
					<svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" aria-hidden="true">
						<path d="M6 2.25v7.5M2.25 6h7.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
					</svg>
				</span>
			</div>
			<div className="border-border border-x border-b">
				{PROJECTS.map((project) => (
					<div
						key={project.name}
						className="flex items-center gap-6 border-border border-b px-4 py-3.5 last:border-b-0"
					>
						<FolderGlyph
							className={cn("h-4 w-4 shrink-0", project.on === true ? "text-thread" : "text-muted")}
						/>
						<span
							className={cn(
								"w-[104px] shrink-0 font-medium text-[14px]",
								project.on === true ? "text-text" : "text-muted",
							)}
						>
							{project.name}
						</span>
						<span className="flex-1 font-mono text-[12px] text-muted">{project.path}</span>
						<span className="w-[76px] text-right font-mono text-[12px] text-muted">{project.pages}</span>
						<span className="w-[86px] text-right font-mono text-[12px] text-text">{project.frames}</span>
					</div>
				))}
			</div>
		</div>
	);
}

/* ── section 3: the commit ────────────────────────────────────────────── */

const LOG: readonly { sha: string; msg: string; on?: boolean }[] = [
	{ sha: "8f2a1c4", msg: "design: 3 frames, 1 page", on: true },
	{ sha: "2b90ee7", msg: "design: 1 frame" },
	{ sha: "c41d0aa", msg: "checkout: real totals" },
	{ sha: "9e07b31", msg: "design: 6 frames" },
];

function GitBlock() {
	return (
		<div className="overflow-hidden rounded-[10px] border border-border bg-surface">
			<div className="flex items-center gap-2 border-border border-b bg-canvas px-4 py-2.5">
				<span className="block h-1.5 w-1.5 rounded-full bg-thread" />
				<span className="font-mono text-[11px] text-muted leading-none">~/projects/tvarso</span>
			</div>
			<div className="space-y-1.5 px-4 py-4 font-mono text-[13px] leading-6">
				<div>
					<span className="text-muted">$ </span>
					<span className="text-text">git log --oneline -- design</span>
				</div>
				{LOG.map((line) => (
					<div key={line.sha} className="flex gap-3">
						<span className={line.on === true ? "text-thread" : "text-muted/70"}>{line.sha}</span>
						<span className={line.on === true ? "text-text" : "text-muted"}>{line.msg}</span>
					</div>
				))}
			</div>
		</div>
	);
}

/* ── section 4: spool's own design folder ─────────────────────────────── */

function DogfoodSheet() {
	return (
		<div className="grid grid-cols-6 gap-x-5 gap-y-7">
			{TIDY_PAGES.map((page) => (
				<div key={page.page}>
					<div
						className="flex items-center justify-center overflow-hidden rounded-[6px] border border-border bg-canvas"
						style={{ height: 118 }}
					>
						<img
							src={page.cover}
							alt={`the ${page.page} page`}
							className="max-h-full max-w-full object-contain"
						/>
					</div>
					<div className="mt-2 flex items-baseline justify-between gap-2">
						<span className="truncate font-mono text-[11px] text-text leading-none">{page.page}</span>
						<span className="shrink-0 font-mono text-[11px] text-muted leading-none">{page.count}</span>
					</div>
				</div>
			))}
		</div>
	);
}

/* ── section chrome ───────────────────────────────────────────────────── */

function SectionHead({ title, meta }: { title: string; meta: string }) {
	return (
		<div className="flex items-end justify-between gap-8 border-border border-b pb-4">
			<h2 className="max-w-[640px] font-semibold text-[34px] leading-[1.08] tracking-[-0.02em]">{title}</h2>
			<span className="shrink-0 pb-1.5 font-mono text-[11px] text-muted leading-none">{meta}</span>
		</div>
	);
}

/* ── the frame ────────────────────────────────────────────────────────── */

export default function SiteDeskDisk() {
	return (
		<div className="h-full w-full overflow-y-auto overflow-x-hidden bg-bg font-sans text-text antialiased [font-synthesis:none]">
			{/* ── hero: the seam ─────────────────────────────────────────── */}
			<section className="relative h-[900px] w-full overflow-hidden">
				<div
					className="pointer-events-none absolute inset-0"
					style={{
						background:
							"radial-gradient(900px 620px at 66% 62%, color-mix(in srgb, var(--color-thread) 11%, transparent), transparent 68%)",
					}}
				/>

				<header className="relative flex items-center justify-between px-[72px] pt-8">
					<div className="flex items-center gap-2.5">
						<SpoolMark className="h-[18px] w-[18px] text-thread" title="spool" />
						<span className="font-semibold text-md tracking-tight">spool</span>
					</div>
					<div className="flex items-center gap-7 font-mono text-[12px] text-muted">
						<span className="text-text">spool.page</span>
						<a href="https://github.com/liamvinberg/spool" className="hover:text-text">
							github
						</a>
						<a
							href="https://github.com/liamvinberg/spool/releases/latest/download/Spool.dmg"
							className="inline-flex items-center gap-2 rounded-md border border-thread/50 px-3 py-1.5 text-thread leading-none hover:bg-thread hover:text-on-thread"
						>
							<DownGlyph className="h-3 w-3" />
							Spool.dmg
						</a>
					</div>
				</header>

				<div className="relative px-[72px] pt-[52px]">
					<h1 className="max-w-[620px] font-semibold text-[54px] leading-[0.98] tracking-[-0.025em]">
						A folder you already have,
						<br />
						open in a window.
					</h1>
					<p className="mt-6 max-w-[500px] text-[16px] text-muted leading-[25px]">
						Press + in the app, pick any folder on your disk, and spool writes a design/ inside it. The
						frames are TSX files sitting next to your source, so your editor, your agent and git all see the
						same thing you do.
					</p>
				</div>

				<div className="absolute" style={{ left: 72, top: 396 }}>
					<DiskTree />
				</div>

				<div className="absolute" style={{ left: 700, top: 250 }}>
					<HeroWindow />
				</div>

				<Seam />

				<div className="absolute font-mono text-[11px] text-muted leading-5" style={{ left: 72, top: 826 }}>
					<span className="text-text">frame.tsx</span> on the left is <span className="text-text">cart</span>{" "}
					on the right. One file, one frame.
				</div>
			</section>

			{/* ── several projects ───────────────────────────────────────── */}
			<section className="px-[72px] pt-[120px]">
				<Arrive>
					<SectionHead title="Open as many as you like." meta="one window, one tab each" />
				</Arrive>
				<Arrive delay={0.06} className="mt-9 flex gap-14">
					<p className="w-[330px] shrink-0 text-[15px] text-muted leading-[25px]">
						Each project is a folder and a tab. Switching between them is switching folders, and the daemon
						behind the window keeps every one of them warm, so the canvas is already drawn when you come
						back to it.
					</p>
					<div className="min-w-0 flex-1">
						<ProjectsTable />
					</div>
				</Arrive>
			</section>

			{/* ── git ─────────────────────────────────────────────────────── */}
			<section className="px-[72px] pt-[130px]">
				<Arrive>
					<SectionHead title="The save is a commit." meta="45 seconds of quiet, then design: 3 frames" />
				</Arrive>
				<Arrive delay={0.06} className="mt-9 flex gap-14">
					<div className="w-[420px] shrink-0">
						<p className="text-[15px] text-muted leading-[25px]">
							Where a project keeps history, the daemon commits design/ for you once the folder has been
							quiet for a while. It builds the commit from its own index, so your staging area is exactly
							where you left it, and it never pushes.
						</p>
						<p className="mt-5 text-[15px] text-muted leading-[25px]">
							Everything the canvas knows lives in files. Geometry is a sidecar, tokens are one css file,
							and the daemon listens on localhost.
						</p>
					</div>
					<div className="min-w-0 flex-1">
						<GitBlock />
					</div>
				</Arrive>
			</section>

			{/* ── dogfood ─────────────────────────────────────────────────── */}
			<section className="px-[72px] pt-[130px]">
				<Arrive>
					<SectionHead
						title="spool is designed in spool."
						meta={`${TIDY_PAGES.length} pages · ${REAL_FRAME_TOTAL} frames`}
					/>
				</Arrive>
				<Arrive delay={0.06}>
					<p className="mt-8 max-w-[620px] text-[15px] text-muted leading-[25px]">
						This is spool's own design/ folder as it stands today. Every cover below is that page's real
						canvas, drawn from the frames on it, and every frame was authored by an agent and committed to
						the repository the app is built from.
					</p>
				</Arrive>
				<Arrive delay={0.12} className="mt-10">
					<DogfoodSheet />
				</Arrive>
			</section>

			{/* ── the two doors ───────────────────────────────────────────── */}
			<section className="px-[72px] pt-[130px] pb-[110px]">
				<Arrive>
					<div className="flex gap-14 border-border border-t pt-12">
						<div className="w-[480px] shrink-0">
							<h2 className="font-semibold text-[38px] leading-[1.04] tracking-[-0.02em]">
								Two doors, same daemon.
							</h2>
							<p className="mt-5 text-[15px] text-muted leading-[25px]">
								The app bundles the spool npm ships and starts it for you. Install the CLI as well and
								the app adopts the daemon it finds, so both hands drive one canvas.
							</p>
						</div>
						<div className="flex-1 pt-2">
							<a
								href="https://github.com/liamvinberg/spool/releases/latest/download/Spool.dmg"
								className="inline-flex items-center gap-2.5 rounded-md bg-thread px-4 py-3 font-medium text-[14px] text-on-thread leading-none transition-transform duration-200 ease-out hover:-translate-y-0.5"
							>
								<DownGlyph className="h-3.5 w-3.5" />
								Download Spool.dmg
							</a>
							<div className="mt-3 font-mono text-[11px] text-muted leading-5">
								Apple silicon, macOS 14 or later. 168 MB.
							</div>
							<div className="mt-7 flex gap-4">
								<span className="w-px shrink-0 self-stretch bg-thread/60" />
								<div className="w-[380px]">
									<CommandLine prompt="~ $" command="npm i -g spool.page" />
									<CommandLine prompt="~/projects/tvarso $" command="spool init" />
									<p className="mt-2 font-mono text-[11px] text-muted leading-5">
										Node 22 or later, and the canvas wants Chrome.
									</p>
								</div>
							</div>
						</div>
					</div>
				</Arrive>

				<Arrive delay={0.06}>
					<div className="mt-16 flex items-end justify-between border-border border-t pt-7">
						<div className="flex items-center gap-3">
							<SpoolMark className="h-4 w-4 text-thread" />
							<span className="text-[13px] text-muted">spool.page</span>
						</div>
						<div className="text-right">
							<div className="text-[14px] text-text">MIT</div>
							<div className="mt-1 text-[13px] text-muted">Fork it, rework it, rename it, ship it.</div>
						</div>
					</div>
				</Arrive>
			</section>
		</div>
	);
}
