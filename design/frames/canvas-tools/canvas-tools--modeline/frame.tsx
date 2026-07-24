import { cn } from "../../../shared/lib/utils";
import { MockCanvas, type Tool, TOOLS, type ToolState, toolMeta, useToolState } from "../../../shared/ui/canvas-tools";
import { SpoolShell } from "../../../shared/ui/spool-shell";

/**
 * Canvas tools — wild card: a modal-editor status line. The toolbar is a real
 * docked bar along the bottom edge, mono and dense like a vim modeline. The active
 * tool is announced as a mode block (-- INTERACT --), the three tools sit as text
 * segments with their keys, and the right edge carries the standing ⌘ hint.
 *
 * The Cmd-transient is the whole point of a modal line: the mode block flips to
 * -- SELECT -- in thread with a ⌘ marker while held, and the committed tool stays
 * visibly marked in the segment row with a dotted thread underline, so you read
 * "borrowing select, still on interact" at a glance. Release restores the mode.
 */
export default function CanvasToolsModeline() {
	const state = useToolState();

	return (
		<SpoolShell activeTab="opencode" tabs={["opencode", "kaffe"]} showCanvasControls={false}>
			<div className="flex h-full w-full flex-col">
				<div className="min-h-0 flex-1">
					<MockCanvas state={state} />
				</div>
				<Modeline state={state} />
			</div>
		</SpoolShell>
	);
}

const MODE_STYLE: Record<Tool, string> = {
	interact: "bg-surface text-muted",
	select: "bg-thread text-on-thread",
	hand: "bg-raised text-text",
};

function Modeline({ state }: { state: ToolState }) {
	const { tool, setTool, effectiveTool, transient, metaHeld } = state;
	const mode = toolMeta(effectiveTool);

	return (
		<div className="flex h-8 shrink-0 items-center justify-between border-border border-t bg-bg px-3 font-mono text-2xs leading-3">
			<div className="flex items-center gap-4">
				<span className={cn("flex items-center gap-1.5 rounded-[3px] px-2 py-0.5", MODE_STYLE[effectiveTool])}>
					{metaHeld ? <span aria-hidden="true">⌘</span> : null}
					-- {mode.label.toUpperCase()} --
				</span>

				<div className="flex items-center gap-3.5">
					{TOOLS.map((meta) => {
						const isEffective = effectiveTool === meta.id;
						const isHeldTool = tool === meta.id && transient !== null && !isEffective;
						return (
							<button
								key={meta.id}
								type="button"
								onClick={() => setTool(meta.id)}
								className={cn(
									"flex items-center gap-1 transition-colors",
									isEffective ? "text-text" : isHeldTool ? "text-muted" : "text-muted/45 hover:text-muted",
								)}
							>
								<span className={cn(isHeldTool && "underline decoration-thread decoration-dotted underline-offset-2")}>
									{meta.label}
								</span>
								{meta.key ? <span className={cn(isEffective ? "text-thread" : "text-muted/40")}>{meta.key}</span> : null}
							</button>
						);
					})}
				</div>
			</div>

			<div className="flex items-center gap-4 text-muted/60">
				<span className={cn("flex items-center gap-1", metaHeld && "text-thread")}>⌘ hold → select</span>
				<span className="text-muted/40">page · session</span>
				<span className="text-muted">100%</span>
			</div>
		</div>
	);
}
