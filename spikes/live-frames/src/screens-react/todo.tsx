// React twin of `todo` — THE state-survival demo. State in useState instead of the
// DOM; ids (#inp/#add/#list) kept so the smoke test drives both variants unchanged.

import { useState } from "react";

export default function Todo() {
	const [items, setItems] = useState(["morning pages", "water the monstera"]);
	const [draft, setDraft] = useState("");
	const add = () => {
		const t = draft.trim();
		if (!t) return;
		setItems((s) => [...s, t]);
		setDraft("");
	};
	return (
		<div className="flex h-full flex-col bg-[#fafafa] font-sans text-[#1a1523] antialiased select-none">
			<div className="px-5 pt-[26px] pb-2.5">
				<div className="text-[17px] font-bold">scratchpad</div>
				<div className="mt-[3px] text-[12.5px] text-[#6f6e77]">state lives in this frame — remounts eat it</div>
			</div>
			<div className="flex gap-2 px-4 py-2">
				<input
					id="inp"
					placeholder="add item…"
					value={draft}
					onChange={(e) => setDraft(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter") add();
					}}
					className="flex-1 rounded-[10px] border border-[#e4e2e9] px-3.5 py-3 text-sm outline-[#6e56cf]"
				/>
				<button
					id="add"
					type="button"
					onClick={add}
					className="cursor-pointer rounded-[10px] bg-[#6e56cf] px-4 py-3 text-sm font-semibold text-white hover:bg-[#644fc1]"
				>
					add
				</button>
			</div>
			<div id="list" className="flex flex-1 flex-col gap-2 overflow-auto px-4 py-2.5">
				{items.map((text, i) => (
					<div
						key={`${i}-${text}`}
						className="flex items-center gap-2.5 rounded-[11px] border border-[#eeedf2] bg-white px-3.5 py-3 text-sm"
					>
						<span className="flex-1">{text}</span>
						<button
							type="button"
							onClick={() => setItems((s) => s.filter((_, j) => j !== i))}
							className="cursor-pointer text-[#6f6e77]"
						>
							✕
						</button>
					</div>
				))}
			</div>
		</div>
	);
}
