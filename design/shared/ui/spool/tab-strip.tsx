// Mirrors src/ui/tab-strip.tsx; specimen callbacks are optional.
import {
	AnimatePresence,
	cancelFrame,
	cubicBezier,
	frame,
	LayoutGroup,
	MotionConfig,
	motion,
	useIsPresent,
	useReducedMotion,
} from "motion/react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { cn } from "shared/lib/utils";
import type { ProjectIcon } from "shared/lib/spool/project-icon";
import { ProjectMark } from "shared/ui/spool/project-icon";
import { ProjectTabMenu } from "shared/ui/spool/project-tab-menu";

/**
 * The open projects, as tabs you can arrange.
 *
 * A tab is a place rather than a list entry, so the order is the person's: drag
 * one sideways and the others step aside for it, exactly as a browser's do. The
 * arrangement is machine state — the same session file the tabs are read from —
 * so it survives the reload it would otherwise be lost on.
 *
 * Opening and closing are the slot's own width: a new tab grows from nothing in
 * its place and a closed one shrinks to nothing in its place, staying in the row
 * the whole way, so the tabs after it are carried by the layout itself rather
 * than by a second animation chasing the first. The spacing between tabs lives
 * inside each slot for the same reason: a slot at zero width leaves no gap behind.
 *
 * A drag is arithmetic over the slots' boxes: the tab under the pointer is
 * translated to wherever keeps it under the pointer, and the tabs it has passed
 * shift by exactly its width. The boxes are the untransformed slots, read again
 * as the drag goes, so a tab still opening or closing elsewhere in the row moves
 * the arithmetic with it instead of leaving the drag aimed at a strip that has
 * since moved.
 */

export interface TabProject {
	root: string;
	name: string;
	/** What leads the name: the project's icon file or its repo's favicon; absent, its first letter. */
	icon?: ProjectIcon | undefined;
	/** A team project's local copy: its team's address, whose mark it wears in its icon's corner. */
	teamAddress?: string | undefined;
	/** The copy's sync is paused, and its team mark is hollow. */
	paused?: boolean | undefined;
}

/** how far a press travels before it is a drag rather than a click */
const SLOP = 4;
/** the house curve, which every other transition in the app already wears */
const CURVE = "cubic-bezier(0.23,1,0.32,1)";
const EASE = [0.23, 1, 0.32, 1] as const;
const easing = cubicBezier(...EASE);
/** how long a tab takes to open, close or step aside, and the dropped one takes to land */
const SETTLE_MS = 200;
/** how long the strip takes to scroll the focused tab into view */
const REVEAL_MS = 260;

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
	/** where on the held tab the pointer took hold, in the strip's own coordinates */
	grab: number;
	active: boolean;
	/** where the drag stands, kept here too so the drop reads it without a render */
	shown: DragShown | null;
}

interface DragShown {
	/** the order the drag was measured against */
	readonly roots: readonly string[];
	readonly root: string;
	readonly from: number;
	readonly to: number;
	readonly dx: number;
	/** how far a displaced tab steps: the dragged tab's own width, and the gap it leaves */
	readonly step: number;
	/** the pointer has let go and the tab is travelling the last of the way itself */
	readonly settling: boolean;
}

interface Landing {
	readonly roots: readonly string[];
	readonly run: () => void;
}

