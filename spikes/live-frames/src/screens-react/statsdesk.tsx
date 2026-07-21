// React twin of `statsdesk`: desktop shell, stat cards, staggered bar chart entry.

const growCss = `
@keyframes grow { from { transform: scaleY(0); } to { transform: scaleY(1); } }
.bar { transform-origin: bottom; animation: grow 0.9s cubic-bezier(0.22, 1, 0.36, 1) backwards; }
`;

const NAV = ["overview", "loops", "calendar", "friends", "settings"];
const CARDS: [string, string][] = [
	["current streak", "12d"],
	["loops closed", "312"],
	["completion", "87%"],
	["best week", "28/28"],
];
const BARS = [60, 80, 45, 90, 100, 70, 85, 30, 95, 100, 65, 80, 100, 90];

export default function Statsdesk() {
	return (
		<div className="flex h-full bg-[#fafafa] font-sans text-[#1a1523] antialiased select-none">
			<style>{growCss}</style>
			<div className="flex w-[210px] flex-col gap-1 border-r border-[#eeedf2] bg-white px-3.5 py-[22px]">
				<div className="flex items-center gap-[9px] px-2 pb-[18px]">
					<div className="size-[26px] rounded-lg bg-[#6e56cf]" />
					<div className="text-[15px] font-bold">loops</div>
				</div>
				{NAV.map((l, i) => (
					<div
						key={l}
						className={`rounded-lg px-2.5 py-[9px] text-[13.5px] ${i === 0 ? "bg-[#f1eefc] font-semibold text-[#6e56cf]" : "text-[#6f6e77]"}`}
					>
						{l}
					</div>
				))}
			</div>
			<div className="flex-1 overflow-hidden px-[30px] py-[26px]">
				<h1 className="mb-[18px] text-[21px] font-bold tracking-[-0.3px]">overview</h1>
				<div className="mb-[18px] grid grid-cols-4 gap-3">
					{CARDS.map(([l, v]) => (
						<div key={l} className="rounded-xl border border-[#eeedf2] bg-white px-4 py-3.5">
							<div className="text-xs text-[#6f6e77]">{l}</div>
							<div className="mt-1 text-[22px] font-bold tracking-[-0.4px]">{v}</div>
						</div>
					))}
				</div>
				<div className="rounded-xl border border-[#eeedf2] bg-white px-5 py-[18px]">
					<div className="mb-3.5 text-[13.5px] font-semibold">closed loops · last 14 days</div>
					<div className="flex h-[130px] items-end gap-[7px]">
						{BARS.map((h, i) => (
							<div
								key={i}
								className="bar flex-1 rounded-t-md rounded-b-[3px]"
								style={{ height: `${h}%`, background: h === 100 ? "#6e56cf" : "#d8d0f5", animationDelay: `${i * 45}ms` }}
							/>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}
