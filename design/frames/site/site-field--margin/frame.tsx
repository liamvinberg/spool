import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { cn } from "shared/lib/utils";
import { SpoolMark } from "shared/ui/spool-mark";
import {
	ArrowDown,
	ArrowUpRight,
	Bar,
	BarArtifact,
	CommandLine,
	DesignArtifact,
	dotGrid,
	EmptyArtifact,
	FolderGlyph,
	MacArtifact,
	PickerArtifact,
	RepoArtifact,
	TerminalArtifact,
	WatchArtifact,
} from "./parts";

/**
 * site-field--margin. The camera never moves sideways and never zooms. It pans
 * straight down one tall frame, and the field stays in the margins the whole
 * way.
 *
 * The incumbent (site-hub--composed) opens as a page and turns into a canvas.
 * The turn is the moment, and once it has happened the page is gone: everything
 * after it is read at 31%. This take keeps the long-form page, which is the part
 * of a landing that actually does the selling, and pays for the canvas
 * continuously instead of in one lump. From the first pixel there is a rail, a
 * dot grid, a red ring down both sides of the column you are reading, a frame
 * clipped by the rail on the left, and a column of neighbours on the right. Zoom
 * reads 100% at the top and 100% at the bottom, because the camera is only ever
 * panning.
 *
 * The margin is the argument. Each neighbour is its own frame standing beside
 * the paragraph it belongs to, so scrolling past a section brings its artifact
 * with it and a thread ties the two together while they are both on screen.
 * Nothing swaps, nothing crossfades, nothing is a picture of a screenshot: they
 * are eight small frames laid out on a field, and the reading column is the
 * ninth.
 *
 * What works: the install lines copy, the picker highlights, the tabs switch,
 * the walkthrough plays, the rail rows fly the scroll to their section, and the
 * ring is the real geometry of the column, 620 × 3300, which is what the corner
 * says.
 */

/* ---------- the fixed stage ---------- */

const VIEW_W = 1440;
const VIEW_H = 900;
const RAIL_W = 248;
const BAR_H = 44;
const FIELD_H = VIEW_H - BAR_H;

const COL_X = 372;
const COL_Y = 60;
const COL_W = 620;

const ART_X = 1052;
const ART_W = 372;

/* ---------- the reading column, section by section ---------- */

interface Section {
	id: string;
	sub: string;
	/** the neighbour's own frame name, printed on its tab */
	artName: string;
	h: number;
	/** the neighbour that stands beside it, and how tall it is */
	art: { h: number; dy: number; Art: () => React.ReactNode };
	Body: () => React.ReactNode;
}

function StartBody() {
	return (
		<>
			<div className="flex items-center gap-2.5">
				<SpoolMark className="h-5 w-4 text-thread" title="spool" />
				<span className="font-semibold text-md tracking-tight">spool</span>
			</div>
			<h1 className="mt-12 font-semibold text-[42px] leading-[1.02] tracking-[-0.022em]">
				I wanted to feel the app before I built it.
			</h1>
			<p className="mt-6 text-[16px] text-muted leading-[27px]">
				So spool is a canvas where the frames are alive. Your agent writes TSX into the design folder of your
				repo, the canvas renders it, and you click through the result the way a user would.
			</p>
			<div className="mt-8 flex gap-4">
				<span className="w-px shrink-0 self-stretch bg-thread/70" />
				<div className="w-full font-mono text-[15px] leading-[30px]">
					<CommandLine prompt="~ $" command="npm i -g spool.page" />
					<CommandLine prompt="~/tvarso $" command="spool init" />
					<CommandLine prompt="~/tvarso $" command="spool serve" />
				</div>
			</div>
			<p className="mt-6 font-mono text-[12px] text-muted/70 leading-[20px]">
				Node 22+ · best in Chrome · macOS and Linux, WSL on Windows
			</p>
		</>
	);
}

