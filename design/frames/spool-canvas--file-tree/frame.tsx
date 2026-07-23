import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { cn } from "../../shared/lib/utils";
import { CoffeeScreen, type CoffeeScreenName } from "../../shared/ui/coffee-screens";
import { SpoolShell } from "../../shared/ui/spool-shell";

type FrameName = CoffeeScreenName;

interface SelectionModifiers {
	shiftKey: boolean;
	toggleKey: boolean;
}

interface ElementNode {
	children?: readonly ElementNode[];
	count?: number;
	id: string;
	instance?: number;
	label: string;
	line: number;
	tag: string;
}

const tree: Record<FrameName, readonly ElementNode[]> = {
	menu: [
		{
			id: "menu-root",
			tag: "div",
			label: "CoffeeMenu",
			line: 20,
			children: [
				{
					id: "menu-header",
					tag: "div",
					label: "Header",
					line: 26,
					children: [
						{ id: "menu-title", tag: "h1", label: "kaffe", line: 28 },
						{ id: "menu-address", tag: "p", label: "Torsgatan 11", line: 36 },
					],
				},
				{ id: "menu-products", tag: "div", label: "Product × 3", line: 43 },
				{ id: "menu-checkout", tag: "button", label: "Till kassan", line: 72 },
			],
		},
	],
	cart: [
		{
			id: "cart-root",
			tag: "div",
			label: "CoffeeCart",
			line: 83,
			children: [
				{
					id: "cart-content",
					tag: "div",
					label: "Content",
					line: 89,
					children: [
						{ id: "cart-title", tag: "h1", label: "Din varukorg", line: 91 },
						{
							id: "cart-items",
							tag: "div",
							label: "cart.map(…)",
							line: 100,
							count: 2,
							children: [
								{ id: "cart-item-0", tag: "div", label: "1 × Cortado · 42 kr", line: 100, instance: 0 },
								{ id: "cart-item-1", tag: "div", label: "1 × Flat white · 48 kr", line: 100, instance: 1 },
							],
						},
					],
				},
				{
					id: "cart-footer",
					tag: "div",
					label: "Footer",
					line: 120,
					children: [
						{
							id: "cart-total",
							tag: "div",
							label: "Total",
							line: 124,
							children: [
								{ id: "cart-total-label", tag: "span", label: "Totalt", line: 125 },
								{ id: "cart-total-value", tag: "span", label: "90 kr", line: 136 },
							],
						},
						{
							id: "cart-pay",
							tag: "button",
							label: "Betala med kort eller Klarna",
							line: 145,
						},
					],
				},
			],
		},
	],
	receipt: [
		{
			id: "receipt-root",
			tag: "div",
			label: "CoffeeReceipt",
			line: 159,
			children: [
				{ id: "receipt-mark", tag: "div", label: "Success mark", line: 168 },
				{
					id: "receipt-copy-group",
					tag: "div",
					label: "Receipt copy",
					line: 179,
					children: [
						{ id: "receipt-title", tag: "h1", label: "Tack!", line: 181 },
						{ id: "receipt-order", tag: "p", label: "Order #214", line: 185 },
						{ id: "receipt-copy", tag: "p", label: "Kvittot är skickat till din mejl", line: 196 },
					],
				},
			],
		},
	],
};

const frameOrder: readonly FrameName[] = ["menu", "cart", "receipt"];

