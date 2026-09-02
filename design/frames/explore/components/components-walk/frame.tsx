import {
	animate,
	type MotionStyle,
	type MotionValue,
	motion,
	useMotionValue,
	useReducedMotion,
	useTransform,
} from "motion/react";
import { type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ELSEWHERE } from "shared/lib/spool/agent-threads";
import { cn } from "shared/lib/utils";
import { CanvasChrome, type PageRow } from "shared/ui/spool/canvas-chrome";
import {
	BARE,
	ComponentFace,
	DEMOS,
	type Demo,
	FILES,
	fitScale,
	PARTS,
	Specimen,
	demosOf,
} from "shared/ui/explore/components/components";
import { SpoolShell } from "shared/ui/spool/shell";
import { ThreadStrip } from "shared/ui/spool/thread-strip";

/**
 * The contact sheet with the camera put back (#189).
 *
 * The other three takes are pictures of a page. This exploration is the page: the field of
 * cards is a world laid out in canvas coordinates, and what you look at it through
 * is spool's own camera — `camera.ts` math, `canvas.tsx`'s 220ms cubic ease-out,
 * `translate(x, y) scale(k)` off a `0 0` origin. Nothing here opens, overlays or
 * slides in. Every state on this frame is one camera and one selection.
 *
 * So the grammar is the canvas's whole grammar and not a line of it is new:
 *
 *   click          selects a card — the camera flies to it and it fills the view
 *   double-click   enters it: the specimen becomes the live component under your cursor
 *   esc            one rung down the ladder — live to selected, selected to the sheet
 *
 * **Two things fell out of making it move, and both were invisible in the stills.**
 *
 * The first is that a card's type must not zoom. Blow a 274px card up 3.4× and its
 * caption goes to 41px while the specimen goes to the size you wanted, so the card
 * arrives shouting its own filename. spool already solved this: `frame-label.tsx`
 * counter-scales by `1/k`, which is why a frame's name is 12px at every zoom on the
 * real canvas. Here that is one `--ik` variable the world publishes and every caption
 * reads, so the specimen scales and nothing written about it ever does. The selection
 * ring is screen-space for the same reason and on `overlays.tsx`'s own numbers: 1.5px
 * thread at a 3px offset, 8px handles, unchanged at any zoom.
 *
 * The second is that the camera here is **derived from the selection** rather than
 * free. There are two cameras, the sheet and a card, and no third. It is the one place
 * this diverges from `canvas.tsx`, where deselecting leaves the camera exactly where it
 * was, and it is deliberate: a free camera on this page buys a state where you are
 * zoomed at nothing with no way to name where you are. What it costs is worth saying
 * out loud, because the real page has to answer it — a components page that cannot be
 * panned is a lens, not a canvas, and if it is a lens then the Pages rail is promising
 * a canvas it does not deliver.
 *
 * Everything clips with `overflow-clip` rather than `overflow-hidden`, for the reason
 * the registry documents: `spool-thread-strip.tsx:65` calls `scrollIntoView` unguarded
 * on mount, `hidden` is still a scroll container and `clip` is not one at all. That
 * matters more here than in the stills, because entering a card remounts its specimen.
 */

/* ---------- the world ---------- */

/**
 * The sheet's own geometry, at 1440×900 with the pages rail taking 248 and no
 * inspector. The world is fixed at this size and the camera adapts to whatever
 * viewport it is actually given, so the resting sheet is the same object `--sheet`
 * draws rather than something that reflows underneath the comparison.
 */
const VW = 1192;
const VH = 856;
const BAND = 36;
const MANIFEST = 122;
const PAD = 24;
const COLS = 4;
const GUTTER = 16;
const CARD = (VW - PAD * 2 - GUTTER * (COLS - 1)) / COLS;
const WELL = 108;
const CAP_GAP = 8;
const CAP = 36;
const BLOCK = WELL + CAP_GAP + CAP;
const ROW_GAP = 18;
const TOP = BAND + 22;

/** the room the identity keeps under a card the camera has flown to, in screen px */
const IDENT = 150;
/** breathing room left either side of an entered card, so its neighbours stay in shot */
const FLIGHT_PAD = 130;

