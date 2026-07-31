/**
 * `home`, and the fourteen writes this turn lands in it.
 *
 * `shared/ui/kaffe-home.tsx` draws one state of this page and this draws all of
 * them, because the one posture this direction puts on the frame's own body is a
 * write, and a write that changes nothing visible is a claim the frame cannot
 * back up. Same page, same palette, same rule: kaffe's own site at 390x844
 * carried into the 240x520 box the canvas draws every frame in, every value the
 * real one times 0.615, so the 39% in the header stays honest.
 *
 * Fourteen is the capture's own number: `write` on a run of one, then runs of six,
 * four and three, all of them on `frames/home/frame.tsx`. Not every one of them
 * moves something you can see at 152px, and that is the truth about editing rather
 * than a gap here. The redraw fires on all fourteen, because spool re-renders on
 * source change whether or not the diff was visible.
 */

interface Step<T> {
	readonly at: number;
	readonly value: T;
}

/** every field starts somewhere, so the list is never empty and the first entry is the frame as written */
type Steps<T> = readonly [Step<T>, ...Step<T>[]];

/** what a field is after `rev` writes: the last step at or below it */
function pick<T>(rev: number, steps: Steps<T>): T {
	let value = steps[0].value;
	for (const step of steps) if (rev >= step.at) value = step.value;
	return value;
}

const HEADLINE: Steps<string> = [
	{ at: 0, value: "Bryggt på Torsgatan sedan 2016" },
	{ at: 2, value: "Rostat en gata bort" },
	{ at: 9, value: "Rostat en gata bort, bryggt här" },
];

const LEDE: Steps<string> = [
	{ at: 0, value: "Ljusrostade bönor, malda i baren. Öppet varje dag från sju." },
	{ at: 3, value: "Vi rostar allt vi häller upp. Öppet varje dag från sju." },
	{ at: 13, value: "Vi rostar allt vi häller upp, en gata bort. Öppet från sju." },
];

const ACTION: Steps<string> = [
	{ at: 0, value: "Beställ nu" },
	{ at: 4, value: "Beställ bönor" },
	{ at: 12, value: "Köp bönor" },
];

const HERO: Steps<number> = [
	{ at: 0, value: 148 },
	{ at: 6, value: 124 },
	{ at: 11, value: 136 },
];

const HOURS: Steps<readonly { readonly day: string; readonly hours: string }[]> = [
	{
		at: 0,
		value: [
			{ day: "Mån till fre", hours: "07 till 18" },
			{ day: "Lördag", hours: "08 till 17" },
			{ day: "Söndag", hours: "09 till 16" },
		],
	},
	{
		at: 7,
		value: [
			{ day: "Mån till fre", hours: "07 till 18" },
			{ day: "Lördag", hours: "08 till 17" },
			{ day: "Söndag", hours: "09 till 16" },
			{ day: "Röda dagar", hours: "Stängt" },
		],
	},
];

const FOOT: Steps<string> = [
	{ at: 0, value: "Torsgatan 11, Stockholm" },
	{ at: 10, value: "Torsgatan 11, Vasastan, Stockholm" },
];

export function KaffeHomeHeld({ rev }: { rev: number }) {
	const hours = pick(rev, HOURS);
	return (
		<div className="flex h-full w-full flex-col overflow-hidden rounded-lg border border-[#E4E4E7] bg-[#FEFEFE] font-[Instrument_Sans] text-[#17171A]">
			<div className="flex h-[26px] shrink-0 items-center justify-between border-[#E4E4E7] border-b px-3">
				<span className="font-semibold text-[10px] tracking-tight leading-3">kaffe</span>
				<span className="flex flex-col gap-[3px]">
					<span className="block h-px w-[11px] bg-[#17171A]" />
					<span className="block h-px w-[11px] bg-[#17171A]" />
				</span>
			</div>
			<div className="flex min-h-0 flex-1 flex-col px-3 pt-4">
				<h1 className="text-balance font-semibold text-[17px] tracking-tight leading-[20px]">
					{pick(rev, HEADLINE)}
				</h1>
				<p className="mt-[7px] max-w-[168px] text-balance text-[8.5px] text-[#86868B] leading-[13px]">
					{pick(rev, LEDE)}
				</p>
				<div className="mt-3 flex h-[26px] w-[92px] shrink-0 items-center justify-center rounded-[3px] bg-[#17171A] text-[8.5px] text-[#FEFEFE] leading-3">
					{pick(rev, ACTION)}
				</div>
				<div className="mt-4 shrink-0 rounded-md bg-[#EFEFF1]" style={{ height: pick(rev, HERO) }} />
				<div className="mt-4 flex flex-col gap-[7px]">
					{hours.map((row) => (
						<div key={row.day} className="flex items-baseline justify-between">
							<span className="text-[8.5px] leading-3">{row.day}</span>
							<span className="text-[8.5px] text-[#86868B] leading-3">{row.hours}</span>
						</div>
					))}
				</div>
			</div>
			<div className="flex h-[30px] shrink-0 items-center border-[#E4E4E7] border-t px-3">
				<span className="text-[8px] text-[#86868B] leading-3">{pick(rev, FOOT)}</span>
			</div>
		</div>
	);
}
