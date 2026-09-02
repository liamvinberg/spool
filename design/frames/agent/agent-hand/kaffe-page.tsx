import { cn } from "shared/lib/utils";

/**
 * kaffe's home page at two widths, and the one write list both of them answer.
 *
 * `agent-hand--ghost-loud/home-loud.tsx` is the parent and its rule is kept: kaffe's
 * own site carried into a box the canvas draws at a fraction, every value the real one
 * times 0.615, so the zoom in the header stays honest. The phone is that file's page
 * almost verbatim — 240×520 authored, a real 390×844 — with one static block added.
 * The desktop is new: **886×554 authored, a real 1440×900**, which is the size this
 * whole family has been arguing about a page without ever drawing one.
 *
 * **Two frames, one write.** In spool a page at two breakpoints is two frame folders
 * reading one component out of `shared/ui/`, so a write to that component re-renders
 * both. That is the arrangement here: thirteen writes, twenty-six re-renders, one
 * transcript row per write saying `edit home`. It is also this file's stated fiction —
 * `claude-edits.json` edits `frames/home/frame.tsx` and knows nothing about a second
 * frame. The fiction is necessary rather than convenient: a horizontal mark cannot be
 * judged against a desktop layout unless the same write lands in one.
 *
 * **The layout tables are the point, not the prose.** `phoneLayout(rev)` and
 * `wideLayout(rev)` return every block's box after `rev` writes and the pages render
 * from them, so a reflow is real and a mark's geometry is exact rather than measured
 * after the fact. Three things fall out of running them side by side, and none of them
 * was predicted:
 *
 *   - **A phone reflow is the page, a desktop reflow is a column.** Four of the
 *     thirteen writes move something below them on the phone and three do on the
 *     desktop, which sounds like a wash until you count blocks: **twelve moved on the
 *     phone against five on the desktop**. Write 2 lengthens the lede and the phone
 *     moves the button, the picture, the menu and the hours; the desktop moves the
 *     button, because the grid holds everything else. Write 7 adds the menu and the
 *     desktop moves nothing at all.
 *   - **The desktop's one reflow is caused by the picture, not by the words.** The
 *     band below the hero sits under whichever column is taller, and the text column
 *     never overtakes the image — the image cropping shorter at write 12 is what moves
 *     the page. Write 11 doubles the headline and the desktop does not move.
 *   - **A block's share of the width is where the two pages stop being the same
 *     drawing.** On the phone a block is 90% of the page wide, or 100%. On the desktop
 *     the same block is 45%, or 15%. That number is the whole of this frame's argument
 *     and it is a property of the layout rather than of the mark.
 *
 * `hours` is here and is never written. It is the neighbour: stacked under the menu on
 * the phone and beside it on the desktop, which is the difference the mark runs into.
 */

export type BlockId = "bar" | "head" | "sub" | "cta" | "hero" | "list" | "hours" | "foot";

/** where a block sits after some number of writes, in the frame's own authored coordinates */
export interface Box {
	readonly x: number;
	readonly y: number;
	readonly w: number;
	readonly h: number;
}

/** what each frame is authored at: a real 390×844 and a real 1440×900, both times 0.615 */
export const PHONE = { w: 240, h: 520 } as const;
export const WIDE = { w: 886, h: 554 } as const;

/** how many writes this file draws, which is the count the capture's three runs add up to */
export const WRITES = 13;

/**
 * The block each write lands in, in the order the capture makes them.
 *
 * `--ghost-loud`'s staging unchanged, so the two frames stay comparable to it: the run
 * of six across the top half, the run of four at the bottom, the run of three back at
 * the top.
 */
export const LANDS: readonly BlockId[] = [
	"head",
	"sub",
	"cta",
	"cta",
	"hero",
	"bar",
	"list",
	"list",
	"foot",
	"foot",
	"head",
	"hero",
	"cta",
];

/**
 * The writes whose source line has no element on it, so the stamp cannot resolve them
 * to a rectangle at all.
 *
 * `--accrue` found these and `--ghost-lane` priced them: writes 7 and 8 add the menu by
 * editing hoisted constants, `ITEMS` and `PRICES`, and `jsx-dev-runtime.ts:27` stamps
 * elements. A write into a constant degrades to the frame's own root, so what comes
 * back is the frame's box rather than a block's.
 */