function MacBody() {
	return (
		<>
			<h2 className="font-semibold text-[30px] leading-[1.1] tracking-[-0.02em]">There is a Mac app too</h2>
			<p className="mt-5 text-[16px] text-muted leading-[27px]">
				It bundles the published package and runs the same daemon in a window, with an icon in your dock.
				Either way the work stays on your machine.
			</p>
			<a
				href="https://github.com/liamvinberg/spool/releases/latest/download/Spool.dmg"
				className="group mt-7 inline-flex items-center gap-2.5 rounded-sm border border-border-raised px-4 py-2.5 font-mono text-sm text-text transition-colors duration-200 hover:border-thread/60"
			>
				Spool.dmg
				<ArrowDown className="h-3.5 w-3.5 text-muted transition-colors duration-200 group-hover:text-thread" />
			</a>
		</>
	);
}

function EmptyBody() {
	return (
		<>
			<h2 className="font-semibold text-[30px] leading-[1.1] tracking-[-0.02em]">The first canvas is empty</h2>
			<p className="mt-5 text-[16px] text-muted leading-[27px]">
				spool init scaffolds design/, registers the project and opens its tab. Then the field says{" "}
				<span className="font-mono text-[15px] text-text">no frames yet</span>, which is honest, and it keeps
				saying it until your agent writes one.
			</p>
			<p className="mt-4 text-[16px] text-muted leading-[27px]">
				A frame is born by writing one file. There is nothing to register.
			</p>
		</>
	);
}

function OpenBody() {
	return (
		<>
			<h2 className="font-semibold text-[30px] leading-[1.1] tracking-[-0.02em]">Point + at any folder</h2>
			<p className="mt-5 text-[16px] text-muted leading-[27px]">
				The picker reaches the whole tree under your home. spool walks up to the repo root, finds design/ or
				offers to scaffold it, and the project gets a tab of its own.
			</p>
		</>
	);
}

function ProjectsBody() {
	return (
		<>
			<h2 className="font-semibold text-[30px] leading-[1.1] tracking-[-0.02em]">
				Several projects, one daemon
			</h2>
			<p className="mt-5 text-[16px] text-muted leading-[27px]">
				Every project you open keeps a tab, and they all run on port 7766. The files never move: a design
				space is a folder inside the product repo, git-tracked, local.
			</p>
		</>
	);
}

function WatchBody() {
	return (
		<>
			<h2 className="font-semibold text-[30px] leading-[1.1] tracking-[-0.02em]">Two minutes, start to finish</h2>
			<p className="mt-5 text-[16px] text-muted leading-[27px]">
				Install, init, one frame, and a flow you can walk. If you would rather watch than read, the clip in
				the margin is the whole thing.
			</p>
		</>
	);
}

function DesignBody() {
	return (
		<>
			<h2 className="font-semibold text-[30px] leading-[1.1] tracking-[-0.02em]">I design spool in spool</h2>
			<p className="mt-5 text-[16px] text-muted leading-[27px]">
				This repo's design folder holds 160 frames across 13 pages: the shipped app, the arguments I lost, and
				the page you are reading. It is the strongest thing I can say about the tool, so I say it with the
				folder rather than a sentence.
			</p>
			<p className="mt-4 font-mono text-[13px] text-muted/70 leading-[22px]">
				~/code/spool/design/frames/site/site-field--margin/frame.tsx
			</p>
		</>
	);
}

function LicenseBody() {
	return (
		<>
			<h2 className="font-semibold text-[30px] leading-[1.1] tracking-[-0.02em]">MIT</h2>
			<p className="mt-5 text-[16px] text-muted leading-[27px]">
				Fork it, rework it, rename it, ship it. It is a tool for designing things, so make it your own.
			</p>
			<a
				href="https://github.com/liamvinberg/spool"
				className="mt-7 inline-flex items-center gap-1.5 font-mono text-sm text-text transition-colors duration-200 hover:text-thread"
			>
				github.com/liamvinberg/spool
				<ArrowUpRight className="h-3 w-3 opacity-70" />
			</a>
		</>
	);
}

