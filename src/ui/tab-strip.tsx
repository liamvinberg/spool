import {
	AnimatePresence,
	cancelFrame,
	cubicBezier,
	frame,
	MotionConfig,
	motion,
	usePresence,
	useReducedMotion,
} from "motion/react";
import { type RefObject, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import type { ProjectIcon } from "./api";
import { PRESENCE_INK } from "./canvas/presence-faces";
import { cn } from "./cn";
import { CloseIcon, HomeIcon, PlusIcon } from "./icons";
import { IconButton } from "./primitives/actions";
import { ProjectMark } from "./project-icon";
import { ProjectTabMenu } from "./project-tab-menu";
import type { TabMate } from "./tab-presence";

/**
 * Home and the open projects, as tabs you can arrange.
 *
 * The focused tab is the sheet: one shape, the page below reaching up into the
 * bar, that travels from tab to tab and pours into what is under it through
 * flared feet. It is the canvas under a project and the window under Home.
 *
 * A full strip compresses, as a browser's does: every tab gives up width alike
 * down to its mark, the focused one keeps its name, and after a close by the
 * pointer the widths hold until the pointer leaves the strip, so the next close
 * button lands under it. Past that the strip scrolls.
 *
 * A tab is a place rather than a list entry, so the order is the person's: drag
 * one sideways and the others step aside for it, exactly as a browser's do. The
 * arrangement is machine state (the same session file the tabs are read from),
 * so it survives the reload it would otherwise be lost on.
 *
 * Opening and closing are the slot's own width: a new tab grows from nothing in
 * its place and a closed one shrinks to nothing in its place, staying in the row
 * the whole way, so the tabs after it are carried by the layout itself rather
 * than by a second animation chasing the first.
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
	/** Who else is in a team project: a dot each after the name while another tab is focused (task 139). */
	here?: readonly TabMate[] | undefined;
}

/** The most dots a tab draws after its name; the rest are a count, and everyone is in the pills it swells into. */
export const DOTS_SHOWN = 3;

/** how far a press travels before it is a drag rather than a click */
const SLOP = 4;
/** the sheet's corners and its feet, radius-md */
const FOOT = 8;
/** the sheet stands from this far under the bar's top to its floor */
const SHEET_TOP = 4;
/** the sheet's target when Home is focused */
const HOME = "home";
/** below this a tab is too narrow for its name, and a tab not focused drops its close */
const NARROW = 88;

/**
 * Between 88 and 56 wide the name fades out and the mark eases to the middle; at 56
 * and under it is centred. Continuous at both ends, so a tab compressing or opening
 * never jumps. Both read the slot's width, which `--tw` carries unitless.
 */
const FACE_PAD =
	"clamp(var(--spacing) * 3, min((var(--tw, 200) * 1px - var(--spacing) * 4) / 2, var(--spacing) * 3 + (88px - var(--tw, 200) * 1px) / 4), var(--spacing) * 5)";
const NAME_SHOWN = "pow(clamp(0, (var(--tw, 200) - 56) / 32, 1), 3)";
const NAME_FADE = "linear-gradient(to right, black calc(100% - var(--spacing) * 3), transparent)";

/** Shipped values of the motion scale, for a page that carries no theme (a unit test's). */
const UNTHEMED = { base: 180, slow: 260, snap: [0.32, 0.72, 0, 1] };

/**
 * The motion scale as the page has it, so the script moves on the same tokens as
 * the styles and reduced motion, which zeroes the scale, stills both.
 */
