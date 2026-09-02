import { motion } from "motion/react";
import { cn } from "shared/lib/utils";
import { CoffeeScreen, type CoffeeScreenName } from "shared/ui/demo/coffee-screens";

/**
 * What can honestly stand in for the field before its shape is known.
 *
 * The boot has two facts at the first painted pixel, both already in the app
 * shell's hands from /api/projects: the exact `frameCount`, and up to three
 * real covers, freshest capture first. Everything else — page names, per-page
 * counts, frame names, geometry — arrives only when /api/p/:project/frames
 * answers, and that is most of the wait.
 *
 * So the line each take is drawn against is: does this cell, this bead, this
 * picture exist at T0, or is it a name the boot cannot know yet? Four answers,
 * one per frame, all sitting in `BootShell` so the only variable is the field.
 *
 * The project under all four is the same fiction: 61 frames across 9 pages,
 * 8 of them on the page the camera opens on.
 */

/** the one number that is true at the first pixel */
const FRAME_COUNT = 61;

/** the field inside BootShell: 1440 less both rails, 900 less the tab bar */
const FIELD_W = 892;

/* ------------------------------------------------------------------- count */

const COUNT_COLUMNS = 12;
const CELL_W = 52;
const CELL_H = 32;
const CELL_GAP = 10;

/**
 * The take that admits it does not know anything else. One empty cell per
 * frame, every cell the same size, laid out as a centred grid with a ragged
 * last row — a rule the canvas itself never uses, so nobody can read placement
 * into it. No names, no aspect ratios, no thumbnails. The count is the whole
 * claim, and the count is exact.
 *
 * The wave crossing it is off-white rather than thread red: red on this canvas
 * means selection or a walk, and neither is true here.
 */
export function CountBoot() {
	const cells = Array.from({ length: FRAME_COUNT }, (_, index) => index);
	return (
		<div className="flex h-full flex-col items-center justify-center gap-4 pb-16">
			<span className="font-mono text-muted/70 text-sm leading-sm">{FRAME_COUNT} frames</span>
			<div
				className="grid"
				style={{
					gridTemplateColumns: `repeat(${COUNT_COLUMNS}, ${CELL_W}px)`,
					gap: CELL_GAP,
					width: COUNT_COLUMNS * CELL_W + (COUNT_COLUMNS - 1) * CELL_GAP,
				}}
			>
				{cells.map((index) => {
					const column = index % COUNT_COLUMNS;
					const row = Math.floor(index / COUNT_COLUMNS);
					return (
						<div
							key={index}
							className="relative rounded-xs border border-border-raised bg-surface"
							style={{ height: CELL_H }}
						>
							<motion.span
								className="absolute inset-0 rounded-xs bg-text"
								animate={{ opacity: [0, 0.09, 0] }}
								transition={{
									duration: 2.4,
									delay: (column + row) * 0.06,
									ease: "easeInOut",
									repeat: Number.POSITIVE_INFINITY,
									repeatDelay: 1.1,
								}}
							/>
						</div>
					);
				})}
			</div>
		</div>
	);
}

/* ------------------------------------------------------------------ covers */

interface Cover {
	readonly screen: CoffeeScreenName;
}

/** what /api/projects already handed over: up to three, freshest capture first */
const COVERS: readonly Cover[] = [{ screen: "cart" }, { screen: "receipt" }, { screen: "menu" }];

const COVER_W = 248;
const COVER_H = 537;
const COVER_CYCLE = 4.6;

/**
 * The take that draws nothing invented at all. The three covers the shell is
 * already holding are real pictures of real frames, so they go in the field at
 * a size worth looking at, freshest on the left, and the field holds nothing
 * else.
 *
 * They wear no names, which is both honest and the visible difference from a
 * loaded canvas: on the canvas every frame carries its label above it, and
 * these cannot, because the covers arrive without them.
 */
export function CoversBoot() {
	return (
		<div className="flex h-full flex-col items-center justify-center gap-5 pb-16">
			<div className="flex items-start gap-8">
				{COVERS.map((cover, index) => (
					<motion.div
						key={cover.screen}
						className="relative overflow-hidden rounded-lg"
						style={{ width: COVER_W, height: COVER_H }}
						initial={{ y: 0 }}
						animate={{ y: [0, -6, 0] }}
						transition={{
							duration: COVER_CYCLE,
							delay: index * 0.16,
							ease: "easeInOut",
							repeat: Number.POSITIVE_INFINITY,
						}}
					>
						<CoffeeScreen screen={cover.screen} />
						{/* a cover is a picture, not a mounted document: one slow pass of the
						    canvas over it says so without dimming what was actually captured */}
						<motion.span
							className="pointer-events-none absolute inset-0 rounded-lg bg-canvas"
							animate={{ opacity: [0.14, 0.02, 0.14] }}
							transition={{
								duration: COVER_CYCLE,
								delay: index * 0.16,
								ease: "easeInOut",
								repeat: Number.POSITIVE_INFINITY,
							}}
						/>
					</motion.div>
				))}
			</div>
			<span className="font-mono text-muted/70 text-sm leading-sm">3 of {FRAME_COUNT} pictured</span>
		</div>
	);
}

