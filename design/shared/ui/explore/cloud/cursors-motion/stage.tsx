import { memo, type ReactNode, useState } from "react";
import { ScrubBar, useLoopClock } from "shared/ui/explore/cloud/cursors-motion/clock";
import {
	type Feel,
	type FrameBox,
	framesAt,
	type Person,
	type Scene,
	type Seen,
	seenAt,
	selectionsAt,
	settle,
	spanAt,
	type Vec,
	VIEWPORT,
	wasMoving,
	wasStillFor,
} from "shared/ui/explore/cloud/cursors-motion/engine";
import { type Face, Faces, WhoList } from "shared/ui/explore/cloud/cursors-motion/faces";
import { CoffeeScreen } from "shared/ui/demo/coffee-screens";
import { CanvasChrome, type PageRow } from "shared/ui/spool/canvas-chrome";
import { SpoolShell } from "shared/ui/spool/shell";

/**
 * The window every take shares: spool's shell and canvas chrome, three coffee
 * frames, the scrub bar under it all. A take hands in how its people feel and
 * draws them; the stage owns the clock, the camera and the frames.
 */

export type StageState = "loop" | "follow" | "crowd";

export interface Cam {
	readonly x: number;
	readonly y: number;
	readonly z: number;
}

export const HOME_CAM: Cam = { x: VIEWPORT.w / 2, y: VIEWPORT.h / 2, z: 1 };

export interface Ctx {
	readonly scene: Scene;
	readonly t: number;
	readonly seen: readonly Seen[];
	readonly frames: readonly FrameBox[];
	readonly cam: Cam;
	readonly packets: boolean;
	readonly state: StageState;
	readonly toScreen: (p: Vec) => Vec;
}

export interface Take {
	readonly feel: Feel;
	/** everything the take draws over the canvas, in screen pixels */
	readonly cursors: (ctx: Ctx) => ReactNode;
	/** a frame's label coloured by someone, and how far */
	readonly label?: ((ctx: Ctx, frame: FrameBox) => { color: string; amount: number } | null) | undefined;
	/** what the right end of a frame's label row carries */
	readonly labelEnd?: ((ctx: Ctx, frame: FrameBox) => ReactNode) | undefined;
	/** the followed person's view as this take's camera eases toward it */
	readonly camera?: ((scene: Scene, t: number) => Cam) | undefined;
	readonly wind?: boolean | undefined;
}

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["menu", "cart", "receipt"], open: true, active: true },
	{ name: "site", frames: ["landing", "pricing"] },
	{ name: "directing", frames: ["annotate"] },
];

export const FOLLOWED = "maja";

export function Stage({
	scene,
	take,
	state,
	start,
}: {
	scene: Scene;
	take: Take;
	state: StageState;
	start: number;
}) {
	const clock = useLoopClock(scene.length, start);
	const [packets, setPackets] = useState(false);
	const t = clock.t;

	const cam = state === "follow" && take.camera !== undefined ? take.camera(scene, t) : HOME_CAM;
	const toScreen = (p: Vec): Vec => ({
		x: (p.x - cam.x) * cam.z + VIEWPORT.w / 2,
		y: (p.y - cam.y) * cam.z + VIEWPORT.h / 2,
	});
	const seen = seenAt(scene, t, take.feel);
	const frames = framesAt(scene, t, take.feel.cursor);
	const ctx: Ctx = { scene, t, seen, frames, cam, packets, state, toScreen };
	const faces = facesAt(scene, t, state);
	const followed = scene.tracks.find((track) => track.person.id === FOLLOWED)?.person;

	return (
		<div className="flex h-full w-full flex-col bg-bg">
			<div className="h-[900px] shrink-0">
				<SpoolShell
					activeTab="spool"
					tabs={["spool", "kaffe"]}
					zoom={`${Math.round(64 * cam.z)}%`}
					headerAccessory={<Faces faces={faces} wind={take.wind} open={state === "crowd"} />}
				>
					<CanvasChrome pages={PAGES} rail={null}>
						<World ctx={ctx} take={take} />
						{take.cursors(ctx)}
						{packets ? <Packets ctx={ctx} /> : null}
						{state === "follow" && followed !== undefined ? <FollowMark person={followed} /> : null}
						{state === "crowd" ? (
							<div className="absolute top-1.5 right-2 z-30">
								<WhoList faces={faces} />
							</div>
						) : null}
					</CanvasChrome>
				</SpoolShell>
			</div>
			<ScrubBar
				t={t}
				length={scene.length}
				playing={clock.playing}
				marks={scene.marks}
				packets={packets}
				onToggle={() => clock.setPlaying((p) => !p)}
				onSeek={clock.seek}
				onPackets={() => setPackets((p) => !p)}
			/>
		</div>
	);
}