const SECTIONS: readonly Section[] = [
	{ id: "start", sub: "what spool is", artName: "terminal", h: 600, art: { h: 210, dy: 250, Art: TerminalArtifact }, Body: StartBody },
	{ id: "mac", sub: "the disk image", artName: "mac-app", h: 380, art: { h: 250, dy: 40, Art: MacArtifact }, Body: MacBody },
	{ id: "first-run", sub: "empty on purpose", artName: "empty-project", h: 380, art: { h: 264, dy: 30, Art: EmptyArtifact }, Body: EmptyBody },
	{ id: "open", sub: "+ from any folder", artName: "picker", h: 380, art: { h: 288, dy: 20, Art: PickerArtifact }, Body: OpenBody },
	{ id: "projects", sub: "a tab for each repo", artName: "project-bar", h: 360, art: { h: 244, dy: 30, Art: BarArtifact }, Body: ProjectsBody },
	{ id: "watch", sub: "two minutes", artName: "walkthrough", h: 400, art: { h: 262, dy: 30, Art: WatchArtifact }, Body: WatchBody },
	{ id: "design", sub: "160 frames", artName: "design-folder", h: 440, art: { h: 320, dy: 30, Art: DesignArtifact }, Body: DesignBody },
	{ id: "license", sub: "MIT", artName: "license-file", h: 360, art: { h: 168, dy: 30, Art: RepoArtifact }, Body: LicenseBody },
];

/** section tops inside the column, and the artifact rects beside them. */
const LAID = (() => {
	let y = 0;
	return SECTIONS.map((s) => {
		const top = y;
		y += s.h;
		return { ...s, top, artTop: COL_Y + top + s.art.dy };
	});
})();

const COL_H = LAID.reduce((sum, s) => sum + s.h, 0);
const WORLD_H = COL_Y + COL_H + 220;
const TRACK_H = VIEW_H + (WORLD_H - FIELD_H);

/** the frames clipped by the rail: the field carries on to the left. */
const LEFT_STRIP: readonly { y: number; h: number }[] = [
	{ y: 180, h: 420 },
	{ y: 940, h: 360 },
	{ y: 1520, h: 480 },
	{ y: 2180, h: 400 },
	{ y: 2700, h: 340 },
];

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/* ---------- threads from the column to its neighbours ---------- */

function threadPath(y1: number, y2: number) {
	const x1 = COL_X + COL_W;
	const x2 = ART_X;
	const bow = 34;
	return `M ${x1} ${y1} C ${x1 + bow} ${y1}, ${x2 - bow} ${y2}, ${x2} ${y2}`;
}

/* ---------- chrome ---------- */

function Rail({ active, onGo }: { active: number; onGo: (i: number) => void }) {
	return (
		<aside
			aria-label="Pages"
			className="absolute left-0 z-40 flex flex-col border-border border-r bg-bg"
			style={{ top: BAR_H, width: RAIL_W, height: FIELD_H }}
		>
			<div className="flex h-11 shrink-0 items-center gap-2 border-border border-b pl-3.5">
				<h2 className="font-semibold text-base leading-base">Pages</h2>
				<span className="font-mono text-muted text-xs leading-xs">1</span>
			</div>
			<div className="min-h-0 flex-1 overflow-hidden py-2">
				<div className="relative flex h-8 items-center gap-2 bg-surface px-3.5">
					<span className="absolute top-1.5 bottom-1.5 left-0 w-[2px] rounded-full bg-thread" />
					<FolderGlyph className="h-3.5 w-3.5 shrink-0 text-thread" />
					<span className="min-w-0 flex-1 truncate font-mono text-sm text-text">spool.page</span>
					<span className="font-mono text-2xs text-muted/60">9</span>
				</div>
				<div className="relative pt-1">
					<span className="absolute top-1 bottom-2 left-[18px] w-px bg-border-raised" />
					{LAID.map((s, i) => {
						const here = i === active;
						return (
							<button
								type="button"
								key={s.id}
								aria-pressed={here}
								onClick={() => onGo(i)}
								className={cn(
									"relative flex h-[34px] w-full cursor-pointer items-center pr-3.5 pl-[34px] text-left transition-colors duration-150 focus-visible:outline-none",
									here ? "bg-surface" : "hover:bg-surface/50",
								)}
							>
								<span className="absolute top-1/2 left-[18px] h-px w-2.5 bg-border-raised" />
								<span className="min-w-0 flex-1">
									<span
										className={cn(
											"block truncate font-mono text-sm leading-[15px] transition-colors duration-150",
											here ? "text-thread" : "text-muted",
										)}
									>
										{s.id}
									</span>
									<span className="mt-[2px] block truncate text-[11px] text-muted/50 leading-[12px]">
										{s.sub}
									</span>
								</span>
							</button>
						);
					})}
				</div>
			</div>
			<div className="shrink-0 border-border border-t px-4 pt-4 pb-5">
				<div className="flex gap-3">
					<span className="w-px shrink-0 self-stretch bg-thread/70" />
					<div className="min-w-0 flex-1">
						<CommandLine
							prompt="~ $"
							command="npm i -g spool.page"
							className="font-mono text-text text-xs leading-[20px]"
						/>
					</div>
				</div>
				<div className="mt-2 pl-[13px] font-mono text-[10px] text-muted/70 leading-[15px]">
					Node 22+ · macOS and Linux
				</div>
				<div className="mt-4 flex items-center gap-4 font-mono text-[11px] text-muted">
					<a
						href="https://github.com/liamvinberg/spool"
						className="inline-flex items-center gap-1 transition-colors duration-200 hover:text-thread"
					>
						Docs
						<ArrowUpRight className="h-2.5 w-2.5 opacity-70" />
					</a>
					<a
						href="https://github.com/liamvinberg/spool"
						className="inline-flex items-center gap-1 transition-colors duration-200 hover:text-thread"
					>
						GitHub
						<ArrowUpRight className="h-2.5 w-2.5 opacity-70" />
					</a>
				</div>
			</div>
		</aside>
	);
}

