import { AnimatePresence, motion } from "motion/react";
import type { FrameNode } from "../lib/explorer-tree";
import { cn } from "../lib/utils";

/**
 * What a frame looks like on the explorer's field, and the wireframes inside it.
 *
 * Its own file because three surfaces draw the same still: the field, a page
 * drawn as a stack of its frames, and the groups a page shows of what is below
 * it. Wireframes rather than a borrowed product — what matters is that a name in
 * the tree has a body on the field.
 */

export const STILL_W = 160;
export const STILL_H = 346;

export function Still({
	node,
	lit,
	threaded,
	flash,
}: {
	node: FrameNode;
	lit: boolean;
	threaded: boolean;
	flash: number | null;
}) {
	return (
		<div className="relative flex flex-col gap-1.5" style={{ width: STILL_W }}>
			{threaded ? (
				<svg
					className="pointer-events-none absolute top-1/2 -left-11 h-3 w-11"
					viewBox="0 0 44 12"
					fill="none"
					aria-hidden="true"
				>
					<path d="M1 6h34" stroke="var(--color-thread)" strokeWidth="1.5" />
					<path d="m43 6-9-5v10Z" fill="var(--color-thread)" />
				</svg>
			) : null}

			<div className="flex min-w-0 items-center gap-1.5 font-mono text-xs leading-4">
				<span className={cn("min-w-0 truncate", lit ? "text-thread" : "text-muted")}>{node.name}</span>
				{lit ? (
					<span className="ml-auto flex shrink-0 items-center gap-1 font-mono text-2xs text-muted leading-3">
						<svg viewBox="0 0 10 10" className="h-2 w-2" fill="currentColor" aria-hidden="true">
							<path d="M2 1.2 8.4 5 2 8.8Z" />
						</svg>
						play
					</span>
				) : null}
			</div>

			<div className="relative" style={{ height: STILL_H }}>
				<FrameCover node={node} />
				{lit ? <Selection /> : null}
				<AnimatePresence>
					{flash === null ? null : (
						<motion.span
							key={flash}
							className="pointer-events-none absolute -inset-[3px] rounded-[9px] border-[1.5px] border-thread"
							initial={{ opacity: 0 }}
							animate={{ opacity: [0, 1, 0.15, 1, 0] }}
							exit={{ opacity: 0 }}
							transition={{ duration: 0.85, times: [0, 0.1, 0.32, 0.46, 1], ease: "easeOut" }}
						/>
					)}
				</AnimatePresence>
			</div>
		</div>
	);
}

/** the frame's body alone: the bordered box and the wire inside it */
export function FrameCover({ node, className }: { node: FrameNode; className?: string }) {
	return (
		<div className={cn("h-full w-full overflow-hidden rounded-[6px] border border-border bg-bg", className)}>
			{node.entry === "term.tsx" ? <TerminalWire /> : <ScreenWire seed={hash(node.name)} />}
		</div>
	);
}

function Selection() {
	return (
		<>
			<div className="pointer-events-none absolute -inset-[3px] rounded-[9px] border-[1.5px] border-thread" />
			{["-left-[6px] -top-[6px]", "-right-[6px] -top-[6px]", "-bottom-[6px] -left-[6px]", "-right-[6px] -bottom-[6px]"].map(
				(spot) => (
					<span
						key={spot}
						className={cn("absolute h-[7px] w-[7px] rounded-[1.5px] border-[1.5px] border-thread bg-on-thread", spot)}
					/>
				),
			)}
			<div className="-translate-x-1/2 absolute top-[calc(100%+6px)] left-1/2 rounded-xs bg-thread px-1.5 py-[2px] font-mono text-2xs text-on-thread leading-3">
				390 × 844
			</div>
		</>
	);
}

/** a quiet product screen at thumbnail size: enough structure to read as a frame */
export function ScreenWire({ seed }: { seed: number }) {
	const hero = 48 + (seed % 3) * 22;
	const rows = 3 + (seed % 4);
	const grid = seed % 2 === 0;
	return (
		<div className="flex h-full flex-col gap-2 p-2.5">
			<div className="flex items-center gap-1.5">
				<span className="h-3 w-3 rounded-[3px] bg-raised" />
				<span className="h-1.5 w-8 rounded-full bg-surface" />
				<span className="ml-auto h-1.5 w-5 rounded-full bg-surface" />
			</div>
			<div className="w-full rounded-[4px] bg-surface" style={{ height: hero }} />
			{grid ? (
				<div className="grid grid-cols-2 gap-1.5">
					<span className="h-10 rounded-[4px] bg-surface" />
					<span className="h-10 rounded-[4px] bg-surface" />
				</div>
			) : null}
			<div className="flex flex-col gap-1.5">
				{Array.from({ length: rows }, (_, index) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: a skeleton line has no identity
					<span key={index} className="h-1.5 rounded-full bg-raised" style={{ width: `${92 - index * 9}%` }} />
				))}
			</div>
			<div className="mt-auto h-6 w-full rounded-[4px] bg-raised" />
		</div>
	);
}

/** a term frame draws as the static surface spool gives it: source, not a session */
export function TerminalWire() {
	return (
		<div className="flex h-full flex-col gap-1.5 bg-canvas p-2.5 font-mono text-2xs leading-3">
			<span className="text-muted/70">~/atlas</span>
			<span className="text-muted/50">$ spool serve</span>
			<span className="text-muted/30">listening on 7767</span>
			<span className="mt-auto text-muted/30">term.tsx · disabled</span>
		</div>
	);
}

export function hash(name: string): number {
	let total = 0;
	for (const letter of name) total = (total * 31 + letter.charCodeAt(0)) % 9973;
	return total;
}
