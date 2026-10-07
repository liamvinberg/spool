import { memo, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { cn } from "shared/lib/utils";
import { CanvasChrome, type PageRow } from "shared/ui/spool/canvas-chrome";
import { SpoolShell } from "shared/ui/spool/shell";
import {
	alpha,
	type Camera,
	clamp,
	type FrameDef,
	featureKey,
	featuresAt,
	frameRect,
	MEMBERS,
	pathAt,
	type Scene,
	toScreen,
	type Side,
	edgeOf,
	VIEW_H,
	VIEW_W,
	type Who,
} from "./model";
import { type BlockMark, KaffeScreen } from "./screens";

/**
 * The window every take draws into: spool's shell and canvas chrome at 1440×900,
 * the canvas viewport between the rails, and a 60px scrub bar under the window
 * that owns the one clock. Everything on screen is a function of that clock, so
 * a recording plays the scenario the same way every time.
 */

export const BAR_H = 60;

export interface Clock {
	readonly t: number;
	readonly playing: boolean;
	readonly toggle: () => void;
	readonly seek: (t: number) => void;
}

export function useLoop(duration: number, poster: number): Clock {
	const [t, setT] = useState(poster);
	const [playing, setPlaying] = useState(true);
	const origin = useRef({ wall: 0, at: poster, playing: true });

	useEffect(() => {
		origin.current.wall = performance.now();
		let raf = 0;
		const tick = (now: number) => {
			const o = origin.current;
			if (o.playing) setT((((o.at + (now - o.wall) / 1000) % duration) + duration) % duration);
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, [duration]);

	const seek = useCallback((at: number) => {
		origin.current = { ...origin.current, wall: performance.now(), at };
		setT(at);
	}, []);

	const toggle = useCallback(() => {
		const o = origin.current;
		const now = performance.now();
		const at = o.playing ? (o.at + (now - o.wall) / 1000) % duration : o.at;
		origin.current = { wall: now, at, playing: !o.playing };
		setPlaying(!o.playing);
		setT(at);
	}, [duration]);

	return { t, playing, toggle, seek };
}

export function pagesFor(scene: Scene): PageRow[] {
	return [
		{ name: "app", frames: scene.frames.map((frame) => frame.name), active: true, open: true },
		{ name: "site", frames: ["home", "home--wide", "pricing"] },
		{ name: "explore", frames: ["cart-sheet", "cart-inline"] },
	];
}

export function PresenceWindow({
	scene,
	clock,
	header,
	tool = "select",
	children,
}: {
	scene: Scene;
	clock: Clock;
	header?: ReactNode | undefined;
	tool?: "select" | "none" | undefined;
	children: ReactNode;
}) {
	return (
		<div className="flex h-full w-full flex-col bg-bg">
			<div className="h-[900px] shrink-0">
				<SpoolShell activeTab="kaffe" tabs={["kaffe", "spool"]} headerAccessory={header}>
					<CanvasChrome pages={pagesFor(scene)} rail={null} tool={tool}>
						{children}
					</CanvasChrome>
				</SpoolShell>
			</div>
			<ScrubBar scene={scene} clock={clock} />
		</div>
	);
}

function ScrubBar({ scene, clock }: { scene: Scene; clock: Clock }) {
	const track = useRef<HTMLDivElement>(null);
	const beat = [...scene.beats].reverse().find((candidate) => candidate.at <= clock.t) ?? scene.beats[0];
	const seekFrom = (clientX: number) => {
		const box = track.current?.getBoundingClientRect();
		if (box === undefined) return;
		clock.seek(clamp((clientX - box.left) / box.width) * scene.duration);
	};
	return (
		<div className="flex h-[60px] shrink-0 items-center gap-4 border-border border-t bg-bg px-4">
			<button
				type="button"
				aria-label={clock.playing ? "Pause" : "Play"}
				onClick={clock.toggle}
				className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-text transition-colors hover:bg-surface"
			>
				{clock.playing ? (
					<svg viewBox="0 0 12 12" className="h-3 w-3" fill="currentColor" aria-hidden="true">
						<rect x="2" y="1.5" width="2.6" height="9" rx="0.6" />
						<rect x="7.4" y="1.5" width="2.6" height="9" rx="0.6" />
					</svg>
				) : (
					<svg viewBox="0 0 12 12" className="h-3 w-3" fill="currentColor" aria-hidden="true">
						<path d="M3 1.6 10 6 3 10.4Z" />
					</svg>
				)}
			</button>
			<div
				ref={track}
				className="relative h-8 flex-1 cursor-pointer"
				onPointerDown={(event) => {
					event.currentTarget.setPointerCapture(event.pointerId);
					seekFrom(event.clientX);
				}}
				onPointerMove={(event) => {
					if (event.buttons === 1) seekFrom(event.clientX);
				}}
			>
				<span className="absolute inset-x-0 top-1/2 h-px bg-border-raised" />
				<span
					className="absolute top-1/2 left-0 h-px bg-muted"
					style={{ width: `${(clock.t / scene.duration) * 100}%` }}
				/>
				{scene.beats.map((candidate) => (
					<span
						key={candidate.at}
						className={cn("absolute top-1/2 h-2 w-px -translate-y-1/2", candidate.at <= clock.t ? "bg-muted" : "bg-border-raised")}
						style={{ left: `${(candidate.at / scene.duration) * 100}%` }}
					/>
				))}
				<span
					className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-text"
					style={{ left: `${(clock.t / scene.duration) * 100}%` }}
				/>
			</div>
			<span className="w-[360px] shrink-0 truncate text-muted type-detail">
				<span className="text-text tabular-nums">{clock.t.toFixed(1).padStart(4, "0")}s</span>
				{beat === undefined ? null : ` · ${beat.label}`}
			</span>
		</div>
	);
}

/* ---------- the canvas ---------- */

/** a phone at its place on the canvas; re-renders only when what it shows changes */
export const PhoneAt = memo(
	function PhoneAt({
		frame,
		cam,
		features,
		marks,
		dim = 1,
		lift,
	}: {
		frame: FrameDef;
		cam: Camera;
		features: Readonly<Record<string, number>>;
		marks?: Readonly<Record<string, BlockMark>> | undefined;
		dim?: number | undefined;
		/** a coloured hairline around the frame, for a frame somebody is working on */
		lift?: { color: string; ink: number } | undefined;
		keyed?: string | undefined;
	}) {
		const r = frameRect(cam, frame);
		if (r.x > VIEW_W + 40 || r.y > VIEW_H + 40 || r.x + r.w < -40 || r.y + r.h < -40) return null;
		return (
			<div
				className="absolute"
				style={{ left: r.x, top: r.y, width: r.w, height: r.h, opacity: dim }}
			>
				<div className="origin-top-left" style={{ transform: `scale(${cam.k})` }}>
					<KaffeScreen kind={frame.kind} features={features} marks={marks} title={frame.title} seed={frame.seed} />
				</div>
				{lift === undefined || lift.ink <= 0.01 ? null : (
					<div
						aria-hidden="true"
						className="pointer-events-none absolute -inset-[3px]"
						style={{
							borderRadius: Math.max(4, 22 * cam.k + 3),
							boxShadow: `inset 0 0 0 1.5px ${alpha(lift.color, lift.ink)}`,
						}}
					/>
				)}
			</div>
		);
	},
	(a, b) =>
		a.frame === b.frame &&
		a.cam.x === b.cam.x &&
		a.cam.y === b.cam.y &&
		a.cam.k === b.cam.k &&
		a.dim === b.dim &&
		a.keyed === b.keyed &&
		a.lift?.color === b.lift?.color &&
		a.lift?.ink === b.lift?.ink,
);

export function marksKey(marks: Readonly<Record<string, BlockMark>> | undefined): string {
	if (marks === undefined) return "";
	return Object.entries(marks)
		.map(([id, mark]) => `${id}:${mark.color}:${mark.ink.toFixed(2)}:${(mark.ring ?? 0).toFixed(2)}`)
		.join("|");
}

/** every frame of the scene at time t, with marks the take hands in */
export function FramesLayer({
	scene,
	cam,
	t,
	marksFor,
	liftFor,
	dimFor,
}: {
	scene: Scene;
	cam: Camera;
	t: number;
	marksFor?: ((frame: FrameDef) => Record<string, BlockMark> | undefined) | undefined;
	liftFor?: ((frame: FrameDef) => { color: string; ink: number } | undefined) | undefined;
	dimFor?: ((frame: FrameDef) => number) | undefined;
}) {
	return (
		<>
			{scene.frames.map((frame) => {
				const features = featuresAt(scene.turns, frame.name, t);
				const marks = marksFor?.(frame);
				return (
					<PhoneAt
						key={frame.name}
						frame={frame}
						cam={cam}
						features={features}
						marks={marks}
						lift={liftFor?.(frame)}
						dim={dimFor?.(frame)}
						keyed={`${featureKey(features)}#${marksKey(marks)}`}
					/>
				);
			})}
		</>
	);
}

/** the frame's name over its top-left corner, as the shipped label sets it */
export function FrameName({
	frame,
	cam,
	tone = "muted",
	children,
	entered = false,
}: {
	frame: FrameDef;
	cam: Camera;
	tone?: "muted" | "text" | undefined;
	children?: ReactNode;
	entered?: boolean | undefined;
}) {
	const r = frameRect(cam, frame);
	if (r.x > VIEW_W || r.x + r.w < 0) return null;
	return (
		<div
			className="pointer-events-none absolute flex items-center gap-1.5 whitespace-nowrap"
			style={{ left: r.x, top: r.y - 26, width: Math.max(r.w, 40), height: 18 }}
		>
			{entered ? (
				<span className="rounded-xs bg-thread px-2 py-[3px] text-on-thread type-detail">live · esc exits</span>
			) : (
				<span className={cn("min-w-0 shrink truncate type-value", tone === "text" ? "text-text" : "text-muted")}>
					{frame.name}
				</span>
			)}
			{children}
		</div>
	);
}

/** a person's pointer: the arrow in their colour and their name, plus whatever a take adds */
export function Pointer({
	who,
	x,
	y,
	children,
	quiet = false,
}: {
	who: Who;
	x: number;
	y: number;
	children?: ReactNode;
	quiet?: boolean | undefined;
}) {
	const member = MEMBERS[who];
	return (
		<div className="pointer-events-none absolute z-10" style={{ left: x, top: y }}>
			<svg width="16" height="18" viewBox="0 0 16 18" className="-translate-x-[2px] -translate-y-[2px] absolute top-0 left-0" aria-hidden="true">
				<path d="M2 2 13.5 9.6 8.3 10.6 5.6 15.6Z" fill={member.color} stroke="#0e0e0e" strokeWidth="1.2" strokeLinejoin="round" />
			</svg>
			<div
				className="absolute top-[15px] left-[12px] flex items-center gap-1.5 whitespace-nowrap rounded-[5px] py-[2px] pr-1.5 pl-1.5"
				style={{ background: quiet ? alpha(member.color, 0.16) : member.color, color: quiet ? member.color : "#0e0e0e" }}
			>
				<span className="font-medium type-caption">{member.name}</span>
				{children}
			</div>
		</div>
	);
}

/** your own pointer, the system arrow, for a scene where you are the one acting */
export function YourPointer({ x, y, press = 0 }: { x: number; y: number; press?: number }) {
	return (
		<div className="pointer-events-none absolute z-30" style={{ left: x, top: y }}>
			{press > 0 ? (
				<span
					className="-translate-x-1/2 -translate-y-1/2 absolute rounded-full border border-text"
					style={{ width: 10 + press * 26, height: 10 + press * 26, opacity: 1 - press }}
				/>
			) : null}
			<svg width="18" height="20" viewBox="0 0 16 18" className="-translate-x-[2px] -translate-y-[2px] absolute top-0 left-0" aria-hidden="true">
				<path d="M2 2 13.5 9.6 8.3 10.6 5.6 15.6Z" fill="#f0efed" stroke="#0e0e0e" strokeWidth="1.2" strokeLinejoin="round" />
			</svg>
		</div>
	);
}

/** a follow: the viewport wears the followed colour, and the header says who */
export function FollowRing({ color, ink }: { color: string; ink: number }) {
	if (ink <= 0.01) return null;
	return (
		<div
			aria-hidden="true"
			className="pointer-events-none absolute inset-0 z-30"
			style={{ boxShadow: `inset 0 0 0 2px ${alpha(color, ink)}` }}
		/>
	);
}

export function FollowChip({ who, agent, text }: { who: Who; agent: boolean; text: string }) {
	const member = MEMBERS[who];
	return (
		<span className="flex h-7 items-center gap-2 rounded-sm px-2 type-detail" style={{ background: alpha(member.color, 0.14), color: member.color }}>
			<span className={cn("h-1.5 w-1.5", agent ? "rounded-[1px]" : "rounded-full")} style={{ background: member.color }} />
			{text}
			<span className="text-muted">esc stops</span>
		</span>
	);
}

/* ---------- the viewport's edge ---------- */

export interface EdgeItem {
	readonly key: string;
	/** where the thing is, in viewport pixels, off screen */
	readonly x: number;
	readonly y: number;
	readonly node: (side: Side) => ReactNode;
	readonly height?: number | undefined;
}

/**
 * What is off screen, pinned to the edge on the line from the middle of the
 * viewport to where it is. Two on one edge are pushed apart rather than stacked
 * on each other, so a crowd off to the right reads as a column.
 */
export function EdgeMarks({ items, pad = 14 }: { items: readonly EdgeItem[]; pad?: number }) {
	const placed = items.map((item) => ({ item, at: edgeOf(item.x, item.y, pad) }));
	for (const side of ["left", "right"] as const) {
		const column = placed.filter((entry) => entry.at.side === side).sort((a, b) => a.at.y - b.at.y);
		for (let i = 1; i < column.length; i += 1) {
			const prev = column[i - 1];
			const cur = column[i];
			if (prev === undefined || cur === undefined) continue;
			const need = (prev.item.height ?? 40) + 8;
			if (cur.at.y - prev.at.y < need) cur.at = { ...cur.at, y: prev.at.y + need };
		}
	}
	return (
		<>
			{placed.map(({ item, at }) => (
				<div
					key={item.key}
					className="pointer-events-none absolute z-20"
					style={{
						left: at.x,
						top: at.y,
						transform:
							at.side === "right"
								? "translate(-100%, -50%)"
								: at.side === "left"
									? "translate(0, -50%)"
									: at.side === "top"
										? "translate(-50%, 0)"
										: "translate(-50%, -100%)",
					}}
				>
					{item.node(at.side)}
				</div>
			))}
		</>
	);
}

/** the chevron an edge mark points out of the viewport with */
export function Outward({ side, color }: { side: Side; color: string }) {
	const turn = side === "right" ? 0 : side === "left" ? 180 : side === "top" ? -90 : 90;
	return (
		<svg viewBox="0 0 8 10" className="h-2.5 w-2 shrink-0" style={{ transform: `rotate(${turn}deg)`, color }} aria-hidden="true">
			<path d="m2 1.5 4 3.5-4 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}

/** agents are squares and people are circles, everywhere on this page */
export function Glyph({ who, agent, size = 7 }: { who: Who; agent: boolean; size?: number }) {
	return (
		<span
			aria-hidden="true"
			className="shrink-0"
			style={{ width: size, height: size, borderRadius: agent ? 1.5 : 999, background: MEMBERS[who].color }}
		/>
	);
}

export function EdgePill({ side, color, children }: { side: "left" | "right" | "top" | "bottom"; color: string; children: ReactNode }) {
	return (
		<div
			className={cn("flex items-center gap-2 whitespace-nowrap rounded-md border bg-bg/95 py-1.5 pr-2.5 pl-2", side === "right" && "flex-row-reverse pr-2 pl-2.5")}
			style={{ borderColor: alpha(color, 0.45) }}
		>
			<Outward side={side} color={color} />
			<div className="flex flex-col gap-0.5">{children}</div>
		</div>
	);
}

export function You({ scene, cam, t }: { scene: Scene; cam: Camera; t: number }) {
	const you = scene.you;
	if (you === undefined) return null;
	const at = pathAt(you.keys, t);
	const p = toScreen(cam, at.x, at.y);
	const enter = scene.entered;
	const press = enter === undefined ? 0 : t >= enter.from - 0.05 && t < enter.from + 0.45 ? (t - enter.from + 0.05) / 0.5 : 0;
	return <YourPointer x={p.x} y={p.y} press={press} />;
}

