import { memo, type ReactNode } from "react";
import { CheckIcon } from "shared/ui/spool/icons";
import { alpha, easeOut, PHONE_H, PHONE_W, type ScreenKind } from "./model";

/**
 * Kaffe, the coffee app from `shared/ui/demo/coffee-screens.tsx`, rebuilt so it can
 * change while you watch. The demo screens are fixed pictures; here every screen is a
 * list of blocks laid out by arithmetic rather than by flex, so a write that adds a
 * block grows it in, the blocks under it slide, and the takes know where every block
 * is without measuring a document. Same face, same greys, same Instrument Sans.
 */

const PAD = 24;
const INNER = PHONE_W - PAD * 2;
const TOP = 64;
const GAP = 14;
const GROW = 0.45;

export interface BlockMark {
	readonly color: string;
	/** 0 to 1: how hard the block is lit */
	readonly ink: number;
	/** an outline that stays after the tint drains */
	readonly ring?: number | undefined;
}

interface Placed {
	readonly id: string;
	readonly y: number;
	readonly h: number;
	readonly node: ReactNode;
}

type Features = Readonly<Record<string, number>>;

const grown = (features: Features, name: string) => {
	const age = features[name];
	return age === undefined ? 0 : easeOut(age / GROW);
};
const has = (features: Features, name: string) => features[name] !== undefined;

const INK = "#17171A";
const GREY = "#86868B";
const FILL = "#EFEFF1";
const DOT = "#D9D9DE";

/** stack blocks from the top, each at its grown height; `bottom` blocks pin to the foot */
function stack(
	top: readonly { id: string; h: number; grow?: number; node: ReactNode }[],
	bottom: readonly { id: string; h: number; node: ReactNode }[] = [],
): Placed[] {
	const placed: Placed[] = [];
	let y = TOP;
	for (const block of top) {
		const g = block.grow ?? 1;
		if (g <= 0) continue;
		const h = block.h * g;
		placed.push({ id: block.id, y, h, node: block.node });
		y += h + GAP * g;
	}
	let foot = PHONE_H - PAD;
	for (const block of [...bottom].reverse()) {
		foot -= block.h;
		placed.push({ id: block.id, y: foot, h: block.h, node: block.node });
		foot -= 12;
	}
	return placed;
}

function Title({ text, sub }: { text: string; sub?: string | undefined }) {
	return (
		<div className="flex flex-col gap-1">
			<span className="font-semibold text-[28px] leading-[34px] tracking-tight">{text}</span>
			{sub === undefined ? null : <span className="text-[15px] leading-5" style={{ color: GREY }}>{sub}</span>}
		</div>
	);
}

function Button({ label, dark = true }: { label: string; dark?: boolean }) {
	return (
		<div
			className="flex h-full items-center justify-center rounded-[10px] font-semibold text-[17px]"
			style={dark ? { background: INK, color: "#FEFEFE" } : { background: FILL, color: INK }}
		>
			{label}
		</div>
	);
}

const DRINKS = [
	{ name: "Cortado", price: "$4.20" },
	{ name: "Flat white", price: "$4.80" },
	{ name: "Filter coffee", price: "$3.20" },
	{ name: "Chai latte", price: "$5.10" },
] as const;

