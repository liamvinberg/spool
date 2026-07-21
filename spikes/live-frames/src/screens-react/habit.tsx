// React twin of `habit`: static detail screen with a CSS entry animation.
// Keyframes stay real CSS in a component <style> — classes can't say them.

import { useState } from "react";

const ringCss = `
@keyframes ring { from { stroke-dasharray: 0 264; } to { stroke-dasharray: 198 264; } }
.ring-fg { animation: ring 1.6s cubic-bezier(0.22, 1, 0.36, 1) forwards; }
`;

export default function Habit() {
	const [logged, setLogged] = useState(false);
	return (
		<div className="flex h-full flex-col bg-white font-sans text-[#1a1523] antialiased select-none">
			<style>{ringCss}</style>
			<div className="flex items-center gap-2.5 px-5 py-[22px]">
				<div className="text-lg text-[#6f6e77]">←</div>
				<div className="text-base font-semibold">morning run</div>
			</div>
			<div className="flex flex-col items-center pt-[26px] pb-2.5">
				<svg width="150" height="150" viewBox="0 0 100 100" role="img" aria-label="75% this month">
					<circle cx="50" cy="50" r="42" fill="none" stroke="#f1eefc" strokeWidth="9" />
					<circle
						className="ring-fg"
						cx="50"
						cy="50"
						r="42"
						fill="none"
						stroke="#6e56cf"
						strokeWidth="9"
						strokeLinecap="round"
						transform="rotate(-90 50 50)"
					/>
					<text x="50" y="47" textAnchor="middle" fontSize="17" fontWeight="700" fill="#1a1523">
						75%
					</text>
					<text x="50" y="62" textAnchor="middle" fontSize="8" fill="#6f6e77">
						this month
					</text>
				</svg>
				<div className="mt-3.5 text-[13.5px] text-[#6f6e77]">12 day streak · best 21</div>
			</div>
			<div className="px-6 py-[18px]">
				<div className="grid grid-cols-7 gap-2">
					{Array.from({ length: 28 }, (_, i) => (
						<div
							key={i}
							className="aspect-square rounded-[7px]"
							style={{
								background: i % 7 === 3 || i === 20 ? "#f1eefc" : "#6e56cf",
								opacity: i > 23 ? 0.25 : 1,
							}}
						/>
					))}
				</div>
			</div>
			<div className="mt-auto px-5 pb-[30px]">
				<button
					type="button"
					onClick={() => setLogged(true)}
					className="w-full cursor-pointer rounded-[10px] bg-[#6e56cf] p-[15px] text-[15px] font-semibold text-white hover:bg-[#644fc1]"
				>
					{logged ? "logged ✓" : "log today"}
				</button>
			</div>
		</div>
	);
}
