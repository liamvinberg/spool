import type { ReactNode } from "react";
import { cn } from "shared/lib/utils";
import type { TileDeco } from "./field";
import { agentPresence, FollowChip, Hand, YouPointer } from "./marks";
import {
	AGENTS,
	agentLabel,
	agentOf,
	type Cam,
	centerOf,
	clamp01,
	distance,
	ease,
	type FrameDef,
	type Key,
	lerp,
	onScreen,
	PEOPLE,
	type PersonId,
	personAt,
	project,
	type Pt,
	pointOnScreen,
	rectOf,
	type Run,
	sample,
	toRim,
	VIEW_H,
	VIEW_W,
} from "./model";
import { MINE, type Scene } from "./scenes";
import { deadzoneFollow, enteredAt, followingAt, lookedAt, sceneCam, type Take, versionOf } from "./stage";

/**
 * rim: the edge of the view is the periphery.
 *
 * The middle of the canvas is yours. Whatever is not on screen lives on a hairline
 * just inside the viewport's edge, at the bearing it lies in: a dot and an initial
 * for a person, a ring for an agent. Because the rim position is the same
 * projection as the on-screen one, clamped, a thing that walks off screen slides
 * onto the rim and along it, and never jumps.
 *
 * On screen, other people's agents are a still node on the frame's wall and their
 * name on the label. Their writes are not drawn. The shipped hand, plates and
 * all, is kept for the frames that concern you: yours, the selected one, the one
 * you are inside. An agent arriving at one of those is the only thing that travels
 * across the middle, from wherever it was to the wall it takes hold of.
 */

const RIM = 9;
const CENTER: Pt = { x: VIEW_W / 2, y: VIEW_H / 2 };

type Edge = "top" | "right" | "bottom" | "left";

interface RimMark {
	key: string;
	edge: Edge;
	along: number;
	node: (at: Pt, edge: Edge) => ReactNode;
}

function edgeOf(p: Pt): { edge: Edge; along: number } {
	const r = toRim(p, RIM);
	return { edge: r.edge, along: r.edge === "top" || r.edge === "bottom" ? r.x : r.y };
}

function onEdge(edge: Edge, along: number): Pt {
	if (edge === "top") return { x: along, y: RIM };
	if (edge === "bottom") return { x: along, y: VIEW_H - RIM };
	if (edge === "left") return { x: RIM, y: along };
	return { x: VIEW_W - RIM, y: along };
}

/** marks that would sit on top of each other on one edge are spread 18px apart, in order */
function spread(marks: RimMark[]): ReactNode[] {
	const out: ReactNode[] = [];
	for (const edge of ["top", "right", "bottom", "left"] as const) {
		const on = marks.filter((m) => m.edge === edge).sort((a, b) => a.along - b.along);
		let last = Number.NEGATIVE_INFINITY;
		for (const m of on) {
			const along = Math.max(m.along, last + 18);
			last = along;
			out.push(<div key={m.key}>{m.node(onEdge(edge, along), edge)}</div>);
		}
	}
	return out;
}

/** where a label goes so it reads inward from the edge it hangs on */
function inward(edge: Edge): string {
	return edge === "right"
		? "-translate-x-full -translate-y-1/2 pr-3"
		: edge === "left"
			? "-translate-y-1/2 pl-3"
			: edge === "top"
				? "-translate-x-1/2 pt-2.5"
				: "-translate-x-1/2 -translate-y-full pb-2.5";
}

function RimLabel({ at, edge, children, ink = 1 }: { at: Pt; edge: Edge; children: ReactNode; ink?: number }) {
	return (
		<span
			className={cn("pointer-events-none absolute whitespace-nowrap", inward(edge))}
			style={{ left: at.x, top: at.y, opacity: ink }}
		>
			<span className="rounded-xs bg-bg/85 px-1.5 py-px text-text type-detail">{children}</span>
		</span>
	);
}

/** how much an agent has written lately, smoothed over eight seconds: the ring's ink */
function activity(run: Run, t: number): number {
	const recent = run.writes.filter((w) => w.t <= t && t - w.t < 8).length;
	return clamp01(0.35 + recent * 0.08);
}

/** the frames a person's dot or an agent's node concerns you on */
function concerns(scene: Scene, t: number, frame: string): boolean {
	return MINE.has(frame) || scene.selected === frame || enteredAt(scene, t) === frame;
}

