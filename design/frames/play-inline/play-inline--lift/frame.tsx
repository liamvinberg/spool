import { animate, motion, useMotionValue, useMotionValueEvent, useReducedMotion, useTransform } from "motion/react";
import type { MotionValue } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "../../../shared/lib/utils";
import { HERO, heroBox, MockScreen, PLAY, REST, WORLD, type WorldFrame } from "./mock";

/**
 * play-inline--lift: the frame travels, the world stays.
 *
 * The camera does not fly. It backs off a hair, 50% to 47%, and the canvas
 * darkens under it — you watch the room go to sleep. The hero is the only thing
 * that moves: it leaves its slot and travels to the letterbox, and its canvas
 * label stays behind, because a label belongs to the canvas rather than to the
 * frame. What is left behind is the empty hairline slot, so where it came from
 * is never in question while it is gone.
 *
 * The stage arrives late and slowly on purpose. For most of the travel there is
 * nothing hiding the dimmed canvas, which makes this the only one of the three
 * where hibernation is something you watch rather than something you infer.
 *
 * Easing is the canvas camera's own `1 - (1 - p) ** 3` (canvas.tsx:702). The
 * travel takes 560ms, longer than --zoom's flight, because a single object
 * reads as thrown when it arrives as fast as a whole moving world does.
 */

const OUT = (p: number) => 1 - (1 - p) ** 3;

/** The canvas recedes around the viewport's own centre: 50% to 47%, nothing reframed. */
const RECEDE = { x: 410, y: 193, k: 0.47 };

const TICK = { left: heroBox.x * PLAY.k + PLAY.x - 7, top: heroBox.y * PLAY.k + PLAY.y - 7 };
const READOUT = `${heroBox.w} × ${heroBox.h} · ${Math.round(PLAY.k * 100)}%`;

export default function PlayInlineLiftFrame() {
	const camX = useMotionValue(REST.x);
	const camY = useMotionValue(REST.y);
	const camK = useMotionValue(REST.k);
	const heroX = useMotionValue(REST.x);
	const heroY = useMotionValue(REST.y);
	const heroK = useMotionValue(REST.k);
	const field = useMotionValue(1);
	const bar = useMotionValue(1);
	const heroLabel = useMotionValue(1);
	const hole = useMotionValue(0);
	const stage = useMotionValue(0);
	const hud = useMotionValue(0);

	const reduce = useReducedMotion() === true;
	const [playing, setPlaying] = useState(false);
	const busy = useRef(false);

	const beat = useCallback(
		(ms: number, delay = 0) =>
			reduce ? { duration: 0, ease: OUT } : { duration: ms / 1000, delay: delay / 1000, ease: OUT },
		[reduce],
	);

	const enter = useCallback(() => {
		if (busy.current) return;
		busy.current = true;
		setPlaying(true);
		animate(heroX, PLAY.x, beat(560));
		animate(heroY, PLAY.y, beat(560));
		animate(heroK, PLAY.k, beat(560));
		animate(camX, RECEDE.x, beat(420));
		animate(camY, RECEDE.y, beat(420));
		animate(camK, RECEDE.k, beat(420));
		animate(field, 0.5, beat(420));
		animate(bar, 0, beat(300));
		animate(heroLabel, 0, beat(180));
		animate(hole, 1, beat(240, 100));
		animate(stage, 1, beat(420, 220));
		animate(hud, 1, beat(220, 520));
	}, [bar, beat, camK, camX, camY, field, heroK, heroLabel, heroX, heroY, hole, hud, stage]);

	const leave = useCallback(() => {
		if (!busy.current) return;
		busy.current = false;
		setPlaying(false);
		animate(hud, 0, beat(120));
		animate(stage, 0, beat(300, 40));
		animate(heroX, REST.x, beat(520, 60));
		animate(heroY, REST.y, beat(520, 60));
		animate(heroK, REST.k, beat(520, 60));
		animate(camX, REST.x, beat(420, 60));
		animate(camY, REST.y, beat(420, 60));
		animate(camK, REST.k, beat(420, 60));
		animate(field, 1, beat(320, 200));
		animate(bar, 1, beat(260, 220));
		animate(hole, 0, beat(200, 380));
		animate(heroLabel, 1, beat(200, 420));
	}, [bar, beat, camK, camX, camY, field, heroK, heroLabel, heroX, heroY, hole, hud, stage]);

	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") leave();
			else if (event.key.toLowerCase() === "p") enter();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [enter, leave]);

	return (
		<div className="relative h-full w-full overflow-hidden bg-canvas font-sans text-text antialiased [font-synthesis:none]">
			<motion.div
				className="absolute top-0 left-0"
				style={{ x: camX, y: camY, scale: camK, transformOrigin: "0 0", opacity: field }}
			>
				{WORLD.filter((box) => box.name !== HERO).map((box) => (
					<FrameBox key={box.name} box={box} k={camK} />
				))}
				{/* the hero's slot: its label and selection never leave the canvas, and what
				    stays once the frame has gone is the outline of where it sits */}
				<HeroSlot k={camK} label={heroLabel} hole={hole} onPlay={playing ? undefined : enter} />
			</motion.div>

			<motion.div className="pointer-events-none absolute inset-0 bg-bg" style={{ opacity: stage }} />

			<motion.div className="absolute top-0 left-0" style={{ x: heroX, y: heroY, scale: heroK, transformOrigin: "0 0" }}>
				<div
					className="absolute"
					style={{ transform: `translate(${heroBox.x}px, ${heroBox.y}px)`, width: heroBox.w, height: heroBox.h }}
				>
					<div className="h-full w-full overflow-hidden rounded-[10px] border border-border bg-bg">
						<MockScreen name={heroBox.name} />
					</div>
				</div>
			</motion.div>

			<TopBar opacity={bar} k={camK} />
			<Ticks opacity={hud} />
			<Hud opacity={hud} live={playing} onClose={leave} />
		</div>
	);
}

