/**
 * `home` as a desktop page, and the layout table both the page and the margin read.
 *
 * Same rule as `shared/ui/kaffe-home.tsx` and `--ghost-loud`'s `home-loud.tsx`: the
 * real page carried into an authored box at **0.615**, so the 39% in the header stays
 * honest. What changes is the real page. A phone frame is 390×844 real, so it is
 * authored 240×520 and drawn 152 wide. This one is **1440×900 real**, so it is
 * authored **886×554** and drawn **561×351** at the same 0.6333 the canvas draws
 * everything at. Every number below is the real value times 0.615, and the real value
 * is in the comment wherever it is load-bearing.
 *
 * **It is a real desktop layout, not a stretched phone**, because a stretched phone
 * dodges the whole question. The page has a bar with links in its far corner, a hero
 * split into a text column and an image column, a band of three cards across the full
 * measure, and a footer. Two columns and a band is the least a page has to have before
 * *where a change happened* stops being answerable by one number.
 *
 * ## The stack is arithmetic, and reflow is real
 *
 * `layout(rev)` returns every block's box after `rev` writes and the page renders from
 * it, which is `--ghost-loud`'s resolution of the fight between `--accrue` (absolute,
 * so a mark's box is true by construction) and `--ghost` (flow, so a write that pushes
 * its neighbours down is visible). Inherited unchanged, because it is right and because
 * keeping it makes the two shapes comparable to the pixel.
 *
 * **What is new is that a desktop stack has two of them.** The left column stacks
 * head → lede → cta. The right column holds one tall image. The card band starts below
 * *whichever column is taller*. So there are three reflow shapes here and a phone page
 * can only produce the first:
 *
 *   in column   write 2 gives the lede a third line and moves the cta. Nothing outside
 *               the left column moves, because nothing outside it is under the lede.
 *   in place    nine of the thirteen. Same box, different content.
 *   across      write 12 crops the image by 30 and the card band comes **up** 30 — a
 *               write in the right column moving a block that spans both.
 *
 * ## The number this file exists to produce
 *
 * A left-column reflow can double at most `380 × (554 − 112)` = **34.2%** of this
 * frame, because the blast radius of a reflow is the width of the column it happens in
 * and everything below it. On a phone the column *is* the page, so the same bound is
 * `240 × (520 − 38)` = **92.7%**, and `--ghost-loud` measured its worst real case at
 * 57.8%. Write 11 here, the loudest of the thirteen, doubles **14.1%**.
 *
 * That is the ghost getting quieter with shape rather than louder, and it is not a
 * tuning: it is what columns are for.
 */

export type BlockId = "nav" | "head" | "lede" | "cta" | "shot" | "card1" | "card2" | "card3" | "foot";

/** where a block sits after some number of writes, in the frame's own 886×554 coordinates */
export interface Box {
	readonly x: number;
	readonly y: number;
	readonly w: number;
	readonly h: number;
}

/** the authored box, which is the real 1440×900 times 0.615 */
export const DESK_W = 886;
export const DESK_H = 554;

/** how many writes this file draws, which is the count the capture's three runs add up to */
export const WRITES = 13;

/**
 * The block each write lands in, in the order the capture makes them.
 *
 * Staged so each run has a shape and so the two cases this frame is about are both
 * drawn. **Writes 7, 8 and 9 are the failure**: three consecutive writes to three cards
 * that sit side by side, which is the one thing a phone page cannot produce and the one
 * thing a mark on a wall cannot separate. **Writes 11 and 12 are the reflow pair**: a
 * left-column reflow that stays in its column, then a right-column reflow that moves a
 * full-width band.
 */
export const LANDS: readonly BlockId[] = [
	/* the run of six: the page gets a voice, top left to top right */
	"head",
	"lede",
	"cta",
	"cta",
	"shot",
	"nav",
	/* the run of four: the band across the bottom, which until now was empty */
	"card1",
	"card2",
	"card3",
	"foot",
	/* the run of three: back up, tightening what the first run put there */
	"head",
	"shot",
	"cta",
];

/* real 96 of page padding, real 76 of bar, real 182 down to the hero */
const PAD = 59;
const BAR_H = 46;
const TOP = 112;
/* the two columns: real 618 of text, real 59 of gutter, real 572 of image */
const LEFT_W = 380;
const RIGHT_X = 475;
const RIGHT_W = 352;
/* three cards across the measure, real 390 each with real 39 between */
const CARD_W = 240;
const CARD_H = 90;
const CARD_GAP = 24;
const BAND_GAP = 40;
const FOOT_Y = 508;

