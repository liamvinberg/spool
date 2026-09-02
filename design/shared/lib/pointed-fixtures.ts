import type { Pointed } from "shared/lib/agent-selection";

/**
 * The specimens the plural frames point at (#116).
 *
 * Both populations, because they behave nothing alike. Elements are ⌘-picked or
 * shift-ranged out of the elements tab, so there are a handful of them and each
 * carries a long label and an excerpt. Frames are shift-clicked or marqueed, so
 * there can be forty and each is one short word carrying no excerpt at all.
 *
 * The five elements are one shift-range down the cart's tree, which is how a
 * five actually happens — and it lands the pair that matters: two picks of the
 * same list row, identical in every word the rail could print.
 */

const CART = "design/frames/app/cart/frame.tsx";

export const CART_PARTS: readonly Pointed[] = [
	{
		id: "title",
		kind: "element",
		frame: "cart",
		name: "cart-title",
		path: CART,
		lines: [36, 40],
		selector: "h1",
		excerpt: '<h1 className="font-semibold tracking-tight text-[15px] leading-[18px]">Din varukorg</h1>',
	},
	{
		id: "item-1",
		kind: "element",
		frame: "cart",
		name: "line-item",
		path: CART,
		lines: [44, 56],
		selector: "div > div:nth-child(2) > div:nth-child(1)",
		excerpt:
			'<div className="flex items-center justify-between rounded-md bg-[#EFEFF1] px-3 py-[9px]"><span className="font-medium text-sm">1 × Bryggkaffe</span><span className="text-[#86868B] text-xs">32 kr</span></div>',
	},
	{
		id: "item-2",
		kind: "element",
		frame: "cart",
		name: "line-item",
		path: CART,
		lines: [44, 56],
		selector: "div > div:nth-child(2) > div:nth-child(2)",
		excerpt:
			'<div className="flex items-center justify-between rounded-md bg-[#EFEFF1] px-3 py-[9px]"><span className="font-medium text-sm">1 × Cortado</span><span className="text-[#86868B] text-xs">44 kr</span></div>',
	},
	{
		id: "total",
		kind: "element",
		frame: "cart",
		name: "total-row",
		path: CART,
		lines: [61, 70],
		selector: "div > div:nth-child(3) > div:nth-child(1)",
		excerpt:
			'<div className="flex items-baseline justify-between"><span className="font-medium text-sm">Totalt</span><span className="font-semibold text-base">76 kr</span></div>',
	},
	{
		id: "pay",
		kind: "element",
		frame: "cart",
		name: "pay-button",
		path: CART,
		lines: [73, 81],
		selector: "button",
		excerpt:
			'<button className="h-10 w-full rounded-md bg-[#17171A] font-medium text-[#FEFEFE] text-sm">Betala</button>',
	},
];

/**
 * Where each part sits inside the cart's own 240×520 — the canvas half of a chip.
 * Border boxes, read off the component rather than eyeballed, which is why the
 * title's is the full 212: an h1 is a block and spool outlines what is there.
 */
export const CART_BOXES: Readonly<Record<string, { x: number; y: number; w: number; h: number }>> = {
	title: { x: 14, y: 14, w: 212, h: 18 },
	"item-1": { x: 14, y: 46, w: 212, h: 33 },
	"item-2": { x: 14, y: 87, w: 212, h: 33 },
	total: { x: 14, y: 440, w: 212, h: 16 },
	pay: { x: 14, y: 468, w: 212, h: 38 },
};

/** the checkout bar the singular frame has always pointed at */
export const CHECKOUT_BAR: readonly Pointed[] = [
	{
		id: "bar",
		kind: "element",
		frame: "cart",
		name: "checkout-bar",
		path: CART,
		lines: [34, 41],
		selector: "div > div:nth-child(3)",
		excerpt:
			'<div className="flex flex-col gap-3"><div className="flex items-baseline justify-between">…</div><button className="h-10 w-full rounded-md bg-[#17171A]">Betala</button></div>',
	},
];

export const CHECKOUT_BAR_BOX = { x: 14, y: 440, w: 212, h: 66 };

/** three frames, shift-clicked — the population where a chip is one short word */
export const THREE_FRAMES: readonly Pointed[] = ["menu", "cart", "receipt"].map((frame) => ({
	id: frame,
	kind: "frame" as const,
	frame,
	path: `design/frames/app/${frame}/frame.tsx`,
	size: { w: 390, h: 844 },
}));

/**
 * The frame the hands are inside (#139), which is a list of one and can never be
 * longer: `canvas.tsx:820` only reaches for `entered` after picks and selections
 * have both come up empty, and a press anywhere else on the canvas leaves the
 * frame before it can add a second. Byte for byte it is the chip to its left —
 * the daemon serves a frame the same way whether it was clicked or stepped into.
 */
export function enteredFrame(name: string | null): readonly Pointed[] {
	return THREE_FRAMES.filter((entry) => entry.frame === name);
}
