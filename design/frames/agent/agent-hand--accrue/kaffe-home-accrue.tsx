import { cn } from "../../../shared/lib/utils";

/**
 * `home`, the frame this capture is about, drawn so that a write is a real change
 * rather than a picture of one.
 *
 * `shared/ui/kaffe-home.tsx` is the finished frame; this is the same frame on its
 * way there — one content object, thirteen patches, and a `rev` saying how many of
 * them are in the picture.
 *
 * **`rev` is not a count of writes and that is the point.** A frame drawing below
 * `LIVE_MIN_CSS_PX` is a stored still rather than a document, so it does not re-render
 * when the source changes; it waits for the capture errand, which is 2.55s behind at
 * best and collapses a burst of writes into one photograph. Thirteen writes make three
 * photographs in this turn, so `rev` goes 0, 6, 10, 13 and the frame is thirteen writes
 * ahead of its own picture for most of the minute. Drawing a re-render per write here
 * would be inventing an event the product does not have — the mistake this file was
 * written to make and then corrected out of.
 *
 * Every block is absolutely placed inside the 240×520 box the canvas draws every
 * frame in, so a region has a box that is true by construction rather than one
 * measured after a reflow — and a write never moves the six blocks around it, which
 * is what makes the next write legible as a change to one of them.
 *
 * **The thirteen are staged to give each run its own shape.** The capture writes in
 * runs of six, four and three, and this frame puts the six in the top half, the four
 * at the bottom, and the last three back at the top. That is not decoration: the
 * whole claim of `agent-hand--accrue` is that a run has a shape you can see, and a
 * staging where every run touched the same six blocks would have hidden the claim
 * rather than tested it.
 *
 * Palette and scale are `kaffe-home.tsx`'s: paper, one ink, one grey, one surface,
 * every value the real 390×844 one times 0.615.
 */

export type RegionId = "bar" | "head" | "sub" | "cta" | "hero" | "list" | "foot";

/** where a block sits, in the frame's own 240×520 coordinates */
export interface Region {
	readonly x: number;
	readonly y: number;
	readonly w: number;
	readonly h: number;
}

export const REGION: Record<RegionId, Region> = {
	bar: { x: 0, y: 0, w: 240, h: 26 },
	head: { x: 8, y: 38, w: 224, h: 44 },
	sub: { x: 8, y: 88, w: 224, h: 40 },
	cta: { x: 8, y: 132, w: 224, h: 30 },
	hero: { x: 8, y: 170, w: 224, h: 150 },
	list: { x: 8, y: 332, w: 224, h: 60 },
	foot: { x: 0, y: 490, w: 240, h: 30 },
};

interface Home {
	readonly head: string;
	readonly headBig: boolean;
	readonly sub: string;
	readonly cta: string;
	readonly ctaDark: boolean;
	readonly ctaWide: boolean;
	readonly hero: "flat" | "tint" | "photo";
	readonly items: readonly string[];
	readonly prices: readonly string[];
	readonly foot: string;
	readonly footHours: string | null;
	readonly barLines: boolean;
}

/** the frame before the turn touches it: placed, sized, and saying almost nothing */
const START: Home = {
	head: "Kaffe på Torsgatan",
	headBig: false,
	sub: "Öppet varje dag.",
	cta: "Meny",
	ctaDark: false,
	ctaWide: false,
	hero: "flat",
	items: [],
	prices: [],
	foot: "Torsgatan 11",
	footHours: null,
	barLines: false,
};

/**
 * The thirteen writes, in the order the capture makes them, each naming the block
 * it lands in.
 *
 * Thirteen because that is how many `Edit` calls `claude-edits.json` makes to
 * `frames/home/frame.tsx`, in runs of six, four and three with a shot and a look
 * between them. The fourteenth write in that capture is the `frame.json` the turn
 * opens with, and it is not here: geometry moves the rectangle, not the design, and
 * a margin that marked it would be pointing at a block nothing happened to.
 */