/**
 * Every block's box after `rev` writes.
 *
 * The one source of truth. The page renders from it and the lane measures from it, so a
 * mark is level with the block it is about **at the revision the write made**, which is
 * not the revision the canvas is showing for most of this turn.
 *
 * `band` is the line the whole page turns on: it is the taller of the two columns plus
 * a gap, so it is the one place a change in one column is felt in the other. Across all
 * thirteen writes the image column stays the taller — 352 against the text column's
 * worst 310 — so the containment holds the whole way through and write 12 is the only
 * write that crosses.
 */
export function layout(rev: number): Record<BlockId, Box> {
	const head: Box = { x: PAD, y: TOP, w: LEFT_W, h: rev >= 11 ? 84 : 42 };
	const lede: Box = { x: PAD, y: head.y + head.h + 14, w: 340, h: rev >= 2 ? 48 : 32 };
	const cta: Box = { x: PAD, y: lede.y + lede.h + 22, w: rev >= 13 ? 124 : 96, h: 30 };
	const shot: Box = { x: RIGHT_X, y: TOP, w: RIGHT_W, h: rev >= 12 ? 210 : 240 };
	const band = Math.max(cta.y + cta.h, shot.y + shot.h) + BAND_GAP;
	return {
		nav: { x: 0, y: 0, w: DESK_W, h: BAR_H },
		head,
		lede,
		cta,
		shot,
		card1: { x: PAD, y: band, w: CARD_W, h: CARD_H },
		card2: { x: PAD + CARD_W + CARD_GAP, y: band, w: CARD_W, h: CARD_H },
		card3: { x: PAD + 2 * (CARD_W + CARD_GAP), y: band, w: CARD_W, h: CARD_H },
		foot: { x: 0, y: FOOT_Y, w: DESK_W, h: DESK_H - FOOT_Y },
	};
}

const INK = "#17171A";
const PAPER = "#FEFEFE";
const RULE = "#E4E4E7";
const GREY = "#86868B";

const HEAD_FOUND = "Kaffe på Torsgatan";
const HEAD_ONE = "Rostat en gata bort";
const HEAD_LONG = "Vi rostar allt vi häller upp, en gata bort";
const LEDE_FOUND = "Öppet varje dag från sju på morgonen.";
const LEDE_LONG =
	"Ljusrostade bönor, malda i baren medan du väntar. Vi öppnar sju varje morgon och stänger när kvarnen tystnar.";
const LINKS = ["Meny", "Bönor", "Om oss", "Hitta hit"] as const;

const CARDS = [
	{ title: "Mån till fre", body: "07 till 18", filled: 7 },
	{ title: "Lördag", body: "08 till 17", filled: 8 },
	{ title: "Söndag", body: "09 till 16", filled: 9 },
] as const;

export function KaffeDesk({ rev }: { rev: number }) {
	const at = layout(rev);
	const tone = rev >= 12 ? "photo" : rev >= 5 ? "tint" : "flat";
	const dark = rev >= 4;
	const cards = [at.card1, at.card2, at.card3];
	return (
		<div
			className="relative h-full w-full overflow-hidden rounded-lg border font-[Instrument_Sans]"
			style={{ borderColor: RULE, background: PAPER, color: INK }}
		>
			{/* the bar. Real 76 tall, its links in the far corner, which is the first thing a
			    phone page does not have anywhere to put */}
			<div
				className="absolute flex items-center justify-between border-b"
				style={{
					left: at.nav.x,
					top: at.nav.y,
					width: at.nav.w,
					height: at.nav.h,
					paddingLeft: PAD,
					paddingRight: PAD,
					borderColor: RULE,
				}}
			>
				<span className="font-semibold text-[12px] tracking-tight leading-[14px]">kaffe</span>
				{rev >= 6 ? (
					<span className="flex items-center gap-5">
						{LINKS.map((link) => (
							<span key={link} className="text-[9px] leading-[11px]" style={{ color: GREY }}>
								{link}
							</span>
						))}
					</span>
				) : (
					<span className="flex flex-col gap-[3px]">
						<span className="block h-px w-[14px]" style={{ background: INK }} />
						<span className="block h-px w-[14px]" style={{ background: INK }} />
					</span>
				)}
			</div>

			<h1
				className="absolute font-semibold text-[34px] tracking-tight leading-[42px]"
				style={{ left: at.head.x, top: at.head.y, width: at.head.w, height: at.head.h }}
			>
				{rev >= 11 ? HEAD_LONG : rev >= 1 ? HEAD_ONE : HEAD_FOUND}
			</h1>

			<p
				className="absolute text-[10.5px] leading-[16px]"
				style={{ left: at.lede.x, top: at.lede.y, width: at.lede.w, height: at.lede.h, color: GREY }}
			>
				{rev >= 2 ? LEDE_LONG : LEDE_FOUND}
			</p>

			<div
				className="absolute flex items-center justify-center rounded-[4px] text-[9px] leading-[11px]"
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

			{/* the image column. It is the taller of the two the whole way through, so it is
			    the one that sets where the band below starts */}
			<div
				className="absolute overflow-hidden rounded-md"
				style={{
					left: at.shot.x,
					top: at.shot.y,
					width: at.shot.w,
					height: at.shot.h,
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
							style={{ left: 96, top: 34, width: 108, height: 108, background: "rgba(254,254,254,0.22)" }}
						/>
						<span
							className="absolute right-0 bottom-0 left-0 block"
							style={{
								height: 68,
								background: "linear-gradient(180deg, rgba(23,23,26,0) 0%, rgba(23,23,26,0.28) 100%)",
							}}
						/>
					</>
				) : null}
			</div>

			{/* three cards, side by side, at one height. Writes 7, 8 and 9 land here one
			    after the other and a wall cannot tell them apart */}
			{cards.map((box, index) => {
				const card = CARDS[index];
				if (card === undefined) return null;
				return (
					<div
						key={card.title}
						className="absolute rounded-md border"
						style={{ left: box.x, top: box.y, width: box.w, height: box.h, borderColor: RULE }}
					>
						<div className="flex h-full flex-col justify-between p-4">
							<span className="font-semibold text-[12px] tracking-tight leading-[14px]">{card.title}</span>
							<span className="text-[9px] leading-[11px]" style={{ color: GREY }}>
								{rev >= card.filled ? card.body : ""}
							</span>
						</div>
					</div>
				);
			})}

			<div
				className="absolute flex items-center justify-between border-t"
				style={{
					left: at.foot.x,
					top: at.foot.y,
					width: at.foot.w,
					height: at.foot.h,
					paddingLeft: PAD,
					paddingRight: PAD,
					borderColor: RULE,
				}}
			>
				<span className="text-[8px] leading-[10px]" style={{ color: GREY }}>
					{rev >= 10 ? "Torsgatan 11, Vasastan, Stockholm" : "Torsgatan 11"}
				</span>
				{rev >= 10 ? (
					<span className="text-[8px] leading-[10px]" style={{ color: GREY }}>
						hej@kaffe.se
					</span>
				) : null}
			</div>
		</div>
	);
}

