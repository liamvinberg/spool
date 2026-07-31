/**
 * Kaffe's front page, at 390 and at 1440, and the thirteen writes this turn lands
 * in it.
 *
 * Same rule as `shared/ui/kaffe-home.tsx` and every frame in this family: the real
 * page is carried into an authored box at 0.615, so a 390x844 phone is authored
 * 240x520 and a 1440x900 desktop is authored 886x554, and the canvas draws both at
 * `152 / 240 = 886 / 561`. One scale, two natural sizes, and the 39% in the header
 * stays honest for both. Palette is that file's unchanged — paper, one ink, one
 * grey, one rule.
 *
 * **Both renderings are one page and both are flow.** `agent-hand--ghost` argued
 * flow over absolute placement because a write pushing everything under it down the
 * page is the most expensive thing a write can do; that holds here and it is where
 * the two widths part company. The phone stacks one column, so a block that grows
 * moves everything under it. The wide page puts the words beside a 402-unit hero
 * that is taller than they are, so the growth writes are **absorbed** and move
 * nothing at all. Three of thirteen reflow at 390 and one at 1440, and that is not
 * a staging choice, it is what a second column does.
 *
 * ## What each write lands in, and why the list is finer than a block
 *
 * `LANDS` names an *element*, not a region. The direction resolves an edit to the
 * deepest element whose `data-spool-source` line falls inside the range the edit
 * rewrote (`runtime/jsx-dev-runtime.ts:30` stamps `path:line:col` on every one), so
 * a write that adds a nav inside the bar names the nav rather than the bar, and a
 * write that changes the hero's fill names the layer it added rather than the hero.
 * The mark is therefore the size of the change by construction, which is the
 * property `agent-hand--bloom` found and kept.
 *
 * **Write 8 names nothing, and it is the one case the stamp cannot answer.** The
 * prices come out of a hoisted `PRICES` constant and the edit rewrites that array;
 * there is no element on those lines, so the range resolves to the frame's root.
 * `--accrue` flagged this as the stamp's own miss and it is drawn rather than
 * staged around. The degrade is silence, decided on the layer.
 */

interface Step<T> {
	readonly at: number;
	readonly value: T;
}

/** every field starts somewhere, so the list is never empty and the first entry is the page as found */
type Steps<T> = readonly [Step<T>, ...Step<T>[]];

/** what a field is after `rev` writes: the last step at or below it */
function pick<T>(rev: number, steps: Steps<T>): T {
	let value = steps[0].value;
	for (const step of steps) if (rev >= step.at) value = step.value;
	return value;
}

/** an element an edit can name, stamped into both renderings as `data-lift` */
export type LiftId =
	| "head"
	| "lede"
	| "cta"
	| "hero"
	| "hero-photo"
	| "nav"
	| "list"
	| "foot-address"
	| "foot-hours";

/** how many writes this file draws, which is the count the capture's three runs add up to */
export const WRITES = 13;

/**
 * The element each of the thirteen writes lands in, in the order the capture makes
 * them, and `null` where the edit has no element on its line at all.
 *
 * Three of them move no geometry whatsoever — 1 swaps a headline for one of the
 * same measure, 4 turns the button from outline to solid ink, 5 fills the hero in —
 * and they are here because a rule built on rectangles is silent about all three.
 * `--bloom` measured that class at about a fifth of real writes and this staging
 * holds it at 3 of 13.
 */
export const LANDS: readonly (LiftId | null)[] = [
	/* the run of six: the page gets a voice, top to bottom */
	"head", // 1  the headline's words, same measure, same box
	"lede", // 2  the lede gains a line
	"cta", // 3  the button's label
	"cta", // 4  outline to solid ink, and nothing moves
	"hero-photo", // 5  the hero fills in, and nothing moves
	"nav", // 6  the nav arrives inside the bar
	/* the run of four: the bottom of the page, which until now was empty */
	"list", // 7  the menu arrives
	null, // 8  the prices, out of a hoisted constant: no element on the line
	"foot-address", // 9  the address lengthens
	"foot-hours", // 10 the hours arrive beside it
	/* the run of three: back to the top, tightening what the first run put there */
	"head", // 11 the headline gains a line
	"hero", // 12 the hero crops shorter, and the page under it comes up
	"cta", // 13 the button widens
];

const HEAD: Steps<string> = [
	{ at: 0, value: "Kaffe på Torsgatan" },
	{ at: 1, value: "Rostat en gata bort" },
	{ at: 11, value: "Vi rostar allt vi häller upp, en gata bort" },
];

const LEDE: Steps<string> = [
	{ at: 0, value: "Öppet varje dag." },
	{ at: 2, value: "Ljusrostade bönor, malda i baren. Vi öppnar sju varje morgon." },
];