/** `canvas.tsx`'s flight, verbatim: 220ms, cubic ease-out */
const FLIGHT_MS = 220;
const EASE = [0.33, 1, 0.68, 1] as const;

interface Camera {
	x: number;
	y: number;
	k: number;
}

/**
 * One file, its examples, and where it sits on the ground.
 *
 * **A card is a file, not a demo.** `coffee-screens` holds a menu and a receipt and
 * they are one card with two specimens in it, the way `spool-icons` was already one
 * card holding nineteen glyphs. It costs a little room per entry and it buys the
 * thing the sheet could not have: every fact on the card — the source path, the demo
 * path, the export list — is one fact per card instead of the same line printed twice
 * under two tiles that came out of the same file.
 */
interface Card {
	readonly file: string;
	readonly parts: readonly string[];
	readonly demos: readonly Demo[];
	readonly x: number;
	readonly y: number;
}

const CARDS: readonly Card[] = FILES.map((file) => ({ file: file.name, parts: file.parts, demos: demosOf(file.name) }))
	.filter((card) => card.demos.length > 0)
	.map((card, index) => ({
		...card,
		x: PAD + (index % COLS) * (CARD + GUTTER),
		y: TOP + Math.floor(index / COLS) * (BLOCK + ROW_GAP),
	}));

/** the sheet at rest: the whole field in the viewport, never past 100% */
function restCamera(vw: number, vh: number): Camera {
	const k = Math.min(1, vw / VW, vh / VH);
	return { k, x: (vw - VW * k) / 2, y: (vh - VH * k) / 2 };
}

/**
 * The camera that lands on one card.
 *
 * `centerOn` from `camera.ts`, with the centre moved off the viewport's own middle
 * because the band and the manifest are pinned chrome and the identity wants the
 * bottom of what is left.
 */
function cardCamera(card: Card, vw: number, vh: number): Camera {
	const k = Math.min((vw - FLIGHT_PAD * 2) / CARD, (vh - BAND - MANIFEST - IDENT - 80) / WELL);
	const cx = vw / 2;
	const cy = BAND + (vh - BAND - MANIFEST - IDENT) / 2;
	return { k, x: cx - (card.x + CARD / 2) * k, y: cy - (card.y + WELL / 2) * k };
}

/* ---------- what goes live ---------- */

/**
 * The thread strip with its state wired, which is what entering a card is for.
 *
 * The registry hands `ThreadStrip` a noop `onOpen`, because a still does not need
 * one. Live it needs the real thing: pressing a thread opens it, the marks change
 * under your cursor, and #144's centring scrolls the row inside its own box. The
 * state is local and dies with the specimen, so leaving and re-entering a card boots
 * it fresh — the same rule `enterFrame` follows for a frame.
 */
function LiveThreadStrip() {
	const [open, setOpen] = useState("home");
	return (
		<div className="w-[392px] border border-border bg-bg">
			<ThreadStrip threads={ELSEWHERE} open={open} onOpen={setOpen} />
		</div>
	);
}

/**
 * What a file draws once it is live, where that differs from what it draws at rest.
 *
 * Most of this library is a drawing. Of fifteen cards, three have anything at all to
 * feel: `ThreadStrip` opens threads, `PillButton` is a real button with a hover and a
 * press, and `SpoolShell`'s tabs reveal their ✕. The rest go live and nothing happens,
 * which is not a bug in the page — it is the library saying that a demo written as a
 * registry entry can only ever hand a component the props it had at rest.
 */
const LIVE: Readonly<Record<string, () => ReactNode>> = {
	"spool-thread-strip": () => <LiveThreadStrip />,
};

/* ---------- the frame ---------- */

const PAGES: readonly PageRow[] = [
	{
		name: "components",
		frames: FILES.map((file) => file.name),
		active: true,
		face: <ComponentFace />,
		ruled: true,
	},
	{ name: "app", frames: ["menu", "cart", "receipt"] },
	{ name: "site", frames: [] },
	{ name: "directing", frames: [] },
];

