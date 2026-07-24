import { useState } from "react";
import { cn } from "../../../shared/lib/utils";
import {
	byName,
	CanvasScene,
	ChevronIcon,
	FrameLinksGroup,
	type FrameNode,
	framesByPage,
	PageTree,
	type PageName,
} from "../../../shared/ui/portal-nav";
import { SpoolShell } from "../../../shared/ui/spool-shell";

/**
 * Shell rework — Liam's split. The left tree does double duty: page switcher and
 * navigation, so a selected frame's links nest under its row. The right rail is
 * an element inspector: the component outline inside the selected frame, each
 * row highlighting its region on the canvas. Two jobs on the left, a third
 * surface on the right.
 */

interface ElementNode {
	id: string;
	tag: string;
	label: string;
	region: { x: number; y: number; w: number; h: number };
	children?: ElementNode[];
}

// A plausible opencode TUI outline — the interesting case for an element view.
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

function outlineFor(name: string): ElementNode[] {
	return byName(name).page === "session" ? TUI_OUTLINE : DIALOG_OUTLINE;
}

function findRegion(nodes: ElementNode[], id: string): ElementNode["region"] | null {
	for (const node of nodes) {
		if (node.id === id) return node.region;
		if (node.children) {
			const hit = findRegion(node.children, id);
			if (hit) return hit;
		}
	}
	return null;
}

export default function ShellReworkSplitElements() {
	const [activePage, setActivePage] = useState<PageName>("session");
	const [selected, setSelected] = useState<string | null>(null);
	const [expanded, setExpanded] = useState<Record<PageName, boolean>>({
		session: true,
		dialogs: false,
		tools: false,
		gates: false,
	});
	const [hoveredEl, setHoveredEl] = useState<string | null>(null);
	const [pinnedEl, setPinnedEl] = useState<string | null>(null);
	const [closedEl, setClosedEl] = useState<Set<string>>(new Set());

	const switchPage = (page: PageName) => {
		setActivePage(page);
		setSelected(null);
		setPinnedEl(null);
		setHoveredEl(null);
		setExpanded((cur) => ({ ...cur, [page]: true }));
	};

	const selectFrame = (name: string) => {
		const page = byName(name).page;
		setActivePage(page);
		setSelected(name);
		setPinnedEl(null);
		setHoveredEl(null);
		setExpanded((cur) => ({ ...cur, [page]: true }));
	};

	const jump = (target: FrameNode) => selectFrame(target.name);

	const outline = selected ? outlineFor(selected) : [];
	const activeEl = hoveredEl ?? pinnedEl;
	const activeRegion = selected && activeEl ? findRegion(outline, activeEl) : null;

	return (
		<SpoolShell activeTab="opencode" tabs={["opencode", "kaffe"]} zoom="100%">
			<div className="flex h-full min-h-0">
				<aside className="flex w-[248px] shrink-0 flex-col border-border border-r bg-bg">
					<div className="flex h-11 shrink-0 items-center justify-between border-border border-b px-3.5">
						<span className="font-semibold text-base leading-base">Pages</span>
						<span className="font-mono text-muted text-xs leading-xs">{4}</span>
					</div>
					<PageTree
						activePage={activePage}
						expanded={expanded}
						selected={selected}
						onTogglePage={(page) => setExpanded((cur) => ({ ...cur, [page]: !cur[page] }))}
						onSwitchPage={switchPage}
						onSelectFrame={selectFrame}
						frameExtra={(frame) => <FrameLinksGroup source={frame.name} onJump={jump} />}
					/>
					<div className="flex h-9 shrink-0 items-center border-border border-t px-3.5 font-mono text-2xs text-muted leading-3">
						{selected ? (
							<span>
								<span className="text-thread">→</span> links nested under {selected}
							</span>
						) : (
							<span>folder switches page</span>
						)}
					</div>
				</aside>

				<div className="relative min-w-0 flex-1 overflow-hidden bg-canvas" onClick={() => setSelected(null)}>
					<CanvasScene
						page={activePage}
						selected={selected}
						onSelectFrame={selectFrame}
						overlay={() =>
							activeRegion ? (
								<div
									className="pointer-events-none absolute rounded-[3px] border border-thread bg-thread/10"
									style={{
										left: activeRegion.x,
										top: activeRegion.y,
										width: activeRegion.w,
										height: activeRegion.h,
									}}
								/>
							) : null
						}
					/>
					<div className="pointer-events-none absolute bottom-3 left-4 font-mono text-2xs text-muted/60 leading-3">
						page · {activePage}
					</div>
				</div>

				<aside className="flex w-[320px] shrink-0 flex-col border-border border-l bg-bg">
					<div className="flex h-11 shrink-0 items-center justify-between border-border border-b px-4">
						<span className="font-medium text-base text-text leading-none">Elements</span>
						{selected ? (
							<span className="truncate font-mono text-2xs text-muted leading-3">{selected}</span>
						) : (
							<span className="font-mono text-2xs text-muted leading-3">frame</span>
						)}
					</div>

					{selected ? (
						<div className="min-h-0 flex-1 overflow-y-auto py-2" onMouseLeave={() => setHoveredEl(null)}>
							{outline.map((node) => (
								<ElementRow
									key={node.id}
									node={node}
									depth={0}
									closedEl={closedEl}
									hoveredEl={hoveredEl}
									pinnedEl={pinnedEl}
									onHover={setHoveredEl}
									onPin={(id) => setPinnedEl((cur) => (cur === id ? null : id))}
									onToggle={(id) =>
										setClosedEl((cur) => {
											const next = new Set(cur);
											if (next.has(id)) next.delete(id);
											else next.add(id);
											return next;
										})
									}
								/>
							))}
						</div>
					) : (
						<div className="flex flex-1 items-center justify-center px-8 text-center">
							<span className="font-mono text-2xs text-muted/60 leading-4">select a frame to inspect its elements</span>
						</div>
					)}
				</aside>
			</div>
		</SpoolShell>
	);
}

function ElementRow({
	node,
	depth,
	closedEl,
	hoveredEl,
	pinnedEl,
	onHover,
	onPin,
	onToggle,
}: {
	node: ElementNode;
	depth: number;
	closedEl: Set<string>;
	hoveredEl: string | null;
	pinnedEl: string | null;
	onHover: (id: string | null) => void;
	onPin: (id: string) => void;
	onToggle: (id: string) => void;
}) {
	const branch = Boolean(node.children?.length);
	const open = branch && !closedEl.has(node.id);
	const active = hoveredEl === node.id || pinnedEl === node.id;

	return (
		<div>
			<div
				className={cn("relative flex h-7 items-center hover:bg-surface", active && "bg-surface")}
				onMouseEnter={() => onHover(node.id)}
			>
				{branch ? (
					<button
						type="button"
						aria-label={open ? `Collapse ${node.label}` : `Expand ${node.label}`}
						onClick={() => onToggle(node.id)}
						className="absolute z-10 flex h-7 w-5 items-center justify-center"
						style={{ left: 8 + depth * 14 }}
					>
						<ChevronIcon open={open} className="h-2.5 w-2.5" />
					</button>
				) : null}
				<button
					type="button"
					onClick={() => onPin(node.id)}
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
			{open
				? node.children?.map((child) => (
						<ElementRow
							key={child.id}
							node={child}
							depth={depth + 1}
							closedEl={closedEl}
							hoveredEl={hoveredEl}
							pinnedEl={pinnedEl}
							onHover={onHover}
							onPin={onPin}
							onToggle={onToggle}
						/>
					))
				: null}
		</div>
	);
}
