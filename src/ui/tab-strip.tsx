import { useCallback, useEffect, useRef, useState } from "react";
import { CloseIcon, PlusIcon } from "./icons";

/**
 * The open projects, as tabs you can arrange.
 *
 * A tab is a place rather than a list entry, so the order is the person's: drag
 * one sideways and the others step aside for it, exactly as a browser's do. The
 * arrangement is machine state — the same session file the tabs are read from —
 * so it survives the reload it would otherwise be lost on.
 *
 * Nothing here measures the DOM twice. Every box is read once, when the press
 * lands, and the whole drag is arithmetic over those boxes: the tab under the
 * pointer is translated by how far the pointer travelled, and the tabs it has
 * passed shift by exactly its width plus the gap. That is why they can carry a
 * transition without ever chasing a layout that moved underneath them.
 */

export interface TabProject {
	root: string;
	name: string;
}

/** how far a press travels before it is a drag rather than a click */
const SLOP = 4;
/** the house curve, which every other transition in the app already wears */
const CURVE = "cubic-bezier(0.23,1,0.32,1)";

interface TabBox {
	readonly left: number;
	readonly width: number;
	readonly center: number;
}

interface DragLive {
	pointerId: number;
	root: string;
	from: number;
	startX: number;
	active: boolean;
	/** every tab's box as the press found it, which is what a shift is measured against */
	boxes: readonly TabBox[];
	/** where the drag stands, kept here too so the drop reads it without a render */
	shown: DragShown | null;
}

interface DragShown {
	readonly root: string;
	readonly from: number;
	readonly to: number;
	readonly dx: number;
	/** how far a displaced tab steps: the dragged tab's own width, and the gap it leaves */
	readonly step: number;
}

export function TabStrip({
	tabs,
	focused,
	onFocus,
	onClose,
	onReorder,
	onPick,
}: {
	tabs: readonly TabProject[];
	focused: string | null;
	onFocus: (root: string) => void;
	onClose: (root: string) => void;
	/** the roots in the order they were dragged into */
	onReorder: (order: readonly string[]) => void;
	/** the "+" door: open a project folder */
	onPick: () => void;
}) {
	const strip = useRef<HTMLElement | null>(null);
	const live = useRef<DragLive | null>(null);
	/** a press that became a drag must not also read as a click on the tab it left */
	const justDragged = useRef(false);
	const [drag, setDrag] = useState<DragShown | null>(null);

	const tabsRef = useRef(tabs);
	tabsRef.current = tabs;

	const stopDrag = useCallback(
		(drop: boolean) => {
			const current = live.current;
			live.current = null;
			setDrag(null);
			if (current === null) return;
			if (current.active) justDragged.current = true;
			// a tab opened or closed elsewhere mid-drag leaves the boxes this drag was
			// measured against naming a strip that is no longer on screen: the
			// arrangement it would write is about tabs somebody else already moved
			const stale = current.boxes.length !== tabsRef.current.length;
			const shown = current.shown;
			if (!drop || stale || !current.active || shown === null || shown.to === shown.from) return;
			onReorder(moved(tabsRef.current, shown.from, shown.to));
		},
		[onReorder],
	);

	useEffect(() => {
		const onMove = (event: PointerEvent) => {
			const current = live.current;
			if (current === null || event.pointerId !== current.pointerId) return;
			const travelled = event.clientX - current.startX;
			if (!current.active && Math.abs(travelled) > SLOP) current.active = true;
			if (!current.active) return;
			event.preventDefault();
			current.shown = placed(current, travelled);
			setDrag(current.shown);
		};
		const onUp = (event: PointerEvent) => {
			if (live.current?.pointerId === event.pointerId) stopDrag(true);
		};
		const onCancel = () => stopDrag(false);
		window.addEventListener("pointermove", onMove, { passive: false });
		window.addEventListener("pointerup", onUp);
		window.addEventListener("pointercancel", onCancel);
		return () => {
			window.removeEventListener("pointermove", onMove);
			window.removeEventListener("pointerup", onUp);
			window.removeEventListener("pointercancel", onCancel);
		};
	}, [stopDrag]);

	function pressTab(event: React.PointerEvent<HTMLElement>, root: string, from: number) {
		justDragged.current = false;
		if (event.button !== 0 || tabs.length < 2) return;
		const boxes = [...(strip.current?.querySelectorAll<HTMLElement>("[data-tab]") ?? [])].map((tab) => {
			const box = tab.getBoundingClientRect();
			return { left: box.left, width: box.width, center: box.left + box.width / 2 } satisfies TabBox;
		});
		if (boxes.length !== tabs.length) return;
		live.current = {
			pointerId: event.pointerId,
			root,
			from,
			startX: event.clientX,
			active: false,
			boxes,
			shown: null,
		};
	}

	return (
		<nav ref={strip} className="relative flex items-center gap-unit">
			{tabs.map((tab, index) => {
				const active = focused === tab.root;
				const lifted = drag?.root === tab.root;
				return (
					<div
						key={tab.root}
						data-tab=""
						className={`group flex h-[26px] touch-none items-center rounded-md ${
							active ? "border border-border-raised bg-raised" : ""
						} ${lifted ? "z-10" : ""}`}
						style={{
							transform: `translateX(${shiftOf(drag, index)}px)`,
							transition: lifted ? "none" : `transform 200ms ${CURVE}`,
						}}
						onPointerDown={(event) => pressTab(event, tab.root, index)}
					>
						<button
							type="button"
							className={`h-full pl-3 text-base leading-none ${
								active ? "pr-1 font-medium text-text" : "pr-1 text-muted hover:text-text"
							} ${lifted ? "cursor-grabbing" : ""}`}
							onClick={() => {
								if (justDragged.current) return;
								onFocus(tab.root);
							}}
							title={tab.root}
						>
							{tab.name}
						</button>
						<button
							type="button"
							className="flex h-full w-5 items-center justify-center pr-1 text-muted opacity-0 hover:text-text group-hover:opacity-100"
							onPointerDown={(event) => event.stopPropagation()}
							onClick={() => onClose(tab.root)}
							title="Close tab"
						>
							<CloseIcon />
						</button>
					</div>
				);
			})}
			<button
				type="button"
				className="flex h-[26px] w-[26px] items-center justify-center rounded-sm text-muted hover:bg-surface"
				onClick={onPick}
				title="Open a project folder"
			>
				<PlusIcon />
			</button>
		</nav>
	);
}

