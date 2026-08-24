import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { TvarsoCheckout, TvarsoOutlet, TvarsoShell, VARIATIONS, type VariationId } from "../../../shared/ui/tvarso-checkout";
import { Code, Disk, DiskRow, type DiskNode, DiskSplit, Rule } from "../../../shared/ui/variants-code";
import { cn } from "../../../shared/lib/utils";

/**
 * No outlet, no second file, no new idea: the frame takes props, and a
 * variation is a set of them.
 *
 * It is the model with the smallest surface. There is one component, one place
 * the layout lives, and the canvas can offer a control per prop rather than a
 * list of names, so a set of variations is a cross product rather than a list
 * somebody typed out.
 *
 * The bill arrives with the fourth one. Nothing booked yet is not a value of
 * anything: it is the absence of the trip, the lines and the total, so the
 * shell grows a branch, and the branch is marked in the source here. Every
 * variation that does not fit the props somebody imagined adds another one, and
 * the shell slowly turns into four components in a trench coat.
 */

const PROPS: Readonly<Record<string, readonly [string, string][]>> = {
	card: [
		["method", '"card"'],
		["remember", "true"],
	],
	swish: [
		["method", '"swish"'],
		["qr", "true"],
	],
	invoice: [
		["method", '"invoice"'],
		["terms", "30"],
	],
	empty: [["empty", "true"]],
};

const LIST: readonly string[] = [
	'import Checkout from "./frame";',
	"",
	"export const variations = [",
	'\t{ name: "card", props: { method: "card", remember: true } },',
	'\t{ name: "swish", props: { method: "swish", qr: true } },',
	'\t{ name: "invoice", props: { method: "invoice", terms: 30 } },',
	'\t{ name: "empty", props: { empty: true } },',
	"];",
];

const SHELL: readonly string[] = [
	"export default function Checkout(props: Props) {",
	"\t// the fourth variation is not a value, so it is an early return",
	"\tif (props.empty === true) return <Nothing />;",
	"\treturn (",
	"\t\t<Card action={actionOf(props)}>",
	"\t\t\t<Masthead />",
	"\t\t\t<Trip />",
	"\t\t\t<Lines />",
	"\t\t\t<Total />",
	"\t\t\t<Fields method={props.method} />",
	"\t\t</Card>",
	"\t);",
	"}",
];

export default function ShellPropsFrame() {
	const [picked, setPicked] = useState<VariationId>("card");
	const whole = picked === "empty";
	const rows = PROPS[picked] ?? [];

	const nodes: readonly DiskNode[] = [
		{ id: "dir", name: "checkout/", depth: 0, kind: "dir" },
		{ id: "frame", name: "frame.tsx", depth: 1, kind: "entry", note: "takes props" },
		{ id: "json", name: "frame.json", depth: 1, kind: "sidecar", note: "360 × 620" },
		{ id: "list", name: "variations.ts", depth: 1, kind: "file", note: "4 prop sets" },
	];

	return (
		<DiskSplit
			width={600}
			name="shell--props"
			argues="The frame takes props and a candidate is only data, until one of them needs a branch."
			left={
				<>
					<Disk path="design/frames/booking/">
						{nodes.map((node) => (
							<DiskRow key={node.id} node={node} active={node.id === "list"} />
						))}
					</Disk>
					<div className="flex min-h-0 flex-1 flex-col gap-3.5 px-4 pt-4 pb-5">
						<Code
							file="checkout/variations.ts"
							lines={LIST}
							mark={[3 + VARIATIONS.findIndex((variation) => variation.id === picked)]}
							className="shrink-0"
						/>
						<Code file="checkout/frame.tsx" lines={SHELL} mark={whole ? [1, 2] : []} className="shrink-0" />
						<Rule>
							Three files became none. What a variation can be is now exactly what the props allow, and the fourth one
							needed a branch.
						</Rule>
						<div className="flex-1" />
					</div>
				</>
			}
			right={
				<div className="flex h-full flex-col items-center justify-center gap-7">
					<div className="flex items-start gap-7">
						<AnimatePresence initial={false} mode="wait">
							<motion.div
								key={whole ? "whole" : "shell"}
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								exit={{ opacity: 0 }}
								transition={{ duration: 0.16 }}
							>
								{whole ? (
									<TvarsoCheckout variation="empty" />
								) : (
									<TvarsoShell action={picked === "swish" ? "Pay with Swish" : picked === "invoice" ? "Send the invoice" : "Pay 126 kr"}>
										<AnimatePresence initial={false}>
											<motion.div
												key={picked}
												className="absolute inset-x-6 top-4"
												initial={{ opacity: 0, y: 6 }}
												animate={{ opacity: 1, y: 0 }}
												exit={{ opacity: 0, y: -6 }}
												transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
											>
												<TvarsoOutlet variation={picked as "card"} />
											</motion.div>
										</AnimatePresence>
									</TvarsoShell>
								)}
							</motion.div>
						</AnimatePresence>

						{/* what the canvas would offer instead of a list of names */}
						<div className="flex w-[212px] flex-col rounded-md border border-border bg-bg">
							<div className="flex h-8 items-center border-border border-b px-3">
								<span className="font-mono text-2xs text-muted/70 leading-3">props</span>
							</div>
							<div className="flex flex-col py-1.5">
								{rows.map(([key, value]) => (
									<motion.div
										key={key}
										layout
										initial={{ opacity: 0 }}
										animate={{ opacity: 1 }}
										className="flex h-7 items-center justify-between px-3"
									>
										<span className={cn("font-mono text-xs leading-xs", whole ? "text-thread" : "text-muted")}>
											{key}
										</span>
										<span className="font-mono text-xs text-text/80 leading-xs">{value}</span>
									</motion.div>
								))}
							</div>
						</div>
					</div>

					<div className="flex items-center gap-1.5">
						{VARIATIONS.map((variation) => (
							<button
								key={variation.id}
								type="button"
								onClick={() => setPicked(variation.id)}
								className={cn(
									"rounded-xs px-2 py-1 font-mono text-2xs leading-3 transition-colors",
									variation.id === picked ? "bg-raised text-text" : "text-muted hover:text-text",
								)}
							>
								{variation.label}
							</button>
						))}
					</div>
					<span className="max-w-[440px] text-center text-base text-muted/70 leading-base">
						{whole
							? "empty is not a value of method. It is the absence of three quarters of the card, so the shell had to branch on it."
							: "One component, one layout, and a variation that is only data. The canvas could edit these instead of listing names."}
					</span>
				</div>
			}
		/>
	);
}
