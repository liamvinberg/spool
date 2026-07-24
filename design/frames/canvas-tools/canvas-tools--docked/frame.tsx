import { AnimatePresence, motion } from "motion/react";
import { cn } from "../../../shared/lib/utils";
import { MockCanvas, type ToolMeta, TOOLS, type ToolState, useToolState } from "../../../shared/ui/canvas-tools";
import { SpoolShell } from "../../../shared/ui/spool-shell";

/**
 * Canvas tools — docked in the top bar, exactly where the dead ModeControl chip
 * lived. A quiet segmented control that reads at home in the synthesis shell:
 * icon + inline key per tool, the committed one raised. The Cmd-transient shows
 * both states at once — the committed tool keeps its raised fill while a thread
 * underline slides under select and a ⌘ chip appears to the right, so the borrow
 * is legible without pretending the tool changed.
 */
export default function CanvasToolsDocked() {
	const state = useToolState();

	return (
		<SpoolShell
			activeTab="opencode"
			tabs={["opencode", "kaffe"]}
			showCanvasControls={false}
			headerAccessory={<DockedTools state={state} />}
		>
			<div className="relative h-full w-full">
				<MockCanvas state={state} />
			</div>
		</SpoolShell>
	);
}

function DockedTools({ state }: { state: ToolState }) {
	const { tool, setTool, transient } = state;
	return (
		<div className="flex items-center gap-3">
			<div className="flex items-center gap-[2px] rounded-md bg-surface p-[2px]">
				{TOOLS.map((meta) => (
					<Segment key={meta.id} meta={meta} state={state} onSelect={() => setTool(meta.id)} />
				))}
			</div>

			<div className="flex h-4 w-8 items-center">
				<AnimatePresence>
					{transient === "select" && tool === "interact" ? (
						<motion.span
							key="cmd"
							initial={{ opacity: 0, x: -3 }}
							animate={{ opacity: 1, x: 0 }}
							exit={{ opacity: 0, x: -3 }}
							transition={{ duration: 0.12 }}
							className="flex items-center gap-1 font-mono text-2xs text-thread leading-3"
						>
							⌘ select
						</motion.span>
					) : null}
				</AnimatePresence>
			</div>

			<span className="min-w-8 text-right font-mono text-muted text-xs leading-xs">100%</span>
		</div>
	);
}

function Segment({ meta, state, onSelect }: { meta: ToolMeta; state: ToolState; onSelect: () => void }) {
	const { tool, transient } = state;
	const committed = tool === meta.id;
	const borrowed = transient === meta.id;

	return (
		<button
			type="button"
			onClick={onSelect}
			aria-label={meta.label}
			title={`${meta.label}${meta.key ? ` (${meta.key})` : ""}`}
			className={cn(
				"relative flex h-7 items-center gap-1.5 rounded-sm px-2",
				committed ? "border border-border-raised bg-raised text-text" : "border border-transparent text-muted hover:text-text",
			)}
		>
			<meta.Icon className={cn("h-4 w-4", borrowed && !committed && "text-thread")} />
			{meta.key ? (
				<span className={cn("font-mono text-2xs leading-3", committed ? "text-muted" : "text-muted/45")}>{meta.key}</span>
			) : null}
			{borrowed && !committed ? (
				<motion.span
					layoutId="dock-borrow"
					className="pointer-events-none absolute inset-x-1.5 -bottom-[3px] h-[2px] rounded-full bg-thread"
				/>
			) : null}
		</button>
	);
}