function rimCam(scene: Scene, t: number): Cam {
	const f = scene.follow;
	if (scene.away !== undefined) return sample(AWAY_CAM, t);
	if (f === undefined || t < f.person.from) return sceneCam(scene, t);
	const start = sceneCam(scene, f.person.from);
	const ana = (s: number) => personAt(scene.pointers[f.person.who], s)?.at;
	if (t < f.agent.from) return deadzoneFollow(start, f.person.from, t, ana);
	const handed = deadzoneFollow(start, f.person.from, f.agent.from, ana);
	const runs = scene.runs[f.agent.who] ?? [];
	const at = (s: number) => {
		const run = [...runs].reverse().find((r) => r.from <= s) ?? runs[0];
		return run === undefined ? undefined : centerOf(run.frame);
	};
	return deadzoneFollow(handed, f.agent.from, t, at, 0.3);
}

/** coming back: you press two marks on the rim, then step back to see the rest */
const AWAY_CAM: readonly (Key<Cam> & { d?: number })[] = [
	{ t: 0, x: 1005, y: 790, k: 0.5 },
	{ t: 5.4, x: 4005, y: 900, k: 0.5, d: 1.6 },
	{ t: 11.4, x: 3500, y: 2300, k: 0.5, d: 1.6 },
	{ t: 15.6, x: 3500, y: 2300, k: 0.5 },
	{ t: 18, x: 2505, y: 1522, k: 0.2, d: 2.4 },
];