function motionScale(element: Element) {
	const style = getComputedStyle(element);
	const ms = (name: "base" | "slow") => {
		const value = style.getPropertyValue(`--transition-duration-${name}`).trim();
		if (value === "") return UNTHEMED[name];
		return Number.parseFloat(value) * (value.endsWith("ms") ? 1 : 1000);
	};
	const snap = style
		.getPropertyValue("--ease-snap")
		.match(/-?[\d.]+/g)
		?.map(Number);
	const curve = (snap?.length === 4 ? snap : UNTHEMED.snap) as [number, number, number, number];
	return { base: ms("base"), slow: ms("slow"), curve };
}

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
	onHome,
	onFocus,
	onClose,
	onReorder,
	onPick,
	onExport,
	onChangeIcon,
	onRemoveIcon,
	onMatchTeam,
	onHistory,
}: {
	tabs: readonly TabProject[];
	/** the focused project's root; null is Home */
	focused: string | null;
	onHome: () => void;
	onFocus: (root: string) => void;
	onClose: (root: string) => void;
	/** the roots in the order they were dragged into */
	onReorder: (order: readonly string[]) => void;
	/** the "+" door: open a project folder */
	onPick: () => void;
	onExport?: (project: TabProject) => void;
	/** "Change icon…": choose an image for the project. */
	onChangeIcon?: (project: TabProject) => void;
	/** "Remove icon", offered while the icon is the project's own file. */
	onRemoveIcon?: (project: TabProject) => void;
	/** "Match the team", offered on a team project's tab. */
	onMatchTeam?: (project: TabProject) => void;
	/** "History…" on a team project's tab: its team history (spool#187). */
	onHistory?: (project: TabProject) => void;
}) {
	const [menu, setMenu] = useState<{ project: TabProject; x: number; y: number; anchor: HTMLElement } | null>(null);
	const nav = useRef<HTMLElement | null>(null);
	const strip = useRef<HTMLDivElement | null>(null);
	const reduced = useReducedMotion() === true;
	const scale = useMemo(() => motionScale(document.documentElement), []);
	const settleMs = reduced ? 0 : scale.base;
	const easing = useMemo(() => cubicBezier(...scale.curve), [scale]);
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
	/** each tab's width when one was closed under the pointer, held until the pointer leaves */
	const [held, setHeld] = useState<ReadonlyMap<string, number> | null>(null);
	// a tab opened since is a new row, and nothing in it is waiting under the pointer
	const holding = held !== null && tabs.every((tab) => held.has(tab.root)) ? held : null;

	const tabsRef = useRef(tabs);
	tabsRef.current = tabs;
	const focusedRef = useRef(focused);
	focusedRef.current = focused;

	// The sheet slides when a click moves it and jumps when a key does, as a switch
	// should feel under each. A focus handed on because its tab closed slides either
	// way: the tab it leaves is still visibly going.
	const lastFocus = useRef(focused);
	const handedOn =
		lastFocus.current !== focused &&
		lastFocus.current !== null &&
		!tabs.some((tab) => tab.root === lastFocus.current);
	useEffect(() => {
		lastFocus.current = focused;
	});
	const travel = drag !== null || quiet || (keyboard && !handedOn) ? 0 : scale.slow;

	const sheet = useSheet({ layer: nav, strip, target: focused ?? HOME, travel, curve: scale.curve });

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
			if (slot === null) return null;
			const target = revealing(element, slot, from);
			if (target !== from) element.scrollLeft = from + (target - from) * progress;
			return target;
		};
		if (reduced || !mounted.current) {
			step(1);
			return;
		}
		const start = performance.now();
		let last: number | null | undefined;
		// after motion has written the frame's widths, so the growing tab is read as painted; a tab whose growth
		// began a late frame after this (a busy machine) is followed on until it holds still, so it ends in view
		const tick = () => {
			const progress = scale.slow <= 0 ? 1 : Math.min(1, (performance.now() - start) / scale.slow);
			const target = step(easing(progress));
			if (progress < 1) return;
			if (target === last) stopReveal();
			last = target;
		};
		frame.postRender(tick, true);
		reveal.current = { stop: () => cancelFrame(tick) };
	}, [focused, reduced, stopReveal, scale, easing]);

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
	 * zero while the layout under it has already jumped: the same distance
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
			settle.current = setTimeout(pending.run, settleMs);
		},
		[settleMs],
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
			// exact left edge its slot has: a drop is a hand letting go, not a cut
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
				if (sameRoots(current.roots, tabsRef.current)) onReorder(order);
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

	/** Closed under the pointer: every tab keeps its width, so the next close lands where this one was. */
	const closeHolding = (root: string) => {
		const element = strip.current;
		if (element !== null) {
			const widths = new Map<string, number>();
			for (const slot of element.querySelectorAll<HTMLElement>("[data-tab-slot]")) {
				if (slot.dataset.tabSlot !== undefined)
					widths.set(slot.dataset.tabSlot, slot.getBoundingClientRect().width);
			}
			setHeld(widths);
		}
		onClose(root);
	};

	const home = focused === null;
	return (
		<MotionConfig reducedMotion="user" transition={{ duration: settleMs / 1000, ease: scale.curve }}>
			<nav
				ref={nav}
				aria-label="Open projects"
				className="project-tabs relative flex h-full min-w-0 items-stretch"
				onPointerLeave={() => setHeld(null)}
			>
				<Sheet target={sheet} home={home} />
				<div className="relative z-[1] flex h-full shrink-0 pl-2">
					<HomeTab home={home} onHome={onHome} />
				</div>
				<motion.div
					ref={strip}
					layoutScroll
					className="project-tabs-scroll relative z-[1] flex h-full min-w-0 overflow-x-auto overflow-y-hidden pl-2 [scrollbar-width:none]"
				>
					<AnimatePresence initial={false}>
						{tabs.map((tab, index) => (
							<Tab
								key={tab.root}
								tab={tab}
								active={focused === tab.root}
								hold={holding?.get(tab.root)}
								shift={shiftOf(drag, tab.root)}
								lifted={drag?.root === tab.root}
								dragging={drag !== null}
								carried={drag?.root === tab.root && !drag.settling}
								layout={drag === null && !quiet}
								still={quiet || reduced}
								opening={mounted.current && !reduced}
								closeMs={reduced ? 0 : scale.slow}
								onPress={(event) => pressTab(event, tab.root, index)}
								onPick={() => {
									if (!justDragged.current) onFocus(tab.root);
								}}
								onClose={(byPointer) => (byPointer ? closeHolding(tab.root) : onClose(tab.root))}
								onMenu={(x, y, anchor) => setMenu({ project: tab, x, y, anchor })}
							/>
						))}
					</AnimatePresence>
				</motion.div>
				<div className="relative z-[1] flex shrink-0 items-center pt-1 pl-1">
					<IconButton icon={<PlusIcon />} label="New project" onClick={onPick} />
				</div>
			</nav>
			{menu && (
				<ProjectTabMenu
					{...menu}
					// the tab as it is now: an icon changed while the menu is open shows in its header
					project={tabs.find((tab) => tab.root === menu.project.root) ?? menu.project}
					onClose={() => setMenu(null)}
					onExport={() => onExport?.(menu.project)}
					onCloseTab={() => onClose(menu.project.root)}
					{...(onChangeIcon === undefined ? {} : { onChangeIcon: () => onChangeIcon(menu.project) })}
					{...(onRemoveIcon === undefined ? {} : { onRemoveIcon: () => onRemoveIcon(menu.project) })}
					{...(onMatchTeam === undefined ? {} : { onMatchTeam: () => onMatchTeam(menu.project) })}
					{...(onHistory === undefined ? {} : { onHistory: () => onHistory(menu.project) })}
				/>
			)}
		</MotionConfig>
	);
}

