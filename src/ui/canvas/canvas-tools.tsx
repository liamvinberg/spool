import { cn } from "../cn";
import { CursorIcon, HandIcon, SelectIcon } from "../icons";

export type CanvasTool = "interact" | "select" | "hand";
export type TransientCanvasTool = Exclude<CanvasTool, "interact"> | null;

interface ToolMeta {
	id: CanvasTool;
	label: string;
	key: string | null;
	Icon: (props: { className?: string }) => React.ReactNode;
}

const TOOLS: readonly ToolMeta[] = [
	{ id: "interact", label: "interact", key: null, Icon: CursorIcon },
	{ id: "select", label: "select", key: "V", Icon: SelectIcon },
	{ id: "hand", label: "hand", key: "H", Icon: HandIcon },
];

export function CanvasTools({
	tool,
	transient,
	onTool,
}: {
	tool: CanvasTool;
	transient: TransientCanvasTool;
	onTool: (tool: CanvasTool) => void;
}) {
	const borrowingSelect = transient === "select" && tool === "interact";
	return (
		<div className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex flex-col items-center gap-2.5">
			<div
				data-borrow-caption
				data-visible={borrowingSelect}
				aria-hidden={!borrowingSelect}
				className="canvas-tool-borrow-caption flex items-center gap-1.5 rounded-full border border-border-raised bg-bg/90 px-2.5 py-1 font-mono text-2xs text-muted leading-3 backdrop-blur"
			>
				<Kbd>⌘</Kbd>
				<span>borrowing select while held</span>
			</div>
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
					const committed = tool === meta.id;
					const borrowed = transient === meta.id;
					const holding = committed && transient !== null && !borrowed;
					return (
						<button
							key={meta.id}
							type="button"
							aria-label={meta.label}
							aria-pressed={committed}
							data-borrowed={borrowed || undefined}
							onClick={() => onTool(meta.id)}
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
								<span className="pointer-events-none absolute inset-0 rounded-md border border-thread border-dashed" />
							) : null}
							{holding ? (
								<span className="pointer-events-none absolute inset-x-2.5 bottom-1 h-0.5 rounded-full bg-muted/60" />
							) : null}
							<meta.Icon className="h-[18px] w-[18px]" />
							{borrowed ? (
								<span className="-right-1 -top-1 absolute flex h-3.5 items-center rounded-full bg-thread px-1 font-mono text-[8px] text-on-thread leading-none">
									⌘
								</span>
							) : null}
							<span className="pointer-events-none absolute -top-8 flex items-center gap-1.5 whitespace-nowrap rounded-md border border-border-raised bg-bg px-2 py-1 font-mono text-2xs text-muted leading-3 opacity-0 transition-opacity group-hover:opacity-100">
								{meta.label}
								{meta.key === null ? null : <Kbd>{meta.key}</Kbd>}
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