export const rimTake: Take = (scene, t) => {
	const cam = rimCam(scene, t);
	const follow = followingAt(scene, t);
	const entered = enteredAt(scene, t);
	const marks: RimMark[] = [];
	const field: ReactNode[] = [];
	const labels = new Map<string, ReactNode[]>();
	const say = (frame: string, node: ReactNode) => labels.set(frame, [...(labels.get(frame) ?? []), node]);
	const lit = new Set<string>();

	const hovered = (id: PersonId) =>
		scene.hover !== undefined && scene.hover.person === id && t >= scene.hover.from && t < scene.hover.to;

	for (const id of AGENTS) {
		const p = agentPresence(scene.runs[id], t);
		if (p === undefined) continue;
		const { now, ink } = p;
		const frame = now.run.frame;
		const rect = rectOf(cam, frame);
		const node: Pt = { x: rect.x - 11, y: rect.y + 4 };
		const seen = onScreen(rect) && pointOnScreen(node, -20);
		const ownerHovered = id !== "you" && hovered(id);
		const named = id === "you" || ownerHovered;
		if (!seen) {
			const { edge, along } = edgeOf({ x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 });
			const level = now.run.kind === "write" ? activity(now.run, t) : 0.4;
			marks.push({
				key: `agent-${id}`,
				edge,
				along,
				node: (at, e) => (
					<>
						<span
							className="-translate-x-1/2 -translate-y-1/2 pointer-events-none absolute h-[9px] w-[9px] rounded-full border-[1.5px] border-text bg-bg transition-opacity duration-700"
							style={{ left: at.x, top: at.y, opacity: (named ? 1 : level) * ink }}
						/>
						{named ? (
							<RimLabel at={at} edge={e} ink={ink}>
								{agentLabel(id)} · {frame}
							</RimLabel>
						) : null}
					</>
				),
			});
			continue;
		}
		const close = id === "you" || concerns(scene, t, frame) || (follow?.kind === "agent" && follow.who === id);
		say(
			frame,
			cam.k >= 0.3 ? (
				<span key={id} className="text-muted type-detail">
					{agentLabel(id)}
				</span>
			) : (
				<span key={id} className="h-[6px] w-[6px] rounded-[1.5px] border border-muted" />
			),
		);
		if (close) {
			lit.add(frame);
			// arriving: the ring travels in from where the agent last was, then takes hold
			const runs = scene.runs[id] ?? [];
			const prev = runs[runs.indexOf(now.run) - 1];
			const glide = clamp01((t - now.run.from) / 0.9);
			if (prev !== undefined && prev.frame !== frame && glide < 1) {
				const pr = rectOf(cam, prev.frame);
				const prevNode: Pt = onScreen(pr) ? { x: pr.x - 11, y: pr.y + 4 } : toRim({ x: pr.x + pr.w / 2, y: pr.y + pr.h / 2 }, RIM);
				const v = ease(glide);
				field.push(
					<span
						key={`glide-${id}`}
						className="-translate-x-1/2 -translate-y-1/2 pointer-events-none absolute h-[9px] w-[9px] rounded-full border-[1.5px] border-text bg-bg"
						style={{ left: lerp(prevNode.x, node.x, v), top: lerp(prevNode.y, node.y, v) }}
					/>,
				);
			}
			const others = AGENTS.filter((o) => o !== id && agentPresence(scene.runs[o], t)?.now.run.frame === frame);
			const side = others[0] !== undefined && AGENTS.indexOf(others[0]) < AGENTS.indexOf(id) ? "right" : "left";
			const hold = prev !== undefined && prev.frame !== frame ? clamp01((t - now.run.from - 0.8) / 0.24) : 1;
			field.push(
				<Hand
					key={`hand-${id}`}
					rect={rect}
					now={now}
					t={t}
					k={cam.k}
					ink={ink * hold}
					side={side}
					label={others.length > 0 ? agentLabel(id) : undefined}
				/>,
			);
		} else {
			field.push(
				<span
					key={`node-${id}`}
					className="pointer-events-none absolute h-[7px] w-[7px] rounded-[2px] border border-muted bg-canvas"
					style={{ left: node.x - 3.5, top: node.y, opacity: 0.9 * ink }}
				/>,
			);
		}
	}

	for (const id of PEOPLE) {
		const p = personAt(scene.pointers[id], t);
		if (p === undefined) continue;
		const at = project(cam, p.at);
		const isHovered = hovered(id);
		if (!pointOnScreen(at, 2)) {
			const { edge, along } = edgeOf(at);
			const followed = follow?.kind === "person" && follow.who === id;
			marks.push({
				key: `person-${id}`,
				edge,
				along,
				node: (pt, e) => (
					<>
						<span
							className="-translate-x-1/2 -translate-y-1/2 pointer-events-none absolute h-[6px] w-[6px] rounded-full bg-text"
							style={{ left: pt.x, top: pt.y, opacity: followed ? 1 : 0.6 }}
						/>
						<RimLabel at={pt} edge={e} ink={followed ? 1 : 0.7}>
							{id}
						</RimLabel>
					</>
				),
			});
			continue;
		}
		// on screen: a pointer while it moves, a footprint once it has been still a while
		const moving = clamp01(1 - (p.still - 1.2) / 0.8);
		const shown = Math.max(moving, isHovered ? 1 : 0);
		const own = agentOf(id);
		const agent = own === undefined ? undefined : agentPresence(scene.runs[own], t);
		field.push(
			<span key={`person-${id}`} className="pointer-events-none absolute" style={{ left: at.x, top: at.y }}>
				<span
					className="-translate-x-1/2 -translate-y-1/2 absolute rounded-full border-[1.5px] border-bg bg-text"
					style={{ width: lerp(6, 8, shown), height: lerp(6, 8, shown), opacity: lerp(0.6, 1, shown) }}
				/>
				{cam.k >= 0.3 ? (
					<span
						className="absolute top-[-10px] left-[9px] whitespace-nowrap rounded-xs bg-bg/90 px-1.5 py-px text-text type-detail"
						style={{ opacity: shown }}
					>
						{id}
					</span>
				) : null}
			</span>,
		);
		if (isHovered && agent !== undefined && scene.hover !== undefined) {
			// the leash: from the person to their agent's ring on the rim
			const ar = rectOf(cam, agent.now.run.frame);
			const ac = { x: ar.x + ar.w / 2, y: ar.y + ar.h / 2 };
			const end = pointOnScreen(ac, RIM) ? ac : toRim(ac, RIM);
			const v = ease((t - scene.hover.from) / 0.7) * (1 - ease((t - scene.hover.to + 0.4) / 0.4));
			field.push(
				<svg key={`leash-${id}`} className="pointer-events-none absolute inset-0 h-full w-full mix-blend-difference" aria-hidden="true">
					<line x1={at.x} y1={at.y} x2={lerp(at.x, end.x, v)} y2={lerp(at.y, end.y, v)} stroke="#ffffff" strokeOpacity={0.5} strokeDasharray="3 4" />
				</svg>,
			);
		}
	}

	// you, where the scene has you act
	const youAt = youPointer(scene, t, cam);
	if (youAt !== undefined) {
		const pressed = (scene.entered !== undefined && Math.abs(t - scene.entered.from + 0.1) < 0.15) || awayPress(t);
		field.push(<YouPointer key="you" at={youAt} pressed={pressed} />);
	}

	// coming back: the rim keeps a tick at the bearing of each changed frame you
	// have not looked at; frames on screen wear their mark and who changed them
	const away = scene.away;
	const awayMarks = new Map<string, NonNullable<TileDeco["mark"]>>();
	if (away !== undefined) {
		for (const change of away.changes) {
			const looked = lookedAt(scene, change.frame, (s) => rimCam(scene, s), 0.45, "whole");
			if (t > looked + 3) continue;
			awayMarks.set(change.frame, change.isNew === true ? "new" : "changed");
			const rect = rectOf(cam, change.frame);
			if (onScreen(rect, -40)) {
				if (cam.k >= 0.3)
					say(
						change.frame,
						<span key="away" className="text-muted type-detail">
							{agentLabel(change.by)} · {change.edits} edits
						</span>,
					);
				continue;
			}
			const { edge, along } = edgeOf({ x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 });
			const len = 8 + change.edits * 0.7;
			const near = youAt !== undefined && distance(youAt, onEdge(edge, along)) < 30;
			marks.push({
				key: `away-${change.frame}`,
				edge,
				along,
				node: (pt, e) => (
					<>
						<span
							className="-translate-x-1/2 -translate-y-1/2 pointer-events-none absolute rounded-full bg-text transition-opacity duration-300"
							style={{
								left: pt.x,
								top: pt.y,
								width: e === "top" || e === "bottom" ? len : 2,
								height: e === "top" || e === "bottom" ? 2 : len,
								opacity: near ? 1 : 0.5,
							}}
						/>
						{near ? (
							<RimLabel at={pt} edge={e}>
								{change.frame} · {agentLabel(change.by)} · {change.edits} edits · {change.ago}m
							</RimLabel>
						) : null}
					</>
				),
			});
		}
	}

	const deco = (frame: FrameDef): TileDeco => ({
		labelEnd: labels.has(frame.name) ? <span className="flex items-center gap-2">{labels.get(frame.name)}</span> : undefined,
		lit: lit.has(frame.name),
		mark: awayMarks.get(frame.name),
		version: versionOf(scene, frame.name, t),
	});

	return {
		cam,
		deco,
		beats: away === undefined ? undefined : RIM_AWAY_BEATS,
		life: agentPresence(scene.runs.you, t) !== undefined ? "running" : away !== undefined ? "unread" : undefined,
		overlay: (
			<>
				{field}
				<div
					className={cn(
						"pointer-events-none absolute rounded-[2px] border transition-colors duration-500",
						follow !== undefined ? "border-text/30" : "border-text/[0.07]",
					)}
					style={{ inset: RIM }}
				/>
				{spread(marks)}
				{follow !== undefined ? (
					<FollowChip>following {follow.kind === "person" ? follow.who : agentLabel(follow.who)} · esc stops</FollowChip>
				) : null}
			</>
		),
	};
};