const Screen = memo(function Screen({ screen }: { screen: FrameBox["screen"] }) {
	return <CoffeeScreen screen={screen} />;
});

function World({ ctx, take }: { ctx: Ctx; take: Take }) {
	const { cam, frames } = ctx;
	const selections = selectionsAt(ctx.scene, ctx.t);
	return (
		<>
			<div
				className="absolute top-0 left-0 origin-top-left"
				style={{
					transform: `translate(${VIEWPORT.w / 2}px, ${VIEWPORT.h / 2}px) scale(${cam.z}) translate(${-cam.x}px, ${-cam.y}px)`,
				}}
			>
				{frames.map((frame) => {
					const by = selections.find((s) => s.frame === frame.name)?.person;
					return (
						<div key={frame.name} className="absolute" style={{ left: frame.x, top: frame.y, width: frame.w, height: frame.h }}>
							<Screen screen={frame.screen} />
							{by === undefined ? null : (
								<span
									className="pointer-events-none absolute -inset-[3px] rounded-[11px] border-[1.5px]"
									style={{ borderColor: by.color }}
								/>
							)}
						</div>
					);
				})}
			</div>
			{frames.map((frame) => {
				const at = ctx.toScreen({ x: frame.x, y: frame.y });
				const by = selections.find((s) => s.frame === frame.name)?.person;
				const tint = by === undefined ? (take.label?.(ctx, frame) ?? null) : { color: by.color, amount: 1 };
				return (
					<div
						key={frame.name}
						className="absolute flex items-center gap-1.5"
						style={{ left: at.x, top: at.y - 22, width: frame.w * cam.z, height: 16 }}
					>
						<span className="relative min-w-0 truncate type-value">
							<span className="text-muted">{frame.name}</span>
							{tint === null ? null : (
								<span className="absolute inset-0" style={{ color: tint.color, opacity: tint.amount }}>
									{frame.name}
								</span>
							)}
						</span>
						<span className="ml-auto flex items-center">{take.labelEnd?.(ctx, frame)}</span>
					</div>
				);
			})}
		</>
	);
}

/** the raw packets, last few, so the smoothing has something to be compared with */
function Packets({ ctx }: { ctx: Ctx }) {
	return (
		<div className="pointer-events-none absolute inset-0">
			{ctx.seen.map((s) => {
				const p = ctx.toScreen(s.packet);
				return (
					<span
						key={s.person.id}
						className="absolute h-[5px] w-[5px] rounded-full border"
						style={{ left: p.x - 2.5, top: p.y - 2.5, borderColor: s.person.color, opacity: s.presence }}
					/>
				);
			})}
		</div>
	);
}

function FollowMark({ person }: { person: Person }) {
	return (
		<div className="pointer-events-none absolute inset-0">
			<span className="absolute inset-0 border-2" style={{ borderColor: person.color }} />
			<span
				className="-translate-x-1/2 absolute top-0 left-1/2 rounded-b-xs px-2 pt-[2px] pb-[3px] type-detail"
				style={{ background: person.color, color: "#0e0e0e" }}
			>
				following {person.name.toLowerCase()} · esc
			</span>
		</div>
	);
}

/** every face the header shows, settled on the same clock as the canvas */
export function facesAt(scene: Scene, t: number, state: StageState): Face[] {
	return scene.tracks.map((track) => {
		const away = track.page;
		if (away !== undefined) return { person: track.person, arrive: 1, idle: 0, lit: 0, away };
		const span = spanAt(track, scene.length, t);
		const arrive = span === null ? 0 : Math.min(1, span.since / 0.6, span.until / 0.45);
		const idle = settle((x) => (wasStillFor(track, scene, x) >= scene.idleAfter ? 1 : 0), t, { w: 3.2, z: 1 }, 2.4);
		const lit = settle((x) => (wasMoving(track, scene, x) ? 1 : 0), t, { w: 11, z: 1 }, 0.8);
		return {
			person: track.person,
			arrive: Math.max(0, arrive),
			idle: Math.min(1, Math.max(0, idle)),
			lit: Math.min(1, Math.max(0, lit)),
			note: idle > 0.5 ? (state === "crowd" ? "idle · 4m" : "idle") : undefined,
			followed: state === "follow" && track.person.id === FOLLOWED,
		};
	});
}
