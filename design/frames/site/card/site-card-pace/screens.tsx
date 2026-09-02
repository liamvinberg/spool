import type { ReactNode } from "react";

/**
 * Pace — a running app, invented for the link card.
 *
 * Black paper, one acid accent, Instrument Sans. The accent is a yellow-green
 * far enough from cadmium that the thread ring the card draws never reads as
 * part of the app.
 *
 * The bet is scale rather than colour: a distance set at 96px and a route drawn
 * as one bright line are both still legible when the whole card is 500px wide,
 * because there are only two objects on the screen to look at. Everything a
 * running app would really show — splits, heart rate, elevation — is present as
 * texture underneath and is not asked to survive the shrink.
 */

const PAPER = "#08090A";
const PANEL = "#121417";
const INK = "#F2F3F4";
const GREY = "#7C8085";
const LINE = "#1F2226";
const ACCENT = "#D8FF3E";

function Phone({ children }: { children: ReactNode }) {
	return (
		<div
			className="flex h-full w-full flex-col overflow-hidden font-[Instrument_Sans]"
			style={{ background: PAPER, color: INK }}
		>
			{children}
		</div>
	);
}

function StatusRow() {
	return (
		<div className="flex shrink-0 items-center justify-between px-7 pt-4 pb-2">
			<span className="font-semibold text-[15px] tracking-tight">9:41</span>
			<div className="flex items-center gap-1.5" style={{ color: INK }}>
				<svg width="17" height="12" viewBox="0 0 17 12" fill="currentColor" aria-hidden="true">
					<rect x="0" y="8" width="3" height="4" rx="1" />
					<rect x="4.5" y="5.5" width="3" height="6.5" rx="1" />
					<rect x="9" y="3" width="3" height="9" rx="1" />
					<rect x="13.5" y="0" width="3" height="12" rx="1" />
				</svg>
				<svg width="16" height="12" viewBox="0 0 16 12" fill="currentColor" aria-hidden="true">
					<path d="M8 11.2 5.4 8.5a3.7 3.7 0 0 1 5.2 0L8 11.2ZM8 5.4c-1.9 0-3.6.75-4.9 2L1.4 5.5A9.5 9.5 0 0 1 8 2.9c2.6 0 4.9 1 6.6 2.6l-1.7 1.9A6.9 6.9 0 0 0 8 5.4Z" />
				</svg>
				<svg width="25" height="12" viewBox="0 0 25 12" fill="none" aria-hidden="true">
					<rect x="0.5" y="0.5" width="21" height="11" rx="3.2" stroke="currentColor" strokeOpacity="0.4" />
					<rect x="2" y="2" width="15" height="8" rx="2" fill="currentColor" />
					<path d="M23 4.2v3.6a2 2 0 0 0 0-3.6Z" fill="currentColor" fillOpacity="0.4" />
				</svg>
			</div>
		</div>
	);
}

function Cap({ children }: { children: ReactNode }) {
	return (
		<div className="font-medium text-[11px] uppercase" style={{ color: GREY, letterSpacing: "0.12em" }}>
			{children}
		</div>
	);
}

/**
 * One bar per kilometre. Height is speed rather than pace, so the tallest bar is
 * the fastest one and colouring it is the same statement as reading it.
 */
const SPLITS: readonly { km: number; h: number; fastest?: boolean }[] = [
	{ km: 1, h: 62 },
	{ km: 2, h: 78 },
	{ km: 3, h: 71 },
	{ km: 4, h: 92 },
	{ km: 5, h: 84 },
	{ km: 6, h: 100, fastest: true },
	{ km: 7, h: 66 },
];

/** The route, traced once in the accent over a very quiet street grid. */
function Route({ height }: { height: number | string }) {
	return (
		<div className="relative overflow-hidden" style={{ height, background: PANEL }}>
			{/* slice, not stretch: the route is a shape, and a taller map should show
			    more street rather than a taller run */}
			<svg
				className="absolute inset-0 h-full w-full"
				viewBox="0 0 334 220"
				preserveAspectRatio="xMidYMid slice"
				fill="none"
				aria-hidden="true"
			>
				<g stroke="#22262B" strokeWidth="1">
					<path d="M0 42h334M0 96h334M0 150h334M0 200h334" />
					<path d="M52 0v220M124 0v220M196 0v220M268 0v220" />
				</g>
				<path
					d="M58 178 C 58 132, 96 118, 128 126 C 168 136, 176 96, 156 70 C 138 46, 168 22, 208 30 C 254 40, 286 78, 272 122 C 262 154, 226 168, 196 160"
					stroke={ACCENT}
					strokeWidth="6"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
				<circle cx="58" cy="178" r="8" fill={PAPER} stroke={ACCENT} strokeWidth="4" />
				<circle cx="196" cy="160" r="9" fill={ACCENT} />
			</svg>
		</div>
	);
}

