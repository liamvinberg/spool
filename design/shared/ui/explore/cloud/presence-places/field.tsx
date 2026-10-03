import { memo, type ReactNode } from "react";
import { cn } from "shared/lib/utils";
import { CoffeeScreen } from "shared/ui/demo/coffee-screens";
import {
	agentsAt,
	lastWrite,
	PLATE_LIFE,
	platesAt,
	type Posture,
	type Scenario,
	type Write,
} from "shared/ui/explore/cloud/presence-places/scenarios";
import {
	blockBox,
	type Box,
	clamp01,
	easeOut,
	FRAMES,
	type FrameName,
	frameOf,
	lerp,
	MEMBERS,
	VH,
	VW,
	type Who,
} from "shared/ui/explore/cloud/presence-places/world";

/**
 * The canvas under every take: the camera, the frames, and the agent hand as it
 * ships, with one change. A teammate's hand is drawn in its owner's colour, and
 * yours keeps the neutral ink it has today.
 */

export interface Camera {
	x: number;
	y: number;
	k: number;
}

export function toScreen(cam: Camera, x: number, y: number): { x: number; y: number } {
	return { x: (x - cam.x) * cam.k + VW / 2, y: (y - cam.y) * cam.k + VH / 2 };
}

export function onScreenBox(cam: Camera, box: Box): Box {
	const a = toScreen(cam, box.x, box.y);
	return { x: a.x, y: a.y, w: box.w * cam.k, h: box.h * cam.k };
}

export function visible(rect: Box, margin = 0): boolean {
	return rect.x + rect.w > margin && rect.x < VW - margin && rect.y + rect.h > margin && rect.y < VH - margin;
}

/** where the ray from the middle of the view toward a point leaves an inset box */
export function edgePoint(px: number, py: number, inset: { x: number; y: number }): { x: number; y: number; side: "top" | "right" | "bottom" | "left" } {
	const cx = VW / 2;
	const cy = VH / 2;
	const dx = px - cx;
	const dy = py - cy;
	const hx = VW / 2 - inset.x;
	const hy = VH / 2 - inset.y;
	const sx = dx === 0 ? Number.POSITIVE_INFINITY : hx / Math.abs(dx);
	const sy = dy === 0 ? Number.POSITIVE_INFINITY : hy / Math.abs(dy);
	const s = Math.min(sx, sy);
	const side = sx < sy ? (dx > 0 ? "right" : "left") : dy > 0 ? "bottom" : "top";
	return { x: cx + dx * s, y: cy + dy * s, side };
}

/** a member's ink on the dark canvas */
export function ink(who: Who): string {
	return MEMBERS[who].color;
}

/** a member's ink on a frame's white paper, where your own white would vanish */
function paperInk(who: Who): string {
	return who === "you" ? "#17171A" : MEMBERS[who].color;
}

/* ---------- the frames ---------- */

const FrameBody = memo(function FrameBody({ name }: { name: FrameName }) {
	const frame = frameOf(name);
	return (
		<div className="absolute" style={{ left: frame.x, top: frame.y, width: frame.w, height: frame.h }}>
			<CoffeeScreen screen={frame.screen} scale="full" className="h-full w-full" />
		</div>
	);
});

/** every frame on the page, under one transform, so only the camera moves per tick */
export function World({ cam, dim }: { cam: Camera; dim?: ((name: FrameName) => number) | undefined }) {
	return (
		<div
			className="absolute top-0 left-0 origin-top-left"
			style={{ transform: `translate(${VW / 2 - cam.x * cam.k}px, ${VH / 2 - cam.y * cam.k}px) scale(${cam.k})` }}
		>
			{FRAMES.map((frame) => (
				<div key={frame.name} style={{ opacity: dim === undefined ? 1 : dim(frame.name) }} className="transition-opacity duration-300">
					<FrameBody name={frame.name} />
				</div>
			))}
		</div>
	);
}

/* ---------- marks ---------- */

/** a person: a disc in their colour with their initial */
export function PersonDot({ who, size = 14, ring = false, className }: { who: Who; size?: number; ring?: boolean; className?: string | undefined }) {
	const member = MEMBERS[who];
	return (
		<span
			aria-label={member.name}
			className={cn("flex shrink-0 items-center justify-center rounded-full font-sans font-semibold", className)}
			style={{
				width: size,
				height: size,
				fontSize: Math.max(7, Math.round(size * 0.58)),
				lineHeight: 1,
				background: ring ? "transparent" : member.color,
				color: ring ? member.color : "#0e0e0e",
				boxShadow: ring ? `inset 0 0 0 1.5px ${member.color}` : undefined,
			}}
		>
			{size >= 12 ? member.initial : null}
		</span>
	);
}

