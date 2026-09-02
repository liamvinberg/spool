import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { cn } from "shared/lib/utils";
import { CoffeeScreen, type CoffeeScreenName } from "shared/ui/demo/coffee-screens";
import { backArrowClass, backChipClass, STAGE_H, STAGE_W, SiteSection, colorJson } from "shared/ui/site/site-section";

/**
 * site-disk--write: the "your disk" section of spool.page (site page), rebuilt on
 * the shared section shell so it reads as site-states' sibling. The claim: the
 * frames are plain files in your repo, and nothing else.
 *
 * The body is the demo, and it proves the claim by putting the cause and the
 * effect on screen at once, left to right. The tree is the real one: design/, the
 * single file spool owns (canvas.json, locked), and three frame folders holding
 * two files each. A thread wire leaves the live folder, passes through a card that
 * opens those two files, and lands in the frame they render. Nothing here is a
 * picture of a file: the folder row, the path on the card and the frame's name are
 * the same string, and the size printed in frame.json is the shape of the plate.
 *
 * Clicking any folder takes the wire over and pauses the loop ~9s, the way a
 * column works in site-states. A move ticks that folder's beat: its gutter draws
 * down, the two files pick up a thread + because they were just written, a comet
 * runs the wire, and the card and the render re-compose in the order the comet
 * reaches them. The plate is chrome and never moves or resizes; only what is
 * inside it changes. Beat 0 is the boot pose and animates nothing, so a fresh shot
 * is at rest, and reduced motion parks it there.
 *
 * Git stays one quiet element: the branch in the tree's header, plus the two +
 * marks. Being unremarkable is the entire point of it, so it gets no more room.
 *
 * The rendered frame is the canvas's own sample product, so it wears Instrument
 * Sans; spool's chrome stays on Familjen Grotesk and Fragment Mono. Geometry is
 * fixed px inside the 1328x620 stage, never measured.
 */

/* ---------- stage geometry: fixed px, never measured ---------- */

const PANEL_X = 52;
const PANEL_Y = 50;
const PANEL_W = 400;
const PANEL_H = 520;
const PANEL_RIGHT = PANEL_X + PANEL_W; // 452
const HEADER_H = 38;
const FOOT_H = 38;
const ROW_H = 26;
const ROWS_TOP = PANEL_Y + HEADER_H + 1; // 89

// 390x844 at 0.64, which is what a phone frame looks like docked on a canvas.
const PLATE_X = 1020;
const PLATE_Y = 40;
const PLATE_W = 250;
const PLATE_H = 540;

const TRUNK_X = 472; // the bus starts at the first junction and runs to the plate
const TRUNK_Y = PLATE_Y + PLATE_H / 2; // 310
const CORNER = 8;

const CARD_W = 380;
const CARD_H = 104;
const CARD_X = 576;
const CARD_Y = TRUNK_Y - CARD_H / 2; // 258

const BEAT_MS = 3800;
const PAUSE_MS = 9000;
const EASE = [0.22, 1, 0.36, 1] as const;

/* ---------- the tree, exactly as it sits on disk ---------- */

type RowKind = "folder" | "file" | "locked";
type TreeRow = { depth: number; kind: RowKind; name: string; size?: string };

// Rows 0-4, then the three frame groups (5-13), then 14-15. The middle frame's
// folder row lands on TRUNK_Y on purpose, so its wire is a straight shot and the
// other two elbow onto the same junction.
const HEAD_ROWS: readonly TreeRow[] = [
	{ depth: 0, kind: "folder", name: "design/" },
	{ depth: 1, kind: "file", name: "AGENTS.md", size: "1.2 kb" },
	{ depth: 1, kind: "file", name: "CLAUDE.md", size: "0.4 kb" },
	{ depth: 1, kind: "locked", name: "canvas.json", size: "8.1 kb" },
	{ depth: 1, kind: "folder", name: "frames/" },
];
const TAIL_ROWS: readonly TreeRow[] = [
	{ depth: 1, kind: "folder", name: "shared/" },
	{ depth: 2, kind: "file", name: "tokens.css", size: "1.1 kb" },
];

type Frame = {
	name: string;
	component: string;
	screen: CoffeeScreenName;
	/** its folder's row in the tree, which is where its leg leaves from */
	row: number;
	/** where its leg meets the bus. one each, so no two legs ever share a line. */
	bus: number;
	tsxSize: string;
};