/** a tab's label: the whole face is the hit area, the name and its mark inside */
const LABEL =
	"relative flex h-full min-w-0 flex-1 items-center gap-2 pt-1 type-control text-secondary transition-colors duration-fast ease-out group-hover/tab:text-primary aria-[current=page]:text-primary";

function HomeTab({ home, onHome }: { home: boolean; onHome: () => void }) {
	const face = useRef<HTMLDivElement>(null);
	useWidth(face);
	return (
		<div ref={face} data-sheet-target={HOME} className="group/tab relative flex h-full min-w-0">
			<Wash lit={home} />
			<button
				type="button"
				className={cn(LABEL, "app-home pr-3")}
				style={{ paddingLeft: FACE_PAD }}
				onClick={onHome}
				aria-current={home ? "page" : undefined}
				title="Home"
			>
				<span className="flex size-4 shrink-0 items-center justify-center">
					<HomeIcon />
				</span>
				<Name>Home</Name>
			</button>
		</div>
	);
}

/** The wash under the pointer, inset from every edge so it never reads as the sheet. */
function Wash({ lit }: { lit: boolean }) {
	return (
		<span
			aria-hidden="true"
			className={cn(
				"pointer-events-none absolute inset-x-0.5 top-2 bottom-1 rounded-sm bg-state-hover-raised opacity-0 transition-opacity duration-fast ease-out",
				!lit && "group-hover/tab:opacity-100",
			)}
		/>
	);
}

/**
 * What a carried tab stands on, so the tab it passes over does not show through.
 * The focused tab's is the sheet's fill, inside the sheet's outline so the outline
 * still draws round it; any other's is the bar's, short of the floor line.
 */
function Backing({ sheet }: { sheet: boolean }) {
	return (
		<span
			aria-hidden="true"
			className={cn(
				"pointer-events-none absolute inset-x-px",
				sheet ? "bottom-0 bg-surface-canvas" : "bottom-px bg-surface-window",
			)}
			style={{ top: SHEET_TOP + 1, borderTopLeftRadius: FOOT - 0.5, borderTopRightRadius: FOOT - 0.5 }}
		/>
	);
}

