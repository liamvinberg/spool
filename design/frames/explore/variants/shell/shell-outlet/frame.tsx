import { AnimatePresence, motion } from "motion/react";
import { useLayoutEffect, useRef, useState } from "react";
import { TvarsoCheckout, TvarsoOutlet, TvarsoShell, VARIATIONS, type VariationId } from "shared/ui/demo/tvarso-checkout";
import { Code, Disk, DiskRow, type DiskNode, DiskSplit, Rule } from "shared/ui/explore/variants/variants-code";
import { cn } from "shared/lib/utils";

/**
 * The shell owns everything the four have in common, and the variations fill
 * one hole in it.
 *
 * The card is drawn here at its own size, so the thing this lane is about can
 * actually be judged: switch between card, Swish and invoice and the masthead,
 * the departure, the lines, the total, the button and the small print do not
 * move by a pixel, because they are not re-rendered — only what is inside
 * `<Outlet />` is. The region outlines itself for a moment when it changes, so
 * you can see that the change was contained.
 *
 * Then press empty. Nothing booked yet has no trip, no lines and no total, so
 * it cannot be a fill: its file opts out and renders the whole frame, and the
 * outline covers everything. A shell model has to have that door, and the door
 * is most of what makes it complicated.
 */

const ACTION: Readonly<Record<string, string>> = {
	card: "Pay 126 kr",
	swish: "Pay with Swish",
	invoice: "Send the invoice",
};

const SHELL: readonly string[] = [
	'import { Outlet } from "spool";',
	'import { Card, Lines, Masthead, Pay, Total, Trip } from "./parts";',
	"",
	"export default function Checkout() {",
	"\treturn (",
	"\t\t<Card>",
	"\t\t\t<Masthead />",
	"\t\t\t<Trip />",
	"\t\t\t<Lines />",
	"\t\t\t<Total />",
	"\t\t\t<Outlet />",
	"\t\t\t<Pay />",
	"\t\t</Card>",
	"\t);",
	"}",
];

const FILL: readonly string[] = [
	'import { SwishFields } from "../parts/swish-fields";',
	"",
	"// only what goes in the hole",
	"export default function Swish() {",
	"\treturn <SwishFields />;",
	"}",
	"",
	'export const action = "Pay with Swish";',
];

const OPT_OUT: readonly string[] = [
	'import { Card, Masthead, Nothing } from "../parts";',
	"",
	"// this one is not a fill: no trip, no lines, no total, no pay button",
	'export const replaces = "shell";',
	"",
	"export default function Empty() {",
	'\treturn <Card action="See the timetable"><Masthead /><Nothing /></Card>;',
	"}",
];

export default function ShellOutletFrame() {
	const [picked, setPicked] = useState<VariationId>("card");
	const wrap = useRef<HTMLDivElement | null>(null);
	const outlet = useRef<HTMLDivElement | null>(null);
	const [box, setBox] = useState<{ top: number; height: number } | null>(null);
	const whole = picked === "empty";

	useLayoutEffect(() => {
		const outer = wrap.current;
		const inner = outlet.current;
		if (outer === null || inner === null) {
			setBox(null);
			return;
		}
		const a = outer.getBoundingClientRect();
		const b = inner.getBoundingClientRect();
		setBox({ top: b.top - a.top, height: b.height });
	}, []);

	const nodes: readonly DiskNode[] = [
		{ id: "dir", name: "checkout/", depth: 0, kind: "dir" },
		{ id: "shell", name: "frame.tsx", depth: 1, kind: "entry", note: "the shell" },
		{ id: "parts", name: "parts/", depth: 1, kind: "dir" },
		{ id: "variations", name: "variations/", depth: 1, kind: "dir", note: "3" },
		{ id: "swish", name: "swish.tsx", depth: 2, kind: "file", note: "fills the outlet" },
		{ id: "invoice", name: "invoice.tsx", depth: 2, kind: "file", note: "fills the outlet" },
		{ id: "empty", name: "empty.tsx", depth: 2, kind: "file", note: "replaces the shell" },
	];

	return (
		<DiskSplit
			width={600}
			name="shell--outlet"
			argues="A shell with a hole in it. Switching candidates moves nothing outside the outline."
			left={
				<>
					<Disk path="design/frames/booking/">
						{nodes.map((node) => (
							<DiskRow
								key={node.id}
								node={node}
								active={node.id === (whole ? "empty" : "shell")}
								onPick={undefined}
							/>
						))}
					</Disk>
					<div className="flex min-h-0 flex-1 flex-col gap-3.5 px-4 pt-4 pb-5">
						<Code file="checkout/frame.tsx" lines={SHELL} mark={[10]} hot={["Outlet"]} className="shrink-0" />
						<Code
							file={whole ? "checkout/variations/empty.tsx" : "checkout/variations/swish.tsx"}
							lines={whole ? OPT_OUT : FILL}
							mark={whole ? [3] : [4]}
							className="shrink-0"
						/>
						<Rule>
							A variation renders what goes in the hole, and nothing else. One that cannot live in the hole says so in
							one line and takes the whole frame instead.
						</Rule>
						<div className="flex-1" />
					</div>
				</>
			}
			right={
				<div className="flex h-full flex-col items-center justify-center gap-7">
					<div ref={wrap} className="relative">
						<AnimatePresence initial={false} mode="popLayout">
							{whole ? (
								<motion.div
									key="whole"
									initial={{ opacity: 0 }}
									animate={{ opacity: 1 }}
									exit={{ opacity: 0 }}
									transition={{ duration: 0.18 }}
								>
									<TvarsoCheckout variation="empty" />
								</motion.div>
							) : (
								<motion.div
									key="shell"
									initial={{ opacity: 0 }}
									animate={{ opacity: 1 }}
									exit={{ opacity: 0 }}
									transition={{ duration: 0.18 }}
								>
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

						{/* what changed, drawn over the card rather than in it */}
						<motion.div
							className="pointer-events-none absolute inset-x-0 rounded-[10px] border border-dashed border-thread/70"
							initial={false}
							animate={
								whole
									? { top: 0, height: 620, opacity: 1 }
									: { top: box?.top ?? 300, height: box?.height ?? 208, opacity: 1 }
							}
							transition={{ type: "spring", stiffness: 380, damping: 36 }}
						>
							<span className="absolute top-0 left-full ml-3 whitespace-nowrap font-mono text-2xs text-thread leading-3">
								{whole ? "replaces the shell" : "outlet · 360 × 208"}
							</span>
						</motion.div>
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
					<span className="max-w-[420px] text-center text-base text-muted/70 leading-base">
						{whole
							? "Nothing above the outline is shared any more. This variation is a frame in its own right."
							: "Everything outside the outline is one component, rendered once. Only the hole is per variation."}
					</span>
				</div>
			}
		/>
	);
}
