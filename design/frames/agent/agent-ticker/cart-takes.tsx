/**
 * The two finished empty-state takes the sub-agent has written so far, authored
 * at the same 240x520 natural size the coffee screens use at canvas scale, so
 * the field can scale all five frames by one factor and stay honest about zoom.
 *
 * They are two different answers, not one restyled: take A admits the cart is
 * empty and sends you back to the menu, take B never leaves, it brings two
 * products in. At 40% zoom the silhouettes are what carries that, so one is a
 * centred mass over a dark action bar and the other is top-weighted rows.
 */

export function CartEmptyTakeA() {
	return (
		<div className="flex h-full w-full flex-col overflow-hidden rounded-lg border border-[#E4E4E7] bg-[#FEFEFE] px-4 pt-[18px] pb-4 font-[Instrument_Sans] text-[#17171A]">
			<h1 className="font-semibold text-md tracking-tight leading-sm">Din varukorg</h1>
			<div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2">
				<span className="h-11 w-11 rounded-full border-[1.5px] border-[#D9D9DE]" />
				<p className="font-medium text-2xs leading-3">Inget här än</p>
				<p className="text-[#86868B] text-[9px] leading-3">Din varukorg är tom</p>
			</div>
			<div className="flex h-[30px] shrink-0 items-center justify-center rounded-md bg-[#17171A] font-medium text-2xs text-[#FEFEFE] leading-3">
				Se menyn
			</div>
		</div>
	);
}

const SUGGESTED = [
	{ name: "Cortado", price: "42 kr" },
	{ name: "Flat white", price: "48 kr" },
] as const;

export function CartEmptyTakeB() {
	return (
		<div className="flex h-full w-full flex-col gap-3 overflow-hidden rounded-lg border border-[#E4E4E7] bg-[#FEFEFE] px-4 pt-[18px] pb-4 font-[Instrument_Sans] text-[#17171A]">
			<div className="flex flex-col gap-0.5">
				<h1 className="font-semibold text-md tracking-tight leading-sm">Din varukorg</h1>
				<p className="text-[#86868B] text-[9px] leading-3">Inga varor än</p>
			</div>
			<div className="flex flex-col gap-1.5">
				<p className="font-medium text-[9px] text-[#86868B] leading-3">Populärt just nu</p>
				{SUGGESTED.map((product) => (
					<div key={product.name} className="flex items-center gap-2 rounded-md bg-[#EFEFF1] p-1.5">
						<span className="h-[22px] w-[22px] shrink-0 rounded-full bg-[#D9D9DE]" />
						<span className="min-w-0 flex-1 font-medium text-2xs leading-3">{product.name}</span>
						<span className="shrink-0 text-[#86868B] text-[9px] leading-3">{product.price}</span>
					</div>
				))}
			</div>
			<div className="min-h-3 flex-1" />
			<span className="font-medium text-2xs text-[#17171A] leading-3 underline decoration-[#C9C9CE]">
				Titta på hela menyn
			</span>
		</div>
	);
}