/**
 * Who else is in a project whose tab isn't focused: a dot each in their colour, the ones working first and the idle
 * at the faces' resting ink, three at most and a count for the rest. They stand after the name rather than in it, so
 * a long name fades out under its own gradient and the dots sit where the fade ends, never cut off with it. They go
 * with the name when the tab is squeezed to its mark.
 *
 * Pointed at, each dot swells into its person's name pill, the one their pointer carries on the canvas, and the
 * pills stack under the tab, everyone in it listed, the counted ones swelling out of the count.
 */
function TabDots({ mates }: { mates: readonly TabMate[] }) {
	const shown = mates.slice(0, DOTS_SHOWN);
	const more = mates.length - shown.length;
	const zone = useRef<HTMLSpanElement>(null);
	const [from, setFrom] = useState<HereFrom | null>(null);
	const open = () => {
		const element = zone.current;
		if (element === null) return;
		const spots = [...element.querySelectorAll<HTMLElement>("[data-tab-here-dot], [data-tab-here-more]")].map(
			(spot) => spot.getBoundingClientRect(),
		);
		const tab = element.closest("[data-tab]")?.getBoundingClientRect() ?? element.getBoundingClientRect();
		setFrom({ spots, left: spots[0]?.left ?? tab.left, top: tab.bottom + 4, scale: motionScale(element) });
	};
	return (
		<span
			ref={zone}
			data-tab-here=""
			data-tab-here-open={from === null ? undefined : ""}
			className="group/here relative -ml-3 flex h-6 shrink-0 items-center pr-1 pl-1"
			style={{ opacity: NAME_SHOWN }}
			onPointerEnter={(event) => {
				if (event.pointerType === "mouse" && event.buttons === 0) open();
			}}
			onPointerLeave={() => setFrom(null)}
			onPointerDown={() => setFrom(null)}
		>
			<span className="sr-only">, {mates.map((mate) => mate.name).join(", ")} here</span>
			{shown.map((mate, i) => (
				<span
					key={mate.accountId}
					aria-hidden="true"
					data-tab-here-dot={mate.accountId}
					className="relative size-1.5 rounded-full transition-[margin,transform] duration-fast ease-out group-data-[tab-here-open]/here:scale-125"
					style={{
						marginLeft: i === 0 ? 0 : from === null ? -2 : 2,
						background: mate.color,
						boxShadow: "0 0 0 1.5px var(--color-surface-window)",
						zIndex: shown.length - i,
						opacity: mate.idle ? 0.45 : 1,
						filter: mate.idle ? "saturate(0.2)" : undefined,
					}}
				/>
			))}
			{more > 0 && (
				<span
					aria-hidden="true"
					data-tab-here-more=""
					className="ml-1 text-secondary tabular-nums leading-none type-detail"
				>
					+{more}
				</span>
			)}
			{createPortal(
				<AnimatePresence>{from !== null && <HerePills key="pills" mates={mates} from={from} />}</AnimatePresence>,
				document.body,
			)}
		</span>
	);
}

/** where a tab's pills swell from: each dot's box and the count's, and the column they stack into under the tab */
interface HereFrom {
	readonly spots: readonly DOMRect[];
	readonly left: number;
	readonly top: number;
	readonly scale: ReturnType<typeof motionScale>;
}

/** a pill's height, and the step from one to the next down the column */
const PILL_H = 18;
const PILL_STEP = PILL_H + 4;