function layout(kind: ScreenKind, f: Features, title: string, seed: number): Placed[] {
	if (kind === "menu") {
		const oat = has(f, "oat");
		const row = oat ? 82 : 64;
		return stack(
			[
				{ id: "title", h: 60, node: <Title text="Menu" sub="Torsgatan 11" /> },
				{
					id: "hero",
					h: 128,
					grow: grown(f, "hero"),
					node: (
						<div className="flex h-full flex-col justify-end rounded-[14px] p-5" style={{ background: INK, color: "#FEFEFE" }}>
							<span className="font-semibold text-[20px] leading-6">Cardamom bun</span>
							<span className="text-[14px] leading-5 opacity-70">Two for $6 before 10:00</span>
						</div>
					),
				},
				{
					id: "drinks",
					h: row * 4 + 24,
					node: (
						<div className="flex flex-col gap-2">
							{DRINKS.map((drink) => (
								<div key={drink.name} className="flex items-center gap-3 rounded-[10px] px-4" style={{ background: FILL, height: row }}>
									<span className="h-9 w-9 shrink-0 rounded-full" style={{ background: DOT }} />
									<span className="flex min-w-0 flex-1 flex-col">
										<span className="font-medium text-[16px] leading-5">
											{drink.name === "Filter coffee" && has(f, "batch") ? "Batch brew" : drink.name}
										</span>
										{oat ? (
											<span className="text-[13px] leading-5" style={{ color: GREY, opacity: grown(f, "oat") }}>
												Oat milk +$0.50
											</span>
										) : null}
									</span>
									<span className="text-[15px]" style={{ color: GREY }}>{drink.price}</span>
								</div>
							))}
						</div>
					),
				},
			],
			[{ id: "cta", h: 54, node: <Button label={has(f, "cta-count") ? "View cart · 2" : "View cart"} /> }],
		);
	}
	if (kind === "cart") {
		const sizes = has(f, "sizes");
		const row = sizes ? 76 : 60;
		const pay = has(f, "pay-pickup") ? "Pay $9.00 and pick up" : has(f, "pay-total") ? "Pay $9.00" : "Pay";
		return stack(
			[
				{ id: "title", h: 40, node: <Title text="Your cart" /> },
				{
					id: "items",
					h: row * 2 + 8,
					node: (
						<div className="flex flex-col gap-2">
							{DRINKS.slice(0, 2).map((drink) => (
								<div key={drink.name} className="flex items-center justify-between rounded-[10px] px-4" style={{ background: FILL, height: row }}>
									<span className="flex flex-col">
										<span className="font-medium text-[16px] leading-5">1 × {drink.name}</span>
										{sizes ? (
											<span className="text-[13px] leading-5" style={{ color: GREY, opacity: grown(f, "sizes") }}>
												Regular, 8 oz
											</span>
										) : null}
									</span>
									<span className="text-[15px]" style={{ color: GREY }}>{drink.price}</span>
								</div>
							))}
						</div>
					),
				},
				{
					id: "pickup",
					h: 76,
					grow: grown(f, "pickup"),
					node: (
						<div className="flex h-full items-center gap-3 rounded-[10px] border px-4" style={{ borderColor: "#E4E4E7" }}>
							<span className="flex h-9 w-9 items-center justify-center rounded-full" style={{ background: FILL }}>
								<span className="h-3.5 w-3.5 rounded-full border-2" style={{ borderColor: INK }} />
							</span>
							<span className="flex flex-col">
								<span className="text-[13px] leading-5" style={{ color: GREY }}>Pickup</span>
								<span className="font-medium text-[16px] leading-5">
									{has(f, "pickup-eta") ? "Ready in about 6 minutes" : "08:40 at Torsgatan 11"}
								</span>
							</span>
						</div>
					),
				},
				{
					id: "note",
					h: 92,
					grow: grown(f, "note"),
					node: (
						<div className="flex h-full flex-col gap-2">
							<span className="font-medium text-[14px] leading-5">Note for the barista</span>
							<div className="flex flex-1 items-center rounded-[10px] px-4 text-[15px]" style={{ background: FILL, color: GREY }}>
								{has(f, "note-copy") ? "Anything we should know?" : "Extra hot, please"}
							</div>
						</div>
					),
				},
			],
			[
				{
					id: "total",
					h: 28,
					node: (
						<div className="flex items-baseline justify-between">
							<span className="font-medium text-[17px]">Total</span>
							<span className="font-semibold text-[17px]">$9.00</span>
						</div>
					),
				},
				{ id: "pay", h: 54, node: <Button label={pay} /> },
			],
		);
	}
	if (kind === "checkout") {
		return stack(
			[
				{ id: "title", h: 40, node: <Title text="Checkout" /> },
				{
					id: "summary",
					h: 60,
					node: (
						<div className="flex h-full items-center justify-between rounded-[10px] px-4" style={{ background: FILL }}>
							<span className="font-medium text-[16px]">2 items</span>
							<span className="text-[15px]" style={{ color: GREY }}>$9.00</span>
						</div>
					),
				},
				{
					id: "pickup",
					h: 56,
					grow: grown(f, "pickup"),
					node: (
						<div className="flex h-full flex-col justify-center">
							<span className="text-[13px] leading-5" style={{ color: GREY }}>Pickup</span>
							<span className="font-medium text-[16px] leading-5">Ready in about 6 minutes</span>
						</div>
					),
				},
				{ id: "apple", h: 54, grow: grown(f, "apple"), node: <Button label="Apple Pay" /> },
				{
					id: "card",
					h: 156,
					node: (
						<div className="flex flex-col gap-2.5">
							{["Card number", "MM / YY", "CVC"].map((field) => (
								<div key={field} className="flex h-[44px] items-center rounded-[10px] border px-4 text-[15px]" style={{ borderColor: "#E4E4E7", color: GREY }}>
									{field}
								</div>
							))}
						</div>
					),
				},
				{
					id: "tip",
					h: 72,
					grow: grown(f, "tip"),
					node: (
						<div className="flex flex-col gap-2">
							<span className="font-medium text-[14px] leading-5">Tip</span>
							<div className="flex gap-2">
								{["10%", "15%", "20%"].map((tip, index) => (
									<span
										key={tip}
										className="flex h-9 flex-1 items-center justify-center rounded-full text-[14px]"
										style={index === 1 ? { background: INK, color: "#FEFEFE" } : { background: FILL }}
									>
										{tip}
									</span>
								))}
							</div>
						</div>
					),
				},
			],
			[{ id: "cta", h: 54, node: <Button label="Place order" /> }],
		);
	}
	if (kind === "receipt") {
		const big = has(f, "code-big");
		return stack([
			{ id: "spacer", h: 60, node: null },
			{
				id: "check",
				h: 64,
				node: (
					<div className="flex justify-center">
						<span className="flex h-16 w-16 items-center justify-center rounded-full" style={{ background: INK, color: "#FEFEFE" }}>
							<CheckIcon className="h-7 w-7" />
						</span>
					</div>
				),
			},
			{
				id: "title",
				h: 60,
				node: (
					<div className="flex flex-col items-center">
						<span className="font-semibold text-[26px] leading-8 tracking-tight">{has(f, "eta") ? "Almost ready" : "Thanks!"}</span>
						<span className="text-[15px] leading-6" style={{ color: GREY }}>Order #214</span>
					</div>
				),
			},
			{
				id: "code",
				h: big ? 150 : 116,
				grow: grown(f, "code"),
				node: (
					<div className="flex h-full flex-col items-center justify-center rounded-[14px]" style={{ background: FILL }}>
						<span className="text-[13px] leading-5" style={{ color: GREY }}>Pickup code</span>
						<span className="font-semibold tracking-tight" style={{ fontSize: big ? 72 : 46, lineHeight: big ? "80px" : "54px" }}>
							K47
						</span>
					</div>
				),
			},
			{
				id: "eta",
				h: 24,
				grow: grown(f, "eta"),
				node: <div className="text-center font-medium text-[16px]">Ready in about 6 minutes</div>,
			},
			{
				id: "mail",
				h: 24,
				node: <div className="text-center text-[14px]" style={{ color: GREY }}>Your receipt is on its way by email</div>,
			},
		]);
	}
	if (kind === "account") {
		return stack([
			{ id: "title", h: 40, node: <Title text="Account" /> },
			{
				id: "profile",
				h: 60,
				node: (
					<div className="flex h-full items-center gap-3">
						<span className="h-12 w-12 rounded-full" style={{ background: DOT }} />
						<span className="flex flex-col">
							<span className="font-medium text-[16px] leading-5">Maja Lind</span>
							<span className="text-[14px] leading-5" style={{ color: GREY }}>maja@kaffe.se</span>
						</span>
					</div>
				),
			},
			{
				id: "rewards",
				h: 128,
				grow: grown(f, "rewards"),
				node: (
					<div className="flex h-full flex-col justify-between rounded-[14px] p-5" style={{ background: INK, color: "#FEFEFE" }}>
						<span className="text-[14px] opacity-70">Kaffe rewards</span>
						<span className="font-semibold text-[22px] leading-7">{has(f, "stamps-count") ? "6 of 10 stamps" : "Your stamps"}</span>
					</div>
				),
			},
			{
				id: "stamps",
				h: 34,
				grow: grown(f, "stamps"),
				node: (
					<div className="flex h-full items-center justify-between">
						{Array.from({ length: 10 }, (_, index) => (
							<span
								key={index}
								className="h-[26px] w-[26px] rounded-full"
								style={index < 6 ? { background: INK } : { border: `2px solid ${DOT}` }}
							/>
						))}
					</div>
				),
			},
			{
				id: "settings",
				h: 4 * 52,
				node: (
					<div className="flex flex-col">
						{["Orders", "Payment", "Notifications", "Sign out"].map((row) => (
							<div key={row} className="flex h-[52px] items-center border-b text-[16px]" style={{ borderColor: "#EDEDEF" }}>
								{row}
							</div>
						))}
					</div>
				),
			},
		]);
	}
	// a plain screen: thirty frames zoomed out must not all be one picture
	const rows = 3 + (seed % 4);
	const dark = seed % 3 === 0;
	return stack(
		[
			{ id: "title", h: 40, node: <Title text={title} /> },
			{
				id: "hero",
				h: dark ? 150 : 0.0001,
				node: dark ? <div className="h-full rounded-[14px]" style={{ background: INK }} /> : null,
			},
			{
				id: "rows",
				h: rows * 68,
				node: (
					<div className="flex flex-col gap-2">
						{Array.from({ length: rows }, (_, index) => (
							<div key={index} className="flex h-[60px] items-center gap-3 rounded-[10px] px-4" style={{ background: FILL }}>
								<span className="h-8 w-8 rounded-full" style={{ background: DOT }} />
								<span className="h-3 rounded-full" style={{ background: DOT, width: 90 + ((seed * 37 + index * 53) % 120) }} />
							</div>
						))}
					</div>
				),
			},
		],
		seed % 2 === 0 ? [{ id: "cta", h: 54, node: <Button label="Continue" /> }] : [],
	);
}

