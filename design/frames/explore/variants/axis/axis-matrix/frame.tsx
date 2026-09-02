import { motion } from "motion/react";
import { useState } from "react";
import { Scaled, TvarsoCheckout, type VariationId } from "shared/ui/demo/tvarso-checkout";
import { RailTabs } from "shared/ui/spool/canvas-chrome";
import { StackIcon, VariantsScreen } from "shared/ui/explore/variants/variants-shell";
import { cn } from "shared/lib/utils";

/**
 * The set is not a list somebody wrote. It is what two axes make between them.
 *
 * The frame declares the axes it varies on — a payment method with three
 * values, a cart with two — and the canvas draws every cell of the product,
 * live, in the field. Turn a value off and the grid re-lays. Pin a cell and
 * that one becomes the frame's face everywhere else in spool.
 *
 * It is the only model on this page where a variation nobody thought to write
 * still gets drawn, which is most of the value: the empty column is how you
 * find out that Swish with an empty cart is the same card three times. It is
 * also the only one that grows multiplicatively, and a third axis of four
 * values makes this field twenty four cards.
 */

const METHOD: readonly { id: VariationId; label: string }[] = [
	{ id: "card", label: "card" },
	{ id: "swish", label: "swish" },
	{ id: "invoice", label: "invoice" },
];

const CART: readonly { id: "full" | "empty"; label: string }[] = [
	{ id: "full", label: "2 tickets" },
	{ id: "empty", label: "nothing" },
];

const SCALE = 0.32;
const W = 115;
const H = 198;

export default function AxisMatrixFrame() {
	const [methods, setMethods] = useState<readonly string[]>(METHOD.map((value) => value.id));
	const [carts, setCarts] = useState<readonly string[]>(CART.map((value) => value.id));
	const [pinned, setPinned] = useState("card/full");

	const rows = CART.filter((value) => carts.includes(value.id));
	const columns = METHOD.filter((value) => methods.includes(value.id));
	const cells = rows.length * columns.length;
	const distinct = (carts.includes("full") ? columns.length : 0) + (carts.includes("empty") ? 1 : 0);

	return (
		<VariantsScreen
			name="axis--matrix"
			argues="Declare two axes and the field draws every cell, including the ones nobody wrote."
			hint="turn a value off in the rail · press a cell to pin it"
			inspector={
				<>
					<RailTabs tabs={["elements", "variations"]} active="variations" />
					<div className="flex flex-col gap-1 border-border border-b px-4 py-3">
						<span className="truncate font-mono text-sm text-text leading-sm">checkout</span>
						<span className="truncate font-mono text-2xs text-muted/60 leading-3">
							frames/booking/checkout/frame.tsx
						</span>
					</div>
					<Axis
						name="method"
						values={METHOD}
						on={methods}
						onToggle={(id) =>
							setMethods((current) =>
								current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
							)
						}
					/>
					<Axis
						name="cart"
						values={CART}
						on={carts}
						onToggle={(id) =>
							setCarts((current) =>
								current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
							)
						}
					/>
					<div className="mt-auto flex flex-col gap-1.5 border-border border-t px-4 py-3">
						<span className="font-mono text-2xs text-muted leading-3">
							{cells} cells · {distinct} of them different
						</span>
						<span className="font-mono text-2xs text-muted/45 leading-3">pinned · {pinned}</span>
					</div>
				</>
			}
		>
			<div className="absolute inset-0 flex flex-col items-center justify-center gap-6">
				<div className="flex items-center gap-2 font-mono text-2xs text-muted leading-3">
					<StackIcon className="h-3 w-3 text-thread" />
					checkout · method × cart
				</div>
				<div className="flex flex-col gap-5">
					{rows.map((row) => (
						<motion.div layout key={row.id} className="flex items-start gap-5">
							<motion.span
								layout
								className="w-[62px] pt-2 text-right font-mono text-2xs text-muted/60 leading-3"
							>
								{row.label}
							</motion.span>
							{columns.map((column) => {
								const key = `${column.id}/${row.id}`;
								const on = key === pinned;
								return (
									<motion.div layout key={key} className="flex flex-col gap-1.5">
										<span
											className={cn("font-mono text-2xs leading-3", on ? "text-thread" : "text-muted/60")}
										>
											{column.label}
										</span>
										<button
											type="button"
											onClick={() => setPinned(key)}
											className="relative block cursor-pointer overflow-hidden rounded-[6px]"
											style={{ width: W, height: H }}
										>
											<Scaled scale={SCALE}>
												<TvarsoCheckout variation={row.id === "empty" ? "empty" : column.id} />
											</Scaled>
											{on ? (
												<span className="pointer-events-none absolute inset-0 rounded-[6px] outline-[1.5px] outline-thread -outline-offset-[1.5px]" />
											) : null}
										</button>
									</motion.div>
								);
							})}
						</motion.div>
					))}
				</div>
				<span className="max-w-[520px] text-center text-base text-muted/70 leading-base">
					{carts.includes("empty")
						? "The bottom row is the same card three times. Nobody wrote those cells, so nobody noticed until the grid drew them."
						: "Every cell is a render of the real frame, not a picture of one."}
				</span>
			</div>
		</VariantsScreen>
	);
}

function Axis({
	name,
	values,
	on,
	onToggle,
}: {
	name: string;
	values: readonly { id: string; label: string }[];
	on: readonly string[];
	onToggle: (id: string) => void;
}) {
	return (
		<div className="flex flex-col gap-2 border-border border-b px-4 py-3">
			<div className="flex items-baseline justify-between">
				<span className="font-mono text-2xs text-muted leading-3">{name}</span>
				<span className="font-mono text-2xs text-muted/45 leading-3">{on.length}</span>
			</div>
			<div className="flex flex-wrap gap-1.5">
				{values.map((value) => {
					const lit = on.includes(value.id);
					return (
						<button
							key={value.id}
							type="button"
							aria-pressed={lit}
							onClick={() => onToggle(value.id)}
							className={cn(
								"rounded-xs border px-2 py-1 font-mono text-2xs leading-3 transition-colors",
								lit ? "border-border-raised bg-raised text-text" : "border-border text-muted/50 hover:text-muted",
							)}
						>
							{value.label}
						</button>
					);
				})}
			</div>
		</div>
	);
}
