import type { CSSProperties, ReactNode } from "react";
import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { Teammate } from "./presence";

/**
 * PROTOTYPE (task 94): what a teammate's pointer does inside a live frame, four ways, switchable with
 * `?presence=morph|trail|touch|badge` on the canvas's address. Nothing in the frame is synced: their clicks,
 * drags and scrolls are told by the pointer alone, from what presence already carries.
 */
export const VARIANTS = [
	{ key: "morph", name: "Morph", says: "the cursor itself changes shape" },
	{ key: "trail", name: "Trail", says: "it leaves marks behind" },
	{ key: "touch", name: "Touch", says: "a fingertip under the cursor" },
	{ key: "badge", name: "Badge", says: "a word beside the cursor" },
] as const;
export type Variant = (typeof VARIANTS)[number]["key"];

const listeners = new Set<() => void>();
const asked = (): Variant | null => {
	const value = new URLSearchParams(window.location.search).get("presence");
	return VARIANTS.some((one) => one.key === value) ? (value as Variant) : null;
};
const subscribe = (listener: () => void) => {
	listeners.add(listener);
	return () => listeners.delete(listener);
};
export function usePresenceVariant(): { variant: Variant; asked: boolean } {
	const value = useSyncExternalStore(subscribe, asked);
	return { variant: value ?? "morph", asked: value !== null };
}
function choose(variant: Variant) {
	const url = new URL(window.location.href);
	url.searchParams.set("presence", variant);
	window.history.replaceState(window.history.state, "", url);
	for (const listener of listeners) listener();
}

/** How long each mark lasts. */
const CLICK_MS = 650;
const SCROLL_MS = 450;
const TRAIL_MS = 650;
/** How far a press moves before it's a drag, in world units. */
const SLOP = 4;

export interface Track {
	clicks: number;
	/** The latest click, where it landed in world units; `n` keys its animation. */
	click: { n: number; at: number; x: number; y: number } | null;
	pressed: boolean;
	origin: { x: number; y: number } | null;
	dragging: boolean;
	released: { n: number; at: number } | null;
	/** Where the drawn pointer has been while dragging, in world units. */
	trail: { x: number; y: number; at: number }[];
	scrollY: number | null;
	scroll: { dir: 1 | -1; at: number } | null;
}

/** One render's worth of what a teammate's pointer is doing inside their frame. */
export function followGesture(
	track: Track | undefined,
	mate: Teammate,
	eased: { x: number; y: number } | null,
	now: number,
): Track {
	const { state } = mate;
	const clicks = state.clicks ?? 0;
	const scrollY = state.scroll?.y ?? null;
	if (track === undefined)
		return {
			clicks,
			click: null,
			pressed: state.pressed,
			origin: null,
			dragging: false,
			released: null,
			trail: [],
			scrollY,
			scroll: null,
		};
	const next = { ...track };
	const pointer = state.pointer;
	if (clicks > track.clicks && pointer !== null)
		next.click = { n: (track.click?.n ?? 0) + 1, at: now, x: pointer.x, y: pointer.y };
	next.clicks = clicks;
	const pressed = state.pressed && state.inside !== null;
	if (pressed && !track.pressed) {
		next.origin = pointer;
		next.dragging = false;
	}
	if (pressed && next.origin !== null && pointer !== null)
		next.dragging ||= Math.hypot(pointer.x - next.origin.x, pointer.y - next.origin.y) > SLOP;
	if (!pressed && track.pressed) {
		next.released = { n: (track.released?.n ?? 0) + 1, at: now };
		next.dragging = false;
	}
	next.pressed = pressed;
	next.trail = track.trail.filter((point) => now - point.at < TRAIL_MS);
	if (next.dragging && eased !== null) {
		const last = next.trail.at(-1);
		if (last === undefined || Math.hypot(last.x - eased.x, last.y - eased.y) > 0.5)
			next.trail.push({ ...eased, at: now });
	}
	if (scrollY !== null && track.scrollY !== null && scrollY !== track.scrollY)
		next.scroll = { dir: scrollY > track.scrollY ? 1 : -1, at: now };
	next.scrollY = scrollY;
	return next;
}

/** Whether something about this track is still animating by the clock alone. */
export function gestureBusy(track: Track, now: number): boolean {
	return (
		track.trail.length > 0 ||
		(track.click !== null && now - track.click.at < CLICK_MS) ||
		(track.scroll !== null && now - track.scroll.at < SCROLL_MS) ||
		(track.released !== null && now - track.released.at < CLICK_MS)
	);
}

const scrolling = (track: Track, now: number) => track.scroll !== null && now - track.scroll.at < SCROLL_MS;
const clicked = (track: Track, now: number) => track.click !== null && now - track.click.at < CLICK_MS;

export type Glyph = "arrow" | "pressed" | "hand" | "scroll";