export function TabStrip({
	tabs,
	focused,
	onFocus,
	onClose,
	onReorder,
	onPick,
	onExport,
	onChangeIcon,
	onRemoveIcon,
	menuAt,
}: {
	tabs: readonly TabProject[];
	focused: string | null;
	onFocus?: ((root: string) => void) | undefined;
	onClose?: ((root: string) => void) | undefined;
	/** the roots in the order they were dragged into */
	onReorder?: ((order: readonly string[]) => void) | undefined;
	/** the "+" door: open a project folder */
	onPick?: (() => void) | undefined;
	onExport?: ((project: TabProject) => void) | undefined;
	/** "Change icon…": choose an image for the project. */
	onChangeIcon?: ((project: TabProject) => void) | undefined;
	/** "Remove icon", offered while the icon is the project's own file. */
	onRemoveIcon?: ((project: TabProject) => void) | undefined;
	/** Specimen only: the root whose menu starts open, as a right-click on its tab leaves it. */
	menuAt?: string | undefined;
}) {
	const [menu, setMenu] = useState<{ project: TabProject; x: number; y: number; anchor: HTMLElement } | null>(null);
	const strip = useRef<HTMLDivElement | null>(null);
	const layoutId = useId();
	const reduced = useReducedMotion() === true;
	const duration = reduced ? 0 : SETTLE_MS / 1000;
	/** the last input was a key, so a switch of tab is a jump rather than a slide */
	const [keyboard, setKeyboard] = useState(true);
	const live = useRef<DragLive | null>(null);
	/** a press that became a drag must not also read as a click on the tab it left */
	const justDragged = useRef(false);
	/** the settle waiting to become the arrangement, and the timer it is waiting on */
	const landing = useRef<Landing | null>(null);
	const settle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	const [drag, setDrag] = useState<DragShown | null>(null);
	/** the one frame the order changes in, which nothing may animate across */
	const [quiet, setQuiet] = useState(false);
	/** tabs drawn on the first render were already open: only later ones open */
	const mounted = useRef(false);
	/** the scroll carrying the focused tab into view */
	const reveal = useRef<{ stop: () => void } | null>(null);

	const tabsRef = useRef(tabs);
	tabsRef.current = tabs;
	const focusedRef = useRef(focused);
	focusedRef.current = focused;

	// The highlight slides when a click moves it and jumps when a key does, as a
	// switch should feel under each. A focus handed on because its tab closed
	// slides either way: the tab it leaves is still visibly going.
	const lastFocus = useRef(focused);
	const handedOn =
		lastFocus.current !== focused &&
		lastFocus.current !== null &&
		!tabs.some((tab) => tab.root === lastFocus.current);
	useEffect(() => {
		lastFocus.current = focused;
	});
	const selectionDuration = drag !== null || quiet || (keyboard && !handedOn) ? 0 : duration;

	useEffect(() => {
		mounted.current = true;
	}, []);

	const stopReveal = useCallback(() => {
		reveal.current?.stop();
		reveal.current = null;
	}, []);

	// Bring the tab focus moves to into view. Only a move of focus does: a strip
	// someone has scrolled away from the focused tab stays where they put it while
	// other tabs open and close. A tab that is opening is followed while it grows,
	// so the strip arrives where the finished tab needs it in one movement.
	useLayoutEffect(() => {
		stopReveal();
		const element = strip.current;
		if (element === null || focused === null || live.current !== null || landing.current !== null) return;
		const from = element.scrollLeft;
		const step = (progress: number) => {
			const slot = slotOf(element, focused);
			if (slot === null) return;
			const target = revealing(element, slot, from);
			if (target !== from) element.scrollLeft = from + (target - from) * progress;
		};
		if (reduced || !mounted.current) {
			step(1);
			return;
		}
		const start = performance.now();
		// after motion has written the frame's widths, so the growing tab is read as painted
		const tick = () => {
			const progress = Math.min(1, (performance.now() - start) / REVEAL_MS);
			step(easing(progress));
			if (progress === 1) stopReveal();
		};
		frame.postRender(tick, true);
		reveal.current = { stop: () => cancelFrame(tick) };
	}, [focused, reduced, stopReveal]);

	useEffect(() => stopReveal, [stopReveal]);

	// A strip that is resized (the window, the header) keeps the focused tab in view.
	useEffect(() => {
		const element = strip.current;
		if (element === null) return;
		const observer = new ResizeObserver(() => {
			if (reveal.current !== null || live.current !== null || landing.current !== null) return;
			const root = focusedRef.current;
			const slot = root === null ? null : slotOf(element, root);
			if (slot !== null) element.scrollLeft = revealing(element, slot, element.scrollLeft);
		});
		observer.observe(element);
		return () => observer.disconnect();
	}, []);

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
		(roots: readonly string[], commit: () => void) => {
			const pending: Landing = {
				roots,
				run: () => {
					if (landing.current !== pending) return;
					landing.current = null;
					setQuiet(true);
					commit();
					setDrag(null);
					// two frames: one for the commit to paint, one before transitions come back
					requestAnimationFrame(() => requestAnimationFrame(() => setQuiet(false)));
				},
			};
			landing.current = pending;
			settle.current = setTimeout(pending.run, reduced ? 0 : SETTLE_MS);
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
			const shown = current.shown;
			if (!drop || !current.active || shown === null || !sameRoots(current.roots, tabsRef.current)) {
				setDrag(null);
				return;
			}
			// the tab stops being carried and travels the rest of the way itself, to the
			// exact left edge its slot has — a drop is a hand letting go, not a cut
			const element = strip.current;
			const boxes = element === null ? null : measure(element, current.roots)?.boxes;
			const rest = boxes == null ? shown.dx : resting(boxes, shown.from, shown.to);
			setDrag({ ...shown, dx: rest, settling: true });
			if (shown.to === shown.from) {
				land(current.roots, () => {});
				return;
			}
			const order = moved(current.roots, shown.from, shown.to);
			land(current.roots, () => {
				if (sameRoots(current.roots, tabsRef.current)) onReorder?.(order);
			});
		},
		[land, onReorder],
	);

	// A tab opened or closed elsewhere mid-drag leaves the drag naming a strip that
	// is no longer on screen, and the arrangement it would write is about tabs
	// somebody else already moved. It lets go instead: everything steps back into
	// the row as it now is, and nothing is written.
	useLayoutEffect(() => {
		const current = live.current;
		if (current !== null && !sameRoots(current.roots, tabs)) {
			live.current = null;
			if (current.active) justDragged.current = true;
			setDrag(null);
		}
		const pending = landing.current;
		if (pending !== null && !sameRoots(pending.roots, tabs)) {
			clearTimeout(settle.current);
			landing.current = null;
			setDrag(null);
		}
	}, [tabs]);

	useEffect(() => {
		return () => {
			clearTimeout(settle.current);
			landing.current = null;
		};
	}, []);

	// A specimen opens a menu where a right-click on its tab would have.
	useLayoutEffect(() => {
		if (menuAt === undefined) return;
		const project = tabsRef.current.find((tab) => tab.root === menuAt);
		const label = strip.current?.querySelector<HTMLElement>(`[data-tab="${CSS.escape(menuAt)}"] .project-tab-label`);
		if (project === undefined || !label) return;
		const box = label.getBoundingClientRect();
		setMenu({ project, x: box.left + 14, y: box.bottom - 4, anchor: label });
		// the menu takes focus for the keyboard; a still picture has no use for its ring
		const rest = requestAnimationFrame(() => requestAnimationFrame(() => (document.activeElement as HTMLElement | null)?.blur()));
		return () => cancelAnimationFrame(rest);
	}, [menuAt]);

	// The context menu belongs to a tab; it goes with the tab.
	useEffect(() => {
		if (menu !== null && !tabs.some((tab) => tab.root === menu.project.root)) setMenu(null);
	}, [menu, tabs]);

	useEffect(() => {
		const element = strip.current;
		const move = (current: DragLive, now = false) => {
			if (element === null) return;
			const measured = measure(element, current.roots);
			if (measured === null) return;
			const shown = placed(current, measured.boxes, current.lastX - measured.origin - current.grab);
			if (current.shown !== null && sameShown(current.shown, shown)) return;
			current.shown = shown;
			if (now) flushSync(() => setDrag(shown));
			else setDrag(shown);
		};
		// The pointer can hold still while the row moves under it (a tab opening or
		// closing, the strip scrolling), so the drag is placed again on every frame
		// it lasts: after motion has written that frame's widths, and before paint.
		const follow = () => {
			const current = live.current;
			if (current === null || !current.active) cancelFrame(follow);
			else move(current, true);
		};
		const onMove = (event: PointerEvent) => {
			const current = live.current;
			if (current === null || event.pointerId !== current.pointerId) return;
			current.lastX = event.clientX;
			if (!current.active && Math.abs(event.clientX - current.startX) > SLOP) {
				current.active = true;
				stopReveal();
				frame.postRender(follow, true);
			}
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
		// A wheel that only turns vertically still means "show me more tabs".
		const onWheel = (event: WheelEvent) => {
			if (element === null || event.ctrlKey) return;
			stopReveal();
			if (element.scrollWidth <= element.clientWidth || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
			event.preventDefault();
			const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientWidth : 1;
			element.scrollLeft += event.deltaY * unit;
		};
		window.addEventListener("keydown", onKey, true);
		window.addEventListener("pointerdown", onPointer, true);
		window.addEventListener("pointermove", onMove, { passive: false });
		window.addEventListener("pointerup", onUp);
		window.addEventListener("pointercancel", onCancel);
		element?.addEventListener("scroll", onScroll);
		element?.addEventListener("wheel", onWheel, { passive: false });
		element?.addEventListener("pointerdown", stopReveal);
		return () => {
			cancelFrame(follow);
			window.removeEventListener("keydown", onKey, true);
			window.removeEventListener("pointerdown", onPointer, true);
			window.removeEventListener("pointermove", onMove);
			window.removeEventListener("pointerup", onUp);
			window.removeEventListener("pointercancel", onCancel);
			element?.removeEventListener("scroll", onScroll);
			element?.removeEventListener("wheel", onWheel);
			element?.removeEventListener("pointerdown", stopReveal);
		};
	}, [stopDrag, stopReveal]);

	function pressTab(event: React.PointerEvent<HTMLElement>, root: string, from: number) {
		justDragged.current = false;
		// a press landing inside a settle takes the arrangement now and carries
		// nothing: the boxes are still a transform away from where the tabs are about
		// to be, and a drag measured against those would aim at the wrong slots. The
		// press is still a press, so the tab it is on is focused by the click after it
		if (landing.current !== null) {
			clearTimeout(settle.current);
			landing.current.run();
			return;
		}
		const element = strip.current;
		if (event.button !== 0 || live.current !== null || tabs.length < 2 || element === null) return;
		const roots = tabs.map((tab) => tab.root);
		const measured = measure(element, roots);
		const held = measured?.boxes[from];
		if (measured === null || held === undefined) return;
		live.current = {
			roots,
			pointerId: event.pointerId,
			root,
			from,
			startX: event.clientX,
			lastX: event.clientX,
			grab: event.clientX - measured.origin - held.left,
			active: false,
			shown: null,
		};
	}

	return (
		<MotionConfig reducedMotion="user" transition={{ duration, ease: EASE }}>
			<LayoutGroup id={layoutId}>
				<nav aria-label="Open projects" className="project-tabs flex items-center min-w-0 h-full">
					<motion.div
						ref={strip}
						layoutScroll
						className="project-tabs-scroll relative z-[1] flex items-center min-w-0 h-full px-[1px] py-0 overflow-x-auto overflow-y-hidden [scrollbar-width:none]"
					>
						<AnimatePresence initial={false}>
							{tabs.map((tab, index) => (
								<Tab
									key={tab.root}
									tab={tab}
									active={focused === tab.root}
									shift={shiftOf(drag, tab.root)}
									lifted={drag?.root === tab.root}
									carried={drag?.root === tab.root && !drag.settling}
									layout={drag === null && !quiet}
									still={quiet || reduced}
									opening={mounted.current && !reduced}
									selectionDuration={selectionDuration}
									onPress={(event) => pressTab(event, tab.root, index)}
									onPick={() => {
										if (!justDragged.current) onFocus?.(tab.root);
									}}
									onClose={() => onClose?.(tab.root)}
									onMenu={(x, y, anchor) => setMenu({ project: tab, x, y, anchor })}
								/>
							))}
						</AnimatePresence>
					</motion.div>
					<button
						type="button"
						className="project-tabs-plus relative flex items-center justify-center shrink-0 w-[32px] h-[30px] ml-[6px] rounded-[6px] [color:var(--color-muted)] cursor-pointer before:content-[''] before:absolute before:[inset:3px_4px] before:rounded-[5px] before:pointer-events-none [&_svg]:relative [&:hover]:before:[background:light-dark(#00000006,#ffffff06)] [&:hover]:text-text"
						onClick={onPick}
						title="New project"
						aria-label="New project"
					>
						<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
							<path d="M6 1.5v9M1.5 6h9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
						</svg>
					</button>
				</nav>
			</LayoutGroup>
			{menu && (
				<ProjectTabMenu
					{...menu}
					// the tab as it is now: an icon changed while the menu is open shows in its header
					project={tabs.find((tab) => tab.root === menu.project.root) ?? menu.project}
					onClose={() => setMenu(null)}
					onExport={() => onExport?.(menu.project)}
					onCloseTab={() => onClose?.(menu.project.root)}
					{...(onChangeIcon === undefined ? {} : { onChangeIcon: () => onChangeIcon(menu.project) })}
					{...(onRemoveIcon === undefined ? {} : { onRemoveIcon: () => onRemoveIcon(menu.project) })}
				/>
			)}
		</MotionConfig>
	);
}

/**
 * One tab in its slot.
 *
 * The slot is what opens and closes: its width runs between nothing and the
 * tab's own, clipped sideways while it does so the tab is uncovered rather than
 * squeezed. A closing tab is already gone as far as anything but the eye is
 * concerned — not a target, not focusable, not a box a drag measures.
 */
function Tab({
	tab,
	active,
	shift,
	lifted,
	carried,
	layout,
	still,
	opening,
	selectionDuration,
	onPress,
	onPick,
	onClose,
	onMenu,
}: {
	tab: TabProject;
	active: boolean;
	shift: number;
	lifted: boolean;
	carried: boolean;
	layout: boolean;
	still: boolean;
	opening: boolean;
	selectionDuration: number;
	onPress: (event: React.PointerEvent<HTMLElement>) => void;
	onPick: () => void;
	onClose: () => void;
	onMenu: (x: number, y: number, anchor: HTMLElement) => void;
}) {
	const present = useIsPresent();
	const [growing, setGrowing] = useState(opening);
	// a tab reopened while it was still closing grows back from where it got to
	const [wasPresent, setWasPresent] = useState(present);
	if (present !== wasPresent) {
		setWasPresent(present);
		if (present && opening) setGrowing(true);
	}
	const slot = useRef<HTMLDivElement | null>(null);
	// A close shrinks from the width the tab has on screen, named in pixels. Left to
	// find it from "auto", motion lays the row out once at the end width to measure
	// it, and a scrolled strip snaps its scroll to that shorter row before a single
	// frame has moved.
	const closingFrom = useRef<number | null>(null);
	/** the keyboard was in this tab when it closed, and goes on to a neighbour */
	const hadFocus = useRef(false);
	if (present) closingFrom.current = null;
	else if (closingFrom.current === null) {
		closingFrom.current = slot.current?.getBoundingClientRect().width ?? 0;
		hadFocus.current = slot.current?.contains(document.activeElement) ?? false;
	}
	useLayoutEffect(() => {
		if (present || !hadFocus.current) return;
		hadFocus.current = false;
		const next = neighbour(slot.current, "nextElementSibling") ?? neighbour(slot.current, "previousElementSibling");
		next?.querySelector<HTMLElement>(".project-tab-label")?.focus();
	}, [present]);
	return (
		<motion.div
			ref={slot}
			data-tab-slot={present ? tab.root : undefined}
			className={cn(
				"project-tab-slot relative shrink-0 h-[36px]",
				lifted && "z-10",
				(growing || !present) && "overflow-x-clip",
				!present && "pointer-events-none",
			)}
			layout={layout && present ? "position" : false}
			initial={{ width: 0, opacity: 0 }}
			animate={{ width: "auto", opacity: 1 }}
			exit={{ width: closingFrom.current === null ? 0 : [closingFrom.current, 0], opacity: 0 }}
			onAnimationComplete={() => setGrowing(false)}
		>
			{/* The slot opens, closes and carries layout moves; the measured drag owns
			 * only this inner box's transform. */}
			<div
				data-tab={present ? tab.root : undefined}
				inert={!present}
				aria-hidden={present ? undefined : true}
				className={cn(
					"project-tab relative flex items-center w-max min-w-[112px] max-w-[228px] h-full mx-[1px] [border-radius:8px_8px_0_0] touch-none select-none [&.is-active_.project-tab-label]:text-text [&.is-dragging_.project-tab-label]:cursor-grabbing [&:is(:hover,:focus-within,.is-active)_.project-tab-close]:opacity-100 [&:not(.is-active):hover]:[background:light-dark(#00000004,#ffffff04)]",
					active && present && "is-active",
					lifted && "is-dragging",
				)}
				style={{
					transform: `translateX(${shift}px)`,
					transition: still || carried ? "none" : `transform ${SETTLE_MS}ms ${CURVE}`,
				}}
				onPointerDown={onPress}
				// the middle button closes a tab, as it does in a browser, and must not
				// start the page's autoscroll on the way
				onMouseDown={(event) => {
					if (event.button === 1) event.preventDefault();
				}}
				onAuxClick={(event) => {
					if (event.button !== 1) return;
					event.preventDefault();
					onClose();
				}}
			>
				{/* a tab still opening is clipped to its growing slot, which would hide a
				 * selection sliding in from elsewhere: it opens already selected instead */}
				{active && present && (
					<motion.div
						layoutId="selection"
						className="project-tab-selection absolute [inset:0_0_-4px] [border-width:1px_1px_0] border-solid border-border [border-radius:8px_8px_0_0] bg-canvas pointer-events-none"
						transition={{ duration: growing ? 0 : selectionDuration, ease: EASE }}
					/>
				)}
				<button
					type="button"
					className="project-tab-label relative flex items-center gap-[10px] flex-auto min-w-0 h-full [padding:0_38px_0_10px] [font:var(--type-control)] [color:var(--color-muted)] cursor-default after:content-[''] after:absolute after:[inset:0_0_-4px]"
					onContextMenu={(event) => {
						event.preventDefault();
						onMenu(event.clientX, event.clientY, event.currentTarget);
					}}
					onKeyDown={(event) => {
						if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
							event.preventDefault();
							const box = event.currentTarget.getBoundingClientRect();
							onMenu(box.left, box.bottom, event.currentTarget);
						}
					}}
					aria-current={active ? "page" : undefined}
					onClick={onPick}
					title={tab.root}
				>
					<ProjectMark
						name={tab.name}
						icon={tab.icon}
						team={tab.teamAddress}
						paused={tab.paused}
						// the gap round the badge is the colour the tab is drawn on
						cut={active && present ? "var(--color-canvas)" : "var(--color-bg)"}
					/>
					<span className="project-tab-name min-w-0 overflow-hidden whitespace-nowrap text-ellipsis">
						{tab.name}
					</span>
				</button>
				<button
					type="button"
					className="project-tab-close absolute right-[4px] flex items-center justify-center shrink-0 w-[24px] h-[24px] rounded-[5px] [color:var(--color-muted)] opacity-0 cursor-pointer [&:hover]:[background:light-dark(#00000012,#ffffff12)] [&:hover]:text-text"
					onPointerDown={(event) => event.stopPropagation()}
					onClick={onClose}
					aria-label={`Close ${tab.name}`}
					title="Close tab"
				>
					<svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
						<path d="m3 3 6 6m0-6L3 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
					</svg>
				</button>
			</div>
		</motion.div>
	);
}

