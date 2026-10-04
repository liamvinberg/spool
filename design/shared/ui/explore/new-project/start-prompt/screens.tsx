import type { FrameName } from "./fixture";

/**
 * Ebb, the product the agent drafts from Ada's ask: a tide planner for sea kayakers.
 * It speaks as itself, in its own paper and ink, at the phone's real 390 × 844, and
 * the canvas scales it down the way spool scales any frame.
 */

const PAPER = "#F3F1EA";
const INK = "#12262E";
const SEA = "#2F6F7E";
const LINE = "#DCD8CC";
const GREY = "#6B7478";

export function EbbScreen({ name }: { name: FrameName }) {
	return (
		<div className="flex h-[844px] w-[390px] flex-col overflow-hidden font-sans" style={{ background: PAPER, color: INK }}>
			<div className="flex h-[54px] shrink-0 items-end justify-between px-[28px] pb-[8px] text-[15px] font-medium">
				<span>9:41</span>
				<span className="flex gap-[5px]">
					<span className="h-[11px] w-[18px] rounded-[3px] border-[1.5px]" style={{ borderColor: INK }} />
				</span>
			</div>
			{name === "spot" && <Spot />}
			{name === "window" && <Window />}
			{name === "nudge" && <Nudge />}
		</div>
	);
}

function Spot() {
	const spots = [
		{ name: "Grinda", note: "4.2 km · sheltered", next: "14:20" },
		{ name: "Möja sound", note: "11 km · open water", next: "15:05" },
		{ name: "Sandhamn", note: "19 km · exposed", next: "16:40" },
		{ name: "Finnhamn", note: "8.5 km · sheltered", next: "14:55" },
	];
	return (
		<div className="flex flex-1 flex-col px-[24px] pt-[18px]">
			<span className="text-[15px] font-semibold tracking-[-0.01em]" style={{ color: SEA }}>
				ebb
			</span>
			<h2 className="mt-[28px] text-[34px] leading-[38px] font-medium tracking-[-0.02em]">Where are you paddling?</h2>
			<div className="mt-[24px] flex h-[52px] items-center rounded-[14px] border px-[16px] text-[16px]" style={{ borderColor: LINE, color: GREY }}>
				Search a bay or an island
			</div>
			<span className="mt-[30px] text-[13px] font-medium tracking-[0.04em] uppercase" style={{ color: GREY }}>
				Near you
			</span>
			<ul className="mt-[8px]">
				{spots.map((spot) => (
					<li key={spot.name} className="flex h-[76px] items-center justify-between border-b" style={{ borderColor: LINE }}>
						<span className="flex flex-col">
							<span className="text-[18px] font-medium">{spot.name}</span>
							<span className="text-[14px]" style={{ color: GREY }}>
								{spot.note}
							</span>
						</span>
						<span className="rounded-full px-[12px] py-[5px] text-[14px] font-medium text-[#ffffff]" style={{ background: SEA }}>
							{spot.next}
						</span>
					</li>
				))}
			</ul>
		</div>
	);
}

function Window() {
	return (
		<div className="flex flex-1 flex-col px-[24px] pt-[18px]">
			<span className="text-[15px]" style={{ color: GREY }}>
				‹ Spots
			</span>
			<h2 className="mt-[22px] text-[40px] leading-[44px] font-medium tracking-[-0.02em]">Grinda</h2>
			<span className="mt-[6px] text-[16px]" style={{ color: GREY }}>
				Today · wind 4 m/s from SW
			</span>
			<div className="mt-[30px] rounded-[20px] p-[20px] text-[#ffffff]" style={{ background: SEA }}>
				<span className="text-[14px] opacity-80">Next safe window</span>
				<p className="mt-[6px] text-[38px] leading-[42px] font-medium tracking-[-0.02em]">14:20 – 16:05</p>
				<span className="mt-[8px] block text-[15px] opacity-80">Current under 0.5 knots</span>
			</div>
			<svg viewBox="0 0 342 170" className="mt-[28px] w-full">
				<rect x="122" y="0" width="96" height="150" fill={SEA} opacity="0.12" rx="6" />
				<path d="M0 110 C 50 20, 100 20, 150 90 S 260 160, 342 60" fill="none" stroke={INK} strokeWidth="2.5" />
				<line x1="0" y1="150" x2="342" y2="150" stroke={LINE} strokeWidth="1.5" />
				{["12", "14", "16", "18"].map((hour, index) => (
					<text key={hour} x={20 + index * 96} y="168" fontSize="12" fill={GREY}>
						{hour}
					</text>
				))}
			</svg>
			<button type="button" className="mt-auto mb-[40px] h-[56px] rounded-[16px] text-[17px] font-medium text-[#ffffff]" style={{ background: INK }}>
				Nudge me at 15:35
			</button>
		</div>
	);
}

function Nudge() {
	return (
		<div className="relative flex flex-1 flex-col items-center pt-[60px]" style={{ background: `linear-gradient(180deg, ${SEA} 0%, #1C4A55 100%)` }}>
			<span className="text-[20px] font-medium text-[#ffffffcc]">Saturday 14 June</span>
			<span className="text-[88px] leading-[96px] font-medium tracking-[-0.03em] text-[#ffffff]">15:35</span>
			<div className="mt-[40px] w-[350px] rounded-[22px] bg-[#ffffffe0] p-[16px] backdrop-blur" style={{ color: INK }}>
				<div className="flex items-center justify-between text-[13px]" style={{ color: GREY }}>
					<span className="flex items-center gap-[8px]">
						<span className="grid h-[22px] w-[22px] place-items-center rounded-[6px] text-[11px] font-semibold text-[#ffffff]" style={{ background: SEA }}>
							e
						</span>
						EBB
					</span>
					<span>now</span>
				</div>
				<p className="mt-[8px] text-[16px] font-semibold">Your window at Grinda closes in 30 min</p>
				<p className="mt-[2px] text-[15px]">Current picks up to 1.2 knots after 16:05. Head back now to land in slack water.</p>
			</div>
		</div>
	);
}
