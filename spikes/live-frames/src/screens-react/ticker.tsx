// React twin of `ticker`: rAF marquee. Transform rides a ref mutation every frame
// (no per-frame re-render); React reconciles only when a row scrolls out and the
// list shifts — the idiomatic split an agent would write.

import { useEffect, useRef, useState } from "react";

const NAMES = ["ada", "linus", "grace", "edsger", "barbara", "alan", "margaret", "dennis"];
const ACTS = ["closed a loop", "hit a 30-day streak", "joined loops", "logged morning run", "shared stats"];

type Row = { seq: number };

export default function Ticker() {
	const [rows, setRows] = useState<Row[]>(() => Array.from({ length: 14 }, (_, i) => ({ seq: i })));
	const feedRef = useRef<HTMLDivElement | null>(null);
	useEffect(() => {
		const feed = feedRef.current;
		if (!feed) return;
		let y = 0;
		let raf = 0;
		const step = () => {
			y -= 0.6;
			const first = feed.firstElementChild as HTMLElement | null;
			if (first && -y > first.offsetHeight + 8) {
				y += first.offsetHeight + 8;
				setRows((r) => {
					const last = r[r.length - 1];
					return [...r.slice(1), { seq: (last?.seq ?? 0) + 1 }];
				});
			}
			feed.style.transform = `translateY(${y}px)`;
			raf = requestAnimationFrame(step);
		};
		raf = requestAnimationFrame(step);
		return () => cancelAnimationFrame(raf);
	}, []);
	return (
		<div className="flex h-full flex-col overflow-hidden bg-[#fafafa] font-sans text-[#1a1523] antialiased select-none">
			<div className="px-5 pt-[22px] pb-3">
				<div className="text-[17px] font-bold">activity</div>
				<div className="mt-[3px] text-[12.5px] text-[#6f6e77]">rAF marquee · live feed</div>
			</div>
			<div className="relative flex-1 overflow-hidden">
				<div id="feed" ref={feedRef} className="absolute right-0 left-0 flex flex-col gap-2 px-4">
					{rows.map((r) => (
						<div
							key={r.seq}
							className="flex items-center gap-3 rounded-xl border border-[#eeedf2] bg-white px-3.5 py-3"
						>
							<div className="size-[30px] shrink-0 rounded-full bg-[#f1eefc]" />
							<div className="text-[13px]">
								<b>{NAMES[r.seq % NAMES.length]}</b> {ACTS[r.seq % ACTS.length]}
								<div className="mt-0.5 text-[11.5px] text-[#6f6e77]">{r.seq % 59}s ago</div>
							</div>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