/* ------------------------------------------------------------ the canvas ---- */

function FrameBox({ box, k }: { box: WorldFrame; k: MotionValue<number> }) {
	return (
		<div className="absolute" style={{ transform: `translate(${box.x}px, ${box.y}px)`, width: box.w, height: box.h }}>
			<Label name={box.name} width={box.w} k={k} />
			<div className="h-full w-full overflow-hidden rounded-[10px] border border-border bg-bg">
				<MockScreen name={box.name} />
			</div>
		</div>
	);
}

function HeroSlot({
	k,
	label,
	hole,
	onPlay,
}: {
	k: MotionValue<number>;
	label: MotionValue<number>;
	hole: MotionValue<number>;
	onPlay?: (() => void) | undefined;
}) {
	const radius = useTransform(k, (v: number) => 10 / v);
	const stroke = useTransform(k, (v: number) => 1 / v);
	return (
		<div
			className="absolute"
			style={{ transform: `translate(${heroBox.x}px, ${heroBox.y}px)`, width: heroBox.w, height: heroBox.h }}
		>
			<Label name={heroBox.name} width={heroBox.w} k={k} opacity={label} selected onPlay={onPlay} />
			<motion.div
				className="pointer-events-none absolute inset-0 border-border-raised"
				style={{ opacity: hole, borderRadius: radius, borderWidth: stroke }}
			/>
			<Selection k={k} opacity={label} />
		</div>
	);
}

/**
 * The canvas label, counter-scaled the way the real one is
 * (src/ui/canvas/frame-label.tsx): 1/k so it stays 12px at any zoom, its layout
 * width pre-scaled by k so its screen width still matches the frame's.
 */
function Label({
	name,
	width,
	k,
	opacity,
	selected = false,
	onPlay,
}: {
	name: string;
	width: number;
	k: MotionValue<number>;
	opacity?: MotionValue<number> | undefined;
	selected?: boolean;
	onPlay?: (() => void) | undefined;
}) {
	const w = useTransform(k, (v: number) => width * v);
	const inv = useTransform(k, (v: number) => 1 / v);
	return (
		<motion.div
			className="absolute bottom-full left-0 origin-bottom-left whitespace-nowrap"
			style={{ width: w, scale: inv, ...(opacity === undefined ? {} : { opacity }) }}
		>
			<div className="flex w-full min-w-0 items-center gap-1.5 pb-2.5">
				<span className={cn("min-w-0 truncate font-mono text-sm leading-4", selected ? "text-thread" : "text-muted")}>
					{name}
				</span>
				{selected && onPlay !== undefined ? (
					<button
						type="button"
						aria-label={`Play ${name}`}
						onClick={onPlay}
						className="ml-auto flex shrink-0 cursor-pointer items-center gap-1 rounded-xs px-1 font-mono text-2xs text-muted leading-3 transition-colors hover:text-thread"
					>
						<svg viewBox="0 0 10 10" className="h-2 w-2" fill="currentColor" aria-hidden="true">
							<path d="M2 1.2 8.4 5 2 8.8Z" />
						</svg>
						play
					</button>
				) : null}
			</div>
		</motion.div>
	);
}

const CORNERS = ["tl", "tr", "bl", "br"] as const;

