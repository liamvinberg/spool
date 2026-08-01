import { AnimatePresence, motion } from "motion/react";
import type { FrameNode } from "../lib/explorer-tree";
import { cn } from "../lib/utils";

/**
 * The field behind the explorer: the active page's frames, drawn small.
 *
 * It exists so the rail has somewhere to point — selecting a frame lights it
 * here, and "Reveal on canvas" blinks it. The stills are wireframes rather than
 * a borrowed product: what matters is that a name in the tree has a body on the
 * field.
 */

const STILL_W = 160;
const STILL_H = 346;

export function ExplorerCanvas({
	label,
	path,
	frames,
	selected,
	revealed,
}: {
	label: string;
	path: string;
	frames: readonly FrameNode[];
	selected: readonly string[];
	revealed: { name: string; token: number } | null;
}) {
	return (
		<div className="absolute inset-0 overflow-hidden">
			<div className="absolute top-5 left-6 flex items-baseline gap-2 font-mono text-2xs text-muted/55 leading-3">
				<span className="text-muted">{path === "" ? label : `${path}`}</span>
				<span>
					{frames.length} {frames.length === 1 ? "frame" : "frames"}
				</span>
			</div>

			{frames.length === 0 ? (
				<div className="absolute inset-0 flex items-center justify-center font-mono text-2xs text-muted/45 leading-3">
					no frames yet
				</div>
			) : (
				<div
					className={cn(
						"flex h-full flex-wrap content-center items-start justify-center gap-x-10 gap-y-8 px-10",
						frames.length > 6 && "scale-[0.72]",
					)}
				>
					{frames.map((node, index) => (
						<Still
							key={node.id}
							node={node}
							lit={selected.includes(node.id)}
							threaded={index === 1}
							flash={revealed !== null && revealed.name === node.name ? revealed.token : null}
						/>
					))}
				</div>
			)}
		</div>
	);
}

function Still({
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
				<div className="h-full w-full overflow-hidden rounded-[6px] border border-border bg-bg">
					{node.entry === "term.tsx" ? <TerminalWire /> : <ScreenWire seed={hash(node.name)} />}
				</div>
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
function ScreenWire({ seed }: { seed: number }) {
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
function TerminalWire() {
	return (
		<div className="flex h-full flex-col gap-1.5 bg-canvas p-2.5 font-mono text-2xs leading-3">
			<span className="text-muted/70">~/atlas</span>
			<span className="text-muted/50">$ spool serve</span>
			<span className="text-muted/30">listening on 7767</span>
			<span className="mt-auto text-muted/30">term.tsx · disabled</span>
		</div>
	);
}

function hash(name: string): number {
	let total = 0;
	for (const letter of name) total = (total * 31 + letter.charCodeAt(0)) % 9973;
	return total;
}