/**
 * The neighbour, and the reason it is below rather than beside.
 *
 * Two desktop frames cannot sit side by side on this canvas: 561 + 44 + 561 is 1,166
 * against a 772px viewport. Stacked they fit with room over — 351 + 62 + 351 is 764 of
 * 856. **So a desktop page's neighbours are above and below**, which is the fact that
 * rotates the whole grammar, and it is drawn here rather than asserted.
 */
export function KaffeDeskHours() {
	return (
		<div
			className="relative h-full w-full overflow-hidden rounded-lg border font-[Instrument_Sans]"
			style={{ borderColor: RULE, background: PAPER, color: INK }}
		>
			<div
				className="absolute flex items-center justify-between border-b"
				style={{
					left: 0,
					top: 0,
					width: DESK_W,
					height: BAR_H,
					paddingLeft: PAD,
					paddingRight: PAD,
					borderColor: RULE,
				}}
			>
				<span className="font-semibold text-[12px] tracking-tight leading-[14px]">kaffe</span>
				<span className="flex items-center gap-5">
					{LINKS.map((link) => (
						<span key={link} className="text-[9px] leading-[11px]" style={{ color: GREY }}>
							{link}
						</span>
					))}
				</span>
			</div>

			<h1
				className="absolute font-semibold text-[28px] tracking-tight leading-[34px]"
				style={{ left: PAD, top: 104, width: 500 }}
			>
				Öppettider
			</h1>

			<div className="absolute flex flex-col" style={{ left: PAD, top: 172, width: 500 }}>
				{[
					["Måndag", "07 till 18"],
					["Tisdag", "07 till 18"],
					["Onsdag", "07 till 18"],
					["Torsdag", "07 till 18"],
					["Fredag", "07 till 19"],
					["Lördag", "08 till 17"],
					["Söndag", "09 till 16"],
				].map(([day, hours]) => (
					<div
						key={day}
						className="flex items-center justify-between border-b py-[9px]"
						style={{ borderColor: RULE }}
					>
						<span className="text-[10px] leading-[12px]">{day}</span>
						<span className="text-[10px] leading-[12px]" style={{ color: GREY }}>
							{hours}
						</span>
					</div>
				))}
			</div>

			<div
				className="absolute overflow-hidden rounded-md"
				style={{ left: 640, top: 104, width: 187, height: 260, background: "#EFEFF1" }}
			/>

			<div
				className="absolute flex items-center border-t"
				style={{
					left: 0,
					top: FOOT_Y,
					width: DESK_W,
					height: DESK_H - FOOT_Y,
					paddingLeft: PAD,
					borderColor: RULE,
				}}
			>
				<span className="text-[8px] leading-[10px]" style={{ color: GREY }}>
					Torsgatan 11, Vasastan, Stockholm
				</span>
			</div>
		</div>
	);
}
