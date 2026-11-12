import { AnimatePresence, motion, PresenceContext, useReducedMotion } from "motion/react";
import {
	type ReactNode,
	type RefObject,
	useCallback,
	useContext,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { pageName, pageParent, pageSegments, ROOT_PAGE } from "../../page-path";
import type { Camera } from "../api";
import { cn } from "../cn";
import { SpinRing, StatusMark } from "../primitives/display";
import { Menu, MenuItem } from "../primitives/overlays";
import { type DeckStore, useDeck } from "./agent-deck";
import { frameHolding } from "./agent-nouns";
import { type TrailSpot, useTrailFollow } from "./agent-trail-follow";
import {
	FRESH_MS,
	freshness,
	madeOf,
	sameTrailTurn,
	sameWay,
	trailTurnOf,
	trailWords,
	type Way,
	wayTo,
	writingOf,
} from "./agent-trail-model";
import type { Box } from "./camera";
import type { CameraStore } from "./camera-store";
import { Sep } from "./canvas-path";
import { type CanvasState, type CanvasStore, navigatorFramesOf, unseenOf, useCanvasState } from "./canvas-store";
import { type Fold, Measuring } from "./corner-row";

/**
 * The agent's trail (task 443): the agent has a path too, at the canvas's top
 * right, in the page path's mono and chevrons, so your path at the top left and
 * the agent's at the top right read as one row. It stands first in the top
 * right's row (`corner-row.tsx`, spool#312), before who's here and Present, and
 * folds there when the row is short of room (`trailWords`).
 *
 * - Writing: `claude › receipt--tip` and an arrow that turns as you pan to keep
 *   pointing at the frame, fading once it is in view; `claude › site ›
 *   landing--dark` while it writes on another page.
 * - Pressing it follows (`agent-trail-follow.ts`): the arrow swings down onto a
 *   line, the page name drops, `esc` says how to stop.
 * - After the turn: `claude › 4 new`, the last turn's frames only, at full ink,
 *   fading over ten minutes to the path's resting tone (the pointer near it
 *   wakes it, as the path's names do), then it steps off to the right. A press
 *   drops the four under it, right-aligned, each said as a path, each landing
 *   you on its frame.
 */

/** the ink a finished trail never fades past: the path's resting tone */
const REST = 0.42;
/** `--ease-snap`, as motion takes a curve */
const SNAP = [0.32, 0.72, 0, 1] as const;
/** how often a finished trail's ink is moved on: ten minutes of fade needs no more */
const FADE_TICK_MS = 5000;
/** the path's wake reach and easing (`canvas-path.tsx`), mirrored for the top right */
const WAKE_REACH = 160;
const WAKE_EASE_MS = 90;

const placeholdersOf = (state: CanvasState) => state.placeholders;

interface Spot extends Box {
	readonly page: string;
}

/** The trail's words at their widest, as the row reads them, and what a press on it does. */
interface TrailView {
	readonly agent: string;
	readonly label: string;
	readonly done: boolean;
	readonly reading: boolean;
	readonly following: boolean;
	/** the page it writes on, named as your path names it, while it is not this one */
	readonly elsewhere: readonly string[] | null;
	readonly way: Way;
	readonly ink: number | string;
	readonly open: boolean;
	readonly made: readonly { name: string; where: readonly string[]; here: boolean; unseen: boolean; way: Way }[];
	readonly box: RefObject<HTMLDivElement | null>;
	readonly viewportRef: RefObject<HTMLDivElement | null>;
	readonly onPress: () => void;
	readonly onLand: (name: string) => void;
}

/**
 * The agent's trail, as the top right's row draws it (`corner-row.tsx`): its words at a fold, or null while no agent
 * works here or has just finished. The turn, following, the arrow's way and the list are kept here once, however
 * many folds the row draws to measure.
 */
export function useAgentTrail({
	deck,
	store,
	camera,
	viewportRef,
	page,
	project,
	teammate,
	onFollow,
	toPage,
	onLand,
}: {
	deck: DeckStore;
	store: CanvasStore;
	camera: CameraStore;
	viewportRef: RefObject<HTMLDivElement | null>;
	/** the page the canvas shows */
	page: string;
	/** what the root page is called where the trail names it */
	project: string;
	/** a teammate is being followed, which following the agent lets go of and is let go for */
	teammate: boolean;
	/** following the agent starts */
	onFollow: () => void;
	toPage: (page: string, arrive: Camera | undefined, then: Camera) => void;
	onLand: (name: string) => void;
}): ((fold: Fold) => ReactNode) | null {
	const turn = useDeck(deck, trailTurnOf, sameTrailTurn);
	const frames = useCanvasState(store, navigatorFramesOf);
	const placeholders = useCanvasState(store, placeholdersOf);
	const unseen = useCanvasState(store, unseenOf);
	const [open, setOpen] = useState(false);

	const spots = useMemo(() => {
		const all = new Map<string, Spot>();
		for (const one of [...placeholders, ...frames])
			all.set(one.name, { x: one.x, y: one.y, w: one.w, h: one.h, page: one.page ?? ROOT_PAGE });
		return all;
	}, [frames, placeholders]);
	const standing = useMemo(() => new Set(frames.map((frame) => frame.name)), [frames]);

	const running = turn?.running === true;
	const writing =
		turn === null || !running ? null : writingOf(turn, (path) => frameHolding(path, new Set(spots.keys())));
	const made = turn === null || running ? [] : madeOf(turn, standing);
	const now = useFadeClock(turn?.ended ?? null, made.length > 0);
	const fresh = turn?.ended == null ? 0 : freshness(turn.ended, now);
	const done = !running && made.length > 0 && fresh > 0;
	const shown = writing !== null || done;

	const writingSpot = writing === null ? null : (spots.get(writing.frame) ?? null);
	const writingPage = writing === null ? page : (writingSpot?.page ?? pageParent(writing.frame));
	const spot: TrailSpot | null =
		writing === null ? null : { name: writing.frame, page: writingPage, box: writingSpot };
	const { following, follow } = useTrailFollow({ camera, viewportRef, spot, running, page, teammate, toPage });

	// the arrow's ways, the trail's own first, then each row of the list
	const madeKey = made.join("\n");
	const targets = useMemo((): (readonly Spot[] | string)[] => {
		const boxes = (names: readonly string[]) =>
			names.flatMap((name) => {
				const one = spots.get(name);
				return one === undefined ? [] : [one];
			});
		if (done) {
			const names = madeKey.split("\n");
			return [boxes(names), ...names.map((name) => boxes([name]))];
		}
		if (writingSpot !== null) return [[writingSpot]];
		// a frame not on disk yet points nowhere on this page, and at its page from another
		return shown ? [writingPage] : [];
	}, [done, madeKey, shown, writingSpot, writingPage, spots]);
	const ways = useWays(camera, viewportRef, targets, page);
	const trailWay = ways[0] ?? { kind: "here" };

	// a finished trail closes its list when it goes; a new turn starts closed
	const turnKey = turn?.key;
	// biome-ignore lint/correctness/useExhaustiveDependencies: a new turn, or the turn's frames going, is the trigger
	useEffect(() => setOpen(false), [turnKey, done]);

	const box = useRef<HTMLDivElement | null>(null);
	useEffect(() => {
		if (!open) return;
		const close = (event: PointerEvent) => {
			if (!box.current?.contains(event.target as Node)) setOpen(false);
		};
		const esc = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			event.preventDefault();
			event.stopImmediatePropagation();
			setOpen(false);
		};
		window.addEventListener("pointerdown", close, true);
		window.addEventListener("keydown", esc, true);
		return () => {
			window.removeEventListener("pointerdown", close, true);
			window.removeEventListener("keydown", esc, true);
		};
	}, [open]);

	if (!shown) return null;
	const placeName = (where: string) => (where === ROOT_PAGE ? [project] : pageSegments(where));
	const elsewhere = !done && !following && trailWay.kind === "page" ? placeName(trailWay.page) : null;
	const view: TrailView = {
		agent: turn?.agent ?? "agent",
		label: done ? `${made.length} new` : writing === null ? "" : pageName(writing.frame),
		done,
		reading: writing?.reading === true,
		following,
		elsewhere,
		way: trailWay,
		ink: done && !open ? `max(${(REST + (1 - REST) * fresh).toFixed(3)}, var(--wake))` : 1,
		open: open && done,
		made: made.map((name, at) => {
			const where = spots.get(name)?.page ?? pageParent(name);
			return {
				name,
				where: placeName(where),
				here: where === page,
				unseen: unseen.has(name),
				way: ways[at + 1] ?? { kind: "here" },
			};
		}),
		box,
		viewportRef,
		onPress: () => {
			if (done) setOpen(!open);
			else if (following) follow(false);
			else {
				onFollow();
				follow(true);
			}
		},
		onLand: (name) => {
			setOpen(false);
			onLand(name);
		},
	};
	return (fold) => <TrailPath view={view} fold={fold} />;
}

