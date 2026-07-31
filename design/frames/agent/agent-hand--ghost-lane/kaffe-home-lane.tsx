import { cn } from "../../../shared/lib/utils";

/**
 * `home`, the frame every row of this capture names, staged so that both objects on
 * the wall have something true to read off it.
 *
 * The two parents wanted opposite things from this file and it has to serve both.
 * `agent-hand--ghost` laid the page out in flow, because a ghost's loudest case is a
 * write that pushes everything under it down the page. `agent-hand--accrue` laid it
 * out absolutely, because a mark standing at a block's height needs a box that is
 * true by construction rather than one measured after a reflow. Here the layout is
 * **computed once and used twice**: `layoutAt` runs a small flow in numbers, the
 * component draws every block absolutely from the result, and the lane reads the same
 * table. So a write that changes a height really does move the six blocks under it,
 * and the box a mark stands in is still exact.
 *
 * **`rev` is the photograph, not the file.** Below `LIVE_MIN_CSS_PX` a frame on the
 * canvas is a stored still, so it does not re-render when the source changes; it waits
 * for the capture errand, which is 2.55s behind at best and folds a burst of writes
 * into one picture. Thirteen writes make three photographs in this turn, so `rev` goes
 * 0, 6, 10, 13 and the file is up to thirteen writes ahead of its own picture.
 *
 * **Two of the thirteen resolve nowhere, on purpose.** The menu is a hoisted `MENU`
 * array at the top of the file, so writes 7 and 8 land on a line no intrinsic element
 * sits on and `data-spool-source` degrades them to the frame's root. `agent-hand--accrue`
 * stated that gap and drew all thirteen located anyway. It is drawn here, because what
 * it costs turns out to be the largest single number in this frame.
 *
 * Palette and scale are `shared/ui/kaffe-home.tsx`'s: paper, one ink, one grey, one
 * surface, every value the real 390x844 page times 0.615.
 */

export type RegionId = "bar" | "head" | "sub" | "cta" | "hero" | "list" | "foot";

/** where a write landed: a block, or the whole frame when the stamp could not say */
export type Land = RegionId | "root";

/** a block's box in the frame's own 240x520 coordinates */
export interface Box {
	readonly top: number;
	readonly h: number;
}

interface Home {
	readonly head: string;
	readonly headLines: number;
	readonly headBig: boolean;
	readonly sub: string;
	readonly subLines: number;
	readonly cta: string;
	readonly ctaFill: boolean;
	readonly ctaWide: boolean;
	readonly hero: "flat" | "warm" | "photo";
	readonly items: readonly string[];
	readonly prices: readonly string[];
	readonly foot: string;
	readonly footHours: string | null;
	readonly barRules: boolean;
}

/** the frame before the turn touches it: placed, sized, and saying almost nothing */
const START: Home = {
	head: "Bryggt på Torsgatan",
	headLines: 1,
	headBig: false,
	sub: "Öppet varje dag.",
	subLines: 1,
	cta: "Meny",
	ctaFill: false,
	ctaWide: false,
	hero: "flat",
	items: [],
	prices: [],
	foot: "Torsgatan 11",
	footHours: null,
	barRules: false,
};

/**
 * The thirteen writes, in the order the capture makes them, each naming where it
 * landed.
 *
 * Thirteen because that is how many `Edit` calls `claude-edits.json` makes to
 * `frames/home/frame.tsx`, in runs of six, four and three. The fourteenth write in
 * that capture is the `frame.json` the turn opens with, and it is deliberately not
 * here: geometry moves the rectangle and leaves the design alone, so neither the ghost
 * nor the lane has anything true to say about it while the grip still flicks.
 *
 * The runs are staged to give each of them a different shape, because a staging where
 * every run touched the same blocks would hide the claim rather than test it. Run one
 * walks down the page and fills the wall. Run two is the pair that resolves nowhere
 * plus the footer. Run three goes back to the top.
 *
 * Exactly two writes reflow, one in run one and one in run three, so the ghost has its
 * expensive case twice and the lane has a stale geometry to stand in twice.
 */
