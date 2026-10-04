import {
	clamp,
	type FrameBox,
	pathAt,
	type Scene,
	type Seen,
	settle,
	spanAt,
	type Track,
	wasOver,
	wasPressed,
	wasStillFor,
} from "shared/ui/explore/cloud/cursors-motion/engine";
import { Arrow, arrivalAt, chipWidth, easedView } from "shared/ui/explore/cloud/cursors-motion/pointer";
import type { Ctx, Take } from "shared/ui/explore/cloud/cursors-motion/stage";

/**
 * Hush: a name is said while its owner moves and then it goes quiet.
 *
 * Everything is critically damped, so nothing ever overshoots or swings: the
 * hand glides in on the packets and stops dead where they stop. The tag comes
 * up the instant someone starts moving or presses, holds 1.4s after they stop,
 * and fades, leaving a bare pointer. The frame under someone's hand takes
 * their colour in its label instead, so where people are is said by the
 * thing they are on. Idle sinks the pointer to a third of its ink.
 */

const SPEAK_FOR = 1.4;

function speaking(track: Track, scene: Scene, x: number): number {
	const span = arrivalAt(track, scene, x);
	if (span.since < 1.8 || span.until < 1.1) return 1;
	if (wasPressed(track, scene, x)) return 1;
	return wasStillFor(track, scene, x) < SPEAK_FOR ? 1 : 0;
}

/** a neighbour within a tag's reach to the right: say the name on the left instead */
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

function HushCursor({ ctx, s }: { ctx: Ctx; s: Seen }) {
	const { scene, t } = ctx;
	const crit = { w: 16, z: 1 };
	const speak = clamp(settle((x) => speaking(s.track, scene, x), t, crit, 0.9));
	const idle = clamp(settle((x) => (wasStillFor(s.track, scene, x) >= scene.idleAfter ? 1 : 0), t, { w: 2.6, z: 1 }, 2.6));
	const press = settle((x) => (wasPressed(s.track, scene, x) ? 1 : 0), t, { w: 38, z: 1 }, 0.4);
	const flip = clamp(settle((x) => crowded(s.track, scene, x), t, { w: 11, z: 1 }, 1));
	const p = ctx.toScreen(s.pos);
	const w = chipWidth(s.person.name);
	const tagX = 13 + (-26 - w) * flip;
	return (
		<div className="absolute top-0 left-0" style={{ transform: `translate(${p.x - 1}px, ${p.y - 1}px)` }}>
			<Arrow
				color={s.person.color}
				style={{
					opacity: s.presence * (1 - 0.66 * idle),
					transform: `scale(${(1 - 0.13 * press) * (1 - 0.1 * idle) * (0.85 + 0.15 * s.presence)})`,
				}}
			/>
			<span
				className="absolute flex h-[18px] items-center whitespace-nowrap rounded-xs px-[6px] font-medium text-[11px] leading-none"
				style={{
					left: 0,
					top: 17,
					background: s.person.color,
					color: "#0e0e0e",
					opacity: speak * s.presence,
					transform: `translateX(${tagX + (1 - speak) * -5 * (1 - 2 * flip)}px)`,
				}}
			>
				{s.person.name}
			</span>
		</div>
	);
}

function hoverOf(ctx: Ctx, frame: FrameBox): { color: string; amount: number } | null {
	let best: { color: string; amount: number } | null = null;
	for (const s of ctx.seen) {
		const amount = clamp(
			settle((x) => (wasOver(s.track, ctx.scene, x)?.name === frame.name ? 1 : 0), ctx.t, { w: 12, z: 1 }, 0.8),
		);
		if (amount * s.presence > (best?.amount ?? 0.01)) best = { color: s.person.color, amount: amount * s.presence };
	}
	return best;
}

export const HUSH: Take = {
	feel: { cursor: { w: 15, z: 1 }, trail: { w: 8, z: 1 } },
	cursors: (ctx) => (
		<div className="pointer-events-none absolute inset-0 overflow-hidden">
			{ctx.seen.map((s) => (
				<HushCursor key={s.person.id} ctx={ctx} s={s} />
			))}
		</div>
	),
	label: hoverOf,
	camera: (scene, t) => easedView(scene, t, { w: 3.4, z: 1 }),
};
