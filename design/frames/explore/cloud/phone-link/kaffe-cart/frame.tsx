import { ui } from "spool";
import { BarButton, BottomBar, DRINKS, Screen, TopBar } from "shared/ui/explore/cloud/phone-link/kaffe-app";

export default function Frame() {
	ui.use();
	const cart = (ui.state.cart ?? { Cortado: 1, "Cardamom bun": 1 }) as Record<string, number>;
	const lines = DRINKS.filter((d) => (cart[d.name] ?? 0) > 0);
	const total = lines.reduce((sum, d) => sum + (cart[d.name] ?? 0) * d.price, 0);
	return (
		<Screen>
			<TopBar
				title="Your order"
				left={
					<button type="button" onClick={() => ui.back()} className="-ml-1 px-1 text-[17px] text-[#fff]/85">
						‹ Menu
					</button>
				}
			/>
			<div className="space-y-5 px-4 pt-5 pb-[110px]">
				<div className="overflow-hidden rounded-[16px] bg-[#fff]">
					{lines.map((d) => (
						<div key={d.name} className="flex items-center gap-3 border-[#1B1A17]/8 border-b px-4 py-3.5 last:border-b-0">
							<span className="size-[40px] shrink-0 rounded-[11px]" style={{ background: d.tint }} />
							<span className="flex-1 text-[16px]">
								{cart[d.name]} × {d.name}
							</span>
							<span className="text-[15px] tabular-nums">{(cart[d.name] ?? 0) * d.price} kr</span>
						</div>
					))}
				</div>
				<label className="flex items-center justify-between rounded-[16px] bg-[#fff] px-4 py-3.5 text-[16px]">
					Oat milk
					<input type="checkbox" {...{ switch: "" }} defaultChecked className="scale-110" />
				</label>
				<label className="block rounded-[16px] bg-[#fff] px-4 py-3">
					<span className="block text-[#1B1A17]/55 text-[13px]">Note for the barista</span>
					<input type="text" placeholder="Extra hot, please" className="mt-1 w-full bg-transparent text-[16px] outline-none" />
				</label>
				<p className="px-1 text-[#1B1A17]/55 text-[13px]">Ready in about 6 minutes. Pick up at the counter by the window.</p>
			</div>
			<BottomBar>
				<BarButton go="explore/cloud/phone-link/kaffe-receipt">
					<span>Pay with Apple Pay</span>
					<span className="tabular-nums">{total} kr</span>
				</BarButton>
			</BottomBar>
		</Screen>
	);
}
