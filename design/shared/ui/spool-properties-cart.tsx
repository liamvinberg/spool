import { cn } from "../lib/utils";
import type { SourceElement } from "../lib/properties-model";

/**
 * kaffe's cart, rendered straight out of the properties model: every element
 * wears the className the model currently holds for it, so a token the surface
 * splices lands here as layout and gets measured again. The document is
 * deliberately not decorated — the ring, the handles and the readout are the
 * canvas's to draw over it, which is also how the real one works.
 *
 * Each node carries `data-node` (the source element) and `data-key` (which
 * rendered instance, for the mapped rows). The back button stands in for a
 * shared component instance and the price for a computed className; the model
 * explains both.
 */

export const ITEMS = [
	{ id: "brygg", label: "Bryggkaffe", price: "35 kr", sale: false },
	{ id: "bulle", label: "Kanelbulle", price: "42 kr", sale: false },
	{ id: "latte", label: "Havrelatte", price: "49 kr", sale: true },
] as const;

export interface CartProps {
	classes: Readonly<Record<string, string>>;
	texts: Readonly<Record<string, string>>;
	/** the element whose class was just spliced; layout flashes nothing, so this is unused visually */
	elements: readonly SourceElement[];
}

export function PropertiesCart({ classes, texts }: CartProps) {
	const c = (id: string) => classes[id] ?? "";
	const t = (id: string, fallback: string) => texts[id] ?? fallback;
	return (
		<div data-node="screen" data-key="screen" className={c("screen")}>
			<div data-node="header" data-key="header" className={c("header")}>
				<span
					data-node="back"
					data-key="back"
					className="flex h-7 w-7 items-center justify-center rounded-sm text-muted"
				>
					<svg viewBox="0 0 10 10" className="h-2.5 w-2.5" fill="none" aria-hidden="true">
						<path d="M6.5 1 2.5 5l4 4" stroke="currentColor" strokeWidth="1.5" />
					</svg>
				</span>
				<span data-node="title" data-key="title" className={c("title")}>
					{t("title", "Din beställning")}
				</span>
			</div>

			<div data-node="promo" data-key="promo" className={c("promo")}>
				<span data-node="promo-label" data-key="promo-label" className={c("promo-label")}>
					{t("promo-label", "Kanelbulle på köpet över 120 kr")}
				</span>
			</div>

			<div data-node="items" data-key="items" className={c("items")}>
				{ITEMS.map((item) => (
					<div key={item.id} data-node="row" data-key={item.id} className={c("row")}>
						<span data-node="name" data-key={item.id} className={c("name")}>
							{item.label}
						</span>
						<span
							data-node="price"
							data-key={item.id}
							className={cn("ml-auto font-mono text-sm leading-sm", item.sale ? "text-thread" : "text-muted")}
						>
							{item.price}
						</span>
					</div>
				))}
			</div>

			<div data-node="footer" data-key="footer" className={c("footer")}>
				<div data-node="total" data-key="total" className={c("total")}>
					<span data-node="total-label" data-key="total-label" className={c("total-label")}>
						{t("total-label", "Totalt")}
					</span>
					<span data-node="total-sum" data-key="total-sum" className={c("total-sum")}>
						{t("total-sum", "126 kr")}
					</span>
				</div>
				<div data-node="pay" data-key="pay" className={c("pay")}>
					<span data-node="pay-label" data-key="pay-label" className={c("pay-label")}>
						{t("pay-label", "Betala")}
					</span>
				</div>
			</div>
		</div>
	);
}
