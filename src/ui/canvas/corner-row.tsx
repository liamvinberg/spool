import { AnimatePresence, animate, type MotionValue, motion, motionValue, useReducedMotion } from "motion/react";
import { createContext, type ReactNode, type RefObject, useCallback, useLayoutEffect, useRef, useState } from "react";
import { cn } from "../cn";
import type { TrailFold } from "./agent-trail-model";

/**
 * The canvas's top right (spool#311, spool#312): one row, read left to right, the agent's path (`agent-trail.tsx`),
 * who's here (`presence-faces.tsx`), then Present with its caret in the corner itself on a deck page. The top left
 * keeps only your path and the finder's door: frame things there, people and agents here.
 *
 * Present never moves and never changes size. Everything else grows leftward from it: a face arriving slides the
 * agent's path out, the path arriving comes in at the row's outer end and moves nothing. On a page that is no deck
 * there is no Present and the faces take the corner.
 *
 * Short of room (a narrow window, a long path, many faces) the row takes the first of `LEVELS` that stands `CLEAR`
 * px clear of your path's end. Your path and Present never fold and are never covered.
 *
 * A part pushed along by the one right of it slides there on one spring (0.4 s, no bounce): it is each part's right
 * edge that is followed, so a part never slides for its own change of width.
 *
 * How wide each level would be is read off the parts themselves, drawn once more out of sight at every fold
 * (`Measuring` turns their menus, listeners and test hooks off there), so a fold is exact and never flickers.
 */

/** how much of the agent's path shows: all of it, its middle folded, its last part cut too, or only its name */
export type Fold = TrailFold;

/** the parts are being drawn out of sight to be measured: no menus, no listeners, no data hooks */
export const Measuring = createContext(false);

/** the faces drawn before the rest become `+N`, unfolded and folded (`max` on `PresenceFaces`) */
export const FACES_FULL = 4;
export const FACES_FOLDED = 3;

export interface Level {
	readonly fold: Fold;
	readonly faces: number;
}

/** the levels, in the order the row takes them */
export const LEVELS: readonly Level[] = [
	{ fold: "full", faces: FACES_FULL },
	{ fold: "middle", faces: FACES_FULL },
	{ fold: "middle", faces: FACES_FOLDED },
	{ fold: "cut", faces: FACES_FOLDED },
	{ fold: "name", faces: FACES_FOLDED },
];
const FOLDS: readonly Fold[] = ["full", "middle", "cut", "name"];
const COUNTS: readonly number[] = [FACES_FULL, FACES_FOLDED];

/** px between the row's parts, `gap-2` */
export const GAP = 8;
/** px the row keeps clear of your path's end */
export const CLEAR = 24;
/** no bounce: the row slides, it never springs past */
const SLIDE = { type: "spring", duration: 0.4, bounce: 0 } as const;
/** `--ease-snap`, as motion takes a curve */
const SNAP = [0.32, 0.72, 0, 1] as const;

/** how wide each part is at each of its folds, px; a part not in the row is null */
export interface RowWidths {
	readonly trail: Readonly<Record<Fold, number>> | null;
	readonly faces: Readonly<Record<number, number>> | null;
	readonly present: number;
}

/** the first level whose parts, and the gaps between them, fit in `room` px; the last level when none does */
export function levelFor(widths: RowWidths, room: number): number {
	const need = (level: Level) => {
		const parts = [widths.trail?.[level.fold] ?? 0, widths.faces?.[level.faces] ?? 0, widths.present].filter(
			(w) => w > 0,
		);
		return parts.reduce((sum, w) => sum + w, 0) + GAP * Math.max(0, parts.length - 1);
	};
	const at = LEVELS.findIndex((level) => need(level) <= room);
	return at < 0 ? LEVELS.length - 1 : at;
}

