import {
	clamp,
	type FrameBox,
	lerp,
	type Scene,
	type Seen,
	settle,
	type Track,
	wasOver,
	wasPressed,
	wasStillFor,
} from "shared/ui/explore/cloud/cursors-motion/engine";
import { Arrow, chipWidth, framing } from "shared/ui/explore/cloud/cursors-motion/pointer";
import { type Cam, type Ctx, FOLLOWED, HOME_CAM, type Take } from "shared/ui/explore/cloud/cursors-motion/stage";

/**
 * Dock: a name lands on the thing its owner is working on.
 *
 * Over empty canvas a person is a pointer and a tag. Rest on a frame for half
 * a second, or grab it, and the tag lifts off the pointer and flies into the
 * frame's label row, where it sits beside the frame's name; the pointer
 * shrinks to a dot and, if they stay still, fades out altogether. Move off
 * the frame and the name flies back to the hand. A frame being dragged
 * carries its dragger's name with it, and two people on one frame line up in
 * its label instead of piling on each other.
 */

const DWELL = [0.2, 0.45] as const;

function docked(track: Track, scene: Scene, x: number): FrameBox | null {
	const over = wasOver(track, scene, x);
	if (over === null) return null;
	if (wasPressed(track, scene, x)) return over;
	for (const back of DWELL) if (wasOver(track, scene, x - back)?.name !== over.name) return null;
	return over;
}

/** the frame a name is docked to, or was until a moment ago while it flies home */
function dockedTo(track: Track, scene: Scene, t: number): string | null {
	for (let back = 0; back <= 1.4; back += 0.05) {
		const frame = docked(track, scene, t - back);
		if (frame !== null) return frame.name;
	}
	return null;
}

interface Docking {
	readonly s: Seen;
	readonly amount: number;
	readonly frame: string | null;
	readonly idle: number;
	readonly fade: number;
}

function dockings(ctx: Ctx): Docking[] {
	return ctx.seen.map((s) => {
		const { scene, t } = ctx;
		const amount = settle((x) => (docked(s.track, scene, x) === null ? 0 : 1), t, { w: 10, z: 0.78 }, 1.3);
		const idle = clamp(settle((x) => (wasStillFor(s.track, scene, x) >= scene.idleAfter ? 1 : 0), t, { w: 2.6, z: 1 }, 2.6));
		const fade = clamp(settle((x) => (wasStillFor(s.track, scene, x) >= 2.2 ? 1 : 0), t, { w: 3.2, z: 1 }, 2));
		return { s, amount, frame: amount > 0.01 ? dockedTo(s.track, scene, t) : null, idle, fade };
	});
}

/** where each docked name sits in its frame's label row: right to left, first come rightmost */
function slots(ctx: Ctx, all: readonly Docking[]): Map<string, { x: number; y: number }> {
	const out = new Map<string, { x: number; y: number }>();
	for (const frame of ctx.frames) {
		const at = ctx.toScreen({ x: frame.x, y: frame.y });
		let right = at.x + frame.w * ctx.cam.z;
		for (const d of all) {
			if (d.frame !== frame.name) continue;
			const w = chipWidth(d.s.person.name) + 4;
			out.set(d.s.person.id, { x: right - w, y: at.y - 23 });
			right -= (w + 8) * clamp(d.amount);
		}
	}
	return out;
}

