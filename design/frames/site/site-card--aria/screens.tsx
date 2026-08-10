import type { ReactNode } from "react";

/**
 * Aria — a music app, invented for the link card.
 *
 * It wears its own palette and its own name, as a demo product on a frame must:
 * near-black paper, one lavender accent, Instrument Sans. Nothing here is red,
 * so the thread ring the card draws around the live frame is legibly spool's and
 * not Aria's.
 *
 * The brief is a card seen at 500px on a phone, where a 390px screen lands at
 * roughly 90px. Nothing is drawn to be read at that size, so the screens carry
 * their weight in large colour: the artwork is the biggest object on both, and
 * everything else is texture around it. Body copy exists to look like body copy.
 */

const PAPER = "#0A0A0C";
const INK = "#F5F5F7";
const GREY = "#8B8B95";
const LINE = "#23232B";
const ACCENT = "#B79BFF";

/** Album art. Layered radial gradients read as artwork at any size and cost nothing. */
const ART = {
	night:
		"radial-gradient(120% 110% at 18% 12%, #7C3AED 0%, transparent 58%), radial-gradient(100% 95% at 88% 20%, #F472B6 0%, transparent 52%), radial-gradient(130% 120% at 62% 96%, #F59E0B 0%, transparent 60%), #1B1035",
	tide: "radial-gradient(115% 110% at 22% 18%, #22D3EE 0%, transparent 55%), radial-gradient(100% 100% at 84% 80%, #4F46E5 0%, transparent 58%), #05243B",
	grove:
		"radial-gradient(115% 110% at 78% 16%, #34D399 0%, transparent 55%), radial-gradient(105% 100% at 16% 84%, #0EA5E9 0%, transparent 58%), #05261F",
} as const;

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

/** The status row. Small, but its absence is the loudest thing on a phone screen. */
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

function Label({ children }: { children: ReactNode }) {
	return (
		<div className="px-7 font-medium text-[13px] uppercase" style={{ color: GREY, letterSpacing: "0.09em" }}>
			{children}
		</div>
	);
}

/** Screen one: the library. Five pieces of artwork and almost nothing else. */
export function AriaLibrary() {
	return (
		<Phone>
			<StatusRow />

			<div className="flex shrink-0 items-center justify-between px-7 pt-3 pb-6">
				<span className="font-semibold text-[29px] tracking-[-0.02em]">Aria</span>
				<div
					className="h-[38px] w-[38px] rounded-full"
					style={{ background: "linear-gradient(140deg, #F472B6, #7C3AED)" }}
				/>
			</div>

			<Label>Made for you</Label>

			<div className="px-7 pt-4">
				<div
					className="relative overflow-hidden rounded-[24px]"
					style={{ height: 330, background: ART.night }}
				>
					<div
						className="absolute inset-x-0 bottom-0 h-1/2"
						style={{ background: "linear-gradient(to top, rgba(6,4,14,0.86), transparent)" }}
					/>
					<div className="absolute inset-x-0 bottom-0 p-6">
						<div className="font-semibold text-[27px] leading-tight tracking-[-0.02em]">Late Night Drive</div>
						<div className="pt-1 text-[15px]" style={{ color: "rgba(245,245,247,0.72)" }}>
							42 tracks · 2 hr 51 min
						</div>
					</div>
				</div>
			</div>

			<div className="pt-8">
				<Label>Your mixes</Label>
			</div>

			<div className="grid grid-cols-2 gap-5 px-7 pt-4">
				{[
					{ art: ART.tide, name: "Deep Focus", sub: "28 tracks" },
					{ art: ART.grove, name: "Morning Air", sub: "34 tracks" },
				].map((m) => (
					<div key={m.name}>
						<div className="rounded-[18px]" style={{ height: 152, background: m.art }} />
						<div className="pt-3 font-medium text-[17px] tracking-tight">{m.name}</div>
						<div className="text-[14px]" style={{ color: GREY }}>
							{m.sub}
						</div>
					</div>
				))}
			</div>

			<TabBar active="home" />
		</Phone>
	);
}

