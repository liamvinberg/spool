import { motion, useReducedMotion } from "motion/react";
import { type CSSProperties, type ReactNode, useRef, useState } from "react";
import { cn } from "shared/lib/utils";
import { SpoolMark } from "shared/ui/spool-mark";

/**
 * site-firstrun--folder. The spool.page landing as one folder, twice.
 *
 * The whole argument is a wipe. Both layers are the same rectangle at the same
 * coordinates: ~/tvarso at 09:41, a file tree beside a terminal, and ~/tvarso at
 * 09:52, the pages rail beside the canvas. The column widths and the row rhythm
 * are shared, so dragging the seam across turns the tree into the rail and the
 * terminal into the field in place. That is the claim the page is making: spool
 * is a reading of a folder you already have, not a place you move into.
 *
 * One control, and it is real. Drag the seam, press anywhere in the scene to
 * send it there, use the arrow keys on the handle, or press an end. Nothing
 * inside either layer is a hit target, because neither layer is running.
 *
 * The receipt under the scene is the eleven minutes between the two: the
 * install, the "+", the empty project, and fourteen frames.
 */

const PAGE_L = 88;
const SCENE_W = 1440 - PAGE_L * 2;
const SCENE_H = 440;
const SCENE_Y = 220;

const BAR_H = 32;
const COL_W = 300;
const PANE_W = SCENE_W - COL_W;
const PANE_H = SCENE_H - BAR_H;

const SNAP = "cubic-bezier(0.22, 1, 0.36, 1)";
const MONO_NAME = "font-mono [font-variant-ligatures:none]";

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

