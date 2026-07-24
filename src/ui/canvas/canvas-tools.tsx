import { cn } from "../cn";
import { CursorIcon, HandIcon, SelectIcon } from "../icons";

export type CanvasTool = "interact" | "select" | "hand";

interface ToolMeta {
	id: CanvasTool;
	label: string;
	key: string | null;
	hold: string | null;
	Icon: (props: { className?: string }) => React.ReactNode;
}

const TOOLS: readonly ToolMeta[] = [
	{ id: "interact", label: "interact", key: null, hold: null, Icon: CursorIcon },
	{ id: "select", label: "select", key: "V", hold: "hold ⌘", Icon: SelectIcon },
	{ id: "hand", label: "hand", key: "H", hold: "hold space", Icon: HandIcon },
];

export function CanvasTools({ tool, onTool }: { tool: CanvasTool; onTool: (tool: CanvasTool) => void }) {
	return (
		<div className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex justify-center">
			<div
				role="toolbar"
				aria-label="canvas tools"
				className="pointer-events-auto flex items-center gap-0.5 rounded-lg border border-border-raised bg-bg/90 p-1 backdrop-blur"
				onPointerDown={(event) => event.stopPropagation()}
				onPointerMove={(event) => event.stopPropagation()}
				onDoubleClick={(event) => event.stopPropagation()}
				onContextMenu={(event) => {
					event.preventDefault();
					event.stopPropagation();
				}}
			>
				{TOOLS.map((meta) => {
					const active = tool === meta.id;
					return (
						<button
							key={meta.id}
							type="button"
							aria-label={meta.label}
							aria-pressed={active}
							onClick={() => onTool(meta.id)}
							className={cn(
								"group relative flex h-9 w-9 items-center justify-center rounded-md",
								active ? "bg-raised text-text" : "text-muted hover:bg-surface hover:text-text",
							)}
						>
							<meta.Icon className="h-[18px] w-[18px]" />
							<span className="pointer-events-none absolute -top-8 flex items-center gap-1.5 whitespace-nowrap rounded-md border border-border-raised bg-bg px-2 py-1 font-mono text-2xs text-muted leading-3 opacity-0 transition-opacity group-hover:opacity-100">
								{meta.label}
								{meta.key === null ? null : <Kbd>{meta.key}</Kbd>}
								{meta.hold === null ? null : <span>· {meta.hold}</span>}
							</span>
						</button>
					);
				})}
			</div>
		</div>
	);
}

function Kbd({ children }: { children: React.ReactNode }) {
	return (
		<span className="flex h-4 min-w-4 items-center justify-center rounded-[3px] border border-border-raised bg-surface px-1 font-mono text-[9px] text-muted leading-none">
			{children}
		</span>
	);
}