const ACTION: Steps<string> = [
	{ at: 0, value: "Meny" },
	{ at: 3, value: "Beställ bönor" },
];

const FILL: Steps<boolean> = [
	{ at: 0, value: false },
	{ at: 4, value: true },
];

const PHOTO: Steps<boolean> = [
	{ at: 0, value: false },
	{ at: 5, value: true },
];

const NAV: Steps<boolean> = [
	{ at: 0, value: false },
	{ at: 6, value: true },
];

const LIST: Steps<boolean> = [
	{ at: 0, value: false },
	{ at: 7, value: true },
];

const PRICED: Steps<boolean> = [
	{ at: 0, value: false },
	{ at: 8, value: true },
];

const ADDRESS: Steps<string> = [
	{ at: 0, value: "Torsgatan 11" },
	{ at: 9, value: "Torsgatan 11, Vasastan, Stockholm" },
];

const HOURS: Steps<boolean> = [
	{ at: 0, value: false },
	{ at: 10, value: true },
];

/* the two fields whose numbers differ between the widths, because the pages do */
const HERO_H_WIDE: Steps<number> = [
	{ at: 0, value: 260 },
	{ at: 12, value: 210 },
];
const HERO_H_SMALL: Steps<number> = [
	{ at: 0, value: 148 },
	{ at: 12, value: 124 },
];
const ACTION_W_WIDE: Steps<number> = [
	{ at: 0, value: 100 },
	{ at: 13, value: 132 },
];
const ACTION_W_SMALL: Steps<number> = [
	{ at: 0, value: 92 },
	{ at: 13, value: 118 },
];

/** the hoisted constants write 8 rewrites, and the reason it names no element */
const ITEMS = ["Bryggkaffe", "Cortado", "Kanelbulle"] as const;
const PRICES = ["32", "46", "38"] as const;

const NAV_LINKS = ["Meny", "Om oss", "Hitta hit"] as const;

const INK = "#17171A";
const PAPER = "#FEFEFE";
const RULE = "#E4E4E7";
const GREY = "#86868B";

const PHOTO_TINT = "linear-gradient(158deg, #D8CFC2 0%, #B8A995 58%, #6E6153 100%)";
const PHOTO_SCRIM = "linear-gradient(180deg, rgba(23,23,26,0) 0%, rgba(23,23,26,0.28) 100%)";

/** the page at 1440, authored 886x554 */
export function KaffeWide({ rev }: { rev: number }) {
	const fill = pick(rev, FILL);
	return (
		<div
			className="flex h-full w-full flex-col overflow-hidden rounded-lg border font-[Instrument_Sans]"
			style={{ borderColor: RULE, background: PAPER, color: INK }}
		>
			<div
				className="flex h-10 shrink-0 items-center justify-between border-b px-10"
				style={{ borderColor: RULE }}
			>
				<span className="font-semibold text-[15px] tracking-tight leading-[18px]">kaffe</span>
				{pick(rev, NAV) ? (
					<nav data-lift="nav" className="flex items-center gap-5">
						{NAV_LINKS.map((link) => (
							<span key={link} className="text-[9.5px] leading-3">
								{link}
							</span>
						))}
						<span
							className="flex h-5 items-center rounded-[3px] border px-2.5 text-[9px] leading-3"
							style={{ borderColor: RULE }}
						>
							Beställ
						</span>
					</nav>
				) : null}
			</div>

			<div className="flex min-h-0 flex-1 flex-col px-10 pt-11">
				<div className="flex gap-8">
					<div className="flex w-[372px] shrink-0 flex-col items-start">
						<h1
							data-lift="head"
							className="text-balance font-semibold text-[30px] tracking-tight leading-[34px]"
						>
							{pick(rev, HEAD)}
						</h1>
						<p data-lift="lede" className="mt-3 w-[296px] text-[11px] leading-[17px]" style={{ color: GREY }}>
							{pick(rev, LEDE)}
						</p>
						<div
							data-lift="cta"
							className="mt-5 flex h-[34px] items-center justify-center rounded-[4px] text-[11px] leading-4"
							style={{
								width: pick(rev, ACTION_W_WIDE),
								background: fill ? INK : PAPER,
								color: fill ? PAPER : INK,
								border: fill ? "1px solid transparent" : `1px solid ${RULE}`,
							}}
						>
							{pick(rev, ACTION)}
						</div>
					</div>

					<div
						data-lift="hero"
						className="relative shrink-0 overflow-hidden rounded-lg"
						style={{ width: 402, height: pick(rev, HERO_H_WIDE), background: "#EFEFF1" }}
					>
						{pick(rev, PHOTO) ? (
							<span data-lift="hero-photo" className="absolute inset-0 block" style={{ background: PHOTO_TINT }}>
								<span
									className="absolute block rounded-full"
									style={{ left: 96, top: 54, width: 112, height: 112, background: "rgba(254,254,254,0.22)" }}
								/>
								<span
									className="absolute right-0 bottom-0 left-0 block"
									style={{ height: 74, background: PHOTO_SCRIM }}
								/>
							</span>
						) : null}
					</div>
				</div>

				{pick(rev, LIST) ? (
					<div
						data-lift="list"
						className="mt-9 grid grid-cols-3 gap-7 border-t pt-4"
						style={{ borderColor: RULE }}
					>
						{ITEMS.map((item, index) => (
							<div key={item} className="flex items-baseline justify-between">
								<span className="text-[11px] leading-4">{item}</span>
								<span className="text-[11px] leading-4" style={{ color: GREY }}>
									{pick(rev, PRICED) ? PRICES[index] : ""}
								</span>
							</div>
						))}
					</div>
				) : null}
			</div>

			<div
				className="flex h-10 shrink-0 items-center justify-between border-t px-10"
				style={{ borderColor: RULE }}
			>
				<span data-lift="foot-address" className="text-[9.5px] leading-3" style={{ color: GREY }}>
					{pick(rev, ADDRESS)}
				</span>
				{pick(rev, HOURS) ? (
					<span data-lift="foot-hours" className="text-[9.5px] leading-3" style={{ color: GREY }}>
						07 till 18
					</span>
				) : null}
			</div>
		</div>
	);
}

