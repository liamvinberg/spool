import { cn } from "../../../shared/lib/utils";

/**
 * `home`, and the thirteen writes this turn lands in it.
 *
 * Same page as `shared/ui/kaffe-home.tsx` and the same rule: kaffe's own site at
 * 390x844 carried into the 240x520 box the canvas draws every frame in, every
 * value the real one times 0.615, so the 39% in the header stays honest. Palette
 * is that file's unchanged — paper, one ink, one grey, one surface.
 *
 * Thirteen because that is how many `Edit` calls `claude-edits.json` makes to
 * `frames/home/frame.tsx`, in runs of six, four and three. The fourteenth write in
 * that capture is the `frame.json` the turn opens with, and it is deliberately not
 * here: geometry moves the rectangle on the canvas and leaves the design alone.
 * This direction keeps that write out too, because a ghost of a frame that did not
 * change is nothing at all. What it costs here is the parent's sharpest moment: the
 * picture only moves on a photograph, so the ghost is silent for the whole first 14.5
 * seconds and the geometry write is no longer the reason it is silent. The wall still
 * carries `write` for it, and the count still says one.
 *
 * The revisions this file steps through are handed in on the photograph's clock rather
 * than the wire's — `rev` arrives as 0, 6, 10 and 13, not as one through thirteen — so
 * every ghost drawn here is a whole run's worth of change at once.
 *
 * **The layout is flow rather than absolute, and that is the design decision this
 * file exists to make.** `agent-hand--inside` placed every block absolutely so a
 * mark could name a region that was true by construction. A ghost needs the
 * opposite: it has to show a write pushing the blocks under it down the page,
 * because that is the most expensive thing a write can do and the thing a still
 * cannot tell you. Four of the thirteen move what is below them — the lede gaining
 * a line, the headline going up a size, a note appearing under the button, the hero
 * losing 24px — and the other nine change in place. Both cases were wanted, so both
 * are here.
 */

interface Step<T> {
	readonly at: number;
	readonly value: T;
}

/** every field starts somewhere, so the list is never empty and the first entry is the frame as found */
type Steps<T> = readonly [Step<T>, ...Step<T>[]];

/** what a field is after `rev` writes: the last step at or below it */
function pick<T>(rev: number, steps: Steps<T>): T {
	let value = steps[0].value;
	for (const step of steps) if (rev >= step.at) value = step.value;
	return value;
}

const HEAD: Steps<string> = [
	{ at: 0, value: "Kaffe på Torsgatan" },
	{ at: 1, value: "Rostat en gata bort" },
];

/** write 8 takes the headline up a size, which is what puts it on two lines */
const HEAD_BIG: Steps<boolean> = [
	{ at: 0, value: false },
	{ at: 8, value: true },
];

/** write 2 takes it from one line to two, which moves the six blocks under it */
const LEDE: Steps<string> = [
	{ at: 0, value: "Öppet varje dag." },
	{ at: 2, value: "Ljusrostade bönor, malda i baren. Öppet varje dag från sju." },
];

/**
 * Write 9 adds a line under the button that was never there, so the hero and the
 * hours both move down.
 *
 * It is here because narrowing the measure, which was the first thing tried, is not
 * a reflow at all: `text-balance` had already broken a 59-character lede into two
 * even lines well inside a 216px column, so taking the column to 148 changed nothing
 * and the ghost was correctly invisible. Measured rather than reasoned about — the
 * two renders were identical.
 */
const NOTE: Steps<string | null> = [
	{ at: 0, value: null },
	{ at: 9, value: "Bönor säljs över disk så länge lagret räcker." },
];

const ACTION: Steps<string> = [
	{ at: 0, value: "Meny" },
	{ at: 3, value: "Beställ bönor" },
];

const ACTION_FILL: Steps<boolean> = [
	{ at: 0, value: false },
	{ at: 4, value: true },
];

const ACTION_W: Steps<number> = [
	{ at: 0, value: 92 },
	{ at: 13, value: 118 },
];

const HERO_TONE: Steps<"flat" | "warm" | "photo"> = [
	{ at: 0, value: "flat" },
	{ at: 5, value: "warm" },
	{ at: 10, value: "photo" },
];

/** the one write that moves the page upward rather than down */
const HERO_H: Steps<number> = [
	{ at: 0, value: 148 },
	{ at: 12, value: 124 },
];