/**
 * The trail at one fold. The row draws it once to be seen and once more per fold out of sight (`Measuring`), where it
 * keeps no refs, no list and no test hooks.
 */
function TrailPath({ view, fold }: { view: TrailView; fold: Fold }) {
	const measuring = useContext(Measuring);
	const t = useMotionScale();
	const wake = useCornerWake(view.viewportRef, !measuring);
	const { agent, label, done, following, elsewhere, open } = view;
	const words = trailWords(elsewhere ?? [], label, fold);
	const whole = [agent, ...(elsewhere ?? []), label].join(" › ");
	const hook = (value: string) => (measuring ? undefined : value);
	return (
		<div
			ref={measuring ? undefined : wake}
			data-agent-trail={hook("")}
			className="relative flex h-control-sm items-center"
			style={{ ["--wake" as string]: 0 }}
		>
			<div ref={measuring ? undefined : view.box} className="relative flex items-center">
				<span className="rounded-xs bg-surface-canvas">
					<button
						type="button"
						tabIndex={measuring ? -1 : undefined}
						data-agent-trail-button={hook(done ? "done" : following ? "following" : "writing")}
						aria-pressed={done ? undefined : following}
						aria-expanded={done ? open : undefined}
						aria-haspopup={done ? "menu" : undefined}
						aria-label={
							done
								? `${label} from ${agent}, show them`
								: following
									? `Following ${agent} on ${label}. Stop following`
									: `Follow ${agent}: ${label}${elsewhere === null ? "" : ` on ${elsewhere.join(" › ")}`}`
						}
						title={fold === "full" ? undefined : whole}
						onClick={view.onPress}
						className={cn(
							"flex h-control-sm items-center whitespace-nowrap rounded-xs px-1 transition-[background-color,opacity] duration-fast ease-out hover:bg-state-hover-raised focus-ring",
							open && !measuring && "bg-state-selected",
						)}
						style={{ opacity: view.ink }}
					>
						<span className="mr-1.5 flex size-3 items-center justify-center">
							<AnimatePresence initial={false} mode="popLayout">
								{done ? (
									<motion.span
										key="disc"
										initial={{ scale: 0.3, opacity: 0 }}
										animate={{ scale: 1, opacity: 1 }}
										transition={{ type: "spring", stiffness: 520, damping: 22 }}
									>
										<StatusMark status="unseen" aria-hidden="true" />
									</motion.span>
								) : (
									<motion.span key="ring" exit={{ opacity: 0, scale: 0.6, transition: { duration: t.fast } }}>
										<SpinRing className={cn("size-3", following ? "text-primary" : "text-secondary")} />
									</motion.span>
								)}
							</AnimatePresence>
						</span>
						<span
							className={cn(
								"type-value transition-colors duration-base",
								following ? "text-primary" : "text-secondary",
							)}
						>
							{agent}
						</span>
						{words.label === null ? null : (
							<>
								<span className="flex w-4 justify-center">
									<Sep />
								</span>
								{/* the words after the name unroll leftward to their new width, pushing the name along */}
								<Unroll
									still={measuring || t.base === 0}
									words={`${words.pages.join("/")}|${words.label}|${fold}`}
								>
									{words.pages.length === 0 ? null : (
										<span
											data-agent-trail-page={hook(elsewhere?.join("/") ?? "")}
											className="flex items-center"
										>
											{words.pages.map((name, at) => (
												<span
													// biome-ignore lint/suspicious/noArrayIndexKey: a page's names are a path, its places fixed
													key={at}
													className={cn(
														"flex items-center type-value",
														name === "…" ? "text-tertiary" : "text-secondary",
													)}
												>
													{name}
													<span className="flex w-4 justify-center">
														<Sep />
													</span>
												</span>
											))}
										</span>
									)}
									<span
										data-agent-trail-label={hook("")}
										className={cn(
											"type-value transition-colors duration-base",
											following || done ? "text-primary" : "text-secondary",
										)}
									>
										{view.reading ? <span className="text-tertiary">reading </span> : null}
										{words.label}
									</span>
									<span className="ml-1.5 flex items-center">
										<Swing way={view.way} following={following} hidden={elsewhere !== null} />
									</span>
								</Unroll>
							</>
						)}
						<AnimatePresence initial={false}>
							{following ? (
								<motion.span
									key="esc"
									className="overflow-hidden text-tertiary type-detail"
									initial={{ opacity: 0, width: 0 }}
									animate={{ opacity: 1, width: "auto" }}
									exit={{ opacity: 0, width: 0 }}
									transition={{ duration: t.base, ease: SNAP }}
								>
									<span className="pl-1.5">esc</span>
								</motion.span>
							) : null}
						</AnimatePresence>
					</button>
				</span>
				{open && !measuring ? (
					<Menu
						aria-label={`What ${agent} made`}
						data-agent-trail-list=""
						className="absolute top-full right-0 mt-1.5 w-[272px]"
					>
						{view.made.map((one) => (
							<MenuItem
								key={one.name}
								data-agent-trail-row={one.name}
								icon={one.unseen ? <StatusMark status="unseen" aria-hidden="true" /> : null}
								label={
									<span className="flex min-w-0 items-center type-value">
										{one.where.map((part) => (
											<span key={part} className="flex items-center">
												<span className={one.here ? "text-tertiary" : "text-secondary"}>{part}</span>
												<span className="flex w-4 justify-center">
													<Sep />
												</span>
											</span>
										))}
										<span className={cn("truncate", one.unseen ? "text-primary" : "text-secondary")}>
											{pageName(one.name)}
										</span>
									</span>
								}
								meta={<RowArrow way={one.way} />}
								onClick={() => view.onLand(one.name)}
							/>
						))}
					</Menu>
				) : null}
			</div>
		</div>
	);
}

