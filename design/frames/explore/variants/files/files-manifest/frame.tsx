import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Scaled, TvarsoCheckout, VARIATIONS, type VariationId } from "shared/ui/demo/tvarso-checkout";
import { Code, Disk, DiskRow, type DiskNode, DiskSplit, Rule } from "shared/ui/explore/variants/variants-code";
import { FIELD_H, FIELD_SCALE, FIELD_W, StackIcon } from "shared/ui/explore/variants/variants-shell";
import { cn } from "shared/lib/utils";

/**
 * One file says what the set is, in what order, under what names.
 *
 * `variations.ts` sits beside the frame and exports a list. Nothing is inferred
 * from a filename and nothing is inferred from a folder: the order the canvas
 * cycles in is the order of the array, the label under each card is the string
 * you wrote, and a variation can render anything, from anywhere, with props
 * baked in.
 *
 * Then delete a line. The file is still on disk and the component still
 * compiles, but it is not a variation any more, because the list is what spool
 * reads. Two sources of truth is the whole cost of this model, and it is
 * exactly the cost that makes it the only one that can carry an order and a
 * label.
 */

const SCALE_LINES = (listed: readonly VariationId[]): readonly string[] => {
	const rows: Record<VariationId, string> = {
		card: '\t{ name: "card", render: Checkout },',
		swish: '\t{ name: "swish", render: Swish },',
		invoice: '\t{ name: "invoice", render: Invoice },',
		empty: '\t{ name: "empty", render: Empty },',
		voucher: '\t{ name: "voucher", render: Voucher },',
	};
	return [
		'import Checkout from "./frame";',
		'import Empty from "./variations/empty";',
		'import Invoice from "./variations/invoice";',
		'import Swish from "./variations/swish";',
		"",
		"// the order the canvas cycles in, and the name under each card",
		"export const variations = [",
		...listed.map((id) => rows[id]),
		"];",
	];
};

export default function FilesManifestFrame() {
	const [dropped, setDropped] = useState(false);
	const listed = VARIATIONS.filter((variation) => !(dropped && variation.id === "empty"));
	const [picked, setPicked] = useState<VariationId>("card");
	const current = listed.find((variation) => variation.id === picked) ?? listed[0]!;

	const nodes: readonly DiskNode[] = [
		{ id: "dir", name: "checkout/", depth: 0, kind: "dir" },
		{ id: "frame", name: "frame.tsx", depth: 1, kind: "entry" },
		{ id: "json", name: "frame.json", depth: 1, kind: "sidecar", note: "360 × 620" },
		{ id: "list", name: "variations.ts", depth: 1, kind: "file", note: `${listed.length} listed` },
		{ id: "variations", name: "variations/", depth: 1, kind: "dir" },
		{ id: "swish", name: "swish.tsx", depth: 2, kind: "file" },
		{ id: "invoice", name: "invoice.tsx", depth: 2, kind: "file" },
		...(dropped
			? [{ id: "empty", name: "empty.tsx", depth: 2, kind: "file" as const, note: "not listed" }]
			: [{ id: "empty", name: "empty.tsx", depth: 2, kind: "file" as const }]),
	];

	return (
		<DiskSplit
			name="files--manifest"
			argues="One list declares the set, its order and its names, and owns the truth twice."
			left={
				<>
					<Disk path="design/frames/booking/">
						{nodes.map((node) => (
							<DiskRow key={node.id} node={node} active={node.id === "list"} />
						))}
					</Disk>
					<div className="flex min-h-0 flex-1 flex-col gap-4 px-4 pt-4 pb-5">
						<Code
							file="checkout/variations.ts"
							lines={SCALE_LINES(listed.map((variation) => variation.id))}
							mark={[6]}
							className="shrink-0"
						/>
						<Rule>
							The list is the set. A file that nothing imports is a file, and the array's order is the order the canvas
							walks in.
						</Rule>
						<button
							type="button"
							onClick={() => {
								setDropped((was) => !was);
								setPicked("card");
							}}
							className={cn(
								"flex h-8 w-fit items-center rounded-sm border px-3 font-mono text-xs leading-xs transition-colors",
								dropped
									? "border-thread/60 text-text"
									: "border-border-raised text-muted hover:border-thread hover:text-text",
							)}
						>
							{dropped ? "put the empty line back" : "delete the line for empty"}
						</button>
						<div className="flex-1" />
					</div>
				</>
			}
			right={
				<div className="flex h-full flex-col items-center justify-center gap-6">
					<div className="flex items-center gap-2 font-mono text-2xs text-muted leading-3">
						<StackIcon className="h-3 w-3 text-thread" />
						checkout · {listed.length} variations
					</div>
					<div className="relative" style={{ width: FIELD_W, height: FIELD_H }}>
						<div className="absolute inset-0 overflow-hidden rounded-[8px]">
							<AnimatePresence initial={false}>
								<motion.div
									key={current.id}
									className="absolute inset-0"
									initial={{ opacity: 0, y: 4 }}
									animate={{ opacity: 1, y: 0 }}
									exit={{ opacity: 0, y: -4 }}
									transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
								>
									<Scaled scale={FIELD_SCALE}>
										<TvarsoCheckout variation={current.id} />
									</Scaled>
								</motion.div>
							</AnimatePresence>
						</div>
						<div className="pointer-events-none absolute -inset-[3px] rounded-[11px] border-[1.5px] border-thread" />
					</div>
					<div className="flex items-center gap-1.5">
						<AnimatePresence initial={false} mode="popLayout">
							{listed.map((variation) => (
								<motion.button
									key={variation.id}
									type="button"
									layout
									initial={{ opacity: 0, scale: 0.9 }}
									animate={{ opacity: 1, scale: 1 }}
									exit={{ opacity: 0, scale: 0.9 }}
									transition={{ type: "spring", stiffness: 420, damping: 34 }}
									onClick={() => setPicked(variation.id)}
									className={cn(
										"rounded-xs px-2 py-1 font-mono text-2xs leading-3 transition-colors",
										variation.id === picked ? "bg-raised text-text" : "text-muted hover:text-text",
									)}
								>
									{variation.label}
								</motion.button>
							))}
						</AnimatePresence>
					</div>
					<span className="max-w-[440px] text-center text-base text-muted/70 leading-base">
						{dropped
							? "empty.tsx is still on disk and still compiles. It stopped being a variation the moment the line went."
							: "Order, names and props all come from one place, and none of them are guessed from a filename."}
					</span>
				</div>
			}
		/>
	);
}