export const EDITS: readonly { readonly land: Land; readonly apply: (home: Home) => Home }[] = [
	/* run of six: the page gets a voice, top to bottom */
	{ land: "head", apply: (home) => ({ ...home, head: "Rostat en gata bort" }) },
	{
		land: "sub",
		apply: (home) => ({
			...home,
			sub: "Ljusrostade bönor, malda i baren. Vi öppnar sju varje morgon och stänger klockan sex på kvällen.",
			subLines: 3,
		}),
	},
	{ land: "cta", apply: (home) => ({ ...home, cta: "Beställ bönor" }) },
	{ land: "cta", apply: (home) => ({ ...home, ctaFill: true }) },
	{ land: "hero", apply: (home) => ({ ...home, hero: "warm" }) },
	{ land: "bar", apply: (home) => ({ ...home, barRules: true }) },
	/* run of four: the bottom of the page, and the pair the stamp cannot place */
	{ land: "root", apply: (home) => ({ ...home, items: ["Bryggkaffe", "Cortado", "Kanelbulle"] }) },
	{ land: "root", apply: (home) => ({ ...home, prices: ["32", "46", "38"] }) },
	{ land: "foot", apply: (home) => ({ ...home, foot: "Torsgatan 11, Vasastan" }) },
	{ land: "foot", apply: (home) => ({ ...home, footHours: "07 till 18" }) },
	/* run of three: back to the top, tightening what the first run put there */
	{
		land: "head",
		apply: (home) => ({ ...home, head: "Rostat en gata bort, bryggt i baren", headLines: 2, headBig: true }),
	},
	{ land: "hero", apply: (home) => ({ ...home, hero: "photo" }) },
	{ land: "cta", apply: (home) => ({ ...home, ctaWide: true }) },
];

/** where each write landed, which is all the lane needs from the staging */
export const LANDS: readonly Land[] = EDITS.map((edit) => edit.land);

/** how many writes this file draws, which is the count the capture's runs add up to */
export const WRITES = EDITS.length;

/** the box every frame on this canvas is authored in */
export const NAT_W = 240;
export const NAT_H = 520;

const PAD = 12;
/**
 * The lede's measure, and it is narrower than the headline's on purpose.
 *
 * `layoutAt` declares how many lines each block takes and the component has to
 * actually take them, or the box carries slack and the mark beside it over-claims.
 * Measured rather than assumed: at 196 the second write's ninety-six characters set
 * two lines with thirteen native pixels left over, which showed as a loose gap under
 * the lede and made its mark a third too tall. At 140 they set the three the table
 * says.
 */
const SUB_W = 140;
const BAR_H = 26;
const FOOT_H = 30;
const HEAD_TOP = 40;
const GAP_SUB = 8;
const GAP_CTA = 12;
const GAP_HERO = 14;
const GAP_LIST = 14;
const HERO_H = 146;
const ROW_H = 12;
const ROW_GAP = 8;

function homeAt(rev: number): Home {
	return EDITS.slice(0, Math.max(0, Math.min(WRITES, rev))).reduce((home, edit) => edit.apply(home), START);
}

/**
 * The page's boxes at a given revision, as one flow computed in numbers.
 *
 * The component draws from this and the lane measures from it, which is the whole
 * reason it exists: two objects agreeing about where a block is only because they are
 * reading the same eleven lines of arithmetic. A height change here really does move
 * everything under it, and the mark that stands beside a block is still exact.
 */
export function layoutAt(rev: number): Record<RegionId, Box> {
	const home = homeAt(rev);
	const headH = home.headLines * (home.headBig ? 20 : 18);
	const subH = home.subLines * 13;
	const ctaH = 26;
	const listH = home.items.length === 0 ? 0 : home.items.length * ROW_H + (home.items.length - 1) * ROW_GAP;
	const head = { top: HEAD_TOP, h: headH };
	const sub = { top: head.top + head.h + GAP_SUB, h: subH };
	const cta = { top: sub.top + sub.h + GAP_CTA, h: ctaH };
	const hero = { top: cta.top + cta.h + GAP_HERO, h: HERO_H };
	const list = { top: hero.top + hero.h + GAP_LIST, h: listH };
	return {
		bar: { top: 0, h: BAR_H },
		head,
		sub,
		cta,
		hero,
		list,
		foot: { top: NAT_H - FOOT_H, h: FOOT_H },
	};
}

