import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { createPortal } from "react-dom";
import { pageSlot } from "../../page-path";
import { coverUrl, type ProjectedFrame } from "../api";
import { cn } from "../cn";
import { Thumbnail } from "../primitives/display";
import { holdsLine, type PageListRow, type PageWorld, pageListRows } from "./page-list";
import { PEEK_MAP, peekFit } from "./page-peek";
import { cardHeight, PEEK_CARD_W, PEEK_FOOT, PEEK_HEAD, type Peek, type PeekTarget } from "./use-page-peek";

/**
 * The peek's card (spool#224): one folder as its stills, beside whatever opened
 * it. The picture is the folder's frames where their frame.json puts them, each
 * the still the photo booth already keeps, so nothing on another page boots for
 * it. A folder of only folders shows those, each by its first still. Every
 * card is one size, so walking with the arrows moves it by transform alone
 * while the stills inside cross over from the side the arrow went.
 */

/** one of the motion scale's durations, in seconds, as the page has it */
function seconds(name: "fast" | "quick" | "slow"): number {
	if (typeof document === "undefined" || typeof getComputedStyle !== "function") return 0;
	const value = getComputedStyle(document.documentElement).getPropertyValue(`--transition-duration-${name}`).trim();
	const n = Number.parseFloat(value);
	return Number.isFinite(n) ? n / (value.endsWith("ms") ? 1000 : 1) : 0;
}

const EASE = [0.22, 0.61, 0.36, 1] as const;

export function PagePeekCard({
	project,
	peek,
	world,
	label,
	target,
	carried,
	onGo,
	onFrame,
}: {
	project: string;
	peek: Peek | null;
	world: PageWorld;
	/** a page as the card names it: the project for the root */
	label: (page: string) => string;
	/** where a drag is aimed, which lights a cell or draws the spot on the map */
	target: PeekTarget | null;
	/** the frame being carried, whose outline stands on the spot */
	carried: ProjectedFrame | null;
	onGo: (page: string) => void;
	onFrame: (name: string) => void;
}) {
	const still = useReducedMotion() === true;
	const move = still ? { duration: 0 } : { type: "spring" as const, visualDuration: seconds("slow"), bounce: 0 };
	const fade = { duration: still ? 0 : seconds("fast"), ease: EASE };
	const from = peek?.from === "path" ? { x: 0, y: -6 } : { x: -6, y: 0 };
	const shift = still ? 0 : 10;
	return createPortal(
		<AnimatePresence>
			{peek === null ? null : (
				<motion.div
					key="peek"
					data-peek-card=""
					className="fixed top-0 left-0 z-50"
					initial={{ opacity: 0, x: peek.left + from.x, y: peek.top + from.y }}
					animate={{ opacity: 1, x: peek.left, y: peek.top }}
					exit={{
						opacity: 0,
						x: peek.left + from.x,
						y: peek.top + from.y,
						transition: { duration: still ? 0 : seconds("quick") },
					}}
					transition={{ x: move, y: move, opacity: fade }}
				>
					<div
						role="dialog"
						aria-label={`Peek at ${label(peek.page)}`}
						className="overflow-hidden rounded-md border border-line-strong bg-surface-raised shadow-float"
						style={{ width: PEEK_CARD_W }}
					>
						<div className="relative overflow-hidden" style={{ height: cardHeight(false) }}>
							<AnimatePresence initial={false} custom={peek.dir} mode="popLayout">
								<motion.div
									key={peek.page}
									custom={peek.dir}
									variants={{
										enter: (d: number) => ({ opacity: 0, y: d * shift }),
										rest: { opacity: 1, y: 0 },
										leave: (d: number) => ({ opacity: 0, y: -d * shift }),
									}}
									initial="enter"
									animate="rest"
									exit="leave"
									transition={{ y: move, opacity: fade }}
									className="absolute inset-0"
								>
									<PeekBody
										project={project}
										page={peek.page}
										world={world}
										label={label}
										target={target?.page === peek.page || target?.at === "peek" ? target : null}
										carried={carried}
										onGo={onGo}
										onFrame={onFrame}
									/>
								</motion.div>
							</AnimatePresence>
						</div>
						{peek.why === "drop" ? (
							<p className="px-3 pb-2.5 text-tertiary type-caption">
								Let go on the picture to put it on that spot.
							</p>
						) : null}
					</div>
				</motion.div>
			)}
		</AnimatePresence>,
		document.body,
	);
}