/** Which shape the pointer itself takes. */
export function glyphOf(variant: Variant, track: Track | undefined, now: number): Glyph {
	if (track === undefined) return "arrow";
	if (variant === "morph") {
		if (track.dragging) return "hand";
		if (scrolling(track, now)) return "scroll";
	}
	if (variant === "touch") return "arrow";
	return track.pressed ? "pressed" : "arrow";
}

/** Marks that move with the pointer, drawn in its own box: the tip is (0, 0). */
export function GestureAtPointer({
	variant,
	track,
	color,
	now,
}: {
	variant: Variant;
	track: Track | undefined;
	color: string;
	now: number;
}): ReactNode {
	if (track === undefined) return null;
	const dir = track.scroll?.dir ?? 1;
	const isScrolling = scrolling(track, now);
	if (variant === "morph")
		return track.click !== null && clicked(track, now) ? <Burst key={track.click.n} color={color} /> : null;
	if (variant === "trail")
		return isScrolling ? <Chevrons key={dir} color={color} dir={dir} at={{ x: 20, y: 6 }} /> : null;
	if (variant === "touch") {
		const down = track.pressed || (track.click !== null && now - track.click.at < 140);
		return (
			<>
				<span
					data-presence-touch=""
					className="absolute rounded-full border-2 transition-[opacity,transform] duration-100"
					style={{
						left: -14,
						top: -14,
						width: 28,
						height: 28,
						borderColor: color,
						background: `${color}55`,
						opacity: down ? 1 : 0,
						transform: `scale(${down ? 1 : 0.6})`,
					}}
				/>
				{track.released !== null && now - track.released.at < CLICK_MS && (
					<span
						key={`lift${track.released.n}`}
						className="absolute animate-presence-lift rounded-full border-2"
						style={{ left: -14, top: -14, width: 28, height: 28, borderColor: color }}
					/>
				)}
				{track.click !== null && clicked(track, now) && !track.pressed && (
					<span
						key={`tap${track.click.n}`}
						className="absolute animate-presence-lift rounded-full border-2"
						style={{ left: -14, top: -14, width: 28, height: 28, borderColor: color, background: `${color}40` }}
					/>
				)}
				{isScrolling && <TwoFingers key={dir} color={color} dir={dir} />}
			</>
		);
	}
	// badge
	const word = track.dragging
		? "dragging"
		: isScrolling
			? dir > 0
				? "scrolling ↓"
				: "scrolling ↑"
			: track.pressed
				? "pressing"
				: clicked(track, now)
					? "click"
					: null;
	return (
		<span
			className="absolute flex items-center gap-1 whitespace-nowrap rounded-full px-[7px] font-medium text-[11px] leading-none transition-[opacity,transform] duration-150"
			style={{
				left: 14,
				top: 18,
				height: 18,
				background: color,
				color: "#0e0e0e",
				opacity: word === null ? 0 : 1,
				transform: `scale(${word === null ? 0.85 : 1})`,
				transformOrigin: "0 0",
			}}
		>
			{word ?? "click"}
		</span>
	);
}

/** Marks left where they happened, in world units, drawn over the whole layer. */
export function GestureMarks({
	variant,
	track,
	color,
	now,
	toScreen,
	k,
}: {
	variant: Variant;
	track: Track;
	color: string;
	now: number;
	toScreen: (x: number, y: number) => { x: number; y: number };
	k: number;
}): ReactNode {
	const marks: ReactNode[] = [];
	if (variant === "trail" && track.click !== null && clicked(track, now)) {
		const at = toScreen(track.click.x, track.click.y);
		marks.push(
			<span
				key={`ring${track.click.n}`}
				data-presence-click=""
				className="absolute top-0 left-0 size-[44px] animate-presence-click rounded-full border-[2.5px]"
				style={{ left: at.x - 22, top: at.y - 22, borderColor: color, background: `${color}40` }}
			/>,
		);
	}
	if ((variant === "trail" || variant === "touch") && track.trail.length > 1) {
		const width = variant === "touch" ? 22 : 3;
		const ink = variant === "touch" ? 0.22 : 0.9;
		const points = track.trail.map((point) => ({ ...toScreen(point.x, point.y), at: point.at }));
		marks.push(
			<svg key="trail" className="absolute inset-0 size-full overflow-visible" aria-hidden="true">
				{points.slice(1).map((point, i) => {
					const from = points[i] as { x: number; y: number };
					const fade = Math.max(0, 1 - (now - point.at) / TRAIL_MS);
					return (
						<line
							key={`${point.at}:${point.x}:${point.y}`}
							x1={from.x}
							y1={from.y}
							x2={point.x}
							y2={point.y}
							stroke={color}
							strokeWidth={width * Math.max(1, Math.min(k, 1.5))}
							strokeLinecap="round"
							opacity={ink * fade}
						/>
					);
				})}
			</svg>,
		);
	}
	return marks;
}