export default function SpoolComponentsWalkFrame() {
	const [held, setHeld] = useState<string | null>(null);
	const [live, setLive] = useState(false);
	const still = useReducedMotion() === true;

	const viewport = useRef<HTMLDivElement>(null);
	const [box, setBox] = useState({ vw: VW, vh: VH });

	const camX = useMotionValue(0);
	const camY = useMotionValue(0);
	const camK = useMotionValue(1);
	/* every label in the world reads this and cancels the zoom out of its own type */
	const camIK = useTransform(camK, (k: number) => 1 / k);

	const card = useMemo(() => CARDS.find((candidate) => candidate.file === held) ?? null, [held]);

	useLayoutEffect(() => {
		const el = viewport.current;
		if (el === null) return;
		const read = () => setBox({ vw: el.clientWidth, vh: el.clientHeight });
		read();
		const observer = new ResizeObserver(read);
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		const to = card === null ? restCamera(box.vw, box.vh) : cardCamera(card, box.vw, box.vh);
		const options = { duration: still ? 0 : FLIGHT_MS / 1000, ease: EASE };
		const flights = [animate(camX, to.x, options), animate(camY, to.y, options), animate(camK, to.k, options)];
		return () => {
			for (const flight of flights) flight.stop();
		};
	}, [card, box, still, camX, camY, camK]);

	/**
	 * Esc, as a ladder rather than a switch — `canvas.tsx:2553`'s own shape. Live
	 * comes off first and the selection survives it, exactly as `exitEntered` retains
	 * the frame it just left; the next press is the one that flies out.
	 */
	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			if (live) {
				setLive(false);
				return;
			}
			if (held !== null) setHeld(null);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [live, held]);

	const worldStyle = {
		x: camX,
		y: camY,
		scale: camK,
		transformOrigin: "0 0",
		width: VW,
		height: VH,
		"--ik": camIK,
	} as unknown as MotionStyle;

	const zoom = card === null ? restCamera(box.vw, box.vh).k : cardCamera(card, box.vw, box.vh).k;

	/** a press on empty ground clears the selection, which is the canvas's own answer to it */
	const drop = (event: React.PointerEvent) => {
		if (event.target !== event.currentTarget) return;
		setLive(false);
		setHeld(null);
	};

	return (
		<SpoolShell activeTab="spool" tabs={["kaffe", "spool"]} zoom={`${Math.round(zoom * 100)}%`}>
			{/*
			 * No inspector, and that is the stance rather than an omission: a component is
			 * not a frame. It has no geometry to nudge, no element tree to walk and no walks
			 * to list, so the three things that rail exists for are all absent, and the sheet
			 * kept it only to have it say `select a frame to inspect it` over a page where
			 * nothing selectable is a frame. Its 300px goes to the canvas, which is what
			 * makes a flight legible at 1440 at all.
			 *
			 * No tool bar either, and it is the same fact a third time: select and hand are
			 * the two pointer tools, and a camera derived from the selection leaves hand
			 * nothing to do. Drawing it anyway also lands it inside the manifest — the bar
			 * floats at `bottom-6` and the manifest is 122px of the same pixels — which is a
			 * collision `--sheet` could not have found, because it drew no bar at all.
			 */}
			<CanvasChrome pages={PAGES} selected={held ?? undefined} tool="none" rail={null} railWidth={0}>
				<div ref={viewport} className="relative h-full w-full overflow-clip" onPointerDown={drop}>
					{/*
					 * The ground takes the press too, not just the viewport around it: the world
					 * covers the whole viewport, so at rest there is no bare viewport left to
					 * click and a press on the gap between two cards lands here. Both check the
					 * press was on them and not on something they contain, which is how a click
					 * on a card gets to keep it.
					 */}
					<motion.div className="absolute top-0 left-0" style={worldStyle} onPointerDown={drop}>
						{CARDS.map((candidate) => (
							<CardCell
								key={candidate.file}
								card={candidate}
								held={candidate.file === held}
								live={candidate.file === held && live}
								onHold={() => {
									setLive(false);
									setHeld(candidate.file);
								}}
								onEnter={() => {
									setHeld(candidate.file);
									setLive(true);
								}}
							/>
						))}
					</motion.div>
					{card === null || live ? null : <Ring card={card} camX={camX} camY={camY} camK={camK} />}
					<Band held={held !== null} live={live} />
					<Manifest />
				</div>
			</CanvasChrome>
		</SpoolShell>
	);
}