const INK = "#17171A";
const PAPER = "#FEFEFE";
const RULE = "#E4E4E7";
const GREY = "#86868B";

export function KaffeHomeLane({ rev }: { rev: number }) {
	const home = homeAt(rev);
	const box = layoutAt(rev);
	return (
		<div
			className="relative h-full w-full overflow-hidden rounded-lg border font-[Instrument_Sans]"
			style={{ borderColor: RULE, background: PAPER, color: INK }}
		>
			<div
				className="absolute inset-x-0 flex items-center justify-between border-b px-3"
				style={{ top: box.bar.top, height: box.bar.h, borderColor: RULE }}
			>
				<span className="font-semibold text-[10px] tracking-tight leading-3">kaffe</span>
				{home.barRules ? (
					<span className="flex flex-col gap-[3px]">
						<span className="block h-px w-[11px]" style={{ background: INK }} />
						<span className="block h-px w-[11px]" style={{ background: INK }} />
					</span>
				) : null}
			</div>

			<h1
				className={cn(
					"absolute overflow-hidden font-semibold tracking-tight",
					home.headBig ? "text-[17px] leading-[20px]" : "text-[15px] leading-[18px]",
				)}
				style={{ top: box.head.top, height: box.head.h, left: PAD, width: NAT_W - PAD * 2 }}
			>
				{home.head}
			</h1>

			<p
				className="absolute overflow-hidden text-[8.5px] leading-[13px]"
				style={{ top: box.sub.top, height: box.sub.h, left: PAD, width: SUB_W, color: GREY }}
			>
				{home.sub}
			</p>

			<div
				className="absolute flex items-center justify-center rounded-[3px] text-[8.5px] leading-3"
				style={{
					top: box.cta.top,
					height: box.cta.h,
					left: PAD,
					width: home.ctaWide ? 118 : 92,
					background: home.ctaFill ? INK : PAPER,
					color: home.ctaFill ? PAPER : INK,
					border: home.ctaFill ? "1px solid transparent" : `1px solid ${RULE}`,
				}}
			>
				{home.cta}
			</div>

			<div
				className="absolute overflow-hidden rounded-md"
				style={{
					top: box.hero.top,
					height: box.hero.h,
					left: PAD,
					width: NAT_W - PAD * 2,
					background: home.hero === "flat" ? "#EFEFF1" : "#E9E5DE",
				}}
			>
				{home.hero === "photo" ? (
					<>
						<span
							className="absolute inset-0 block"
							style={{ background: "linear-gradient(158deg, #D8CFC2 0%, #B8A995 58%, #6E6153 100%)" }}
						/>
						<span
							className="absolute block rounded-full"
							style={{ left: 44, top: 30, width: 70, height: 70, background: "rgba(254,254,254,0.22)" }}
						/>
						<span
							className="absolute right-0 bottom-0 left-0 block"
							style={{ height: 44, background: "linear-gradient(180deg, rgba(23,23,26,0) 0%, rgba(23,23,26,0.28) 100%)" }}
						/>
					</>
				) : null}
			</div>

			<div
				className="absolute flex flex-col"
				style={{ top: box.list.top, left: PAD, width: NAT_W - PAD * 2, gap: ROW_GAP }}
			>
				{home.items.map((item, index) => (
					<div key={item} className="flex items-baseline justify-between" style={{ height: ROW_H }}>
						<span className="text-[8.5px] leading-3">{item}</span>
						<span className="text-[8.5px] leading-3" style={{ color: GREY }}>
							{home.prices[index] ?? ""}
						</span>
					</div>
				))}
			</div>

			<div
				className="absolute inset-x-0 flex items-center justify-between border-t px-3"
				style={{ top: box.foot.top, height: box.foot.h, borderColor: RULE }}
			>
				<span className="text-[8px] leading-3" style={{ color: GREY }}>
					{home.foot}
				</span>
				{home.footHours === null ? null : (
					<span className="text-[8px] leading-3" style={{ color: GREY }}>
						{home.footHours}
					</span>
				)}
			</div>
		</div>
	);
}
