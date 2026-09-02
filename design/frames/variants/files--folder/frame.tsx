import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import {
	NEW_VARIATION,
	Scaled,
	TvarsoCheckout,
	VARIATIONS,
	type Variation,
	type VariationId,
} from "shared/ui/tvarso-checkout";
import { Code, Disk, DiskRow, type DiskNode, DiskSplit, Rule } from "shared/ui/variants-code";
import { FIELD_H, FIELD_SCALE, FIELD_W, StackIcon } from "shared/ui/variants-shell";
import { cn } from "shared/lib/utils";

/**
 * A folder of files under the frame, and every file in it is a variation.
 *
 * The frame keeps its own `frame.tsx`, which is the first variation and needs
 * no announcement; anything in `variations/` beside it is another one, named by
 * its filename. Nothing registers, nothing is listed twice, and an agent adds a
 * variation by writing one file — press the button at the foot of the tree and
 * watch the canvas gain a card while the file lands.
 *
 * What it costs: one reserved folder name under every frame, a second place a
 * component can live, and a rule about what happens when somebody nests
 * `variations/` inside `variations/`. What it buys is that the unit of
 * authoring is a file, which is the unit an agent is best at.
 */

const SOURCE: Readonly<Record<string, readonly string[]>> = {
	"frame.tsx": [
		'import { Card, Lines, Masthead, Total, Trip } from "./parts";',
		'import { CardFields } from "./parts/card-fields";',
		"",
		"export default function Checkout() {",
		"\treturn (",
		"\t\t<Card action=\"Pay 126 kr\">",
		"\t\t\t<Masthead />",
		"\t\t\t<Trip />",
		"\t\t\t<Lines />",
		"\t\t\t<Total />",
		"\t\t\t<CardFields />",
		"\t\t</Card>",
		"\t);",
		"}",
	],
	"swish.tsx": [
		'import { Card, Lines, Masthead, Total, Trip } from "../parts";',
		'import { SwishFields } from "../parts/swish-fields";',
		"",
		"export default function Swish() {",
		"\treturn (",
		"\t\t<Card action=\"Pay with Swish\">",
		"\t\t\t<Masthead />",
		"\t\t\t<Trip />",
		"\t\t\t<Lines />",
		"\t\t\t<Total />",
		"\t\t\t<SwishFields />",
		"\t\t</Card>",
		"\t);",
		"}",
	],
	"invoice.tsx": [
		'import { Card, Lines, Masthead, Total, Trip } from "../parts";',
		'import { InvoiceFields } from "../parts/invoice-fields";',
		"",
		"export default function Invoice() {",
		"\treturn (",
		"\t\t<Card action=\"Send the invoice\">",
		"\t\t\t<Masthead />",
		"\t\t\t<Trip />",
		"\t\t\t<Lines />",
		"\t\t\t<Total />",
		"\t\t\t<InvoiceFields />",
		"\t\t</Card>",
		"\t);",
		"}",
	],
	"empty.tsx": [
		'import { Card, Masthead } from "../parts";',
		"",
		"// nothing booked yet: no trip, no lines, no total, no pay button.",
		"// a variation is a whole frame, so it is allowed to throw the rest away.",
		"export default function Empty() {",
		"\treturn (",
		'\t\t<Card action="See the timetable">',
		"\t\t\t<Masthead />",
		"\t\t\t<Nothing />",
		"\t\t</Card>",
		"\t);",
		"}",
	],
	"voucher.tsx": [
		'import { Card, Lines, Masthead, Total, Trip } from "../parts";',
		'import { VoucherFields } from "../parts/voucher-fields";',
		"",
		"export default function Voucher() {",
		"\treturn (",
		"\t\t<Card action=\"Pay 46 kr\">",
		"\t\t\t<Masthead />",
		"\t\t\t<Trip />",
		"\t\t\t<Lines />",
		"\t\t\t<Total />",
		"\t\t\t<VoucherFields />",
		"\t\t</Card>",
		"\t);",
		"}",
	],
};

export default function FilesFolderFrame() {
	const [written, setWritten] = useState(false);
	const [picked, setPicked] = useState<VariationId>("card");
	const set: readonly Variation[] = written ? [...VARIATIONS, NEW_VARIATION] : VARIATIONS;
	const current = set.find((variation) => variation.id === picked) ?? VARIATIONS[0]!;
	const source = SOURCE[current.file] ?? [];

	const nodes: readonly DiskNode[] = [
		{ id: "dir", name: "checkout/", depth: 0, kind: "dir" },
		{ id: "card", name: "frame.tsx", depth: 1, kind: "entry", note: "the first variation" },
		{ id: "json", name: "frame.json", depth: 1, kind: "sidecar", note: "360 × 620" },
		{ id: "parts", name: "parts/", depth: 1, kind: "dir", note: "shared by all of them" },
		{ id: "variations", name: "variations/", depth: 1, kind: "dir", note: `${set.length - 1}` },
		...set
			.filter((variation) => variation.id !== "card")
			.map((variation) => ({
				id: variation.id,
				name: variation.file,
				depth: 2,
				kind: "file" as const,
				fresh: variation.id === NEW_VARIATION.id,
			})),
	];

	return (
		<DiskSplit
			name="files--folder"
			argues="A variations/ folder under the frame, one file per candidate, written while you watch."
			left={
				<>
					<Disk path="design/frames/booking/">
						{nodes.map((node) => (
							<DiskRow
								key={node.id}
								node={node}
								active={node.id === picked}
								onPick={
									node.kind === "dir" || node.kind === "sidecar" || node.id === "parts"
										? undefined
										: () => setPicked(node.id as VariationId)
								}
							/>
						))}
					</Disk>
					<div className="flex min-h-0 flex-1 flex-col gap-4 px-4 pt-4 pb-5">
						<Code
							file={`checkout/${current.id === "card" ? "" : "variations/"}${current.file}`}
							lines={source}
							className="shrink-0"
						/>
						<Rule>
							Every file in <span className="font-mono text-text">variations/</span> is a variation of the frame beside
							it, named by its filename. The folder's own{" "}
							<span className="font-mono text-text">frame.tsx</span> is the first one and says nothing about the rest.
						</Rule>
						<button
							type="button"
							onClick={() => {
								setWritten(true);
								setPicked(NEW_VARIATION.id);
							}}
							disabled={written}
							className={cn(
								"flex h-8 w-fit items-center gap-2 rounded-sm border px-3 font-mono text-xs leading-xs transition-colors",
								written
									? "border-border text-muted/45"
									: "border-border-raised text-muted hover:border-thread hover:text-text",
							)}
						>
							{written ? "written · the canvas has five" : "write variations/voucher.tsx"}
						</button>
						<div className="flex-1" />
					</div>
				</>
			}
			right={
				<div className="flex h-full flex-col items-center justify-center gap-6">
					<div className="flex items-center gap-2 font-mono text-2xs text-muted leading-3">
						<StackIcon className="h-3 w-3 text-thread" />
						checkout · {set.length} variations
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
					{/* one chip per file, in the order the folder lists them */}
					<div className="flex items-center gap-1.5">
						<AnimatePresence initial={false}>
							{set.map((variation) => (
								<motion.button
									key={variation.id}
									type="button"
									layout
									initial={{ opacity: 0, scale: 0.9 }}
									animate={{ opacity: 1, scale: 1 }}
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
					<span className="max-w-[420px] text-center text-base text-muted/70 leading-base">
						One frame on the canvas, whichever file is facing you. The name never changes, and neither does the
						geometry: there is one frame.json for the set.
					</span>
				</div>
			}
		/>
	);
}