/** Everyone in a tab's project as name pills, each grown out of its dot, and shrunk back into it on the way out. */
function HerePills({ mates, from }: { mates: readonly TabMate[]; from: HereFrom }) {
	const { spots, left, top, scale } = from;
	const ms = scale.base / 1000;
	return (
		<div
			aria-hidden="true"
			data-tab-here-pills=""
			className="pointer-events-none fixed z-50 flex flex-col items-start"
			style={{ left, top, gap: PILL_STEP - PILL_H }}
		>
			{mates.map((mate, i) => {
				// the counted ones come out of the count
				const spot = spots[Math.min(i, spots.length - 1)];
				const dot = {
					x: (spot?.left ?? left) + (spot === undefined ? 0 : spot.width / 2) - 3 - left,
					y: (spot?.top ?? top) + (spot === undefined ? 0 : spot.height / 2) - 3 - (top + i * PILL_STEP),
				};
				const tucked = { x: dot.x, y: dot.y, width: 6, height: 6, opacity: 0 };
				return (
					<motion.span
						key={mate.accountId}
						data-tab-here-pill={mate.accountId}
						className="flex items-center overflow-hidden whitespace-nowrap rounded-full font-medium text-[11px] leading-none"
						style={{
							background: mate.color,
							color: PRESENCE_INK,
							filter: mate.idle ? "saturate(0.2)" : undefined,
						}}
						initial={tucked}
						animate={{ x: 0, y: 0, width: "auto", height: PILL_H, opacity: mate.idle ? 0.45 : 1 }}
						exit={{ ...tucked, transition: { duration: scale.base / 1000 / 1.5, ease: scale.curve } }}
						transition={{ duration: ms, ease: scale.curve, delay: (i * ms) / 8, opacity: { duration: ms / 3 } }}
					>
						<motion.span
							className="px-[7px]"
							initial={{ opacity: 0 }}
							animate={{ opacity: 1, transition: { duration: ms, delay: (i * ms) / 8 + ms / 3 } }}
							exit={{ opacity: 0, transition: { duration: ms / 4 } }}
						>
							{mate.name}
						</motion.span>
					</motion.span>
				);
			})}
		</div>
	);
}

function Name({ children }: { children: React.ReactNode }) {
	return (
		<span
			className="project-tab-name min-w-0 shrink overflow-hidden whitespace-nowrap pr-3 text-left"
			style={{ maskImage: NAME_FADE, WebkitMaskImage: NAME_FADE, opacity: NAME_SHOWN }}
		>
			{children}
		</span>
	);
}

