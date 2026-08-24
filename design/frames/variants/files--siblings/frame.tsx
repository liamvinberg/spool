import { motion } from "motion/react";
import { useState } from "react";
import { Scaled, TvarsoCheckout, VARIATIONS } from "../../../shared/ui/tvarso-checkout";
import { Disk, DiskRow, type DiskNode, DiskSplit, Rule } from "../../../shared/ui/variants-code";
import { cn } from "../../../shared/lib/utils";

/**
 * Today's convention, promoted to a relationship.
 *
 * Nothing moves on disk: four sibling folders, each a complete frame with its
 * own entry and its own sidecar, and spool infers the set from the names. The
 * whole feature is one rule in the projection — everything before `--` is the
 * stem, frames sharing a stem are a set — and every verb, URL, walk target and
 * geometry file keeps working exactly as it does now.
 *
 * Then press rename. The relationship lives in a string, so renaming the base
 * leaves three folders naming a frame that no longer exists, and spool has to
 * choose between silently regrouping them under a stem with no base and
 * silently dropping the relationship. Neither is a good answer, and that is
 * this model's whole bill.
 */

const SCALE = 0.3;
const W = 108;
const H = 186;

export default function FilesSiblingsFrame() {
	const [renamed, setRenamed] = useState(false);
	const stem = renamed ? "basket" : "checkout";

	const nodes: readonly DiskNode[] = [
		{ id: "base", name: `${stem}/`, depth: 0, kind: "dir", note: "frame.tsx · frame.json" },
		...VARIATIONS.filter((variation) => variation.id !== "card").map((variation) => ({
			id: variation.id,
			name: `${variation.frame}/`,
			depth: 0,
			kind: "dir" as const,
			note: renamed ? "no base" : "frame.tsx · frame.json",
		})),
		{ id: "timetable", name: "timetable/", depth: 0, kind: "dir" },
		{ id: "ticket", name: "ticket/", depth: 0, kind: "dir" },
	];

	return (
		<DiskSplit
			name="files--siblings"
			argues="Today's -- names promoted to a relationship. Rename the base and watch it break."
			left={
				<>
					<Disk path="design/frames/booking/">
						{nodes.map((node) => (
							<DiskRow key={node.id} node={node} />
						))}
					</Disk>
					<div className="flex min-h-0 flex-1 flex-col gap-4 px-4 pt-5 pb-5">
						<Rule>
							Frames whose names share a stem are one set. The stem is everything before{" "}
							<span className="font-mono text-text">--</span>, which is the convention this repo already writes by
							hand, so the feature is a rule in the projection and not a byte on disk.
						</Rule>
						<div className="flex flex-col gap-2 rounded-md border border-border bg-canvas p-4">
							<span className="font-mono text-2xs text-muted/70 leading-3">what it costs, per variation</span>
							{[
								"its own frame.json, so four positions for one idea",
								"its own thumbnail, its own boot, its own walk target",
								"a name that repeats the stem in every row of the rail",
							].map((cost) => (
								<span key={cost} className="font-mono text-xs text-muted leading-[19px]">
									{cost}
								</span>
							))}
						</div>
						<button
							type="button"
							onClick={() => setRenamed((was) => !was)}
							className={cn(
								"flex h-8 w-fit items-center rounded-sm border px-3 font-mono text-xs leading-xs transition-colors",
								renamed
									? "border-thread/60 text-text"
									: "border-border-raised text-muted hover:border-thread hover:text-text",
							)}
						>
							{renamed ? "rename basket → checkout" : "rename checkout → basket"}
						</button>
						<div className="flex-1" />
					</div>
				</>
			}
			right={
				<div className="flex h-full flex-col items-center justify-center gap-7">
					<motion.div
						layout
						className={cn(
							"relative rounded-lg border p-6 transition-colors",
							renamed ? "border-transparent" : "border-border-raised",
						)}
					>
						{renamed ? null : (
							<span className="absolute -top-2 left-5 bg-canvas px-1.5 font-mono text-2xs text-muted leading-3">
								checkout · 4
							</span>
						)}
						<div className="grid grid-cols-2 gap-x-7 gap-y-6">
							{VARIATIONS.map((variation) => {
								const base = variation.id === "card";
								const orphan = renamed && !base;
								return (
									<motion.div key={variation.id} layout className="flex flex-col gap-1.5">
										<span
											className={cn(
												"font-mono text-2xs leading-3",
												base ? "text-text" : orphan ? "text-thread" : "text-muted",
											)}
										>
											{base ? `${stem}` : variation.frame}
										</span>
										<motion.div
											layout
											animate={{ opacity: orphan ? 0.5 : 1 }}
											className="overflow-hidden rounded-[6px]"
											style={{ width: W, height: H }}
										>
											<Scaled scale={SCALE}>
												<TvarsoCheckout variation={variation.id} />
											</Scaled>
										</motion.div>
									</motion.div>
								);
							})}
						</div>
					</motion.div>
					<motion.span layout className="max-w-[440px] text-center text-base text-muted/70 leading-base">
						{renamed
							? "Three folders now name a frame nothing answers to. The set was a string, and the string was edited."
							: "Four frames, four folders, four sidecars. The set exists because the names line up."}
					</motion.span>
				</div>
			}
		/>
	);
}
