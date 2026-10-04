import {
	clamp,
	lerp,
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
 * Reel: the name hangs off the pointer on a short thread.
 *
 * The pointer is tight to the hand; the tag rides a softer spring one stage
 * behind it, so it trails a little in a fast move and swings once into place
 * when the hand stops. Past a few pixels of lag the thread between them shows,
 * sagging slightly, and it vanishes again at rest. A press draws it taut and
 * the tag snaps in close. Arriving, the name unspools out of the pointer;
 * going idle or leaving, it winds back to an initial.
 */

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

function wound(track: Track, scene: Scene, x: number): number {
	const span = arrivalAt(track, scene, x);
	if (span.since < 0.3 || span.until < 0.55) return 1;
	return wasStillFor(track, scene, x) >= scene.idleAfter ? 1 : 0;
}

function ReelCursor({ ctx, s }: { ctx: Ctx; s: Seen }) {
	const { scene, t } = ctx;
	const taut = clamp(settle((x) => (wasPressed(s.track, scene, x) ? 1 : 0), t, { w: 26, z: 0.9 }, 0.5));
	const wind = clamp(settle((x) => wound(s.track, scene, x), t, { w: 8.5, z: 0.9 }, 1.4));
	const over = clamp(settle((x) => (wasOver(s.track, scene, x) === null ? 0 : 1), t, { w: 14, z: 1 }, 0.7));
	const flip = settle((x) => crowded(s.track, scene, x), t, { w: 7, z: 0.72 }, 1.4);
	const idle = clamp(settle((x) => (wasStillFor(s.track, scene, x) >= scene.idleAfter ? 1 : 0), t, { w: 2.6, z: 1 }, 2.6));

	const p = ctx.toScreen(s.pos);
	const z = ctx.cam.z;
	// soft-clamped, so a fast flick trails by a tag's height and never by a stretch of canvas
	const raw = { x: (s.trail.x - s.pos.x) * z, y: (s.trail.y - s.pos.y) * z };
	const give = (1 - 0.85 * taut) / (1 + Math.hypot(raw.x, raw.y) / 34);
	const lag = { x: raw.x * give, y: raw.y * give };
	const full = chipWidth(s.person.name);
	const width = lerp(full, 19, wind);
	const rest = { x: lerp(12, -12 - width, flip), y: lerp(19, 14, taut) };
	const tag = { x: rest.x + lag.x, y: rest.y + lag.y };

	// the thread: from the pointer's heel to the tag's near edge, sagging with its own length
	const from = { x: 4, y: 12 };
	const to = { x: tag.x + (flip > 0.5 ? width : 0), y: tag.y + 9 };
	const span = Math.hypot(to.x - from.x, to.y - from.y);
	const reach = Math.hypot(lag.x, lag.y);
	const shown = clamp((reach - 5) / 16) * s.presence;
	const sag = Math.min(10, span * 0.12);
	const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 + sag };

	return (
		<div className="absolute top-0 left-0" style={{ transform: `translate(${p.x - 1}px, ${p.y - 1}px)` }}>
			{shown > 0.01 ? (
				<svg className="absolute top-0 left-0 overflow-visible" width="1" height="1" aria-hidden="true">
					<path
						d={`M${from.x} ${from.y} Q${mid.x} ${mid.y} ${to.x} ${to.y}`}
						fill="none"
						stroke={s.person.color}
						strokeWidth="1"
						strokeLinecap="round"
						opacity={shown * 0.75}
					/>
				</svg>
			) : null}
			<Arrow
				color={s.person.color}
				style={{
					opacity: s.presence * (1 - 0.55 * idle),
					transform: `scale(${(1 - 0.1 * taut) * (0.8 + 0.2 * s.presence)})`,
				}}
			/>
			<span
				className="absolute top-0 left-0 h-[18px] overflow-hidden rounded-xs"
				style={{
					width,
					transform: `translate(${tag.x}px, ${tag.y}px)`,
					opacity: s.presence * (1 - 0.35 * idle),
				}}
			>
				{/* on the canvas the tag is a ring and its name; over a frame it fills, so it reads on white */}
				<span
					className="absolute inset-0 rounded-xs border bg-bg/85"
					style={{ borderColor: s.person.color, opacity: 1 - over }}
				/>
				<span className="absolute inset-0 rounded-xs" style={{ background: s.person.color, opacity: over }} />
				{[
					{ color: s.person.color, opacity: 1 - over },
					{ color: "#0e0e0e", opacity: over },
				].map((ink) => (
					<span
						key={ink.color}
						className="absolute top-0 left-0 flex h-[18px] items-center whitespace-nowrap pl-[6px] font-medium text-[11px] leading-none"
						style={ink}
					>
						<span>{s.person.name.charAt(0)}</span>
						<span style={{ opacity: 1 - wind }}>{s.person.name.slice(1)}</span>
					</span>
				))}
			</span>
		</div>
	);
}

export const REEL: Take = {
	feel: { cursor: { w: 22, z: 1 }, trail: { w: 6.5, z: 0.6 } },
	cursors: (ctx) => (
		<div className="pointer-events-none absolute inset-0 overflow-hidden">
			{ctx.seen.map((s) => (
				<ReelCursor key={s.person.id} ctx={ctx} s={s} />
			))}
		</div>
	),
	camera: (scene, t) => easedView(scene, t, { w: 4.2, z: 0.74 }),
	wind: true,
};