/** Carry an element's width as `--tw`, which its face lays itself out against, and say when it is narrow. */
function useWidth(ref: RefObject<HTMLElement | null>) {
	useLayoutEffect(() => {
		const element = ref.current;
		if (element === null || typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(([entry]) => {
			const width = entry?.borderBoxSize?.[0]?.inlineSize ?? entry?.contentRect.width ?? 0;
			element.style.setProperty("--tw", width.toFixed(1));
			element.toggleAttribute("data-narrow", width < NARROW);
		});
		observer.observe(element);
		return () => observer.disconnect();
	}, [ref]);
}

/**
 * One tab in its slot.
 *
 * The slot is what opens, closes and compresses: its width runs between nothing
 * and its share of the strip, clipped sideways so the tab is uncovered rather
 * than squeezed. A closing tab is already gone as far as anything but the eye is
 * concerned: not a target, not focusable, not a box a drag measures. While a
 * drag is on, the open slots stop clipping, since the drag carries each tab out
 * of its own slot.
 */
function Tab({
	tab,
	active,
	hold,
	shift,
	lifted,
	dragging,
	carried,
	layout,
	still,
	opening,
	closeMs,
	onPress,
	onPick,
	onClose,
	onMenu,
}: {
	tab: TabProject;
	active: boolean;
	/** the width it keeps after a close under the pointer */
	hold: number | undefined;
	shift: number;
	lifted: boolean;
	/** a drag is carrying tabs out of their slots, which must show them rather than clip them */
	dragging: boolean;
	carried: boolean;
	layout: boolean;
	still: boolean;
	opening: boolean;
	closeMs: number;
	onPress: (event: React.PointerEvent<HTMLElement>) => void;
	onPick: () => void;
	onClose: (byPointer: boolean) => void;
	onMenu: (x: number, y: number, anchor: HTMLElement) => void;
}) {
	const [present, safeToRemove] = usePresence();
	const slot = useRef<HTMLDivElement | null>(null);
	useWidth(slot);
	/** the keyboard was in this tab when it closed, and goes on to a neighbour */
	const hadFocus = useRef(false);
	/** the width it had on screen when it closed, read before the close restyles it */
	const closingFrom = useRef<number | null>(null);
	if (present) closingFrom.current = null;
	else if (closingFrom.current === null) {
		closingFrom.current = slot.current?.getBoundingClientRect().width ?? 0;
		hadFocus.current = slot.current?.contains(document.activeElement) ?? false;
	}

	// open from nothing, once: the clamp it grows to is the slot's own, so a full strip's share is where it stops
	// biome-ignore lint/correctness/useExhaustiveDependencies: a tab opens once
	useLayoutEffect(() => {
		const element = slot.current;
		if (element === null || !opening) return;
		element.style.transition = "none";
		element.style.maxWidth = "0px";
		element.style.minWidth = "0px";
		element.style.opacity = "0";
		void element.offsetWidth;
		element.style.transition = "";
		element.style.maxWidth = "";
		element.style.minWidth = "";
		element.style.opacity = "";
	}, []);

	// held after a close under the pointer, and let go to the strip's clamp; reopened, from wherever it got to
	useLayoutEffect(() => {
		const element = slot.current;
		if (element === null || !present) return;
		element.style.maxWidth = hold === undefined ? "" : `${hold}px`;
		element.style.minWidth =
			hold === undefined ? "" : `min(${hold}px, var(--spacing-tab-${active ? "min" : "compact"}))`;
		element.style.opacity = "";
	}, [present, hold, active]);

	// close from the width it has on screen to nothing
	// biome-ignore lint/correctness/useExhaustiveDependencies: keyed on presence alone
	useLayoutEffect(() => {
		const element = slot.current;
		if (element === null || present) return;
		element.style.transition = "none";
		element.style.maxWidth = `${closingFrom.current ?? 0}px`;
		element.style.minWidth = "0px";
		void element.offsetWidth;
		element.style.transition = "";
		element.style.maxWidth = "0px";
		element.style.opacity = "0";
		// gone once it has shrunk to nothing, by the shrink's own clock: a busy page starts that a late frame
		// after this, and a timer begun now would take the slot out still wide, and the row would jump by it
		let settled = false;
		const remove = () => {
			if (settled) return;
			settled = true;
			safeToRemove?.();
		};
		const shrink =
			typeof element.getAnimations === "function"
				? element
						.getAnimations()
						.filter((animation) => (animation as CSSTransition).transitionProperty === "max-width")
				: [];
		// a hidden page paints no frames to finish it on
		const gone = shrink.length === 0 || document.hidden ? setTimeout(remove, closeMs) : undefined;
		if (gone === undefined) void Promise.all(shrink.map((animation) => animation.finished)).then(remove, remove);
		return () => {
			settled = true;
			clearTimeout(gone);
		};
	}, [present]);

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
				"project-tab-slot group/slot relative flex h-full w-tab-max max-w-tab-max",
				// opening and closing uncover the tab by clipping it, but a drag moves the
				// tab inside its slot: clipped then, it would leave its slot's sheet empty
				!(dragging && present) && "overflow-x-clip",
				"transition-[max-width,min-width,opacity] duration-slow ease-snap",
				active && present ? "min-w-tab-min" : "min-w-tab-compact",
				lifted && "z-10",
				// a closing tab gives up its width by its own clock, not to the strip's squeeze
				present ? "shrink" : "pointer-events-none shrink-0",
			)}
			layout={layout && present ? "position" : false}
		>
			{/* The slot opens, closes and carries layout moves; the measured drag owns
			 * only this inner box's transform. */}
			<div
				data-tab={present ? tab.root : undefined}
				data-sheet-target={present ? tab.root : undefined}
				inert={!present}
				aria-hidden={present ? undefined : true}
				className={cn(
					"project-tab group/tab relative flex h-full w-full min-w-0 touch-none select-none",
					lifted && "is-dragging [&_.project-tab-label]:cursor-grabbing",
				)}
				style={{
					transform: `translateX(${shift}px)`,
					transition: still || carried ? "none" : "transform var(--transition-duration-base) var(--ease-snap)",
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
					onClose(true);
				}}
			>
				{lifted && <Backing sheet={active} />}
				<Wash lit={active} />
				<button
					type="button"
					className={cn(LABEL, "project-tab-label cursor-default pr-8")}
					style={{ paddingLeft: FACE_PAD }}
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
					<span className="flex size-4 shrink-0 items-center justify-center">
						<ProjectMark
							project={tab.name}
							name={tab.name}
							icon={tab.icon}
							team={tab.teamAddress}
							paused={tab.paused}
							// the gap round the badge is the colour the tab is drawn on
							cut={active && present ? "var(--color-surface-canvas)" : "var(--color-surface-window)"}
						/>
					</span>
					<Name>{tab.name}</Name>
					{!active && tab.here !== undefined && tab.here.length > 0 && <TabDots mates={tab.here} />}
				</button>
				<span
					className={cn(
						"absolute top-1/2 right-1.5 mt-0.5 flex -translate-y-1/2 opacity-0 transition-opacity duration-fast ease-out has-focus-visible:opacity-100 group-hover/tab:opacity-100",
						active
							? "opacity-100"
							: "group-data-[narrow]/slot:pointer-events-none group-data-[narrow]/slot:opacity-0",
					)}
				>
					<IconButton
						icon={<CloseIcon />}
						label={`Close ${tab.name}`}
						title="Close tab"
						size="sm"
						className="project-tab-close"
						onPointerDown={(event) => event.stopPropagation()}
						// a click the pointer made holds the row for the next one; a key's does not
						onClick={(event) => onClose(event.detail > 0)}
					/>
				</span>
			</div>
		</motion.div>
	);
}