/** no bounce: the words unroll and roll back, they never spring past */
const UNROLL = { type: "spring", duration: 0.4, bounce: 0 } as const;

/**
 * The words after the agent's name: a window onto them, right-aligned, whose width follows theirs on a spring, so a
 * new frame name, a page put in or a fold opens leftward from the arrow and pushes the name along instead of jumping
 * it. Out of sight for measuring, it is only the words.
 */
function Unroll({ still, words, children }: { still: boolean; words: string; children: ReactNode }) {
	const inner = useRef<HTMLSpanElement>(null);
	const [width, setWidth] = useState<number | null>(null);
	// the first words come in with the trail itself; only later ones fade in on their own
	const born = useRef(false);
	useEffect(() => {
		born.current = true;
	}, []);
	const read = useCallback(() => {
		const el = inner.current;
		if (el === null) return;
		const next = el.offsetWidth;
		setWidth((was) => (was === next ? was : next));
	}, []);
	// every commit, before paint: the words change with a render, so their width is read in the same frame
	useLayoutEffect(read);
	useEffect(() => {
		const el = inner.current;
		if (el === null || still) return;
		const sizes = new ResizeObserver(read);
		sizes.observe(el);
		return () => sizes.disconnect();
	}, [read, still]);
	if (still) return <span className="flex items-center">{children}</span>;
	return (
		<motion.span
			className="relative flex h-full items-center justify-end overflow-hidden"
			initial={false}
			animate={{ width: width ?? "auto" }}
			transition={UNROLL}
		>
			<span ref={inner} className="flex w-max shrink-0 items-center">
				{/* new words come in faint while the window opens, so their cut-off start is never read; out of the
				    row's presence, whose initial={false} would hold every later arrival still */}
				<PresenceContext.Provider value={null}>
					<motion.span
						key={words}
						className="flex items-center"
						initial={born.current ? { opacity: 0, x: 6 } : false}
						animate={{ opacity: 1, x: 0 }}
						transition={{ duration: 0.26, delay: 0.14, ease: SNAP }}
					>
						{children}
					</motion.span>
				</PresenceContext.Provider>
			</span>
		</motion.span>
	);
}