export const UNSTAMPED: ReadonlySet<number> = new Set([7, 8]);

export function phoneLayout(rev: number): Record<BlockId, Box> {
	const head: Box = { x: 12, y: 38, w: 216, h: rev >= 11 ? 36 : 18 };
	const sub: Box = { x: 12, y: head.y + head.h + 8, w: 216, h: rev >= 2 ? 26 : 13 };
	const cta: Box = { x: 12, y: sub.y + sub.h + 12, w: rev >= 13 ? 118 : 92, h: 26 };
	const hero: Box = { x: 12, y: cta.y + cta.h + 14, w: 216, h: rev >= 12 ? 144 : 170 };
	const list: Box = { x: 12, y: hero.y + hero.h + 20, w: 216, h: rev >= 7 ? 52 : 0 };
	const hours: Box = { x: 12, y: list.y + list.h + (rev >= 7 ? 18 : 0), w: 216, h: 46 };
	return {
		bar: { x: 0, y: 0, w: 240, h: 26 },
		head,
		sub,
		cta,
		hero,
		list,
		hours,
		foot: { x: 0, y: 490, w: 240, h: 30 },
	};
}

/**
 * The same page at 1440.
 *
 * Two columns in the hero and two below it. `band` is the line the lower half starts
 * on and it is `max(text, picture) + 48` — which is why one write in thirteen reflows
 * this page and it is the one that changes the picture's height.
 */
export function wideLayout(rev: number): Record<BlockId, Box> {
	const head: Box = { x: 48, y: 92, w: 400, h: rev >= 11 ? 76 : 40 };
	const sub: Box = { x: 48, y: head.y + head.h + 14, w: 360, h: rev >= 2 ? 40 : 20 };
	const cta: Box = { x: 48, y: sub.y + sub.h + 22, w: rev >= 13 ? 168 : 132, h: 38 };
	const hero: Box = { x: 500, y: 76, w: 338, h: rev >= 12 ? 196 : 220 };
	const band = Math.max(cta.y + cta.h, hero.y + hero.h) + 48;
	return {
		bar: { x: 0, y: 0, w: 886, h: 40 },
		head,
		sub,
		cta,
		hero,
		list: { x: 48, y: band, w: 338, h: rev >= 7 ? 88 : 0 },
		hours: { x: 500, y: band, w: 338, h: 124 },
		foot: { x: 0, y: 506, w: 886, h: 48 },
	};
}

const INK = "#17171A";
const PAPER = "#FEFEFE";
const RULE = "#E4E4E7";
const GREY = "#86868B";

const HEAD_FOUND = "Kaffe på Torsgatan";
const HEAD_ONE = "Rostat en gata bort";
const HEAD_LONG = "Vi rostar allt vi häller upp, en gata bort";
const SUB_FOUND = "Öppet varje dag.";
const SUB_LONG = "Ljusrostade bönor, malda i baren. Vi öppnar sju varje morgon.";
const ITEMS = ["Bryggkaffe", "Cortado", "Kanelbulle"] as const;
const PRICES = ["32", "46", "38"] as const;
const DAYS = [
	["Mån till fre", "07 till 18"],
	["Lördag", "08 till 17"],
	["Söndag", "09 till 16"],
] as const;

/** the picture, at whichever of its three states the writes have reached */
function Hero({ rev, radius }: { rev: number; radius: number }) {
	const tone = rev >= 12 ? "photo" : rev >= 5 ? "tint" : "flat";
	return (
		<div
			className="absolute inset-0 overflow-hidden"
			style={{ borderRadius: radius, background: tone === "flat" ? "#EFEFF1" : "#E9E5DE" }}
		>
			{tone === "photo" ? (
				<>
					<span
						className="absolute inset-0 block"
						style={{ background: "linear-gradient(158deg, #D8CFC2 0%, #B8A995 58%, #6E6153 100%)" }}
					/>
					<span
						className="absolute block rounded-full"
						style={{ left: "18%", top: "14%", width: "34%", aspectRatio: "1", background: "rgba(254,254,254,0.22)" }}
					/>
					<span
						className="absolute right-0 bottom-0 left-0 block"
						style={{
							height: "24%",
							background: "linear-gradient(180deg, rgba(23,23,26,0) 0%, rgba(23,23,26,0.28) 100%)",
						}}
					/>
				</>
			) : null}
		</div>
	);
}

