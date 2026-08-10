import type { ReactNode } from "react";

/**
 * Meridian — a flight app, invented for the link card.
 *
 * Warm paper, ink, one indigo. Nothing red, so the thread ring the card draws is
 * legibly spool's; and light, which is the point of this variant: a pale screen
 * on near-black paper holds its own edge without needing a border, so the frames
 * read as objects on a canvas at any size.
 *
 * The load-bearing decision is that the two things a boarding pass is actually
 * made of — three-letter codes and a barcode — are both legible at a thumbnail.
 * A flight is one of the few subjects whose real design is already this big.
 */

const PAPER = "#FBFAF8";
const CARD = "#FFFFFF";
const INK = "#111114";
const GREY = "#77777F";
const FAINT = "#A9A9B2";
const LINE = "#E9E6E1";
const ACCENT = "#3730D8";

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
					<rect x="0.5" y="0.5" width="21" height="11" rx="3.2" stroke="currentColor" strokeOpacity="0.35" />
					<rect x="2" y="2" width="15" height="8" rx="2" fill="currentColor" />
					<path d="M23 4.2v3.6a2 2 0 0 0 0-3.6Z" fill="currentColor" fillOpacity="0.35" />
				</svg>
			</div>
		</div>
	);
}

function Header({ title }: { title: string }) {
	return (
		<div className="flex shrink-0 items-center justify-between px-6 pt-3 pb-5">
			<svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
				<path d="m15 5-7 7 7 7" stroke={INK} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
			</svg>
			<span className="font-semibold text-[17px] tracking-tight">{title}</span>
			<svg width="24" height="24" viewBox="0 0 24 24" fill={FAINT} aria-hidden="true">
				<circle cx="5" cy="12" r="2" />
				<circle cx="12" cy="12" r="2" />
				<circle cx="19" cy="12" r="2" />
			</svg>
		</div>
	);
}

/** The route: a dashed arc between two stops, with the aircraft on it. */
function RouteArc() {
	return (
		<div
			className="relative overflow-hidden"
			style={{
				height: 176,
				background: "linear-gradient(160deg, #EDF0FB 0%, #F7F5F1 55%, #FBF3EC 100%)",
			}}
		>
			<svg className="absolute inset-0" viewBox="0 0 334 176" fill="none" aria-hidden="true">
				<path d="M40 132 C 110 34, 224 34, 294 108" stroke={ACCENT} strokeWidth="2.5" strokeDasharray="7 7" />
				<circle cx="40" cy="132" r="7.5" fill={CARD} stroke={ACCENT} strokeWidth="3" />
				<circle cx="294" cy="108" r="7.5" fill={ACCENT} />
				<g transform="translate(167 47) rotate(28)">
					<path
						d="M0 -13 L4.2 -1.5 L17 4 L17 7.5 L4.2 5 L2.6 12 L7 15 L7 17.5 L0 15.6 L-7 17.5 L-7 15 L-2.6 12 L-4.2 5 L-17 7.5 L-17 4 L-4.2 -1.5 Z"
						fill={INK}
					/>
				</g>
			</svg>
		</div>
	);
}

function Codes({ big }: { big?: boolean }) {
	return (
		<div className="flex items-end justify-between">
			<div>
				<div className="font-semibold tracking-[-0.03em]" style={{ fontSize: big ? 52 : 44, lineHeight: 1 }}>
					LHR
				</div>
				<div className="pt-1.5 text-[13px]" style={{ color: GREY }}>
					London
				</div>
			</div>
			<div className="flex flex-1 items-center gap-2 px-4 pb-5">
				<span className="h-px flex-1" style={{ background: LINE }} />
				<svg width="15" height="15" viewBox="0 0 24 24" fill={FAINT} aria-hidden="true">
					<path d="M21 15.5 13.5 12V4.2a1.5 1.5 0 0 0-3 0V12L3 15.5v2.3l7.5-2.2v4.1l-2.3 1.5v1.6l3.8-1 3.8 1v-1.6L13.5 19.7v-4.1l7.5 2.2v-2.3Z" />
				</svg>
				<span className="h-px flex-1" style={{ background: LINE }} />
			</div>
			<div className="text-right">
				<div className="font-semibold tracking-[-0.03em]" style={{ fontSize: big ? 52 : 44, lineHeight: 1 }}>
					JFK
				</div>
				<div className="pt-1.5 text-[13px]" style={{ color: GREY }}>
					New York
				</div>
			</div>
		</div>
	);
}

function Fact({ k, v }: { k: string; v: string }) {
	return (
		<div>
			<div className="font-medium text-[11px] uppercase" style={{ color: FAINT, letterSpacing: "0.1em" }}>
				{k}
			</div>
			<div className="pt-1 font-semibold text-[21px] tracking-tight">{v}</div>
		</div>
	);
}

