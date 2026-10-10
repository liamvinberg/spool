import { hotkeyChips, hotkeyEntry, hotkeyKey } from "../hotkeys";
import { EditIcon, HandIcon, SelectIcon } from "../icons";
import { IconButton, ToolGroup } from "../primitives/actions";
import { Kbd } from "../primitives/display";

export type CanvasTool = "select" | "edit" | "hand";

interface ToolMeta {
	id: CanvasTool;
	label: string;
	key: string | null;
	hold: string | null;
	Icon: (props: { className?: string }) => React.ReactNode;
}

// Two pointer tools, by what they take. Select takes frames: a click selects
// one, a double-click goes inside it, and ⌘ borrows Edit for as long as it is
// held. Edit takes the elements inside them (#339): a click takes the deepest
// one under the pointer, a double-click opens its words or its children, and
// nothing the pointer or the keys do reaches the page while it is on.
//
// Each tool is also a transient of the other: ⌘ borrows Edit inside Select,
// Space borrows Hand anywhere.
const TOOLS: readonly ToolMeta[] = [
	{ id: "select", label: "select", key: hotkeyKey("canvas.tool-select"), hold: null, Icon: SelectIcon },
	{ id: "edit", label: "edit", key: hotkeyKey("canvas.tool-edit"), hold: null, Icon: EditIcon },
	{
		id: "hand",
		label: "hand",
		key: hotkeyKey("canvas.tool-hand"),
		hold: hotkeyChips(hotkeyEntry("canvas.tool-hand")).gesture ?? null,
		Icon: HandIcon,
	},
];

export function CanvasTools({ tool, onTool }: { tool: CanvasTool; onTool: (tool: CanvasTool) => void }) {
	return (
		<div className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex justify-center">
			<ToolGroup
				aria-label="canvas tools"
				className="pointer-events-auto"
				onPointerDown={(event) => event.stopPropagation()}
				onPointerMove={(event) => event.stopPropagation()}
				onDoubleClick={(event) => event.stopPropagation()}
				onContextMenu={(event) => {
					event.preventDefault();
					event.stopPropagation();
				}}
			>
				{TOOLS.map((meta) => (
					<IconButton
						key={meta.id}
						size="lg"
						icon={<meta.Icon className="size-4" />}
						label={meta.label}
						title={undefined}
						pressed={tool === meta.id}
						onClick={() => onTool(meta.id)}
						className="group"
					>
						<span className="pointer-events-none absolute -top-8 left-1/2 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-md border border-line-strong bg-surface-window px-2 py-1 text-secondary opacity-0 transition-opacity group-hover:opacity-100 type-detail">
							{meta.label}
							{meta.key === null ? null : <Kbd>{meta.key}</Kbd>}
							{meta.hold === null ? null : <span>· {meta.hold}</span>}
						</span>
					</IconButton>
				))}
			</ToolGroup>
		</div>
	);
}