/**
 * The trail's last mark: an arrow pointing the real way to the frame, turning as
 * you pan. Following, it swings down onto a line, so the one glyph says both
 * where and that you are held to it.
 */
function Swing({ way, following, hidden }: { way: Way; following: boolean; hidden: boolean }) {
	const target = following ? Math.PI / 2 : way.kind === "angle" ? way.angle : 0;
	const angle = useUnwrapped(target);
	const shown = !hidden && (following || way.kind === "angle");
	return (
		<span
			data-agent-trail-arrow={shown ? (following ? "following" : "pointing") : undefined}
			className={cn(
				"relative flex size-3 shrink-0 items-center justify-center transition-opacity duration-base",
				shown ? "opacity-100" : "opacity-0",
				following ? "text-primary" : "text-secondary",
			)}
		>
			<svg
				viewBox="0 0 12 12"
				className="absolute size-3 transition-transform duration-slower ease-snap"
				style={{ transform: `rotate(${angle}rad) translateX(${following ? -0.6 : 0}px)` }}
				fill="none"
				aria-hidden="true"
			>
				<path
					d="M2 6h7.5M6.5 3l3 3-3 3"
					stroke="currentColor"
					strokeWidth="1.3"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			</svg>
			<svg viewBox="0 0 12 12" className="absolute size-3" fill="none" aria-hidden="true">
				<path
					d="M2.5 11h7"
					stroke="currentColor"
					strokeWidth="1.3"
					strokeLinecap="round"
					// the line draws in once the arrow has swung most of the way down
					className="transition-[opacity,transform] duration-base ease-snap"
					style={{
						opacity: following ? 1 : 0,
						transform: following ? "none" : "scaleX(0.2)",
						transformOrigin: "6px 11px",
						transitionDelay: following ? "var(--transition-duration-fast)" : "0ms",
					}}
				/>
			</svg>
		</span>
	);
}

