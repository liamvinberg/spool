import { cn } from "../../../shared/lib/utils";

/**
 * `home`, the frame this capture is about, drawn at two widths from one set of
 * thirteen writes.
 *
 * The phone is `agent-hand--ghost-loud`'s page unchanged: kaffe's own site at 390×844
 * carried into the 240×520 box the canvas draws every frame in, every value the real
 * one times 0.615, so the 39% in the header stays honest. The desktop is the same site
 * at 1440×900 under the same rule — 886×554 authored, which is the arithmetic this
 * direction had to check before it drew anything, because 886 authored is **561 drawn**
 * and a canvas holding a 152px phone and a 561px desktop at one zoom is the thing
 * nobody in this family has had to lay out.
 *
 * **Both pages are placed absolutely from one layout table, and both tables are running
 * sums.** `layout(rev)` returns every block's box after `rev` writes and a block's y is
 * the total of what is above it, so a write that makes a block taller really does move
 * everything under it. That is `--ghost-loud`'s arrangement kept for its reason: the
 * marks on the wall need exact heights and the reflow needs to be real, and a table
 * gives both.
 *
 * **The finding this file exists to produce is that the same write is a different event
 * at the two widths.** The phone is one column, so every block that grows pushes the
 * whole page down. The desktop puts the hero in a second column beside the text, so:
 *
 *   write 2   the lede gains a line          phone: reflows the page   desktop: reflows the left column
 *   write 7   the menu arrives               phone: reflows the page   desktop: reflows the left column
 *   write 11  the headline gains a line      phone: reflows the page   desktop: reflows the left column
 *   write 12  the hero crops 24px shorter    phone: reflows the page   desktop: **reflows nothing at all**
 *   write 6   the nav lands                  phone: a hamburger        desktop: three words
 *
 * Four of thirteen reflow on the phone, three on the desktop, and the three that survive
 * move a third of the frame's width rather than all of it. So the loudest case any
 * direction in this family has been measured against — a reflow doubling everything under
 * it — is a phone-only case, and it is loud there because a phone is one column, not
 * because a write is big.
 *
 * Thirteen because that is how many `Edit` calls `claude-edits.json` makes to
 * `frames/home/frame.tsx`, in runs of six, four and three. The fourteenth write in that
 * capture is the `frame.json` the turn opens with, and it is deliberately not here:
 * geometry moves the rectangle and leaves the design alone.
 */

export type BlockId = "bar" | "head" | "sub" | "cta" | "hero" | "list" | "foot";

/** where a block sits after some number of writes, in its own page's authored coordinates */
export interface Box {
	readonly x: number;
	readonly y: number;
	readonly w: number;
	readonly h: number;
}

/** how many writes these pages draw, which is the count the capture's three runs add up to */
export const WRITES = 13;

/** what a phone frame is authored at, and what a desktop frame is authored at under the same 0.615 */
export const PHONE = { w: 240, h: 520 } as const;
export const WIDE = { w: 886, h: 554 } as const;

/**
 * The block each write lands in, in the order the capture makes them.
 *
 * `--ghost-loud`'s staging kept verbatim, so the two frames are comparable write for
 * write: the six in the top half, the four at the bottom, the last three back at the
 * top. It matters more here than it did there, because the runs are what the wipes are
 * spaced by and the spacing is this direction's hardest constraint.
 */
export const LANDS: readonly BlockId[] = [
	/* the run of six: the page gets a voice, top to bottom */
	"head",
	"sub",
	"cta",
	"cta",
	"hero",
	"bar",
	/* the run of four: the bottom of the page, which until now was empty */
	"list",
	"list",
	"foot",
	"foot",
	/* the run of three: back to the top, tightening what the first run put there */
	"head",
	"hero",
	"cta",
];

/* ---------- the copy, one set for both widths ---------- */

const HEAD_FOUND = "Kaffe på Torsgatan";
const HEAD_ONE = "Rostat en gata bort";
const HEAD_LONG = "Vi rostar allt vi häller upp, en gata bort";
const SUB_FOUND = "Öppet varje dag.";
const SUB_LONG = "Ljusrostade bönor, malda i baren. Vi öppnar sju varje morgon.";
const ITEMS = ["Bryggkaffe", "Cortado", "Kanelbulle"] as const;
const PRICES = ["32", "46", "38"] as const;
const NAV = ["Meny", "Om oss", "Öppettider"] as const;
const ADDRESS_SHORT = "Torsgatan 11";
const ADDRESS_LONG = "Torsgatan 11, Vasastan, Stockholm";
const OPEN_LINE = "07 till 18";

