// Mirrors src/ui/tab-strip.tsx; specimen callbacks are optional.
import { AnimatePresence, LayoutGroup, MotionConfig, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { cn } from "shared/lib/utils";
import "./tab-strip.css";

/**
 * The open projects, as tabs you can arrange.
 *
 * A tab is a place rather than a list entry, so the order is the person's: drag
 * one sideways and the others step aside for it, exactly as a browser's do. The
 * arrangement is machine state — the same session file the tabs are read from —
 * so it survives the reload it would otherwise be lost on.
 *
 * A drag reads every box once, when the press
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
/** how long a tab takes to step aside, and how long the dropped one takes to land */
const SETTLE_MS = 200;

interface TabBox {
	readonly left: number;
	readonly width: number;
	readonly center: number;
}

interface DragLive {
	roots: readonly string[];
	pointerId: number;
	root: string;
	from: number;
	startX: number;
	lastX: number;
	startScrollLeft: number;
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
	/** the pointer has let go and the tab is travelling the last of the way itself */
	readonly settling: boolean;
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
	onFocus?: ((root: string) => void) | undefined;
	onClose?: ((root: string) => void) | undefined;
	/** the roots in the order they were dragged into */
	onReorder?: ((order: readonly string[]) => void) | undefined;
	/** the "+" door: open a project folder */
	onPick?: (() => void) | undefined;
}) {
	const strip = useRef<HTMLDivElement | null>(null);
	const layoutId = useId();
	const reduced = useReducedMotion();
	const [keyboard, setKeyboard] = useState(true);
	const duration = reduced || keyboard ? 0 : SETTLE_MS / 1000;
	const live = useRef<DragLive | null>(null);
	/** a press that became a drag must not also read as a click on the tab it left */
	const justDragged = useRef(false);
	/** the settle waiting to become the arrangement, and the timer it is waiting on */
	const landing = useRef<(() => void) | null>(null);
	const settle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	const [drag, setDrag] = useState<DragShown | null>(null);
	/** the one frame the order changes in, which nothing may animate across */
	const [quiet, setQuiet] = useState(false);

	const tabsRef = useRef(tabs);
	tabsRef.current = tabs;

	useLayoutEffect(() => {
		const element = strip.current;
		if (element === null || drag !== null) return;
		const activeRoot = tabs.find((tab) => tab.root === focused)?.root;
		const activeTab = [...element.querySelectorAll<HTMLElement>("[data-tab]")].find(
			(tab) => tab.dataset.tab === activeRoot,
		);
		const reveal = () => {
			if (live.current !== null || landing.current !== null) return;
			activeTab?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
		};
		reveal();
		const observer = new ResizeObserver(reveal);
		observer.observe(element);
		return () => observer.disconnect();
	}, [focused, tabs, drag]);

	/**
	 * The last frame of a drag: the list becomes the arrangement, and nothing moves.
	 *
	 * By the time this runs every tab is already standing where the new order puts
	 * it, held there by a transform. So the swap has to be invisible: the order
	 * changes and the transforms drop to zero in one commit, with transitions off
	 * for that frame. Leave them on and each tab animates from its offset back to
	 * zero while the layout under it has already jumped — the same distance
	 * travelled twice, which is the shudder this replaced.
	 */
	const land = useCallback(
		(commit: () => void) => {
			landing.current = () => {
				landing.current = null;
				setQuiet(true);
				commit();
				setDrag(null);
				// two frames: one for the commit to paint, one before transitions come back
				requestAnimationFrame(() => requestAnimationFrame(() => setQuiet(false)));
			};
			settle.current = setTimeout(() => landing.current?.(), reduced ? 0 : SETTLE_MS);
		},
		[reduced],
	);

	const stopDrag = useCallback(
		(drop: boolean) => {
			const current = live.current;
			live.current = null;
			if (current === null) {
				setDrag(null);
				return;
			}
			if (current.active) justDragged.current = true;
			// a tab opened or closed elsewhere mid-drag leaves the boxes this drag was
			// measured against naming a strip that is no longer on screen: the
			// arrangement it would write is about tabs somebody else already moved
			const stale = !sameRoots(current.roots, tabsRef.current);
			const shown = current.shown;
			if (!drop || stale || !current.active || shown === null) {
				setDrag(null);
				return;
			}
			// the tab stops being carried and travels the rest of the way itself, to the
			// exact left edge its slot has — a drop is a hand letting go, not a cut
			const rest = resting(current.boxes, shown.from, shown.to);
			setDrag({ ...shown, dx: rest, settling: true });
			if (shown.to === shown.from) {
				land(() => {});
				return;
			}
			const order = moved(tabsRef.current, shown.from, shown.to);
			land(() => {
				if (sameRoots(current.roots, tabsRef.current)) onReorder?.(order);
			});
		},
		[land, onReorder],
	);

	useEffect(() => {
		return () => {
			clearTimeout(settle.current);
			landing.current = null;
		};
	}, []);

	useEffect(() => {
		const element = strip.current;
		const move = (current: DragLive) => {
			// Keep the held tab under the pointer when the trackpad scrolls the strip.
			const travelled = current.lastX - current.startX + (element?.scrollLeft ?? 0) - current.startScrollLeft;
			current.shown = placed(current, travelled);
			setDrag(current.shown);
		};
		const onMove = (event: PointerEvent) => {
			const current = live.current;
			if (current === null || event.pointerId !== current.pointerId) return;
			current.lastX = event.clientX;
			const travelled = event.clientX - current.startX;
			if (!current.active && Math.abs(travelled) > SLOP) current.active = true;
			if (!current.active) return;
			event.preventDefault();
			move(current);
		};
		const onScroll = () => {
			if (live.current?.active) move(live.current);
		};
		const onUp = (event: PointerEvent) => {
			if (live.current?.pointerId === event.pointerId) stopDrag(true);
		};
		const onCancel = () => stopDrag(false);
		const onKey = () => {
			setKeyboard(true);
			justDragged.current = false;
		};
		const onPointer = () => setKeyboard(false);
		window.addEventListener("keydown", onKey, true);
		window.addEventListener("pointerdown", onPointer, true);
		window.addEventListener("pointermove", onMove, { passive: false });
		window.addEventListener("pointerup", onUp);
		window.addEventListener("pointercancel", onCancel);
		element?.addEventListener("scroll", onScroll);
		return () => {
			window.removeEventListener("keydown", onKey, true);
			window.removeEventListener("pointerdown", onPointer, true);
			window.removeEventListener("pointermove", onMove);
			window.removeEventListener("pointerup", onUp);
			window.removeEventListener("pointercancel", onCancel);
			element?.removeEventListener("scroll", onScroll);
		};
	}, [stopDrag]);

	function pressTab(event: React.PointerEvent<HTMLElement>, root: string, from: number) {
		justDragged.current = false;
		// a press landing inside a settle takes the arrangement now and carries
		// nothing: the boxes are still a transform away from where the tabs are about
		// to be, and a drag measured against those would aim at the wrong slots. The
		// press is still a press, so the tab it is on is focused by the click after it
		if (landing.current !== null) {
			clearTimeout(settle.current);
			landing.current();
			return;
		}
		if (event.button !== 0 || live.current !== null || tabs.length < 2) return;
		const boxes = [...(strip.current?.querySelectorAll<HTMLElement>("[data-tab]") ?? [])].map((tab) => {
			const box = tab.getBoundingClientRect();
			return { left: box.left, width: box.width, center: box.left + box.width / 2 } satisfies TabBox;
		});
		if (boxes.length !== tabs.length) return;
		live.current = {
			roots: tabs.map((tab) => tab.root),
			pointerId: event.pointerId,
			root,
			from,
			startX: event.clientX,
			lastX: event.clientX,
			startScrollLeft: strip.current?.scrollLeft ?? 0,
			active: false,
			boxes,
			shown: null,
		};
	}

	return (
		<MotionConfig reducedMotion="user" transition={{ duration, ease: [0.23, 1, 0.32, 1] }}>
			<LayoutGroup id={layoutId}>
				<nav aria-label="Open projects" className="project-tabs">
					<motion.div ref={strip} layoutScroll className="project-tabs-scroll">
						<AnimatePresence initial={false} mode="popLayout">
							{tabs.map((tab, index) => {
								const active = focused === tab.root;
								const lifted = drag?.root === tab.root;
								return (
									<motion.div
										key={tab.root}
										className={cn("project-tab-slot", lifted && "z-10")}
										layout={drag === null && !quiet ? "position" : false}
										initial={{ opacity: 0, scale: duration === 0 ? 1 : 0.96 }}
										animate={{ opacity: 1, scale: 1 }}
										exit={{ opacity: 0, scale: duration === 0 ? 1 : 0.96, pointerEvents: "none" }}
									>
										{/* Layout handles opening and closing on the outer box; the
										 * measured drag owns only this inner box's transform. */}
										<div
											data-tab={tab.root}
											className={cn("project-tab", active && "is-active", lifted && "is-dragging")}
											style={{
												transform: `translateX(${shiftOf(drag, index)}px)`,
												transition:
													quiet || reduced || (lifted && drag?.settling === false)
														? "none"
														: `transform ${SETTLE_MS}ms ${CURVE}`,
											}}
											onPointerDown={(event) => pressTab(event, tab.root, index)}
										>
											{active && (
												<motion.div
													layoutId="selection"
													className="project-tab-selection"
													transition={{ duration: drag !== null || quiet ? 0 : duration, ease: [0.23, 1, 0.32, 1] }}
												/>
											)}
											<button
												type="button"
												className="project-tab-label"
												aria-current={active ? "page" : undefined}
												onClick={() => {
													if (!justDragged.current) onFocus?.(tab.root);
												}}
												title={tab.root}
											>
												<span>{tab.name}</span>
											</button>
											<button
												type="button"
												className="project-tab-close"
												onPointerDown={(event) => event.stopPropagation()}
												onClick={() => onClose?.(tab.root)}
												aria-label={`Close ${tab.name}`}
												title="Close tab"
											>
												<svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
													<path
														d="m3 3 6 6m0-6L3 9"
														stroke="currentColor"
														strokeWidth="1.3"
														strokeLinecap="round"
													/>
												</svg>
											</button>
										</div>
									</motion.div>
								);
							})}
						</AnimatePresence>
					</motion.div>
					<motion.button
						layout="position"
						type="button"
						className="project-tabs-plus"
						onClick={onPick}
						title="Open a project folder"
					>
						<svg width="14" height="14" viewBox="0 0 12 12" fill="none" aria-hidden="true">
							<path d="M6 1.5v9M1.5 6h9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
						</svg>
					</motion.button>
				</nav>
			</LayoutGroup>
		</MotionConfig>
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
		return { root: current.root, from: current.from, to: current.from, dx: 0, step: 0, settling: false };
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
	return { root: current.root, from: current.from, to, dx, step: held.width + gap, settling: false };
}

/**
 * Where the lifted tab comes to rest: the exact offset its new slot sits at.
 *
 * Dragging left, the tab takes the left edge of the tab it displaced; dragging
 * right, it takes that tab's right edge less its own width. Both are read off the
 * boxes rather than summed from widths and gaps, so the number is the same one the
 * layout will produce a frame later and the swap underneath it moves nothing.
 */
function resting(boxes: readonly TabBox[], from: number, to: number): number {
	const held = boxes[from];
	const slot = boxes[to];
	if (held === undefined || slot === undefined) return 0;
	if (to <= from) return slot.left - held.left;
	return slot.left + slot.width - held.width - held.left;
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

function sameRoots(roots: readonly string[], tabs: readonly TabProject[]): boolean {
	return roots.length === tabs.length && roots.every((root, index) => tabs[index]?.root === root);
}