/** a row's arrow toward its frame, none for one on another page */
function RowArrow({ way }: { way: Way }) {
	if (way.kind === "page") return <span className="block size-3" />;
	return (
		<span
			className={cn(
				"flex size-3 items-center justify-center text-secondary transition-opacity duration-base",
				way.kind === "angle" ? "opacity-100" : "opacity-0",
			)}
		>
			<svg
				viewBox="0 0 12 12"
				className="size-3 transition-transform duration-slow ease-snap"
				style={{ transform: `rotate(${way.kind === "angle" ? way.angle : 0}rad)` }}
				fill="none"
				aria-hidden="true"
			>
				<path
					d="M2 6h7.5M6.5 3l3 3-3 3"
					stroke="currentColor"
					strokeWidth="1.3"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			</svg>
		</span>
	);
}

/**
 * Which way each target lies, as the camera moves: a list of frames, or the
 * page of a frame with nowhere on the canvas yet. Drawn again only when an
 * arrow would turn.
 */
function useWays(
	camera: CameraStore,
	viewportRef: RefObject<HTMLElement | null>,
	targets: readonly (readonly Spot[] | string)[],
	page: string,
): readonly Way[] {
	const read = (): Way[] => {
		const cam = camera.get();
		const viewport = viewportRef.current;
		return targets.map((target): Way => {
			if (typeof target === "string") return target === page ? { kind: "here" } : { kind: "page", page: target };
			if (cam === null || viewport === null) return { kind: "here" };
			return wayTo(target, page, cam, { w: viewport.clientWidth, h: viewport.clientHeight });
		});
	};
	const [ways, setWays] = useState<readonly Way[]>(read);
	const latest = useRef(read);
	latest.current = read;
	const keep = useCallback(
		(next: readonly Way[]) =>
			setWays((was) =>
				was.length === next.length && was.every((way, at) => sameWay(way, next[at] as Way)) ? was : next,
			),
		[],
	);
	// biome-ignore lint/correctness/useExhaustiveDependencies: what is pointed at, or the page, changing is the trigger
	useLayoutEffect(() => keep(latest.current()), [targets, page]);
	useEffect(() => camera.subscribe(() => keep(latest.current())), [camera, keep]);
	return ways;
}

