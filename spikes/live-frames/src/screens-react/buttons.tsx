// React twin of `buttons`: static component sheet with hover states.

export default function Buttons() {
	const btn = "inline-flex cursor-pointer items-center justify-center rounded-[10px] font-semibold";
	return (
		<div className="flex flex-col gap-[18px] bg-white p-6 font-sans text-[#1a1523] antialiased select-none">
			<div className="text-xs font-bold tracking-[0.4px] text-[#6f6e77] uppercase">buttons</div>
			<div className="flex items-center gap-2.5">
				<button type="button" className={`${btn} bg-[#6e56cf] px-[18px] py-[11px] text-sm text-white hover:bg-[#644fc1]`}>
					primary
				</button>
				<button type="button" className={`${btn} bg-[#f1eefc] px-[18px] py-[11px] text-sm text-[#6e56cf]`}>
					secondary
				</button>
				<button type="button" className={`${btn} bg-transparent px-[18px] py-[11px] text-sm text-[#6f6e77]`}>
					ghost
				</button>
			</div>
			<div className="flex items-center gap-2.5">
				<button type="button" className={`${btn} bg-[#6e56cf] px-[13px] py-2 text-[13px] text-white hover:bg-[#644fc1]`}>
					small
				</button>
				<button type="button" className={`${btn} bg-[#6e56cf] px-[22px] py-3.5 text-[15px] text-white hover:bg-[#644fc1]`}>
					large
				</button>
				<button type="button" disabled className={`${btn} bg-[#6e56cf] px-[18px] py-[11px] text-sm text-white disabled:cursor-default disabled:opacity-45`}>
					disabled
				</button>
			</div>
			<div className="flex items-center gap-2.5">
				<input
					placeholder="input"
					className="flex-1 rounded-[9px] border border-[#e4e2e9] px-[13px] py-2.5 text-[13.5px]"
				/>
				<div className="relative h-[26px] w-11 shrink-0 rounded-[13px] bg-[#6e56cf]">
					<div className="absolute top-[3px] right-[3px] size-5 rounded-full bg-white" />
				</div>
			</div>
		</div>
	);
}