export default function SpoolCanvasFileTreeFrame() {
	const [expanded, setExpanded] = useState<Record<FrameName, boolean>>({
		menu: false,
		cart: true,
		receipt: false,
	});
	const [expandedNodes, setExpandedNodes] = useState<Readonly<Record<string, boolean>>>({
		"cart-root": true,
		"cart-content": true,
		"cart-items": true,
		"cart-footer": true,
		"cart-total": true,
	});
	const [activeFrame, setActiveFrame] = useState<FrameName>("cart");
	const [selectedElements, setSelectedElements] = useState<readonly string[]>(["cart-pay"]);
	const [selectionAnchor, setSelectionAnchor] = useState<{ frame: FrameName; id: string } | null>({
		frame: "cart",
		id: "cart-pay",
	});

	function toggleFrame(frame: FrameName) {
		setExpanded((current) => ({ ...current, [frame]: !current[frame] }));
	}

	function selectFrame(frame: FrameName) {
		setActiveFrame(frame);
		setSelectedElements([]);
		setSelectionAnchor(null);
	}

	function selectElement(frame: FrameName, element: ElementNode, modifiers: SelectionModifiers) {
		setActiveFrame(frame);
		if (modifiers.shiftKey && selectionAnchor?.frame === frame) {
			const visible = visibleElementIds(tree[frame], expandedNodes);
			const anchorIndex = visible.indexOf(selectionAnchor.id);
			const targetIndex = visible.indexOf(element.id);
			if (anchorIndex !== -1 && targetIndex !== -1) {
				const range = visible.slice(Math.min(anchorIndex, targetIndex), Math.max(anchorIndex, targetIndex) + 1);
				setSelectedElements((current) => (modifiers.toggleKey ? [...new Set([...current, ...range])] : range));
				return;
			}
		}

		setSelectionAnchor({ frame, id: element.id });
		setSelectedElements((current) => {
			if (modifiers.toggleKey) {
				return current.includes(element.id) ? current.filter((id) => id !== element.id) : [...current, element.id];
			}
			return [element.id];
		});
	}

	function toggleElement(element: ElementNode) {
		if (!element.children?.length) return;
		setExpandedNodes((current) => ({ ...current, [element.id]: !current[element.id] }));
	}

	return (
		<SpoolShell
			activeTab="kaffe"
			homeTarget="spool-home"
			liveTarget="spool-canvas--live"
			designTarget="spool-canvas--file-tree"
			playTarget="spool-player"
			mode="design"
			zoom="72%"
		>
			<div className="flex h-full min-h-0">
				<aside className="flex w-[248px] shrink-0 flex-col border-border border-r bg-bg">
					<div className="flex h-11 shrink-0 items-center justify-between border-border border-b px-3.5">
						<h1 className="font-semibold text-base leading-base">Frames</h1>
						<span className="font-mono text-muted text-xs leading-xs">3</span>
					</div>

					<div className="min-h-0 flex-1 overflow-y-auto py-2">
						{frameOrder.map((frame) => (
							<div key={frame}>
								<div
									className={cn(
										"group flex h-8 w-full items-center px-2 font-mono text-sm leading-sm hover:bg-surface",
										activeFrame === frame ? "text-text" : "text-muted",
									)}
								>
									<button
										type="button"
										aria-label={expanded[frame] ? `Collapse ${frame}` : `Expand ${frame}`}
										aria-expanded={expanded[frame]}
										onClick={() => toggleFrame(frame)}
										className="flex h-8 w-6 shrink-0 items-center justify-center text-muted hover:text-text"
									>
										<ChevronIcon open={expanded[frame]} className="h-2.5 w-2.5" />
									</button>
									<button
										type="button"
										aria-pressed={activeFrame === frame}
										onClick={() => selectFrame(frame)}
										onKeyDown={(event) => {
											if (event.key === "ArrowRight" && !expanded[frame]) {
												event.preventDefault();
												toggleFrame(frame);
											}
											if (event.key === "ArrowLeft" && expanded[frame]) {
												event.preventDefault();
												toggleFrame(frame);
											}
										}}
										className="flex h-8 min-w-0 flex-1 items-center gap-2 text-left"
									>
										<FrameIcon
											className={cn("h-3.5 w-3.5 shrink-0", activeFrame === frame && "text-thread")}
										/>
										<span className="min-w-0 flex-1 truncate">{frame}</span>
										<span className="pr-1 text-2xs text-muted opacity-0 transition-opacity group-hover:opacity-100">
											frame.tsx
										</span>
									</button>
								</div>

								<AnimatedTreeGroup open={expanded[frame]}>
									<div className="relative pb-1">
										<span className="absolute bottom-2 left-[18px] top-0 w-px bg-border-raised" />
										{tree[frame].map((element) => (
											<TreeNode
												key={element.id}
												depth={0}
												element={element}
												expandedNodes={expandedNodes}
												frame={frame}
												onSelect={selectElement}
												onToggle={toggleElement}
												selectedElements={selectedElements}
											/>
										))}
									</div>
								</AnimatedTreeGroup>
							</div>
						))}
					</div>

					<div className="flex h-9 shrink-0 items-center border-border border-t px-3.5 font-mono text-2xs text-muted leading-3">
						Shift range · ⌘/Ctrl toggle
					</div>
				</aside>

				<CanvasStage activeFrame={activeFrame} selectedElements={selectedElements} />
			</div>
		</SpoolShell>
	);
}

