import { ui } from "spool";
import { Screen } from "shared/ui/explore/cloud/phone-link/kaffe-app";

export default function Frame() {
	return (
		<Screen>
			<div className="flex min-h-full flex-col items-center justify-center px-8 text-center" style={{ minHeight: "100vh" }}>
				<span className="flex size-[72px] items-center justify-center rounded-full bg-[#1F3A2E] text-[34px] text-[#fff]">✓</span>
				<h1 className="mt-6 font-semibold text-[26px]">Order 214 is on its way</h1>
				<p className="mt-2 text-[#1B1A17]/55 text-[15px]">We'll call your name at the counter.</p>
				<button
					type="button"
					data-go="explore/cloud/phone-link/kaffe-menu"
					onClick={() => {
						ui.state.cart = {};
					}}
					className="mt-10 rounded-full border border-[#1B1A17]/20 px-6 py-3 text-[16px]"
				>
					Back to the menu
				</button>
			</div>
		</Screen>
	);
}