/** the wall clock a finished trail fades on, moving only while it is fading */
function useFadeClock(ended: number | null, made: boolean): number {
	const [now, setNow] = useState(Date.now);
	useEffect(() => {
		if (ended === null || !made) return;
		setNow(Date.now());
		const gone = ended + FRESH_MS - Date.now();
		if (gone <= 0) return;
		const tick = setInterval(() => setNow(Date.now()), FADE_TICK_MS);
		const end = setTimeout(() => setNow(Date.now()), gone);
		return () => {
			clearInterval(tick);
			clearTimeout(end);
		};
	}, [ended, made]);
	return now;
}

/** the motion scale's steps in seconds, read off the page as the styles have them */
export function useMotionScale() {
	const still = useReducedMotion() === true;
	const [scale, setScale] = useState({ fast: 0.14, base: 0.18, slow: 0.26, slower: 0.4 });
	useLayoutEffect(() => {
		const style = getComputedStyle(document.documentElement);
		const read = (name: string, fallback: number) => {
			const value = style.getPropertyValue(`--transition-duration-${name}`).trim();
			if (value === "") return fallback;
			return Number.parseFloat(value) / (value.endsWith("ms") ? 1000 : 1);
		};
		setScale({
			fast: read("fast", 0.14),
			base: read("base", 0.18),
			slow: read("slow", 0.26),
			slower: read("slower", 0.4),
		});
	}, []);
	return still ? { fast: 0, base: 0, slow: 0, slower: 0 } : scale;
}

const smoothstep = (a: number, b: number, x: number) => {
	const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
	return t * t * (3 - 2 * t);
};

/**
 * The path's wake, for a thing at the canvas's top right: `--wake` on the
 * element runs 0 to 1 as the pointer nears it, eased every frame, so a finished
 * trail that has faded lifts the way the path's names do.
 */
function useCornerWake(viewportRef: RefObject<HTMLElement | null>, on: boolean) {
	const still = useReducedMotion() === true;
	const ref = useRef<HTMLDivElement | null>(null);
	useEffect(() => {
		const el = ref.current;
		const viewport = viewportRef.current;
		if (!on || el === null || viewport === null) return;
		const w = { near: 0, now: 0, raf: 0, last: 0, depth: 0, pending: false };
		const step = (at: number) => {
			w.pending = false;
			w.raf = 0;
			w.depth += 1;
			try {
				const dt = Math.min(64, Math.max(0, at - w.last));
				w.last = at;
				// a frame clock that answers at once (a test's) lands rather than easing forever
				const land = still || w.depth > 1;
				w.now = land ? w.near : w.now + (w.near - w.now) * (1 - Math.exp(-dt / WAKE_EASE_MS));
				const settled = land || Math.abs(w.near - w.now) < 0.002;
				if (settled) w.now = w.near;
				el.style.setProperty("--wake", w.now.toFixed(3));
				if (!settled) ask();
			} finally {
				w.depth -= 1;
			}
		};
		const ask = () => {
			w.pending = true;
			const id = requestAnimationFrame(step);
			w.raf = w.pending ? id : 0;
		};
		const kick = () => {
			if (w.raf !== 0 || w.depth > 0) return;
			w.last = performance.now();
			ask();
		};
		const sense = (event: PointerEvent) => {
			const r = el.getBoundingClientRect();
			const dx = Math.max(0, r.left - event.clientX - 40, event.clientX - r.right);
			const dy = Math.max(0, event.clientY - r.bottom);
			const near = 1 - smoothstep(0, WAKE_REACH, Math.hypot(dx * 0.6, dy));
			if (near === w.near) return;
			w.near = near;
			kick();
		};
		const away = () => {
			w.near = 0;
			kick();
		};
		viewport.addEventListener("pointermove", sense);
		viewport.addEventListener("pointerleave", away);
		return () => {
			cancelAnimationFrame(w.raf);
			viewport.removeEventListener("pointermove", sense);
			viewport.removeEventListener("pointerleave", away);
		};
	}, [viewportRef, still, on]);
	return ref;
}

/** an angle kept continuous, so an arrow turning past half a turn goes the short way round */
function useUnwrapped(angle: number) {
	const last = useRef(angle);
	let next = angle;
	while (next - last.current > Math.PI) next -= Math.PI * 2;
	while (next - last.current < -Math.PI) next += Math.PI * 2;
	last.current = next;
	return next;
}
