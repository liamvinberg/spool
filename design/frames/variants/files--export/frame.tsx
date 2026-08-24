import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { CARD_H, CARD_W, Scaled, TvarsoCheckout, TvarsoOutlet, VARIATIONS } from "../../../shared/ui/tvarso-checkout";
import { Code, Disk, DiskRow, type DiskNode, DiskSplit, Rule } from "../../../shared/ui/variants-code";
import { FIELD_H, FIELD_SCALE, FIELD_W, StackIcon } from "../../../shared/ui/variants-shell";
import { cn } from "../../../shared/lib/utils";

/**
 * No new file, no new folder: the module already has room.
 *
 * `frame.tsx` default-exports the frame, and every named export beside it is a
 * variation. It is the cheapest model on this page by a mile — the compiler
 * already parses the module, an agent adds a variation by adding a function,
 * and there is exactly one file to read to know the whole set.
 *
 * Then add a helper. A component pulled out of a long render is a named export
 * too, and spool has no way to tell it from a variation, so the canvas grows a
 * fifth card showing half a card. Every fix for that costs the thing that made
 * this model cheap: a marker, a naming rule, a config, a list.
 */

const HEAD: readonly string[] = [
	'import { Card, Lines, Masthead, Total, Trip } from "./parts";',
	"",
	"export default function Checkout() {",
	'\treturn <Card action="Pay 126 kr">{/* … */}<CardFields /></Card>;',
	"}",
	"",
	"export function Swish() {",
	'\treturn <Card action="Pay with Swish">{/* … */}<SwishFields /></Card>;',
	"}",
	"",
	"export function Invoice() {",
	'\treturn <Card action="Send the invoice">{/* … */}<InvoiceFields /></Card>;',
	"}",
	"",
	"export function Empty() {",
	'\treturn <Card action="See the timetable"><Masthead /><Nothing /></Card>;',
	"}",
];

const HELPER: readonly string[] = [
	"",
	"// pulled out of Swish, because that render was getting long",
	"export function SwishFields() {",
	'\treturn <Field label="Mobile number" value="070 123 45 67" />;',
	"}",
];

export default function FilesExportFrame() {
	const [helper, setHelper] = useState(false);
	const [picked, setPicked] = useState<string>("card");
	const set: { id: string; label: string; real: boolean }[] = VARIATIONS.map((variation) => ({
		id: variation.id as string,
		label: variation.label,
		real: true,
	}));
	if (helper) set.push({ id: "helper", label: "SwishFields", real: false });
	const current = set.find((entry) => entry.id === picked) ?? set[0]!;

	const nodes: readonly DiskNode[] = [
		{ id: "dir", name: "checkout/", depth: 0, kind: "dir" },
		{ id: "frame", name: "frame.tsx", depth: 1, kind: "entry", note: `1 default · ${set.length - 1} named` },
		{ id: "json", name: "frame.json", depth: 1, kind: "sidecar", note: "360 × 620" },
	];

	return (
		<DiskSplit
			left={
				<>
					<Disk path="design/frames/booking/">
						{nodes.map((node) => (
							<DiskRow key={node.id} node={node} active={node.id === "frame"} />
						))}
					</Disk>
					<div className="flex min-h-0 flex-1 flex-col gap-4 px-4 pt-4 pb-5">
						<Code
							file="checkout/frame.tsx"
							lines={helper ? [...HEAD, ...HELPER] : HEAD}
							mark={helper ? [18, 19, 20, 21, 22] : []}
							className="shrink-0"
						/>
						<Rule>
							The default export is the frame. Every other export is a variation of it, named by the function.
						</Rule>
						<button
							type="button"
							onClick={() => {
								setHelper((was) => !was);
								setPicked("card");
							}}
							className={cn(
								"flex h-8 w-fit items-center rounded-sm border px-3 font-mono text-xs leading-xs transition-colors",
								helper
									? "border-thread/60 text-text"
									: "border-border-raised text-muted hover:border-thread hover:text-text",
							)}
						>
							{helper ? "take the helper back out" : "pull SwishFields out into its own function"}
						</button>
						<div className="flex-1" />
					</div>
				</>
			}
			right={
				<div className="flex h-full flex-col items-center justify-center gap-6">
					<div className="flex items-center gap-2 font-mono text-2xs text-muted leading-3">
						<StackIcon className={cn("h-3 w-3", helper ? "text-thread" : "text-thread")} />
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
									{current.real ? (
										<Scaled scale={FIELD_SCALE}>
											<TvarsoCheckout variation={current.id as "card"} />
										</Scaled>
									) : (
										<Scaled scale={FIELD_SCALE}>
											<div
												className="flex flex-col px-6 pt-6 font-[Instrument_Sans] antialiased"
												style={{ width: CARD_W, height: CARD_H, background: "#FBFBF9" }}
											>
												<TvarsoOutlet variation="swish" />
											</div>
										</Scaled>
									)}
								</motion.div>
							</AnimatePresence>
						</div>
						<div className="pointer-events-none absolute -inset-[3px] rounded-[11px] border-[1.5px] border-thread" />
					</div>
					<div className="flex items-center gap-1.5">
						<AnimatePresence initial={false} mode="popLayout">
							{set.map((entry) => (
								<motion.button
									key={entry.id}
									type="button"
									layout
									initial={{ opacity: 0, scale: 0.9 }}
									animate={{ opacity: 1, scale: 1 }}
									exit={{ opacity: 0, scale: 0.9 }}
									transition={{ type: "spring", stiffness: 420, damping: 34 }}
									onClick={() => setPicked(entry.id)}
									className={cn(
										"rounded-xs px-2 py-1 font-mono text-2xs leading-3 transition-colors",
										entry.id === picked ? "bg-raised text-text" : "text-muted hover:text-text",
										!entry.real && "text-thread",
									)}
								>
									{entry.label}
								</motion.button>
							))}
						</AnimatePresence>
					</div>
					<span className="max-w-[440px] text-center text-base text-muted/70 leading-base">
						{helper
							? "A helper is a named export too. The canvas cannot tell the difference, so half a card is now the fifth variation."
							: "One file holds the whole set, and an agent adds to it by adding a function."}
					</span>
				</div>
			}
		/>
	);
}
