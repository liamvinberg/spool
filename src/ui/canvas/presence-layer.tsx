import { useEffect, useReducer, useRef } from "react";
import type { Box } from "./camera";
import type { CameraStore } from "./camera-store";
import { idle, nextChange, type PresenceRoom, speaking, springStep, type Teammate } from "./presence";

/**
 * Teammates on this page of a team canvas (DEV-196): each one's pointer in their colour with their name in a
 * pill, the pill docked on a frame's name while they're inside it live, a grabbing hand while they drag, and
 * the frames they're moving outlined in their colour.
 *
 * Everything stands in screen pixels over the field, so names stay one size at any zoom. Where a pointer is
 * drawn is eased toward where it was last heard on a critically damped spring, so it is calm and never
 * overshoots; whether a name is said, idle or gone is the clock's, from `presence.ts`.
 */

/** How quickly a drawn pointer catches up with the one heard, in radians a second. */
const POINTER_W = 15;
/** How quickly a pill flies to a frame's name and back. */
const DOCK_W = 10;
/** The ink an idle pointer sinks to. */
const IDLE_INK = 1 / 3;
/** A pill's height, and the gap between pills lined up on one name. */
const PILL_H = 18;
const PILL_GAP = 6;
/** Above a frame's top edge, where its name's row is. */
const NAME_ROW = 27;

/** A pill's width at 11px medium, near enough to line pills up by. */
export function pillWidth(name: string): number {
	return Math.round(name.length * 6.5 + 14);
}

interface Motion {
	/** Where the pointer is drawn, in world units; null until it has been somewhere on this page. */
	x: { p: number; v: number } | null;
	y: { p: number; v: number } | null;
	dock: { p: number; v: number };
	/** The name the pill last docked on, in screen pixels: where it flies home from. */
	slot: { x: number; y: number } | null;
}

/** How long a click's ring takes to spread and fade; the animation in `ui.css` runs the same. */
const RIPPLE_MS = 650;

interface Ripple {
	key: string;
	color: string;
	/** Where the click landed, in world units. */
	x: number;
	y: number;
	at: number;
}

