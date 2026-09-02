import { AnimatePresence, motion } from "motion/react";
import { useLayoutEffect, useRef, useState } from "react";
import { TvarsoCheckout, TvarsoOutlet, TvarsoShell, type VariationId } from "shared/ui/demo/tvarso-checkout";
import { Code, Disk, DiskRow, type DiskNode, DiskSplit, Rule } from "shared/ui/explore/variants/variants-code";
import { cn } from "shared/lib/utils";

/**
 * No shell file at all: the first variation is the shell, and the others are
 * written as what they change about it.
 *
 * A variation names the one it starts from and exports only the regions it
 * overrides. There is no second concept to learn — no outlet, no props type, no
 * list — and the diff is the file, so reading `swish.tsx` tells you exactly
 * what is different about Swish and nothing else.
 *
 * The catch is the arrow. Nothing stops a variation deriving from a derived
 * one, and then a change to the base walks through two files before it reaches
 * the card on screen, with no line in either of them saying so. Depth is the
 * thing this model has to be prepared to refuse.
 */

const ACTION: Readonly<Record<string, string>> = {
	card: "Pay 126 kr",
	swish: "Pay with Swish",
	invoice: "Send the invoice",
	voucher: "Pay 46 kr",
};

interface Node {
	readonly id: VariationId;
	readonly label: string;
	readonly from: VariationId | null;
	readonly overrides: readonly string[];
}

const TREE: readonly Node[] = [
	{ id: "card", label: "card", from: null, overrides: [] },
	{ id: "swish", label: "swish", from: "card", overrides: ["payment", "action"] },
	{ id: "invoice", label: "invoice", from: "card", overrides: ["payment", "action"] },
	{ id: "voucher", label: "voucher", from: "card", overrides: ["payment", "action"] },
	{ id: "empty", label: "empty", from: null, overrides: ["the whole card"] },
];

const SOURCE: Readonly<Record<string, readonly string[]>> = {
	card: [
		'import { Card, Lines, Masthead, Pay, Total, Trip } from "./parts";',
		"",
		"// the first variation is the shell. It knows nothing about the others.",
		"export default function Checkout() {",
		"\treturn (",
		'\t\t<Card action="Pay 126 kr">',
		"\t\t\t<Masthead />",
		"\t\t\t<Trip />",
		"\t\t\t<Lines />",
		"\t\t\t<Total />",
		"\t\t\t<region.payment>",
		"\t\t\t\t<CardFields />",
		"\t\t\t</region.payment>",
		"\t\t\t<Pay />",
		"\t\t</Card>",
		"\t);",
		"}",
	],
	swish: [
		'import { SwishFields } from "../parts/swish-fields";',
		"",
		'export const from = "card";',
		"",
		"// only what is different about Swish",
		"export const payment = <SwishFields />;",
		'export const action = "Pay with Swish";',
	],
	invoice: [
		'import { InvoiceFields } from "../parts/invoice-fields";',
		"",
		'export const from = "card";',
		"",
		"export const payment = <InvoiceFields />;",
		'export const action = "Send the invoice";',
	],
	voucher: [
		'import { VoucherFields } from "../parts/voucher-fields";',
		"",
		'export const from = "card";',
		"",
		"export const payment = <VoucherFields />;",
		'export const action = "Pay 46 kr";',
	],
	empty: [
		'import { Card, Masthead, Nothing } from "../parts";',
		"",
		"// nothing to start from: this one shares only the masthead",
		"export const from = null;",
		"",
		"export default function Empty() {",
		'\treturn <Card action="See the timetable"><Masthead /><Nothing /></Card>;',
		"}",
	],
};