/**
 * Where the drag stands: how far the lifted tab has moved, and which slot it is
 * asking for.
 *
 * The slot is decided against the centres the tabs had before anything moved, so
 * the answer never depends on an answer it already gave. What passes a centre is
 * the lifted tab's leading edge rather than its own middle: tabs are as wide as
 * the names on them, and a wide tab dragged against the end of the strip can have
 * its left edge past a narrow neighbour while its middle is still to the right of
 * it. Travel is clamped to the strip, so a tab is never carried out past the ends
 * of the row it belongs to.
 */
function placed(current: DragLive, travelled: number): DragShown {
	const boxes = current.boxes;
	const held = boxes[current.from];
	const first = boxes[0];
	const last = boxes[boxes.length - 1];
	if (held === undefined || first === undefined || last === undefined) {
		return { root: current.root, from: current.from, to: current.from, dx: 0, step: 0 };
	}
	const dx = Math.max(first.left - held.left, Math.min(last.left + last.width - (held.left + held.width), travelled));
	const leading = held.left + dx;
	const trailing = leading + held.width;
	let to = current.from;
	while (to > 0 && leading < (boxes[to - 1]?.center ?? leading)) to -= 1;
	while (to < boxes.length - 1 && trailing > (boxes[to + 1]?.center ?? trailing)) to += 1;
	// the gap between two tabs, read off the boxes rather than named twice
	const next = boxes[1];
	const gap = next === undefined ? 0 : next.left - (first.left + first.width);
	return { root: current.root, from: current.from, to, dx, step: held.width + gap };
}

/** How far one tab has been pushed aside by the tab being dragged over it. */
function shiftOf(drag: DragShown | null, index: number): number {
	if (drag === null) return 0;
	if (index === drag.from) return drag.dx;
	if (drag.from < drag.to && index > drag.from && index <= drag.to) return -drag.step;
	if (drag.to < drag.from && index >= drag.to && index < drag.from) return drag.step;
	return 0;
}

/** The roots with one of them lifted out and put back at another index. */
function moved(tabs: readonly TabProject[], from: number, to: number): readonly string[] {
	const roots = tabs.map((tab) => tab.root);
	const held = roots[from];
	if (held === undefined) return roots;
	roots.splice(from, 1);
	roots.splice(to, 0, held);
	return roots;
}
