import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from "motion/react";
import type { MotionValue } from "motion/react";
import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import { cn } from "../../../shared/lib/utils";
import { CommandLine, LandingHero } from "../../../shared/ui/landing-hero";
import { DRAFTS, type Draft, ROUNDS, type Round } from "../site-hub--drafts/drafts";

/**
 * site-hub--reel — the same idea as site-hub--drafts, answered editorially.
 *
 * The question both frames are arguing about is what the landing should pull
 * back into. site-hub--drafts pulls back into the real canvas at the real
 * coordinates: cinematic, honest, a little unruly. This one pulls back into a
 * contact sheet: the twenty-six landings laid out as a specimen, ordered by the
 * round that produced them, the shipped one ringed in its slot. Composed
 * instead of found. Everything else is held identical on purpose — the same
 * hero, the same dock, the same live frames, the same copy — so the only thing
 * being compared is found order against composed order.
 *
 *   0            the landing fills the viewport.
 *   0 -> 0.42    it shrinks into its frame, alone on the dot grid.
 *   0.42 -> 1    the sheet assembles around it round by round, and the docked
 *                landing travels into its own cell as the last one to arrive.
 *
 * The cells are the real frames again, not screenshots: each renders at its
 * natural 1440 width inside a scaled, clipped window, so a cell is the top
 * 900px of a running page. Clicking one lifts it to a reading size and hands
 * over the pointer.
 */

const VIEW_W = 1440;
const VIEW_H = 900;
const TRACK_H = 3400;
const P1 = 0.42;

/* the sheet: six columns of the top 900px of each page, five rows, one screen */
const COLS = 6;
const CELL_W = 182;
const CELL_H = 114;
const GAP_X = 17;
const GAP_Y = 26; // the label under each cell lives in this gap
const SHEET_X = 132;
const SHEET_Y = 158;
const CELL_SCALE = CELL_W / VIEW_W;

/** Where the landing docks at the end of stage one. */
const DOCK = { x: 492, y: 288, w: 456, h: 285 };

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (t: number) => t * t * (3 - 2 * t);
const rampAt = (v: number, a: number, b: number) => smooth(clamp01((v - a) / (b - a)));

const dotGrid: CSSProperties = {
	backgroundImage:
		"radial-gradient(circle, color-mix(in srgb, var(--color-text) 9%, transparent) 1px, transparent 1px)",
	backgroundSize: "30px 30px",
};

/**
 * The sheet's order: rounds in the order they happened, and inside a round the
 * order the drafts are declared in. The shipped page takes the slot right after
 * the round it graduated from, which is where a contact sheet would file it.
 */
const ROUND_ORDER: Round[] = [1, 2, 3, 4, 5];
const SHEET: readonly Draft[] = ROUND_ORDER.flatMap((r) => DRAFTS.filter((d) => d.round === r));
/** The page's own cell, appended last: twenty-seven slots, twenty-six drafts. */
const HUB_SLOT = SHEET.length;

interface Slot {
	x: number;
	y: number;
}

function slotAt(i: number): Slot {
	return {
		x: SHEET_X + (i % COLS) * (CELL_W + GAP_X),
		y: SHEET_Y + Math.floor(i / COLS) * (CELL_H + GAP_Y),
	};
}

/**
 * A round changes at these indices. Rounds do not fall on row boundaries in a
 * six-column sheet, so the grouping is carried by each cell's own label rather
 * than by a rule beside the run — a rule would have to cut through a row.
 */
const ROUND_STARTS = new Set(ROUND_ORDER.map((r) => SHEET.findIndex((d) => d.round === r)));

/* ---------- one cell: a real page, scaled and clipped ---------- */

/**
 * A cell holds the frame at its natural width inside a scaled window, so the
 * cell is the real top of the real page rather than a drawing of it. The inner
 * box is given the frame's real height because most of these pages are laid out
 * against a full-height parent.
 */