export default function ShellDeriveFrame() {
	const [picked, setPicked] = useState<VariationId>("swish");
	const wrap = useRef<HTMLDivElement | null>(null);
	const outlet = useRef<HTMLDivElement | null>(null);
	const [box, setBox] = useState<{ top: number; height: number } | null>(null);
	const node = TREE.find((entry) => entry.id === picked) ?? TREE[0]!;
	const whole = picked === "empty";
	const base = picked === "card";

	useLayoutEffect(() => {
		const outer = wrap.current;
		const inner = outlet.current;
		if (outer === null || inner === null) return;
		const a = outer.getBoundingClientRect();
		const b = inner.getBoundingClientRect();
		setBox({ top: b.top - a.top, height: b.height });
	}, []);

	const nodes: readonly DiskNode[] = [
		{ id: "dir", name: "checkout/", depth: 0, kind: "dir" },
		{ id: "card", name: "frame.tsx", depth: 1, kind: "entry", note: "the first variation" },
		{ id: "variations", name: "variations/", depth: 1, kind: "dir", note: "4" },
		...TREE.filter((entry) => entry.id !== "card").map((entry) => ({
			id: entry.id,
			name: `${entry.id}.tsx`,
			depth: 2,
			kind: "file" as const,
			note: entry.from === null ? "from: none" : `from: ${entry.from}`,
		})),
	];

	return (
		<DiskSplit
			width={600}
			name="shell--derive"
			argues="No shell file: the first candidate is the shell, and the others are diffs over it."
			left={
				<>
					<Disk path="design/frames/booking/">
						{nodes.map((entry) => (
							<DiskRow
								key={entry.id}
								node={entry}
								active={entry.id === picked}
								onPick={entry.kind === "dir" ? undefined : () => setPicked(entry.id as VariationId)}
							/>
						))}
					</Disk>
					<div className="flex min-h-0 flex-1 flex-col gap-3.5 px-4 pt-4 pb-5">
						<Code
							file={`checkout/${picked === "card" ? "frame.tsx" : `variations/${picked}.tsx`}`}
							lines={SOURCE[picked] ?? []}
							mark={base ? [10, 11, 12] : whole ? [3] : [2]}
							hot={base ? ["region.payment"] : []}
							className="shrink-0"
						/>
						<Rule>
							A variation is a diff. It names what it starts from and exports the regions it replaces, so the file is
							exactly as long as the difference is.
						</Rule>
						<div className="flex-1" />
					</div>
				</>
			}
			right={
				<div className="flex h-full items-center justify-center gap-10">
					<div ref={wrap} className="relative shrink-0">
						<AnimatePresence initial={false} mode="popLayout">
							{whole ? (
								<motion.div key="whole" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
									<TvarsoCheckout variation="empty" />
								</motion.div>
							) : (
								<motion.div key="shell" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
									<TvarsoShell outletRef={outlet} action={ACTION[picked] ?? "Pay 126 kr"}>
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
								</motion.div>
							)}
						</AnimatePresence>
						{base ? null : (
							<motion.div
								className="pointer-events-none absolute inset-x-0 rounded-[10px] border border-dashed border-thread/70"
								initial={false}
								animate={
									whole
										? { top: 0, height: 620 }
										: { top: box?.top ?? 300, height: box?.height ?? 208 }
								}
								transition={{ type: "spring", stiffness: 380, damping: 36 }}
							>
								{/* the label sits inside the region, because the only space beside the
								    card belongs to the chain */}
								<span className="absolute top-2.5 right-3 whitespace-nowrap font-mono text-2xs text-thread leading-3">
									{whole ? "shares only the masthead" : `overridden by ${node.label}`}
								</span>
							</motion.div>
						)}
					</div>

					{/* the chain, which is the thing this model actually adds */}
					<div className="flex w-[236px] shrink-0 flex-col gap-4">
						<span className="font-mono text-2xs text-muted/70 leading-3">what starts from what</span>
						<div className="flex flex-col gap-1">
							<ChainNode node={TREE[0]!} picked={picked} onPick={setPicked} depth={0} />
							{TREE.filter((entry) => entry.from === "card").map((entry) => (
								<ChainNode key={entry.id} node={entry} picked={picked} onPick={setPicked} depth={1} />
							))}
							<div className="h-3" />
							<ChainNode node={TREE[4]!} picked={picked} onPick={setPicked} depth={0} />
						</div>
						<p className="text-base text-muted/70 leading-base">
							{base
								? "Nothing points at the base, so a change here reaches every card that starts from it."
								: whole
									? "This one starts from nothing. It is a variation only because it is filed with the others."
									: `Two files make this card: ${node.from}, then ${node.label}.`}
						</p>
					</div>
				</div>
			}
		/>
	);
}

function ChainNode({
	node,
	picked,
	depth,
	onPick,
}: {
	node: Node;
	picked: VariationId;
	depth: number;
	onPick: (id: VariationId) => void;
}) {
	const on = node.id === picked;
	return (
		<button
			type="button"
			onClick={() => onPick(node.id)}
			className={cn(
				"relative flex h-8 items-center gap-2 rounded-sm pr-2 text-left transition-colors",
				on ? "bg-surface" : "hover:bg-surface/60",
			)}
			style={{ paddingLeft: 10 + depth * 22 }}
		>
			{depth > 0 ? (
				<>
					<span className="absolute w-px bg-border-raised" style={{ left: 16, top: -4, bottom: 16 }} />
					<span className="absolute h-px w-3 bg-border-raised" style={{ left: 16, top: 16 }} />
				</>
			) : null}
			<span
				className={cn(
					"h-1.5 w-1.5 shrink-0 rounded-full",
					on ? "bg-thread" : node.from === null ? "bg-muted/70" : "bg-border-raised",
				)}
			/>
			<span className={cn("font-mono text-xs leading-xs", on ? "text-text" : "text-muted")}>{node.label}</span>
			{node.overrides.length === 0 ? null : (
				<span className="ml-auto font-mono text-2xs text-muted/45 leading-3">{node.overrides.join(" · ")}</span>
			)}
		</button>
	);
}
