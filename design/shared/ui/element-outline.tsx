import { cn } from "../lib/utils";
import { byName, ChevronIcon } from "./portal-nav";

/**
 * The component-outline view, extracted so the shell-rework synthesis can offer
 * elements as a mode inside the rail without depending on the split-elements
 * frame (frames never import frames). The data and row rendering mirror that
 * frame; it keeps its own copy untouched.
 */

export interface ElementNode {
	id: string;
	tag: string;
	label: string;
	region: { x: number; y: number; w: number; h: number };
	children?: ElementNode[];
}

const TUI_OUTLINE: ElementNode[] = [
	{
		id: "app",
		tag: "div",
		label: "SessionView",
		region: { x: 3, y: 3, w: 172, h: 104 },
		children: [
			{
				id: "header",
				tag: "header",
				label: "Header",
				region: { x: 8, y: 8, w: 162, h: 16 },
				children: [
					{ id: "workspace", tag: "span", label: "workspace", region: { x: 8, y: 8, w: 74, h: 16 } },
					{ id: "model-badge", tag: "span", label: "model badge", region: { x: 116, y: 8, w: 54, h: 16 } },
				],
			},
			{
				id: "transcript",
				tag: "div",
				label: "Transcript",
				region: { x: 8, y: 28, w: 162, h: 50 },
				children: [
					{ id: "msg-assistant", tag: "div", label: "message · assistant", region: { x: 8, y: 28, w: 162, h: 14 } },
					{ id: "msg-tool", tag: "div", label: "message · tool", region: { x: 8, y: 44, w: 162, h: 14 } },
					{ id: "msg-user", tag: "div", label: "message · user", region: { x: 8, y: 60, w: 162, h: 14 } },
				],
			},
			{
				id: "composer",
				tag: "form",
				label: "Composer",
				region: { x: 8, y: 80, w: 162, h: 16 },
				children: [
					{ id: "input", tag: "textarea", label: "input", region: { x: 8, y: 80, w: 130, h: 16 } },
					{ id: "send", tag: "button", label: "send", region: { x: 142, y: 80, w: 28, h: 16 } },
				],
			},
			{
				id: "status",
				tag: "footer",
				label: "StatusBar",
				region: { x: 8, y: 98, w: 162, h: 9 },
				children: [
					{ id: "tokens", tag: "span", label: "tokens", region: { x: 8, y: 98, w: 56, h: 9 } },
					{ id: "keymap", tag: "span", label: "keymap", region: { x: 116, y: 98, w: 54, h: 9 } },
				],
			},
		],
	},
];

const DIALOG_OUTLINE: ElementNode[] = [
	{
		id: "dialog",
		tag: "div",
		label: "Dialog",
		region: { x: 3, y: 3, w: 172, h: 104 },
		children: [
			{ id: "title", tag: "h2", label: "title", region: { x: 8, y: 10, w: 104, h: 14 } },
			{
				id: "options",
				tag: "ul",
				label: "OptionList",
				region: { x: 8, y: 30, w: 162, h: 52 },
				children: [
					{ id: "opt-0", tag: "li", label: "option", region: { x: 8, y: 30, w: 162, h: 16 } },
					{ id: "opt-1", tag: "li", label: "option", region: { x: 8, y: 48, w: 162, h: 16 } },
					{ id: "opt-2", tag: "li", label: "option", region: { x: 8, y: 66, w: 162, h: 16 } },
				],
			},
			{
				id: "footer",
				tag: "div",
				label: "Footer",
				region: { x: 8, y: 90, w: 162, h: 12 },
				children: [{ id: "hint", tag: "span", label: "keymap hint", region: { x: 8, y: 90, w: 120, h: 12 } }],
			},
		],
	},
];

export function outlineFor(name: string): ElementNode[] {
	return byName(name).page === "session" ? TUI_OUTLINE : DIALOG_OUTLINE;
}

export function findRegion(nodes: ElementNode[], id: string): ElementNode["region"] | null {
	for (const node of nodes) {
		if (node.id === id) return node.region;
		if (node.children) {
			const hit = findRegion(node.children, id);
			if (hit) return hit;
		}
	}
	return null;
}

export interface OutlineHandlers {
	closedEl: Set<string>;
	hoveredEl: string | null;
	pinnedEl: string | null;
	onHover: (id: string | null) => void;
	onPin: (id: string) => void;
	onToggle: (id: string) => void;
}

/** The scrollable outline body: top-level nodes rendered as a collapsible tree. */
export function ElementOutline({ outline, handlers }: { outline: ElementNode[]; handlers: OutlineHandlers }) {
	return (
		<div className="min-h-0 flex-1 overflow-y-auto py-2" onMouseLeave={() => handlers.onHover(null)}>
			{outline.map((node) => (
				<ElementRow key={node.id} node={node} depth={0} handlers={handlers} />
			))}
		</div>
	);
}

function ElementRow({ node, depth, handlers }: { node: ElementNode; depth: number; handlers: OutlineHandlers }) {
	const branch = Boolean(node.children?.length);
	const open = branch && !handlers.closedEl.has(node.id);
	const active = handlers.hoveredEl === node.id || handlers.pinnedEl === node.id;

	return (
		<div>
			<div
				className={cn("relative flex h-7 items-center hover:bg-surface", active && "bg-surface")}
				onMouseEnter={() => handlers.onHover(node.id)}
			>
				{branch ? (
					<button
						type="button"
						aria-label={open ? `Collapse ${node.label}` : `Expand ${node.label}`}
						onClick={() => handlers.onToggle(node.id)}
						className="absolute z-10 flex h-7 w-5 items-center justify-center"
						style={{ left: 8 + depth * 14 }}
					>
						<ChevronIcon open={open} className="h-2.5 w-2.5" />
					</button>
				) : null}
				<button
					type="button"
					onClick={() => handlers.onPin(node.id)}
					className="flex h-7 w-full min-w-0 items-center gap-2 pr-3 text-left"
					style={{ paddingLeft: 30 + depth * 14 }}
				>
					<span className={cn("shrink-0 font-mono text-2xs leading-3", active ? "text-thread" : "text-muted/70")}>
						{`<${node.tag}>`}
					</span>
					<span className={cn("min-w-0 flex-1 truncate font-mono text-xs leading-xs", active ? "text-text" : "text-muted")}>
						{node.label}
					</span>
				</button>
			</div>
			{open ? node.children?.map((child) => <ElementRow key={child.id} node={child} depth={depth + 1} handlers={handlers} />) : null}
		</div>
	);
}
