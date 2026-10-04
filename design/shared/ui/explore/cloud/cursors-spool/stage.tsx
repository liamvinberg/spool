import type { ReactNode } from "react";
import { cn } from "shared/lib/utils";
import { CoffeeScreen } from "shared/ui/demo/coffee-screens";
import { CanvasChrome } from "shared/ui/spool/canvas-chrome";
import { FrameLabel } from "shared/ui/spool/frame-label";
import { SpoolShell } from "shared/ui/spool/shell";
import { CursorLoop, useLoopTime } from "shared/ui/explore/cloud/cursors-spool/loop";
import {
	type Camera,
	FRAMES,
	LOOP,
	MINE,
	type PersonState,
	type Pt,
	type Rect,
	type Scene,
	frameRect,
	project,
	projectRect,
	stateOf,
} from "shared/ui/explore/cloud/cursors-spool/scene";

/**
 * The window every take is drawn in: spool's shell, the canvas chrome with the
 * dock shut, the kaffe checkout on the field, and the loop's bar underneath.
 * A take is a `Look`: how a person's cursor, their selection, the people at the
 * top right and a follow are drawn. Everything else stays fixed between takes,
 * so the rows read as a diff.
 */

export interface Moment {
	t: number;
	scene: Scene;
	cam: Camera;
	states: readonly PersonState[];
	/** a person's cursor on screen, `dt` seconds ago: what a trail is sampled from */
	trace: (s: PersonState, dt: number) => Pt;
}

export interface Look {
	cursor: (s: PersonState, at: Pt, m: Moment) => ReactNode;
	selection: (s: PersonState, rect: Rect, m: Moment) => ReactNode;
	roster: (m: Moment) => ReactNode;
	/** the who's-here list, drawn over the whole window so the dock cannot cover it */
	list: (m: Moment) => ReactNode;
	follow?: (s: PersonState, m: Moment) => ReactNode;
	/** drawn under every cursor, over the frames */
	under?: (s: PersonState, m: Moment) => ReactNode;
}

function useMoment(scene: Scene): Moment {
	const t = useLoopTime();
	const cam = scene.camera(t);
	const states = scene.tracks.map((track) => stateOf(scene, track, t));
	return {
		t,
		scene,
		cam,
		states,
		trace: (s, dt) => project(scene.camera(t - dt), stateOf(scene, s.track, t - dt).at),
	};
}

export function CursorWindow({ scene, look, start = 0 }: { scene: Scene; look: Look; start?: number }) {
	return (
		<CursorLoop duration={LOOP} start={start} beats={scene.beats}>
			<SpoolShell tabs={["kaffe"]} activeTab="kaffe" zoom="100%" headerAccessory={<Roster scene={scene} look={look} />}>
				<CanvasChrome
					pages={scene.pages.map((page) => ({ ...page, open: page.active === true }))}
					selected={MINE}
					rail={null}
				>
					<Field scene={scene} look={look} />
				</CanvasChrome>
			</SpoolShell>
			{scene.listOpen === true ? <List scene={scene} look={look} /> : null}
		</CursorLoop>
	);
}

function Roster({ scene, look }: { scene: Scene; look: Look }) {
	const m = useMoment(scene);
	return <div className="relative flex h-full items-center">{look.roster(m)}</div>;
}

function List({ scene, look }: { scene: Scene; look: Look }) {
	return <>{look.list(useMoment(scene))}</>;
}

function Field({ scene, look }: { scene: Scene; look: Look }) {
	const m = useMoment(scene);
	const { cam, t } = m;
	const here = m.states.filter((s) => s.here);
	const followed = m.states.find((s) => s.person.id === scene.following);
	return (
		<div className="absolute inset-0 overflow-hidden">
			<div
				className="absolute top-0 left-0 origin-top-left"
				style={{
					transform: `translate(${project(cam, { x: 0, y: 0 }).x}px, ${project(cam, { x: 0, y: 0 }).y}px) scale(${cam.k})`,
				}}
			>
				{FRAMES.map((frame) => {
					const r = frameRect(scene, frame.id, t);
					const hovered = here.some((s) => s.hover === frame.id);
					return (
						<div key={frame.id} className="absolute" style={{ left: r.x, top: r.y, width: r.w, height: r.h }}>
							<FrameLabel
								name={frame.id}
								frameWidth={r.w}
								k={cam.k}
								entered={false}
								paused={false}
								selected={frame.id === MINE}
								hovered={hovered}
							/>
							<CoffeeScreen screen={frame.id} />
						</div>
					);
				})}
			</div>

			<Selection rect={projectRect(cam, frameRect(scene, MINE, t))} />
			{here.map((s) =>
				s.selected === undefined ? null : (
					<div key={`sel-${s.person.id}`}>{look.selection(s, projectRect(cam, frameRect(scene, s.selected, t)), m)}</div>
				),
			)}

			<div className="pointer-events-none absolute inset-0 z-30">
				{look.under === undefined
					? null
					: here.map((s) => <div key={`under-${s.person.id}`}>{look.under?.(s, m)}</div>)}
				{here.map((s) => (
					<div key={s.person.id}>{look.cursor(s, project(cam, s.at), m)}</div>
				))}
			</div>
			{followed === undefined || look.follow === undefined ? null : (
				<div className="pointer-events-none absolute inset-0 z-40">{look.follow(followed, m)}</div>
			)}
		</div>
	);
}

/** your own selection, exactly as spool draws it: solid thread, four handles */
function Selection({ rect }: { rect: Rect }) {
	return (
		<div
			className="pointer-events-none absolute"
			style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
		>
			<span className="absolute inset-0 rounded-lg border-[1.5px] border-thread" />
			{["-left-[4px] -top-[4px]", "-right-[4px] -top-[4px]", "-bottom-[4px] -left-[4px]", "-right-[4px] -bottom-[4px]"].map(
				(spot) => (
					<span
						key={spot}
						className={cn("absolute h-2 w-2 rounded-[1.5px] border-[1.5px] border-thread bg-on-thread", spot)}
					/>
				),
			)}
		</div>
	);
}

/** the pointer the takes share where they keep the arrow: tip at the origin, 13 by 18 */
export const ARROW = "M0.6 0.6 L0.6 15.4 L4.5 11.7 L7.1 17.4 L9.6 16.3 L7.1 10.7 L12.6 10.7 Z";

export function mix(a: number, b: number, u: number) {
	return a + (b - a) * u;
}

/** two hex colours, mixed: the idle fade drains a thread colour to grey */
export function blend(a: string, b: string, u: number): string {
	const pa = [1, 3, 5].map((i) => Number.parseInt(a.slice(i, i + 2), 16));
	const pb = [1, 3, 5].map((i) => Number.parseInt(b.slice(i, i + 2), 16));
	return `rgb(${pa.map((v, i) => Math.round(mix(v, pb[i] ?? v, u))).join(",")})`;
}

