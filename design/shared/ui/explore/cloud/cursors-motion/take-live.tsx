import type { CSSProperties } from "react";
import {
	clamp,
	type FrameBox,
	lerp,
	pathAt,
	type Scene,
	type Seen,
	settle,
	spanAt,
	type Track,
	wasIn,
	wasPressed,
	wasStillFor,
} from "shared/ui/explore/cloud/cursors-motion/engine";
import { Arrow, arrivalAt, chipWidth, easedView } from "shared/ui/explore/cloud/cursors-motion/pointer";
import type { Ctx, Take } from "shared/ui/explore/cloud/cursors-motion/stage";

/**
 * Live: hush on the canvas, dock only while someone is inside a frame live.
 *
 * Out on the canvas a person is hush's pointer and pill: the pill is said while
 * they move or press, holds 1.4s after they stop and fades, idle sinks the
 * pointer to a third of its ink, and leaving fades them out. When they enter a
 * frame live the pill lifts off the pointer and docks in that frame's label row,
 * where it stays for as long as they are inside, so the label says who is in
 * the live frame. Their pointer stays bare inside it. Stepping out flies the
 * pill home.
 *
 * Dragging changes the pointer rather than moving the name: `hand` closes it
 * into a grabbing hand, `move` turns it into four arrows, `grip` keeps the
 * arrow and hangs a small grip beside it.
 */

export type DragLook = "hand" | "move" | "grip";

const SPEAK_FOR = 1.4;

function speaking(track: Track, scene: Scene, x: number): number {
	const span = arrivalAt(track, scene, x);
	if (span.since < 1.8 || span.until < 1.1) return 1;
	if (wasPressed(track, scene, x)) return 1;
	return wasStillFor(track, scene, x) < SPEAK_FOR ? 1 : 0;
}

/** a neighbour within a pill's reach to the right: say the name on the left instead */
function crowded(track: Track, scene: Scene, x: number): number {
	const me = pathAt(track.keys, scene.length, x);
	for (const other of scene.tracks) {
		if (other === track || other.page !== undefined || spanAt(other, scene.length, x) === null) continue;
		const them = pathAt(other.keys, scene.length, x);
		const dx = them.x - me.x;
		if (dx > -10 && dx < chipWidth(track.person.name) + 30 && Math.abs(them.y - me.y) < 44) return 1;
	}
	return 0;
}

/** the frame a pill is docked to, or was until a moment ago while it flies home */
function dockedTo(track: Track, scene: Scene, t: number): string | null {
	for (let back = 0; back <= 1.4; back += 0.05) {
		const frame = wasIn(track, scene, t - back);
		if (frame !== null) return frame;
	}
	return null;
}

interface Person {
	readonly s: Seen;
	readonly speak: number;
	readonly idle: number;
	readonly press: number;
	readonly flip: number;
	readonly dock: number;
	readonly frame: string | null;
}

function people(ctx: Ctx): Person[] {
	const { scene, t } = ctx;
	return ctx.seen.map((s) => {
		const crit = { w: 16, z: 1 };
		const dock = settle((x) => (wasIn(s.track, scene, x) === null ? 0 : 1), t, { w: 10, z: 0.8 }, 1.3);
		return {
			s,
			speak: clamp(settle((x) => speaking(s.track, scene, x), t, crit, 0.9)),
			idle: clamp(settle((x) => (wasStillFor(s.track, scene, x) >= scene.idleAfter ? 1 : 0), t, { w: 2.6, z: 1 }, 2.6)),
			press: clamp(settle((x) => (wasPressed(s.track, scene, x) ? 1 : 0), t, { w: 30, z: 1 }, 0.4)),
			flip: clamp(settle((x) => crowded(s.track, scene, x), t, { w: 11, z: 1 }, 1)),
			dock,
			frame: dock > 0.01 ? dockedTo(s.track, scene, t) : null,
		};
	});
}

/** where each docked pill sits in its frame's label row: right to left, first in rightmost */
function slots(ctx: Ctx, all: readonly Person[]): Map<string, { x: number; y: number }> {
	const out = new Map<string, { x: number; y: number }>();
	for (const frame of ctx.frames) {
		const at = ctx.toScreen({ x: frame.x, y: frame.y });
		let right = at.x + frame.w * ctx.cam.z;
		for (const p of all) {
			if (p.frame !== frame.name) continue;
			const w = chipWidth(p.s.person.name);
			out.set(p.s.person.id, { x: right - w, y: at.y - 24 });
			right -= (w + 6) * clamp(p.dock);
		}
	}
	return out;
}

/* ---------- the drag pointers ---------- */