const INK = "#17171A";
const PAPER = "#FEFEFE";
const RULE = "#E4E4E7";
const GREY = "#86868B";

/* ---------- the phone ---------- */

const P_PAD = 12;
const P_COL = 216;
const P_GAP = { head: 8, sub: 12, cta: 14, hero: 20 } as const;

/** every block's box on the 240×520 page after `rev` writes */
export function phoneLayout(rev: number): Record<BlockId, Box> {
	const head: Box = { x: P_PAD, y: 38, w: P_COL, h: rev >= 11 ? 36 : 18 };
	const sub: Box = { x: P_PAD, y: head.y + head.h + P_GAP.head, w: P_COL, h: rev >= 2 ? 26 : 13 };
	const cta: Box = { x: P_PAD, y: sub.y + sub.h + P_GAP.sub, w: rev >= 13 ? 118 : 92, h: 26 };
	const hero: Box = { x: P_PAD, y: cta.y + cta.h + P_GAP.cta, w: P_COL, h: rev >= 12 ? 144 : 170 };
	const list: Box = { x: P_PAD, y: hero.y + hero.h + P_GAP.hero, w: P_COL, h: rev >= 7 ? 52 : 0 };
	return {
		bar: { x: 0, y: 0, w: 240, h: 26 },
		head,
		sub,
		cta,
		hero,
		list,
		foot: { x: 0, y: 490, w: 240, h: 30 },
	};
}

export function KaffeHomePhone({ rev }: { rev: number }) {
	const at = phoneLayout(rev);
	const hero = rev >= 12 ? "photo" : rev >= 5 ? "tint" : "flat";
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

			<Hero tone={hero} box={at.hero} radius={6} disc={{ left: 44, top: 26, size: 72 }} veil={46} />

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

			<div
				className="absolute flex items-center justify-between border-t px-3"
				style={{ left: at.foot.x, top: at.foot.y, width: at.foot.w, height: at.foot.h, borderColor: RULE }}
			>
				<span className="text-[8px] leading-3" style={{ color: GREY }}>
					{rev >= 9 ? ADDRESS_LONG : ADDRESS_SHORT}
				</span>
				{rev >= 10 ? (
					<span className="text-[8px] leading-3" style={{ color: GREY }}>
						{OPEN_LINE}
					</span>
				) : null}
			</div>
		</div>
	);
}

/* ---------- the desktop ---------- */

/**
 * The one number the whole layout hangs off: 1440 real times 0.615 is 886, and the
 * column widths below are the real ones through the same multiplier. A 553px measure at
 * 1440 is 340 here, a 72px page margin is 44, and the hero sits in the second column
 * rather than in the text, which is the whole of why the two pages reflow differently.
 */
const W_PAD = 72;
const W_COL = 340;
/** the lede keeps a measure rather than filling the column, the way a real page would */
const W_MEASURE = 300;
const W_GAP = { head: 14, sub: 22, cta: 30 } as const;

/** every block's box on the 886×554 page after `rev` writes */
export function wideLayout(rev: number): Record<BlockId, Box> {
	const head: Box = { x: W_PAD, y: 108, w: W_COL, h: rev >= 11 ? 64 : 32 };
	const sub: Box = { x: W_PAD, y: head.y + head.h + W_GAP.head, w: W_MEASURE, h: rev >= 2 ? 34 : 17 };
	const cta: Box = { x: W_PAD, y: sub.y + sub.h + W_GAP.sub, w: rev >= 13 ? 132 : 104, h: 34 };
	const list: Box = { x: W_PAD, y: cta.y + cta.h + W_GAP.cta, w: W_COL, h: rev >= 7 ? 76 : 0 };
	return {
		bar: { x: 0, y: 0, w: WIDE.w, h: 44 },
		head,
		sub,
		cta,
		list,
		// the second column, so write 12 crops it and moves nothing
		hero: { x: 452, y: 108, w: 362, h: rev >= 12 ? 306 : 346 },
		foot: { x: 0, y: 506, w: WIDE.w, h: 48 },
	};
}