export function KaffePhone({ rev }: { rev: number }) {
	const at = phoneLayout(rev);
	const dark = rev >= 4;
	return (
		<div
			className="relative h-full w-full overflow-hidden rounded-lg border font-[Instrument_Sans]"
			style={{ borderColor: RULE, background: PAPER, color: INK }}
		>
			<div
				className="absolute flex items-center justify-between border-b px-3"
				style={{ left: at.bar.x, top: at.bar.y, width: at.bar.w, height: at.bar.h, borderColor: RULE }}
			>
				<span className="font-semibold text-[10px] tracking-tight leading-3">kaffe</span>
				{rev >= 6 ? (
					<span className="flex flex-col gap-[3px]">
						<span className="block h-px w-[11px]" style={{ background: INK }} />
						<span className="block h-px w-[11px]" style={{ background: INK }} />
					</span>
				) : null}
			</div>

			<h1
				className={cn("absolute font-semibold text-[15px] tracking-tight leading-[18px]", rev >= 11 ? null : "truncate")}
				style={{ left: at.head.x, top: at.head.y, width: at.head.w, height: at.head.h }}
			>
				{rev >= 11 ? HEAD_LONG : rev >= 1 ? HEAD_ONE : HEAD_FOUND}
			</h1>

			<p
				className="absolute text-[8.5px] leading-[13px]"
				style={{ left: at.sub.x, top: at.sub.y, width: at.sub.w, height: at.sub.h, color: GREY }}
			>
				{rev >= 2 ? SUB_LONG : SUB_FOUND}
			</p>

			<div
				className="absolute flex items-center justify-center rounded-[3px] text-[8.5px] leading-3"
				style={{
					left: at.cta.x,
					top: at.cta.y,
					width: at.cta.w,
					height: at.cta.h,
					background: dark ? INK : PAPER,
					color: dark ? PAPER : INK,
					border: dark ? "1px solid transparent" : `1px solid ${RULE}`,
				}}
			>
				{rev >= 3 ? "Beställ bönor" : "Meny"}
			</div>

			<div className="absolute" style={{ left: at.hero.x, top: at.hero.y, width: at.hero.w, height: at.hero.h }}>
				<Hero rev={rev} radius={6} />
			</div>

			{rev >= 7 ? (
				<div className="absolute flex flex-col gap-[8px]" style={{ left: at.list.x, top: at.list.y, width: at.list.w }}>
					{ITEMS.map((item, index) => (
						<div key={item} className="flex h-3 items-baseline justify-between">
							<span className="text-[8.5px] leading-3">{item}</span>
							<span className="text-[8.5px] leading-3" style={{ color: GREY }}>
								{rev >= 8 ? PRICES[index] : ""}
							</span>
						</div>
					))}
				</div>
			) : null}

			<div className="absolute flex flex-col gap-[6px]" style={{ left: at.hours.x, top: at.hours.y, width: at.hours.w }}>
				<span className="font-medium text-[8.5px] leading-3">Öppettider</span>
				{DAYS.map(([day, span]) => (
					<div key={day} className="flex items-baseline justify-between">
						<span className="text-[8px] leading-3" style={{ color: GREY }}>
							{day}
						</span>
						<span className="text-[8px] leading-3" style={{ color: GREY }}>
							{span}
						</span>
					</div>
				))}
			</div>

			<div
				className="absolute flex items-center justify-between border-t px-3"
				style={{ left: at.foot.x, top: at.foot.y, width: at.foot.w, height: at.foot.h, borderColor: RULE }}
			>
				<span className="text-[8px] leading-3" style={{ color: GREY }}>
					{rev >= 9 ? "Torsgatan 11, Vasastan, Stockholm" : "Torsgatan 11"}
				</span>
				{rev >= 10 ? (
					<span className="text-[8px] leading-3" style={{ color: GREY }}>
						07 till 18
					</span>
				) : null}
			</div>
		</div>
	);
}