/* ---------- one card ---------- */

function CardCell({
	card,
	held,
	live,
	onHold,
	onEnter,
}: {
	card: Card;
	held: boolean;
	live: boolean;
	onHold: () => void;
	onEnter: () => void;
}) {
	const each = share(card);

	return (
		<div
			className="group absolute"
			style={{ left: card.x, top: card.y, width: CARD, zIndex: held ? 10 : 1 }}
			onPointerDown={onHold}
			onDoubleClick={onEnter}
		>
			<div
				className={cn(
					"flex items-stretch justify-center gap-3 overflow-clip border bg-bg transition-colors duration-150",
					held || live ? "border-border-raised" : "border-border group-hover:border-border-raised",
					live ? "pointer-events-auto cursor-auto" : "pointer-events-none",
				)}
				/*
				 * The card's own hairline and corner are chrome, so they are 1px and 8px on
				 * screen at every zoom rather than 3.4px and 27px at 340%. Same counter-scale
				 * the captions use, spent on paint instead of on type: a well that fattens as
				 * you fly into it stops reading as a hairline and starts reading as a plate.
				 */
				style={{
					height: WELL,
					borderWidth: "calc(1px * var(--ik))",
					borderRadius: "calc(8px * var(--ik))",
				}}
				onPointerDown={(event) => {
					/* a live specimen owns its own presses; the card is done taking them */
					if (live) event.stopPropagation();
				}}
				onDoubleClick={(event) => {
					if (live) event.stopPropagation();
				}}
			>
				{/*
				 * Each entry gets its own share of the well as a real box. `Specimen` sizes
				 * itself off the thing inside it and only *looks* contained in the sheet,
				 * where every card holds one: two of them side by side both laid out at their
				 * own true width and pushed each other out to the card's edges.
				 */}
				{card.demos.map((demo, index) => (
					<div key={`${demo.of}-${index}`} className="shrink-0 overflow-clip" style={{ width: each }}>
						<Specimen
							demo={live ? { ...demo, ...liveRender(card.file) } : demo}
							box={each}
							tall={WELL}
							readout="off"
						/>
					</div>
				))}
			</div>
			{/*
			 * The caption counter-scales, so it is 12px type at every zoom and the specimen
			 * is the only thing the camera makes bigger. Width tracks the card's screen
			 * width on the flight's own duration and easing, which is what lets the identity
			 * spread out under a card that has grown 3.4× without any of it reflowing.
			 */}
			<Caption card={card} held={held} live={live} />
		</div>
	);
}

/** the live rendering for a file, as a partial `Demo` to spread over the registry's own */
function liveRender(file: string): Partial<Demo> {
	const render = LIVE[file];
	return render === undefined ? {} : { render };
}

/**
 * The card's entries in one line.
 *
 * A cluster names its component once and then its examples, because `CoffeeScreen ·
 * menu CoffeeScreen · receipt` reads as four things rather than one thing shown twice.
 */
/**
 * The zoom one card is flown to, which every card shares because every well is one
 * size. It is the design viewport's own number; `cardCamera` recomputes it against the
 * viewport it is actually handed, so the two agree at 1440×900 and drift if the frame
 * is dragged to another size.
 */
const K_IN = (VW - FLIGHT_PAD * 2) / CARD;

/** the room one entry gets inside a well, which is the whole well until a card holds two */
function share(card: Card): number {
	const inner = CARD - 24;
	return card.demos.length === 1 ? inner : (inner - 12 * (card.demos.length - 1)) / card.demos.length;
}

/**
 * What a specimen is actually rendering at once the camera has landed on it.
 *
 * Its fit inside the well times the flight's own zoom. Most of this library already
 * fits at 1:1 in a 250px well, so flying to a card puts those specimens *above* true
 * size — `SpoolMark` reads at 340% — while `SpoolEmptyScreen`'s 1440px still only
 * reaches 65%. One number, and it is the honest one.
 */
function flownScale(card: Card, demo: Demo): string {
	return `${Math.round(fitScale(demo, share(card), WELL) * K_IN * 100)}%`;
}

