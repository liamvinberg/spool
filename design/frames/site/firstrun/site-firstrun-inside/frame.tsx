import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type CSSProperties, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { cn } from "shared/lib/utils";
import { SpoolMark } from "shared/ui/spool/mark";

/**
 * site-firstrun--inside. The spool.page landing that hands you the first run
 * instead of describing it.
 *
 * The right two thirds of the page is a working model of spool and the terminal
 * under it: press "+", pick a folder, watch the agent write into it from the
 * terminal, click a frame, double-click to go inside, esc to come back, press
 * "+" again for a second project. Every one of those gestures runs here. The
 * ledger down the left ticks a row the moment you actually do the thing, so what
 * the page claims and what you have done are the same list.
 *
 * The terminal is under the canvas rather than inside it because that is the
 * real relationship: your coding agent writes a file, and the canvas has it.
 * Pressing run types the write out and the frame arrives when the line lands.
 *
 * Nothing here is drawn that cannot be pressed. The picker's third folder is
 * spool's own repo, which opens onto the site page with its eleven real frame
 * names, and the rail carries the twelve pages and their real counts.
 */

/* ---------- geometry ---------- */

const PAGE_L = 88;
const COL_W = 372;
const RIGHT_X = 500;

const MINI_W = 852;
const MINI_H = 480;
const BAR_H = 32;
const RAIL_W = 176;
const FIELD_W = MINI_W - RAIL_W;
const FIELD_H = MINI_H - BAR_H;

const TERM_H = 170;

const DOC_W = 320;
const DOC_H = 420;
const TILE_SCALE = 0.5;
const IN_SCALE = 0.9;

const EASE = [0.22, 1, 0.36, 1] as const;
const MONO_NAME = "font-mono [font-variant-ligatures:none]";

const dots: CSSProperties = {
	backgroundImage:
		"radial-gradient(circle, color-mix(in srgb, var(--color-text) 8%, transparent) 1px, transparent 1px)",
	backgroundSize: "14px 14px",
};

/* ---------- glyphs ---------- */

function PlusGlyph({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 12 12" className={className} fill="none" aria-hidden="true">
			<path d="M6 2.25v7.5M2.25 6h7.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
		</svg>
	);
}