/* ------------------------------------------------------------------- beads */

const STRAND = { x0: 44, y0: 452, x1: 254, y1: 282, x2: 620, y2: 546, x3: 796, y3: 358 } as const;

function cubic(a: number, b: number, c: number, d: number, t: number): number {
	const u = 1 - t;
	return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
}

const BEADS = Array.from({ length: FRAME_COUNT }, (_, index) => {
	const t = index / (FRAME_COUNT - 1);
	return {
		index,
		x: cubic(STRAND.x0, STRAND.x1, STRAND.x2, STRAND.x3, t),
		y: cubic(STRAND.y0, STRAND.y1, STRAND.y2, STRAND.y3, t),
	};
});

const STRAND_PATH = `M${STRAND.x0} ${STRAND.y0}C${STRAND.x1} ${STRAND.y1} ${STRAND.x2} ${STRAND.y2} ${STRAND.x3} ${STRAND.y3}`;

/**
 * The take that refuses to be frame-shaped. 61 beads strung on one thread —
 * the same hairline the canvas draws between two frames — because a rectangle
 * is a promise about a rectangle and a bead is not. Nothing here can be
 * mistaken for placement, so when the real field lands it reads as an arrival
 * rather than as a correction of something that was wrong.
 *
 * The strand is muted and only the wave travelling it is thread red, so the
 * accent means motion here and nothing else.
 */
export function BeadsBoot() {
	return (
		<div className="absolute inset-0">
			<svg viewBox="0 0 892 856" className="h-full w-full" fill="none" aria-hidden="true">
				<title>opening</title>
				<path d={STRAND_PATH} stroke="var(--color-thread)" strokeOpacity={0.35} strokeWidth={1.5} />
				{BEADS.map((bead) => (
					<g key={bead.index}>
						<circle cx={bead.x} cy={bead.y} r={3.2} fill="var(--color-muted)" fillOpacity={0.55} />
						<motion.circle
							cx={bead.x}
							cy={bead.y}
							r={3.6}
							fill="var(--color-thread)"
							animate={{ opacity: [0, 1, 0] }}
							transition={{
								duration: 1.5,
								delay: bead.index * 0.03,
								ease: "easeInOut",
								repeat: Number.POSITIVE_INFINITY,
								repeatDelay: 1.4,
							}}
						/>
					</g>
				))}
			</svg>
			{/* the tally sits where the strand runs out, so the number reads as a count
			    of the beads rather than as a caption floating over the field */}
			<span
				className="pointer-events-none absolute font-mono text-muted/70 text-sm leading-sm"
				style={{ left: STRAND.x3 + 16, top: STRAND.y3 - 9 }}
			>
				{FRAME_COUNT} frames
			</span>
		</div>
	);
}

/* -------------------------------------------------------------------- deal */

interface Landing {
	readonly name: string;
	readonly x: number;
	readonly y: number;
	readonly w: number;
	readonly h: number;
}

/**
 * Where the 8 frames of the opening page actually sit once /frames answers.
 * Real names, because after the answer the names are real; the deck before it
 * carries none.
 */
const LANDINGS: readonly Landing[] = [
	{ name: "spool-home", x: 46, y: 96, w: 264, h: 165 },
	{ name: "spool-canvas", x: 334, y: 96, w: 264, h: 165 },
	{ name: "spool-player", x: 622, y: 96, w: 264, h: 165 },
	{ name: "menu", x: 46, y: 316, w: 76, h: 165 },
	{ name: "cart", x: 146, y: 316, w: 76, h: 165 },
	{ name: "receipt", x: 246, y: 316, w: 76, h: 165 },
	{ name: "spool-system", x: 346, y: 316, w: 264, h: 165 },
	{ name: "spool-empty-project", x: 622, y: 316, w: 264, h: 165 },
];

/** 9 pages, 61 frames, and the page the camera opens on holds the 8 above */
const DEAL_PAGES: readonly { readonly name: string; readonly count: number; readonly active: boolean }[] = [
	{ name: "app", count: 8, active: true },
	{ name: "agent", count: 11, active: false },
	{ name: "booting", count: 10, active: false },
	{ name: "components", count: 4, active: false },
	{ name: "directing", count: 3, active: false },
	{ name: "explorer", count: 2, active: false },
	{ name: "manipulate", count: 12, active: false },
	{ name: "play-tab", count: 4, active: false },
	{ name: "site", count: 7, active: false },
];

const DEAL_CYCLE = 5.6;
const CARD_W = 200;
const CARD_H = 126;
const FAN_X = 0.75;
const FAN_Y = 0.45;
/** the fan is centred on itself, so the deck sits in the middle of the field */
const DECK_X = FIELD_W / 2 - CARD_W / 2 - (FRAME_COUNT * FAN_X) / 2;
const DECK_Y = 356 + (FRAME_COUNT * FAN_Y) / 2;
const DECK_TOP = DECK_Y - FRAME_COUNT * FAN_Y;
/** the deal starts here and each landing card leaves a beat after the last */
const DEAL_AT = 0.5;
const DEAL_STEP = 0.014;
const DEAL_RUN = 0.13;
const SETTLED = 0.9;