/** an agent: the hand's own node, a small square, bordered in its owner's colour */
export function AgentNode({ who, size = 9, faded = false, className }: { who: Who; size?: number; faded?: boolean; className?: string | undefined }) {
	return (
		<span
			aria-hidden="true"
			className={cn("block shrink-0 rounded-[2px] bg-canvas", className)}
			style={{ width: size, height: size, boxShadow: `inset 0 0 0 1.5px ${ink(who)}`, opacity: faded ? 0.5 : 1 }}
		/>
	);
}

/** a pointer, only ever drawn inside a frame two people are both in */
export function Pointer({ who, x, y, label = true }: { who: Who; x: number; y: number; label?: boolean }) {
	const color = MEMBERS[who].color;
	return (
		<div className="pointer-events-none absolute" style={{ left: x, top: y }}>
			<svg width="14" height="16" viewBox="0 0 14 16" className="-translate-x-[1px] -translate-y-[1px] block" aria-hidden="true">
				<path d="M1.2 1.2v12.2l3.3-3.1 2.3 5 2-0.9-2.2-4.9h4.6Z" fill={color} stroke="#0e0e0e" strokeWidth="1" strokeLinejoin="round" />
			</svg>
			{label ? (
				<span
					className="absolute top-3.5 left-3 whitespace-nowrap rounded-xs px-1.5 py-[1px] font-sans text-[11px] leading-4"
					style={{ background: color, color: "#0e0e0e" }}
				>
					{MEMBERS[who].name}
				</span>
			) : null}
		</div>
	);
}

/* ---------- the hand ---------- */

const OUT = 12;
const PART = 76;
const NODE = 9;

function lengthFor(posture: Posture, frameH: number): number {
	if (posture === "read") return frameH;
	if (posture === "write") return Math.min(PART, frameH * 0.6);
	return 0;
}

function writeCentre(scene: Scenario, who: Who, frame: FrameName, t: number, rect: Box, cam: Camera): number {
	const latest = lastWrite(scene, who, frame, t);
	if (latest === null) return rect.y + rect.h / 2;
	const before = lastWrite(scene, who, frame, latest.at - 0.001);
	const centre = (write: Write) => {
		const box = onScreenBox(cam, blockBox(frameOf(write.frame), write.block));
		return box.y + box.h / 2;
	};
	const to = centre(latest);
	const from = before === null ? rect.y + rect.h / 2 : centre(before);
	return lerp(from, to, easeOut((t - latest.at) / 0.22));
}

export type Wall = "left" | "right";

/**
 * Every hold on the canvas: a thread on the frame's wall, full height to read and a
 * short run beside the block it is writing, four corners while it photographs.
 * Two agents on one frame take one wall each, so neither ever stands on the other.
 */
export function Hands({
	scene,
	t,
	cam,
	only,
	quiet = false,
}: {
	scene: Scenario;
	t: number;
	cam: Camera;
	/** draw only these frames' holds */
	only?: ((frame: FrameName) => boolean) | undefined;
	/** a quieter thread for takes that put the answer elsewhere */
	quiet?: boolean;
}) {
	const holds = agentsAt(scene, t).filter((hold) => only === undefined || only(hold.frame));
	const walls = new Map<string, Wall>();
	const taken = new Map<FrameName, number>();
	for (const hold of holds) {
		const key = `${hold.who}:${hold.frame}`;
		if (walls.has(key)) continue;
		const n = taken.get(hold.frame) ?? 0;
		walls.set(key, n === 0 ? "left" : "right");
		taken.set(hold.frame, n + 1);
	}
	return (
		<svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" fill="none" aria-hidden="true">
			{holds.map((hold) => {
				const rect = onScreenBox(cam, frameOf(hold.frame));
				const wall = walls.get(`${hold.who}:${hold.frame}`) ?? "left";
				const color = ink(hold.who);
				const line = wall === "left" ? rect.x - OUT : rect.x + rect.w + OUT;
				const target = lengthFor(hold.posture, rect.h);
				const from = hold.was === null ? target : lengthFor(hold.was, rect.h);
				const length = lerp(from, target, hold.change);
				const mid =
					hold.posture === "write"
						? writeCentre(scene, hold.who, hold.frame, t, rect, cam)
						: rect.y + rect.h / 2;
				const centre = lerp(rect.y + rect.h / 2, mid, hold.posture === "write" ? hold.change : 1 - hold.change);
				const latest = lastWrite(scene, hold.who, hold.frame, t);
				const pluck = latest !== null && hold.posture === "write" ? Math.max(0, 1 - (t - latest.at) / 0.24) * 1.8 : 0;
				const shot = hold.posture === "shot" ? hold.change : hold.was === "shot" ? 1 - hold.change : 0;
				return (
					<g key={`${hold.who}:${hold.frame}:${hold.since}`} opacity={hold.wound}>
						{length > 1 ? (
							<path
								d={wallPath(line, centre, length, pluck, wall === "left" ? -1 : 1)}
								stroke={color}
								strokeOpacity={quiet ? 0.55 : 0.85}
								strokeWidth={2}
								strokeLinecap="round"
								pathLength={1}
								strokeDasharray={`${hold.wound} 1`}
								strokeDashoffset={-(1 - hold.wound) / 2}
							/>
						) : null}
						{shot > 0 ? <Corners rect={rect} color={color} amount={shot} /> : null}
						<rect
							x={line - NODE / 2}
							y={centre - NODE / 2}
							width={NODE}
							height={NODE}
							rx={2}
							fill="var(--color-canvas)"
							stroke={color}
							strokeWidth={1.5}
							transform={`rotate(0 ${line} ${centre})`}
						/>
					</g>
				);
			})}
		</svg>
	);
}

