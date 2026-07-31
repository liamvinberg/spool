/**
 * `home`, and the thirteen source writes this turn lands in it.
 *
 * `shared/ui/kaffe-home.tsx` draws one state of this page; this draws fourteen,
 * because the claim this direction is testing is that the frame redrawing is the
 * whole effect, and a frame that redraws into the same pixels tests nothing. Same
 * page, same palette, same rule as every other kaffe screen here: the real site at
 * 390x844 carried into the 240x520 box the canvas draws every frame in, every value
 * the real one times 0.615, so the 39% in the header stays honest.
 *
 * Thirteen, not fourteen. The capture writes `home` fifteen times if you count the
 * way the transcript counts, and the first of them is `frames/home/frame.json`.
 * `events.ts:174` drops that one on the floor — `if (parts.length === 3 &&
 * parts[2]?.startsWith("frame.json") === true) return undefined` — so a geometry
 * write raises no change event, reloads no document, and stales no picture. It
 * moves the rectangle and leaves the design alone. So the page here is driven by
 * the three `edit` runs only: six, four, then three.
 *
 * The last three are small on purpose and the frame is the honest answer to whether
 * that matters. Writes eleven, twelve and thirteen change a button's word, a
 * footer's address and the last sentence of a lede, all of it 8 to 8.5px type in
 * the authored box, which is 5.4px drawn. Nothing else in the run moves a box, a
 * fill or a rule. If a change has to be seen to count, that run is where it fails.
 */

interface Step<T> {
	readonly at: number;
	readonly value: T;
}

/** every field starts somewhere, so the list is never empty and the first entry is the page as it stood */
type Steps<T> = readonly [Step<T>, ...Step<T>[]];

/** what a field is after `rev` writes: the last step at or below it */
function pick<T>(rev: number, steps: Steps<T>): T {
	let value = steps[0].value;
	for (const step of steps) if (rev >= step.at) value = step.value;
	return value;
}

/* ---------- the run of six ---------- */

const HEAD: Steps<string> = [
	{ at: 0, value: "Kaffe på Torsgatan" },
	{ at: 1, value: "Bryggt på Torsgatan sedan 2016" },
];
const HEAD_SIZE: Steps<{ readonly size: number; readonly line: number }> = [
	{ at: 0, value: { size: 15, line: 18 } },
	{ at: 2, value: { size: 17, line: 20 } },
];
const LEDE: Steps<{ readonly text: string; readonly width: number }> = [
	{ at: 0, value: { text: "Öppet varje dag.", width: 216 } },
	{ at: 3, value: { text: "Ljusrostade bönor, malda i baren. Öppet varje dag från sju.", width: 168 } },
	{ at: 13, value: { text: "Ljusrostade bönor, malda i baren. Öppet från sju.", width: 168 } },
];
const ACTION: Steps<string> = [
	{ at: 0, value: "Meny" },
	{ at: 4, value: "Beställ nu" },
	{ at: 11, value: "Köp bönor" },
];
const FILLED: Steps<boolean> = [
	{ at: 0, value: false },
	{ at: 5, value: true },
];
const HOURS: Steps<readonly { readonly day: string; readonly hours: string }[]> = [
	{
		at: 0,
		value: [
			{ day: "Mån till fre", hours: "" },
			{ day: "Lördag", hours: "" },
			{ day: "Söndag", hours: "" },
		],
	},
	{
		at: 6,
		value: [
			{ day: "Mån till fre", hours: "07 till 18" },
			{ day: "Lördag", hours: "08 till 17" },
			{ day: "Söndag", hours: "09 till 16" },
		],
	},
	{
		at: 9,
		value: [
			{ day: "Mån till fre", hours: "07 till 18" },
			{ day: "Lördag", hours: "08 till 17" },
			{ day: "Söndag", hours: "09 till 16" },
			{ day: "Röda dagar", hours: "Stängt" },
		],
	},
];

/* ---------- the run of four ---------- */

const HERO: Steps<"flat" | "photo"> = [
	{ at: 0, value: "flat" },
	{ at: 7, value: "photo" },
];
const HERO_H: Steps<number> = [
	{ at: 0, value: 148 },
	{ at: 8, value: 124 },
];
const BAR_LINES: Steps<boolean> = [
	{ at: 0, value: false },
	{ at: 10, value: true },
];

/* ---------- the run of three ---------- */

const FOOT: Steps<string> = [
	{ at: 0, value: "Torsgatan 11" },
	{ at: 12, value: "Torsgatan 11, Stockholm" },
];

const INK = "#17171A";
const PAPER = "#FEFEFE";
const RULE = "#E4E4E7";
const GREY = "#86868B";

export function KaffeHomeLand({ rev }: { rev: number }) {
	const head = pick(rev, HEAD_SIZE);
	const lede = pick(rev, LEDE);
	const filled = pick(rev, FILLED);
	const hero = pick(rev, HERO);
	const hours = pick(rev, HOURS);
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
				{pick(rev, BAR_LINES) ? (
					<span className="flex flex-col gap-[3px]">
						<span className="block h-px w-[11px]" style={{ background: INK }} />
						<span className="block h-px w-[11px]" style={{ background: INK }} />
					</span>
				) : null}
			</div>
			<div className="flex min-h-0 flex-1 flex-col px-3 pt-4">
				<h1
					className="text-balance font-semibold tracking-tight"
					style={{ fontSize: head.size, lineHeight: `${head.line}px` }}
				>
					{pick(rev, HEAD)}
				</h1>
				<p
					className="mt-[7px] text-balance text-[8.5px] leading-[13px]"
					style={{ maxWidth: lede.width, color: GREY }}
				>
					{lede.text}
				</p>
				<div
					className="mt-3 flex h-[26px] w-[92px] shrink-0 items-center justify-center rounded-[3px] text-[8.5px] leading-3"
					style={{
						background: filled ? INK : PAPER,
						color: filled ? PAPER : INK,
						border: filled ? "1px solid transparent" : `1px solid ${RULE}`,
					}}
				>
					{pick(rev, ACTION)}
				</div>
				<div
					className="relative mt-4 shrink-0 overflow-hidden rounded-md"
					style={{ height: pick(rev, HERO_H), background: hero === "flat" ? "#EFEFF1" : "#E9E5DE" }}
				>
					{hero === "photo" ? (
						<>
							<span
								className="absolute inset-0 block"
								style={{ background: "linear-gradient(158deg, #D8CFC2 0%, #B8A995 58%, #6E6153 100%)" }}
							/>
							<span
								className="absolute block rounded-full"
								style={{ left: 44, top: 28, width: 68, height: 68, background: "rgba(254,254,254,0.22)" }}
							/>
							<span
								className="absolute right-0 bottom-0 left-0 block"
								style={{ height: 42, background: "linear-gradient(180deg, rgba(23,23,26,0) 0%, rgba(23,23,26,0.28) 100%)" }}
							/>
						</>
					) : null}
				</div>
				<div className="mt-4 flex flex-col gap-[7px]">
					{hours.map((row) => (
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