/**
 * The take that shows the moment itself. 61 cards in one fanned deck at the
 * middle of the field: the count is the only thing the deck asserts, and a
 * stack is not a layout, so it cannot be read as a guess at one.
 *
 * Then /frames answers. The 8 cards belonging to the page the camera opens on
 * deal out to their true geometry and pick up their true names; the other 53
 * belong to other pages, so they leave the field and turn up in the rail as
 * rows. Nothing is corrected, because nothing had been claimed.
 */
export function DealBoot() {
	const cards = Array.from({ length: FRAME_COUNT }, (_, index) => index);
	return (
		<div className="absolute inset-0">
			<motion.span
				className="absolute font-mono text-muted/70 text-sm leading-sm"
				style={{ left: 0, top: DECK_TOP - 30, width: FIELD_W, textAlign: "center" }}
				animate={{ opacity: [1, 1, 0, 0, 0] }}
				transition={{
					duration: DEAL_CYCLE,
					times: [0, DEAL_AT, DEAL_AT + 0.06, SETTLED, 1],
					ease: "easeInOut",
					repeat: Number.POSITIVE_INFINITY,
				}}
			>
				{FRAME_COUNT} frames
			</motion.span>
			{cards.map((index) => {
				const landing = LANDINGS[index];
				const deckX = DECK_X + index * FAN_X;
				const deckY = DECK_Y - index * FAN_Y;
				if (landing === undefined) {
					return (
						<motion.div
							key={index}
							className="absolute rounded-md border border-border-raised bg-surface"
							style={{ left: deckX, top: deckY, width: CARD_W, height: CARD_H }}
							animate={{ opacity: [1, 1, 0, 0, 0] }}
							transition={{
								duration: DEAL_CYCLE,
								times: [0, DEAL_AT, DEAL_AT + 0.09, SETTLED, 1],
								ease: "easeInOut",
								repeat: Number.POSITIVE_INFINITY,
							}}
						/>
					);
				}
				const start = DEAL_AT + index * DEAL_STEP;
				const end = start + DEAL_RUN;
				const times = [0, start, end, SETTLED, 1];
				return (
					<motion.div
						key={index}
						className="absolute"
						style={{ left: 0, top: 0, width: CARD_W, height: CARD_H }}
						animate={{
							x: [deckX, deckX, landing.x, landing.x, landing.x],
							y: [deckY, deckY, landing.y, landing.y, landing.y],
							width: [CARD_W, CARD_W, landing.w, landing.w, landing.w],
							height: [CARD_H, CARD_H, landing.h, landing.h, landing.h],
							opacity: [1, 1, 1, 1, 0],
						}}
						transition={{
							duration: DEAL_CYCLE,
							times,
							ease: "easeInOut",
							repeat: Number.POSITIVE_INFINITY,
						}}
					>
						<motion.span
							className="absolute right-0 left-0 truncate font-mono text-muted/55 text-sm leading-4"
							style={{ top: -22 }}
							animate={{ opacity: [0, 0, 1, 1, 0] }}
							transition={{
								duration: DEAL_CYCLE,
								times,
								ease: "easeInOut",
								repeat: Number.POSITIVE_INFINITY,
							}}
						>
							{landing.name}
						</motion.span>
						<span className="block h-full w-full rounded-md border border-border-raised bg-surface" />
					</motion.div>
				);
			})}
		</div>
	);
}

/**
 * The rail speculates about nothing. It is empty for the whole deck phase,
 * because at T0 the page list is not one of the two facts in hand, and it
 * fills on the same beat the deck deals.
 */
export function DealRail() {
	return (
		<>
			{DEAL_PAGES.map((page, index) => (
				<motion.div
					key={page.name}
					className={cn("relative flex h-8 items-center pr-3.5 pl-[26px]", page.active && "bg-surface")}
					animate={{ opacity: [0, 0, 1, 1, 0] }}
					transition={{
						duration: DEAL_CYCLE,
						times: [0, DEAL_AT + index * DEAL_STEP, DEAL_AT + index * DEAL_STEP + DEAL_RUN, SETTLED, 1],
						ease: "easeInOut",
						repeat: Number.POSITIVE_INFINITY,
					}}
				>
					{page.active ? <span className="absolute top-1.5 bottom-1.5 left-0 w-[2px] rounded-full bg-thread" /> : null}
					<span
						className={cn(
							"min-w-0 flex-1 truncate font-mono text-sm leading-sm",
							page.active ? "text-text" : "text-muted",
						)}
					>
						{page.name}
					</span>
					<span className="font-mono text-2xs text-muted/60 leading-3">{page.count}</span>
				</motion.div>
			))}
		</>
	);
}
