import { AnimatePresence, motion } from "motion/react";
import { cn } from "../../../shared/lib/utils";
import { MockCanvas, type ToolMeta, TOOLS, type ToolState, useToolState } from "../../../shared/ui/canvas-tools";
import { SpoolShell } from "../../../shared/ui/spool-shell";

/**
 * Canvas tools — floating pill, bottom-center. A detached Figma-style toolbar over
 * the canvas: three icon tools, the committed one lit. The Cmd-transient reads as
 * a borrow: while Cmd is held the select tool takes a dashed thread ring and a ⌘
 * badge, the committed tool keeps a quiet holding dot, and a caption names the
 * borrow. Release and it snaps back — no tool switch happened.
 */
export default function CanvasToolsPill() {
	const state = useToolState();
	const { tool, setTool, transient } = state;

	return (
		<SpoolShell activeTab="opencode" tabs={["opencode", "kaffe"]} zoom="100%" showCanvasControls={false}>
			<div className="relative h-full w-full">
				<MockCanvas state={state} />

				<div className="pointer-events-none absolute inset-x-0 bottom-6 flex flex-col items-center gap-2.5">
					<AnimatePresence>
						{transient === "select" && tool === "interact" ? (
							<motion.div
								key="cap"
								initial={{ opacity: 0, y: 4 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0, y: 4 }}
								transition={{ duration: 0.14, ease: [0.23, 1, 0.32, 1] }}
								className="pointer-events-none flex items-center gap-1.5 rounded-full border border-border-raised bg-bg/90 px-2.5 py-1 font-mono text-2xs text-muted leading-3 backdrop-blur"
							>
								<Kbd>⌘</Kbd>
								<span>borrowing select while held</span>
							</motion.div>
						) : null}
					</AnimatePresence>

					<div className="pointer-events-auto flex items-center gap-0.5 rounded-lg border border-border-raised bg-bg/90 p-1 backdrop-blur">
						{TOOLS.map((meta) => (
							<PillTool key={meta.id} meta={meta} state={state} onSelect={() => setTool(meta.id)} />
						))}
					</div>
				</div>
			</div>
		</SpoolShell>
	);
}

function PillTool({ meta, state, onSelect }: { meta: ToolMeta; state: ToolState; onSelect: () => void }) {
	const { tool, transient } = state;
	const committed = tool === meta.id;
	const borrowed = transient === meta.id;
	const holding = committed && transient !== null && !borrowed;

	return (
		<button
			type="button"
			onClick={onSelect}
			aria-label={meta.label}
			className={cn(
				"group relative flex h-9 w-9 items-center justify-center rounded-md transition-colors",
				borrowed
					? "text-thread"
					: committed
						? "bg-raised text-text"
						: "text-muted hover:bg-surface hover:text-text",
			)}
		>
			{borrowed ? (
				<motion.span
					layoutId="borrow-ring"
					className="pointer-events-none absolute inset-0 rounded-md border border-thread border-dashed"
				/>
			) : null}
			{holding ? (
				<span className="pointer-events-none absolute inset-x-2.5 bottom-1 h-[2px] rounded-full bg-muted/60" />
			) : null}
			<meta.Icon className="h-[18px] w-[18px]" />
			{borrowed ? (
				<span className="absolute -right-1 -top-1 flex h-3.5 items-center rounded-full bg-thread px-1 font-mono text-[8px] text-on-thread leading-none">
					⌘
				</span>
			) : null}

			<span className="pointer-events-none absolute -top-8 flex items-center gap-1.5 whitespace-nowrap rounded-md border border-border-raised bg-bg px-2 py-1 font-mono text-2xs text-muted leading-3 opacity-0 transition-opacity group-hover:opacity-100">
				{meta.label}
				{meta.key ? <Kbd>{meta.key}</Kbd> : null}
			</span>
		</button>
	);
}

function Kbd({ children }: { children: React.ReactNode }) {
	return (
		<span className="flex h-4 min-w-4 items-center justify-center rounded-[3px] border border-border-raised bg-surface px-1 font-mono text-[9px] text-muted leading-none">
			{children}
		</span>
	);
}