/** every entry's flown scale, for the chip's own line */
function scales(card: Card): string {
	return [...new Set(card.demos.map((demo) => flownScale(card, demo)))].join(" · ");
}

function entries(card: Card): string {
	const first = card.demos[0];
	if (first === undefined) return "";
	const one = card.demos.every((demo) => demo.of === first.of);
	return one
		? `${first.of} · ${card.demos.map((demo) => demo.example).join(", ")}`
		: card.demos.map((demo) => `${demo.of} · ${demo.example}`).join("  ·  ");
}

function Caption({ card, held, live }: { card: Card; held: boolean; live: boolean }) {
	/* the caption spans its card's *screen* width, so the identity gets the room the zoom bought */
	const width = held ? Math.round(CARD * K_IN) : CARD;
	return (
		<div
			/*
			 * Docked on the well's own bottom edge, with the gap *inside* the counter-scaled
			 * block — so the caption sits 8px under the specimen at 100% and 8px under it at
			 * 340%. `frame-label.tsx` keeps its `pb-2.5` on the same side of the scale for
			 * exactly this reason.
			 */
			className="absolute origin-top-left transition-[width] duration-[220ms] ease-[cubic-bezier(0.33,1,0.68,1)]"
			style={{ top: WELL, left: 0, width, paddingTop: CAP_GAP, transform: "scale(var(--ik))" }}
		>
			{live ? (
				/*
				 * The entered chip, in the words the canvas puts over a frame you are inside,
				 * and then the scale beside it — because a card that fills the view is a card
				 * well above 100%, and a component you are poking at 340% is not one whose feel
				 * you can trust. Saying the number is the least this owes you.
				 */
				<div className="flex items-center gap-2">
					<span className="rounded-xs bg-thread px-2 py-[3px] font-mono text-2xs text-on-thread leading-3">
						live · esc exits
					</span>
					<span className="font-mono text-2xs text-muted/35 leading-3">{scales(card)}</span>
				</div>
			) : (
				<div className="flex min-w-0 flex-col gap-1">
					<div className="flex min-w-0 items-baseline gap-1.5 font-mono">
						<span
							className={cn(
								"min-w-0 truncate text-sm leading-sm",
								held ? "text-thread" : "text-muted group-hover:text-text",
							)}
						>
							{card.file}.tsx
						</span>
						{/* the entry count, on the one card that has more than one thing in it */}
						{card.demos.length > 1 ? (
							<span className="shrink-0 text-2xs text-muted/30 leading-3">{card.demos.length}</span>
						) : null}
					</div>
					<span className="min-w-0 truncate font-mono text-2xs text-muted/45 leading-3">{entries(card)}</span>
				</div>
			)}
			{held && !live ? <Identity card={card} /> : null}
		</div>
	);
}

/**
 * What the card says once you are close enough to read it.
 *
 * Four facts and the export list, in two columns because the zoom is what bought
 * the width. Nothing here is repeated from the resting caption above it except the
 * file's own name, which is the thing both are about.
 */
function Identity({ card }: { card: Card }) {
	const sizes = card.demos.map((demo) => `${demo.w} × ${demo.h} at ${flownScale(card, demo)}`);

	return (
		<motion.div
			initial={{ opacity: 0, y: -4 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.18, delay: 0.11, ease: EASE }}
			className="mt-3 flex gap-8 border-border border-t pt-3 font-mono text-2xs leading-4"
		>
			<div className="flex w-[300px] shrink-0 flex-col text-muted/55">
				<span className="truncate">shared/ui/{card.file}.tsx</span>
				<span className="truncate text-muted/35">{card.file}.demo.tsx</span>
				{sizes.map((line) => (
					<span key={line} className="truncate text-muted/35">
						{line}
					</span>
				))}
			</div>
			<div className="flex min-w-0 flex-1 flex-col">
				<span className="text-muted/35">exports {card.parts.length}</span>
				<div className="flex flex-wrap gap-x-3">
					{card.parts.map((part) => (
						<span key={part} className="text-muted/55">
							{part}
						</span>
					))}
				</div>
			</div>
		</motion.div>
	);
}