/** the same page at 390, authored 240x520 */
export function KaffeSmall({ rev }: { rev: number }) {
	const fill = pick(rev, FILL);
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
				{pick(rev, NAV) ? (
					<span data-lift="nav" className="flex flex-col gap-[3px]">
						<span className="block h-px w-[11px]" style={{ background: INK }} />
						<span className="block h-px w-[11px]" style={{ background: INK }} />
					</span>
				) : null}
			</div>

			<div className="flex min-h-0 flex-1 flex-col items-start px-3 pt-4">
				<h1
					data-lift="head"
					className="w-[216px] text-balance font-semibold text-[15px] tracking-tight leading-[18px]"
				>
					{pick(rev, HEAD)}
				</h1>
				<p
					data-lift="lede"
					className="mt-[7px] w-[216px] text-[8.5px] leading-[13px]"
					style={{ color: GREY }}
				>
					{pick(rev, LEDE)}
				</p>
				<div
					data-lift="cta"
					className="mt-3 flex h-[26px] items-center justify-center rounded-[3px] text-[8.5px] leading-3"
					style={{
						width: pick(rev, ACTION_W_SMALL),
						background: fill ? INK : PAPER,
						color: fill ? PAPER : INK,
						border: fill ? "1px solid transparent" : `1px solid ${RULE}`,
					}}
				>
					{pick(rev, ACTION)}
				</div>

				<div
					data-lift="hero"
					className="relative mt-4 w-[216px] shrink-0 overflow-hidden rounded-md"
					style={{ height: pick(rev, HERO_H_SMALL), background: "#EFEFF1" }}
				>
					{pick(rev, PHOTO) ? (
						<span data-lift="hero-photo" className="absolute inset-0 block" style={{ background: PHOTO_TINT }}>
							<span
								className="absolute block rounded-full"
								style={{ left: 52, top: 30, width: 64, height: 64, background: "rgba(254,254,254,0.22)" }}
							/>
							<span
								className="absolute right-0 bottom-0 left-0 block"
								style={{ height: 42, background: PHOTO_SCRIM }}
							/>
						</span>
					) : null}
				</div>

				{pick(rev, LIST) ? (
					<div
						data-lift="list"
						className="mt-4 flex w-[216px] flex-col gap-[7px] border-t pt-3"
						style={{ borderColor: RULE }}
					>
						{ITEMS.map((item, index) => (
							<div key={item} className="flex h-3 items-baseline justify-between">
								<span className="text-[8.5px] leading-3">{item}</span>
								<span className="text-[8.5px] leading-3" style={{ color: GREY }}>
									{pick(rev, PRICED) ? PRICES[index] : ""}
								</span>
							</div>
						))}
					</div>
				) : null}
			</div>

			<div
				className="flex h-[30px] shrink-0 items-center justify-between border-t px-3"
				style={{ borderColor: RULE }}
			>
				<span data-lift="foot-address" className="text-[8px] leading-3" style={{ color: GREY }}>
					{pick(rev, ADDRESS)}
				</span>
				{pick(rev, HOURS) ? (
					<span data-lift="foot-hours" className="text-[8px] leading-3" style={{ color: GREY }}>
						07 till 18
					</span>
				) : null}
			</div>
		</div>
	);
}
