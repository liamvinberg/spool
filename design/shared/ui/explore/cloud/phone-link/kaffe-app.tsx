import type { ReactNode } from "react";

/**
 * A phone app written the way an agent writes one, to open on a real phone
 * through a shared link (DEV-115). It deliberately knows nothing about the
 * phone it lands on: no safe-area insets, a header flush with the top, a bar
 * fixed to the bottom, a long scroll, a sideways scroller, a text field and a
 * switch. Whatever the link does to it on a phone is the link's doing.
 *
 * Prototype only.
 */

export interface Drink {
	name: string;
	note: string;
	price: number;
	tint: string;
}

export const DRINKS: Drink[] = [
	{ name: "Cortado", note: "Double shot, warm milk", price: 42, tint: "#C9A27E" },
	{ name: "Flat white", note: "Ethiopia Guji, silky", price: 46, tint: "#D8B892" },
	{ name: "Filter", note: "Kenya Nyeri, today's batch", price: 36, tint: "#8E5B3A" },
	{ name: "Oat latte", note: "Oatly Barista", price: 49, tint: "#E4CDB0" },
	{ name: "Espresso", note: "House blend", price: 32, tint: "#5A3522" },
	{ name: "Cold brew", note: "Steeped 18 hours", price: 44, tint: "#3E2A1E" },
	{ name: "Chai", note: "Spiced, with honey", price: 45, tint: "#C08A55" },
	{ name: "Matcha", note: "Uji, ceremonial", price: 52, tint: "#8FA66B" },
	{ name: "Cardamom bun", note: "Baked at six", price: 38, tint: "#D9A35F" },
	{ name: "Cinnamon bun", note: "Baked at six", price: 36, tint: "#B97A43" },
	{ name: "Rye sandwich", note: "Cheese, cucumber", price: 68, tint: "#9A7B55" },
	{ name: "Chocolate ball", note: "Oats, cocoa, coconut", price: 24, tint: "#4A3021" },
	{ name: "Lemonade", note: "Elderflower", price: 39, tint: "#E8DE8A" },
	{ name: "Hot chocolate", note: "With cream", price: 44, tint: "#6B4430" },
];

export const CHIPS = ["All", "Coffee", "Tea", "Pastry", "Lunch", "Cold", "Seasonal", "Beans"];

const GREEN = "#1F3A2E";

export function Screen({ children }: { children: ReactNode }) {
	return <div className="min-h-full bg-[#F6F1EA] font-sans text-[#1B1A17] antialiased">{children}</div>;
}

export function TopBar({ title, left }: { title: string; left?: ReactNode }) {
	return (
		<header className="sticky top-0 z-10 flex h-[56px] items-center gap-3 px-4 text-[#fff]" style={{ background: GREEN }}>
			{left}
			<span className="font-semibold text-[17px]">{title}</span>
			<span className="ml-auto text-[13px] text-[#fff]/60">Södermalm</span>
		</header>
	);
}

export function Chips() {
	return (
		<div className="flex gap-2 overflow-x-auto px-4 py-3 [scrollbar-width:none]">
			{CHIPS.map((chip, i) => (
				<span
					key={chip}
					className={
						i === 0
							? "shrink-0 rounded-full bg-[#1B1A17] px-4 py-2 text-[14px] text-[#fff]"
							: "shrink-0 rounded-full border border-[#1B1A17]/15 bg-[#fff] px-4 py-2 text-[14px]"
					}
				>
					{chip}
				</span>
			))}
		</div>
	);
}

export function DrinkRow({ drink, count, onAdd }: { drink: Drink; count: number; onAdd: () => void }) {
	return (
		<div className="flex items-center gap-3 border-[#1B1A17]/8 border-b px-4 py-3.5">
			<span className="size-[52px] shrink-0 rounded-[14px]" style={{ background: drink.tint }} />
			<span className="min-w-0 flex-1">
				<span className="block font-medium text-[16px]">{drink.name}</span>
				<span className="block text-[#1B1A17]/55 text-[13px]">{drink.note}</span>
			</span>
			<span className="text-[15px] tabular-nums">{drink.price} kr</span>
			<button
				type="button"
				onClick={onAdd}
				className="flex size-[34px] items-center justify-center rounded-full text-[20px] text-[#fff] active:scale-95"
				style={{ background: GREEN }}
			>
				{count > 0 ? <span className="text-[14px] tabular-nums">{count}</span> : "+"}
			</button>
		</div>
	);
}

/** The bar every phone prototype has: fixed to the bottom edge, nothing below it. */
export function BottomBar({ children }: { children: ReactNode }) {
	return (
		<div className="fixed inset-x-0 bottom-0 z-10 px-4 pt-3 pb-3" style={{ background: GREEN }}>
			{children}
		</div>
	);
}

export function BarButton({ children, go }: { children: ReactNode; go?: string }) {
	return (
		<button type="button" data-go={go} className="flex h-[50px] w-full items-center justify-between rounded-[14px] bg-[#F6F1EA] px-5 font-semibold text-[16px] active:opacity-80" style={{ color: GREEN }}>
			{children}
		</button>
	);
}