/* ── the sheet ──────────────────────────────────────────────────────── */

/** The sheet's outline: rounded shoulders, and feet that curve out into the floor line. */
function sheetPath(width: number, height: number, closed: boolean): string {
	const w = Math.max(width, FOOT * 2);
	const x0 = FOOT + 0.5;
	const x1 = FOOT + w - 0.5;
	const bottom = closed ? height : height - 0.5;
	const top = 0.5;
	const path = [
		`M 0 ${bottom}`,
		`A ${FOOT} ${FOOT} 0 0 0 ${x0} ${bottom - FOOT}`,
		`L ${x0} ${top + FOOT}`,
		`A ${FOOT} ${FOOT} 0 0 1 ${x0 + FOOT} ${top}`,
		`L ${x1 - FOOT} ${top}`,
		`A ${FOOT} ${FOOT} 0 0 1 ${x1} ${top + FOOT}`,
		`L ${x1} ${bottom - FOOT}`,
		`A ${FOOT} ${FOOT} 0 0 0 ${x1 + FOOT} ${bottom}`,
	].join(" ");
	return closed ? `${path} Z` : path;
}

interface SheetTarget {
	(): void;
	svg: RefObject<SVGSVGElement | null>;
	fill: RefObject<SVGPathElement | null>;
	line: RefObject<SVGPathElement | null>;
}

/** The one sheet, drawn wherever `useSheet` puts it, filled with what is under it. */
function Sheet({ target, home }: { target: SheetTarget; home: boolean }) {
	return (
		<svg
			ref={target.svg}
			aria-hidden="true"
			className="project-tab-sheet pointer-events-none absolute left-0 z-[1] overflow-visible opacity-0"
			style={{ top: SHEET_TOP }}
		>
			<path
				ref={target.fill}
				className={cn(
					"transition-[fill] duration-base ease-out",
					home ? "fill-surface-window" : "fill-surface-canvas",
				)}
			/>
			<path ref={target.line} fill="none" strokeWidth={1} className="stroke-line-default" />
		</svg>
	);
}

/**
 * Stand the sheet on the focused tab, and carry it there when focus moves.
 *
 * Between two tabs it travels for `travel` ms on `curve`; the travel is an offset
 * from the target that runs out, rather than a path between two fixed boxes, so a
 * target that is itself moving (sliding into the place of a closed tab, growing,
 * dragged, scrolled) carries the sheet with it and nothing chases anything. It is
 * drawn by frames only while something might be moving: a render, a transition
 * starting under it, a scroll or a resize wakes it, and it sleeps once it has held
 * still. Returns the wake.
 */
/** The properties whose transitions move a tab, so the sheet over it. */
const MOVES = new Set(["max-width", "min-width", "width", "transform", "translate"]);

