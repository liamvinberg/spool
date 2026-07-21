// React twin of the vanilla `login` screen: static form, hover states, one busy toggle.

import { useState } from "react";

export default function Login() {
	const [busy, setBusy] = useState(false);
	return (
		<div className="flex h-full flex-col justify-center gap-4 bg-white p-8 font-sans text-[#1a1523] antialiased select-none">
			<div className="mb-6">
				<div className="mb-4 flex size-11 items-center justify-center rounded-[14px] bg-[#6e56cf]">
					<div className="size-[18px] rounded-full border-[3.5px] border-white border-r-transparent" />
				</div>
				<h1 className="text-[28px] font-bold tracking-[-0.5px]">loops</h1>
				<p className="mt-1.5 text-[15px] text-[#6f6e77]">Small habits, kept daily.</p>
			</div>
			<input
				placeholder="email"
				className="rounded-[10px] border border-[#e4e2e9] px-4 py-3.5 text-[15px] outline-[#6e56cf]"
			/>
			<input
				placeholder="password"
				type="password"
				className="rounded-[10px] border border-[#e4e2e9] px-4 py-3.5 text-[15px] outline-[#6e56cf]"
			/>
			<button
				type="button"
				onClick={() => setBusy(true)}
				className="cursor-pointer rounded-[10px] bg-[#6e56cf] p-3.5 text-[15px] font-semibold text-white hover:bg-[#644fc1]"
			>
				{busy ? "signing in…" : "sign in"}
			</button>
			<p className="text-center text-[13px] text-[#6f6e77]">
				no account? <span className="font-semibold text-[#6e56cf]">start a loop</span>
			</p>
		</div>
	);
}