/**
 * Every open tab's slot, in the order given, in the strip's own coordinates: the
 * scrolled content's, so a box does not move when the strip scrolls. Slots carry
 * no drag transform, so these are where the tabs stand in the row, not where a
 * drag is showing them. Null while any of them is missing from the row.
 */
function measure(element: HTMLElement, roots: readonly string[]): { origin: number; boxes: TabBox[] } | null {
	const origin = element.getBoundingClientRect().left - element.scrollLeft;
	const slots = new Map<string, HTMLElement>();
	for (const slot of element.querySelectorAll<HTMLElement>("[data-tab-slot]")) {
		if (slot.dataset.tabSlot !== undefined) slots.set(slot.dataset.tabSlot, slot);
	}
	const boxes: TabBox[] = [];
	for (const root of roots) {
		const slot = slots.get(root);
		if (slot === undefined) return null;
		const box = slot.getBoundingClientRect();
		const left = box.left - origin;
		boxes.push({ left, width: box.width, center: left + box.width / 2 });
	}
	return { origin, boxes };
}

/** The nearest open tab's slot beside a slot, on one side. */
function neighbour(slot: Element | null, side: "nextElementSibling" | "previousElementSibling"): HTMLElement | null {
	for (let at = slot?.[side] ?? null; at !== null; at = at[side]) {
		if (at instanceof HTMLElement && at.dataset.tabSlot !== undefined) return at;
	}
	return null;
}