/* ---------- the selection, in screen space ---------- */

/**
 * `overlays.tsx`'s selection, on its own numbers: a 1.5px thread ring at a 3px
 * offset with 8px handles. It is drawn over the world rather than in it, which is
 * how the real one is drawn and the only way a ring stays 1.5px at 340%.
 */
function Ring({
	card,
	camX,
	camY,
	camK,
}: {
	card: Card;
	camX: MotionValue<number>;
	camY: MotionValue<number>;
	camK: MotionValue<number>;
}) {
	const left = useTransform<number, number>(
		[camX, camK],
		(latest: number[]) => (latest[1] ?? 1) * card.x + (latest[0] ?? 0) - 3,
	);
	const top = useTransform<number, number>(
		[camY, camK],
		(latest: number[]) => (latest[1] ?? 1) * card.y + (latest[0] ?? 0) - 3,
	);
	const width = useTransform(camK, (k: number) => CARD * k + 6);
	const height = useTransform(camK, (k: number) => WELL * k + 6);

	return (
		<motion.div
			className="pointer-events-none absolute rounded-[10px] border-[1.5px] border-thread"
			style={{ x: left, y: top, width, height }}
		>
			{["-top-[5px] -left-[5px]", "-top-[5px] -right-[5px]", "-bottom-[5px] -left-[5px]", "-bottom-[5px] -right-[5px]"].map(
				(place) => (
					<span
						key={place}
						className={cn("absolute h-2 w-2 rounded-[1.5px] border-[1.5px] border-thread bg-on-thread", place)}
					/>
				),
			)}
		</motion.div>
	);
}

/* ---------- the pinned chrome ---------- */

/**
 * The band and the manifest are pinned to the viewport rather than laid on the
 * ground, and they are translucent so a card flying past is seen going under them.
 * That is the tool bar's own arrangement — chrome floating over a canvas — and it is
 * also what makes the zoomed state unmistakably not a modal: the page's furniture
 * never moves and never dims, only the camera does.
 */
function Band({ held, live }: { held: boolean; live: boolean }) {
	const hint = live ? "esc exits" : held ? "double-click enters · esc out" : "click selects · double-click enters";
	return (
		<div className="absolute inset-x-0 top-0 z-20 flex h-9 items-center gap-3 border-border border-b bg-bg/85 px-6 backdrop-blur-sm">
			<span className="font-mono text-sm text-text leading-sm">shared/ui</span>
			<span className="font-mono text-2xs text-muted/50 leading-3">
				{FILES.length} files · {PARTS} parts · {DEMOS.length} demos · read only
			</span>
			<span className="ml-auto font-mono text-2xs text-muted/35 leading-3">{hint}</span>
		</div>
	);
}

/**
 * What the sheet is not showing you, and the one file each of them costs.
 *
 * The sheet listed twenty bare names and a count of what was inside them. The count
 * was the wrong fact: it said how much you were missing without saying how to stop
 * missing it. So each row names its own fill file instead, which is `--slots`' move
 * brought down here — the instruction written twenty times because there are twenty
 * places it applies, in a strip that is always on screen and can never be scrolled
 * past. The repeated `.demo.tsx` recedes to the extension's own weight, so the column
 * still reads as a list of names.
 */
function Manifest() {
	return (
		<div className="absolute inset-x-0 bottom-0 z-20 flex flex-col gap-2 border-border border-t bg-bg/85 px-6 pt-3 pb-3 backdrop-blur-sm">
			<div className="flex items-baseline gap-2">
				<span className="font-mono text-sm text-muted leading-sm">no demo</span>
				<span className="font-mono text-2xs text-muted/45 leading-3">{BARE.length}</span>
				<span className="ml-auto font-mono text-2xs text-muted/30 leading-3">
					write the file and the card appears
				</span>
			</div>
			<div className="flex flex-wrap gap-x-5 gap-y-1">
				{BARE.map((file) => (
					<span key={file.name} className="font-mono text-2xs text-muted/45 leading-4">
						{file.name}
						<span className="text-muted/20">.demo.tsx</span>
					</span>
				))}
			</div>
		</div>
	);
}