function Cell({
	draft,
	i,
	hot,
	focused,
	reveal,
	onHover,
	onPick,
}: {
	draft: Draft;
	i: number;
	hot: boolean;
	focused: boolean;
	reveal: MotionValue<number>;
	onHover: (name: string | null) => void;
	onPick: (name: string) => void;
}) {
	const slot = slotAt(i);
	const opens = ROUND_STARTS.has(i);
	// each cell arrives on its own beat, in sheet order
	const t0 = 0.42 + (i / (HUB_SLOT + 1)) * 0.34;
	const opacity = useTransform(reveal, (v) => rampAt(v, t0, t0 + 0.12));
	const y = useTransform(reveal, (v) => (1 - rampAt(v, t0, t0 + 0.12)) * 16);

	return (
		<motion.div
			className="absolute"
			style={{ left: slot.x, top: slot.y, width: CELL_W, opacity, y }}
		>
			<motion.button
				type="button"
				aria-label={`look at ${draft.name}`}
				onPointerEnter={() => onHover(draft.name)}
				onPointerLeave={() => onHover(null)}
				onClick={() => onPick(draft.name)}
				className="group relative block cursor-pointer overflow-hidden bg-bg focus-visible:outline-none"
				style={{ width: CELL_W, height: CELL_H }}
				animate={{ scale: hot ? 1.04 : 1 }}
				transition={{ type: "spring", stiffness: 320, damping: 26 }}
			>
				<div
					className="pointer-events-none origin-top-left"
					style={{
						width: VIEW_W,
						height: draft.rect.h,
						transform: `scale(${CELL_SCALE})`,
					}}
				>
					<draft.C />
				</div>
				<span
					className={cn(
						"absolute inset-0 outline outline-[1.5px] transition-colors duration-200",
						hot || focused ? "outline-thread" : "outline-border-raised",
					)}
				/>
			</motion.button>
			<div className="mt-[7px] flex items-baseline gap-1.5 font-mono text-[9px] leading-none">
				<span className={cn("shrink-0", opens ? "text-thread" : "text-muted/35")}>
					{ROUNDS[draft.round].label.replace("round ", "").replace("graduated", "→")}
				</span>
				<span
					className={cn(
						"truncate transition-colors duration-200",
						hot || focused ? "text-thread" : "text-muted/70",
					)}
				>
					{draft.name.replace("landing--", "")}
				</span>
			</div>
		</motion.div>
	);
}

/* ---------- the page's own cell: the dock travels into the sheet ---------- */

/**
 * The docked landing and its slot in the sheet are both known screen rects, so
 * the travel between them is one interpolation rather than a measurement. It
 * arrives last, after every draft, which is the beat that lands the point: the
 * page you are reading is the twenty-seventh frame.
 */
function DockedPage({ reveal, hint, onHome }: { reveal: MotionValue<number>; hint: MotionValue<number>; onHome: () => void }) {
	const slot = slotAt(HUB_SLOT);
	const shrink = useTransform(reveal, (v) => rampAt(v, 0.78, 0.94));

	const x = useTransform([reveal, shrink], ([v, k]: number[]) => {
		const dock = DOCK.x + (0 - DOCK.x) * (1 - rampAt(v, 0, P1));
		return dock + (slot.x - DOCK.x) * k;
	});
	const y = useTransform([reveal, shrink], ([v, k]: number[]) => {
		const dock = DOCK.y + (0 - DOCK.y) * (1 - rampAt(v, 0, P1));
		return dock + (slot.y - DOCK.y) * k;
	});
	const scale = useTransform([reveal, shrink], ([v, k]: number[]) => {
		const dock = 1 + (DOCK.w / VIEW_W - 1) * smooth(clamp01(v / P1));
		return dock + (CELL_SCALE - dock) * k;
	});
	const radius = useTransform(scale, (k) => (k < 0.9 ? 0 : 0));
	const catcher = useTransform(reveal, (v) => (v > 0.1 ? "auto" : "none"));

	return (
		<motion.div
			className="absolute top-0 left-0 z-20 origin-top-left overflow-hidden bg-bg [will-change:transform]"
			style={{ x, y, width: VIEW_W, height: VIEW_H, scale, borderRadius: radius }}
		>
			<LandingHero hint={hint} />
			<motion.button
				type="button"
				aria-label="back to the page"
				onClick={onHome}
				className="absolute inset-0 cursor-pointer focus-visible:outline-none"
				style={{ opacity: 0, pointerEvents: catcher }}
			/>
		</motion.div>
	);
}

