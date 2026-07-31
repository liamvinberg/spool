import { cn } from "../../../shared/lib/utils";

/**
 * `home`, the frame this capture is about, with one layout table that both the
 * page and the margin read.
 *
 * `agent-hand--ghost-loud`'s file, copied rather than imported. Two frames arguing about
 * the same wall have to be able to disagree about the drawing while agreeing exactly
 * about the page underneath it, and a shared file between two variants of one direction
 * is a file either of them can move the other with.
 *
 * Same rule as `shared/ui/kaffe-home.tsx`: kaffe's own site at 390×844 carried into
 * the 240×520 box the canvas draws every frame in, so every value is the real one
 * times 0.615 and the 39% in the header stays honest. Palette unchanged — paper,
 * one ink, one grey, one surface.
 *
 * **This file is where two of the compiled directions turned out to want opposite
 * things.** `agent-hand--accrue` places every block absolutely, so a margin mark's
 * box is true by construction and no write ever moves the blocks around it.
 * `agent-hand--ghost` lays the page out in flow on purpose, because a write pushing
 * everything under it down the page is the most expensive thing a write can do and
 * the case a ghost is loudest on. You cannot have both: absolute placement makes the
 * ghost silent about the one thing it is best at, and flow makes a mark's y a
 * function of the revision.
 *
 * What is here is neither. **The stack is declared once, as arithmetic, and the page
 * is rendered from it.** `layout(rev)` returns every block's box after `rev` writes,
 * a block's y is the running sum of what is above it, and the render places each
 * block at the y the table gives. So the reflow is real — a block that grows moves
 * every block below it — and the margin's heights are exact rather than measured
 * after the fact. Above 400 drawn pixels the product would get the same numbers from
 * the `data-spool-source` stamp the shim already resolves for walk arrows; this table
 * is standing in for that request, and the standing-in is the whole of the fiction.
 *
 * Thirteen writes, because that is how many `Edit` calls `claude-edits.json` makes to
 * `frames/home/frame.tsx`, in runs of six, four and three. The fourteenth write in
 * that capture is the `frame.json` the turn opens with, and it is deliberately not
 * here: geometry moves the rectangle and leaves the design alone.
 *
 * Four of the thirteen move what is under them — the lede gaining a line, the menu
 * arriving where there was nothing, the headline gaining a line, the hero cropping
 * shorter — and the other nine change in place. The headline reflows by getting
 * **longer** rather than bigger: a size change from 15px to 17px does not reliably
 * break a 19-character line in a 216px column, and a reflow that only sometimes
 * happens is not a case you can measure a ghost against.
 */

export type BlockId = "bar" | "head" | "sub" | "cta" | "hero" | "list" | "foot";

/** where a block sits after some number of writes, in the frame's own 240×520 coordinates */
export interface Box {
	readonly x: number;
	readonly y: number;
	readonly w: number;
	readonly h: number;
}

/** how many writes this file draws, which is the count the capture's three runs add up to */
export const WRITES = 13;

/**
 * The block each write lands in, in the order the capture makes them.
 *
 * The staging gives each run its own shape — the six in the top half, the four at the
 * bottom, the last three back at the top — because the claim a margin makes is that a
 * run has a shape you can see, and a staging where every run touched the same blocks
 * would hide the claim rather than test it.
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

const PAD = 12;
const COL = 216;
/** the gap that follows each block in the stack */
const GAP = { head: 8, sub: 12, cta: 14, hero: 20 } as const;

/**
 * Every block's box after `rev` writes.
 *
 * The one source of truth in this frame. The page renders from it and the margin
 * measures from it, which is what makes a mark level with the block it is about at
 * the revision the write made rather than at the revision the canvas is showing —
 * two different numbers here for most of the turn.
 */
export function layout(rev: number): Record<BlockId, Box> {
	const head: Box = { x: PAD, y: 38, w: COL, h: rev >= 11 ? 36 : 18 };
	const sub: Box = { x: PAD, y: head.y + head.h + GAP.head, w: COL, h: rev >= 2 ? 26 : 13 };
	const cta: Box = { x: PAD, y: sub.y + sub.h + GAP.sub, w: rev >= 13 ? 118 : 92, h: 26 };
	const hero: Box = { x: PAD, y: cta.y + cta.h + GAP.cta, w: COL, h: rev >= 12 ? 144 : 170 };
	const list: Box = { x: PAD, y: hero.y + hero.h + GAP.hero, w: COL, h: rev >= 7 ? 52 : 0 };
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

export function KaffeHomeLoud({ rev }: { rev: number }) {
	const at = layout(rev);
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
				className={cn(
					"absolute font-semibold text-[15px] tracking-tight leading-[18px]",
					rev >= 11 ? null : "truncate",
				)}
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

			<div
				className="absolute overflow-hidden rounded-md"
				style={{
					left: at.hero.x,
					top: at.hero.y,
					width: at.hero.w,
					height: at.hero.h,
					background: hero === "flat" ? "#EFEFF1" : "#E9E5DE",
				}}
			>
				{hero === "photo" ? (
					<>
						<span
							className="absolute inset-0 block"
							style={{ background: "linear-gradient(158deg, #D8CFC2 0%, #B8A995 58%, #6E6153 100%)" }}
						/>
						<span
							className="absolute block rounded-full"
							style={{ left: 44, top: 26, width: 72, height: 72, background: "rgba(254,254,254,0.22)" }}
						/>
						<span
							className="absolute right-0 bottom-0 left-0 block"
							style={{
								height: 46,
								background: "linear-gradient(180deg, rgba(23,23,26,0) 0%, rgba(23,23,26,0.28) 100%)",
							}}
						/>
					</>
				) : null}
			</div>

			{rev >= 7 ? (
				<div
					className="absolute flex flex-col gap-[8px]"
					style={{ left: at.list.x, top: at.list.y, width: at.list.w }}
				>
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