function wallPath(x: number, mid: number, length: number, amp: number, dir: number): string {
	const half = length / 2;
	const steps = Math.max(2, Math.round(length / 4));
	const points: string[] = [];
	for (let step = 0; step <= steps; step += 1) {
		const y = -half + (length * step) / steps;
		const dx = dir * amp * Math.sin((2 * Math.PI * y) / 46);
		points.push(`${(x + dx).toFixed(2)} ${(mid + y).toFixed(2)}`);
	}
	return `M ${points.join(" L ")}`;
}

function Corners({ rect, color, amount }: { rect: Box; color: string; amount: number }) {
	const out = 4;
	const r = Math.min(16, rect.w * 0.08);
	const arm = Math.min(11, rect.w * 0.06);
	const x0 = rect.x - out;
	const x1 = rect.x + rect.w + out;
	const y0 = rect.y - out;
	const y1 = rect.y + rect.h + out;
	const paths = [
		`M ${x0} ${y0 + r + arm} V ${y0 + r} A ${r} ${r} 0 0 1 ${x0 + r} ${y0} H ${x0 + r + arm}`,
		`M ${x1 - r - arm} ${y0} H ${x1 - r} A ${r} ${r} 0 0 1 ${x1} ${y0 + r} V ${y0 + r + arm}`,
		`M ${x1} ${y1 - r - arm} V ${y1 - r} A ${r} ${r} 0 0 1 ${x1 - r} ${y1} H ${x1 - r - arm}`,
		`M ${x0 + r + arm} ${y1} H ${x0 + r} A ${r} ${r} 0 0 1 ${x0} ${y1 - r} V ${y1 - r - arm}`,
	];
	return (
		<>
			{paths.map((d) => (
				<path
					key={d}
					d={d}
					stroke={color}
					strokeOpacity={0.8}
					strokeWidth={1.5}
					strokeLinecap="round"
					pathLength={1}
					strokeDasharray="1 1"
					strokeDashoffset={1 - easeOut(amount)}
				/>
			))}
		</>
	);
}

/**
 * The plate: each write tints the block it changed, in the colour of whoever's agent
 * wrote it. Out fast, held flat, back slowly, from the block's own centre.
 */
export function Plates({ scene, t, cam }: { scene: Scenario; t: number; cam: Camera }) {
	return (
		<div className="pointer-events-none absolute inset-0">
			{platesAt(scene, t).map((write) => {
				const rect = onScreenBox(cam, blockBox(frameOf(write.frame), write.block));
				const life = (t - write.at) / PLATE_LIFE;
				const open = clamp01(life / 0.163);
				const opacity = life < 0.163 ? easeOut(open) : life < 0.535 ? 1 : 1 - clamp01((life - 0.535) / 0.465);
				const scale = lerp(0.34, 1, easeOut(open));
				return (
					<span
						key={`${write.by}-${write.at}`}
						className="absolute rounded-[3px]"
						style={{
							left: rect.x,
							top: rect.y,
							width: rect.w,
							height: rect.h,
							background: paperInk(write.by),
							opacity: opacity * 0.22,
							transform: `scaleY(${scale})`,
						}}
					/>
				);
			})}
		</div>
	);
}

/** the frame's name over its top-left corner, in screen space, at the label's fixed size */
export function NameRow({
	rect,
	children,
	className,
}: {
	rect: Box;
	children: ReactNode;
	className?: string | undefined;
}) {
	return (
		<div
			className={cn("pointer-events-none absolute flex items-center gap-1.5 whitespace-nowrap", className)}
			style={{ left: rect.x, top: rect.y - 26, width: rect.w, height: 22 }}
		>
			{children}
		</div>
	);
}

/** the canvas as you left it, lifting as you come back to it */
export function AwayVeil({ scene, t }: { scene: Scenario; t: number }) {
	const away = scene.away;
	if (away === undefined) return null;
	const lift = easeOut((t - away.back) / 0.5);
	if (lift >= 1) return null;
	return <div className="pointer-events-none absolute inset-0 bg-bg" style={{ opacity: 0.55 * (1 - lift) }} />;
}