export function PresenceLayer({
	room,
	camera,
	frames,
	page,
}: {
	room: PresenceRoom;
	camera: CameraStore;
	/** The frames on this page, in world units. */
	frames: readonly (Box & { name: string })[];
	page: string;
}) {
	const [, redraw] = useReducer((n: number) => n + 1, 0);
	const motions = useRef(new Map<string, Motion>());
	const docked = useRef(new Map<string, string | null>());
	const kicked = useRef(() => {});
	// each person's clicks inside a live frame as last counted, and the rings still spreading from them
	const clicked = useRef(new Map<string, number>());
	const ripples = useRef<Ripple[]>([]);
	// where each person's frame was last scrolled to, and since when: a thumb shows only once they scroll
	const scrolled = useRef(new Map<string, { y: number; at: number | null }>());

	// every change heard, every camera drawn, and every moment the clock alone changes something, is a redraw;
	// while a pointer or a pill is still easing, so is every animation frame
	useEffect(() => {
		let frame: number | undefined;
		let timer: ReturnType<typeof setTimeout> | undefined;
		let last = performance.now();
		const step = (time: number) => {
			frame = undefined;
			const dt = Math.min(0.05, Math.max(0, (time - last) / 1000));
			last = time;
			let moving = false;
			for (const mate of room.teammates()) {
				const at = mate.state.pointer;
				const motion = motions.current.get(mate.person.accountId);
				if (motion === undefined) continue;
				const goal = docked.current.get(mate.person.accountId) ? 1 : 0;
				motion.dock = springStep(motion.dock, goal, dt, DOCK_W);
				moving ||= Math.abs(motion.dock.p - goal) > 0.002;
				if (at === null) continue;
				motion.x = motion.x === null ? { p: at.x, v: 0 } : springStep(motion.x, at.x, dt, POINTER_W);
				motion.y = motion.y === null ? { p: at.y, v: 0 } : springStep(motion.y, at.y, dt, POINTER_W);
				moving ||= Math.abs(motion.x.p - at.x) + Math.abs(motion.y.p - at.y) > 0.05;
			}
			redraw();
			if (moving) kick();
		};
		const kick = () => {
			last = frame === undefined ? performance.now() : last;
			frame ??= requestAnimationFrame(step);
		};
		kicked.current = kick;
		const schedule = () => {
			if (timer !== undefined) clearTimeout(timer);
			const now = Date.now();
			const next = nextChange(room.teammates(), now);
			timer = next === undefined ? undefined : setTimeout(schedule, next - now + 5);
			kick();
		};
		schedule();
		const unhear = room.subscribe(schedule);
		const unwatch = camera.subscribe(kick);
		return () => {
			unhear();
			unwatch();
			if (frame !== undefined) cancelAnimationFrame(frame);
			if (timer !== undefined) clearTimeout(timer);
		};
	}, [room, camera]);
	// a render is what decides who is docked where, so a pill whose dock changed starts flying from here
	useEffect(() => {
		for (const [id, motion] of motions.current)
			if (Math.abs(motion.dock.p - (docked.current.get(id) ? 1 : 0)) > 0.002) return kicked.current();
	});

	const cam = camera.get();
	if (cam === null) return null;
	const now = Date.now();
	const here = room.teammates().filter((mate) => mate.state.page === page);
	const toScreen = (x: number, y: number) => ({ x: x * cam.k + cam.x, y: y * cam.k + cam.y });

	// the pills docked on each frame's name, right to left in the order their people went inside
	const slots = new Map<string, { x: number; y: number }>();
	const byName = new Map(frames.map((frame) => [frame.name, frame]));
	for (const frame of frames) {
		const inside = here
			.filter((mate) => mate.left === null && mate.state.inside === frame.name)
			.sort((a, b) => a.entered - b.entered);
		const corner = toScreen(frame.x + frame.w, frame.y);
		let right = corner.x;
		for (const mate of inside) {
			const width = pillWidth(mate.person.name);
			slots.set(mate.person.accountId, { x: right - width, y: corner.y - NAME_ROW });
			right -= width + PILL_GAP;
		}
	}

	for (const id of [...motions.current.keys()])
		if (!here.some((mate) => mate.person.accountId === id)) motions.current.delete(id);
	for (const mate of here) {
		const id = mate.person.accountId;
		docked.current.set(id, slots.has(id) ? (mate.state.inside ?? null) : null);
		const at = mate.state.pointer;
		const slot = slots.get(id);
		const motion = motions.current.get(id);
		if (motion === undefined)
			motions.current.set(id, {
				x: at === null ? null : { p: at.x, v: 0 },
				y: at === null ? null : { p: at.y, v: 0 },
				dock: { p: slot === undefined ? 0 : 1, v: 0 },
				slot: slot ?? null,
			});
		else if (motion !== undefined && slot !== undefined) motion.slot = slot;
		// a click counted since last time is a ring where it landed; the first time anyone is seen, it's only noted
		const clicks = mate.state.clicks ?? 0;
		const before = clicked.current.get(id);
		clicked.current.set(id, clicks);
		if (before !== undefined && clicks > before && at !== null && mate.left === null)
			ripples.current.push({ key: `${id}:${clicks}`, color: mate.person.color, x: at.x, y: at.y, at: now });
	}
	ripples.current = ripples.current.filter((ripple) => now - ripple.at < RIPPLE_MS);
	for (const mate of here) {
		const id = mate.person.accountId;
		const y = mate.state.scroll?.y;
		const was = scrolled.current.get(id);
		if (y === undefined) scrolled.current.delete(id);
		else if (was === undefined) scrolled.current.set(id, { y, at: null });
		else if (was.y !== y) scrolled.current.set(id, { y, at: now });
	}

	return (
		<div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true" data-presence-layer="">
			{here.flatMap((mate) =>
				mate.state.dragging.flatMap((name) => {
					const frame = byName.get(name);
					if (frame === undefined || mate.left !== null) return [];
					const corner = toScreen(frame.x, frame.y);
					return [
						<span
							key={`${mate.person.accountId}:${name}`}
							data-presence-outline={name}
							className="absolute rounded-[5px] border-[1.5px]"
							style={{
								left: corner.x - 3,
								top: corner.y - 3,
								width: frame.w * cam.k + 6,
								height: frame.h * cam.k + 6,
								borderColor: mate.person.color,
							}}
						/>,
					];
				}),
			)}
			{here.flatMap((mate) => {
				// where they are in the frame they're scrolling: a thumb in their colour on its right edge, like the
				// overlay scrollbar the frame shows them
				const scroll = mate.state.scroll;
				const frame = mate.state.inside == null ? undefined : byName.get(mate.state.inside);
				if (scroll == null || frame === undefined || mate.left !== null || scroll.height <= frame.h + 1) return [];
				if (scrolled.current.get(mate.person.accountId)?.at == null) return [];
				const top = toScreen(frame.x + frame.w, frame.y + (scroll.y / scroll.height) * frame.h);
				const length = (frame.h / scroll.height) * frame.h * cam.k;
				return [
					<span
						key={`${mate.person.accountId}:thumb:${scroll.y}`}
						data-presence-scroll={mate.person.accountId}
						className="absolute w-[5px] animate-presence-thumb rounded-full"
						style={{
							left: top.x - 8,
							top: top.y + 2,
							height: Math.max(16, length - 4),
							background: mate.person.color,
						}}
					/>,
				];
			})}
			{ripples.current.map((ripple) => {
				const at = toScreen(ripple.x, ripple.y);
				return (
					<span
						key={ripple.key}
						data-presence-click=""
						className="absolute top-0 left-0 size-[44px] animate-presence-click rounded-full border-[2.5px]"
						style={{
							left: at.x - 22,
							top: at.y - 22,
							borderColor: ripple.color,
							background: `${ripple.color}40`,
						}}
					/>
				);
			})}
			{here.map((mate) => (
				<Cursor
					key={mate.person.accountId}
					mate={mate}
					now={now}
					motion={motions.current.get(mate.person.accountId)}
					slot={slots.get(mate.person.accountId)}
					toScreen={toScreen}
				/>
			))}
		</div>
	);
}