/** The ring and tab that follow the page's cell wherever it is. */
function DockChrome({ reveal }: { reveal: MotionValue<number> }) {
	const slot = slotAt(HUB_SLOT);
	const shrink = useTransform(reveal, (v) => rampAt(v, 0.78, 0.94));
	const x = useTransform([reveal, shrink], ([v, k]: number[]) => {
		const dock = DOCK.x + (0 - DOCK.x) * (1 - rampAt(v, 0, P1));
		return dock + (slot.x - DOCK.x) * k;
	});
	const y = useTransform([reveal, shrink], ([v, k]: number[]) => {
		const dock = DOCK.y + (0 - DOCK.y) * (1 - rampAt(v, 0, P1));
		return dock + (slot.y - DOCK.y) * k;
	});
	const w = useTransform([reveal, shrink], ([v, k]: number[]) => {
		const dock = VIEW_W + (DOCK.w - VIEW_W) * smooth(clamp01(v / P1));
		return dock + (CELL_W - dock) * k;
	});
	const h = useTransform([reveal, shrink], ([v, k]: number[]) => {
		const dock = VIEW_H + (DOCK.h - VIEW_H) * smooth(clamp01(v / P1));
		return dock + (CELL_H - dock) * k;
	});
	const opacity = useTransform(reveal, (v) => rampAt(v, 0.2, 0.34));
	const detail = useTransform(reveal, (v) => 1 - rampAt(v, 0.74, 0.86));
	const corner = "absolute h-2 w-2 rounded-[1.5px] border-[1.5px] border-thread bg-on-thread";
	return (
		<motion.div
			className="pointer-events-none absolute top-0 left-0 z-30"
			style={{ x, y, width: w, height: h, opacity }}
		>
			<div className="absolute inset-0 outline outline-[2px] outline-thread" />
			<div className="-top-[19px] absolute left-0 flex items-center gap-2 whitespace-nowrap font-mono text-[10px] text-thread leading-none">
				<span className="text-[8px] opacity-80">{"▶"}</span>
				<span>site-hub</span>
				<span className="text-muted/70">this page</span>
			</div>
			<motion.div className="absolute inset-0" style={{ opacity: detail }}>
				<span className={cn(corner, "-left-[7px] -top-[7px]")} />
				<span className={cn(corner, "-right-[7px] -top-[7px]")} />
				<span className={cn(corner, "-left-[7px] -bottom-[7px]")} />
				<span className={cn(corner, "-right-[7px] -bottom-[7px]")} />
			</motion.div>
		</motion.div>
	);
}

/* ---------- the sheet's furniture ---------- */

function SheetHead({ opacity }: { opacity: MotionValue<number> }) {
	return (
		<motion.div className="absolute top-[54px] left-[132px] z-30" style={{ opacity }}>
			<div className="flex items-end justify-between" style={{ width: 1176 }}>
				<div>
					<h2 className="font-semibold text-[34px] leading-[1] tracking-[-0.025em]">
						{DRAFTS.length} landings for one page.
					</h2>
					<p className="mt-2.5 max-w-[620px] text-[14px] text-muted leading-[21px]">
						the rounds this page came out of, in order. none of these is a screenshot: every cell is
						the real frame, still running. click one to read it.
					</p>
				</div>
				<div className="pb-1 text-right font-mono text-[10px] text-muted leading-[16px]">
					<div>design/frames/</div>
					<div className="text-text">landing--*/frame.tsx</div>
				</div>
			</div>
		</motion.div>
	);
}

/** The hovered cell's note, parked under the sheet so nothing ever reflows. */
function Note({ draft }: { draft: Draft }) {
	return (
		<motion.div
			className="pointer-events-none absolute bottom-[30px] left-[132px] z-30 flex items-baseline gap-4"
			initial={{ opacity: 0, y: 4 }}
			animate={{ opacity: 1, y: 0 }}
			exit={{ opacity: 0 }}
			transition={{ duration: 0.16, ease: "easeOut" }}
		>
			<span className="font-mono text-[11px] text-thread leading-none">{draft.name}</span>
			<span className="font-mono text-[11px] text-muted/60 leading-none">
				{ROUNDS[draft.round].label} · {ROUNDS[draft.round].note}
			</span>
			<span className="font-mono text-[11px] text-muted leading-none">{draft.note}</span>
		</motion.div>
	);
}

/* ---------- focus: lift one draft to a reading size ---------- */