const FRAMES: readonly Frame[] = [
	{ name: "menu", component: "Menu", screen: "menu", row: 5, bus: 488, tsxSize: "1.9 kb" },
	{ name: "cart", component: "Cart", screen: "cart", row: 8, bus: TRUNK_X, tsxSize: "2.3 kb" },
	{ name: "receipt", component: "Receipt", screen: "receipt", row: 11, bus: 504, tsxSize: "1.4 kb" },
];

const SIDECAR = '{ "w": 390, "h": 844 }';

const rowY = (row: number): number => ROWS_TOP + row * ROW_H + ROW_H / 2;
const frameAt = (index: number): Frame => FRAMES[index] ?? FRAMES[0];

/* ---------- glyphs ---------- */

function ChevronGlyph({ className }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 12 12"
			fill="none"
			aria-hidden="true"
			className={cn("h-2.5 w-2.5 shrink-0", className)}
			style={{ transform: "rotate(90deg)" }}
		>
			<path
				d="m4 2.5 3.5 3.5L4 9.5"
				stroke="currentColor"
				strokeWidth="1.25"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function FileGlyph({ className }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 14 14"
			fill="none"
			aria-hidden="true"
			className={cn("h-3.5 w-3.5 shrink-0", className)}
		>
			<path d="M3 1.75h5l3 3v7.5H3z" stroke="currentColor" strokeWidth="1.15" strokeLinejoin="round" />
			<path d="M8 1.75v3h3" stroke="currentColor" strokeWidth="1.15" strokeLinejoin="round" />
		</svg>
	);
}

function LockGlyph({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 12 12" fill="none" aria-hidden="true" className={cn("h-3 w-3 shrink-0", className)}>
			<rect x="2.5" y="5.25" width="7" height="4.75" rx="1" stroke="currentColor" strokeWidth="1" />
			<path d="M3.9 5.25V4.1a2.1 2.1 0 0 1 4.2 0v1.15" stroke="currentColor" strokeWidth="1" />
		</svg>
	);
}

/** The one git element, in the one place an editor puts it. */
function BranchGlyph({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 14 14" fill="none" aria-hidden="true" className={cn("h-3.5 w-3.5 shrink-0", className)}>
			<circle cx="4" cy="3.2" r="1.5" stroke="currentColor" strokeWidth="1.1" />
			<circle cx="4" cy="10.8" r="1.5" stroke="currentColor" strokeWidth="1.1" />
			<circle cx="10.5" cy="3.2" r="1.5" stroke="currentColor" strokeWidth="1.1" />
			<path d="M4 4.7v4.6M10.5 4.7v1.1c0 1.4-1.1 2.5-2.5 2.5H5.5" stroke="currentColor" strokeWidth="1.1" />
		</svg>
	);
}

/** A filename with its extension a shade dimmer: the small detail that reads. */
function FileName({ name }: { name: string }) {
	const dot = name.lastIndexOf(".");
	if (dot <= 0) return <>{name}</>;
	return (
		<>
			{name.slice(0, dot)}
			<span className="opacity-60">{name.slice(dot)}</span>
		</>
	);
}

/* ---------- the tree ---------- */

function Row({
	depth,
	kind,
	name,
	size,
	accent = false,
	added = false,
	addedDelay = 0,
}: {
	depth: number;
	kind: RowKind;
	name: string;
	size?: string;
	accent?: boolean;
	added?: boolean;
	addedDelay?: number;
}) {
	const isFolder = kind === "folder";
	const isLocked = kind === "locked";
	return (
		<div
			className="relative flex items-center gap-1.5 font-mono text-[13px]"
			style={{ height: ROW_H, paddingLeft: 12 + depth * 16 }}
		>
			<span className="flex w-4 shrink-0 items-center justify-center">
				{isFolder ? (
					<ChevronGlyph className={accent ? "text-thread" : "text-muted"} />
				) : (
					<FileGlyph className={cn("text-muted", isLocked ? "opacity-45" : "opacity-80")} />
				)}
			</span>
			<span
				className={cn(
					"min-w-0 truncate transition-colors duration-200",
					isFolder ? (accent ? "text-thread" : "text-text") : "text-muted",
					isLocked && "opacity-45",
				)}
			>
				{isFolder ? name : <FileName name={name} />}
			</span>
			{isLocked ? <LockGlyph className="ml-1.5 text-muted opacity-45" /> : null}

			{/* the write, marked the way git marks it: two new files, nothing else */}
			{kind === "file" ? (
				<span
					aria-hidden="true"
					className={cn(
						"ml-2 shrink-0 leading-none text-thread transition-opacity duration-300",
						added ? "opacity-100" : "opacity-0",
					)}
					style={{ transitionDelay: `${added ? addedDelay : 0}ms` }}
				>
					+
				</span>
			) : null}

			{/* a listing, not an outline: every file on disk has a size */}
			{size === undefined ? null : (
				<span className="absolute right-4 text-2xs leading-none text-muted/45 tabular-nums">{size}</span>
			)}
		</div>
	);
}