const dots: CSSProperties = {
	backgroundImage:
		"radial-gradient(circle, color-mix(in srgb, var(--color-text) 8%, transparent) 1px, transparent 1px)",
	backgroundSize: "15px 15px",
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

function FileGlyph({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 14 14" className={className} fill="none" aria-hidden="true">
			<path d="M3 1.75h5l3 3v7.5H3z" stroke="currentColor" strokeWidth="1.15" strokeLinejoin="round" />
			<path d="M8 1.75v3h3" stroke="currentColor" strokeWidth="1.15" strokeLinejoin="round" />
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

/* ---------- the before layer: a folder and a prompt ---------- */

interface DiskRow {
	name: string;
	kind: "dir" | "file";
	depth: number;
}

const DISK: readonly DiskRow[] = [
	{ name: "tvarso", kind: "dir", depth: 0 },
	{ name: "app", kind: "dir", depth: 1 },
	{ name: "components", kind: "dir", depth: 1 },
	{ name: "public", kind: "dir", depth: 1 },
	{ name: "src", kind: "dir", depth: 1 },
	{ name: "package.json", kind: "file", depth: 1 },
	{ name: "README.md", kind: "file", depth: 1 },
	{ name: "tsconfig.json", kind: "file", depth: 1 },
];

const BEFORE_TERM: readonly { prompt?: string; text: string; tone: "cmd" | "out" }[] = [
	{ prompt: "~/tvarso $", text: "ls", tone: "cmd" },
	{ text: "app  components  public  src  package.json  README.md  tsconfig.json", tone: "out" },
	{ prompt: "~/tvarso $", text: "npm i -g spool.page", tone: "cmd" },
	{ text: "added 1 package in 4s", tone: "out" },
];

function BeforeLayer() {
	const reduce = useReducedMotion() === true;
	return (
		<div className="flex h-full w-full flex-col bg-bg">
			<div
				className="flex shrink-0 items-center justify-between border-border border-b px-3.5"
				style={{ height: BAR_H }}
			>
				<div className="flex items-center gap-2.5">
					<span className="h-[7px] w-[7px] rounded-full border border-border-raised" />
					<span className="font-mono text-[11px] text-muted leading-none">~/tvarso</span>
				</div>
				<span className="font-mono text-[10px] text-muted/50 leading-none">09:41</span>
			</div>
			<div className="flex min-h-0 flex-1">
				<div
					className="shrink-0 overflow-hidden border-border border-r py-2"
					style={{ width: COL_W }}
				>
					{DISK.map((row) => (
						<div
							key={row.name}
							className="flex h-[26px] items-center gap-2"
							style={{ paddingLeft: 12 + row.depth * 16 }}
						>
							<Caret
								open={row.depth === 0}
								className={cn("h-2.5 w-2.5 shrink-0", row.depth === 0 ? "text-muted" : "text-transparent")}
							/>
							{row.kind === "dir" ? (
								<FolderGlyph className="h-3.5 w-3.5 shrink-0 text-muted/70" />
							) : (
								<FileGlyph className="h-3.5 w-3.5 shrink-0 text-muted/50" />
							)}
							<span className="truncate font-mono text-[12px] text-muted leading-none">
								{row.name}
								{row.kind === "dir" ? "/" : ""}
							</span>
						</div>
					))}
					<div className="mt-4 pl-3 font-mono text-[10px] text-muted/40 leading-[18px]">
						7 items
						<br />
						no design folder
					</div>
				</div>
				<div className="min-w-0 flex-1 px-5 py-4 font-mono text-[12px] leading-[22px]">
					{BEFORE_TERM.map((line, i) => (
						<div key={`${line.text}-${String(i)}`} className="flex gap-2">
							{line.prompt === undefined ? null : (
								<span className="shrink-0 text-muted/70">{line.prompt}</span>
							)}
							<span className={line.tone === "cmd" ? "text-text" : "text-muted/70"}>{line.text}</span>
						</div>
					))}
					<div className="flex gap-2">
						<span className="shrink-0 text-muted/70">~/tvarso $</span>
						<motion.span
							className="mt-[5px] block h-[13px] w-[7px] bg-thread"
							animate={reduce ? undefined : { opacity: [1, 0.12] }}
							transition={{
								duration: 0.65,
								repeat: Number.POSITIVE_INFINITY,
								repeatType: "reverse",
								ease: "easeInOut",
							}}
						/>
					</div>
				</div>
			</div>
		</div>
	);
}

/* ---------- the after layer: the same folder, open ---------- */

interface RailPage {
	name: string;
	count: number;
	open?: boolean;
	frames?: readonly string[];
}

const PAGES: readonly RailPage[] = [
	{ name: "checkout", count: 5, open: true, frames: ["sok", "avgangar", "platser", "kassa", "kvitto"] },
	{ name: "menu", count: 4 },
	{ name: "account", count: 5 },
];

interface DocTile {
	name: string;
	kind: "search" | "list" | "form" | "pay" | "done";
}

const TILES: readonly DocTile[] = [
	{ name: "sok", kind: "search" },
	{ name: "avgangar", kind: "list" },
	{ name: "platser", kind: "form" },
	{ name: "kassa", kind: "pay" },
	{ name: "kvitto", kind: "done" },
];

const TILE_W = 140;
const TILE_H = 184;
const TILE_GAP = 56;
const TILE_Y = 104;
const TILE_X0 = Math.round((PANE_W - (TILES.length * TILE_W + (TILES.length - 1) * TILE_GAP)) / 2);

/** what Tvärsö's screens look like at this size: shape, never words */
function Doc({ kind }: { kind: DocTile["kind"] }) {
	return (
		<div className="flex h-full flex-col bg-[#111110] p-2.5">
			<div className="flex items-center justify-between">
				<span className="h-[6px] w-[34px] rounded-[1px] bg-[#3A382F]" />
				<span className="h-[5px] w-[16px] rounded-[1px] bg-[#2A2922]" />
			</div>
			{kind === "search" ? (
				<>
					<div className="mt-4 h-[22px] rounded-[3px] border border-[#2A2922]" />
					<div className="mt-3 space-y-2">
						<div className="h-[4px] w-[80%] rounded-full bg-[#26251F]" />
						<div className="h-[4px] w-[58%] rounded-full bg-[#26251F]" />
					</div>
					<div className="mt-auto h-[22px] rounded-[3px] bg-[#F5391A]" />
				</>
			) : null}
			{kind === "list" ? (
				<div className="mt-3 space-y-2">
					{[0, 1, 2, 3].map((row) => (
						<div key={row} className="flex items-center justify-between rounded-[3px] bg-[#1A1914] p-1.5">
							<span className="h-[4px] w-[46%] rounded-full bg-[#33322A]" />
							<span className="h-[4px] w-[18%] rounded-full bg-[#33322A]" />
						</div>
					))}
				</div>
			) : null}
			{kind === "form" ? (
				<>
					<div className="mt-4 grid grid-cols-4 gap-1.5">
						{[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((cell) => (
							<span
								key={cell}
								className={cn(
									"block h-[16px] rounded-[2px]",
									cell === 5 || cell === 6 ? "bg-[#F5391A]" : "bg-[#1F1E18]",
								)}
							/>
						))}
					</div>
					<div className="mt-auto h-[22px] rounded-[3px] border border-[#2A2922]" />
				</>
			) : null}
			{kind === "pay" ? (
				<>
					<div className="mt-4 space-y-2.5">
						{[0, 1, 2].map((row) => (
							<div key={row} className="flex justify-between">
								<span className="h-[4px] w-[42%] rounded-full bg-[#26251F]" />
								<span className="h-[4px] w-[20%] rounded-full bg-[#33322A]" />
							</div>
						))}
					</div>
					<div className="mt-3 border-[#26251F] border-t pt-3">
						<div className="flex justify-between">
							<span className="h-[5px] w-[36%] rounded-full bg-[#3A382F]" />
							<span className="h-[5px] w-[24%] rounded-full bg-[#3A382F]" />
						</div>
					</div>
					<div className="mt-auto h-[22px] rounded-[3px] bg-[#F5391A]" />
				</>
			) : null}
			{kind === "done" ? (
				<div className="flex flex-1 flex-col items-center justify-center gap-3">
					<span className="block h-7 w-7 rounded-full border border-[#F5391A]" />
					<span className="h-[5px] w-[40%] rounded-full bg-[#33322A]" />
					<span className="h-[4px] w-[56%] rounded-full bg-[#26251F]" />
				</div>
			) : null}
		</div>
	);
}

function AfterLayer() {
	return (
		<div className="flex h-full w-full flex-col bg-bg">
			<div
				className="flex shrink-0 items-center justify-between border-border border-b px-3.5"
				style={{ height: BAR_H }}
			>
				<div className="flex items-center gap-4">
					<div className="flex items-center gap-2">
						<SpoolMark className="h-[13px] w-[10px] text-thread" />
						<span className="font-semibold text-[12px] leading-none tracking-tight">spool</span>
					</div>
					<div className="flex items-center gap-1.5">
						<span className="flex h-[20px] items-center rounded-[4px] border border-border-raised bg-raised px-2.5 font-mono text-[10px] text-text leading-none">
							tvarso
						</span>
						<span className="flex h-[20px] w-[20px] items-center justify-center rounded-[4px] text-muted">
							<PlusGlyph className="h-2.5 w-2.5" />
						</span>
					</div>
				</div>
				<span className="font-mono text-[10px] text-muted/50 leading-none">09:52</span>
			</div>
			<div className="flex min-h-0 flex-1">
				<aside className="shrink-0 overflow-hidden border-border border-r" style={{ width: COL_W }}>
					<div className="flex h-[30px] items-center gap-2 border-border border-b px-3.5">
						<span className="font-semibold text-[12px] leading-none">Pages</span>
						<span className="font-mono text-[11px] text-muted leading-none">3</span>
					</div>
					<div className="py-1.5">
						{PAGES.map((page) => (
							<div key={page.name}>
								<div
									className={cn(
										"relative flex h-[26px] items-center gap-2 pr-3 pl-3",
										page.open === true && "bg-surface",
									)}
								>
									{page.open === true ? (
										<span className="absolute top-1.5 bottom-1.5 left-0 w-[2px] rounded-full bg-thread" />
									) : null}
									<Caret open={page.open === true} className="h-2.5 w-2.5 shrink-0 text-muted" />
									<FolderGlyph
										className={cn(
											"h-3.5 w-3.5 shrink-0",
											page.open === true ? "text-thread" : "text-muted/70",
										)}
									/>
									<span
										className={cn(
											"min-w-0 flex-1 truncate font-mono text-[12px] leading-none",
											page.open === true ? "text-text" : "text-muted",
										)}
									>
										{page.name}
									</span>
									<span className="font-mono text-[10px] text-muted/60 leading-none">{page.count}</span>
								</div>
								{page.open === true && page.frames !== undefined ? (
									<div className="relative pb-1">
										<span className="absolute top-0 bottom-1 left-[21px] w-px bg-border-raised" />
										{page.frames.map((frame) => (
											<div key={frame} className="relative flex h-[24px] items-center">
												<span className="absolute top-1/2 left-[21px] h-px w-3 bg-border-raised" />
												<span
													className={cn("truncate pl-[40px] text-[12px] text-muted leading-none", MONO_NAME)}
												>
													{frame}
												</span>
											</div>
										))}
									</div>
								) : null}
							</div>
						))}
						<div className="mt-4 pl-3 font-mono text-[10px] text-muted/40 leading-[18px]">
							14 frames
							<br />
							design/ is in the repo
						</div>
					</div>
				</aside>
				<div className="relative min-w-0 flex-1 overflow-hidden bg-canvas" style={dots}>
					{TILES.map((tile, i) => {
						const x = TILE_X0 + i * (TILE_W + TILE_GAP);
						return (
							<div key={tile.name} className="absolute" style={{ left: x, top: TILE_Y, width: TILE_W }}>
								<div className={cn("mb-1.5 truncate text-[10px] text-muted leading-none", MONO_NAME)}>
									▸ {tile.name}
								</div>
								<div
									className="overflow-hidden rounded-[4px] border border-border"
									style={{ height: TILE_H }}
								>
									<Doc kind={tile.kind} />
								</div>
							</div>
						);
					})}
					<svg
						className="pointer-events-none absolute top-0 left-0 h-full w-full"
						fill="none"
						aria-hidden="true"
					>
						{[0, 1, 2, 3].map((i) => {
							const x = TILE_X0 + i * (TILE_W + TILE_GAP) + TILE_W;
							const y = TILE_Y + 16 + TILE_H / 2;
							return (
								<g key={i}>
									<path
										d={`M${x} ${y} C ${x + 20} ${y}, ${x + 26} ${y}, ${x + TILE_GAP - 10} ${y}`}
										stroke="var(--color-thread)"
										strokeWidth="1.4"
										strokeLinecap="round"
									/>
									<path
										d={`m${x + TILE_GAP} ${y}-10-4.4v8.8Z`}
										fill="var(--color-thread)"
									/>
								</g>
							);
						})}
					</svg>
					<span className="absolute right-4 bottom-3.5 font-mono text-[11px] text-muted/60 leading-none">
						checkout · 5 frames · 4 walks
					</span>
				</div>
			</div>
		</div>
	);
}

/* ---------- the receipt ---------- */

interface Beat {
	time: string;
	line: string;
	note: string;
}

const BEATS: readonly Beat[] = [
	{
		time: "09:41",
		line: "npm i -g spool.page",
		note: "One global package. Spool.dmg does the same job in a window if you would rather not use the terminal.",
	},
	{
		time: "09:43",
		line: "press + on ~/tvarso",
		note: "The picker searches every folder under home. design/ lands inside the repo and git tracks it.",
	},
	{
		time: "09:44",
		line: "no frames yet",
		note: "The project opens with the field bare and the rails saying so. A scratch folder opens the same way.",
	},
	{
		time: "09:52",
		line: "14 frames · 4 walks",
		note: "One file per frame, written by the agent. spool's own design/ is 12 pages and 142 frames.",
	},
];

/* ---------- the page ---------- */

export default function SiteFirstrunFolder() {
	const scene = useRef<HTMLDivElement | null>(null);
	const [seam, setSeam] = useState(48);
	const [dragging, setDragging] = useState(false);
	const [snapping, setSnapping] = useState(false);
	const [touched, setTouched] = useState(false);

	function seamFrom(clientX: number) {
		const el = scene.current;
		if (el === null) return;
		const rect = el.getBoundingClientRect();
		setSeam(clamp(((clientX - rect.left) / rect.width) * 100, 0, 100));
	}

	function snapTo(value: number) {
		setSnapping(true);
		setTouched(true);
		setSeam(value);
	}

	function onKey(event: React.KeyboardEvent) {
		if (event.key === "ArrowLeft") {
			setSnapping(false);
			setTouched(true);
			setSeam((v) => clamp(v - 4, 0, 100));
		}
		if (event.key === "ArrowRight") {
			setSnapping(false);
			setTouched(true);
			setSeam((v) => clamp(v + 4, 0, 100));
		}
	}

	const glide = snapping ? `380ms ${SNAP}` : "none";
	/* at either end the handle would hang outside the scene, so it parks inside it */
	const handleShift = seam < 2 ? "0%" : seam > 98 ? "-100%" : "-50%";

	return (
		<div className="relative h-full w-full overflow-hidden bg-bg font-sans text-text antialiased [font-synthesis:none]">
			<header
				className="absolute flex items-center justify-between"
				style={{ left: PAGE_L, top: 40, width: SCENE_W }}
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

			<div
				className="absolute flex items-end justify-between"
				style={{ left: PAGE_L, top: 108, width: SCENE_W }}
			>
				<h1 className="font-semibold text-[46px] leading-[1.02] tracking-[-0.022em]">
					One folder,
					<br />
					eleven minutes apart
				</h1>
				<p className="w-[430px] pb-1.5 text-[16px] text-muted leading-[26px]">
					Left is a repo called tvarso at 09:41. Right is the same repo at 09:52, with spool reading it.
					Drag the seam and watch the tree turn into the rail.
				</p>
			</div>

			{/* the scene: two layers, one rectangle */}
			<div
				ref={scene}
				className="absolute cursor-ew-resize select-none overflow-hidden rounded-[10px] border border-border"
				style={{ left: PAGE_L, top: SCENE_Y, width: SCENE_W, height: SCENE_H }}
				onPointerDown={(event) => {
					event.currentTarget.setPointerCapture(event.pointerId);
					setSnapping(false);
					setDragging(true);
					setTouched(true);
					seamFrom(event.clientX);
				}}
				onPointerMove={(event) => {
					if (dragging) seamFrom(event.clientX);
				}}
				onPointerUp={(event) => {
					event.currentTarget.releasePointerCapture(event.pointerId);
					setDragging(false);
				}}
			>
				<div className="absolute inset-0">
					<BeforeLayer />
				</div>
				<div
					className="absolute inset-0"
					style={{ clipPath: `inset(0 0 0 ${String(seam)}%)`, transition: `clip-path ${glide}` }}
				>
					<AfterLayer />
				</div>

				{/* the seam */}
				<div
					className="pointer-events-none absolute top-0 bottom-0 w-px bg-thread"
					style={{ left: `${String(seam)}%`, transition: `left ${glide}` }}
				>
					<div
						role="slider"
						tabIndex={0}
						aria-label="Before and after"
						aria-valuemin={0}
						aria-valuemax={100}
						aria-valuenow={Math.round(seam)}
						onKeyDown={onKey}
						style={{ transform: `translate(${handleShift}, -50%)` }}
						className="pointer-events-auto absolute top-1/2 left-0 flex h-11 w-6 cursor-ew-resize items-center justify-center gap-[3px] rounded-full border border-thread bg-bg focus-visible:outline-none"
					>
						<span className="block h-3.5 w-px bg-thread/70" />
						<span className="block h-3.5 w-px bg-thread/70" />
					</div>
					<motion.div
						className="absolute left-0 whitespace-nowrap rounded-[3px] bg-thread px-2 py-[4px] font-mono text-[10px] text-on-thread leading-none"
						style={{ top: 46, transform: `translateX(${handleShift})` }}
						initial={false}
						animate={{ opacity: touched ? 0 : 1 }}
						transition={{ duration: 0.3 }}
					>
						drag
					</motion.div>
				</div>
			</div>

			{/* the two ends, as real buttons */}
			<div
				className="absolute flex items-center justify-between"
				style={{ left: PAGE_L, top: SCENE_Y + SCENE_H + 16, width: SCENE_W }}
			>
				<button
					type="button"
					onClick={() => {
						snapTo(100);
					}}
					className="cursor-pointer font-mono text-2xs text-muted leading-none hover:text-text"
				>
					← the folder at 09:41
				</button>
				<span className="font-mono text-2xs text-muted/45 leading-none">
					drag the seam, press anywhere in it, or arrow the handle
				</span>
				<button
					type="button"
					onClick={() => {
						snapTo(0);
					}}
					className="cursor-pointer font-mono text-2xs text-muted leading-none hover:text-text"
				>
					the same folder at 09:52 →
				</button>
			</div>

			{/* the receipt of the eleven minutes */}
			<div
				className="absolute grid border-border border-t pt-6"
				style={{
					left: PAGE_L,
					top: SCENE_Y + SCENE_H + 56,
					width: SCENE_W,
					gridTemplateColumns: "repeat(4, 1fr)",
					columnGap: 40,
				}}
			>
				{BEATS.map((beat) => (
					<div key={beat.time}>
						<div className="flex items-baseline gap-3">
							<span className="font-mono text-2xs text-thread leading-none">{beat.time}</span>
							<span className={cn("text-[13px] text-text leading-none", MONO_NAME)}>{beat.line}</span>
						</div>
						<p className="mt-3 text-[13px] text-muted leading-[22px]">{beat.note}</p>
					</div>
				))}
			</div>

			<div
				className="absolute flex items-center justify-between border-border border-t pt-5"
				style={{ left: PAGE_L, top: 828, width: SCENE_W }}
			>
				<span className="text-[13px] text-muted leading-none">
					MIT. Fork it, rework it, rename it, ship it.
				</span>
				<span className="font-mono text-muted/60 text-2xs leading-none">
					Node 22+ · Chrome · macOS, Linux, WSL on Windows · spool.page
				</span>
			</div>
		</div>
	);
}