function TabBar({ active }: { active: "home" | "search" | "library" }) {
	const tabs = [
		{ id: "home" as const, d: "M3 9.5 12 2.5l9 7V20a1.5 1.5 0 0 1-1.5 1.5h-4V14h-7v7.5h-4A1.5 1.5 0 0 1 3 20V9.5Z" },
		{ id: "search" as const, d: "M10.5 3a7.5 7.5 0 1 1 0 15 7.5 7.5 0 0 1 0-15Zm11 18-5.7-5.7" },
		{ id: "library" as const, d: "M4 4h3v16H4V4Zm5.5 0h3v16h-3V4ZM15 4.8l2.9-.8 4.1 15.4-2.9.8L15 4.8Z" },
	];
	return (
		<div
			className="mt-auto flex shrink-0 items-start justify-around pt-4 pb-9"
			style={{ borderTop: `1px solid ${LINE}` }}
		>
			{tabs.map((t) => (
				<svg
					key={t.id}
					width="25"
					height="25"
					viewBox="0 0 24 24"
					fill={t.id === "search" ? "none" : "currentColor"}
					stroke={t.id === "search" ? "currentColor" : "none"}
					strokeWidth="2"
					strokeLinecap="round"
					aria-hidden="true"
					style={{ color: t.id === active ? ACCENT : "#55555F" }}
				>
					<path d={t.d} />
				</svg>
			))}
		</div>
	);
}

/** Screen two: the walk lands here. One piece of artwork, very large. */
export function AriaPlaying() {
	return (
		<Phone>
			<StatusRow />

			<div className="flex shrink-0 items-center justify-between px-7 pt-3 pb-7">
				<svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ color: GREY }}>
					<path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
				</svg>
				<div className="text-center">
					<div className="font-medium text-[11px] uppercase" style={{ color: GREY, letterSpacing: "0.11em" }}>
						Playing from
					</div>
					<div className="pt-0.5 font-medium text-[15px] tracking-tight">Late Night Drive</div>
				</div>
				<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ color: GREY }}>
					<circle cx="12" cy="5" r="1.9" />
					<circle cx="12" cy="12" r="1.9" />
					<circle cx="12" cy="19" r="1.9" />
				</svg>
			</div>

			<div className="px-7">
				<div
					className="rounded-[26px]"
					style={{ height: 334, background: ART.night, boxShadow: "0 30px 60px -20px rgba(124,58,237,0.55)" }}
				/>
			</div>

			<div className="px-7 pt-9">
				<div className="font-semibold text-[28px] leading-tight tracking-[-0.025em]">Ghost Lights</div>
				<div className="pt-1.5 text-[17px]" style={{ color: GREY }}>
					Nova Reef
				</div>
			</div>

			{/* the scrubber, drawn as a waveform: played bars in the accent */}
			<div className="flex items-center gap-[3px] px-7 pt-8" style={{ height: 44 }}>
				{Array.from({ length: 46 }, (_, i) => {
					const h = 8 + Math.round(26 * Math.abs(Math.sin(i * 0.72) * Math.cos(i * 0.31)));
					return (
						<div
							key={i}
							className="flex-1 rounded-full"
							style={{ height: h, background: i < 17 ? ACCENT : "#33333D" }}
						/>
					);
				})}
			</div>

			<div className="flex justify-between px-7 pt-3 text-[13px]" style={{ color: GREY }}>
				<span>1:12</span>
				<span>3:41</span>
			</div>

			<div className="flex shrink-0 items-center justify-between px-8 pt-7">
				<Glyph d="M16.5 3.5h4v4M20.5 3.5 14 10M7.5 20.5h-4v-4M3.5 20.5 10 14M3.5 3.5h4M3.5 3.5 20.5 20.5" muted />
				<Glyph d="M18 5v14L7 12l11-7ZM5 5v14" solid />
				<div
					className="flex items-center justify-center rounded-full"
					style={{ height: 74, width: 74, background: ACCENT }}
				>
					<svg width="26" height="30" viewBox="0 0 26 30" fill={PAPER} aria-hidden="true">
						<rect x="1" y="0" width="8" height="30" rx="2.5" />
						<rect x="17" y="0" width="8" height="30" rx="2.5" />
					</svg>
				</div>
				<Glyph d="M6 5v14l11-7L6 5ZM19 5v14" solid />
				<Glyph d="M3 8h14a4 4 0 0 1 0 8h-1M6 5 3 8l3 3M21 16H7a4 4 0 0 1 0-8h1M18 19l3-3-3-3" muted />
			</div>
		</Phone>
	);
}

function Glyph({ d, solid, muted }: { d: string; solid?: boolean; muted?: boolean }) {
	return (
		<svg
			width={solid ? 27 : 23}
			height={solid ? 27 : 23}
			viewBox="0 0 24 24"
			fill={solid ? "currentColor" : "none"}
			stroke={solid ? "none" : "currentColor"}
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			style={{ color: muted ? "#5A5A64" : INK }}
		>
			<path d={d} />
		</svg>
	);
}