export const EDITS: readonly { readonly region: RegionId; readonly apply: (home: Home) => Home }[] = [
	/* the run of six: the page gets a voice, top to bottom */
	{ region: "head", apply: (home) => ({ ...home, head: "Bryggt på Torsgatan sedan 2016" }) },
	{ region: "sub", apply: (home) => ({ ...home, sub: "Ljusrostade bönor, malda i baren. Vi öppnar sju varje morgon." }) },
	{ region: "cta", apply: (home) => ({ ...home, cta: "Beställ nu" }) },
	{ region: "cta", apply: (home) => ({ ...home, ctaDark: true }) },
	{ region: "hero", apply: (home) => ({ ...home, hero: "tint" }) },
	{ region: "bar", apply: (home) => ({ ...home, barLines: true }) },
	/* the run of four: the bottom of the page, which until now was empty */
	{ region: "list", apply: (home) => ({ ...home, items: ["Bryggkaffe", "Cortado", "Kanelbulle"] }) },
	{ region: "list", apply: (home) => ({ ...home, prices: ["32", "46", "38"] }) },
	{ region: "foot", apply: (home) => ({ ...home, foot: "Torsgatan 11, Stockholm" }) },
	{ region: "foot", apply: (home) => ({ ...home, footHours: "07 till 18" }) },
	/* the run of three: back to the top, tightening what the first run put there */
	{ region: "head", apply: (home) => ({ ...home, headBig: true }) },
	{ region: "hero", apply: (home) => ({ ...home, hero: "photo" }) },
	{ region: "cta", apply: (home) => ({ ...home, ctaWide: true }) },
];

/** the block each write lands in, which is all the margin needs from the staging */
export const LANDS: readonly RegionId[] = EDITS.map((edit) => edit.region);

const INK = "#17171A";
const PAPER = "#FEFEFE";
const RULE = "#E4E4E7";
const GREY = "#86868B";

function homeAt(rev: number): Home {
	return EDITS.slice(0, Math.max(0, Math.min(EDITS.length, rev))).reduce((home, edit) => edit.apply(home), START);
}

export function KaffeHomeAccrue({ rev }: { rev: number }) {
	const home = homeAt(rev);
	return (
		<div
			className="relative h-full w-full overflow-hidden rounded-lg border font-[Instrument_Sans]"
			style={{ borderColor: RULE, background: PAPER, color: INK }}
		>
			<div
				className="absolute inset-x-0 top-0 flex h-[26px] items-center justify-between border-b px-3"
				style={{ borderColor: RULE }}
			>
				<span className="font-semibold text-[10px] tracking-tight leading-3">kaffe</span>
				{home.barLines ? (
					<span className="flex flex-col gap-[3px]">
						<span className="block h-px w-[11px]" style={{ background: INK }} />
						<span className="block h-px w-[11px]" style={{ background: INK }} />
					</span>
				) : null}
			</div>

			<h1
				className={cn(
					"absolute right-3 left-3 text-balance font-semibold tracking-tight",
					home.headBig ? "text-[17px] leading-[20px]" : "text-[15px] leading-[18px]",
				)}
				style={{ top: 40 }}
			>
				{home.head}
			</h1>

			<p className="absolute left-3 w-[204px] text-balance text-[8.5px] leading-[13px]" style={{ top: 90, color: GREY }}>
				{home.sub}
			</p>

			<div
				className="absolute flex h-[26px] items-center justify-center rounded-[3px] text-[8.5px] leading-3"
				style={{
					top: 134,
					left: 12,
					width: home.ctaWide ? 118 : 92,
					background: home.ctaDark ? INK : PAPER,
					color: home.ctaDark ? PAPER : INK,
					border: home.ctaDark ? "1px solid transparent" : `1px solid ${RULE}`,
				}}
			>
				{home.cta}
			</div>

			<div
				className="absolute right-3 left-3 overflow-hidden rounded-md"
				style={{ top: 172, height: 146, background: home.hero === "flat" ? "#EFEFF1" : "#E9E5DE" }}
			>
				{home.hero === "photo" ? (
					<>
						<span
							className="absolute inset-0 block"
							style={{ background: "linear-gradient(158deg, #D8CFC2 0%, #B8A995 58%, #6E6153 100%)" }}
						/>
						<span
							className="absolute block rounded-full"
							style={{ left: 44, top: 32, width: 72, height: 72, background: "rgba(254,254,254,0.22)" }}
						/>
						<span
							className="absolute right-0 bottom-0 left-0 block"
							style={{ height: 46, background: "linear-gradient(180deg, rgba(23,23,26,0) 0%, rgba(23,23,26,0.28) 100%)" }}
						/>
					</>
				) : null}
			</div>

			<div className="absolute right-3 left-3 flex flex-col gap-[8px]" style={{ top: 334 }}>
				{home.items.map((item, index) => (
					<div key={item} className="flex items-baseline justify-between">
						<span className="text-[8.5px] leading-3">{item}</span>
						<span className="text-[8.5px] leading-3" style={{ color: GREY }}>
							{home.prices[index] ?? ""}
						</span>
					</div>
				))}
			</div>

			<div
				className="absolute inset-x-0 bottom-0 flex h-[30px] items-center justify-between border-t px-3"
				style={{ borderColor: RULE }}
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
