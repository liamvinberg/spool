import { motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { cn } from "../../../shared/lib/utils";
import {
	CoffeeScreen,
	type CoffeeScreenName,
} from "../../../shared/ui/coffee-screens";
import { backArrowClass, backChipClass, SiteSection, STAGE_H, STAGE_W } from "../../../shared/ui/site-section";
import { RestartIcon } from "../../../shared/ui/spool-icons";

/**
 * site-disk--reversible: the "your disk" section of spool.page's
 * canvas-as-navigation site. The claim is ownership, and the strongest way to
 * say it is also the least common: delete the folder and the frame is gone.
 * Most tools cannot say that sentence, so this section performs it instead of
 * printing it.
 *
 * The body is the demo, and the visitor drives it. The finder card on the left
 * is the real folder: three frame folders, each two files. The canvas on the
 * right is the same three folders rendered. Remove a folder and its frame
 * leaves the canvas in the same beat, the tree closes over the gap, and the git
 * strip under the tree flips from history to the one command that undoes it.
 * Press that and the frame comes back. Nothing is lost anywhere in between,
 * which is the second half of the claim: rm is the delete, git is the undo, and
 * there is no third system holding a copy.
 *
 * Sibling of site-states by construction: same shell (SiteSection owns the back
 * chip, heading, lead, stage and the two mono foot lines), same take-over rule
 * (a slow loop walks folder to folder; a click owns the head and pauses the loop
 * ~9s), same boot rule (every animation is initial={false}, so pose 0 composes
 * instantly and a fresh shot lands at rest). The kaffe screens are the sample
 * product, so they wear Instrument Sans; spool's own chrome stays on Familjen
 * Grotesk and Fragment Mono. Geometry is fixed px, never measured. Motion is
 * transform and opacity only, and the card never resizes: rows translate, the
 * git strip crossfades inside a reserved box, and the canvas keeps its holes.
 */

const EASE = [0.22, 1, 0.36, 1] as const;

/* ---------- stage geometry: fixed px inside STAGE_W x STAGE_H ---------- */

const CARD_L = 40;
const CARD_T = 40;
const CARD_W = 380;
const CARD_H = 540;

const HEADER_H = 46;
const ROW_H = 26;
const ROW_COUNT = 12;
const TREE_H = ROW_H * ROW_COUNT + 24;
const BLOCK_H = 94; // the git strip's reserved box: history or the undo, same height

const FW = 220;
const FH = 318;
const TAB_H = 22;
const FGAP = 56;
const STAGGER = 46;

// the three frames sit centred in whatever the card leaves, on a gentle descent
const ROW_SPAN = FW * 3 + FGAP * 2;
const FX0 =
	CARD_L + CARD_W + Math.round((STAGE_W - CARD_L - CARD_W - ROW_SPAN) / 2);
const TAB_Y0 = Math.round((STAGE_H - (TAB_H + FH + STAGGER * 2)) / 2);

const frameX = (i: number): number => FX0 + i * (FW + FGAP);
const frameTabY = (i: number): number => TAB_Y0 + i * STAGGER;

/* ---------- the folder, and the canvas that is the same folder ---------- */

interface FrameSpec {
	name: string;
	screen: CoffeeScreenName;
}

const FRAMES: readonly FrameSpec[] = [
	{ name: "menu", screen: "menu" },
	{ name: "cart", screen: "cart" },
	{ name: "receipt", screen: "receipt" },
];

type RowKind = "dir" | "folder" | "file" | "lock";

interface TreeRowSpec {
	d: number;
	kind: RowKind;
	name: string;
	/** which frame this row belongs to, for folder rows and their two files */
	f?: number;
	/** folders only: whether its children are listed below it */
	shut?: boolean;
}

const ROWS: readonly TreeRowSpec[] = [
	{ d: 0, kind: "dir", name: "frames/" },
	{ d: 1, kind: "folder", name: "menu/", f: 0 },
	{ d: 2, kind: "file", name: "frame.tsx", f: 0 },
	{ d: 2, kind: "file", name: "frame.json", f: 0 },
	{ d: 1, kind: "folder", name: "cart/", f: 1 },
	{ d: 2, kind: "file", name: "frame.tsx", f: 1 },
	{ d: 2, kind: "file", name: "frame.json", f: 1 },
	{ d: 1, kind: "folder", name: "receipt/", f: 2 },
	{ d: 2, kind: "file", name: "frame.tsx", f: 2 },
	{ d: 2, kind: "file", name: "frame.json", f: 2 },
	{ d: 0, kind: "dir", name: "shared/", shut: true },
	{ d: 0, kind: "lock", name: "canvas.json" },
];

/** where each frame's three rows begin, so a removal is one block of three */
const BLOCK_START = [1, 4, 7] as const;
const BLOCK_ROWS = 3;

const LOG: readonly { hash: string; msg: string; t: string }[] = [
	{ hash: "8fe05e5", msg: "add receipt frame", t: "2m" },
	{ hash: "a1c3f90", msg: "add cart frame", t: "9m" },
	{ hash: "3c9d4e1", msg: "add menu frame", t: "21m" },
];

/* ---------- the loop: rest on a folder, remove it, put it back ---------- */

interface Pose {
	head: number;
	gone: number | null;
	ms: number;
}

const ORDER: readonly number[] = [1, 2, 0];

const CYCLE: readonly Pose[] = ORDER.flatMap((i) => [
	{ head: i, gone: null, ms: 4000 },
	{ head: i, gone: i, ms: 3800 },
	{ head: i, gone: null, ms: 2800 },
]);

const PAUSE_MS = 9000;

const restPose = (i: number): number => Math.max(0, ORDER.indexOf(i)) * 3;

/* ---------- glyphs ---------- */

function ChevronGlyph({ open, className }: { open: boolean; className?: string }) {
	return (
		<svg
			viewBox="0 0 12 12"
			fill="none"
			aria-hidden="true"
			className={cn("h-2.5 w-2.5 shrink-0", className)}
			style={open ? { transform: "rotate(90deg)" } : undefined}
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
			<path
				d="M3 1.75h5l3 3v7.5H3z"
				stroke="currentColor"
				strokeWidth="1.15"
				strokeLinejoin="round"
			/>
			<path
				d="M8 1.75v3h3"
				stroke="currentColor"
				strokeWidth="1.15"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function LockGlyph({ className }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 12 12"
			fill="none"
			aria-hidden="true"
			className={cn("h-3 w-3 shrink-0", className)}
		>
			<rect
				x="2.5"
				y="5.25"
				width="7"
				height="4.75"
				rx="1"
				stroke="currentColor"
				strokeWidth="1"
			/>
			<path
				d="M3.9 5.25V4.1a2.1 2.1 0 0 1 4.2 0v1.15"
				stroke="currentColor"
				strokeWidth="1"
			/>
		</svg>
	);
}

function TrashGlyph({ className }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 12 12"
			fill="none"
			aria-hidden="true"
			className={cn("h-2.5 w-2.5 shrink-0", className)}
		>
			<path
				d="M2.4 3.4h7.2M4.7 3.4V2.3h2.6v1.1M3.6 3.4l.4 6.2h4l.4-6.2"
				stroke="currentColor"
				strokeWidth="1"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

/** A filename with its extension a shade dimmer. */
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

/* ---------- the finder card ---------- */

/** The contents of one tree row, identical whether the row is clickable or not. */
function RowInner({ row, isHead }: { row: TreeRowSpec; isHead: boolean }) {
	const isFolder = row.kind === "dir" || row.kind === "folder";
	return (
		<>
			<span className="flex w-4 shrink-0 items-center justify-center">
				{isFolder ? (
					<ChevronGlyph
						open={row.shut !== true}
						className={isHead ? "text-thread" : "text-muted"}
					/>
				) : row.kind === "lock" ? (
					<LockGlyph className="text-muted opacity-45" />
				) : (
					<FileGlyph className="text-muted opacity-80" />
				)}
			</span>
			<span
				className={cn(
					"min-w-0 truncate",
					isFolder ? (isHead ? "text-thread" : "text-text") : "text-muted",
					row.kind === "lock" && "opacity-45",
				)}
			>
				{isFolder ? row.name : <FileName name={row.name} />}
			</span>
			{row.kind === "folder" ? (
				<span
					className={cn(
						"ml-auto inline-flex items-center gap-1 rounded border px-1.5 py-[3px] font-mono text-2xs leading-none transition-colors",
						isHead
							? "border-border-raised text-muted opacity-100"
							: "border-border-raised text-muted opacity-0 group-hover:opacity-100",
						"group-hover:border-thread/55 group-hover:text-thread",
					)}
				>
					<TrashGlyph />
					delete
				</span>
			) : null}
		</>
	);
}

/**
 * One line on disk. Rows never reflow: each sits at its own fixed top and
 * translates, so a removed block collapses as three rows fading out while
 * everything under them slides up by exactly their height.
 */
function TreeRow({
	row,
	index,
	head,
	gone,
	onRemove,
}: {
	row: TreeRowSpec;
	index: number;
	head: number;
	gone: number | null;
	onRemove: (i: number) => void;
}) {
	const f = row.f;
	const hidden = f !== undefined && f === gone;
	const isHead = f !== undefined && f === head && row.kind === "folder";
	const past =
		gone === null ? false : index > (BLOCK_START[gone] ?? 0) + BLOCK_ROWS - 1;

	const style = {
		top: index * ROW_H,
		height: ROW_H,
		paddingLeft: 12 + row.d * 18,
	};
	const anim = {
		y: past ? -ROW_H * BLOCK_ROWS : 0,
		opacity: hidden ? 0 : 1,
	};
	const transition = { duration: 0.4, ease: EASE };

	if (row.kind === "folder" && f !== undefined) {
		return (
			<motion.button
				type="button"
				onClick={() => onRemove(f)}
				aria-label={`delete the ${row.name.replace("/", "")} folder`}
				className={cn(
					"group absolute inset-x-0 flex cursor-pointer items-center gap-1.5 rounded-[5px] pr-2 text-left font-mono text-[13px] transition-colors focus-visible:outline-none",
					isHead ? "bg-raised/45" : "hover:bg-raised/35",
				)}
				style={{ ...style, pointerEvents: hidden ? "none" : "auto" }}
				initial={false}
				animate={anim}
				transition={transition}
			>
				<RowInner row={row} isHead={isHead} />
			</motion.button>
		);
	}

	return (
		<motion.div
			className="absolute inset-x-0 flex items-center gap-1.5 pr-2 font-mono text-[13px]"
			style={style}
			initial={false}
			animate={anim}
			transition={transition}
		>
			<RowInner row={row} isHead={false} />
		</motion.div>
	);
}

/** One quiet line of history. */
function LogLine({ hash, msg, t }: { hash: string; msg: string; t: string }) {
	return (
		<div className="flex h-[22px] items-center gap-3 font-mono text-[11px] leading-none text-muted/75">
			<span className="shrink-0 text-muted/45">{hash}</span>
			<span className="min-w-0 flex-1 truncate">{msg}</span>
			<span className="shrink-0 text-muted/45">{t}</span>
		</div>
	);
}

/** One deleted path, the way git status prints it. */
function DeletedLine({ path, file }: { path: string; file: string }) {
	return (
		<div className="flex h-[22px] items-center gap-3 font-mono text-[11px] leading-none">
			<span className="w-2.5 shrink-0 text-thread/75">D</span>
			<span className="min-w-0 truncate">
				<span className="text-muted/55">{path}</span>
				<span className="text-muted">{file}</span>
			</span>
		</div>
	);
}

/**
 * The git strip. One reserved box, two faces: the history while the tree is
 * whole, and while something is missing the two paths git still holds plus the
 * command that puts them back. The undo is heavier than the delete on purpose.
 */
function GitStrip({
	head,
	gone,
	onRestore,
}: {
	head: number;
	gone: number | null;
	onRestore: () => void;
}) {
	// read off head, not gone, so the copy holds still through the crossfade
	const target = FRAMES[head]?.name ?? "";
	const dir = `design/frames/${target}/`;
	const clean = gone === null;

	return (
		<div className="flex flex-1 flex-col px-4 py-4">
			<div className="flex h-[18px] items-center justify-between font-mono text-2xs leading-none">
				<span className="flex items-center gap-2 text-muted">
					<span className="h-1.5 w-1.5 rounded-full bg-muted/55" />
					main
				</span>
				<span className="text-muted/70">
					{clean ? "working tree clean" : "1 folder removed"}
				</span>
			</div>

			<div className="relative mt-3.5" style={{ height: BLOCK_H }}>
				<motion.div
					className="absolute inset-0 flex flex-col justify-between"
					style={{ pointerEvents: clean ? "auto" : "none" }}
					initial={false}
					animate={{ opacity: clean ? 1 : 0 }}
					transition={{ duration: 0.26, ease: "easeInOut" }}
				>
					{LOG.map((entry) => (
						<LogLine
							key={entry.hash}
							hash={entry.hash}
							msg={entry.msg}
							t={entry.t}
						/>
					))}
				</motion.div>

				<motion.div
					className="absolute inset-0 flex flex-col justify-center"
					style={{ pointerEvents: clean ? "none" : "auto" }}
					initial={false}
					animate={{ opacity: clean ? 0 : 1 }}
					transition={{ duration: 0.26, ease: "easeInOut" }}
				>
					<DeletedLine path={dir} file="frame.tsx" />
					<DeletedLine path={dir} file="frame.json" />
					<button
						type="button"
						onClick={onRestore}
						aria-label={`restore the ${target} folder`}
						className="mt-2.5 flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-md border border-thread/50 bg-thread/[0.07] px-3 font-mono text-[11px] leading-none text-text transition-colors hover:border-thread/85 hover:bg-thread/[0.14] focus-visible:outline-none"
					>
						<RestartIcon className="h-3 w-3 shrink-0 text-thread" />
						<span className="min-w-0 truncate">
							git restore <span className="text-muted">design/frames/</span>
							{target}
						</span>
					</button>
				</motion.div>
			</div>
		</div>
	);
}

/** The folder itself: path, the tree, and git underneath it. */
function DiskCard({
	head,
	gone,
	anim,
	onRemove,
	onRestore,
}: {
	head: number;
	gone: number | null;
	anim: boolean;
	onRemove: (i: number) => void;
	onRestore: () => void;
}) {
	return (
		<div
			className="absolute flex flex-col overflow-hidden rounded-xl border border-border bg-surface"
			style={{ left: CARD_L, top: CARD_T, width: CARD_W, height: CARD_H }}
		>
			{/* the path, and what is currently in it */}
			<div
				className="flex shrink-0 items-center justify-between border-b border-border px-4"
				style={{ height: HEADER_H }}
			>
				<span className="flex items-center gap-2.5 font-mono text-xs leading-none">
					<motion.span
						className="h-1.5 w-1.5 shrink-0 rounded-full bg-thread"
						animate={anim ? { opacity: [0.42, 1, 0.42] } : { opacity: 0.8 }}
						transition={
							anim
								? {
										duration: 2.6,
										repeat: Number.POSITIVE_INFINITY,
										ease: "easeInOut",
									}
								: { duration: 0.3 }
						}
					/>
					<span>
						<span className="text-muted/55">~/kaffe/</span>
						<span className="text-text">design</span>
					</span>
				</span>
				<span className="font-mono text-2xs leading-none text-muted tabular-nums">
					{gone === null ? 3 : 2} frames
				</span>
			</div>

			{/* the tree */}
			<div className="relative shrink-0" style={{ height: TREE_H }}>
				<div
					className="absolute inset-x-2"
					style={{ top: 12, height: ROW_H * ROW_COUNT }}
				>
					{/* the play head: a thread rule that glides to whichever folder is live */}
					<motion.span
						className="pointer-events-none absolute left-[22px] w-[2px] rounded-full bg-thread"
						style={{ top: 0, height: ROW_H * BLOCK_ROWS - 10 }}
						initial={false}
						animate={{
							y: (BLOCK_START[head] ?? BLOCK_START[0]) * ROW_H + 5,
							opacity: gone === null ? 1 : 0,
						}}
						transition={{
							y: { type: "spring", stiffness: 200, damping: 26, mass: 0.9 },
							opacity: { duration: 0.24, ease: "easeInOut" },
						}}
					/>
					{ROWS.map((row, i) => (
						<TreeRow
							key={`${row.d}:${row.name}:${row.f ?? "x"}`}
							row={row}
							index={i}
							head={head}
							gone={gone}
							onRemove={onRemove}
						/>
					))}
				</div>
			</div>

			<div className="mt-auto border-t border-border" />
			<GitStrip head={head} gone={gone} onRestore={onRestore} />
		</div>
	);
}

/* ---------- the canvas: the same three folders, rendered ---------- */

/**
 * One frame standing on the canvas. It never unmounts, it just stops being
 * there: opacity and scale only, so the neighbours hold their coordinates and
 * the gap it leaves is a real gap. Leaving is quick and arriving springs, which
 * is the whole difference between losing something and putting it back.
 */
function CanvasFrame({
	spec,
	index,
	head,
	gone,
	arrive,
}: {
	spec: FrameSpec;
	index: number;
	head: number;
	gone: number | null;
	arrive: number;
}) {
	const missing = gone === index;
	const isHead = head === index;
	return (
		<motion.div
			className="absolute"
			style={{ left: frameX(index), top: frameTabY(index), width: FW }}
			initial={false}
			animate={{ opacity: missing ? 0 : 1, scale: missing ? 0.94 : 1 }}
			transition={
				missing
					? { duration: 0.26, ease: "easeIn" }
					: {
							type: "spring",
							stiffness: 210,
							damping: 22,
							mass: 0.7,
							delay: 0.1,
						}
			}
		>
			<div
				className="flex items-center gap-2 font-mono text-xs leading-none"
				style={{ height: TAB_H }}
			>
				<span
					className={cn(
						"h-1.5 w-1.5 rounded-full",
						isHead ? "bg-thread" : "bg-muted/45",
					)}
				/>
				<span className={isHead ? "text-text" : "text-muted/70"}>
					{spec.name}
				</span>
			</div>
			<div className="relative" style={{ width: FW, height: FH }}>
				<CoffeeScreen screen={spec.screen} scale="design" />
				<span
					className={cn(
						"pointer-events-none absolute -inset-[3px] rounded-[15px] border border-thread/35 transition-opacity duration-300",
						isHead ? "opacity-100" : "opacity-0",
					)}
				/>
				{arrive > 0 ? (
					<motion.span
						key={arrive}
						className="pointer-events-none absolute -inset-[6px] rounded-[18px] border-[1.5px] border-thread"
						initial={{ opacity: 0.9, scale: 0.99 }}
						animate={{ opacity: 0, scale: 1.02 }}
						transition={{ duration: 0.72, ease: "easeOut" }}
					/>
				) : null}
			</div>
		</motion.div>
	);
}

/* ---------- the stage ---------- */

function Stage() {
	const reduce = useReducedMotion();
	const anim = !reduce;

	const [cursor, setCursor] = useState(0);
	const [head, setHead] = useState(ORDER[0] ?? 0);
	const [gone, setGone] = useState<number | null>(null);
	// which frame just came back, and how many times: the arrival ring's key
	const [arrive, setArrive] = useState<{ i: number; n: number }>({
		i: -1,
		n: 0,
	});
	const [pausedUntil, setPausedUntil] = useState(0);

	// One pose applied, whether the loop asked for it or a visitor did.
	const apply = useCallback(
		(next: number) => {
			const at = ((next % CYCLE.length) + CYCLE.length) % CYCLE.length;
			const pose = CYCLE[at];
			if (!pose) return;
			if (gone !== null && pose.gone === null) {
				setArrive((prev) => ({ i: gone, n: prev.n + 1 }));
			}
			setCursor(at);
			setHead(pose.head);
			setGone(pose.gone);
		},
		[gone],
	);

	// Auto-advance on a slow loop; a take-over holds the pose ~9s, then it resumes
	// from the rest beat of whatever the visitor left on screen.
	useEffect(() => {
		if (!anim) return;
		const dwell = CYCLE[cursor]?.ms ?? 3600;
		const wait = Math.max(dwell, pausedUntil - Date.now());
		const id = window.setTimeout(() => apply(cursor + 1), wait);
		return () => window.clearTimeout(id);
	}, [cursor, pausedUntil, anim, apply]);

	const remove = useCallback(
		(i: number) => {
			// clicking a second folder while one is missing puts the first one back
			if (gone !== null && gone !== i) {
				setArrive((prev) => ({ i: gone, n: prev.n + 1 }));
			}
			setHead(i);
			setGone(i);
			setCursor(restPose(i) + 1);
			setPausedUntil(Date.now() + PAUSE_MS);
		},
		[gone],
	);

	const restore = useCallback(() => {
		if (gone === null) return;
		setArrive((prev) => ({ i: gone, n: prev.n + 1 }));
		setGone(null);
		setCursor(restPose(head) + 2);
		setPausedUntil(Date.now() + PAUSE_MS);
	}, [gone, head]);

	return (
		<>
			<DiskCard
				head={head}
				gone={gone}
				anim={anim}
				onRemove={remove}
				onRestore={restore}
			/>
			{FRAMES.map((spec, i) => (
				<CanvasFrame
					key={spec.name}
					spec={spec}
					index={i}
					head={head}
					gone={gone}
					arrive={arrive.i === i ? arrive.n : 0}
				/>
			))}
		</>
	);
}

export default function SiteDiskReversible() {
	return (
		<SiteSection
			title="your disk"
			lead="one folder per frame, in your repo. delete it and the frame is gone."
			foot={[
				"no cloud, no database, no account. a frame is its folder.",
				"deleting is rm. restoring is git. spool never had a copy.",
			]}
			morph="site-disk-card"
			back={
				<button type="button" data-go="site-hub" aria-label="back to canvas" className={backChipClass}>
					<span className={backArrowClass}>←</span>
					canvas
				</button>
			}
		>
			<Stage />
		</SiteSection>
	);
}