export function CornerRow({
	viewport,
	trail,
	faces,
	present,
	under = false,
	children,
}: {
	/** the canvas the row stands over, which holds your path (`[data-page-path]`) */
	viewport: RefObject<HTMLElement | null>;
	/** the agent's path at a fold; null while no agent works or has just finished */
	trail: ((fold: Fold) => ReactNode) | null;
	/** who's here with at most `max` faces; null with nobody here */
	faces: ((max: number) => ReactNode) | null;
	/** Present with its caret, on a deck page */
	present?: ReactNode;
	/** you follow a teammate: `following <name> · esc` hangs from the top right and the row stands under it */
	under?: boolean;
	/** what hangs under the row from the corner: agents working here from a terminal (task 531) */
	children?: ReactNode;
}) {
	const still = useReducedMotion() === true;
	const root = useRef<HTMLDivElement>(null);
	const sizer = useRef<HTMLDivElement>(null);
	const presentBox = useRef<HTMLDivElement>(null);
	const [level, setLevel] = useState(0);
	// each part's right edge, as px from the row's: a part pushed along by the one after it slides there
	const parts = useRef(new Map<string, HTMLElement>());
	const ends = useRef(new Map<string, number>());
	const shifts = useRef(new Map<string, MotionValue<number>>());
	const shift = (key: string) => {
		let value = shifts.current.get(key);
		if (value === undefined) {
			value = motionValue(0);
			shifts.current.set(key, value);
		}
		return value;
	};
	// one ref per part for the row's life, so React never detaches and reattaches it between renders
	const refs = useRef(new Map<string, (el: HTMLElement | null) => void>());
	const part = (key: string) => {
		let ref = refs.current.get(key);
		if (ref === undefined) {
			ref = (el: HTMLElement | null) => {
				if (el !== null) parts.current.set(key, el);
				else {
					parts.current.delete(key);
					ends.current.delete(key);
				}
			};
			refs.current.set(key, ref);
		}
		return ref;
	};

	const hasTrail = trail !== null;
	const hasFaces = faces !== null;

	const fit = useCallback(() => {
		const row = root.current;
		const box = sizer.current;
		const scope = viewport.current;
		// not laid out (a hidden window, a test's document): nothing to fit yet
		if (row === null || box === null || scope === null || scope.clientWidth === 0) return;
		const path = scope.querySelector<HTMLElement>("[data-page-path]");
		const right = row.getBoundingClientRect().right;
		// the path's own end: its names and the finder's door, not the keys ⌘ shows after them
		let end = scope.getBoundingClientRect().left;
		if (path !== null) {
			for (const one of Array.from(path.children)) {
				if ((one as HTMLElement).dataset.pathTrail !== undefined) continue;
				end = Math.max(end, one.getBoundingClientRect().right);
			}
		}
		const width = (name: string) => box.querySelector<HTMLElement>(`[data-size="${name}"]`)?.offsetWidth ?? 0;
		const pick = levelFor(
			{
				trail: hasTrail
					? {
							full: width("trail-full"),
							middle: width("trail-middle"),
							cut: width("trail-cut"),
							name: width("trail-name"),
						}
					: null,
				faces: hasFaces
					? { [FACES_FULL]: width(`faces-${FACES_FULL}`), [FACES_FOLDED]: width(`faces-${FACES_FOLDED}`) }
					: null,
				present: presentBox.current?.offsetWidth ?? 0,
			},
			right - end - CLEAR,
		);
		setLevel((was) => (was === pick ? was : pick));
	}, [viewport, hasTrail, hasFaces]);

	// every commit, before paint: what the parts say changes with a render, so the fold is chosen in the same frame
	useLayoutEffect(fit);

	// a part is pushed along only by what stands right of it changing width, never by its own: so it is its right edge
	// that is followed, and a part whose right edge moved slides there from where it was seen
	useLayoutEffect(() => {
		const row = root.current;
		if (row === null) return;
		for (const [key, el] of parts.current) {
			const end = row.offsetWidth - (el.offsetLeft + el.offsetWidth);
			const was = ends.current.get(key);
			ends.current.set(key, end);
			if (was === undefined || was === end) continue;
			const value = shift(key);
			if (still) {
				value.set(0);
				continue;
			}
			animate(value, 0, { ...SLIDE, from: value.get() + (end - was) });
		}
	});

	useLayoutEffect(() => {
		const scope = viewport.current;
		const watched = [
			scope,
			scope?.querySelector<HTMLElement>("[data-page-path]"),
			presentBox.current,
			...Array.from(sizer.current?.children ?? []),
		].filter((one): one is HTMLElement => one instanceof HTMLElement);
		const sizes = new ResizeObserver(fit);
		for (const one of watched) sizes.observe(one);
		// words change inside the parts, and the path comes and goes, without a resize of what is watched
		const words = new MutationObserver(fit);
		if (sizer.current !== null) words.observe(sizer.current, { subtree: true, childList: true, characterData: true });
		if (scope !== null) words.observe(scope, { childList: true });
		return () => {
			sizes.disconnect();
			words.disconnect();
		};
	}, [viewport, fit]);

	const at = LEVELS[level] ?? (LEVELS[0] as Level);
	// an arrival fades in a beat late, once what it pushes along has started to make room
	const come = still ? { duration: 0 } : { duration: 0.26, ease: SNAP, delay: 0.08 };
	const leave = still ? { duration: 0 } : { duration: 0.18, ease: SNAP };

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: it only keeps a press from the canvas under it
		<div
			data-corner=""
			className={cn(
				"absolute right-3 z-20 flex flex-col items-end gap-1 transition-[top] duration-slow ease-snap",
				under ? "top-8" : "top-3",
			)}
			onPointerDown={(event) => event.stopPropagation()}
			onDoubleClick={(event) => event.stopPropagation()}
		>
			<div
				ref={root}
				data-corner-row=""
				data-fold={hasTrail ? at.fold : undefined}
				data-faces-max={hasFaces ? at.faces : undefined}
				className="relative flex h-control-sm items-center gap-2"
			>
				{/* a part leaving keeps its place from the right, where the row stands */}
				<AnimatePresence initial={false} mode="popLayout" anchorX="right">
					{hasTrail ? (
						<motion.div
							key="trail"
							ref={part("trail")}
							data-corner-part="trail"
							className="relative flex shrink-0 items-center"
							initial={{ opacity: 0, x: still ? 0 : 10 }}
							animate={{ opacity: 1, x: 0 }}
							exit={{ opacity: 0, x: still ? 0 : 10, transition: leave }}
							transition={come}
						>
							<motion.div className="flex items-center" style={{ x: shift("trail") }}>
								{trail(at.fold)}
							</motion.div>
						</motion.div>
					) : null}
					{hasFaces ? (
						<motion.div
							key="faces"
							ref={part("faces")}
							data-corner-part="faces"
							className="relative flex shrink-0 items-center"
							initial={{ opacity: 0, x: still ? 0 : 6 }}
							animate={{ opacity: 1, x: 0 }}
							exit={{ opacity: 0, x: still ? 0 : 6, transition: leave }}
							transition={come}
						>
							<motion.div className="flex items-center" style={{ x: shift("faces") }}>
								{faces(at.faces)}
							</motion.div>
						</motion.div>
					) : null}
				</AnimatePresence>
				{present === undefined || present === null ? null : (
					<div ref={presentBox} data-corner-part="present" className="relative shrink-0">
						{present}
					</div>
				)}
				{/* every fold of every part, out of sight, so the row knows what each level would take */}
				<Measuring.Provider value>
					<div
						ref={sizer}
						aria-hidden="true"
						className="pointer-events-none invisible absolute top-0 right-0 flex flex-col items-end"
					>
						{hasTrail
							? FOLDS.map((fold) => (
									<div key={fold} data-size={`trail-${fold}`} className="flex w-max">
										{trail(fold)}
									</div>
								))
							: null}
						{hasFaces
							? COUNTS.map((max) => (
									<div key={max} data-size={`faces-${max}`} className="flex w-max">
										{faces(max)}
									</div>
								))
							: null}
					</div>
				</Measuring.Provider>
			</div>
			{children}
		</div>
	);
}