export function KaffeHomeWide({ rev }: { rev: number }) {
	const at = wideLayout(rev);
	const hero = rev >= 12 ? "photo" : rev >= 5 ? "tint" : "flat";
	const dark = rev >= 4;
	return (
		<div
			className="relative h-full w-full overflow-hidden rounded-lg border font-[Instrument_Sans]"
			style={{ borderColor: RULE, background: PAPER, color: INK }}
		>
			<div
				className="absolute flex items-center justify-between border-b"
				style={{
					left: at.bar.x,
					top: at.bar.y,
					width: at.bar.w,
					height: at.bar.h,
					paddingLeft: W_PAD,
					paddingRight: W_PAD,
					borderColor: RULE,
				}}
			>
				<span className="font-semibold text-[14px] tracking-tight leading-4">kaffe</span>
				{/* the same write that gives the phone a hamburger gives this three words */}
				{rev >= 6 ? (
					<span className="flex items-center gap-6">
						{NAV.map((word) => (
							<span key={word} className="text-[10px] leading-3" style={{ color: GREY }}>
								{word}
							</span>
						))}
					</span>
				) : null}
			</div>

			<h1
				className="absolute font-semibold text-[25px] tracking-tight leading-[32px]"
				style={{ left: at.head.x, top: at.head.y, width: at.head.w, height: at.head.h }}
			>
				{rev >= 11 ? HEAD_LONG : rev >= 1 ? HEAD_ONE : HEAD_FOUND}
			</h1>

			<p
				className="absolute text-[10.5px] leading-[17px]"
				style={{ left: at.sub.x, top: at.sub.y, width: at.sub.w, height: at.sub.h, color: GREY }}
			>
				{rev >= 2 ? SUB_LONG : SUB_FOUND}
			</p>

			<div
				className="absolute flex items-center justify-center rounded-[4px] text-[10.5px] leading-4"
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

			{rev >= 7 ? (
				<div className="absolute flex flex-col gap-[12px]" style={{ left: at.list.x, top: at.list.y, width: at.list.w }}>
					{ITEMS.map((item, index) => (
						<div key={item} className="flex h-4 items-baseline justify-between border-b pb-[11px]" style={{ borderColor: "#EFEFF1" }}>
							<span className="text-[10.5px] leading-4">{item}</span>
							<span className="text-[10.5px] leading-4" style={{ color: GREY }}>
								{rev >= 8 ? PRICES[index] : ""}
							</span>
						</div>
					))}
				</div>
			) : null}

			<Hero tone={hero} box={at.hero} radius={10} disc={{ left: 96, top: 54, size: 148 }} veil={92} />

			<div
				className="absolute flex items-center justify-between border-t"
				style={{
					left: at.foot.x,
					top: at.foot.y,
					width: at.foot.w,
					height: at.foot.h,
					paddingLeft: W_PAD,
					paddingRight: W_PAD,
					borderColor: RULE,
				}}
			>
				<span className="text-[10px] leading-3" style={{ color: GREY }}>
					{rev >= 9 ? ADDRESS_LONG : ADDRESS_SHORT}
				</span>
				{rev >= 10 ? (
					<span className="text-[10px] leading-3" style={{ color: GREY }}>
						{OPEN_LINE}
					</span>
				) : null}
			</div>
		</div>
	);
}

/** the picture block, one component so both widths crop and tint on the same three writes */
function Hero({
	tone,
	box,
	radius,
	disc,
	veil,
}: {
	tone: "flat" | "tint" | "photo";
	box: Box;
	radius: number;
	disc: { left: number; top: number; size: number };
	veil: number;
}) {
	return (
		<div
			className="absolute overflow-hidden"
			style={{
				left: box.x,
				top: box.y,
				width: box.w,
				height: box.h,
				borderRadius: radius,
				background: tone === "flat" ? "#EFEFF1" : "#E9E5DE",
			}}
		>
			{tone === "photo" ? (
				<>
					<span
						className="absolute inset-0 block"
						style={{ background: "linear-gradient(158deg, #D8CFC2 0%, #B8A995 58%, #6E6153 100%)" }}
					/>
					<span
						className="absolute block rounded-full"
						style={{
							left: disc.left,
							top: disc.top,
							width: disc.size,
							height: disc.size,
							background: "rgba(254,254,254,0.22)",
						}}
					/>
					<span
						className="absolute right-0 bottom-0 left-0 block"
						style={{
							height: veil,
							background: "linear-gradient(180deg, rgba(23,23,26,0) 0%, rgba(23,23,26,0.28) 100%)",
						}}
					/>
				</>
			) : null}
		</div>
	);
}