/** A short burst of strokes out of the tip: the click. */
function Burst({ color }: { color: string }) {
	return (
		<>
			{[195, 240, 285, 330, 15].map((angle) => (
				<span key={angle} className="absolute top-0 left-0" style={{ transform: `rotate(${angle}deg)` }}>
					<span
						className="absolute block h-[3.5px] w-[10px] animate-presence-burst rounded-full"
						style={{ background: color, top: -1.75, boxShadow: "0 0 0 1px #0e0e0e" }}
					/>
				</span>
			))}
		</>
	);
}

/** Chevrons flowing the way the page scrolls. */
function Chevrons({ color, dir, at }: { color: string; dir: 1 | -1; at: { x: number; y: number } }) {
	return (
		<span className="absolute" style={{ left: at.x, top: at.y, "--dir": dir } as CSSProperties}>
			{[0, 1, 2].map((i) => (
				<svg
					key={i}
					viewBox="-1 -1 14 10"
					width="14"
					height="10"
					className="absolute left-0 animate-presence-chevron opacity-0"
					style={{ top: (dir > 0 ? i : 2 - i) * 6, animationDelay: `${i * 110}ms` }}
					aria-hidden="true"
				>
					<path
						d={dir > 0 ? "M1.5 1.5 6 6l4.5-4.5" : "M1.5 6.5 6 2l4.5 4.5"}
						fill="none"
						stroke="#0e0e0e"
						strokeWidth="4.4"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
					<path
						d={dir > 0 ? "M1.5 1.5 6 6l4.5-4.5" : "M1.5 6.5 6 2l4.5 4.5"}
						fill="none"
						stroke={color}
						strokeWidth="2.2"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</svg>
			))}
		</span>
	);
}

/** Two fingertips swiping the way the page scrolls, like a trackpad. */
function TwoFingers({ color, dir }: { color: string; dir: 1 | -1 }) {
	return (
		<span className="absolute" style={{ left: -12, top: -6, "--dir": dir } as CSSProperties}>
			{[0, 14].map((x) => (
				<span
					key={x}
					className="absolute size-[12px] animate-presence-swipe rounded-full border-2"
					style={{ left: x, borderColor: color, background: `${color}99`, boxShadow: "0 0 0 1px #0e0e0e" }}
				/>
			))}
		</span>
	);
}

/** The pointer turned into a mouse with its wheel turning, while they scroll. */
export function ScrollGlyph({ color, shown, dir }: { color: string; shown: boolean; dir: 1 | -1 }) {
	return (
		<span
			className="absolute top-0 left-0 transition-[opacity,transform] duration-150"
			style={{ opacity: shown ? 1 : 0, transform: `scale(${shown ? 1 : 0.6})`, "--dir": dir } as CSSProperties}
		>
			<svg viewBox="0 0 14 20" width="14" height="20" className="absolute top-[-2px] left-[-2px]" aria-hidden="true">
				<rect x="1" y="1" width="12" height="18" rx="6" fill={color} stroke="#0e0e0e" strokeWidth="1.15" />
				<rect x="6" y="4" width="2" height="5" rx="1" fill="#0e0e0e" className="animate-presence-wheel" />
			</svg>
			<Chevrons color={color} dir={dir} at={{ x: 16, y: dir > 0 ? 6 : -2 }} />
		</span>
	);
}

/** The prototype's own bar: which variant is drawn, and the way to the others. Only when one was asked for. */
export function PresenceVariantBar() {
	const { variant, asked: shown } = usePresenceVariant();
	if (!shown) return null;
	const index = VARIANTS.findIndex((one) => one.key === variant);
	const current = VARIANTS[index] ?? VARIANTS[0];
	const step = (by: number) => choose((VARIANTS[(index + by + VARIANTS.length) % VARIANTS.length] ?? VARIANTS[0]).key);
	// out of the canvas, which takes every press inside it for its own
	return createPortal(
		<div
			data-presence-variant-bar=""
			className="-translate-x-1/2 pointer-events-auto fixed top-14 left-1/2 z-[1000] flex items-center gap-1 rounded-full bg-[#f4f4f4] px-1 py-1 text-[#111] text-[12px] shadow-lg"
		>
			<button
				type="button"
				className="rounded-full px-2 py-0.5 hover:bg-black/10"
				onPointerDown={(event) => {
					event.preventDefault();
					step(-1);
				}}
			>
				←
			</button>
			<span className="px-1 font-medium">
				{String.fromCharCode(65 + index)} · {current.name}
				<span className="font-normal text-[#666]"> — {current.says}</span>
			</span>
			<button
				type="button"
				className="rounded-full px-2 py-0.5 hover:bg-black/10"
				onPointerDown={(event) => {
					event.preventDefault();
					step(1);
				}}
			>
				→
			</button>
		</div>,
		document.body,
	);
}
