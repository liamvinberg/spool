/**
 * `home`, and the thirteen writes this turn lands in it.
 *
 * `shared/ui/kaffe-home.tsx` draws one state of this page; this draws fourteen,
 * because a direction about seeing a change arrive cannot be built on a frame that
 * never changes. Same page, same palette, same rule: kaffe's own site at 390x844
 * carried into the 240x520 box the canvas draws every frame in, every value the
 * real one times 0.615, so the 39% in the header stays honest.
 *
 * Thirteen is the capture's own count of `Edit` calls on `frames/home/frame.tsx` —
 * runs of six, four and three, with a shot and a look between them. The fourteenth
 * write in `claude-edits.json` is the `frame.json` the turn opens with, and it is
 * not in this list: geometry moves the rectangle and leaves the page alone.
 *
 * **This page is laid out in flow, on purpose.** `agent-hand--inside` placed every
 * block absolutely so a mark could name a region that was true by construction, and
 * that is exactly the assumption the product cannot make. Here a headline that gains
 * a line pushes the six blocks under it down, which is the case the box diff has to
 * survive: what moved is nearly everything, and what changed is one block.
 *
 * **One write moves one field.** That is what an `Edit` is, and it is what makes the
 * arrivals countable — thirteen writes, thirteen readings, including the ones the
 * boxes have nothing to say about.
 */

const INK = "#17171A";
const PAPER = "#FEFEFE";
const RULE = "#E4E4E7";
const GREY = "#86868B";

interface Step<T> {
	readonly at: number;
	readonly value: T;
}

/** every field starts somewhere, so the list is never empty and the first entry is the page as written */
type Steps<T> = readonly [Step<T>, ...Step<T>[]];

/** what a field is after `rev` writes: the last step at or below it */
function pick<T>(rev: number, steps: Steps<T>): T {
	let value = steps[0].value;
	for (const step of steps) if (rev >= step.at) value = step.value;
	return value;
}

const HEAD: Steps<string> = [
	{ at: 0, value: "Kaffe på Torsgatan" },
	{ at: 1, value: "Rostat en gata bort, bryggt här" },
];

const LEDE: Steps<string> = [
	{ at: 0, value: "Öppet varje dag." },
	{ at: 2, value: "Vi rostar allt vi häller upp, en gata bort. Öppet varje dag från sju." },
];

/** write 8 narrows the measure; a block's own width is the one box change nothing else explains */
const LEDE_W: Steps<number> = [
	{ at: 0, value: 216 },
	{ at: 8, value: 168 },
];

const ACTION: Steps<string> = [
	{ at: 0, value: "Meny" },
	{ at: 3, value: "Beställ bönor" },
];

/** write 4 fills the button in. Nothing about it has a size, which is the point of it being here */
const ACTION_DARK: Steps<boolean> = [
	{ at: 0, value: false },
	{ at: 4, value: true },
];

const ACTION_W: Steps<number | null> = [
	{ at: 0, value: null },
	{ at: 12, value: 118 },
];

const HERO_H: Steps<number> = [
	{ at: 0, value: 96 },
	{ at: 5, value: 148 },
];

const HERO_PHOTO: Steps<boolean> = [
	{ at: 0, value: false },
	{ at: 9, value: true },
];

const DAYS: Steps<readonly string[]> = [
	{ at: 0, value: ["Mån till fre", "Lördag", "Söndag"] },
	{ at: 6, value: ["Mån till fre", "Lördag", "Söndag", "Röda dagar"] },
];

const HOURS: Steps<readonly string[]> = [
	{ at: 0, value: ["", "", "", ""] },
	{ at: 10, value: ["07 till 18", "08 till 17", "09 till 16", "Stängt"] },
];

const FOOT: Steps<string> = [
	{ at: 0, value: "Torsgatan 11" },
	{ at: 7, value: "Torsgatan 11, Vasastan, Stockholm" },
];

const BAR_RULES: Steps<boolean> = [
	{ at: 0, value: false },
	{ at: 11, value: true },
];

const NOTE: Steps<string | null> = [
	{ at: 0, value: null },
	{ at: 13, value: "Bönor säljs över disk så länge lagret räcker." },
];

export const WRITES = 13;

export function KaffeHomeBloom({ rev }: { rev: number }) {
	const days = pick(rev, DAYS);
	const hours = pick(rev, HOURS);
	const actionWidth = pick(rev, ACTION_W);
	const dark = pick(rev, ACTION_DARK);
	const note = pick(rev, NOTE);
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
				{pick(rev, BAR_RULES) ? (
					<span className="flex flex-col gap-[3px]">
						<span className="block h-px w-[11px]" style={{ background: INK }} />
						<span className="block h-px w-[11px]" style={{ background: INK }} />
					</span>
				) : null}
			</div>

			<div className="flex min-h-0 flex-1 flex-col px-3 pt-4">
				<h1 className="text-balance font-semibold text-[17px] tracking-tight leading-[20px]">{pick(rev, HEAD)}</h1>

				<p
					className="mt-[7px] text-balance text-[8.5px] leading-[13px]"
					style={{ width: pick(rev, LEDE_W), color: GREY }}
				>
					{pick(rev, LEDE)}
				</p>

				<div
					className="mt-3 flex h-[26px] shrink-0 items-center justify-center rounded-[3px] px-3 text-[8.5px] leading-3"
					style={{
						width: actionWidth ?? "fit-content",
						background: dark ? INK : PAPER,
						color: dark ? PAPER : INK,
						border: dark ? "1px solid transparent" : `1px solid ${RULE}`,
					}}
				>
					{pick(rev, ACTION)}
				</div>

				<div
					className="relative mt-4 shrink-0 overflow-hidden rounded-md"
					style={{ height: pick(rev, HERO_H), background: "#EFEFF1" }}
				>
					{pick(rev, HERO_PHOTO) ? (
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
								style={{ height: 42, background: "linear-gradient(180deg, rgba(23,23,26,0) 0%, rgba(23,23,26,0.28) 100%)" }}
							/>
						</>
					) : null}
				</div>

				<div className="mt-4 flex flex-col gap-[7px]">
					{days.map((day, index) => (
						<div key={day} className="flex items-baseline justify-between">
							<span className="text-[8.5px] leading-3">{day}</span>
							{hours[index] === undefined || hours[index] === "" ? null : (
								<span className="text-[8.5px] leading-3" style={{ color: GREY }}>
									{hours[index]}
								</span>
							)}
						</div>
					))}
				</div>

				{note === null ? null : (
					<p className="mt-3 text-balance text-[8.5px] leading-[13px]" style={{ width: 168, color: GREY }}>
						{note}
					</p>
				)}
			</div>

			<div className="flex h-[30px] shrink-0 items-center border-t px-3" style={{ borderColor: RULE }}>
				<span className="text-[8px] leading-3" style={{ color: GREY }}>
					{pick(rev, FOOT)}
				</span>
			</div>
		</div>
	);
}
