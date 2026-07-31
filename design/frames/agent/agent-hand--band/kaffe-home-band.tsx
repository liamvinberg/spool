import { useLayoutEffect, useRef } from "react";
import { cn } from "../../../shared/lib/utils";

/**
 * `home`, on its way to being `shared/ui/kaffe-home.tsx`: one content object,
 * thirteen writes, and a `rev` saying how many of them have landed.
 *
 * The band on the wall has to point at something true, so the frame has to really
 * change. The count comes off the capture's own run children — the same number the
 * rail prints as `edit home ×6` — and every write moves one block, which is what
 * spool does to a live frame when its source changes on disk.
 *
 * **It is built in ordinary flow layout, and that is the argument.**
 * `agent-hand--inside` had to author its `home` as seven absolutely placed boxes so
 * a rectangle drawn over the design could be true by construction, which is not how
 * anybody writes a frame. A band on the wall needs no such promise: it claims a
 * third of the frame's height, and a third survives a reflow. The proof is the
 * eighth write, which turns the headline into two lines and pushes every block under
 * it down twenty pixels. A rectangle drawn before that write is wrong after it. A
 * third is not.
 *
 * So this file measures rather than declares. Each block carries a `data-region`,
 * and when a write lands the block it touched is measured against the frame's own
 * box and reported up as a fraction of the frame's height. That is deliberately the
 * shape the product would need: the rendered position of the thing that changed,
 * read after the change, at whatever the layout actually did. Here it crosses a
 * `useLayoutEffect`; out there it crosses a postMessage.
 *
 * Palette and scale are `kaffe-home.tsx`'s unchanged: paper, one ink, one grey, one
 * surface, every value the real 390x844 one times 0.615.
 */

/** where a block sits, as a fraction of the frame's own height, measured after the write */
export interface Span {
	readonly from: number;
	readonly to: number;
}

type RegionId = "bar" | "head" | "sub" | "cta" | "hero" | "hours" | "foot";

interface Home {
	readonly head: string;
	readonly headBig: boolean;
	readonly sub: string;
	readonly subNarrow: boolean;
	readonly cta: string;
	readonly ctaDark: boolean;
	readonly ctaWide: boolean;
	readonly hero: "flat" | "tint" | "photo";
	readonly days: readonly string[];
	readonly hours: readonly string[];
	readonly foot: string;
	readonly barLines: boolean;
}

/** the frame before the turn touches it: placed, sized, and saying almost nothing */
const START: Home = {
	head: "Kaffe på Torsgatan",
	headBig: false,
	sub: "Öppet varje dag.",
	subNarrow: false,
	cta: "Meny",
	ctaDark: false,
	ctaWide: false,
	hero: "flat",
	days: ["Vardagar", "Lördag", "Söndag"],
	hours: ["", "", ""],
	foot: "Torsgatan 11",
	barLines: false,
};

/**
 * The thirteen writes, in the order the capture makes them, each naming the block it
 * lands in.
 *
 * Thirteen because that is how many `Edit` calls `claude-edits.json` makes to
 * `frames/home/frame.tsx`, in runs of six, four and three. The fourteenth write in
 * that capture is the `frame.json` the turn opens with, and it is not here:
 * geometry moves the rectangle and leaves the design alone.
 *
 * The order is the capture's, and where it lands is this file's. Read down the
 * regions and you get the run shape the band draws: four in a row at the top, then
 * the hero, then the hours — one cluster and two moves, in five and a half seconds.
 */
export const EDITS: readonly { readonly region: RegionId; readonly apply: (home: Home) => Home }[] = [
	{ region: "head", apply: (home) => ({ ...home, head: "Bryggt på Torsgatan sedan 2016" }) },
	{ region: "sub", apply: (home) => ({ ...home, sub: "Ljusrostade bönor, malda i baren. Öppet varje dag från sju." }) },
	{ region: "cta", apply: (home) => ({ ...home, cta: "Beställ nu" }) },
	{ region: "cta", apply: (home) => ({ ...home, ctaDark: true }) },
	{ region: "hero", apply: (home) => ({ ...home, hero: "tint" }) },
	{ region: "hours", apply: (home) => ({ ...home, days: ["Mån till fre", "Lördag", "Söndag"] }) },
	{ region: "foot", apply: (home) => ({ ...home, foot: "Torsgatan 11, Stockholm" }) },
	{ region: "head", apply: (home) => ({ ...home, headBig: true }) },
	{ region: "sub", apply: (home) => ({ ...home, subNarrow: true }) },
	{ region: "hero", apply: (home) => ({ ...home, hero: "photo" }) },
	{ region: "hours", apply: (home) => ({ ...home, hours: ["07–18", "08–17", "09–16"] }) },
	{ region: "bar", apply: (home) => ({ ...home, barLines: true }) },
	{ region: "cta", apply: (home) => ({ ...home, ctaWide: true }) },
];

