// Minimal spool-ish chrome shared by both variants — deliberately identical so the
// judgment lands on canvas feel, not on chrome differences.

import { clsx } from "clsx";

export type ToolId = "select" | "hand" | "arrow";

const tools: { id: ToolId; label: string; key: string }[] = [
	{ id: "select", label: "▢", key: "V" },
	{ id: "hand", label: "✋", key: "H" },
	{ id: "arrow", label: "↗", key: "A" },
];

export function CanvasChrome({
	tool,
	onTool,
	zoomPct,
	onZoomIn,
	onZoomOut,
	onZoomFit,
}: {
	tool: ToolId;
	onTool: (t: ToolId) => void;
	zoomPct: number;
	onZoomIn: () => void;
	onZoomOut: () => void;
	onZoomFit: () => void;
}) {
	return (
		<>
			<div className="pointer-events-none fixed top-4 left-4 z-40 rounded-md bg-neutral-900/80 px-2.5 py-1.5 text-[11px] font-medium tracking-tight text-neutral-300">
				spool · canvas bake-off
			</div>
			<div className="fixed top-1/2 left-4 z-40 flex -translate-y-1/2 flex-col gap-1 rounded-xl border border-neutral-200 bg-white p-1.5 shadow-md">
				{tools.map((t) => (
					<button
						key={t.id}
						type="button"
						title={`${t.id} (${t.key})`}
						onClick={() => onTool(t.id)}
						className={clsx(
							"flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-[15px]",
							tool === t.id ? "bg-violet-600 text-white" : "text-neutral-600 hover:bg-neutral-100",
						)}
					>
						{t.label}
					</button>
				))}
			</div>
			<div className="fixed bottom-4 left-4 z-40 flex items-center gap-0.5 rounded-lg border border-neutral-200 bg-white px-1 py-0.5 text-[12px] shadow-md">
				<button
					type="button"
					onClick={onZoomOut}
					className="h-7 w-7 cursor-pointer rounded-md text-neutral-600 hover:bg-neutral-100"
				>
					−
				</button>
				<div className="w-12 text-center font-medium text-neutral-800 tabular-nums">{zoomPct}%</div>
				<button
					type="button"
					onClick={onZoomIn}
					className="h-7 w-7 cursor-pointer rounded-md text-neutral-600 hover:bg-neutral-100"
				>
					+
				</button>
				<div className="mx-0.5 h-4 w-px bg-neutral-200" />
				<button
					type="button"
					onClick={onZoomFit}
					title="zoom to fit (⇧1)"
					className="h-7 cursor-pointer rounded-md px-2 text-neutral-600 hover:bg-neutral-100"
				>
					fit
				</button>
			</div>
		</>
	);
}