export function KaffeWide({ rev }: { rev: number }) {
	const at = wideLayout(rev);
	const dark = rev >= 4;
	return (
		<div
			className="relative h-full w-full overflow-hidden rounded-lg border font-[Instrument_Sans]"
			style={{ borderColor: RULE, background: PAPER, color: INK }}
		>
			<div
				className="absolute flex items-center justify-between border-b px-12"
				style={{ left: at.bar.x, top: at.bar.y, width: at.bar.w, height: at.bar.h, borderColor: RULE }}
			>
				<span className="font-semibold text-[15px] tracking-tight leading-4">kaffe</span>
				{rev >= 6 ? (
					<span className="flex items-center gap-6 text-[11px] leading-3" style={{ color: GREY }}>
						<span>Meny</span>
						<span>Bönor</span>
						<span>Hitta hit</span>
					</span>
				) : null}
			</div>

			<h1
				className="absolute font-semibold text-[26px] tracking-tight leading-[34px]"
				style={{ left: at.head.x, top: at.head.y, width: at.head.w, height: at.head.h }}
			>
				{rev >= 11 ? HEAD_LONG : rev >= 1 ? HEAD_ONE : HEAD_FOUND}
			</h1>

			<p
				className="absolute text-[13px] leading-[18px]"
				style={{ left: at.sub.x, top: at.sub.y, width: at.sub.w, height: at.sub.h, color: GREY }}
			>
				{rev >= 2 ? SUB_LONG : SUB_FOUND}
			</p>

			<div
				className="absolute flex items-center justify-center rounded-[4px] text-[12px] leading-4"
				style={{
					left: at.cta.x,
					top: at.cta.y,
					width: at.cta.w,
					height: at.cta.h,
					background: dark ? INK : PAPER,
					color: dark ? PAPER : INK,
					border: dark ? "1px solid transparent" : `1px solid ${RULE}`,
				}}
			>
				{rev >= 3 ? "Beställ bönor" : "Meny"}
			</div>

			<div className="absolute" style={{ left: at.hero.x, top: at.hero.y, width: at.hero.w, height: at.hero.h }}>
				<Hero rev={rev} radius={10} />
			</div>

			{rev >= 7 ? (
				<div className="absolute flex flex-col gap-3" style={{ left: at.list.x, top: at.list.y, width: at.list.w }}>
					<span className="font-medium text-[12px] leading-4">Meny</span>
					{ITEMS.map((item, index) => (
						<div key={item} className="flex items-baseline justify-between border-b pb-2" style={{ borderColor: RULE }}>
							<span className="text-[12px] leading-4">{item}</span>
							<span className="text-[12px] leading-4" style={{ color: GREY }}>
								{rev >= 8 ? PRICES[index] : ""}
							</span>
						</div>
					))}
				</div>
			) : null}

			<div className="absolute flex flex-col gap-3" style={{ left: at.hours.x, top: at.hours.y, width: at.hours.w }}>
				<span className="font-medium text-[12px] leading-4">Öppettider</span>
				{DAYS.map(([day, span]) => (
					<div key={day} className="flex items-baseline justify-between border-b pb-2" style={{ borderColor: RULE }}>
						<span className="text-[12px] leading-4" style={{ color: GREY }}>
							{day}
						</span>
						<span className="text-[12px] leading-4" style={{ color: GREY }}>
							{span}
						</span>
					</div>
				))}
			</div>

			<div
				className="absolute flex items-center justify-between border-t px-12"
				style={{ left: at.foot.x, top: at.foot.y, width: at.foot.w, height: at.foot.h, borderColor: RULE }}
			>
				<span className="text-[11px] leading-4" style={{ color: GREY }}>
					{rev >= 9 ? "Torsgatan 11, Vasastan, Stockholm" : "Torsgatan 11"}
				</span>
				{rev >= 10 ? (
					<span className="text-[11px] leading-4" style={{ color: GREY }}>
						07 till 18
					</span>
				) : null}
			</div>
		</div>
	);
}
