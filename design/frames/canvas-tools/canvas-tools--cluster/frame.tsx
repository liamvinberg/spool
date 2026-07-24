import { AnimatePresence, motion } from "motion/react";
import { cn } from "../../../shared/lib/utils";
import { MockCanvas, type ToolMeta, TOOLS, type ToolState, useToolState } from "../../../shared/ui/canvas-tools";
import { SpoolShell } from "../../../shared/ui/spool-shell";

/**
 * Canvas tools — minimal corner cluster. The smallest possible footprint: a bare
 * vertical stack of three glyphs in the bottom-right, keys shown small and always,
 * full label flyouts only on hover. Keyboard-first — V, H, and hold-Cmd carry the
 * work. The Cmd-transient surfaces as a ⌘ chip above the stack and a dashed thread
 * ring on select; the committed tool keeps its thread edge marker so you can see it
 * did not move.
 */
export default function CanvasToolsCluster() {
	const state = useToolState();
	const { setTool, transient, tool } = state;

	return (
		<SpoolShell activeTab="opencode" tabs={["opencode", "kaffe"]} zoom="100%" showCanvasControls={false}>
			<div className="relative h-full w-full">
				<MockCanvas state={state} />

				<div className="absolute right-4 bottom-4 flex flex-col items-end gap-1.5">
					<AnimatePresence>
						{transient === "select" && tool === "interact" ? (
							<motion.span
								key="cmd"
								initial={{ opacity: 0, y: 3 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0, y: 3 }}
								transition={{ duration: 0.12 }}
								className="flex items-center gap-1 rounded-[3px] border border-thread/50 bg-bg/90 px-1.5 py-0.5 font-mono text-2xs text-thread leading-3 backdrop-blur"
							>
								⌘ select
							</motion.span>
						) : null}
					</AnimatePresence>

					<div className="flex flex-col gap-0.5 rounded-lg border border-border bg-bg/80 p-1 backdrop-blur">
						{TOOLS.map((meta) => (
							<ClusterTool key={meta.id} meta={meta} state={state} onSelect={() => setTool(meta.id)} />
						))}
					</div>
				</div>
			</div>
		</SpoolShell>
	);
}

function ClusterTool({ meta, state, onSelect }: { meta: ToolMeta; state: ToolState; onSelect: () => void }) {
	const { tool, transient } = state;
	const committed = tool === meta.id;
	const borrowed = transient === meta.id;

	return (
		<button
			type="button"
			onClick={onSelect}
			aria-label={meta.label}
			className={cn(
				"group relative flex h-8 w-8 items-center justify-center rounded-md transition-colors",
				committed ? "bg-raised text-text" : "text-muted hover:bg-surface hover:text-text",
			)}
		>
			{committed ? <span className="absolute inset-y-1.5 -left-[3px] w-[2px] rounded-full bg-thread" /> : null}
			{borrowed ? (
				<span className="pointer-events-none absolute inset-0 rounded-md border border-thread border-dashed" />
			) : null}
			<meta.Icon className={cn("h-4 w-4", borrowed && "text-thread")} />

			{/* always-on key hint, faint, bottom-right of the glyph */}
			{meta.key ? (
				<span className="absolute right-0.5 bottom-0 font-mono text-[8px] text-muted/50 leading-none">{meta.key}</span>
			) : null}

			{/* full label flyout on hover, to the left */}
			<span className="pointer-events-none absolute right-10 flex items-center gap-1.5 whitespace-nowrap rounded-md border border-border-raised bg-bg px-2 py-1 font-mono text-2xs text-muted leading-3 opacity-0 transition-opacity group-hover:opacity-100">
				{meta.label}
				{meta.key ? (
					<span className="flex h-4 min-w-4 items-center justify-center rounded-[3px] border border-border-raised bg-surface px-1 text-[9px] text-muted">
						{meta.key}
					</span>
				) : null}
			</span>
		</button>
	);
}