/**
 * One frame folder and the two files in it, as one target. Selecting it moves the
 * live wire; `beat` is this folder's own restart counter, and 0 never animates.
 */
function FrameGroup({
	frame,
	index,
	active,
	beat,
	onSelect,
}: {
	frame: Frame;
	index: number;
	active: boolean;
	beat: number;
	onSelect: (index: number) => void;
}) {
	return (
		<button
			type="button"
			onClick={() => onSelect(index)}
			aria-label={`Render frames/${frame.name}`}
			className="group relative block w-full cursor-pointer text-left transition-colors duration-200 hover:bg-raised/35 focus-visible:outline-none"
		>
			<motion.span
				key={beat}
				aria-hidden="true"
				className={cn(
					"absolute w-[2px] rounded-full bg-thread transition-opacity duration-300",
					active ? "opacity-100" : "opacity-0 group-hover:opacity-30",
				)}
				style={{ left: 51, top: 6, height: ROW_H * 3 - 12, transformOrigin: "top" }}
				initial={beat > 0 ? { scaleY: 0 } : false}
				animate={{ scaleY: 1 }}
				transition={{ duration: 0.44, ease: EASE }}
			/>
			<Row depth={2} kind="folder" name={`${frame.name}/`} accent={active} />
			<Row depth={3} kind="file" name="frame.tsx" size={frame.tsxSize} added={active} addedDelay={120} />
			<Row depth={3} kind="file" name="frame.json" size="62 b" added={active} addedDelay={230} />
		</button>
	);
}

function TreePanel({
	active,
	beats,
	onSelect,
}: {
	active: number;
	beats: readonly number[];
	onSelect: (index: number) => void;
}) {
	return (
		<div
			className="absolute overflow-hidden rounded-lg border border-border bg-bg"
			style={{ left: PANEL_X, top: PANEL_Y, width: PANEL_W, height: PANEL_H }}
		>
			{/* the repo it all sits in, and the branch git already has it on */}
			<div
				className="flex items-center justify-between border-b border-border px-4 font-mono text-xs leading-none"
				style={{ height: HEADER_H }}
			>
				<span>
					<span className="text-muted/55">~/code/</span>
					<span className="text-text">kaffe</span>
				</span>
				<span className="flex items-center gap-1.5 text-muted">
					<BranchGlyph className="text-muted/70" />
					main
				</span>
			</div>

			<div className="flex flex-col">
				{HEAD_ROWS.map((row) => (
					<Row key={row.name} depth={row.depth} kind={row.kind} name={row.name} size={row.size} />
				))}
				{FRAMES.map((frame, i) => (
					<FrameGroup
						key={frame.name}
						frame={frame}
						index={i}
						active={active === i}
						beat={beats[i] ?? 0}
						onSelect={onSelect}
					/>
				))}
				{TAIL_ROWS.map((row) => (
					<Row key={row.name} depth={row.depth} kind={row.kind} name={row.name} size={row.size} />
				))}
			</div>

			<div
				className="absolute inset-x-0 bottom-0 flex items-center justify-between border-t border-border px-4 font-mono text-2xs leading-none text-muted"
				style={{ height: FOOT_H }}
			>
				<span>on disk</span>
				<span>3 frames</span>
			</div>
		</div>
	);
}

/* ---------- the wire: three folders, one junction, one render ---------- */

function legD(frame: Frame): string {
	const y = rowY(frame.row);
	if (y === TRUNK_Y) return `M${PANEL_RIGHT} ${y} H${frame.bus}`;
	const dir = TRUNK_Y > y ? 1 : -1;
	const b = frame.bus;
	return `M${PANEL_RIGHT} ${y} H${b - CORNER} Q${b} ${y} ${b} ${y + dir * CORNER} V${TRUNK_Y}`;
}