/* ---------- orchestrator ---------- */

export default function SiteFieldMargin() {
	const scrollRef = useRef<HTMLDivElement>(null);
	const [offset, setOffset] = useState(0);

	useEffect(() => {
		const el = scrollRef.current;
		if (el === null) return;
		const measure = () => setOffset(el.scrollTop);
		el.addEventListener("scroll", measure, { passive: true });
		measure();
		return () => el.removeEventListener("scroll", measure);
	}, []);

	// the reading line sits a third of the way down the field, which is where a
	// person's eye actually is; the section crossing it is the section they are in
	const readAt = offset + FIELD_H / 3;
	let active = 0;
	for (let i = 0; i < LAID.length; i++) {
		const s = LAID[i];
		if (s !== undefined && readAt >= COL_Y + s.top) active = i;
	}

	function goTo(i: number) {
		const el = scrollRef.current;
		const s = LAID[i];
		if (el === null || s === undefined) return;
		el.scrollTo({ top: Math.max(0, COL_Y + s.top - 96), behavior: "smooth" });
	}

	const worldY = BAR_H - offset;

	return (
		<div
			ref={scrollRef}
			className="h-full w-full overflow-y-auto bg-canvas font-sans text-text antialiased [font-synthesis:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
		>
			<div className="relative w-full" style={{ height: TRACK_H }}>
				<div className="sticky top-0 h-[900px] w-full overflow-hidden bg-canvas">
					{/* the field. one translation, no scale, ever. */}
					<div
						className="absolute top-0 left-0"
						style={{ width: VIEW_W, height: WORLD_H, transform: `translateY(${worldY}px)`, ...dotGrid }}
					>
						{/* threads: the column to the neighbour it belongs to */}
						<svg
							aria-hidden="true"
							className="pointer-events-none absolute top-0 left-0 overflow-visible"
							width={VIEW_W}
							height={WORLD_H}
							fill="none"
						>
							{LAID.map((s, i) => (
								<path
									key={s.id}
									d={threadPath(COL_Y + s.top + 92, s.artTop + 44)}
									stroke="var(--color-thread)"
									strokeWidth={1.5}
									strokeLinecap="round"
									className="transition-opacity duration-500"
									style={{ opacity: i === active ? 0.65 : 0.14 }}
								/>
							))}
						</svg>

						{/* the field carries on under the rail */}
						{LEFT_STRIP.map((f) => (
							<div
								key={f.y}
								className="absolute overflow-hidden rounded-[6px] border border-border-raised bg-bg p-4"
								style={{ left: 20, top: f.y, width: 300, height: f.h }}
							>
								<div className="h-2.5 w-[52%] rounded-[1px] bg-raised" />
								<div className="mt-3 space-y-2">
									<Bar w="84%" />
									<Bar w="62%" />
									<Bar w="70%" />
								</div>
								<div className="mt-5 h-4 w-[44%] rounded-[2px] bg-thread/30" />
							</div>
						))}

						{/* the reading column: one frame, 620 wide, taller than the field */}
						<div
							className="absolute font-mono text-muted text-xs leading-none"
							style={{ left: COL_X, top: COL_Y - 22 }}
						>
							<span className="text-thread">landing</span>
							<span className="ml-2 text-muted/50 text-2xs">the page you are reading</span>
						</div>
						<div
							className="absolute overflow-hidden rounded-[6px] border border-border-raised bg-bg"
							style={{ left: COL_X, top: COL_Y, width: COL_W, height: COL_H }}
						>
							{LAID.map((s) => (
								<div key={s.id} className="absolute px-14" style={{ top: s.top, height: s.h, width: COL_W }}>
									<div className="flex h-full flex-col justify-center">
										<s.Body />
									</div>
								</div>
							))}
						</div>
						{/* the ring is the column's real geometry, at 100%, so it needs no scaling */}
						<div
							className="pointer-events-none absolute rounded-[9px] border-[1.5px] border-thread"
							style={{ left: COL_X - 3, top: COL_Y - 3, width: COL_W + 6, height: COL_H + 6 }}
						/>

						{/* the neighbours, each standing beside the paragraph it belongs to */}
						{LAID.map((s, i) => (
							<div key={s.id} className="absolute" style={{ left: ART_X, top: s.artTop, width: ART_W }}>
								<div
									className={cn(
										"-top-[20px] absolute left-0 whitespace-nowrap font-mono text-2xs leading-none transition-colors duration-500",
										i === active ? "text-thread" : "text-muted/50",
									)}
								>
									{s.artName}
								</div>
								<motion.div
									className="overflow-hidden rounded-[6px] border bg-bg"
									style={{ width: ART_W, height: s.art.h }}
									animate={{
										borderColor:
											i === active
												? "color-mix(in srgb, var(--color-thread) 45%, transparent)"
												: "var(--color-border-raised)",
									}}
									transition={{ duration: 0.4 }}
								>
									<s.art.Art />
								</motion.div>
							</div>
						))}
					</div>

					{/* chrome */}
					<header
						className="absolute top-0 left-0 z-50 flex items-center gap-5 border-border border-b bg-bg px-4"
						style={{ width: VIEW_W, height: BAR_H }}
					>
						<span className="flex select-none items-center gap-2">
							<SpoolMark className="h-[18px] w-3.5 text-thread" title="spool" />
							<span className="font-semibold text-md leading-sm tracking-tight">spool</span>
						</span>
						<span className="flex h-[26px] items-center rounded-md border border-border-raised bg-raised px-3 font-medium text-base text-text leading-[24px]">
							spool.page
						</span>
						<span className="ml-auto font-mono text-[11px] text-muted/70">localhost:7766</span>
					</header>
					<Rail active={active} onGo={goTo} />

					{/* the camera never zoomed, and the readout is where you check that */}
					<div className="pointer-events-none absolute right-5 bottom-5 z-40 flex items-center gap-4 font-mono text-muted/70 text-xs tabular-nums">
						<span>620 × {COL_H}</span>
						<span>100%</span>
					</div>
					{/* where the camera is down the frame, on the field's own edge */}
					<div
						className="pointer-events-none absolute z-40 w-[2px] rounded-full bg-border-raised/60"
						style={{ left: RAIL_W + 6, top: BAR_H + 14, height: FIELD_H - 28 }}
					>
						<div
							className="absolute w-[2px] rounded-full bg-thread"
							style={{
								top: `${clamp01(offset / (TRACK_H - VIEW_H)) * (100 - 18)}%`,
								height: "18%",
							}}
						/>
					</div>
				</div>
			</div>
		</div>
	);
}