function Cursor({
	mate,
	now,
	motion,
	slot,
	toScreen,
}: {
	mate: Teammate;
	now: number;
	motion: Motion | undefined;
	slot: { x: number; y: number } | undefined;
	toScreen: (x: number, y: number) => { x: number; y: number };
}) {
	const { person, state } = mate;
	const gone = mate.left !== null;
	const resting = idle(mate, now);
	// a pointer off the canvas isn't drawn; one never placed on this page has nowhere to be drawn
	const at =
		state.pointer === null || motion === undefined || motion.x === null || motion.y === null
			? null
			: toScreen(motion.x.p, motion.y.p);
	const dock = motion === undefined ? (slot === undefined ? 0 : 1) : Math.min(1, Math.max(0, motion.dock.p));
	const home = motion?.slot ?? slot ?? null;
	const docking = home !== null && dock > 0.01;
	const hand = at === null ? null : { x: at.x + 13, y: at.y + 17 };
	if (hand === null && !docking) return null;
	const lift = Math.sin(Math.PI * dock) * 14;
	const pill =
		hand === null
			? home
			: home === null || !docking
				? hand
				: { x: hand.x + (home.x - hand.x) * dock, y: hand.y + (home.y - hand.y) * dock - lift };
	const grabbing = state.pressed && state.dragging.length > 0;
	// out on the canvas the pill speaks and goes quiet; docked it stays, and dims when idle
	const said = slot !== undefined ? (resting ? 0.45 : 1) : !resting && speaking(mate, now) ? 1 : 0;
	const ink = gone ? 0 : resting ? IDLE_INK : 1;
	return (
		<div
			className="animate-presence-in"
			data-presence-cursor={person.accountId}
			data-presence-name={person.name}
			data-presence-idle={resting ? "" : undefined}
			data-presence-gone={gone ? "" : undefined}
		>
			{at !== null && (
				<div
					className="absolute top-0 left-0 transition-opacity duration-[400ms]"
					style={{ transform: `translate(${at.x - 1}px, ${at.y - 1}px)`, opacity: ink }}
				>
					<Arrow color={person.color} shown={!grabbing} pressed={state.pressed && state.inside !== null} />
					<GrabbingHand color={person.color} shown={grabbing} />
				</div>
			)}
			{pill !== null && (
				<span
					data-presence-pill={person.accountId}
					data-presence-docked={slot === undefined ? undefined : (state.inside ?? undefined)}
					data-presence-said={said > 0 ? "" : undefined}
					className="absolute top-0 left-0 flex items-center whitespace-nowrap rounded-full px-[7px] font-medium text-[11px] leading-none transition-[opacity,filter] duration-300"
					style={{
						height: PILL_H,
						transform: `translate(${pill.x}px, ${pill.y}px)`,
						background: person.color,
						color: "#0e0e0e",
						opacity: gone ? 0 : said,
						filter: slot !== undefined && resting ? "saturate(0.2)" : undefined,
					}}
				>
					{person.name}
				</span>
			)}
		</div>
	);
}

/** The pointer a person already owns, in their colour; its tip is the point they're at. */
function Arrow({ color, shown, pressed }: { color: string; shown: boolean; pressed: boolean }) {
	return (
		<svg
			viewBox="0 0 16 20"
			width="16"
			height="20"
			className="absolute top-0 left-0 origin-[1px_1px] overflow-visible transition-[opacity,transform] duration-150"
			style={{ opacity: shown ? 1 : 0, transform: `scale(${shown ? (pressed ? 0.82 : 1) : 0.75})` }}
			aria-hidden="true"
		>
			<path
				d="M1.2 1.2v14.6l3.9-3.7 2.7 6.1 2.6-1.1-2.7-6h5.5Z"
				fill={color}
				stroke="#0e0e0e"
				strokeWidth="1.15"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

/** The pointer closed into a grabbing hand while its person drags. */
function GrabbingHand({ color, shown }: { color: string; shown: boolean }) {
	return (
		<svg
			viewBox="0 0 20 20"
			width="26"
			height="26"
			data-presence-hand={shown ? "" : undefined}
			className="absolute top-[-9px] left-[-8px] overflow-visible transition-[opacity,transform] duration-150"
			style={{ opacity: shown ? 1 : 0, transform: `scale(${shown ? 1 : 0.7})` }}
			aria-hidden="true"
		>
			<path
				d="M5.6 9.2V8c0-.9.7-1.5 1.5-1.5s1.5.6 1.5 1.5v-.6c0-.9.7-1.5 1.5-1.5s1.5.6 1.5 1.5v.3c0-.8.7-1.4 1.5-1.4s1.4.6 1.4 1.4v.6c0-.7.6-1.2 1.3-1.2s1.3.5 1.3 1.3v4.3c0 2.9-2.1 5-4.9 5h-1.6c-1.6 0-3-.7-4-2L3.4 12c-.5-.6-.4-1.4.2-1.9.6-.4 1.4-.3 1.9.2Z"
				fill={color}
				stroke="#0e0e0e"
				strokeWidth="1.15"
				strokeLinejoin="round"
			/>
		</svg>
	);
}
