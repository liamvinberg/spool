import type { ReactNode } from "react";
import type { Life } from "shared/lib/spool/agent-threads";
import { CanvasChrome, type PageRow } from "shared/ui/spool/canvas-chrome";
import { SpoolShell } from "shared/ui/spool/shell";
import { ScrubBar, useLoop } from "./clock";
import { Field, type TileDeco } from "./field";
import {
	AGENTS,
	type AgentId,
	type Cam,
	camOn,
	FRAMES,
	type FrameDef,
	type Key,
	type PersonId,
	project,
	type Pt,
	rectOf,
	type Run,
	sample,
	VIEW_H,
	VIEW_W,
} from "./model";
import { SCENES, type Scene, type StateId } from "./scenes";

/**
 * One take, one state: spool's shell and canvas chrome around a field of kaffe
 * frames, the take's presence drawn over it, and the scrub bar under the window.
 */

export interface TakeView {
	readonly cam: Cam;
	readonly deco?: (frame: FrameDef) => TileDeco;
	readonly overlay: ReactNode;
	readonly header?: ReactNode;
	readonly life?: Life | undefined;
	/** the frame drawn as entered, when a take overrides the scene's */
	readonly entered?: string | undefined;
	/** the take's own account of the scene, where it plays it differently */
	readonly beats?: readonly { readonly t: number; readonly label: string }[] | undefined;
}

export type Take = (scene: Scene, t: number) => TakeView;

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: FRAMES.map((frame) => frame.name), active: true, open: true },
	{ name: "site", frames: ["home", "home--wide"] },
];

export function PresenceStage({ take, state }: { take: Take; state: StateId }) {
	const scene = SCENES[state];
	const clock = useLoop(scene.length, scene.poster);
	const view = take(scene, clock.t);
	const entered = view.entered ?? enteredAt(scene, clock.t);
	return (
		<div className="flex h-full w-full flex-col bg-bg">
			<div className="h-[900px] shrink-0">
				<SpoolShell
					tabs={["kaffe"]}
					activeTab="kaffe"
					zoom={`${Math.round(view.cam.k * 100)}%`}
					headerAccessory={view.header}
				>
					<CanvasChrome pages={PAGES} selected={scene.selected} rail={null} life={view.life}>
						<Field cam={view.cam} selected={scene.selected} entered={entered} deco={view.deco}>
							{view.overlay}
						</Field>
					</CanvasChrome>
				</SpoolShell>
			</div>
			<ScrubBar
				t={clock.t}
				length={scene.length}
				playing={clock.playing}
				beats={view.beats ?? scene.beats}
				onToggle={clock.toggle}
				onSeek={clock.seek}
			/>
		</div>
	);
}

export function enteredAt(scene: Scene, t: number): string | undefined {
	return scene.entered !== undefined && t >= scene.entered.from ? scene.entered.frame : undefined;
}

export type Following = { kind: "person"; who: PersonId } | { kind: "agent"; who: AgentId } | undefined;

export function followingAt(scene: Scene, t: number): Following {
	const f = scene.follow;
	if (f === undefined) return undefined;
	if (t >= f.person.from && t < f.person.to) return { kind: "person", who: f.person.who };
	if (t >= f.agent.from && t < f.agent.to) return { kind: "agent", who: f.agent.who };
	return undefined;
}

export function sceneCam(scene: Scene, t: number): Cam {
	return sample(scene.camera, t);
}

type CamKey = Key<Cam> & { d?: number };

/**
 * Following an agent, three ways. `hop` goes wherever it starts a run; `settle`
 * goes only where it has just finished one; `deadzone` moves the least distance
 * that brings the frame back inside the middle of the view, and not at all when
 * it already is.
 */