function TreeNode({
	depth,
	element,
	expandedNodes,
	frame,
	onSelect,
	onToggle,
	selectedElements,
}: {
	depth: number;
	element: ElementNode;
	expandedNodes: Readonly<Record<string, boolean>>;
	frame: FrameName;
	onSelect: (frame: FrameName, element: ElementNode, modifiers: SelectionModifiers) => void;
	onToggle: (element: ElementNode) => void;
	selectedElements: readonly string[];
}) {
	const branch = Boolean(element.children?.length);
	const open = branch && Boolean(expandedNodes[element.id]);
	const selected = selectedElements.includes(element.id);
	const connectorLeft = 18 + depth * 16;

	return (
		<div>
			<div
				className={cn(
					"relative flex h-7 w-full items-center text-xs leading-xs hover:bg-surface",
					selected ? "bg-surface text-text" : "text-muted",
				)}
			>
				<span className="absolute top-1/2 h-px w-2.5 bg-border-raised" style={{ left: connectorLeft }} />
				{branch ? (
					<button
						type="button"
						aria-label={open ? `Collapse ${element.label}` : `Expand ${element.label}`}
						aria-expanded={open}
						onClick={() => onToggle(element)}
						className="absolute z-10 flex h-7 w-5 items-center justify-center text-muted hover:text-text"
						style={{ left: 24 + depth * 16 }}
					>
						<ChevronIcon open={open} className="h-2.5 w-2.5" />
					</button>
				) : null}
				<button
					type="button"
					aria-pressed={selected}
					title={element.count === undefined ? element.label : `${element.label} · ${element.count} rendered`}
					onClick={(event) =>
						onSelect(frame, element, {
							shiftKey: event.shiftKey,
							toggleKey: event.metaKey || event.ctrlKey,
						})
					}
					onKeyDown={(event) => {
						if (event.key === "ArrowRight" && branch && !open) {
							event.preventDefault();
							onToggle(element);
						}
						if (event.key === "ArrowLeft" && branch && open) {
							event.preventDefault();
							onToggle(element);
						}
					}}
					className="flex h-7 w-full min-w-0 items-center gap-2 pr-3 text-left"
					style={{ paddingLeft: 48 + depth * 16 }}
				>
					<span className={cn("w-[54px] shrink-0 font-mono text-2xs", selected ? "text-thread" : "text-muted")}>
						{element.instance === undefined ? `<${element.tag}>` : `[${element.instance}]`}
					</span>
					<span className="min-w-0 flex-1 truncate">{element.label}</span>
					{element.count === undefined ? null : (
						<span className="shrink-0 font-mono text-2xs text-muted">{element.count}</span>
					)}
				</button>
			</div>

			<AnimatedTreeGroup open={open}>
				<div className="relative">
					<span className="absolute bottom-1 top-0 w-px bg-border-raised" style={{ left: connectorLeft + 16 }} />
					{element.children?.map((child) => (
						<TreeNode
							key={child.id}
							depth={depth + 1}
							element={child}
							expandedNodes={expandedNodes}
							frame={frame}
							onSelect={onSelect}
							onToggle={onToggle}
							selectedElements={selectedElements}
						/>
					))}
				</div>
			</AnimatedTreeGroup>
		</div>
	);
}