const wireD = (frame: Frame): string => `${legD(frame)} H${PLATE_X}`;

/**
 * The switchyard. Every folder's leg is drawn and one is live; the bus out to the
 * render is always live because exactly one file is always the one rendering.
 * pathLength={1} normalizes the comet to path-relative units, so nothing has to be
 * measured to make it run.
 */
function Wire({ active, beat }: { active: number; beat: number }) {
	return (
		<svg
			className="pointer-events-none absolute inset-0 h-full w-full"
			viewBox={`0 0 ${STAGE_W} ${STAGE_H}`}
			fill="none"
			aria-hidden="true"
		>
			{FRAMES.map((frame, i) => (
				<path
					key={frame.name}
					d={legD(frame)}
					stroke="var(--color-thread)"
					strokeOpacity={active === i ? 0.62 : 0.1}
					strokeWidth="1.4"
					strokeLinecap="round"
					className="transition-[stroke-opacity] duration-300"
				/>
			))}
			<path
				d={`M${TRUNK_X} ${TRUNK_Y} H${PLATE_X}`}
				stroke="var(--color-thread)"
				strokeOpacity={0.62}
				strokeWidth="1.4"
				strokeLinecap="round"
			/>
			{FRAMES.map((frame, i) => (
				<circle
					key={frame.name}
					cx={frame.bus}
					cy={TRUNK_Y}
					r="3"
					fill="var(--color-thread)"
					fillOpacity={active === i ? 1 : 0.3}
					className="transition-[fill-opacity] duration-300"
				/>
			))}
			{beat > 0 ? (
				<motion.path
					key={`${active}:${beat}`}
					d={wireD(frameAt(active))}
					pathLength={1}
					stroke="var(--color-thread)"
					strokeWidth="2.2"
					strokeLinecap="round"
					strokeDasharray="0.1 1"
					initial={{ strokeDashoffset: 0.1 }}
					animate={{ strokeDashoffset: -1 }}
					transition={{ duration: 0.78, ease: "easeInOut" }}
				/>
			) : null}
		</svg>
	);
}

/* ---------- the card: the two files, opened ---------- */

/** Two shades for TSX, the house stance: the name in ink, every keyword muted. */
function signature(component: string): ReactNode {
	return (
		<>
			<span className="text-muted/70">export default function </span>
			<span className="text-text">{component}</span>
			<span className="text-muted/70">()</span>
		</>
	);
}

function FileRow({ name, children }: { name: string; children: ReactNode }) {
	return (
		<div className="flex items-center gap-3 leading-[22px]">
			<span className="w-[74px] shrink-0 text-muted">{name}</span>
			<span className="min-w-0 truncate whitespace-pre">{children}</span>
		</div>
	);
}

/**
 * The node on the wire: the folder's address, then what is actually inside its two
 * files. This is the part the old section never showed, so "plain files" stayed a
 * claim. The address resolves the moment you pick; the contents land with the comet.
 */
function FileCard({ active, beat, anim }: { active: number; beat: number; anim: boolean }) {
	const frame = frameAt(active);
	return (
		<div
			className="absolute overflow-hidden rounded-lg border border-border bg-surface"
			style={{ left: CARD_X, top: CARD_Y, width: CARD_W, height: CARD_H }}
		>
			<div className="flex h-[34px] items-center gap-2.5 border-b border-border px-3.5 font-mono text-sm leading-none">
				<motion.span
					className="h-1.5 w-1.5 shrink-0 rounded-full bg-thread"
					animate={anim ? { opacity: [0.42, 1, 0.42] } : { opacity: 0.8 }}
					transition={
						anim
							? { duration: 2.6, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }
							: { duration: 0.3 }
					}
				/>
				<span>
					<span className="text-muted/55">design/frames/</span>
					<span className="text-thread">{frame.name}</span>
					<span className="text-muted/55">/</span>
				</span>
			</div>
			<motion.div
				key={`${active}:${beat}`}
				className="px-3.5 py-3 font-mono text-sm"
				initial={beat > 0 ? { opacity: 0, y: 6 } : false}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.4, ease: EASE, delay: 0.24 }}
			>
				<FileRow name="frame.tsx">{signature(frame.component)}</FileRow>
				<FileRow name="frame.json">{colorJson(SIDECAR)}</FileRow>
			</motion.div>
		</div>
	);
}

