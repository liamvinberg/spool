import { useState } from "react";
import { cn } from "../lib/utils";

/**
 * The document the ladder climbs: kaffe's cart, four elements deep, with every
 * node carrying the id `select-ladder.ts` knows it by. The nesting is the point
 * — a row that holds a name and a price is what gives descent somewhere to go.
 *
 * It also runs. While the frame is live the rows check and the button pays, so
 * the bottom of the ladder is a real difference rather than a label.
 */

const ITEMS = [
	{ id: "brygg", label: "Bryggkaffe", price: "35 kr" },
	{ id: "bulle", label: "Kanelbulle", price: "42 kr" },
	{ id: "latte", label: "Havrelatte", price: "49 kr" },
] as const;

export function CartDocument({ live, ring, picked }: { live: boolean; ring: string | null; picked: string | null }) {
	const [checked, setChecked] = useState<readonly string[]>([]);
	const [paying, setPaying] = useState(false);

	const mark = (id: string) => nodeClass(id, ring, picked);

	return (
		<div data-node="screen" className={cn("flex h-full w-full flex-col bg-bg", mark("screen"))}>
			<Corners on={picked === "screen"} inset />

			<div data-node="header" className={cn("relative flex h-12 shrink-0 items-center gap-3 px-4", mark("header"))}>
				<Corners on={picked === "header"} />
				<span data-node="back" className={cn("relative text-muted", mark("back"))}>
					<Corners on={picked === "back"} />
					<svg viewBox="0 0 10 10" className="h-2.5 w-2.5" fill="none" aria-hidden="true">
						<path d="M6.5 1 2.5 5l4 4" stroke="currentColor" strokeWidth="1.5" />
					</svg>
				</span>
				<span data-node="title" className={cn("relative font-medium text-base leading-base", mark("title"))}>
					<Corners on={picked === "title"} />
					Din beställning
				</span>
			</div>

			<div data-node="items" className={cn("relative flex min-h-0 flex-1 flex-col gap-2 px-4 pt-2", mark("items"))}>
				<Corners on={picked === "items"} />
				{ITEMS.map((item) => {
					const rowId = `row-${item.id}`;
					const on = checked.includes(item.id);
					return (
						<div
							key={item.id}
							data-node={rowId}
							onClick={() => {
								if (!live) return;
								setChecked((current) => (on ? current.filter((id) => id !== item.id) : [...current, item.id]));
							}}
							className={cn(
								"relative flex items-center gap-3 rounded-md border border-border bg-surface px-3 py-2.5",
								live && "cursor-pointer hover:border-border-raised",
								on && "border-thread/50",
								mark(rowId),
							)}
						>
							<Corners on={picked === rowId} />
							<span
								data-node={`${item.id}-name`}
								className={cn("relative text-base leading-base", mark(`${item.id}-name`))}
							>
								<Corners on={picked === `${item.id}-name`} />
								{item.label}
							</span>
							<span
								data-node={`${item.id}-price`}
								className={cn(
									"relative ml-auto font-mono text-sm leading-sm",
									on ? "text-thread" : "text-muted",
									mark(`${item.id}-price`),
								)}
							>
								<Corners on={picked === `${item.id}-price`} />
								{item.price}
							</span>
						</div>
					);
				})}
			</div>

			<div data-node="footer" className={cn("relative flex shrink-0 flex-col gap-3 p-4", mark("footer"))}>
				<Corners on={picked === "footer"} />
				<div
					data-node="total"
					className={cn("relative flex items-baseline justify-between", mark("total"))}
				>
					<Corners on={picked === "total"} />
					<span className="text-base text-muted leading-base">Totalt</span>
					<span className="font-mono text-md leading-md">126 kr</span>
				</div>
				<div
					data-node="pay"
					onClick={() => {
						if (live) setPaying(true);
					}}
					className={cn(
						"relative flex h-11 items-center justify-center rounded-md bg-thread",
						live && "cursor-pointer active:brightness-90",
						mark("pay"),
					)}
				>
					<Corners on={picked === "pay"} />
					<span
						data-node="pay-label"
						className={cn("relative font-medium text-base text-on-thread leading-base", mark("pay-label"))}
					>
						<Corners on={picked === "pay-label"} />
						{paying ? "Betalar…" : "Betala"}
					</span>
				</div>
			</div>
		</div>
	);
}

/**
 * A picked element wears the ring and its four handles; a hovered one, the ring
 * alone. The root draws its ring inwards, because the frame clips at its edge.
 */
function nodeClass(id: string, ring: string | null, picked: string | null): string {
	const offset = id === "screen" ? "outline-offset-[-2px]" : "outline-offset-[2px]";
	if (picked === id) return `outline outline-[1.5px] outline-thread rounded-[3px] ${offset}`;
	if (ring === id) return `outline outline-1 outline-thread/55 rounded-[3px] ${offset}`;
	return "";
}

/** The root's handles turn inwards, because the frame clips at its own edge. */
function Corners({ on, inset = false }: { on: boolean; inset?: boolean }) {
	if (!on) return null;
	const spots = inset
		? ["left-[1px] top-[1px]", "right-[1px] top-[1px]", "bottom-[1px] left-[1px]", "right-[1px] bottom-[1px]"]
		: ["-left-[4px] -top-[4px]", "-right-[4px] -top-[4px]", "-bottom-[4px] -left-[4px]", "-right-[4px] -bottom-[4px]"];
	return (
		<>
			{spots.map(
				(spot) => (
					<span
						key={spot}
						className={cn(
							"pointer-events-none absolute z-10 h-[6px] w-[6px] rounded-[1px] border border-thread bg-on-thread",
							spot,
						)}
					/>
				),
			)}
		</>
	);
}