/** where each block sits in the 390×844 phone, for a take that draws beside it */
export function blocksOf(kind: ScreenKind, features: Features): Record<string, { y: number; h: number }> {
	const out: Record<string, { y: number; h: number }> = {};
	for (const block of layout(kind, features, "", 0)) out[block.id] = { y: block.y, h: block.h };
	return out;
}

/** one phone, drawn at 390×844; the caller scales it */
export const KaffeScreen = memo(function KaffeScreen({
	kind,
	features,
	marks,
	title = "Screen",
	seed = 0,
}: {
	kind: ScreenKind;
	features: Features;
	marks?: Readonly<Record<string, BlockMark>> | undefined;
	title?: string | undefined;
	seed?: number | undefined;
}) {
	const blocks = layout(kind, features, title, seed);
	return (
		<div
			className="relative overflow-hidden rounded-[22px] bg-[#FEFEFE] font-[Instrument_Sans] text-[#17171A]"
			style={{ width: PHONE_W, height: PHONE_H }}
		>
			{blocks.map((block) => {
				const mark = marks?.[block.id];
				return (
					<div key={block.id} className="absolute" style={{ left: PAD, top: block.y, width: INNER, height: block.h }}>
						<div className="h-full overflow-hidden">{block.node}</div>
						{mark === undefined || (mark.ink <= 0.01 && (mark.ring ?? 0) <= 0.01) ? null : (
							<div
								aria-hidden="true"
								className="pointer-events-none absolute -inset-2 rounded-[14px]"
								style={{
									background: alpha(mark.color, mark.ink * 0.2),
									boxShadow: `inset 0 0 0 2.5px ${alpha(mark.color, Math.max(mark.ink, mark.ring ?? 0))}`,
								}}
							/>
						)}
					</div>
				);
			})}
		</div>
	);
});