const ROWS: Steps<readonly { readonly day: string; readonly hours: string }[]> = [
	{
		at: 0,
		value: [
			{ day: "Vardagar", hours: "" },
			{ day: "Lördag", hours: "" },
			{ day: "Söndag", hours: "" },
		],
	},
	{
		at: 6,
		value: [
			{ day: "Mån till fre", hours: "" },
			{ day: "Lördag", hours: "" },
			{ day: "Söndag", hours: "" },
		],
	},
	{
		at: 11,
		value: [
			{ day: "Mån till fre", hours: "07 till 18" },
			{ day: "Lördag", hours: "08 till 17" },
			{ day: "Söndag", hours: "09 till 16" },
		],
	},
];

const FOOT: Steps<string> = [
	{ at: 0, value: "Torsgatan 11" },
	{ at: 7, value: "Torsgatan 11, Vasastan, Stockholm" },
];

/** how many writes this file draws, which is the count the capture's runs add up to */
export const WRITES = 13;

const INK = "#17171A";
const PAPER = "#FEFEFE";
const RULE = "#E4E4E7";
const GREY = "#86868B";

export function KaffeHome({ rev }: { rev: number }) {
	const rows = pick(rev, ROWS);
	const tone = pick(rev, HERO_TONE);
	const fill = pick(rev, ACTION_FILL);
	return (
		<div
			className="flex h-full w-full flex-col overflow-hidden rounded-lg border font-[Instrument_Sans]"
			style={{ borderColor: RULE, background: PAPER, color: INK }}
		>
			<div
				className="flex h-[26px] shrink-0 items-center justify-between border-b px-3"
				style={{ borderColor: RULE }}
			>
				<span className="font-semibold text-[10px] tracking-tight leading-3">kaffe</span>
				<span className="flex flex-col gap-[3px]">
					<span className="block h-px w-[11px]" style={{ background: INK }} />
					<span className="block h-px w-[11px]" style={{ background: INK }} />
				</span>
			</div>

			<div className="flex min-h-0 flex-1 flex-col px-3 pt-4">
				<h1
					className={cn(
						"text-balance font-semibold tracking-tight",
						pick(rev, HEAD_BIG) ? "text-[17px] leading-[20px]" : "text-[15px] leading-[18px]",
					)}
				>
					{pick(rev, HEAD)}
				</h1>

				<p
					className="mt-[7px] max-w-[216px] text-balance text-[8.5px] leading-[13px]"
					style={{ color: GREY }}
				>
					{pick(rev, LEDE)}
				</p>

				<div
					className="mt-3 flex h-[26px] shrink-0 items-center justify-center rounded-[3px] text-[8.5px] leading-3"
					style={{
						width: pick(rev, ACTION_W),
						background: fill ? INK : PAPER,
						color: fill ? PAPER : INK,
						border: fill ? "1px solid transparent" : `1px solid ${RULE}`,
					}}
				>
					{pick(rev, ACTION)}
				</div>

				{pick(rev, NOTE) === null ? null : (
					<p className="mt-[9px] max-w-[192px] text-balance text-[7.5px] leading-[11px]" style={{ color: GREY }}>
						{pick(rev, NOTE)}
					</p>
				)}

				<div
					className="relative mt-4 shrink-0 overflow-hidden rounded-md"
					style={{ height: pick(rev, HERO_H), background: tone === "flat" ? "#EFEFF1" : "#E9E5DE" }}
				>
					{tone === "photo" ? (
						<>
							<span
								className="absolute inset-0 block"
								style={{ background: "linear-gradient(158deg, #D8CFC2 0%, #B8A995 58%, #6E6153 100%)" }}
							/>
							<span
								className="absolute block rounded-full"
								style={{ left: 44, top: 30, width: 68, height: 68, background: "rgba(254,254,254,0.22)" }}
							/>
							<span
								className="absolute right-0 bottom-0 left-0 block"
								style={{ height: 44, background: "linear-gradient(180deg, rgba(23,23,26,0) 0%, rgba(23,23,26,0.28) 100%)" }}
							/>
						</>
					) : null}
				</div>

				<div className="mt-4 flex flex-col gap-[7px]">
					{rows.map((row) => (
						<div key={row.day} className="flex items-baseline justify-between">
							<span className="text-[8.5px] leading-3">{row.day}</span>
							<span className="text-[8.5px] leading-3" style={{ color: GREY }}>
								{row.hours}
							</span>
						</div>
					))}
				</div>
			</div>

			<div className="flex h-[30px] shrink-0 items-center border-t px-3" style={{ borderColor: RULE }}>
				<span className="text-[8px] leading-3" style={{ color: GREY }}>
					{pick(rev, FOOT)}
				</span>
			</div>
		</div>
	);
}
