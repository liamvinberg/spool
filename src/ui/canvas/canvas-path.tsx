import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "motion/react";
import { type MouseEvent, type ReactNode, type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "../cn";
import { hotkeyKey } from "../hotkeys";
import { Kbd } from "../primitives/display";

/**
 * The path at the canvas's top left (spool#224): the page's chain from the
 * project down, and after it, fainter still, a ghost of where ⌘↓ goes. As quiet
 * as the canvas until it is wanted: it wakes as the pointer nears the top edge,
 * when a key has just moved you, and while ⌘ is held, and only then do the keys
 * show under the names.
 *
 * Each name is keyed by its page, so a name that stays keeps its place and only
 * its ink changes: going in, the ghost fills in as the page you are on; going
 * up, the page you left dims back into the ghost. Names that come or go slide
 * along the path, deeper to the right. Ink is two stacked layers per name,
 * never a colour tween: the resting tone underneath, the woken tone on top
 * under `--wake`, a number written every animation frame from how near the
 * pointer is. Only opacity and transform move.
 */

export type PathWay = "in" | "up" | "back" | "forward" | "side";

export interface PathSeg {
	/** the page, which keys the name */
	readonly page: string;
	readonly name: string;
	readonly kind: "crumb" | "here" | "ghost";
	/** the key that reaches it, shown under it while ⌘ is held */
	readonly keys?: string | undefined;
	/** its own address, where the path is in a browser: the name is then a link, which a modified click opens apart */
	readonly href?: string | undefined;
}

/**
 * Where the project lives, before its name on a browser's path (spool#238): the team with its mark, or `shared` for
 * someone outside it. Always at full ink, never waiting on the wake, and a real link out of the canvas, whose
 * underline draws in under the pointer and the keyboard's focus.
 */
export interface PathPlace {
	readonly name: string;
	readonly href: string;
	/** what is there, said as the link's title */
	readonly title: string;
	readonly mark: ReactNode;
	/** the key that reaches it, shown under it while ⌘ is held */
	readonly keys?: string | undefined;
}

/** px a name slides as it comes or goes */
const TRAVEL = 14;
/** px the pointer can be from the path and still wake it */
const WAKE_REACH = 160;
/** the ghost's ink at rest */
const GHOST = 0.45;
/** how long ⌘ is held before the keys show: a chord pressed at once means the hand already knows */
const HOLD_MS = 450;
/** how long a key's move keeps the path lit */
const PING_MS = 1200;
/** how quickly the wake eases toward where it is going */
const EASE_MS = 90;

/** the motion scale's base step, read off the page as the styles have it */
function baseSeconds(element: Element | null): number {
	if (element === null) return 0.18;
	const value = getComputedStyle(element).getPropertyValue("--transition-duration-base").trim();
	if (value === "") return 0.18;
	return Number.parseFloat(value) / (value.endsWith("ms") ? 1000 : 1);
}

const EASE = [0.22, 0.61, 0.36, 1] as const;
const ENTER: Record<PathWay, number> = { in: 1, up: 1, back: -1, forward: 1, side: 0.5 };
const LEAVE: Record<PathWay, number> = { in: 1, up: 1, back: 1, forward: -1, side: -0.5 };

/** the four layers' opacities for a kind: [rest tertiary, rest secondary, woken secondary, woken primary] */
function inks(kind: PathSeg["kind"]): [number, number, number, number] {
	if (kind === "crumb") return [1, 0, 1, 0];
	if (kind === "here") return [1, 1, 1, 1];
	return [GHOST, 0, 0.55, 0];
}

const smoothstep = (a: number, b: number, x: number) => {
	const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
	return t * t * (3 - 2 * t);
};

export function CanvasPath({
	segs,
	way,
	accelDown,
	moved,
	trail,
	viewport,
	awake = false,
	lit = null,
	peeked = null,
	place,
	tail,
	lifted = false,
	onGo,
}: {
	segs: readonly PathSeg[];
	/** which way the last move went, so names come and go from that side */
	way: PathWay;
	/** ⌘ is down; held long enough, the keys show */
	accelDown: boolean;
	/** changes each time a key moves you, which lights the path for a moment */
	moved: number;
	/** ⌘[ and ⌘], said at the path's end while ⌘ is held */
	trail: readonly { keys: string; name: string }[];
	/** the canvas whose pointer wakes the path */
	viewport: RefObject<HTMLElement | null>;
	/** something wants the path read now: a drag that could land on a name, a peek opened from one */
	awake?: boolean;
	/** the name a drag is aimed at */
	lit?: string | null;
	/** the name a peek is showing */
	peeked?: string | null;
	/** where the project lives, first on the path: a browser's alone */
	place?: PathPlace | undefined;
	/** what ends the row, inside the path so it rides `--wake`: the finder's door (`find-door.tsx`) */
	tail?: ReactNode;
	/** the names stand over the finder, which opened under them with its field where the door was */
	lifted?: boolean;
	onGo: (page: string) => void;
}) {
	const still = useReducedMotion() === true;
	const bar = useRef<HTMLDivElement | null>(null);
	const [dur, setDur] = useState(0.18);
	useLayoutEffect(() => setDur(still ? 0 : baseSeconds(bar.current)), [still]);

	// ⌘ held for a beat shows the keys; any other key pressed with it means the hand already knows
	const [held, setHeld] = useState(false);
	useEffect(() => {
		if (!accelDown) {
			setHeld(false);
			return;
		}
		const timer = window.setTimeout(() => setHeld(true), HOLD_MS);
		const chord = (event: KeyboardEvent) => {
			if (event.key !== "Meta" && event.key !== "Control") window.clearTimeout(timer);
		};
		window.addEventListener("keydown", chord, true);
		return () => {
			window.clearTimeout(timer);
			window.removeEventListener("keydown", chord, true);
		};
	}, [accelDown]);

	// ---- the wake: how near the pointer is, eased every frame ----
	const wake = useRef({
		near: 0,
		now: 0,
		ping: Number.NEGATIVE_INFINITY,
		raf: 0,
		last: 0,
		force: false,
		depth: 0,
		pending: false,
	});
	wake.current.force = held || awake;
	const kick = useRef(() => {});
	kick.current = () => {
		const w = wake.current;
		if (w.raf !== 0 || w.depth > 0) return;
		w.last = performance.now();
		const ask = () => {
			w.pending = true;
			const id = requestAnimationFrame(step);
			// a frame clock that answers at once (a test's) has run the frame already, and landed
			w.raf = w.pending ? id : 0;
		};
		const step = (t: number) => {
			w.pending = false;
			w.depth += 1;
			try {
				const dt = Math.min(64, Math.max(0, t - w.last));
				w.last = t;
				const ping = smoothstep(0, 1, 1 - (t - w.ping) / PING_MS);
				const target = Math.max(w.near, w.force ? 1 : 0, ping);
				const land = still || w.depth > 1;
				w.now = land ? target : w.now + (target - w.now) * (1 - Math.exp(-dt / EASE_MS));
				const settled = land || (Math.abs(target - w.now) < 0.002 && ping === 0);
				if (settled) w.now = target;
				bar.current?.style.setProperty("--wake", w.now.toFixed(3));
				if (settled) w.raf = 0;
				else ask();
			} finally {
				w.depth -= 1;
			}
		};
		ask();
	};
	// biome-ignore lint/correctness/useExhaustiveDependencies: a change in what holds the path awake restarts the easing
	useEffect(() => kick.current(), [held, awake]);
	useEffect(() => {
		if (moved === 0) return;
		wake.current.ping = performance.now();
		kick.current();
	}, [moved]);
	useEffect(() => () => cancelAnimationFrame(wake.current.raf), []);
	useEffect(() => {
		const el = viewport.current;
		if (el === null) return;
		const sense = (event: PointerEvent) => {
			const path = bar.current;
			if (path === null) return;
			const r = path.getBoundingClientRect();
			const dx = Math.max(0, event.clientX - r.right - 40, r.left - event.clientX);
			const dy = Math.max(0, event.clientY - r.bottom);
			const near = 1 - smoothstep(0, WAKE_REACH, Math.hypot(dx * 0.6, dy));
			if (near === wake.current.near) return;
			wake.current.near = near;
			kick.current();
		};
		const away = () => {
			wake.current.near = 0;
			kick.current();
		};
		el.addEventListener("pointermove", sense);
		el.addEventListener("pointerleave", away);
		return () => {
			el.removeEventListener("pointermove", sense);
			el.removeEventListener("pointerleave", away);
		};
	}, [viewport]);

	const fade = `opacity ${dur * 1000}ms cubic-bezier(${EASE.join(", ")})`;
	return (
		<nav
			ref={bar}
			aria-label="Path"
			data-page-path=""
			className={cn("absolute top-3 left-3 flex h-control-sm items-center", lifted ? "z-50" : "z-20")}
			style={{ ["--wake" as string]: 0 }}
			onPointerDown={(event) => event.stopPropagation()}
			onDoubleClick={(event) => event.stopPropagation()}
		>
			{place === undefined ? null : (
				<span className="relative flex items-center">
					<a
						href={place.href}
						title={place.title}
						data-path-place=""
						className="group/place flex h-control-sm items-center gap-1.5 rounded-xs px-1 text-primary type-value focus-ring"
					>
						{place.mark}
						<span className="relative">
							{place.name}
							{/* the underline draws in from the name's start, and back out */}
							<span
								aria-hidden="true"
								className="absolute inset-x-0 -bottom-px h-px origin-left scale-x-0 bg-current transition-transform duration-fast ease-out group-hover/place:scale-x-100 group-focus-visible/place:scale-x-100 motion-reduce:transition-none"
							/>
						</span>
					</a>
					{place.keys === undefined ? null : <HeldKey keys={place.keys} held={held} fade={dur} after={false} />}
				</span>
			)}
			<AnimatePresence mode="popLayout" initial={false} custom={way}>
				{segs.map((seg, at) => {
					return (
						<motion.span
							key={seg.page}
							layout="position"
							custom={way}
							variants={{
								out: (w: PathWay) => ({ opacity: 0, x: LEAVE[w] * (still ? 0 : TRAVEL) }),
								come: (w: PathWay) => ({ opacity: 0, x: ENTER[w] * (still ? 0 : TRAVEL) }),
								rest: { opacity: 1, x: 0 },
							}}
							initial="come"
							animate="rest"
							exit="out"
							transition={{ duration: dur, ease: EASE }}
							className="relative flex items-center"
						>
							{at === 0 && place === undefined ? null : (
								<span aria-hidden="true" className="relative flex w-4 justify-center">
									<Sep />
								</span>
							)}
							<PathName seg={seg} fade={fade} lit={seg.page === lit} peeked={seg.page === peeked} onGo={onGo} />
							{seg.keys === undefined ? null : <HeldKey keys={seg.keys} held={held} fade={dur} after={at > 0} />}
						</motion.span>
					);
				})}
			</AnimatePresence>
			{tail === undefined ? null : (
				// follows the last name as names come and go, on the same curve
				<motion.span layout="position" transition={{ duration: dur, ease: EASE }} className="flex items-center">
					{tail}
				</motion.span>
			)}
			<AnimatePresence>
				{held && !lifted && trail.length > 0 ? (
					<motion.span
						key="trail"
						data-path-trail=""
						initial={{ opacity: 0, x: still ? 0 : -4 }}
						animate={{ opacity: 1, x: 0 }}
						exit={{ opacity: 0, x: still ? 0 : -4 }}
						transition={{ duration: dur, ease: EASE }}
						className="ml-4 flex items-center gap-3 text-secondary type-detail"
					>
						{trail.map((one) => (
							<span key={one.keys} className="flex items-center gap-1.5">
								<Kbd>{one.keys}</Kbd>
								{one.name}
							</span>
						))}
					</motion.span>
				) : null}
			</AnimatePresence>
		</nav>
	);
}

/**
 * One name on the path. A name on its way out is only ink: it is no target,
 * and it says no page, so only the names that stand are a way somewhere.
 */
function PathName({
	seg,
	fade,
	lit,
	peeked,
	onGo,
}: {
	seg: PathSeg;
	fade: string;
	/** a drag is aimed at it: it reads in accent ink over an accent wash, awake or not */
	lit: boolean;
	peeked: boolean;
	onGo: (page: string) => void;
}) {
	const present = useIsPresent();
	const [t, s, ws, wp] = inks(seg.kind);
	// every name that stands is a folder a drag can land in and Space can peek at, but the page you are on
	const folder = present && seg.kind !== "here";
	const link = folder && seg.href !== undefined;
	const Name = link ? "a" : "button";
	return (
		<Name
			{...(link ? { href: seg.href } : { type: "button" as const })}
			data-path-page={present ? seg.page : undefined}
			data-path-kind={present ? seg.kind : undefined}
			data-drop-page={folder ? seg.page : undefined}
			data-drop-at={folder ? "path" : undefined}
			data-peek-from={folder ? "path" : undefined}
			data-drop-lit={lit ? "" : undefined}
			aria-current={seg.kind === "here" ? "page" : undefined}
			aria-hidden={present ? undefined : true}
			tabIndex={present ? undefined : -1}
			aria-label={seg.kind === "here" ? seg.name : seg.kind === "ghost" ? `Into ${seg.name}` : `Up to ${seg.name}`}
			onClick={(event: MouseEvent<HTMLElement>) => {
				// a link pressed with a modifier, or by the middle button, opens where the browser opens it
				if (link && (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0))
					return;
				event.preventDefault();
				if (folder) onGo(seg.page);
			}}
			className={cn(
				"relative grid h-control-sm items-center rounded-xs px-1 type-value transition-colors duration-fast ease-out",
				seg.kind === "here" || !present ? "pointer-events-none" : "cursor-pointer",
				lit ? "bg-accent-subtle" : peeked && "bg-state-selected",
			)}
		>
			{/* at rest */}
			<span className="col-start-1 row-start-1 text-tertiary" style={{ opacity: lit ? 0 : t, transition: fade }}>
				{seg.name}
			</span>
			<span className="col-start-1 row-start-1 text-secondary" style={{ opacity: lit ? 0 : s, transition: fade }}>
				{seg.name}
			</span>
			{/* woken: rides --wake, which moves every frame, so it carries no transition of its own */}
			<span aria-hidden="true" className="col-start-1 row-start-1 grid" style={{ opacity: lit ? 1 : "var(--wake)" }}>
				<span
					className="col-start-1 row-start-1 text-secondary"
					style={{ opacity: lit ? 0 : ws, transition: fade }}
				>
					{seg.name}
				</span>
				<span
					className={cn("col-start-1 row-start-1", lit ? "text-accent-strong" : "text-primary")}
					style={{ opacity: lit ? 1 : wp, transition: fade }}
				>
					{seg.name}
				</span>
			</span>
		</Name>
	);
}

/** The faces the path wears, from the register, so they cannot drift from the keys. */
export const PATH_KEYS = {
	up: () => hotkeyKey("canvas.page-up"),
	down: () => hotkeyKey("canvas.page-in"),
	back: () => hotkeyKey("canvas.thread-back"),
	forward: () => hotkeyKey("canvas.thread-next"),
};

/** the key under a name, faded in while ⌘ is held and gone the moment it is let go */
function HeldKey({ keys, held, fade, after }: { keys: string; held: boolean; fade: number; after: boolean }) {
	const curve = `${fade * 1000}ms cubic-bezier(${EASE.join(", ")})`;
	return (
		<span
			aria-hidden="true"
			data-path-key={held ? keys : undefined}
			// under the name, past the chevron before it
			className={cn("pointer-events-none absolute top-full pt-1", after ? "left-5" : "left-1")}
			style={{
				opacity: held ? 1 : 0,
				transform: held ? "none" : "translateY(-3px)",
				transition: `opacity ${curve}, transform ${curve}`,
			}}
		>
			<Kbd>{keys}</Kbd>
		</span>
	);
}

/** a hairline chevron between names: one step deeper, to the right */
export function Sep() {
	return (
		<svg viewBox="0 0 8 12" className="h-2.5 w-1.5 text-disabled" fill="none" aria-hidden="true">
			<path
				d="M2 2.5 5.5 6 2 9.5"
				stroke="currentColor"
				strokeWidth="1.1"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}