function Hand({ color, style }: { color: string; style?: CSSProperties }) {
	return (
		<svg viewBox="0 0 20 20" width="26" height="26" className="absolute top-[-9px] left-[-8px] overflow-visible" style={style} aria-hidden="true">
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

function Move({ color, style }: { color: string; style?: CSSProperties }) {
	return (
		<svg viewBox="0 0 20 20" width="20" height="20" className="absolute top-[-9px] left-[-9px] overflow-visible" style={style} aria-hidden="true">
			<path
				d="M10 1.5 13 4.6h-2v4.4h4.4V7l3.1 3-3.1 3v-2H11v4.4h2L10 18.5 7 15.4h2V11H4.6v2L1.5 10l3.1-3v2H9V4.6H7Z"
				fill={color}
				stroke="#0e0e0e"
				strokeWidth="1.1"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function Grip({ color, style }: { color: string; style?: CSSProperties }) {
	return (
		<span className="absolute top-[-3px] left-[15px] grid grid-cols-2 gap-[2px] rounded-[3px] p-[3px]" style={{ background: "#0e0e0e", ...style }}>
			{[0, 1, 2, 3, 4, 5].map((i) => (
				<span key={i} className="h-[3px] w-[3px] rounded-full" style={{ background: color }} />
			))}
		</span>
	);
}

/* ---------- one person ---------- */

function LiveCursor({ ctx, p, drag, slot }: { ctx: Ctx; p: Person; drag: DragLook; slot: { x: number; y: number } | undefined }) {
	const { s } = p;
	const at = ctx.toScreen(s.pos);
	const docked = slot === undefined ? 0 : p.dock;
	const u = clamp(docked);
	const ink = s.presence * (1 - 0.66 * p.idle);
	// the pointer swaps for the drag look while the button is held over a frame it moves
	const grab = drag === "grip" ? 0 : p.press;
	const w = chipWidth(s.person.name);
	const hand = { x: at.x + 13 + (-26 - w) * p.flip, y: at.y + 17 };
	const goal = slot ?? hand;
	const lift = Math.sin(Math.PI * u) * 14;
	const pill = { x: lerp(hand.x, goal.x, docked), y: lerp(hand.y, goal.y, docked) - lift };
	// out on the canvas the pill speaks and goes quiet; docked it stays, and dims when idle
	const say = lerp(p.speak, 1, u) * s.presence;
	return (
		<>
			<div className="absolute top-0 left-0" style={{ transform: `translate(${at.x - 1}px, ${at.y - 1}px)` }}>
				<Arrow color={s.person.color} style={{ opacity: ink * (1 - grab), transform: `scale(${(1 - 0.25 * grab) * (1 - 0.1 * p.idle)})` }} />
				{drag === "hand" ? <Hand color={s.person.color} style={{ opacity: ink * grab, transform: `scale(${0.7 + 0.3 * grab})` }} /> : null}
				{drag === "move" ? <Move color={s.person.color} style={{ opacity: ink * grab, transform: `scale(${0.6 + 0.4 * grab}) rotate(${(1 - grab) * -45}deg)` }} /> : null}
				{drag === "grip" ? <Grip color={s.person.color} style={{ opacity: ink * p.press, transform: `scale(${0.5 + 0.5 * p.press})` }} /> : null}
			</div>
			<span
				className="absolute top-0 left-0 flex h-[18px] items-center whitespace-nowrap rounded-full px-[7px] font-medium text-[11px] leading-none"
				style={{
					transform: `translate(${pill.x}px, ${pill.y}px)`,
					background: s.person.color,
					color: "#0e0e0e",
					opacity: say * (1 - 0.55 * p.idle * u),
					filter: p.idle * u > 0.01 ? `saturate(${1 - 0.8 * p.idle})` : undefined,
				}}
			>
				{s.person.name}
			</span>
		</>
	);
}

function LiveLayer({ ctx, drag }: { ctx: Ctx; drag: DragLook }) {
	const all = people(ctx);
	const at = slots(ctx, all);
	return (
		<div className="pointer-events-none absolute inset-0 overflow-hidden">
			{all.map((p) => (
				<LiveCursor key={p.s.person.id} ctx={ctx} p={p} drag={drag} slot={at.get(p.s.person.id)} />
			))}
		</div>
	);
}

/** a frame someone is inside live wears their colour in its name */
function insideLabel(ctx: Ctx, frame: FrameBox): { color: string; amount: number } | null {
	for (const s of ctx.seen) {
		const amount = clamp(settle((x) => (wasIn(s.track, ctx.scene, x) === frame.name ? 1 : 0), ctx.t, { w: 12, z: 1 }, 0.8));
		if (amount > 0.01) return { color: s.person.color, amount: amount * s.presence };
	}
	return null;
}

export function live(drag: DragLook): Take {
	return {
		feel: { cursor: { w: 15, z: 1 }, trail: { w: 8, z: 1 } },
		cursors: (ctx) => <LiveLayer ctx={ctx} drag={drag} />,
		label: insideLabel,
		camera: (scene, t) => easedView(scene, t, { w: 3.4, z: 1 }),
	};
}