function PeekBody({
	project,
	page,
	world,
	label,
	target,
	carried,
	onGo,
	onFrame,
}: {
	project: string;
	page: string;
	world: PageWorld;
	label: (page: string) => string;
	target: PeekTarget | null;
	carried: ProjectedFrame | null;
	onGo: (page: string) => void;
	onFrame: (name: string) => void;
}) {
	const own = world.frames.filter((frame) => pageSlot(frame) === page);
	const subs = pageListRows(page, world);
	const count = own.length + subs.reduce((total, sub) => total + sub.count, 0);
	return (
		<>
			<div className="flex items-center gap-2 px-3" style={{ height: PEEK_HEAD }}>
				<span className="min-w-0 flex-1 truncate text-primary type-value">{label(page)}</span>
				<span className="shrink-0 text-secondary tabular-nums type-detail">
					{holdsLine({ count, holds: subs.map((sub) => sub.name) })}
				</span>
			</div>
			<div className="px-3" style={{ paddingBottom: PEEK_FOOT }}>
				{own.length > 0 || subs.length === 0 ? (
					<PeekMap
						project={project}
						page={page}
						frames={own}
						spot={target?.page === page ? (target.spot ?? null) : null}
						carried={carried}
						onFrame={onFrame}
					/>
				) : (
					<PeekGrid project={project} subs={subs} lit={target?.at === "peek" ? target.page : null} onGo={onGo} />
				)}
			</div>
		</>
	);
}

/** a folder of frames: its stills where frame.json puts them, one flat picture; a still goes to its frame */
function PeekMap({
	project,
	page,
	frames,
	spot,
	carried,
	onFrame,
}: {
	project: string;
	page: string;
	frames: readonly ProjectedFrame[];
	spot: { readonly mx: number; readonly my: number } | null;
	carried: ProjectedFrame | null;
	onFrame: (name: string) => void;
}) {
	const fit = peekFit(frames, PEEK_MAP.w, PEEK_MAP.h);
	return (
		<div
			data-peek-map={page}
			data-peek-fit={`${fit.s} ${fit.ox} ${fit.oy}`}
			className={cn(
				"relative overflow-hidden rounded-xs border bg-surface-canvas transition-colors duration-fast ease-out",
				spot !== null ? "border-accent" : "border-line-default hover:border-line-strong",
			)}
			style={{ width: PEEK_MAP.w, height: PEEK_MAP.h }}
		>
			{frames.map((frame) => (
				<Thumbnail
					key={frame.name}
					role="button"
					aria-label={`Go to ${frame.name}`}
					onClick={() => onFrame(frame.name)}
					src={frame.cover === undefined ? undefined : coverUrl(project, frame.name, frame.cover.hash)}
					className="absolute cursor-pointer rounded-xs"
					style={{
						left: (frame.x - fit.ox) * fit.s,
						top: (frame.y - fit.oy) * fit.s,
						width: Math.max(2, frame.w * fit.s),
						height: Math.max(2, frame.h * fit.s),
					}}
				/>
			))}
			{spot === null || carried === null ? null : (
				<span
					aria-hidden="true"
					className="pointer-events-none absolute top-0 left-0 rounded-xs outline outline-1 outline-accent"
					style={{
						transform: `translate(${spot.mx - (carried.w * fit.s) / 2}px, ${spot.my - (carried.h * fit.s) / 2}px)`,
						width: carried.w * fit.s,
						height: carried.h * fit.s,
					}}
				/>
			)}
		</div>
	);
}

/** a folder of only folders: each by its first still and its name; a frame let go on one moves there */
function PeekGrid({
	project,
	subs,
	lit,
	onGo,
}: {
	project: string;
	subs: readonly PageListRow[];
	lit: string | null;
	onGo: (page: string) => void;
}) {
	const cols = subs.length <= 2 ? 2 : subs.length <= 6 ? 3 : 4;
	const gap = 8;
	const cw = (PEEK_MAP.w - gap * (cols - 1)) / cols;
	return (
		<div
			className="grid content-start overflow-hidden"
			style={{ width: PEEK_MAP.w, height: PEEK_MAP.h, gridTemplateColumns: `repeat(${cols}, ${cw}px)`, gap }}
		>
			{subs.map((sub) => (
				<button
					key={sub.page}
					type="button"
					data-drop-page={sub.page}
					data-drop-at="peek"
					onClick={() => onGo(sub.page)}
					className="flex min-w-0 cursor-pointer flex-col gap-1 text-left"
				>
					<Thumbnail
						aria-selected={lit === sub.page}
						src={sub.still?.hash === undefined ? undefined : coverUrl(project, sub.still.frame, sub.still.hash)}
						style={{ width: cw, height: Math.round(cw * 0.66) }}
					/>
					<span className="flex min-w-0 items-center gap-1.5">
						<span
							className={cn(
								"min-w-0 truncate type-detail",
								lit === sub.page ? "text-accent-strong" : "text-primary",
							)}
						>
							{sub.name}
						</span>
						<span className="shrink-0 text-tertiary tabular-nums type-detail">{sub.count}</span>
					</span>
				</button>
			))}
		</div>
	);
}