function useSheet({
	layer,
	strip,
	target,
	travel,
	curve,
}: {
	layer: RefObject<HTMLElement | null>;
	strip: RefObject<HTMLElement | null>;
	target: string;
	travel: number;
	curve: [number, number, number, number];
}): SheetTarget {
	const svg = useRef<SVGSVGElement | null>(null);
	const fill = useRef<SVGPathElement | null>(null);
	const line = useRef<SVGPathElement | null>(null);
	const want = useRef({ target, travel });
	want.current = { target, travel };
	const wake = useRef(() => {});
	const drawNow = useRef(() => {});
	const retarget = useRef(() => {});

	useLayoutEffect(() => {
		const element = layer.current;
		const scroller = strip.current;
		if (element === null || scroller === null) return;
		const ease = cubicBezier(...curve);
		let request = 0;
		let key: string | undefined;
		let shown: { left: number; right: number } | null = null;
		let from: { left: number; right: number } | null = null;
		let start = 0;
		let span = 0;
		let syncing = false;
		let last = "";
		let still = 0;
		const boxOf = (name: string) => {
			const node = element.querySelector<HTMLElement>(`[data-sheet-target="${CSS.escape(name)}"]`);
			if (node === null) return null;
			const outer = element.getBoundingClientRect();
			const box = node.getBoundingClientRect();
			let left = box.left;
			let right = box.right;
			// a tab is shown only as far as the strip shows it
			if (name !== HOME) {
				const view = scroller.getBoundingClientRect();
				left = Math.max(left, view.left);
				right = Math.min(right, view.right);
			}
			return { left: left - outer.left, right: Math.max(left, right) - outer.left };
		};
		retarget.current = () => {
			const { target: name, travel: ms } = want.current;
			if (name === key) return;
			// measured as the commit leaves it, on the clock the transitions it set began on, so
			// a target starting to slide is read where it starts
			const box = boxOf(name);
			from =
				key !== undefined && shown !== null && box !== null && ms > 0
					? { left: shown.left - box.left, right: shown.right - box.right }
					: null;
			key = name;
			start = Number(document.timeline?.currentTime ?? performance.now());
			span = ms;
			syncing = from !== null;
			wake.current();
		};
		// The browser starts the transitions a commit sets a frame or more after the commit, and on the
		// steep curve a travel that starts sooner pulls the sheet off a target sliding on the same curve.
		// So the travel waits for them and starts on their clock.
		const syncStart = (now: number) => {
			const moves = element
				.getAnimations({ subtree: true })
				.filter((animation) => animation instanceof CSSTransition && MOVES.has(animation.transitionProperty));
			if (moves.some((animation) => animation.pending)) {
				start = now;
				return;
			}
			syncing = false;
			for (const animation of moves) {
				const began = Number(animation.startTime ?? start);
				if (began > start) start = began;
			}
		};
		const tick = (now: number) => {
			request = 0;
			retarget.current();
			const box = boxOf(want.current.target);
			let next = box;
			let moving = false;
			if (box !== null && from !== null) {
				if (syncing) syncStart(now);
				const t = Math.min(1, Math.max(0, now - start) / span);
				if (t < 1) {
					const rest = 1 - ease(t);
					next = { left: box.left + from.left * rest, right: box.right + from.right * rest };
					moving = true;
				} else from = null;
			}
			shown = next;
			const height = element.clientHeight - SHEET_TOP;
			const signature = next === null ? "none" : `${next.left.toFixed(2)}|${next.right.toFixed(2)}|${height}`;
			if (signature === last) still += 1;
			else {
				still = 0;
				last = signature;
				draw(next, height);
			}
			if (moving || still < 6) request = requestAnimationFrame(tick);
		};
		const draw = (box: { left: number; right: number } | null, height: number) => {
			const sheet = svg.current;
			if (sheet === null || fill.current === null || line.current === null) return;
			if (box === null) {
				sheet.style.opacity = "0";
				return;
			}
			const width = box.right - box.left;
			sheet.style.opacity = "1";
			sheet.style.left = `${box.left - FOOT}px`;
			sheet.setAttribute("width", String(width + FOOT * 2));
			sheet.setAttribute("height", String(height));
			fill.current.setAttribute("d", sheetPath(width, height, true));
			line.current.setAttribute("d", sheetPath(width, height, false));
		};
		wake.current = () => {
			still = 0;
			if (request === 0) request = requestAnimationFrame(tick);
		};
		// in the commit itself, so the sheet paints in the same frame as the tab it stands on
		drawNow.current = () => {
			cancelAnimationFrame(request);
			still = 0;
			tick(Number(document.timeline?.currentTime ?? performance.now()));
		};
		const onWake = () => wake.current();
		const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(onWake);
		observer?.observe(element);
		element.addEventListener("transitionrun", onWake);
		scroller.addEventListener("scroll", onWake);
		wake.current();
		return () => {
			cancelAnimationFrame(request);
			observer?.disconnect();
			element.removeEventListener("transitionrun", onWake);
			scroller.removeEventListener("scroll", onWake);
			wake.current = () => {};
			drawNow.current = () => {};
			retarget.current = () => {};
		};
	}, [layer, strip, curve]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: a new target is what moves the sheet
	useLayoutEffect(() => retarget.current(), [target]);

	// every render can move something under it: a dragged tab moves in the render
	// itself, and a sheet waiting for the next frame would trail it by one
	useLayoutEffect(() => drawNow.current());

	return useMemo(() => Object.assign(() => wake.current(), { svg, fill, line }), []);
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