/** Screen one: the run, live. */
export function PaceRun() {
	return (
		<Phone>
			<StatusRow />

			<div className="flex shrink-0 items-center justify-between px-7 pt-3 pb-7">
				<span className="font-semibold text-[21px] tracking-[-0.02em]">Pace</span>
				<div className="flex items-center gap-2 rounded-full px-3 py-1.5" style={{ background: PANEL }}>
					<span className="h-2 w-2 rounded-full" style={{ background: ACCENT }} />
					<span className="font-medium text-[13px]">Live</span>
				</div>
			</div>

			<div className="px-7">
				<Cap>Distance</Cap>
				<div className="flex items-baseline gap-3 pt-1">
					<span className="font-semibold tracking-[-0.045em]" style={{ fontSize: 102, lineHeight: 0.86 }}>
						5.42
					</span>
					<span className="font-medium text-[26px]" style={{ color: GREY }}>
						km
					</span>
				</div>
			</div>

			<div className="grid grid-cols-3 gap-3 px-7 pt-9">
				{[
					{ k: "Time", v: "24:06" },
					{ k: "Pace", v: "4:27" },
					{ k: "BPM", v: "148" },
				].map((s) => (
					<div key={s.k} className="rounded-[16px] px-4 py-4" style={{ background: PANEL }}>
						<Cap>{s.k}</Cap>
						<div className="pt-1.5 font-semibold text-[25px] tracking-tight">{s.v}</div>
					</div>
				))}
			</div>

			{/* the route takes the slack: a live run is mostly map, and a gap above the
			    controls is the one thing a real running app never has */}
			<div className="flex min-h-0 flex-1 px-7 pt-7 pb-8">
				<div className="w-full overflow-hidden rounded-[20px]" style={{ border: `1px solid ${LINE}` }}>
					<Route height="100%" />
				</div>
			</div>

			<div className="flex shrink-0 items-center justify-center gap-5 px-7 pb-10">
				<div
					className="flex items-center justify-center rounded-full"
					style={{ height: 62, width: 62, background: PANEL }}
				>
					<svg width="20" height="20" viewBox="0 0 24 24" fill={INK} aria-hidden="true">
						<rect x="4" y="4" width="16" height="16" rx="3" />
					</svg>
				</div>
				<div
					className="flex flex-1 items-center justify-center rounded-full font-semibold text-[19px]"
					style={{ height: 62, background: ACCENT, color: PAPER }}
				>
					Pause
				</div>
			</div>
		</Phone>
	);
}

/** Screen two: the walk lands on the finished run. */
export function PaceSummary() {
	return (
		<Phone>
			<StatusRow />

			<div className="flex shrink-0 items-center justify-between px-7 pt-3 pb-6">
				<svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<path d="m15 5-7 7 7 7" stroke={INK} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
				</svg>
				<span className="font-semibold text-[17px] tracking-tight">Evening run</span>
				<svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ color: GREY }}>
					<path
						d="M12 15V3m0 0L8 7m4-4 4 4M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</svg>
			</div>

			<Route height={230} />

			<div className="px-7 pt-7">
				<Cap>Total time</Cap>
				<div className="flex items-baseline gap-3 pt-1">
					<span className="font-semibold tracking-[-0.045em]" style={{ fontSize: 84, lineHeight: 0.88 }}>
						31:48
					</span>
				</div>
				<div className="pt-2 text-[16px]" style={{ color: GREY }}>
					7.14 km · 4:27 / km
				</div>
			</div>

			<div className="px-7 pt-8">
				<Cap>Splits</Cap>
				<div className="flex items-end gap-2.5 pt-4" style={{ height: 108 }}>
					{SPLITS.map((s) => (
						<div key={s.km} className="flex-1">
							<div
								className="w-full rounded-t-[5px]"
								style={{ height: s.h, background: s.fastest ? ACCENT : "#2A2E33" }}
							/>
						</div>
					))}
				</div>
				<div className="flex justify-between pt-2.5 text-[12px]" style={{ color: GREY }}>
					<span>km 1</span>
					<span>km 7</span>
				</div>
			</div>

			<div className="mt-auto px-7 pb-10">
				<div
					className="flex items-center justify-center rounded-full font-semibold text-[19px]"
					style={{ height: 62, background: ACCENT, color: PAPER }}
				>
					Save run
				</div>
			</div>
		</Phone>
	);
}