const RIM_AWAY_BEATS = [
	{ t: 0, label: "you come back after 41 minutes" },
	{ t: 3.6, label: "you press a mark on the rim" },
	{ t: 9.6, label: "and the next one" },
	{ t: 15.6, label: "zoomed out, what is still unseen" },
];

function awayPress(t: number): boolean {
	return Math.abs(t - 3.6) < 0.12 || Math.abs(t - 9.6) < 0.12;
}

/** your pointer: the scene's track, or in the away scene a walk to two rim ticks */
function youPointer(scene: Scene, t: number, cam: Cam): Pt | undefined {
	if (scene.away !== undefined) {
		const home: Cam = { x: 1005, y: 790, k: 0.5 };
		const tick1 = toRim(project(home, centerOf("profile")), RIM);
		const there: Cam = { x: 4005, y: 900, k: 0.5 };
		const tick2 = toRim(project(there, centerOf("stamps")), RIM);
		return sample<Pt>(
			[
				{ t: 0, x: 640, y: 520 },
				{ t: 3.2, x: tick1.x - 4, y: tick1.y - 2, d: 1.4 },
				{ t: 3.8, x: tick1.x - 4, y: tick1.y - 2 },
				{ t: 6.2, x: 700, y: 400, d: 1.4 },
				{ t: 9.2, x: tick2.x - 3, y: tick2.y - 6, d: 1.6 },
				{ t: 9.8, x: tick2.x - 3, y: tick2.y - 6 },
				{ t: 12.4, x: 560, y: 440, d: 1.4 },
				{ t: 20, x: 640, y: 520, d: 2 },
			],
			t,
		);
	}
	const at = personAt(scene.you, t)?.at;
	return at === undefined ? undefined : project(cam, at);
}
