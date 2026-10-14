import { useRef } from "react";
import { pageName } from "../../page-path";
import type { Camera, ProjectedFrame } from "../api";
import { cn } from "../cn";
import { Kbd } from "../primitives/display";
import { type Box, clamp, shellRadiusOnScreen, toScreen } from "./camera";
import type { CameraStore } from "./camera-store";
import { nothingThat, type Overview, overviewNeighbours } from "./live-moves";
import { Follow } from "./overlays";
import type { SpatialDirection } from "./spatial-navigation";

/**
 * The ⌥ overview's furniture (DEV-295), in screen pixels over the frames: the
 * target in the accent ring, each frame one arrow away from it in a thin ring
 * wearing the key that reaches it on the edge that faces the target, and the
 * rest under a veil. A frame one arrow away but off screen at the overview's
 * zoom has no ring: its key is pinned to that edge of the view instead, with
 * its name. A press toward nothing leaves a stop mark on that side, and says so.
 * The names are the labels' own (frame-label.tsx).
 */

/**
 * The pointer while the overview is up: one transparent sheet over the whole
 * viewport, frames and prototypes included, so every hover and press is the
 * overview's and none reaches a frame's page. Hovering a frame makes it the
 * target; a click (a press that stays within `slop`) picks the frame under
 * it, or nothing; a drag does nothing. The wheel passes through to the
 * canvas, which zooms the overview's camera.
 */
export function OverviewCatcher({
	frameAt,
	slop,
	onPoint,
	onPick,
}: {
	/** the frame under a point on screen, in client pixels */
	frameAt: (clientX: number, clientY: number) => string | null;
	slop: number;
	onPoint: (name: string) => void;
	onPick: (name: string | null) => void;
}) {
	const press = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: a pointer sheet for the held ⌥, whose keyboard path is the arrows
		<div
			data-overview-catcher=""
			className="absolute inset-0"
			onPointerDown={(event) => {
				event.stopPropagation();
				if (event.button !== 0) return;
				press.current = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
				event.currentTarget.setPointerCapture?.(event.pointerId);
			}}
			// the focus stays in the frame that is live, whose shim hears ⌥ come up
			onMouseDown={(event) => {
				event.stopPropagation();
				event.preventDefault();
			}}
			onPointerMove={(event) => {
				event.stopPropagation();
				const held = press.current;
				if (
					held !== null &&
					held.id === event.pointerId &&
					Math.hypot(event.clientX - held.x, event.clientY - held.y) >= slop
				)
					held.moved = true;
				const name = frameAt(event.clientX, event.clientY);
				if (name !== null) onPoint(name);
			}}
			onPointerUp={(event) => {
				event.stopPropagation();
				const held = press.current;
				press.current = null;
				if (held === null || held.id !== event.pointerId || held.moved) return;
				onPick(frameAt(event.clientX, event.clientY));
			}}
			onPointerCancel={(event) => {
				event.stopPropagation();
				press.current = null;
			}}
			onDoubleClick={(event) => event.stopPropagation()}
			onContextMenu={(event) => {
				event.stopPropagation();
				event.preventDefault();
			}}
		/>
	);
}

const ARROW: Record<SpatialDirection, string> = { left: "←", right: "→", up: "↑", down: "↓" };

export function OverviewLayer({
	camera,
	frames,
	overview,
	view,
}: {
	camera: CameraStore;
	frames: readonly ProjectedFrame[];
	overview: Overview;
	/** the viewport's size in screen pixels, for what lies past its edges */
	view: () => { w: number; h: number } | null;
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
			{[...near.values()].map(({ frame, direction }) => (
				<Follow
					key={`near-${frame.name}`}
					camera={camera}
					screen={(at) => ({ ...frameBox(at, frame, 2), away: offScreen(at, frame, direction, view()) })}
					data-overview-near={frame.name}
					className="absolute border border-line-strong data-away:hidden"
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
					screen={(at) => ({
						...edgeFacing(toScreen(frame, at), direction),
						away: offScreen(at, frame, direction, view()),
					})}
					className="absolute h-0 w-0 data-away:hidden"
				>
					<Kbd className="absolute -translate-x-1/2 -translate-y-1/2 animate-menu-in bg-surface-window text-primary">
						{`⌥${ARROW[direction]}`}
					</Kbd>
				</Follow>
			))}
			{[...near.values()].map(({ frame, direction }) => (
				<Follow
					key={`edge-${frame.name}`}
					camera={camera}
					screen={(at) => {
						const size = view();
						if (size === null) return { away: true };
						return {
							...pinnedToward(toScreen(frame, at), direction, size),
							away: !offScreen(at, frame, direction, size),
						};
					}}
					data-overview-edge={frame.name}
					className="absolute h-0 w-0 data-away:hidden"
				>
					<EdgeTag direction={direction} name={frame.name} />
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

/**
 * Whether a frame one arrow away is past the view's edge, its key with it:
 * the point it wears its key at, on its edge facing the target, is off screen.
 */
function offScreen(
	at: Camera,
	frame: Box,
	direction: SpatialDirection,
	size: { w: number; h: number } | null,
): boolean {
	if (size === null) return false;
	const { left, top } = edgeFacing(toScreen(frame, at), direction);
	return left < 0 || top < 0 || left > size.w || top > size.h;
}

/** How far in from the view's edge a pinned tag stands, in screen pixels. */
const EDGE_INSET = 12;
/** How far a pinned tag's middle keeps from a corner, along its edge: half its widest, so it never runs off. */
const EDGE_ALONG = { across: 112, down: 24 } as const;

/**
 * Where a far frame's tag pins: on the view's edge the arrow points to, slid
 * along it toward where the frame lies, short of the corners.
 */
function pinnedToward(rect: Box, direction: SpatialDirection, size: { w: number; h: number }) {
	const cx = clamp(rect.x + rect.w / 2, EDGE_ALONG.across, size.w - EDGE_ALONG.across);
	const cy = clamp(rect.y + rect.h / 2, EDGE_ALONG.down, size.h - EDGE_ALONG.down);
	switch (direction) {
		case "right":
			return { left: size.w - EDGE_INSET, top: cy };
		case "left":
			return { left: EDGE_INSET, top: cy };
		case "down":
			return { left: cx, top: size.h - EDGE_INSET };
		case "up":
			return { left: cx, top: EDGE_INSET };
	}
}

/** A far frame's key, pinned to the view's edge: the arrow that reaches it, and its name. */
function EdgeTag({ direction, name }: { direction: SpatialDirection; name: string }) {
	return (
		<div
			className={cn(
				"absolute flex max-w-56 animate-menu-in items-center gap-1.5 whitespace-nowrap rounded-sm bg-surface-window py-0.5 text-secondary shadow-float type-detail",
				direction === "right" ? "pr-0.5 pl-2" : "pr-2 pl-0.5",
				direction === "right" && "right-0 -translate-y-1/2 flex-row-reverse",
				direction === "left" && "left-0 -translate-y-1/2",
				direction === "down" && "bottom-0 -translate-x-1/2",
				direction === "up" && "top-0 -translate-x-1/2",
			)}
		>
			<Kbd className="bg-surface-window text-primary">{`⌥${ARROW[direction]}`}</Kbd>
			<span className="min-w-0 truncate">{pageName(name)}</span>
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