function slotOf(element: HTMLElement, root: string): HTMLElement | null {
	for (const slot of element.querySelectorAll<HTMLElement>("[data-tab-slot]")) {
		if (slot.dataset.tabSlot === root) return slot;
	}
	return null;
}

/**
 * The scroll that brings a slot fully into view from `from`, with the strip's own
 * padding beside it, moving no further than it must.
 */
function revealing(element: HTMLElement, slot: HTMLElement, from: number): number {
	const origin = element.getBoundingClientRect().left - element.scrollLeft;
	const box = slot.getBoundingClientRect();
	const pad = Number.parseFloat(getComputedStyle(element).paddingLeft) || 0;
	const left = box.left - origin - pad;
	const right = box.left - origin + box.width + pad;
	const view = element.clientWidth;
	if (left < from) return left;
	if (right > from + view) return Math.min(left, right - view);
	return from;
}

/**
 * Where the drag stands: how far the lifted tab has moved, and which slot it is
 * asking for.
 *
 * `want` is the left edge the pointer is holding the tab at. The slot is decided
 * against the centres the tabs have in the row, which no drag transform touches,
 * so the answer never depends on an answer it already gave. What passes a centre
 * is the lifted tab's leading edge rather than its own middle: tabs are as wide as
 * the names on them, and a wide tab dragged against the end of the strip can have
 * its left edge past a narrow neighbour while its middle is still to the right of
 * it. Travel is clamped to the strip, so a tab is never carried out past the ends
 * of the row it belongs to.
 */