function FolderGlyph({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 14 14" className={className} fill="none" aria-hidden="true">
			<path
				d="M1.75 3.5h3.5l1.25 1.5h5.75v5.5H1.75z"
				stroke="currentColor"
				strokeWidth="1.2"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function Caret({ open, className }: { open: boolean; className?: string }) {
	return (
		<svg viewBox="0 0 12 12" className={cn(open && "rotate-90", className)} fill="none" aria-hidden="true">
			<path
				d="m4 2.5 3.5 3.5L4 9.5"
				stroke="currentColor"
				strokeWidth="1.3"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function SearchGlyph({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 12 12" className={className} fill="none" aria-hidden="true">
			<circle cx="5.25" cy="5.25" r="3.25" stroke="currentColor" strokeWidth="1.2" />
			<path d="m7.75 7.75 2.25 2.25" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
		</svg>
	);
}

function TickGlyph({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 12 12" className={className} fill="none" aria-hidden="true">
			<path
				d="M2.5 6.4 5 8.7 9.5 3.4"
				stroke="currentColor"
				strokeWidth="1.6"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

/* ---------- the two documents the agent writes ---------- */

function DocShell({ children }: { children: ReactNode }) {
	return (
		<div className="flex h-full w-full flex-col bg-[#111110] font-sans text-[#F2F0EC]">{children}</div>
	);
}

function TvarsoCheckout() {
	return (
		<DocShell>
			<div className="flex items-center justify-between border-[#26251F] border-b px-5 py-4">
				<span className="font-semibold text-[15px] tracking-tight">Tvärsö</span>
				<span className="text-[11px] text-[#8B887E]">Biljetter</span>
			</div>
			<div className="flex-1 px-5 py-5">
				<p className="text-[11px] text-[#8B887E]">Torsdag 12 juni</p>
				<p className="mt-2 font-medium text-[19px] leading-[24px]">
					Kastellet
					<span className="text-[#8B887E]"> till </span>
					Tvärsö
				</p>
				<div className="mt-5 space-y-3 border-[#26251F] border-t pt-4 text-[12px]">
					<div className="flex justify-between">
						<span className="text-[#8B887E]">Avgång</span>
						<span>07:40</span>
					</div>
					<div className="flex justify-between">
						<span className="text-[#8B887E]">Vuxen × 2</span>
						<span>180 kr</span>
					</div>
					<div className="flex justify-between">
						<span className="text-[#8B887E]">Cykel</span>
						<span>40 kr</span>
					</div>
				</div>
				<div className="mt-4 flex justify-between border-[#26251F] border-t pt-4 font-medium text-[14px]">
					<span>Att betala</span>
					<span>220 kr</span>
				</div>
			</div>
			<div className="px-5 pb-6">
				<div className="flex h-11 items-center justify-center rounded-md bg-[#F5391A] font-medium text-[13px] text-white">
					Till kassan
				</div>
			</div>
		</DocShell>
	);
}

function TvarsoReceipt() {
	return (
		<DocShell>
			<div className="flex items-center justify-between border-[#26251F] border-b px-5 py-4">
				<span className="font-semibold text-[15px] tracking-tight">Tvärsö</span>
				<span className="text-[11px] text-[#8B887E]">Kvitto</span>
			</div>
			<div className="flex flex-1 flex-col items-center justify-center px-5 text-center">
				<span className="flex h-11 w-11 items-center justify-center rounded-full border border-[#F5391A] text-[#F5391A]">
					<TickGlyph className="h-5 w-5" />
				</span>
				<p className="mt-4 font-medium text-[17px]">Betalt</p>
				<p className="mt-2 text-[11px] text-[#8B887E]">Bokning TVR-4419 · 220 kr</p>
				<div className="mt-6 w-full space-y-2 border-[#26251F] border-t pt-4 text-left text-[11px]">
					<div className="flex justify-between">
						<span className="text-[#8B887E]">Avgång</span>
						<span>07:40, Kastellet</span>
					</div>
					<div className="flex justify-between">
						<span className="text-[#8B887E]">Plats</span>
						<span>Öppet däck</span>
					</div>
				</div>
			</div>
			<div className="px-5 pb-6">
				<div className="flex h-11 items-center justify-center rounded-md border border-[#3A382F] font-medium text-[13px]">
					Visa biljett
				</div>
			</div>
		</DocShell>
	);
}

/* ---------- projects ---------- */

interface Tile {
	id: string;
	name: string;
	x: number;
	y: number;
	/** a live document, or a skeleton shape for a frame drawn as a cover */
	doc?: () => ReactNode;
	shape?: number;
}

interface RailPage {
	name: string;
	count: number;
	open?: boolean;
	frames?: readonly string[];
}

interface Project {
	id: string;
	label: string;
	path: string;
	note: string;
}

const PROJECTS: readonly Project[] = [
	{ id: "tvarso", label: "tvarso", path: "~/tvarso", note: "a product repo" },
	{ id: "scratch", label: "scratch", path: "~/scratch", note: "an empty folder" },
	{ id: "spool", label: "spool", path: "~/projects/spool", note: "12 pages · 142 frames" },
];

const SPOOL_PAGES: readonly RailPage[] = [
	{ name: "agent", count: 27 },
	{ name: "app", count: 7 },
	{ name: "booting", count: 20 },
	{ name: "components", count: 6 },
	{ name: "directing", count: 1 },
	{ name: "dock", count: 5 },
	{ name: "explorer", count: 4 },
	{ name: "manipulate", count: 14 },
	{ name: "picker", count: 6 },
	{ name: "play-tab", count: 4 },
	{
		name: "site",
		count: 11,
		open: true,
		frames: ["site-hub--composed", "site-hub--tutorial", "site-card--pace", "site-disk--write"],
	},
	{ name: "variants", count: 37 },
];

const SITE_FRAMES: readonly string[] = [
	"site-hub--composed",
	"site-hub--tutorial",
	"site-card--pace",
	"site-disk--write",
	"site-flows--graph",
	"site-frames--depth",
	"site-local--blocked",
	"site-local--found",
	"site-local--plate",
	"site-local--wrong",
	"site-mobile--real",
];

const SPOOL_TILES: readonly Tile[] = SITE_FRAMES.map((name, i) => ({
	id: name,
	name,
	x: 44 + (i % 4) * 152,
	y: 52 + Math.floor(i / 4) * 130,
	shape: i % 3,
}));

const TVARSO_TILES: readonly Tile[] = [
	{ id: "checkout", name: "checkout", x: 156, y: 122, doc: TvarsoCheckout },
	{ id: "receipt", name: "receipt", x: 392, y: 122, doc: TvarsoReceipt },
];

/* ---------- the agent's two runs ---------- */

const RUNS: readonly { cmd: string; out: string }[] = [
	{ cmd: "write design/frames/checkout/frame.tsx", out: "wrote 1 file · the canvas has it" },
	{ cmd: "write design/frames/receipt/frame.tsx, walk from checkout", out: "wrote 1 file · 1 walk" },
];

/* ---------- covers for frames drawn small ---------- */

function Cover({ shape }: { shape: number }) {
	if (shape === 1) {
		return (
			<div className="flex h-full">
				<div className="w-[34%] border-border border-r bg-canvas" />
				<div className="flex-1 space-y-1.5 p-2">
					<div className="h-[6px] w-[72%] rounded-[1px] bg-raised" />
					<div className="h-[3px] w-[84%] rounded-full bg-border-raised" />
					<div className="h-[3px] w-[56%] rounded-full bg-border-raised" />
					<div className="mt-2 h-[8px] w-[38%] rounded-[2px] bg-thread/60" />
				</div>
			</div>
		);
	}
	if (shape === 2) {
		return (
			<div className="flex h-full flex-col p-2">
				<div className="h-[42%] rounded-[2px] bg-raised/60" />
				<div className="mt-2 space-y-1.5">
					<div className="h-[3px] w-[76%] rounded-full bg-border-raised" />
					<div className="h-[3px] w-[48%] rounded-full bg-border-raised" />
					<div className="h-[3px] w-[62%] rounded-full bg-border-raised" />
				</div>
			</div>
		);
	}
	return (
		<div className="space-y-1.5 p-2">
			<div className="h-[7px] w-[58%] rounded-[1px] bg-raised" />
			<div className="h-[3px] w-[88%] rounded-full bg-border-raised" />
			<div className="h-[3px] w-[72%] rounded-full bg-border-raised" />
			<div className="h-[3px] w-[50%] rounded-full bg-border-raised" />
			<div className="mt-2 h-[8px] w-[44%] rounded-[2px] bg-thread/55" />
		</div>
	);
}

/* ---------- the miniature's chrome ---------- */

function MiniBar({
	tabs,
	active,
	onPlus,
	onTab,
	plusLit,
}: {
	tabs: readonly Project[];
	active: string | null;
	onPlus: () => void;
	onTab: (id: string) => void;
	plusLit: boolean;
}) {
	return (
		<div
			className="flex shrink-0 items-center justify-between border-border border-b bg-bg px-3"
			style={{ height: BAR_H }}
		>
			<div className="flex items-center gap-4">
				<div className="flex items-center gap-1.5">
					<SpoolMark className="h-[13px] w-[10px] text-thread" />
					<span className="font-semibold text-[11px] leading-none tracking-tight">spool</span>
				</div>
				<div className="flex items-center gap-1">
					{tabs.map((tab) => (
						<button
							key={tab.id}
							type="button"
							onClick={() => {
								onTab(tab.id);
							}}
							className={cn(
								"flex h-[20px] cursor-pointer items-center rounded-[4px] px-2.5 font-mono text-[10px] leading-none",
								tab.id === active
									? "border border-border-raised bg-raised text-text"
									: "text-muted hover:text-text",
							)}
						>
							{tab.label}
						</button>
					))}
					<button
						type="button"
						onClick={onPlus}
						aria-label="Open a project folder"
						className="relative flex h-[20px] w-[20px] cursor-pointer items-center justify-center rounded-[4px] text-muted hover:bg-surface hover:text-text"
					>
						{plusLit ? (
							<motion.span
								className="-inset-[3px] absolute rounded-[6px] border border-thread"
								animate={{ opacity: [0.35, 1, 0.35] }}
								transition={{ duration: 2.2, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
							/>
						) : null}
						<PlusGlyph className={cn("h-2.5 w-2.5", plusLit && "text-thread")} />
					</button>
				</div>
			</div>
			<span className="font-mono text-[10px] text-muted leading-none">{active === null ? "" : "72%"}</span>
		</div>
	);
}

function MiniRail({ pages, selected }: { pages: readonly RailPage[]; selected: string | null }) {
	return (
		<aside
			className="flex shrink-0 flex-col overflow-hidden border-border border-r bg-bg"
			style={{ width: RAIL_W }}
		>
			<div className="flex shrink-0 items-center gap-2 border-border border-b px-3" style={{ height: BAR_H }}>
				<span className="font-semibold text-[11px] leading-none">Pages</span>
				<span className="font-mono text-[10px] text-muted leading-none">{pages.length}</span>
			</div>
			<div className="min-h-0 flex-1 overflow-hidden py-1.5">
				{pages.map((page) => (
					<div key={page.name}>
						<div
							className={cn(
								"relative flex h-[22px] items-center gap-1.5 pr-2.5 pl-2",
								page.open === true && "bg-surface",
							)}
						>
							{page.open === true ? (
								<span className="absolute top-1 bottom-1 left-0 w-[2px] rounded-full bg-thread" />
							) : null}
							<Caret open={page.open === true} className="h-2.5 w-2.5 shrink-0 text-muted/70" />
							<FolderGlyph
								className={cn("h-3 w-3 shrink-0", page.open === true ? "text-thread" : "text-muted")}
							/>
							<span
								className={cn(
									"min-w-0 flex-1 truncate font-mono text-[10px] leading-none",
									page.open === true ? "text-text" : "text-muted",
								)}
							>
								{page.name}
							</span>
							<span className="font-mono text-[9px] text-muted/60 leading-none">{page.count}</span>
						</div>
						{page.open === true && page.frames !== undefined ? (
							<div className="relative pb-1">
								<span className="absolute top-0 bottom-1 left-[16px] w-px bg-border-raised" />
								{page.frames.map((frame) => (
									<div
										key={frame}
										className={cn(
											"relative flex h-[20px] items-center",
											frame === selected && "bg-surface",
										)}
									>
										<span className="absolute top-1/2 left-[16px] h-px w-2.5 bg-border-raised" />
										<span
											className={cn(
												"truncate pl-[30px] text-[10px] leading-none",
												MONO_NAME,
												frame === selected ? "text-text" : "text-muted",
											)}
										>
											{frame}
										</span>
									</div>
								))}
							</div>
						) : null}
					</div>
				))}
			</div>
		</aside>
	);
}

/* ---------- the picker ---------- */

function Picker({
	open,
	onPick,
	onClose,
}: {
	open: boolean;
	onPick: (id: string) => void;
	onClose: () => void;
}) {
	return (
		<AnimatePresence>
			{open ? (
				<motion.div
					className="absolute inset-0 z-40 flex items-start justify-center bg-bg/72 pt-16"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					transition={{ duration: 0.16 }}
					onClick={onClose}
				>
					<motion.div
						className="w-[380px] overflow-hidden rounded-[8px] border border-border-raised bg-surface"
						initial={{ opacity: 0, y: -8, scale: 0.985 }}
						animate={{ opacity: 1, y: 0, scale: 1 }}
						exit={{ opacity: 0, y: -6, scale: 0.99 }}
						transition={{ duration: 0.2, ease: EASE }}
						onClick={(event: React.MouseEvent) => {
							event.stopPropagation();
						}}
					>
						<div className="flex items-center gap-2.5 border-border border-b px-3.5 py-3">
							<SearchGlyph className="h-3.5 w-3.5 shrink-0 text-muted" />
							<span className="font-mono text-[12px] text-muted leading-none">
								search every folder under ~
							</span>
						</div>
						<div className="py-1.5">
							{PROJECTS.map((project) => (
								<button
									key={project.id}
									type="button"
									onClick={() => {
										onPick(project.id);
									}}
									className="flex h-[34px] w-full cursor-pointer items-center gap-2.5 px-3.5 text-left hover:bg-raised"
								>
									<FolderGlyph className="h-3.5 w-3.5 shrink-0 text-muted" />
									<span className="font-mono text-[11px] text-text leading-none">{project.label}</span>
									<span className="font-mono text-[10px] text-muted/60 leading-none">{project.path}</span>
									<span className="ml-auto font-mono text-[10px] text-muted/60 leading-none">
										{project.note}
									</span>
								</button>
							))}
						</div>
						<div className="border-border border-t px-3.5 py-2.5 font-mono text-[10px] text-muted/60 leading-none">
							spool scaffolds design/ inside whichever one you pick
						</div>
					</motion.div>
				</motion.div>
			) : null}
		</AnimatePresence>
	);
}

/* ---------- a frame standing on the field ---------- */

function FieldFrame({
	tile,
	selected,
	inside,
	onSelect,
	onEnter,
}: {
	tile: Tile;
	selected: boolean;
	inside: boolean;
	onSelect: () => void;
	onEnter: () => void;
}) {
	const live = tile.doc !== undefined;
	const w = live ? DOC_W * TILE_SCALE : 132;
	const h = live ? DOC_H * TILE_SCALE : 92;
	const inX = (FIELD_W - DOC_W * IN_SCALE) / 2;
	const inY = (FIELD_H - DOC_H * IN_SCALE) / 2;
	const Doc = tile.doc;

	return (
		<motion.div
			className="absolute top-0 left-0"
			style={{ zIndex: inside ? 30 : selected ? 20 : 10 }}
			initial={false}
			animate={{ x: inside ? inX : tile.x, y: inside ? inY : tile.y }}
			transition={{ type: "spring", stiffness: 240, damping: 30, mass: 0.9 }}
		>
			<motion.div
				className={cn("absolute select-none whitespace-nowrap text-[10px] leading-none", MONO_NAME)}
				style={{ top: -15 }}
				initial={false}
				animate={{ opacity: inside ? 0 : 1 }}
				transition={{ duration: 0.16 }}
			>
				<span className={selected ? "text-thread" : "text-muted/70"}>{selected ? "▶ " : "▸ "}</span>
				<span className={selected ? "text-thread" : "text-muted"}>{tile.name}</span>
			</motion.div>
			<motion.div
				className="absolute select-none rounded-[3px] bg-thread px-2 py-[3px] font-mono text-[9px] text-on-thread leading-none"
				style={{ top: -17 }}
				initial={false}
				animate={{ opacity: inside ? 1 : 0 }}
				transition={{ duration: 0.16 }}
			>
				live · esc exits
			</motion.div>

			<button
				type="button"
				onClick={onSelect}
				onDoubleClick={onEnter}
				className="relative block cursor-pointer overflow-hidden rounded-[4px] border border-border bg-surface p-0 text-left"
				style={{ width: w, height: h }}
			>
				{Doc === undefined ? (
					<Cover shape={tile.shape ?? 0} />
				) : (
					<motion.div
						className="origin-top-left"
						style={{ width: DOC_W, height: DOC_H }}
						initial={false}
						animate={{ scale: inside ? IN_SCALE : TILE_SCALE }}
						transition={{ type: "spring", stiffness: 240, damping: 30, mass: 0.9 }}
					>
						<Doc />
					</motion.div>
				)}
			</button>

			<motion.span
				className="pointer-events-none absolute top-0 left-0 rounded-[6px] border-[1.5px] border-thread"
				initial={false}
				animate={{ opacity: selected && !inside ? 1 : 0 }}
				transition={{ duration: 0.14 }}
				style={{ width: w + 6, height: h + 6, marginLeft: -3, marginTop: -3 }}
			/>
			<motion.span
				className="pointer-events-none absolute rounded-[3px] bg-thread px-1.5 py-[3px] font-mono text-[9px] text-on-thread leading-none"
				style={{ left: w / 2 - 24, top: h - 1 }}
				initial={false}
				animate={{ opacity: selected && !inside ? 1 : 0 }}
				transition={{ duration: 0.14 }}
			>
				{live ? "320 × 420" : "1440 × 900"}
			</motion.span>
		</motion.div>
	);
}

/* ---------- the walk drawn between two frames ---------- */

function Walk({ shown }: { shown: boolean }) {
	return (
		<svg
			className="pointer-events-none absolute top-0 left-0 h-full w-full"
			fill="none"
			aria-hidden="true"
		>
			<motion.path
				d="M316 227 C 342 227, 354 227, 378 227"
				stroke="var(--color-thread)"
				strokeWidth="1.5"
				strokeLinecap="round"
				initial={false}
				animate={{ pathLength: shown ? 1 : 0, opacity: shown ? 1 : 0 }}
				transition={{ duration: 0.5, ease: EASE }}
			/>
			<motion.path
				d="m388 227-10-4.6v9.2Z"
				fill="var(--color-thread)"
				initial={false}
				animate={{ opacity: shown ? 1 : 0 }}
				transition={{ duration: 0.3, delay: shown ? 0.4 : 0 }}
			/>
		</svg>
	);
}

/* ---------- the terminal under the canvas ---------- */

interface TermLine {
	prompt?: string;
	text: string;
	tone: "cmd" | "out" | "thread";
}

function Terminal({
	cwd,
	lines,
	typing,
	canRun,
	runLabel,
	onRun,
}: {
	cwd: string;
	lines: readonly TermLine[];
	typing: string | null;
	canRun: boolean;
	runLabel: string;
	onRun: () => void;
}) {
	const reduce = useReducedMotion() === true;
	return (
		<div
			className="flex flex-col overflow-hidden rounded-[8px] border border-border bg-bg"
			style={{ width: MINI_W, height: TERM_H }}
		>
			<div className="flex shrink-0 items-center justify-between border-border border-b px-3.5 py-2">
				<div className="flex items-center gap-2">
					<span className="h-[7px] w-[7px] rounded-full border border-border-raised" />
					<span className="ml-1 font-mono text-[10px] text-muted leading-none">{cwd}</span>
				</div>
				{canRun ? (
					<button
						type="button"
						onClick={onRun}
						className="cursor-pointer rounded-[4px] border border-border-raised px-2.5 py-[5px] font-mono text-[10px] text-text leading-none hover:border-thread hover:text-thread"
					>
						⏎ {runLabel}
					</button>
				) : null}
			</div>
			<div className="min-h-0 flex-1 overflow-hidden px-3.5 py-2.5 font-mono text-[11px] leading-[19px]">
				{lines.map((line, i) => (
					<div key={`${line.text}-${String(i)}`} className="flex gap-2">
						{line.prompt === undefined ? null : (
							<span className="shrink-0 text-muted/70">{line.prompt}</span>
						)}
						<span
							className={cn(
								"truncate",
								line.tone === "cmd" ? "text-text" : line.tone === "thread" ? "text-thread" : "text-muted",
								MONO_NAME,
							)}
						>
							{line.text}
						</span>
					</div>
				))}
				{typing === null ? null : (
					<div className="flex gap-2">
						<span className="shrink-0 text-muted/70">{cwd} $</span>
						<span className={cn("truncate text-text", MONO_NAME)}>{typing}</span>
						<motion.span
							className="mt-[3px] block h-[12px] w-[6px] shrink-0 bg-thread"
							animate={reduce ? undefined : { opacity: [1, 0.15] }}
							transition={{
								duration: 0.55,
								repeat: Number.POSITIVE_INFINITY,
								repeatType: "reverse",
								ease: "easeInOut",
							}}
						/>
					</div>
				)}
			</div>
		</div>
	);
}

/* ---------- the ledger ---------- */

interface LedgerRow {
	label: string;
	done: boolean;
}

function Ledger({ rows }: { rows: readonly LedgerRow[] }) {
	const count = rows.filter((row) => row.done).length;
	return (
		<div>
			<div className="flex items-baseline justify-between border-border border-b pb-2.5">
				<span className="font-mono text-muted text-xs leading-none">what you have done</span>
				<span className="font-mono text-muted/60 text-2xs leading-none">
					{count} of {rows.length}
				</span>
			</div>
			{rows.map((row) => (
				<div key={row.label} className="flex h-[32px] items-center gap-3">
					<span
						className={cn(
							"flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-[4px] border transition-colors duration-300",
							row.done ? "border-thread bg-thread text-on-thread" : "border-border-raised text-transparent",
						)}
					>
						<TickGlyph className="h-2.5 w-2.5" />
					</span>
					<span
						className={cn(
							"text-[14px] leading-none transition-colors duration-300",
							row.done ? "text-text" : "text-muted/55",
						)}
					>
						{row.label}
					</span>
				</div>
			))}
		</div>
	);
}

/* ---------- the page ---------- */

export default function SiteFirstrunInside() {
	const [openIds, setOpenIds] = useState<readonly string[]>([]);
	const [activeId, setActiveId] = useState<string | null>(null);
	const [pickerOpen, setPickerOpen] = useState(false);
	const [runs, setRuns] = useState(0);
	const [typing, setTyping] = useState<string | null>(null);
	const [selected, setSelected] = useState<string | null>(null);
	const [inside, setInside] = useState<string | null>(null);
	const [everEntered, setEverEntered] = useState(false);
	const ticker = useRef<number | null>(null);

	const clearTicker = useCallback(() => {
		if (ticker.current !== null) {
			window.clearInterval(ticker.current);
			ticker.current = null;
		}
	}, []);

	useEffect(() => clearTicker, [clearTicker]);

	useEffect(() => {
		if (inside === null) return;
		function onKey(event: KeyboardEvent) {
			if (event.key === "Escape") setInside(null);
		}
		window.addEventListener("keydown", onKey);
		return () => {
			window.removeEventListener("keydown", onKey);
		};
	}, [inside]);

	function openProject(id: string) {
		setPickerOpen(false);
		setActiveId(id);
		setSelected(null);
		setInside(null);
		setOpenIds((ids) => (ids.includes(id) ? ids : [...ids, id]));
	}

	function runAgent() {
		const next = RUNS[runs];
		if (next === undefined || typing !== null) return;
		const full = next.cmd;
		let i = 0;
		setTyping("");
		clearTicker();
		ticker.current = window.setInterval(() => {
			i += 1;
			setTyping(full.slice(0, i));
			if (i >= full.length) {
				clearTicker();
				window.setTimeout(() => {
					setTyping(null);
					setRuns((r) => r + 1);
				}, 340);
			}
		}, 15);
	}

	function reset() {
		clearTicker();
		setOpenIds([]);
		setActiveId(null);
		setPickerOpen(false);
		setRuns(0);
		setTyping(null);
		setSelected(null);
		setInside(null);
		setEverEntered(false);
	}

	const openProjects = PROJECTS.filter((project) => openIds.includes(project.id));
	const isSpool = activeId === "spool";
	const tiles: readonly Tile[] =
		activeId === "tvarso" ? TVARSO_TILES.slice(0, runs) : isSpool ? SPOOL_TILES : [];
	const pages: readonly RailPage[] = isSpool
		? SPOOL_PAGES
		: [{ name: "frames", count: tiles.length, open: true, frames: tiles.map((tile) => tile.name) }];

	const cwd = isSpool ? "~/projects/spool" : activeId === "scratch" ? "~/scratch" : "~/tvarso";
	const termLines: TermLine[] = [];
	if (activeId === null) {
		termLines.push({ text: "pick a folder above and this fills in", tone: "out" });
	} else {
		termLines.push({ prompt: `${cwd} $`, text: "spool init", tone: "cmd" });
		termLines.push({ text: "design/ scaffolded · project registered", tone: "out" });
		if (isSpool) {
			termLines.push({ text: "142 frames on 12 pages, already here", tone: "thread" });
		} else {
			for (let i = 0; i < runs; i += 1) {
				const run = RUNS[i];
				if (run === undefined) continue;
				termLines.push({ prompt: `${cwd} $`, text: `agent: ${run.cmd}`, tone: "cmd" });
				termLines.push({ text: run.out, tone: "thread" });
			}
		}
	}

	const canRun = activeId !== null && !isSpool && runs < RUNS.length && typing === null;
	const runLabel = runs === 0 ? "ask the agent for a frame" : "ask for the second one";

	const ledger: readonly LedgerRow[] = [
		{ label: "Open a project from a folder", done: openIds.length > 0 },
		{ label: "Meet it with nothing in it", done: openIds.length > 0 },
		{ label: "Let the agent write a frame", done: runs > 0 },
		{ label: "Go inside a frame", done: everEntered },
		{ label: "Open a second project", done: openIds.length > 1 },
	];

	let instruction = "Press + in the bar and pick a folder.";
	if (pickerOpen) instruction = "Any of the three. spool scaffolds design/ inside it.";
	else if (activeId === null) instruction = "Press + in the bar and pick a folder.";
	else if (isSpool) instruction = "spool's own design folder: 12 pages, 142 frames, all of it files.";
	else if (activeId === "scratch") instruction = "A scratch project starts empty. That is the whole setup.";
	else if (runs === 0) instruction = "Nothing in it yet. Run the agent in the terminal below.";
	else if (inside !== null) instruction = "You are inside the frame. Esc comes back out.";
	else if (runs === 1) instruction = "There it is. Run again and the second frame arrives with a walk.";
	else if (!everEntered) instruction = "Double-click a frame to go inside it.";
	else if (openIds.length < 2) instruction = "Press + again. A second project costs ten seconds.";
	else instruction = "That is the first run. The real one runs on your machine.";

	return (
		<div className="relative h-full w-full overflow-hidden bg-bg font-sans text-text antialiased [font-synthesis:none]">
			{/* header */}
			<header
				className="absolute flex items-center justify-between"
				style={{ left: PAGE_L, top: 40, width: 1440 - PAGE_L * 2 }}
			>
				<div className="flex items-center gap-2.5">
					<SpoolMark className="h-5 w-4 text-thread" title="spool" />
					<span className="font-semibold text-md leading-none tracking-tight">spool</span>
				</div>
				<div className="flex items-center gap-7 font-mono text-muted text-xs leading-none">
					<span className="text-text">github.com/liamvinberg/spool</span>
					<span>MIT</span>
				</div>
			</header>

			{/* left column */}
			<div className="absolute" style={{ left: PAGE_L, top: 126, width: COL_W }}>
				<h1 className="font-semibold text-[44px] leading-[1.02] tracking-[-0.022em]">
					Do your first
					<br />
					run right here
				</h1>
				<p className="mt-6 text-[16px] text-muted leading-[26px]">
					spool is a prototyping canvas for real code. The model on the right is the whole first run, and
					every gesture in it works. Press the plus and take it from there.
				</p>

				<div className="mt-9 flex gap-5">
					<span className="w-px shrink-0 self-stretch bg-thread/70" />
					<div className="font-mono text-[14px] leading-[28px]">
						<div>
							<span className="text-muted">~ $ </span>
							<span className="text-text">npm i -g spool.page</span>
						</div>
						<div>
							<span className="text-muted">~/tvarso $ </span>
							<span className="text-text">spool init</span>
						</div>
					</div>
				</div>
				<p className="mt-4 pl-[21px] font-mono text-muted/70 text-2xs leading-[18px]">
					Node 22+ · Chrome · macOS, Linux, WSL on Windows
					<br />
					or take Spool.dmg, a window on the same daemon
				</p>

				<div className="mt-10">
					<Ledger rows={ledger} />
				</div>
			</div>

			<div className="absolute" style={{ left: PAGE_L, top: 782, width: COL_W }}>
				<div className="border-border border-t pt-5 text-[13px] text-muted leading-[22px]">
					MIT. Fork it, rework it, rename it, ship it. spool is designed in spool, and this page was a
					frame first.
				</div>
			</div>

			{/* the instruction, which is always the next thing to do */}
			<div className="absolute flex items-center gap-2.5" style={{ left: RIGHT_X, top: 96 }}>
				<span className="block h-[7px] w-[7px] shrink-0 rounded-full bg-thread" />
				<AnimatePresence mode="wait" initial={false}>
					<motion.span
						key={instruction}
						className="text-[15px] leading-none"
						initial={{ opacity: 0, y: 5 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -4 }}
						transition={{ duration: 0.22, ease: EASE }}
					>
						{instruction}
					</motion.span>
				</AnimatePresence>
			</div>

			{/* the miniature */}
			<div className="absolute" style={{ left: RIGHT_X, top: 126 }}>
				<div
					className="relative flex flex-col overflow-hidden rounded-[8px] border border-border"
					style={{ width: MINI_W, height: MINI_H }}
				>
					<MiniBar
						tabs={openProjects}
						active={activeId}
						plusLit={activeId === null || (openIds.length < 2 && everEntered)}
						onPlus={() => {
							setPickerOpen(true);
						}}
						onTab={(id) => {
							setActiveId(id);
							setSelected(null);
							setInside(null);
						}}
					/>

					{activeId === null ? (
						<div className="flex min-h-0 flex-1 flex-col items-center justify-center bg-bg">
							<SpoolMark className="h-7 w-[22px] text-thread opacity-35" />
							<p className="mt-4 font-medium text-base leading-none">No projects open.</p>
							<p className="mt-3 font-mono text-muted text-xs leading-none">
								press + and point spool at a folder
							</p>
						</div>
					) : (
						<div className="flex min-h-0 flex-1">
							<MiniRail pages={pages} selected={selected} />
							<div
								className="relative min-w-0 flex-1 overflow-hidden bg-canvas"
								style={dots}
								onClick={() => {
									if (inside === null) setSelected(null);
								}}
							>
								{tiles.length === 0 ? (
									<div className="flex h-full flex-col items-center justify-center gap-3">
										<SpoolMark className="h-6 w-5 text-thread opacity-30" />
										<p className="font-medium text-base leading-none">No frames yet.</p>
										<p className="font-mono text-muted text-xs leading-none">
											an agent births a frame by writing frames/&lt;name&gt;/frame.tsx
										</p>
									</div>
								) : null}

								{activeId === "tvarso" ? <Walk shown={runs > 1 && inside === null} /> : null}

								{tiles.map((tile) => (
									<FieldFrame
										key={tile.id}
										tile={tile}
										selected={selected === tile.id}
										inside={inside === tile.id}
										onSelect={() => {
											if (inside === null) setSelected(tile.id);
										}}
										onEnter={() => {
											if (tile.doc === undefined) return;
											setInside(tile.id);
											setSelected(tile.id);
											setEverEntered(true);
										}}
									/>
								))}

								{isSpool ? (
									<span className="absolute right-3.5 bottom-3 font-mono text-[10px] text-muted/60 leading-none">
										site · 11 frames · 142 in the project
									</span>
								) : null}
							</div>
						</div>
					)}

					<Picker
						open={pickerOpen}
						onPick={openProject}
						onClose={() => {
							setPickerOpen(false);
						}}
					/>
				</div>

				<div className="mt-5">
					<Terminal
						cwd={activeId === null ? "~" : cwd}
						lines={termLines}
						typing={typing}
						canRun={canRun}
						runLabel={runLabel}
						onRun={runAgent}
					/>
				</div>

				<div className="mt-4 flex items-center justify-between" style={{ width: MINI_W }}>
					<span className="font-mono text-muted/60 text-2xs leading-none">
						a working model of spool · the frames are files on disk in the real one
					</span>
					<button
						type="button"
						onClick={reset}
						className="cursor-pointer font-mono text-2xs text-muted leading-none underline decoration-border-raised underline-offset-4 hover:text-text"
					>
						start over
					</button>
				</div>
			</div>
		</div>
	);
}