function AnimatedTreeGroup({ children, open }: { children: React.ReactNode; open: boolean }) {
	const reduceMotion = useReducedMotion();
	return (
		<AnimatePresence initial={false}>
			{open ? (
				<motion.div
					key="tree-children"
					initial={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
					animate={
						reduceMotion
							? { opacity: 1 }
							: {
									height: "auto",
									opacity: 1,
									transition: {
										height: { duration: 0.18, ease: [0.23, 1, 0.32, 1] },
										opacity: { duration: 0.12, ease: [0.23, 1, 0.32, 1] },
									},
								}
					}
					exit={
						reduceMotion
							? { opacity: 0 }
							: {
									height: 0,
									opacity: 0,
									transition: {
										height: { duration: 0.14, ease: [0.23, 1, 0.32, 1] },
										opacity: { duration: 0.09, ease: [0.23, 1, 0.32, 1] },
									},
								}
					}
					className="overflow-hidden"
				>
					{children}
				</motion.div>
			) : null}
		</AnimatePresence>
	);
}

function CanvasStage({
	activeFrame,
	selectedElements,
}: {
	activeFrame: FrameName;
	selectedElements: readonly string[];
}) {
	return (
		<div className="relative min-w-0 flex-1 overflow-hidden bg-canvas">
			<ThreadSvg />
			<CanvasFrame
				left={72}
				top={128}
				screen="menu"
				active={activeFrame === "menu"}
				selectedElements={selectedElements}
			/>
			<CanvasFrame
				left={450}
				top={168}
				screen="cart"
				active={activeFrame === "cart"}
				selectedElements={selectedElements}
			/>
			<CanvasFrame
				left={828}
				top={108}
				screen="receipt"
				active={activeFrame === "receipt"}
				selectedElements={selectedElements}
			/>
		</div>
	);
}

function CanvasFrame({
	active,
	left,
	screen,
	selectedElements,
	top,
}: {
	active: boolean;
	left: number;
	screen: FrameName;
	selectedElements: readonly string[];
	top: number;
}) {
	const frameSelections = selectedElements.filter((id) => id.startsWith(`${screen}-`));
	return (
		<div className="absolute flex flex-col gap-1.5" style={{ left, top }}>
			<div className="flex h-4 items-center gap-1.5 font-mono text-sm leading-xs">
				<span className={cn(active ? "text-thread" : "text-muted")}>{screen}</span>
			</div>
			<div className="relative h-[520px] w-[240px]">
				<CoffeeScreen
					screen={screen}
					scale="design"
					actionLabel={screen === "cart" ? "Betala med kort eller Klarna" : undefined}
				/>
				{active && frameSelections.length === 0 ? <FrameSelection /> : null}
				{frameSelections.map((id) => (
					<ElementSelection key={id} id={id} />
				))}
				{frameSelections.length > 0 ? (
					<div className="absolute left-0 top-[532px] flex items-center gap-1.5 rounded-xs border border-border-raised bg-raised px-2 py-unit font-mono text-2xs leading-[14px] whitespace-nowrap">
						<span className="text-muted">
							frames/{screen}/frame.tsx:{lineFor(frameSelections[0])}
						</span>
						<span className="text-muted">·</span>
						<span>{frameSelections.length > 1 ? `${frameSelections.length} elements` : "Open in editor"}</span>
					</div>
				) : null}
			</div>
		</div>
	);
}

function ElementSelection({ id }: { id: string }) {
	const boxes: Record<string, string> = {
		"menu-root": "inset-[2px]",
		"menu-header": "left-[12px] top-[12px] h-[40px] w-[100px]",
		"menu-title": "left-[12px] top-[12px] h-[22px] w-[58px]",
		"menu-address": "left-[12px] top-[34px] h-[16px] w-[88px]",
		"menu-products": "left-[12px] top-[62px] h-[132px] w-[216px]",
		"menu-checkout": "bottom-[12px] left-[12px] h-[42px] w-[216px]",
		"cart-root": "inset-[2px]",
		"cart-content": "left-[12px] top-[12px] h-[116px] w-[216px]",
		"cart-title": "left-[12px] top-[12px] h-[22px] w-[104px]",
		"cart-items": "left-[12px] top-[44px] h-[82px] w-[216px]",
		"cart-item-0": "left-[12px] top-[44px] h-[36px] w-[216px]",
		"cart-item-1": "left-[12px] top-[88px] h-[36px] w-[216px]",
		"cart-footer": "bottom-[12px] left-[12px] h-[84px] w-[216px]",
		"cart-total": "bottom-[57px] left-[12px] h-[27px] w-[216px]",
		"cart-total-label": "bottom-[60px] left-[12px] h-[22px] w-[58px] rounded-sm",
		"cart-total-value": "bottom-[60px] right-[12px] h-[22px] w-[50px] rounded-sm",
		"cart-pay": "bottom-[12px] left-[12px] h-[42px] w-[216px]",
		"receipt-root": "inset-[2px]",
		"receipt-mark": "left-[96px] top-[202px] h-12 w-12",
		"receipt-copy-group": "left-[46px] top-[257px] h-[64px] w-[148px]",
		"receipt-title": "left-[89px] top-[257px] h-6 w-[62px]",
		"receipt-order": "left-[84px] top-[282px] h-[18px] w-[72px]",
		"receipt-copy": "left-[48px] top-[301px] h-[17px] w-36",
	};
	return <div className={cn("pointer-events-none absolute rounded-[10px] border border-thread", boxes[id])} />;
}

function FrameSelection() {
	return (
		<>
			<div className="pointer-events-none absolute -inset-[3px] rounded-[14px] border-[1.5px] border-thread" />
			{[
				"-left-[7px] -top-[7px]",
				"-right-[7px] -top-[7px]",
				"-bottom-[7px] -left-[7px]",
				"-bottom-[7px] -right-[7px]",
			].map((position) => (
				<span
					key={position}
					className={cn("absolute h-2 w-2 rounded-[1.5px] border-[1.5px] border-thread bg-on-thread", position)}
				/>
			))}
			<div className="absolute left-[88px] top-[534px] rounded-xs bg-thread px-2 py-[3px] font-mono text-2xs text-on-thread leading-3">
				390 × 844
			</div>
		</>
	);
}

function lineFor(id: string) {
	for (const frame of frameOrder) {
		const element = findElement(tree[frame], id);
		if (element) return element.line;
	}
	return 1;
}

function findElement(elements: readonly ElementNode[], id: string): ElementNode | undefined {
	for (const element of elements) {
		if (element.id === id) return element;
		if (element.children) {
			const match = findElement(element.children, id);
			if (match) return match;
		}
	}
	return undefined;
}

function visibleElementIds(
	elements: readonly ElementNode[],
	expandedNodes: Readonly<Record<string, boolean>>,
): string[] {
	const ids: string[] = [];
	for (const element of elements) {
		ids.push(element.id);
		if (element.children && expandedNodes[element.id]) {
			ids.push(...visibleElementIds(element.children, expandedNodes));
		}
	}
	return ids;
}

function ChevronIcon({ className, open }: { className?: string; open: boolean }) {
	const reduceMotion = useReducedMotion();
	return (
		<motion.svg
			viewBox="0 0 12 12"
			className={cn("origin-center", className)}
			fill="none"
			aria-hidden="true"
			animate={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
			transition={reduceMotion ? { duration: 0 } : { duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
		>
			<path
				d="m4 2.5 3.5 3.5L4 9.5"
				stroke="currentColor"
				strokeWidth="1.25"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</motion.svg>
	);
}

function FrameIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 14 14" className={className} fill="none" aria-hidden="true">
			<path d="M3 1.75h5l3 3v7.5H3z" stroke="currentColor" strokeWidth="1.15" strokeLinejoin="round" />
			<path d="M8 1.75v3h3" stroke="currentColor" strokeWidth="1.15" strokeLinejoin="round" />
		</svg>
	);
}

function ThreadSvg() {
	return (
		<svg
			className="pointer-events-none absolute inset-0 h-full w-full"
			viewBox="0 0 1192 856"
			fill="none"
			aria-hidden="true"
		>
			<path d="M316 434C372 432 388 472 438 470" stroke="var(--color-thread)" strokeWidth="1.5" />
			<path d="m448 470-10-5v10Z" fill="var(--color-thread)" />
			<path
				d="M694 470C750 468 766 414 816 414"
				stroke="var(--color-thread)"
				strokeWidth="1.5"
				strokeDasharray="5 5"
			/>
			<path d="m826 414-10-5v10Z" fill="var(--color-thread)" />
		</svg>
	);
}
