import { useExplorer } from "shared/lib/explore/explorer/explorer-model";
import { cn } from "shared/lib/utils";
import { RailTabs } from "shared/ui/spool/canvas-chrome";
import { ExplorerCanvas, type EmptyTake } from "shared/ui/explore/explorer/explorer-canvas";
import { ExplorerRail } from "shared/ui/explore/explorer/explorer-rail";
import { HandIcon, SelectIcon } from "shared/ui/spool/icons";
import { SpoolShell } from "shared/ui/spool/shell";

/**
 * The canvas, composed exactly as it ships — shell, left rail, field, inspector,
 * tool bar — with the one substitution this proposal is about: the pages rail is
 * a working file explorer.
 *
 * Everything else is copied so the change reads as a diff against the product
 * rather than as a component demo.
 *
 * `take` and `unfoldHollow` are the empty-page frames' one variable each: what
 * the field does, and whether the rail does anything, on a page holding no
 * frames. Left alone the screen is the proposal as it stood.
 */

const INSPECTOR_W = 300;

export function ExplorerScreen({
	take = "bare",
	start,
	unfoldHollow = false,
	argues,
}: {
	take?: EmptyTake;
	/** the page the canvas opens on — the empty-page frames open on a page of pages */
	start?: string | undefined;
	unfoldHollow?: boolean;
	/** the one line this frame argues, in the corner of the field */
	argues?: string | undefined;
} = {}) {
	const model = useExplorer({ start, unfoldHollow });
	const frame = model.selectedFrame;

	return (
		<SpoolShell activeTab="atlas" tabs={["atlas", "spool"]} zoom="72%">
			<div className="flex h-full w-full overflow-hidden bg-bg">
				<ExplorerRail model={model} />
				<div className="relative min-w-0 flex-1 overflow-hidden bg-canvas">
					<ExplorerCanvas
						label={model.stage.label}
						path={model.stage.path}
						frames={model.stage.frames}
						pages={model.stage.pages}
						selected={model.selection}
						revealed={model.revealed}
						take={take}
						onEnterPage={(id) => {
							model.activate(id);
							model.reveal(id);
						}}
					/>
					{argues === undefined ? null : (
						<p className="pointer-events-none absolute right-6 bottom-6 max-w-[46ch] text-right text-base text-muted leading-base">
							{argues}
						</p>
					)}
					<CanvasTools />
				</div>
				<aside
					aria-label="Inspector"
					className="flex shrink-0 flex-col border-border border-l bg-bg"
					style={{ width: INSPECTOR_W }}
				>
					<RailTabs tabs={["elements", "connections"]} active="elements" />
					{frame === null ? (
						<p className="px-4 pt-3 font-mono text-2xs text-muted/55 leading-4">select a frame to inspect it</p>
					) : (
						<div className="flex min-h-0 flex-1 flex-col">
							<div className="flex flex-col gap-1 border-border border-b px-4 py-3">
								<span className="truncate font-mono text-sm text-text leading-sm">{frame.name}</span>
								<span className="truncate font-mono text-2xs text-muted/60 leading-3">
									{model.sourcePath(frame.id)}
								</span>
							</div>
							<div className="flex items-center justify-between px-4 pt-1 pb-1">
								<span className="font-mono text-2xs text-muted leading-3">elements</span>
								<span className="font-mono text-2xs text-muted/45 leading-3">{ELEMENTS.length}</span>
							</div>
							<div className="min-h-0 flex-1 overflow-hidden pb-3">
								{ELEMENTS.map((row) => (
									<div key={row.name} className="flex h-7 items-center">
										<span
											className="truncate font-mono text-sm text-muted leading-sm"
											style={{ paddingLeft: 16 + row.depth * 14 }}
										>
											{row.name}
										</span>
									</div>
								))}
							</div>
						</div>
					)}
				</aside>
			</div>
		</SpoolShell>
	);
}

const ELEMENTS: readonly { name: string; depth: number }[] = [
	{ name: "screen", depth: 0 },
	{ name: "header", depth: 1 },
	{ name: "menu-list", depth: 1 },
	{ name: "menu-item", depth: 2 },
	{ name: "checkout-bar", depth: 1 },
];

const TOOLS = [
	{ id: "select", label: "select", Icon: SelectIcon },
	{ id: "hand", label: "hand", Icon: HandIcon },
] as const;

function CanvasTools() {
	return (
		<div className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex justify-center">
			<div
				role="toolbar"
				aria-label="canvas tools"
				className="flex items-center gap-0.5 rounded-lg border border-border-raised bg-bg/90 p-1 backdrop-blur"
			>
				{TOOLS.map((meta) => (
					<span
						key={meta.id}
						aria-label={meta.label}
						className={cn(
							"flex h-9 w-9 items-center justify-center rounded-md",
							meta.id === "select" ? "bg-raised text-text" : "text-muted",
						)}
					>
						<meta.Icon className="h-[18px] w-[18px]" />
					</span>
				))}
			</div>
		</div>
	);
}