function placed(current: DragLive, boxes: readonly TabBox[], want: number): DragShown {
	const held = boxes[current.from];
	const first = boxes[0];
	const last = boxes[boxes.length - 1];
	const base = { roots: current.roots, root: current.root, from: current.from, settling: false };
	if (held === undefined || first === undefined || last === undefined)
		return { ...base, to: current.from, dx: 0, step: 0 };
	const dx = Math.max(
		first.left - held.left,
		Math.min(last.left + last.width - (held.left + held.width), want - held.left),
	);
	const leading = held.left + dx;
	const trailing = leading + held.width;
	let to = current.from;
	while (to > 0 && leading < (boxes[to - 1]?.center ?? leading)) to -= 1;
	while (to < boxes.length - 1 && trailing > (boxes[to + 1]?.center ?? trailing)) to += 1;
	// the gap between two tabs, read off the boxes rather than named twice
	const next = boxes[1];
	const gap = next === undefined ? 0 : next.left - (first.left + first.width);
	return { ...base, to, dx, step: held.width + gap };
}

function sameShown(a: DragShown, b: DragShown): boolean {
	return a.to === b.to && a.dx === b.dx && a.step === b.step && a.settling === b.settling;
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
function shiftOf(drag: DragShown | null, root: string): number {
	if (drag === null) return 0;
	const index = drag.roots.indexOf(root);
	if (index === -1) return 0;
	if (index === drag.from) return drag.dx;
	if (drag.from < drag.to && index > drag.from && index <= drag.to) return -drag.step;
	if (drag.to < drag.from && index >= drag.to && index < drag.from) return drag.step;
	return 0;
}

/** The roots with one of them lifted out and put back at another index. */
function moved(roots: readonly string[], from: number, to: number): readonly string[] {
	const order = [...roots];
	const held = order[from];
	if (held === undefined) return order;
	order.splice(from, 1);
	order.splice(to, 0, held);
	return order;
}

function sameRoots(roots: readonly string[], tabs: readonly TabProject[]): boolean {
	return roots.length === tabs.length && roots.every((root, index) => tabs[index]?.root === root);
}

/**
 * Which tab takes focus when the focused one closes, as a browser decides: the
 * tab after it, or the one before when it was last. Null only when it was the
 * only tab, and then Home is what is left.
 */
export function focusAfterClose(roots: readonly string[], closing: string): string | null {
	const index = roots.indexOf(closing);
	if (index === -1) return null;
	return roots[index + 1] ?? roots[index - 1] ?? null;
}