export function agentFollowCam(scene: Scene, t: number, mode: "hop" | "settle" | "deadzone", k = 0.72): Cam {
	const f = scene.follow;
	if (f === undefined || t < f.agent.from) return sceneCam(scene, t);
	const start = sceneCam(scene, f.agent.from);
	const runs: readonly Run[] = (scene.runs[f.agent.who] ?? []).filter((r) => r.to > f.agent.from);
	const keys: CamKey[] = [{ t: f.agent.from, ...start }];
	let at: Cam = start;
	runs.forEach((run, i) => {
		// settle waits for the run to finish; the others go when it starts, and the
		// run already open when you start following is gone to at once
		const when = mode === "settle" ? run.to : i === 0 ? f.agent.from : run.from;
		at = mode === "deadzone" && i > 0 ? deadzone(at, run.frame) : camOn(run.frame, k);
		keys.push({ t: when + 1.1, d: 1.1, ...at });
	});
	return sample(keys, t);
}

/** the smallest pan that brings a frame inside the middle 60% of the view */
function deadzone(cam: Cam, frame: string): Cam {
	const r = rectOf(cam, frame);
	const zx0 = VIEW_W * 0.2;
	const zx1 = VIEW_W * 0.8;
	const zy0 = VIEW_H * 0.12;
	const zy1 = VIEW_H * 0.88;
	let dx = 0;
	let dy = 0;
	if (r.x < zx0) dx = r.x - zx0;
	else if (r.x + r.w > zx1) dx = r.x + r.w - zx1;
	if (r.y < zy0) dy = r.y - zy0;
	else if (r.y + r.h > zy1) dy = r.y + r.h - zy1;
	return { x: cam.x + dx / cam.k, y: cam.y + dy / cam.k, k: cam.k };
}

/**
 * A camera that only moves when what it follows leaves the middle of the view,
 * and then by as little as brings it back, eased. It is walked forward from
 * `from` in thirtieths of a second, so it is the same at any t however you got
 * there.
 */
export function deadzoneFollow(start: Cam, from: number, t: number, target: (s: number) => Pt | undefined, box = 0.26): Cam {
	let cam = start;
	const dt = 1 / 30;
	const a = 1 - Math.exp(-dt * 3);
	for (let s = from; s < t; s += dt) {
		const p = target(s);
		if (p === undefined) continue;
		const sp = project(cam, p);
		const x0 = VIEW_W * box;
		const x1 = VIEW_W * (1 - box);
		const y0 = VIEW_H * box;
		const y1 = VIEW_H * (1 - box);
		const dx = sp.x < x0 ? sp.x - x0 : sp.x > x1 ? sp.x - x1 : 0;
		const dy = sp.y < y0 ? sp.y - y0 : sp.y > y1 ? sp.y - y1 : 0;
		cam = { x: cam.x + (dx / cam.k) * a, y: cam.y + (dy / cam.k) * a, k: cam.k };
	}
	return cam;
}

/** the first second the camera holds a frame close enough to read it */
export function lookedAt(
	scene: Scene,
	frame: string,
	camAt: (t: number) => Cam = (t) => sceneCam(scene, t),
	minK = 0.6,
	how: "centred" | "whole" = "centred",
): number {
	// a look is a second's dwell, so a pan sweeping past a frame is not one
	let since = Number.NaN;
	for (let t = 0; t < scene.length; t += 0.1) {
		const cam = camAt(t);
		const r = rectOf(cam, frame);
		const cx = VIEW_W / 2;
		const cy = VIEW_H / 2;
		const held =
			cam.k >= minK &&
			(how === "centred"
				? r.x < cx && r.x + r.w > cx && r.y < cy && r.y + r.h > cy
				: r.x >= 0 && r.y >= 0 && r.x + r.w <= VIEW_W && r.y + r.h <= VIEW_H);
		if (!held) since = Number.NaN;
		else if (Number.isNaN(since)) since = t;
		else if (t - since >= 1) return t;
	}
	return Number.POSITIVE_INFINITY;
}

/** a frame's revision: one per finished write run, so the design visibly moves on */
export function versionOf(scene: Scene, frame: string, t: number): number {
	let v = scene.away?.changes.some((c) => c.frame === frame) === true ? 1 : 0;
	for (const id of AGENTS) {
		for (const run of scene.runs[id] ?? []) {
			if (run.frame !== frame || run.kind !== "write") continue;
			if (run.to <= t) v += 1;
			else if (t >= run.from && run.writes.filter((w) => w.t <= t).length >= 3) v += 1;
		}
	}
	return v;
}
