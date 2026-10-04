import { ui } from "spool";
import { BarButton, BottomBar, Chips, DRINKS, DrinkRow, Screen, TopBar } from "shared/ui/explore/cloud/phone-link/kaffe-app";

export default function Frame() {
	ui.use();
	const cart = (ui.state.cart ?? {}) as Record<string, number>;
	const items = Object.values(cart).reduce((a, b) => a + b, 0);
	const total = DRINKS.reduce((sum, d) => sum + (cart[d.name] ?? 0) * d.price, 0);
	return (
		<Screen>
			<TopBar title="Kaffebar" />
			<div className="px-4 pt-5 pb-1">
				<h1 className="font-semibold text-[28px] leading-tight">Good morning</h1>
				<p className="text-[#1B1A17]/55 text-[15px]">Order ahead, pick up at the counter.</p>
			</div>
			<Chips />
			<div className="pb-[90px]">
				{DRINKS.map((drink) => (
					<DrinkRow
						key={drink.name}
						drink={drink}
						count={cart[drink.name] ?? 0}
						onAdd={() => {
							ui.state.cart = { ...cart, [drink.name]: (cart[drink.name] ?? 0) + 1 };
						}}
					/>
				))}
			</div>
			<BottomBar>
				<BarButton go="explore/cloud/phone-link/kaffe-cart">
					<span>View cart</span>
					<span className="tabular-nums">
						{items} · {total} kr
					</span>
				</BarButton>
			</BottomBar>
		</Screen>
	);
}
