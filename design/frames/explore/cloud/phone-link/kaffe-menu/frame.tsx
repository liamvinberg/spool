import { AnimatePresence, motion, useMotionValue } from "motion/react";
import { useState } from "react";
import { ui } from "spool";
import { Bump, type Cart, count, type Drink, DrinkSheet, MenuPage, OrderBar, StepBack, sheetRest, total } from "shared/ui/explore/cloud/phone-link/kaffe-app";

export default function Frame() {
	ui.use();
	const cart = (ui.state.cart ?? {}) as Cart;
	const [open, setOpen] = useState<Drink | null>(null);
	const drag = useMotionValue(sheetRest());
	const add = (name: string, n = 1) => {
		ui.state.cart = { ...cart, [name]: (cart[name] ?? 0) + n };
	};
	const items = count(cart);
	return (
		<div data-kaffe className="fixed inset-0 select-none overflow-hidden bg-[#000] font-sans text-[#1B1A17] antialiased [-webkit-touch-callout:none]">
			<StepBack drag={drag}>
				<MenuPage cart={cart} onAdd={add} onOpen={setOpen} />
			</StepBack>
			<AnimatePresence>
				{open !== null ? <motion.div key="dim" className="absolute inset-0 z-40 bg-[#000]" initial={{ opacity: 0 }} animate={{ opacity: 0.3 }} exit={{ opacity: 0 }} onClick={() => setOpen(null)} /> : null}
			</AnimatePresence>
			<AnimatePresence>
				{open !== null ? (
					<DrinkSheet
						key={open.name}
						drink={open}
						drag={drag}
						onClose={() => setOpen(null)}
						onAdd={(n) => {
							add(open.name, n);
							setOpen(null);
						}}
					/>
				) : null}
			</AnimatePresence>
			<AnimatePresence>
				{items > 0 && open === null ? (
					<OrderBar go="explore/cloud/phone-link/kaffe-cart">
						<Bump value={items} />
						<span>View order</span>
						<span className="ml-auto tabular-nums">{total(cart)} kr</span>
					</OrderBar>
				) : null}
			</AnimatePresence>
		</div>
	);
}