function DockCursor({ ctx, d, slot }: { ctx: Ctx; d: Docking; slot: { x: number; y: number } | undefined }) {
	const { s } = d;
	const p = ctx.toScreen(s.pos);
	const amount = slot === undefined ? 0 : d.amount;
	const u = clamp(amount);
	const hand = { x: p.x + 12, y: p.y + 16 };
	const goal = slot ?? hand;
	const lift = Math.sin(Math.PI * u) * 16;
	const tag = { x: lerp(hand.x, goal.x, amount), y: lerp(hand.y, goal.y, amount) - lift + (1 - s.presence) * -6 };
	const w = chipWidth(s.person.name) + 4 * u;
	return (
		<>
			<div className="absolute top-0 left-0" style={{ transform: `translate(${p.x - 1}px, ${p.y - 1}px)` }}>
				<Arrow
					color={s.person.color}
					style={{
						opacity: s.presence * (1 - u) * (1 - 0.6 * d.idle),
						transform: `scale(${1 - 0.5 * u})`,
					}}
				/>
				<span
					className="absolute top-[-2px] left-[-2px] h-[7px] w-[7px] rounded-full"
					style={{
						background: s.person.color,
						boxShadow: "0 0 0 1px #0e0e0e",
						opacity: s.presence * u * (1 - d.fade),
						transform: `scale(${0.4 + 0.6 * u})`,
					}}
				/>
			</div>
			<span
				className="absolute top-0 left-0 h-[18px] rounded-xs"
				style={{ width: w, transform: `translate(${tag.x}px, ${tag.y}px)`, opacity: s.presence }}
			>
				<span className="absolute inset-0 rounded-xs" style={{ background: s.person.color, opacity: 1 - u }} />
				<span
					className="absolute top-[5.5px] left-0 h-[7px] w-[7px] rounded-full border"
					style={{
						borderColor: s.person.color,
						background: d.idle > 0.5 ? "transparent" : s.person.color,
						opacity: u,
					}}
				/>
				<span
					className="absolute top-0 flex h-[18px] items-center whitespace-nowrap font-medium text-[11px] leading-none"
					style={{ left: lerp(6, 12, u) }}
				>
					<span style={{ color: "#0e0e0e", opacity: 1 - u }}>{s.person.name}</span>
					<span className="absolute left-0" style={{ color: s.person.color, opacity: u * (1 - d.idle) }}>
						{s.person.name}
					</span>
					<span className="absolute left-0 text-muted" style={{ opacity: u * d.idle }}>
						{s.person.name}
					</span>
				</span>
			</span>
		</>
	);
}

function DockLayer({ ctx }: { ctx: Ctx }) {
	const all = dockings(ctx);
	const at = slots(ctx, all);
	return (
		<div className="pointer-events-none absolute inset-0 overflow-hidden">
			{all.map((d) => (
				<DockCursor key={d.s.person.id} ctx={ctx} d={d} slot={at.get(d.s.person.id)} />
			))}
		</div>
	);
}

function dockedLabel(ctx: Ctx, frame: FrameBox): { color: string; amount: number } | null {
	for (const s of ctx.seen) {
		if (docked(s.track, ctx.scene, ctx.t)?.name !== frame.name) continue;
		const amount = clamp(settle((x) => (docked(s.track, ctx.scene, x)?.name === frame.name ? 1 : 0), ctx.t, { w: 12, z: 1 }, 0.8));
		return { color: s.person.color, amount: amount * s.presence * 0.9 };
	}
	return null;
}

/** following someone here follows what they are on: the camera frames the frame they docked to */
function attention(scene: Scene, t: number): Cam {
	const track = scene.tracks.find((candidate) => candidate.person.id === FOLLOWED);
	if (track === undefined) return HOME_CAM;
	const target = (x: number) => {
		const frame = docked(track, scene, x);
		return frame === null ? HOME_CAM : framing(frame, 1.34);
	};
	const s = { w: 3.6, z: 1 };
	return {
		x: settle((x) => target(x).x, t, s, 2.2),
		y: settle((x) => target(x).y, t, s, 2.2),
		z: settle((x) => target(x).z, t, s, 2.2),
	};
}

export const DOCK: Take = {
	feel: { cursor: { w: 15, z: 1 }, trail: { w: 9, z: 0.8 } },
	cursors: (ctx) => <DockLayer ctx={ctx} />,
	label: dockedLabel,
	camera: attention,
};