/* ---------- the render: the frame those two files are ---------- */

/**
 * The frame on the canvas, labelled the way spool labels one. The plate is chrome
 * and never moves or resizes; the screen inside re-composes as the comet lands, so
 * the swap reads as a render rather than a layout.
 */
function Plate({ active, beat }: { active: number; beat: number }) {
	const frame = frameAt(active);
	return (
		<>
			<div
				className="absolute font-mono text-sm leading-none text-thread"
				style={{ left: PLATE_X, top: PLATE_Y - 22, width: PLATE_W }}
			>
				{frame.name}
			</div>

			<div
				className="absolute overflow-hidden rounded-lg border border-[#E4E4E7] bg-[#FEFEFE]"
				style={{ left: PLATE_X, top: PLATE_Y, width: PLATE_W, height: PLATE_H }}
			>
				{/* The screens crossfade rather than swap. A bare key change unmounts the old
				    screen the instant the beat ticks, and the new one waits out the comet's
				    0.46s at opacity 0 — so the plate sat blank for half a second on every
				    walk, which is the flicker. Holding both mounted lets the outgoing screen
				    carry that delay and hand over on a fade. */}
				<AnimatePresence initial={false}>
					<motion.div
						key={`${active}:${beat}`}
						className="absolute inset-0 h-full w-full"
						initial={beat > 0 ? { opacity: 0, y: 10 } : false}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.46, ease: EASE, delay: 0.46 }}
					>
						{/* the plate is 250x540 and "full" is styled for a 390px phone, so full-scale
					    type overflowed it: the longer english names wrapped to two lines and the
					    rows crowded. "design" is the tier built for this size. */}
						<CoffeeScreen screen={frame.screen} scale="design" className="border-transparent" />
					</motion.div>
				</AnimatePresence>
			</div>
		</>
	);
}

/* ---------- the stage ---------- */

function Stage() {
	const reduce = useReducedMotion();
	const anim = !reduce;

	const [active, setActive] = useState(0);
	const [beats, setBeats] = useState<readonly number[]>([0, 0, 0]);
	const [pausedUntil, setPausedUntil] = useState(0);

	// One move, whether the loop made it or a visitor did: the folder becomes the
	// live one and its own restart counter ticks, which is what re-writes it.
	const goTo = useCallback(
		(index: number) => {
			setActive(index);
			if (anim) setBeats((prev) => prev.map((n, i) => (i === index ? n + 1 : n)));
		},
		[anim],
	);

	// Auto-advance on a slow loop; a take-over holds the wire ~9s, then it resumes.
	useEffect(() => {
		if (!anim) return;
		const wait = Math.max(BEAT_MS, pausedUntil - Date.now());
		const id = window.setTimeout(() => {
			goTo((active + 1) % FRAMES.length);
		}, wait);
		return () => window.clearTimeout(id);
	}, [active, pausedUntil, anim, goTo]);

	function select(index: number) {
		goTo(index);
		setPausedUntil(Date.now() + PAUSE_MS);
	}

	const beat = beats[active] ?? 0;

	return (
		<>
			{/* the render's own light, so the plate sits in the canvas and not on it */}
			<div
				className="pointer-events-none absolute"
				style={{
					left: PLATE_X + PLATE_W / 2 - 300,
					top: TRUNK_Y - 300,
					width: 600,
					height: 600,
					background:
						"radial-gradient(circle, color-mix(in srgb, var(--color-thread) 13%, transparent) 0%, transparent 62%)",
				}}
			/>

			<TreePanel active={active} beats={beats} onSelect={select} />
			<Wire active={active} beat={beat} />
			<FileCard active={active} beat={beat} anim={anim} />
			<Plate active={active} beat={beat} />
		</>
	);
}

export default function SiteDiskWrite() {
	return (
		<SiteSection
			title="Your disk"
			lead="A frame is a folder with two files in it. frame.tsx is the screen, frame.json is where it sits on the canvas."
			foot={[
				"Your agent writes both files straight into your repo.",
				"Commit them, branch them, review them in a pull request.",
			]}
			morph="site-disk-card"
			back={
				<button type="button" data-go="site-hub" aria-label="Back to canvas" className={backChipClass}>
					<span className={backArrowClass}>←</span>
					Canvas
				</button>
			}
		>
			<Stage />
		</SiteSection>
	);
}
