import { memo, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "shared/lib/utils";
import { CoffeeScreen, type CoffeeScreenName } from "shared/ui/demo/coffee-screens";
import { CanvasChrome, type PageRow } from "shared/ui/spool/canvas-chrome";
import { SpoolShell } from "shared/ui/spool/shell";
import { type ActorId, MEMBERS, ROSTER } from "./cast";
import { buildCtx, type Ctx, type TakeLayers } from "./ctx";
import { ActorMark, YourPointer } from "./marks";
import { scenario, type StateId, type TakeId } from "./scenarios";
import { edgeTake } from "./take-edge";
import { groundTake } from "./take-ground";
import { reachTake } from "./take-reach";
import { easeOut, type FrameSpec, PHONE, stepAt, VIEW } from "./world";

/**
 * The stage every frame in this question is: spool's shell and canvas chrome,
 * the scenario's frames on the field, and one clock under the window that plays
 * the scene in a loop. A take only draws marks; the stage owns the world.
 */

/** below this many pixels wide a frame drops its name row, as the canvas does when names would collide */
export const LABEL_MIN = 80;

const TAKES: Readonly<Record<TakeId, TakeLayers>> = { edge: edgeTake, ground: groundTake, reach: reachTake };

export function TerritoryStage({ state, take }: { state: StateId; take: TakeId }) {
	const scn = useMemo(() => scenario(state, take), [state, take]);
	const clock = useClock(scn.duration, scn.poster);
	const ctx = buildCtx(scn, take, clock.t);
	const layers = TAKES[take];
	const pages: PageRow[] = scn.pages.map((page, i) => ({ name: page.name, frames: page.frames, active: i === 0, open: i === 0 }));
	return (
		<div className="flex h-full w-full flex-col bg-bg">
			<div className="h-[900px] shrink-0">
				<SpoolShell activeTab="kaffe" tabs={["kaffe", "spool"]} headerAccessory={<Roster ctx={ctx} />}>
					<CanvasChrome pages={pages} rail={null} tool="select">
						<Field ctx={ctx} layers={layers} />
					</CanvasChrome>
				</SpoolShell>
			</div>
			<ScrubBar clock={clock} duration={scn.duration} beats={scn.beats} />
		</div>
	);
}

/* ---------- the field ---------- */

function Field({ ctx, layers }: { ctx: Ctx; layers: TakeLayers }) {
	const { cam } = ctx;
	const selection = ctx.scn.selection === undefined ? null : stepAt(ctx.t, ctx.scn.selection);
	const sel = selection === null ? undefined : ctx.blockScreen(selection.frame, selection.block);
	return (
		<div className="absolute inset-0 overflow-hidden" style={{ width: VIEW.w, height: VIEW.h }}>
			{layers.under === undefined ? null : <div className="pointer-events-none absolute inset-0">{layers.under(ctx)}</div>}
			<div
				className="absolute top-0 left-0 origin-top-left"
				style={{ transform: `translate(${VIEW.w / 2 - cam.x * cam.z}px, ${VIEW.h / 2 - cam.y * cam.z}px) scale(${cam.z})` }}
			>
				{ctx.frames.map((f) => (
					<FramePlace key={f.id} f={f} t={ctx.t} />
				))}
			</div>
			<div className="pointer-events-none absolute inset-0">
				{ctx.frames.map((f) => {
					const r = ctx.frameScreen(f.id);
					if (r === undefined || r.w < LABEL_MIN) return null;
					return (
						<div key={f.id} className="absolute flex items-center gap-2" style={{ left: r.x, top: r.y - 26, width: r.w }}>
							<span className="min-w-0 shrink truncate text-muted type-value">{f.id}</span>
							{r.w < 150 ? null : (layers.label?.(ctx, f) ?? null)}
						</div>
					);
				})}
				{sel === undefined ? null : (
					<div className="absolute rounded-[3px] border-[1.5px] border-thread" style={{ left: sel.x - 2, top: sel.y - 2, width: sel.w + 4, height: sel.h + 4 }} />
				)}
				{layers.over(ctx)}
				{ctx.you === null ? null : <YourPointer at={ctx.you} />}
			</div>
		</div>
	);
}

/** a frame on the field; a frame born mid-scene arrives at its own size, fading up from just smaller */
function FramePlace({ f, t }: { f: FrameSpec; t: number }) {
	const born = f.bornAt === undefined ? 1 : easeOut((t - f.bornAt) / 0.45);
	return (
		<div
			className="absolute"
			style={{
				left: f.x,
				top: f.y,
				width: PHONE.w,
				height: PHONE.h,
				opacity: born,
				transform: born < 1 ? `scale(${0.96 + 0.04 * born})` : undefined,
			}}
		>
			<FrameBody screen={f.screen} />
		</div>
	);
}

const FrameBody = memo(function FrameBody({ screen }: { screen: CoffeeScreenName }) {
	return <CoffeeScreen screen={screen} scale="full" className="rounded-none" />;
});

/* ---------- the roster in the bar ---------- */

/**
 * Everyone on the canvas, in the bar's right corner: a disc per person, their
 * agent's ring tucked behind it. Faint is not on the canvas right now; a ring
 * that turns is an agent mid-write. Who you follow wears a hairline.
 */
function Roster({ ctx }: { ctx: Ctx }) {
	return (
		<div className="flex items-center gap-2.5">
			{ROSTER.map((id) => {
				const member = MEMBERS[id];
				const here = ctx.people.some((person) => person.actor === id);
				const agentId = `${id}:agent` as ActorId;
				const agent = ctx.agents.find((candidate) => candidate.actor === agentId);
				const followed = ctx.follow === id || ctx.follow === agentId;
				return (
					<span key={id} className={cn("relative flex items-center rounded-full p-[2px]", followed && "ring-1")} style={followed ? { ["--tw-ring-color" as string]: member.color } : undefined}>
						<span className={cn("transition-opacity duration-300", !here && "opacity-35")}>
							<ActorMark actor={id} size={18} />
						</span>
						{member.agent === null ? null : (
							<span className={cn("-ml-1 rounded-full bg-bg transition-opacity duration-300", agent === undefined && "opacity-35")}>
								<ActorMark actor={agentId} size={14} busy={agent?.mode === "write"} />
							</span>
						)}
					</span>
				);
			})}
		</div>
	);
}

/* ---------- the clock ---------- */

interface Clock {
	t: number;
	playing: boolean;
	setT: (t: number) => void;
	toggle: () => void;
}

/** one clock per frame: time is the only input, so the scene is the same every loop */
function useClock(duration: number, poster: number): Clock {
	const [t, setT] = useState(poster);
	const [playing, setPlaying] = useState(true);
	useEffect(() => {
		if (!playing) return;
		let raf = 0;
		let last = performance.now();
		const tick = (now: number) => {
			const dt = Math.min(0.1, (now - last) / 1000);
			last = now;
			setT((v) => (v + dt) % duration);
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, [playing, duration]);
	return { t, playing, setT, toggle: () => setPlaying((v) => !v) };
}

function ScrubBar({ clock, duration, beats }: { clock: Clock; duration: number; beats: readonly (readonly [number, string])[] }) {
	const track = useRef<HTMLDivElement>(null);
	const scrub = (clientX: number) => {
		const el = track.current;
		if (el === null) return;
		const box = el.getBoundingClientRect();
		clock.setT(Math.min(duration - 0.001, Math.max(0, ((clientX - box.left) / box.width) * duration)));
	};
	const beat = stepAt(clock.t, beats);
	const beatAt = beats.reduce((at, [k]) => (k <= clock.t ? k : at), 0);
	const fresh = easeOut((clock.t - beatAt) / 0.3);
	return (
		<div className="flex h-[60px] shrink-0 items-center gap-4 border-border border-t bg-bg px-4">
			<button
				type="button"
				onClick={clock.toggle}
				aria-label={clock.playing ? "Pause" : "Play"}
				className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-muted transition-colors hover:bg-surface hover:text-text"
			>
				{clock.playing ? (
					<svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden="true">
						<path d="M3 2h2v8H3zM7 2h2v8H7z" fill="currentColor" />
					</svg>
				) : (
					<svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden="true">
						<path d="M3 1.8 10 6l-7 4.2Z" fill="currentColor" />
					</svg>
				)}
			</button>
			<div
				ref={track}
				className="relative h-7 w-[420px] shrink-0 cursor-pointer"
				onPointerDown={(event) => {
					event.currentTarget.setPointerCapture(event.pointerId);
					scrub(event.clientX);
				}}
				onPointerMove={(event) => {
					if (event.buttons === 1) scrub(event.clientX);
				}}
			>
				<div className="absolute inset-x-0 top-1/2 h-px bg-border-raised" />
				<div className="absolute top-1/2 left-0 h-px bg-muted" style={{ width: `${(clock.t / duration) * 100}%` }} />
				{beats.map(([at]) => (
					<span
						key={at}
						className={cn("-translate-x-1/2 absolute top-1/2 h-2 w-px -translate-y-1/2", at <= clock.t ? "bg-muted" : "bg-border-raised")}
						style={{ left: `${(at / duration) * 100}%` }}
					/>
				))}
				<span
					className="-translate-x-1/2 -translate-y-1/2 absolute top-1/2 h-2.5 w-2.5 rounded-full bg-text"
					style={{ left: `${(clock.t / duration) * 100}%` }}
				/>
			</div>
			<span className="w-[92px] shrink-0 text-muted tabular-nums type-detail">
				{clock.t.toFixed(1).padStart(4, "0")} / {duration.toFixed(1)}
			</span>
			<p className="min-w-0 flex-1 truncate text-text type-label" style={{ opacity: 0.4 + 0.6 * fresh, transform: `translateY(${(1 - fresh) * 3}px)` }}>
				{beat}
			</p>
		</div>
	);
}

