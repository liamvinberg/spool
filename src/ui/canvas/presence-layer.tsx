import { type CSSProperties, useEffect, useReducer, useRef } from "react";
import type { Box } from "./camera";
import type { CameraStore } from "./camera-store";
import {
	CLICK_MS,
	followGesture,
	gestureMoving,
	idle,
	nextChange,
	type PointerGesture,
	type PresenceRoom,
	pointerShape,
	type ScrollWay,
	speaking,
	springStep,
	type Teammate,
	TRAIL_MS,
} from "./presence";

/**
 * Teammates on this page of a team canvas (DEV-196): each one's pointer in their colour with their name in a
 * pill, the pill docked on a frame's name while they're inside it live, a grabbing hand while they drag, and
 * the frames they're moving outlined in their colour. Inside a live frame their pointer goes on moving, and
 * shows what they do there, since nothing in the frame itself is shared: a click squashes it and bursts from
 * its tip, a drag closes it into a hand with a line fading behind, and a scroll turns it into a mouse with
 * chevrons the way it went.
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
	// what each person's pointer is doing inside their frame: clicks, a drag, a scroll
	const gestures = useRef(new Map<string, PointerGesture>());

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
			const now = Date.now();
			for (const gesture of gestures.current.values()) moving ||= gestureMoving(gesture, now);
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
		// what their pointer is doing inside the frame, followed on every render while it moves
		const drawn =
			motion === undefined || motion.x === null || motion.y === null ? null : { x: motion.x.p, y: motion.y.p };
		gestures.current.set(id, followGesture(gestures.current.get(id), mate.state, drawn, now));
	}
	for (const id of [...gestures.current.keys()])
		if (!here.some((mate) => mate.person.accountId === id)) gestures.current.delete(id);

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
			{here.map((mate) => {
				const gesture = gestures.current.get(mate.person.accountId);
				if (gesture === undefined || gesture.trail.length < 2 || mate.left !== null) return null;
				return (
					<DragTrail
						key={`trail:${mate.person.accountId}`}
						accountId={mate.person.accountId}
						trail={gesture.trail}
						color={mate.person.color}
						now={now}
						toScreen={toScreen}
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
					gesture={gestures.current.get(mate.person.accountId)}
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
	gesture,
}: {
	gesture: PointerGesture | undefined;
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
	const shape = grabbing ? "hand" : gesture === undefined ? "arrow" : pointerShape(gesture, now);
	const click = gesture?.click != null && now - gesture.click.at < CLICK_MS ? gesture.click : null;
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
					{/* a click squashes the arrow from its tip; each one is its own element, so each one plays */}
					<span
						key={click === null ? "still" : `click${click.n}`}
						className={`absolute top-0 left-0 origin-[1px_1px] ${click === null ? "" : "animate-presence-squash"}`}
					>
						<Arrow
							color={person.color}
							shown={shape === "arrow" || shape === "pressed"}
							pressed={shape === "pressed"}
						/>
					</span>
					<GrabbingHand color={person.color} shown={shape === "hand"} />
					<ScrollingMouse color={person.color} way={shape === "scroll" ? (gesture?.scroll?.way ?? null) : null} />
					{click !== null && <ClickBurst key={click.n} color={person.color} />}
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

/** A short burst of strokes out of the pointer's tip: a click landing. */
function ClickBurst({ color }: { color: string }) {
	return (
		<span data-presence-click="" className="absolute top-0 left-0">
			{[195, 240, 285, 330, 15].map((angle) => (
				<span key={angle} className="absolute top-0 left-0" style={{ transform: `rotate(${angle}deg)` }}>
					<span
						className="absolute block h-[3.5px] w-[10px] animate-presence-burst rounded-full"
						style={{ top: -1.75, background: color, boxShadow: "0 0 0 1px #0e0e0e" }}
					/>
				</span>
			))}
		</span>
	);
}

/** A chevron pointing down, and how far to turn it to point each way. */
const CHEVRON = "M1.5 1.5 6 6l4.5-4.5";
const TURN: Record<ScrollWay, number> = { down: 0, up: 180, right: -90, left: 90 };

/** The pointer turned into a mouse with its wheel rolling, and chevrons flowing the way they scroll. */
function ScrollingMouse({ color, way }: { color: string; way: ScrollWay | null }) {
	// the last way stays drawn while the mouse fades, so it doesn't flip on its way out
	const last = useRef<ScrollWay>("down");
	if (way !== null) last.current = way;
	const shown = way !== null;
	const turn = TURN[last.current];
	return (
		<span
			data-presence-scroll={shown ? last.current : undefined}
			className="absolute top-0 left-0 transition-[opacity,transform] duration-150"
			style={{ opacity: shown ? 1 : 0, transform: `scale(${shown ? 1 : 0.6})` }}
		>
			<svg viewBox="0 0 14 20" width="14" height="20" className="absolute top-[-2px] left-[-2px]" aria-hidden="true">
				<rect x="1" y="1" width="12" height="18" rx="6" fill={color} stroke="#0e0e0e" strokeWidth="1.15" />
				<rect
					x="6"
					y="4"
					width="2"
					height="5"
					rx="1"
					fill="#0e0e0e"
					className="animate-presence-wheel"
					style={{ "--way": last.current === "up" || last.current === "left" ? -1 : 1 } as CSSProperties}
				/>
			</svg>
			<span
				className="absolute top-[2px] left-[16px] size-[14px]"
				style={{ transform: `rotate(${turn}deg)`, transformOrigin: "7px 7px" }}
			>
				{[0, 1].map((i) => (
					<svg
						key={i}
						viewBox="-1 -1 14 10"
						width="14"
						height="10"
						className="absolute left-0 animate-presence-chevron opacity-0"
						style={{ top: i * 6 - 2, animationDelay: `${i * 140}ms` }}
						aria-hidden="true"
					>
						<path
							d={CHEVRON}
							fill="none"
							stroke="#0e0e0e"
							strokeWidth="4.4"
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
						<path
							d={CHEVRON}
							fill="none"
							stroke={color}
							strokeWidth="2.2"
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
					</svg>
				))}
			</span>
		</span>
	);
}

/** The line a drag leaves behind the pointer, fading as it ages. */
function DragTrail({
	accountId,
	trail,
	color,
	now,
	toScreen,
}: {
	accountId: string;
	trail: readonly { x: number; y: number; at: number }[];
	color: string;
	now: number;
	toScreen: (x: number, y: number) => { x: number; y: number };
}) {
	const points = trail.map((point) => ({ ...toScreen(point.x, point.y), at: point.at }));
	return (
		<svg data-presence-trail={accountId} className="absolute inset-0 size-full overflow-visible" aria-hidden="true">
			{points.slice(1).map((point, i) => {
				const from = points[i] as { x: number; y: number };
				return (
					<line
						key={point.at}
						x1={from.x}
						y1={from.y}
						x2={point.x}
						y2={point.y}
						stroke={color}
						strokeWidth={3}
						strokeLinecap="round"
						opacity={0.9 * Math.max(0, 1 - (now - point.at) / TRAIL_MS)}
					/>
				);
			})}
		</svg>
	);
}
