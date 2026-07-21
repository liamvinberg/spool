// React twin of `livechart`: interval-driven setState every 250 ms — React rebuilds
// the 24 bars each tick where the vanilla version rebuilt innerHTML.

import { useEffect, useState } from "react";

export default function Livechart() {
	const [vals, setVals] = useState(() => Array.from({ length: 24 }, () => 30 + Math.random() * 70));
	useEffect(() => {
		const iv = setInterval(() => {
			setVals((v) => [...v.slice(1), 30 + Math.random() * 70]);
		}, 250);
		return () => clearInterval(iv);
	}, []);
	return (
		<div className="flex h-full flex-col bg-white font-sans text-[#1a1523] antialiased select-none">
			<div className="px-5 pt-[22px] pb-2">
				<div className="text-[17px] font-bold">throughput</div>
				<div className="mt-[3px] text-[12.5px] text-[#6f6e77]">rebuilds 24 bars every 250ms</div>
			</div>
			<div id="chart" className="flex flex-1 items-end gap-[5px] px-5 pt-4 pb-[26px]">
				{vals.map((v, i) => (
					<div
						key={i}
						className="flex-1 rounded-t-[5px] rounded-b-sm"
						style={{ height: `${v.toFixed(1)}%`, background: v > 85 ? "#6e56cf" : "#d8d0f5" }}
					/>
				))}
			</div>
		</div>
	);
}
