// React twin of `clock`: habit list + a live clock on a 1 s interval (setState-driven,
// so warm-freeze stops both the interval and the re-renders).

import { useEffect, useState } from "react";

function HabitRow({ emoji, name, streak, pct }: { emoji: string; name: string; streak: number; pct: number }) {
	return (
		<div className="flex items-center gap-3.5 rounded-[14px] border border-[#eeedf2] bg-white px-4 py-3.5">
			<div className="text-[22px]">{emoji}</div>
			<div className="flex-1">
				<div className="text-[15px] font-semibold">{name}</div>
				<div className="mt-0.5 text-[12.5px] text-[#6f6e77]">{streak} day streak</div>
			</div>
			<svg width="34" height="34" viewBox="0 0 34 34" className="shrink-0" role="img" aria-label="progress">
				<circle cx="17" cy="17" r="14" fill="none" stroke="#eeedf2" strokeWidth="4" />
				<circle
					cx="17"
					cy="17"
					r="14"
					fill="none"
					stroke="#6e56cf"
					strokeWidth="4"
					strokeLinecap="round"
					strokeDasharray={`${(pct * 87.96).toFixed(1)} 87.96`}
					transform="rotate(-90 17 17)"
				/>
			</svg>
		</div>
	);
}

export default function Clock() {
	const [time, setTime] = useState(() => new Date().toLocaleTimeString("sv-SE"));
	useEffect(() => {
		const iv = setInterval(() => setTime(new Date().toLocaleTimeString("sv-SE")), 1000);
		return () => clearInterval(iv);
	}, []);
	return (
		<div className="flex h-full flex-col bg-[#fafafa] font-sans text-[#1a1523] antialiased select-none">
			<div className="px-5 pt-[26px] pb-3.5">
				<div className="flex items-baseline justify-between">
					<h1 className="text-2xl font-bold tracking-[-0.4px]">today</h1>
					<div id="clock" className="text-[13px] text-[#6f6e77] tabular-nums">
						{time}
					</div>
				</div>
				<p className="mt-1 text-[13.5px] text-[#6f6e77]">3 of 4 loops closed</p>
			</div>
			<div className="flex flex-1 flex-col gap-2.5 overflow-hidden px-4 pt-1.5">
				<HabitRow emoji="🏃" name="morning run" streak={12} pct={1} />
				<HabitRow emoji="📖" name="read 20 pages" streak={34} pct={1} />
				<HabitRow emoji="🧘" name="meditate" streak={5} pct={1} />
				<HabitRow emoji="🎹" name="practice piano" streak={2} pct={0.4} />
			</div>
			<div className="flex justify-around border-t border-[#eeedf2] bg-white pt-3.5 pb-[26px]">
				<div className="text-xs font-bold text-[#6e56cf]">today</div>
				<div className="text-xs text-[#6f6e77]">stats</div>
				<div className="text-xs text-[#6f6e77]">settings</div>
			</div>
		</div>
	);
}
