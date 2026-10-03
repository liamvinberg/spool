import type { ReactNode } from "react";
import type { ActorId } from "./cast";
import { seenBy, type TakeId } from "./scenarios";
import {
	type AgentNow,
	agentsAt,
	blockRect,
	type Cam,
	camAt,
	type FrameSpec,
	frameAt,
	frameRect,
	pointAt,
	type Rect,
	rectToScreen,
	type Scenario,
	stepAt,
	toScreen,
	type V,
	type WriteEvent,
	writesOf,
} from "./world";

/**
 * Everything a take needs at one instant, already projected to the viewport.
 * A take draws from this and nothing else, so two rows can never disagree about
 * where anybody is.
 */
export interface PersonNow {
	readonly actor: ActorId;
	readonly world: V;
	readonly screen: V;
	/** the frame under their pointer, if any */
	readonly frame: FrameSpec | undefined;
}

export interface Ctx {
	readonly scn: Scenario;
	readonly take: TakeId;
	readonly t: number;
	readonly cam: Cam;
	readonly frames: readonly FrameSpec[];
	readonly agents: readonly AgentNow[];
	readonly writes: readonly WriteEvent[];
	readonly people: readonly PersonNow[];
	readonly you: V | null;
	readonly follow: ActorId | null;
	readonly seen: ReadonlyMap<string, number>;
	frame(id: string): FrameSpec | undefined;
	frameScreen(id: string): Rect | undefined;
	blockScreen(id: string, block: number): Rect | undefined;
	/** where an actor is in the world: a person's pointer, or the centre of the frame an agent holds */
	whereIs(actor: ActorId): V | null;
}

const writeCache = new WeakMap<Scenario, WriteEvent[]>();

export function buildCtx(scn: Scenario, take: TakeId, t: number): Ctx {
	const cam = camAt(t, scn.camera);
	const frames = scn.frames.filter((f) => f.bornAt === undefined || t >= f.bornAt);
	const byId = new Map(frames.map((f) => [f.id, f]));
	let writes = writeCache.get(scn);
	if (writes === undefined) {
		writes = writesOf(scn);
		writeCache.set(scn, writes);
	}
	const people: PersonNow[] = [];
	for (const track of scn.people) {
		const world = pointAt(t, track.keys);
		if (world === null) continue;
		people.push({ actor: track.actor, world, screen: toScreen(cam, world), frame: frameAt(frames, world, t) });
	}
	const youWorld = pointAt(t, scn.you);
	const agents = agentsAt(scn, t);
	return {
		scn,
		take,
		t,
		cam,
		frames,
		agents,
		writes,
		people,
		you: youWorld === null ? null : toScreen(cam, youWorld),
		follow: scn.follow === undefined ? null : stepAt(t, scn.follow),
		seen: seenBy(scn, t),
		frame: (id) => byId.get(id),
		frameScreen: (id) => {
			const f = byId.get(id);
			return f === undefined ? undefined : rectToScreen(cam, frameRect(f));
		},
		blockScreen: (id, block) => {
			const f = byId.get(id);
			return f === undefined ? undefined : rectToScreen(cam, blockRect(f, block));
		},
		whereIs: (actor) => {
			const person = people.find((candidate) => candidate.actor === actor);
			if (person !== undefined) return person.world;
			const agent = agents.find((candidate) => candidate.actor === actor);
			const f = agent === undefined ? undefined : byId.get(agent.frame);
			return f === undefined ? null : { x: f.x + 195, y: f.y + 422 };
		},
	};
}

/** what a take hands the stage: what it draws under the frames, over them, and on a frame's name row */
export interface TakeLayers {
	readonly under?: ((ctx: Ctx) => ReactNode) | undefined;
	readonly over: (ctx: Ctx) => ReactNode;
	readonly label?: ((ctx: Ctx, frame: FrameSpec) => ReactNode) | undefined;
}