function homeAt(rev: number): Home {
	return EDITS.slice(0, Math.max(0, Math.min(EDITS.length, rev))).reduce((home, edit) => edit.apply(home), START);
}

const INK = "#17171A";
const PAPER = "#FEFEFE";
const RULE = "#E4E4E7";
const GREY = "#86868B";

export function KaffeHomeBand({ rev, onLand }: { rev: number; onLand: (rev: number, span: Span) => void }) {
	const home = homeAt(rev);
	const box = useRef<HTMLDivElement | null>(null);

	/*
	 * Where the write landed, measured rather than declared.
	 *
	 * It runs before paint, so the band never draws one frame at the old place. The
	 * fraction is of the frame's own height, which makes it scale-free: this box is
	 * authored 240x520 and drawn 152 wide, and neither number appears here.
	 */
	useLayoutEffect(() => {
		const edit = EDITS[rev - 1];
		const root = box.current;
		if (edit === undefined || root === null) return;
		const node = root.querySelector(`[data-region="${edit.region}"]`);
		if (node === null) return;
		const outer = root.getBoundingClientRect();
		if (outer.height === 0) return;
		const inner = node.getBoundingClientRect();
		onLand(rev, { from: (inner.top - outer.top) / outer.height, to: (inner.bottom - outer.top) / outer.height });
	}, [rev, onLand]);

	return (
		<div
			ref={box}
			className="flex h-full w-full flex-col overflow-hidden rounded-lg border font-[Instrument_Sans]"
			style={{ borderColor: RULE, background: PAPER, color: INK }}
		>
			<div
				data-region="bar"
				className="flex h-[26px] shrink-0 items-center justify-between border-b px-3"
				style={{ borderColor: RULE }}
			>
				<span className="font-semibold text-[10px] tracking-tight leading-3">kaffe</span>
				{home.barLines ? (
					<span className="flex flex-col gap-[3px]">
						<span className="block h-px w-[11px]" style={{ background: INK }} />
						<span className="block h-px w-[11px]" style={{ background: INK }} />
					</span>
				) : null}
			</div>

			<div className="flex min-h-0 flex-1 flex-col px-3 pt-4">
				<h1
					data-region="head"
					className={cn(
						"text-balance font-semibold tracking-tight",
						home.headBig ? "text-[17px] leading-[20px]" : "text-[15px] leading-[18px]",
					)}
				>
					{home.head}
				</h1>

				<p
					data-region="sub"
					className="mt-[7px] text-balance text-[8.5px] leading-[13px]"
					style={{ maxWidth: home.subNarrow ? 168 : 216, color: GREY }}
				>
					{home.sub}
				</p>

				<div
					data-region="cta"
					className="mt-3 flex h-[26px] shrink-0 items-center justify-center rounded-[3px] text-[8.5px] leading-3"
					style={{
						width: home.ctaWide ? 118 : 92,
						background: home.ctaDark ? INK : PAPER,
						color: home.ctaDark ? PAPER : INK,
						border: home.ctaDark ? "1px solid transparent" : `1px solid ${RULE}`,
					}}
				>
					{home.cta}
				</div>

				<div
					data-region="hero"
					className="relative mt-4 h-[148px] shrink-0 overflow-hidden rounded-md"
					style={{ background: home.hero === "flat" ? "#EFEFF1" : "#E9E5DE" }}
				>
					{home.hero === "photo" ? (
						<>
							<span
								className="absolute inset-0 block"
								style={{ background: "linear-gradient(158deg, #D8CFC2 0%, #B8A995 58%, #6E6153 100%)" }}
							/>
							<span
								className="absolute block rounded-full"
								style={{ left: 44, top: 34, width: 72, height: 72, background: "rgba(254,254,254,0.22)" }}
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

				{/* the hours sit against the footer rather than under the hero, so the
				    block a write lands in is not a block a reflow above it can carry
				    across a third's edge */}
				<div data-region="hours" className="mt-auto mb-4 flex flex-col gap-[7px]">
					{home.days.map((day, index) => (
						<div key={day} className="flex items-baseline justify-between">
							<span className="text-[8.5px] leading-3">{day}</span>
							<span className="text-[8.5px] leading-3" style={{ color: GREY }}>
								{home.hours[index] ?? ""}
							</span>
						</div>
					))}
				</div>
			</div>

			<div
				data-region="foot"
				className="flex h-[30px] shrink-0 items-center border-t px-3"
				style={{ borderColor: RULE }}
			>
				<span className="text-[8px] leading-3" style={{ color: GREY }}>
					{home.foot}
				</span>
			</div>
		</div>
	);
}
