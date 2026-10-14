import type { ProjectedFrame } from "../api";
import { cn } from "../cn";
import { Kbd } from "../primitives/display";
import { type Box, shellRadiusOnScreen, toScreen } from "./camera";
import type { CameraStore } from "./camera-store";
import { nothingThat, type Overview, overviewNeighbours } from "./live-moves";
import { Follow } from "./overlays";
import type { SpatialDirection } from "./spatial-navigation";

/**
 * The ⌥ overview's furniture (DEV-295), in screen pixels over the frames: the
 * target in the accent ring, each frame one arrow away from it in a thin ring
 * wearing the key that reaches it on the edge that faces the target, and the
 * rest under a veil. A press toward nothing leaves a stop mark on that side,
 * and says so.
 * The names are the labels' own (frame-label.tsx).
 */

const ARROW: Record<SpatialDirection, string> = { left: "←", right: "→", up: "↑", down: "↓" };

export function OverviewLayer({
	camera,
	frames,
	overview,
}: {
	camera: CameraStore;
	frames: readonly ProjectedFrame[];
	overview: Overview;
}) {
	const target = frames.find((frame) => frame.name === overview.target);
	if (target === undefined) return null;
	const around = overviewNeighbours(target, frames);
	const near = new Map<string, { frame: ProjectedFrame; direction: SpatialDirection }>();
	for (const direction of ["left", "right", "up", "down"] as const) {
		const frame = around[direction];
		if (frame !== undefined && !near.has(frame.name)) near.set(frame.name, { frame, direction });
	}
	const bump = overview.bump !== null && overview.bump.at === target.name ? overview.bump : null;

	return (
		<div data-overview={overview.target} className="pointer-events-none absolute inset-0">
			{frames.map((frame) =>
				frame.name === target.name || near.has(frame.name) ? null : (
					<Follow
						key={`veil-${frame.name}`}
						camera={camera}
						screen={(at) => frameBox(at, frame, 0)}
						data-overview-dim={frame.name}
						className="absolute bg-surface-canvas/60"
					/>
				),
			)}
			{[...near.values()].map(({ frame }) => (
				<Follow
					key={`near-${frame.name}`}
					camera={camera}
					screen={(at) => frameBox(at, frame, 2)}
					data-overview-near={frame.name}
					className="absolute border border-line-strong"
				/>
			))}
			<Follow
				camera={camera}
				screen={(at) => frameBox(at, target, 3)}
				data-overview-target={target.name}
				className="absolute border-2 border-accent"
			/>
			{[...near.values()].map(({ frame, direction }) => (
				<Follow
					key={`key-${frame.name}`}
					camera={camera}
					screen={(at) => edgeFacing(toScreen(frame, at), direction)}
					className="absolute h-0 w-0"
				>
					<Kbd className="absolute -translate-x-1/2 -translate-y-1/2 animate-menu-in bg-surface-window text-primary">
						{`⌥${ARROW[direction]}`}
					</Kbd>
				</Follow>
			))}
			{bump !== null && (
				<Follow
					key={`stop-${bump.n}`}
					camera={camera}
					screen={(at) => edgeFacing(toScreen(target, at), opposite(bump.direction))}
					className="absolute h-0 w-0"
				>
					<Stop direction={bump.direction} />
				</Follow>
			)}
		</div>
	);
}

function opposite(direction: SpatialDirection): SpatialDirection {
	return direction === "left" ? "right" : direction === "right" ? "left" : direction === "up" ? "down" : "up";
}

/** A frame's box on screen, grown by `inset` pixels, its corner the shell's. */
function frameBox(at: { x: number; y: number; k: number }, frame: Box, inset: number) {
	const rect = toScreen(frame, at);
	return {
		left: rect.x - inset,
		top: rect.y - inset,
		width: rect.w + inset * 2,
		height: rect.h + inset * 2,
		borderRadius: shellRadiusOnScreen(at.k) + inset,
	};
}

/**
 * The middle of the edge of `rect` that faces back the way `toward` points:
 * the frame reached by → wears its key on its left edge, facing the target.
 */
function edgeFacing(rect: Box, toward: SpatialDirection) {
	switch (toward) {
		case "right":
			return { left: rect.x, top: rect.y + rect.h / 2 };
		case "left":
			return { left: rect.x + rect.w, top: rect.y + rect.h / 2 };
		case "down":
			return { left: rect.x + rect.w / 2, top: rect.y };
		case "up":
			return { left: rect.x + rect.w / 2, top: rect.y + rect.h };
	}
}

/** Nothing that way: a stop bar just past the target's edge, and the words, fading. */
function Stop({ direction }: { direction: SpatialDirection }) {
	const across = direction === "left" || direction === "right";
	return (
		<div
			data-overview-stop={direction}
			className={cn(
				"absolute flex animate-overview-stop items-center gap-2 whitespace-nowrap text-secondary type-detail",
				direction === "right" && "left-3 -translate-y-1/2",
				direction === "left" && "right-3 -translate-y-1/2 flex-row-reverse",
				direction === "down" && "top-3 -translate-x-1/2 flex-col",
				direction === "up" && "bottom-10 -translate-x-1/2 flex-col-reverse",
			)}
		>
			<span className={cn("rounded-full bg-accent", across ? "h-10 w-0.5" : "h-0.5 w-10")} />
			{nothingThat(direction)}
		</div>
	);
}
