import type { ReactNode } from "react";
import { cn } from "../../../shared/lib/utils";

/**
 * `home` and the thirteen writes this turn lands in it, carried from
 * `agent-hand--loud-flat/home-flat.tsx` with one thing changed: every block is placed
 * by a `place` the caller hands in, so an arrival treatment decides how a block
 * arrives without the page knowing what the treatment is.
 *
 * The layout table is that file's and every number is unchanged. It matters here more
 * than it did there, because the sheet needs a block's **box** twice over: the lane on
 * the wall draws a mark at the height of the block a write changed, and four of the
 * eight arrivals decorate the box the write landed in. One table answers both, so a
 * mark and the thing it is about can never drift apart.
 *
 * Four of the thirteen writes move what is under them and the other nine change in
 * place, which is the split every arrival has to survive.
 */

export type BlockId = "bar" | "head" | "sub" | "cta" | "hero" | "list" | "foot";

/** where a block sits after some number of writes, in the frame's own 240x520 coordinates */
export interface Box {
	readonly x: number;
	readonly y: number;
	readonly w: number;
	readonly h: number;
}

export const WRITES = 13;

/** the block each write lands in, in the order the capture makes them */
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

/** the four writes that push what is under them down the page */
export const REFLOWS = new Set([2, 7, 11, 12]);

const PAD = 12;
const COL = 216;
/** the gap that follows each block in the stack */
const GAP = { head: 8, sub: 12, cta: 14, hero: 20 } as const;

/** every block's box after `rev` writes — the one source of truth the page and the wall share */
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

/**
 * How a block gets onto the page. The default puts it at its box and nothing else;
 * every arrival treatment is a different answer to this one function.
 */
export type Place = (id: BlockId, box: Box, node: ReactNode) => ReactNode;

export const plainPlace: Place = (id, box, node) => (
	<div key={id} className="absolute" style={{ left: box.x, top: box.y, width: box.w, height: box.h }}>
		{node}
	</div>
);

export function KaffePage({ rev, place = plainPlace }: { rev: number; place?: Place }) {
	const at = layout(rev);
	const hero = rev >= 12 ? "photo" : rev >= 5 ? "tint" : "flat";
	const dark = rev >= 4;
	return (
		<div
			className="relative h-full w-full overflow-hidden rounded-lg border font-[Instrument_Sans]"
			style={{ borderColor: RULE, background: PAPER, color: INK }}
		>
			{place(
				"bar",
				at.bar,
				<div className="flex h-full w-full items-center justify-between border-b px-3" style={{ borderColor: RULE }}>
					<span className="font-semibold text-[10px] leading-3 tracking-tight">kaffe</span>
					{rev >= 6 ? (
						<span className="flex flex-col gap-[3px]">
							<span className="block h-px w-[11px]" style={{ background: INK }} />
							<span className="block h-px w-[11px]" style={{ background: INK }} />
						</span>
					) : null}
				</div>,
			)}

			{place(
				"head",
				at.head,
				<h1
					className={cn("font-semibold text-[15px] leading-[18px] tracking-tight", rev >= 11 ? null : "truncate")}
				>
					{rev >= 11 ? HEAD_LONG : rev >= 1 ? HEAD_ONE : HEAD_FOUND}
				</h1>,
			)}

			{place(
				"sub",
				at.sub,
				<p className="text-[8.5px] leading-[13px]" style={{ color: GREY }}>
					{rev >= 2 ? SUB_LONG : SUB_FOUND}
				</p>,
			)}

			{place(
				"cta",
				at.cta,
				<div
					className="flex h-full w-full items-center justify-center rounded-[3px] text-[8.5px] leading-3"
					style={{
						background: dark ? INK : PAPER,
						color: dark ? PAPER : INK,
						border: dark ? "1px solid transparent" : `1px solid ${RULE}`,
					}}
				>
					{rev >= 3 ? "Beställ bönor" : "Meny"}
				</div>,
			)}

			{place(
				"hero",
				at.hero,
				<div
					className="relative h-full w-full overflow-hidden rounded-md"
					style={{ background: hero === "flat" ? "#EFEFF1" : "#E9E5DE" }}
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
				</div>,
			)}

			{place(
				"list",
				at.list,
				rev >= 7 ? (
					<div className="flex w-full flex-col gap-[8px]">
						{ITEMS.map((item, index) => (
							<div key={item} className="flex h-3 items-baseline justify-between">
								<span className="text-[8.5px] leading-3">{item}</span>
								<span className="text-[8.5px] leading-3" style={{ color: GREY }}>
									{rev >= 8 ? PRICES[index] : ""}
								</span>
							</div>
						))}
					</div>
				) : null,
			)}

			{place(
				"foot",
				at.foot,
				<div className="flex h-full w-full items-center justify-between border-t px-3" style={{ borderColor: RULE }}>
					<span className="text-[8px] leading-3" style={{ color: GREY }}>
						{rev >= 9 ? "Torsgatan 11, Vasastan, Stockholm" : "Torsgatan 11"}
					</span>
					{rev >= 10 ? (
						<span className="text-[8px] leading-3" style={{ color: GREY }}>
							07 till 18
						</span>
					) : null}
				</div>,
			)}
		</div>
	);
}
