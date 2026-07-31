import { cn } from "../../../shared/lib/utils";

/**
 * `home`, the frame the whole capture is about, drawn so that an edit is a real
 * change rather than a picture of one.
 *
 * `shared/ui/kaffe-home.tsx` is the finished frame and this is the same frame on
 * its way there: one content object, thirteen patches, and a `rev` that says how
 * many of them have landed. Nothing here is a metaphor — `agent-hand--inside`
 * counts the writes off the capture's own run children, hands the count in, and
 * the frame on the canvas redraws. That is what `spool` does to a live frame when
 * a write lands on disk, so drawing anything else would be inventing an effect the
 * product already has.
 *
 * Every block is absolutely placed inside the 240×520 box the canvas draws every
 * frame in, which is not how kaffe-home.tsx is built and is deliberate: the marks
 * over this frame have to name the *region* an edit touched, so a region needs a
 * box that is true by construction rather than one measured after a reflow. It
 * also means a write never moves the six blocks around it, which is exactly the
 * property that makes the fourteenth write legible as a change to one of them.
 *
 * Palette and scale are kaffe-home.tsx's unchanged: paper, one ink, one grey, one
 * surface, every value the real 390×844 one times 0.615.
 */

export type RegionId = "bar" | "head" | "sub" | "cta" | "hero" | "hours" | "foot";

/** where a block sits in the frame's own 240×520 coordinates */
export interface Region {
	readonly x: number;
	readonly y: number;
	readonly w: number;
	readonly h: number;
}

export const REGION: Record<RegionId, Region> = {
	bar: { x: 0, y: 0, w: 240, h: 26 },
	head: { x: 8, y: 38, w: 224, h: 48 },
	sub: { x: 8, y: 88, w: 224, h: 44 },
	cta: { x: 8, y: 136, w: 224, h: 32 },
	hero: { x: 8, y: 178, w: 224, h: 154 },
	hours: { x: 8, y: 342, w: 224, h: 56 },
	foot: { x: 0, y: 490, w: 240, h: 30 },
};

interface Home {
	readonly head: string;
	readonly headBig: boolean;
	readonly sub: string;
	readonly subNarrow: boolean;
	readonly cta: string;
	readonly ctaDark: boolean;
	readonly ctaWide: boolean;
	readonly hero: "flat" | "tint" | "photo";
	readonly days: readonly string[];
	readonly hours: readonly string[];
	readonly foot: string;
	readonly barLines: boolean;
}

/** the frame before the turn touches it: placed, sized, and saying almost nothing */
const START: Home = {
	head: "Kaffe på Torsgatan",
	headBig: false,
	sub: "Öppet varje dag.",
	subNarrow: false,
	cta: "Meny",
	ctaDark: false,
	ctaWide: false,
	hero: "flat",
	days: ["Vardagar", "Lördag", "Söndag"],
	hours: ["", "", ""],
	foot: "Torsgatan 11",
	barLines: false,
};

/**
 * The thirteen writes, in the order the capture makes them, each naming the block
 * it lands in.
 *
 * Thirteen because that is how many `Edit` calls `claude-edits.json` makes to
 * `frames/home/frame.tsx`, in runs of six, four and three with a shot and a look
 * between them. The fourteenth write in that capture is the `frame.json` the turn
 * opens with, and it is not here: geometry is the rectangle, not the design.
 */
export const EDITS: readonly { readonly region: RegionId; readonly apply: (home: Home) => Home }[] = [
	{ region: "head", apply: (home) => ({ ...home, head: "Bryggt på Torsgatan sedan 2016" }) },
	{ region: "sub", apply: (home) => ({ ...home, sub: "Ljusrostade bönor, malda i baren. Öppet varje dag från sju." }) },
	{ region: "cta", apply: (home) => ({ ...home, cta: "Beställ nu" }) },
	{ region: "cta", apply: (home) => ({ ...home, ctaDark: true }) },
	{ region: "hero", apply: (home) => ({ ...home, hero: "tint" }) },
	{ region: "hours", apply: (home) => ({ ...home, days: ["Mån till fre", "Lördag", "Söndag"] }) },
	{ region: "foot", apply: (home) => ({ ...home, foot: "Torsgatan 11, Stockholm" }) },
	{ region: "head", apply: (home) => ({ ...home, headBig: true }) },
	{ region: "sub", apply: (home) => ({ ...home, subNarrow: true }) },
	{ region: "hero", apply: (home) => ({ ...home, hero: "photo" }) },
	{ region: "hours", apply: (home) => ({ ...home, hours: ["07–18", "08–17", "09–16"] }) },
	{ region: "bar", apply: (home) => ({ ...home, barLines: true }) },
	{ region: "cta", apply: (home) => ({ ...home, ctaWide: true }) },
];

function homeAt(rev: number): Home {
	return EDITS.slice(0, Math.max(0, Math.min(EDITS.length, rev))).reduce((home, edit) => edit.apply(home), START);
}

const INK = "#17171A";
const PAPER = "#FEFEFE";
const RULE = "#E4E4E7";
const GREY = "#86868B";

export function KaffeHomeRev({ rev }: { rev: number }) {
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
				style={{ top: 42 }}
			>
				{home.head}
			</h1>

			<p
				className="absolute left-3 text-balance text-[8.5px] leading-[13px]"
				style={{ top: 92, width: home.subNarrow ? 168 : 216, color: GREY }}
			>
				{home.sub}
			</p>

			<div
				className="absolute flex h-[26px] items-center justify-center rounded-[3px] text-[8.5px] leading-3"
				style={{
					top: 140,
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
				style={{ top: 182, height: 148, background: home.hero === "flat" ? "#EFEFF1" : "#E9E5DE" }}
			>
				{home.hero === "photo" ? (
					<>
						<span
							className="absolute inset-0 block"
							style={{ background: "linear-gradient(158deg, #D8CFC2 0%, #B8A995 58%, #6E6153 100%)" }}
						/>
						<span
							className="absolute block rounded-full"
							style={{ left: 44, top: 34, width: 72, height: 72, background: "rgba(254,254,254,0.22)" }}
						/>
						<span
							className="absolute right-0 bottom-0 left-0 block"
							style={{ height: 46, background: "linear-gradient(180deg, rgba(23,23,26,0) 0%, rgba(23,23,26,0.28) 100%)" }}
						/>
					</>
				) : null}
			</div>

			<div className="absolute right-3 left-3 flex flex-col gap-[7px]" style={{ top: 346 }}>
				{home.days.map((day, index) => (
					<div key={day} className="flex items-baseline justify-between">
						<span className="text-[8.5px] leading-3">{day}</span>
						<span className="text-[8.5px] leading-3" style={{ color: GREY }}>
							{home.hours[index] ?? ""}
						</span>
					</div>
				))}
			</div>

			<div
				className="absolute inset-x-0 bottom-0 flex h-[30px] items-center border-t px-3"
				style={{ borderColor: RULE }}
			>
				<span className="text-[8px] leading-3" style={{ color: GREY }}>
					{home.foot}
				</span>
			</div>
		</div>
	);
}