/** The selection, also counter-scaled: 1.5px of stroke and 8px handles at any zoom. */
function Selection({ k, opacity }: { k: MotionValue<number>; opacity: MotionValue<number> }) {
	const inset = useTransform(k, (v: number) => -3 / v);
	const stroke = useTransform(k, (v: number) => 1.5 / v);
	const radius = useTransform(k, (v: number) => 13 / v);
	const size = useTransform(k, (v: number) => 8 / v);
	const off = useTransform(k, (v: number) => -4 / v);
	return (
		<motion.div
			className="pointer-events-none absolute"
			style={{ opacity, top: inset, right: inset, bottom: inset, left: inset }}
		>
			<motion.div className="absolute inset-0 border-thread" style={{ borderWidth: stroke, borderRadius: radius }} />
			{CORNERS.map((corner) => (
				<motion.span
					key={corner}
					className="absolute border-thread bg-on-thread"
					style={{
						width: size,
						height: size,
						borderWidth: stroke,
						borderRadius: stroke,
						...(corner === "tl" || corner === "tr" ? { top: off } : { bottom: off }),
						...(corner === "tl" || corner === "bl" ? { left: off } : { right: off }),
					}}
				/>
			))}
		</motion.div>
	);
}

/* ------------------------------------------------------------ the chrome ---- */

function TopBar({ opacity, k }: { opacity: MotionValue<number>; k: MotionValue<number> }) {
	return (
		<motion.div
			style={{ opacity }}
			className="absolute inset-x-0 top-0 flex h-11 items-center gap-3 border-border border-b bg-bg px-4"
		>
			<span className="flex items-center gap-2 pr-1">
				<span className="h-[2px] w-2.5 bg-thread" />
				<span className="font-medium text-base tracking-tight">spool</span>
			</span>
			<span className="flex h-7 items-center rounded-sm bg-surface px-3 font-mono text-sm leading-4">kaffe</span>
			<span className="font-mono text-muted text-sm leading-4">+</span>
			<span className="ml-auto">
				<ZoomReadout k={k} />
			</span>
		</motion.div>
	);
}

/** The readout is the tell here: the camera barely moves, and it says so. */
function ZoomReadout({ k }: { k: MotionValue<number> }) {
	const [pct, setPct] = useState(() => Math.round(k.get() * 100));
	useMotionValueEvent(k, "change", (v: number) => setPct(Math.round(v * 100)));
	return <span className="font-mono text-2xs text-muted leading-3">{pct}%</span>;
}

function Ticks({ opacity }: { opacity: MotionValue<number> }) {
	const corner = "absolute h-2.5 w-2.5 border-border-raised";
	return (
		<motion.div
			style={{
				opacity,
				left: TICK.left,
				top: TICK.top,
				width: heroBox.w * PLAY.k + 14,
				height: heroBox.h * PLAY.k + 14,
			}}
			className="pointer-events-none absolute"
		>
			<span className={cn(corner, "top-0 left-0 border-t border-l")} />
			<span className={cn(corner, "top-0 right-0 border-t border-r")} />
			<span className={cn(corner, "bottom-0 left-0 border-b border-l")} />
			<span className={cn(corner, "right-0 bottom-0 border-r border-b")} />
		</motion.div>
	);
}

function Hud({ opacity, live, onClose }: { opacity: MotionValue<number>; live: boolean; onClose: () => void }) {
	return (
		<div className="pointer-events-none absolute inset-x-0 bottom-7 flex justify-center">
			<motion.div
				style={{ opacity }}
				className={cn(
					"flex h-9 items-center gap-3.5 rounded-lg border border-border-raised bg-raised px-3.5",
					live ? "pointer-events-auto" : "pointer-events-none",
				)}
			>
				<span className="flex items-center gap-2 font-mono text-sm leading-4">
					<span className="h-[2px] w-2 bg-thread" />
					{HERO}
				</span>
				<span className="h-3 w-px bg-border-raised" />
				<span className="font-mono text-2xs text-muted leading-3">{READOUT}</span>
				<span className="h-3 w-px bg-border-raised" />
				<button
					type="button"
					onClick={onClose}
					aria-label="Close the player"
					className="flex cursor-pointer items-center gap-1.5 font-mono text-2xs text-muted leading-3 transition-colors hover:text-text"
				>
					<svg
						viewBox="0 0 10 10"
						className="h-2.5 w-2.5"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.5"
						aria-hidden="true"
					>
						<path d="M2 2 8 8M8 2 2 8" />
					</svg>
					esc
				</button>
			</motion.div>
		</div>
	);
}