function Focused({ draft, onExit }: { draft: Draft; onExit: () => void }) {
	const s = Math.min(0.86, Math.max(0.42, Math.min((VIEW_W - 168) / VIEW_W, (VIEW_H - 152) / draft.rect.h)));
	const w = VIEW_W * s;
	const h = draft.rect.h * s;
	return (
		<motion.div
			className="absolute inset-0 z-40"
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			exit={{ opacity: 0 }}
			transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
		>
			<button
				type="button"
				aria-label="back to the sheet"
				onClick={onExit}
				className="absolute inset-0 cursor-pointer bg-canvas/92 focus-visible:outline-none"
			/>
			<motion.div
				className="-translate-x-1/2 -translate-y-1/2 absolute top-1/2 left-1/2 overflow-hidden bg-bg"
				style={{ width: w, height: h }}
				initial={{ scale: 0.96 }}
				animate={{ scale: 1 }}
				transition={{ type: "spring", stiffness: 260, damping: 28 }}
			>
				<div
					className="origin-top-left"
					style={{ width: VIEW_W, height: draft.rect.h, transform: `scale(${s})` }}
				>
					<draft.C />
				</div>
				<div className="pointer-events-none absolute inset-0 outline outline-[2px] outline-thread" />
			</motion.div>
			<div className="absolute top-[26px] left-[64px] flex items-center gap-4">
				<button
					type="button"
					onClick={onExit}
					className="cursor-pointer rounded-full border border-border-raised bg-surface/80 px-3 py-1.5 font-mono text-[11px] text-muted leading-none transition-colors duration-200 hover:border-thread/50 hover:text-thread focus-visible:outline-none"
				>
					esc · back to the sheet
				</button>
				<span className="font-mono text-[11px] text-thread leading-none">{draft.name}</span>
				<span className="font-mono text-[11px] text-muted/60 leading-none">
					{ROUNDS[draft.round].label} · {ROUNDS[draft.round].note}
				</span>
			</div>
		</motion.div>
	);
}

/* ---------- orchestrator ---------- */

export default function SiteHubReel() {
	const scrollRef = useRef<HTMLDivElement>(null);
	const raw = useMotionValue(0);
	const reveal = useSpring(raw, { stiffness: 120, damping: 34, mass: 1 });

	const [sheetOn, setSheetOn] = useState(false);
	const [hot, setHot] = useState<string | null>(null);
	const [focus, setFocus] = useState<string | null>(null);

	useEffect(() => {
		const t = window.setTimeout(() => setSheetOn(true), 420);
		return () => window.clearTimeout(t);
	}, []);

	useEffect(() => {
		const el = scrollRef.current;
		if (!el) return;
		const measure = () => {
			const max = el.scrollHeight - el.clientHeight;
			raw.set(max > 0 ? clamp01(el.scrollTop / max) : 0);
		};
		el.addEventListener("scroll", measure, { passive: true });
		const ro = new ResizeObserver(measure);
		ro.observe(el);
		measure();
		return () => {
			el.removeEventListener("scroll", measure);
			ro.disconnect();
		};
	}, [raw]);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") setFocus(null);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	const home = useCallback(() => {
		setFocus(null);
		scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
	}, []);

	const hint = useTransform(reveal, (v) => 1 - clamp01(v / 0.06));
	const gridOpacity = useTransform(reveal, (v) => clamp01(v / 0.14));
	const sheetChrome = useTransform(reveal, (v) => rampAt(v, 0.4, 0.56));

	const hotDraft = hot !== null ? SHEET.find((d) => d.name === hot) : undefined;
	const focusDraft = focus !== null ? SHEET.find((d) => d.name === focus) : undefined;

	return (
		<div
			ref={scrollRef}
			className="h-full w-full overflow-y-auto overflow-x-hidden bg-canvas [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
		>
			<div style={{ height: TRACK_H }}>
				<div className="sticky top-0 h-[900px] w-full overflow-hidden bg-canvas font-sans text-text antialiased [font-synthesis:none]">
					<motion.div className="absolute inset-0" style={{ ...dotGrid, opacity: gridOpacity }} />

					<SheetHead opacity={sheetChrome} />

					{sheetOn
						? SHEET.map((d, i) => (
								<Cell
									key={d.name}
									draft={d}
									i={i}
									hot={hot === d.name}
									focused={focus === d.name}
									reveal={reveal}
									onHover={setHot}
									onPick={setFocus}
								/>
							))
						: null}

					<DockedPage reveal={reveal} hint={hint} onHome={home} />
					<DockChrome reveal={reveal} />

					<AnimatePresence>
						{hotDraft && !focusDraft ? <Note key={hotDraft.name} draft={hotDraft} /> : null}
					</AnimatePresence>

					<motion.div
						className="absolute right-[132px] bottom-[26px] z-30 font-mono text-[12px] leading-[22px]"
						style={{ opacity: sheetChrome }}
					>
						<span className="text-muted">
							<CommandLine prompt="~ $" command="npm i -g spool.page" />
						</span>
					</motion.div>

					<AnimatePresence>
						{focusDraft ? (
							<Focused key={focusDraft.name} draft={focusDraft} onExit={() => setFocus(null)} />
						) : null}
					</AnimatePresence>
				</div>
			</div>
		</div>
	);
}