/** Screen one: the trip. */
export function MeridianTrip() {
	return (
		<Phone>
			<StatusRow />
			<Header title="Your trip" />

			<div className="px-6">
				<div className="overflow-hidden rounded-[26px]" style={{ background: CARD, border: `1px solid ${LINE}` }}>
					<RouteArc />
					<div className="px-6 pt-6 pb-7">
						<div className="flex items-center justify-between pb-6">
							<span className="font-semibold text-[15px] tracking-tight">Meridian</span>
							<span className="font-medium text-[13px]" style={{ color: GREY }}>
								MR 418
							</span>
						</div>
						<Codes />
						<div className="flex justify-between pt-7">
							<Fact k="Departs" v="18:40" />
							<Fact k="Arrives" v="21:55" />
							<Fact k="Gate" v="B22" />
						</div>
					</div>
				</div>
			</div>

			<div className="flex items-center gap-2.5 px-6 pt-6">
				<span className="h-2 w-2 rounded-full" style={{ background: ACCENT }} />
				<span className="font-medium text-[15px]">Boarding starts in 42 min</span>
			</div>

			{/* what the fare includes, which is what fills the space between the card
			    and the action on every real trip screen */}
			<div className="grid grid-cols-3 gap-3 px-6 pt-5">
				{[
					{ k: "Bag", v: "23 kg" },
					{ k: "Seat", v: "Window" },
					{ k: "Meal", v: "Included" },
				].map((f) => (
					<div key={f.k} className="rounded-[16px] px-4 py-3.5" style={{ background: CARD, border: `1px solid ${LINE}` }}>
						<div className="font-medium text-[11px] uppercase" style={{ color: FAINT, letterSpacing: "0.1em" }}>
							{f.k}
						</div>
						<div className="pt-1 font-semibold text-[15px] tracking-tight">{f.v}</div>
					</div>
				))}
			</div>

			<div className="mt-auto px-6 pb-10">
				<div
					className="flex items-center justify-center rounded-[18px] font-semibold text-[18px]"
					style={{ height: 62, background: INK, color: PAPER }}
				>
					View boarding pass
				</div>
			</div>
		</Phone>
	);
}

/** Screen two: the walk lands on the pass. */
export function MeridianPass() {
	return (
		<Phone>
			<StatusRow />
			<Header title="Boarding pass" />

			<div className="px-6">
				<div className="overflow-hidden rounded-[26px]" style={{ background: CARD, border: `1px solid ${LINE}` }}>
					<div className="flex items-center justify-between px-6 pt-6 pb-5">
						<span className="font-semibold text-[15px] tracking-tight">Meridian</span>
						<span
							className="rounded-full px-3 py-1 font-semibold text-[12px]"
							style={{ background: ACCENT, color: CARD, letterSpacing: "0.04em" }}
						>
							ZONE 2
						</span>
					</div>

					<div className="px-6 pb-7">
						<Codes big />
					</div>

					{/* the perforation: notches bitten out of both edges, then a dashed tear */}
					<div className="relative" style={{ height: 26 }}>
						<div
							className="-left-3 absolute h-6 w-6 rounded-full"
							style={{ top: 1, background: PAPER, border: `1px solid ${LINE}` }}
						/>
						<div
							className="-right-3 absolute h-6 w-6 rounded-full"
							style={{ top: 1, background: PAPER, border: `1px solid ${LINE}` }}
						/>
						<div
							className="absolute inset-x-8"
							style={{ top: 12, borderTop: `2px dashed ${LINE}` }}
						/>
					</div>

					<div className="grid grid-cols-3 gap-4 px-6 pt-3 pb-5">
						<Fact k="Seat" v="14A" />
						<Fact k="Gate" v="B22" />
						<Fact k="Boards" v="18:05" />
					</div>
					<div className="grid grid-cols-3 gap-4 px-6 pb-6">
						<Fact k="Departs" v="18:40" />
						<Fact k="Arrives" v="21:55" />
						<Fact k="Flight" v="MR 418" />
					</div>

					{/* the barcode: the one thing on a pass that is meant to be scanned */}
					<div className="flex items-end gap-[3px] px-6 pb-4" style={{ height: 108 }}>
						{Array.from({ length: 52 }, (_, i) => (
							<div
								key={i}
								className="flex-1"
								style={{
									height: 92,
									background: INK,
									opacity: i % 4 === 1 ? 0.22 : i % 7 === 3 ? 0.55 : 1,
								}}
							/>
						))}
					</div>
					<div className="pb-6 text-center font-medium text-[13px]" style={{ color: FAINT, letterSpacing: "0.16em" }}>
						MR418 · LHRJFK · 14A
					</div>
				</div>
			</div>

			<div className="px-6 pt-6 text-center text-[14px]" style={{ color: GREY }}>
				Show this at the gate
			</div>

			<div className="mt-auto px-6 pb-10">
				<div
					className="flex items-center justify-center gap-2.5 rounded-[18px] font-semibold text-[17px]"
					style={{ height: 60, background: CARD, border: `1px solid ${LINE}` }}
				>
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
						<rect x="2.5" y="5.5" width="19" height="14" rx="3.5" stroke={INK} strokeWidth="2" />
						<path d="M2.5 10.5h19" stroke={INK} strokeWidth="2" />
					</svg>
					Add to wallet
				</div>
			</div>
		</Phone>
	);
}
