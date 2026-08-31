import { CLASSES } from "../lib/shared-reach";
import { cn } from "../lib/utils";

/**
 * kaffe, in three frames, out of one set of classes.
 *
 * `ScreenHeader` and `Button` stand in for `shared/ui/`: they take the class map
 * by id, so all three documents read the same entry for `header` and the same
 * entry for `pay`. Nothing propagates here — there is one value and three
 * renders of it, which is the honest shape of what the daemon does when a
 * shared file changes and every frame that imports it recompiles.
 *
 * Only the cart carries `data-node` on its own elements: the neighbours are
 * there to be changed, not to be pointed at, and the shared parts they render
 * are stamped so a mark can find them.
 */

export type Classes = Readonly<Record<string, string>>;
export type Texts = Readonly<Record<string, string>>;

interface Ink {
	classes: Classes;
	texts: Texts;
}

function inkOf({ classes, texts }: Ink) {
	return {
		c: (id: string) => classes[id] ?? CLASSES[id] ?? "",
		t: (id: string, fallback: string) => texts[id] ?? fallback,
	};
}

/* ---------- the two exports that live in shared/ui/kaffe-chrome.tsx ---------- */

function ScreenHeader({ ink, title }: { ink: Ink; title: string }) {
	const { c, t } = inkOf(ink);
	return (
		<div data-node="header" data-key="header" className={c("header")}>
			<span data-node="back" data-key="back" className={c("back")}>
				<svg viewBox="0 0 10 10" className="h-2.5 w-2.5" fill="none" aria-hidden="true">
					<path d="M6.5 1 2.5 5l4 4" stroke="currentColor" strokeWidth="1.5" />
				</svg>
			</span>
			<span data-node="title" data-key="title" className={c("title")}>
				{t("title", title)}
			</span>
		</div>
	);
}

function Button({ ink, label }: { ink: Ink; label: string }) {
	const { c, t } = inkOf(ink);
	return (
		<div data-node="pay" data-key="pay" className={c("pay")}>
			<span data-node="pay-label" data-key="pay-label" className={c("pay-label")}>
				{t("pay-label", label)}
			</span>
		</div>
	);
}

/* ---------- the three documents ---------- */

const ITEMS = [
	{ id: "brygg", label: "Bryggkaffe", price: "35 kr" },
	{ id: "bulle", label: "Kanelbulle", price: "42 kr" },
	{ id: "latte", label: "Havrelatte", price: "49 kr" },
] as const;

export function CartDoc(ink: Ink) {
	const { c, t } = inkOf(ink);
	return (
		<div data-node="screen" data-key="screen" className={c("screen")}>
			<ScreenHeader ink={ink} title="Din beställning" />

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
						<span data-node="price" data-key={item.id} className={c("price")}>
							{item.price}
						</span>
					</div>
				))}
			</div>

			<div data-node="footer" data-key="footer" className={c("footer")}>
				<div data-node="total" data-key="total" className={c("total")}>
					<span className="text-base text-muted leading-base">Totalt</span>
					<span className="font-mono text-md leading-md">126 kr</span>
				</div>
				<Button ink={ink} label="Betala" />
			</div>
		</div>
	);
}

const MENU = ["Bryggkaffe", "Havrelatte", "Kanelbulle", "Cortado"] as const;

export function MenuDoc(ink: Ink) {
	return (
		<div className="flex h-full w-full flex-col bg-bg">
			<ScreenHeader ink={ink} title="Meny" />
			<div className="grid min-h-0 flex-1 grid-cols-2 gap-2 p-3">
				{MENU.map((name) => (
					<div key={name} className="flex flex-col justify-end rounded-md border border-border bg-surface p-2">
						<span className="text-sm leading-sm">{name}</span>
						<span className="font-mono text-2xs text-muted leading-3">35 kr</span>
					</div>
				))}
			</div>
			<div className="p-3">
				<Button ink={ink} label="Till kassan" />
			</div>
		</div>
	);
}

export function ReceiptDoc(ink: Ink) {
	return (
		<div className="flex h-full w-full flex-col bg-bg">
			<ScreenHeader ink={ink} title="Kvitto" />
			<div className="flex min-h-0 flex-1 flex-col gap-2.5 p-3">
				{ITEMS.map((item) => (
					<div key={item.id} className="flex items-baseline gap-2">
						<span className="text-sm leading-sm">{item.label}</span>
						<span className="ml-auto font-mono text-2xs text-muted leading-3">{item.price}</span>
					</div>
				))}
				<div className="mt-1 flex items-baseline gap-2 border-border border-t pt-2.5">
					<span className="text-sm text-muted leading-sm">Totalt</span>
					<span className="ml-auto font-mono text-sm leading-sm">126 kr</span>
				</div>
			</div>
		</div>
	);
}

/** The frame's own body, by name, so the field draws all three from one list. */
export function DocFor({ name, ink }: { name: string; ink: Ink }) {
	if (name === "cart") return <CartDoc {...ink} />;
	if (name === "menu") return <MenuDoc {...ink} />;
	return <ReceiptDoc {...ink} />;
}

/** The plate the canvas draws over a frame an agent is writing (#214). */
export function AgentPlate({ who }: { who: string }) {
	return (
		<span className="-top-6 pointer-events-none absolute right-0 flex items-center gap-1.5 rounded-xs border border-border-raised bg-raised px-1.5 py-[3px] font-mono text-2xs text-muted leading-3">
			<span className={cn("h-1.5 w-1.5 rounded-full bg-thread")} />
			{who} · writing
		</span>
	);
}
