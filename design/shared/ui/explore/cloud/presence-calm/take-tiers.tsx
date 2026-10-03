import type { ReactNode } from "react";
import type { TileDeco } from "./field";
import { agentPresence, FollowChip, Hand, Lane, PeerDot, YouPointer } from "./marks";
import {
	AGENT_KIND,
	AGENTS,
	type AgentId,
	agentOf,
	agentLabel,
	type Cam,
	centerOf,
	clamp01,
	distance,
	ease,
	type FrameDef,
	PEOPLE,
	personAt,
	project,
	type Pt,
	pointOnScreen,
	type Rect,
	rectOf,
	onScreen,
	toRim,
	VIEW_H,
	VIEW_W,
	blockRect,
} from "./model";
import { MINE, type Scene } from "./scenes";
import { agentFollowCam, enteredAt, followingAt, lookedAt, sceneCam, type Take, versionOf } from "./stage";

/**
 * tiers: detail follows concern.
 *
 * Every person and agent is drawn at one of three depths, and the depth is set by
 * how much it concerns you rather than by how busy it is.
 *
 *   0  ambient   a still dot for a person, a still hairline on the frame's wall for
 *                an agent. Nothing at this depth ever moves, however fast it works.
 *   1  near      the name, and the lane: one tick per write that thins away. Your
 *                own agent never drops below this, and off screen it pins to the edge.
 *   2  precise   the shipped hand, plates and all, and what it is doing in words.
 *
 * Concern is: your agent; frames you made; the frame you selected, entered or
 * follow; what sits near the middle of your view. Zoomed under 30% nothing can be
 * located, so nothing is drawn deeper than 1.
 */

type Tier = 0 | 1 | 2;

const CENTER: Pt = { x: VIEW_W / 2, y: VIEW_H / 2 };

function camFor(scene: Scene, t: number): Cam {
	return scene.follow !== undefined ? agentFollowCam(scene, t, "hop") : sceneCam(scene, t);
}

function agentTier(scene: Scene, t: number, cam: Cam, id: AgentId, frame: string): Tier {
	const rect = rectOf(cam, frame);
	const seen = onScreen(rect);
	const focus = scene.selected === frame || enteredAt(scene, t) === frame;
	const follow = followingAt(scene, t);
	let tier: Tier = 0;
	if (id === "you" || MINE.has(frame)) tier = 1;
	if (seen && distance(center(rect), CENTER) < VIEW_W * 0.3) tier = 1;
	if (focus || (follow?.kind === "agent" && follow.who === id)) tier = 2;
	if (id === "you" && seen) tier = 2;
	if (cam.k < 0.3 && tier > 1) tier = 1;
	return tier;
}

function center(r: Rect): Pt {
	return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

/** a depth's own layer, so moving between depths is a 400ms crossfade and never a pop */
function Depth({ on, children }: { on: boolean; children: ReactNode }) {
	return (
		<div
			className="pointer-events-none absolute inset-0 transition-opacity duration-[400ms] ease-[cubic-bezier(0.22,0.61,0.36,1)]"
			style={{ opacity: on ? 1 : 0 }}
		>
			{children}
		</div>
	);
}

function Who({ children }: { children: ReactNode }) {
	return <span className="text-muted type-detail">{children}</span>;
}

/** a small arrow turned to a bearing, so a name can say which way its agent is */
function Bearing({ from, to }: { from: Pt; to: Pt }) {
	const deg = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
	return (
		<svg viewBox="0 0 10 10" className="h-2.5 w-2.5 text-muted" style={{ transform: `rotate(${deg}deg)` }} aria-hidden="true">
			<path d="M1.5 5h6M5.2 2.4 7.8 5 5.2 7.6" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
		</svg>
	);
}

/** something that concerns you and is off screen, pinned to the edge at its bearing */
function EdgePin({ toward, children, ink = 1 }: { toward: Pt; children: ReactNode; ink?: number }) {
	const at = toRim(toward, 16);
	const inward = at.edge === "right" ? "-translate-x-full -translate-y-1/2 pr-1" : at.edge === "left" ? "-translate-y-1/2 pl-1" : at.edge === "top" ? "-translate-x-1/2 pt-1" : "-translate-x-1/2 -translate-y-full pb-1";
	return (
		<div className={`pointer-events-none absolute flex items-center gap-1.5 whitespace-nowrap ${inward}`} style={{ left: at.x, top: at.y, opacity: ink }}>
			{at.edge === "left" ? <Bearing from={CENTER} to={toward} /> : null}
			<span className="rounded-xs bg-bg/80 px-1.5 py-px text-text type-detail">{children}</span>
			{at.edge !== "left" ? <Bearing from={CENTER} to={toward} /> : null}
		</div>
	);
}

export const tiersTake: Take = (scene, t) => {
	const cam = camFor(scene, t);
	const follow = followingAt(scene, t);
	const entered = enteredAt(scene, t);
	const labels = new Map<string, ReactNode[]>();
	const say = (frame: string, node: ReactNode) => labels.set(frame, [...(labels.get(frame) ?? []), node]);
	const lit = new Set<string>();
	const layers: ReactNode[] = [];

	for (const id of AGENTS) {
		const p = agentPresence(scene.runs[id], t);
		if (p === undefined) continue;
		const { now, ink } = p;
		const frame = now.run.frame;
		const rect = rectOf(cam, frame);
		const tier = agentTier(scene, t, cam, id, frame);
		const seen = onScreen(rect);
		if (tier === 1 && seen && cam.k >= 0.3) say(frame, <Who key={id}>{agentLabel(id)}</Who>);
		if (tier === 2 && seen)
			say(
				frame,
				<Who key={id}>
					{agentLabel(id)} {now.run.kind === "write" ? `writing · ${now.landed}` : "reading"}
				</Who>,
			);
		if (tier === 2) lit.add(frame);
		const others = AGENTS.filter((o) => o !== id && agentPresence(scene.runs[o], t)?.now.run.frame === frame);
		const side = others.length > 0 && others[0] !== undefined && AGENTS.indexOf(others[0]) < AGENTS.indexOf(id) ? "right" : "left";
		layers.push(
			<div key={id} className="pointer-events-none absolute inset-0">
				<Depth on={tier === 0 && seen}>
					<span
						className="absolute w-px bg-text"
						style={{ left: (side === "left" ? rect.x - 6 : rect.x + rect.w + 5), top: rect.y, height: rect.h, opacity: 0.3 * ink }}
					/>
				</Depth>
				<Depth on={tier === 1 && seen}>
					<span
						className="absolute w-px bg-text"
						style={{ left: rect.x - 9, top: rect.y, height: rect.h, opacity: 0.55 * ink }}
					/>
					<Lane rect={rect} run={now.run} t={t} k={cam.k} ink={ink} />
				</Depth>
				<Depth on={tier === 2 && seen}>
					<Hand rect={rect} now={now} t={t} k={cam.k} ink={ink} side={side} label={others.length > 0 ? AGENT_KIND[id] : undefined} />
				</Depth>
				{tier >= 1 && !seen ? (
					<EdgePin toward={center(rect)} ink={ink}>
						{agentLabel(id)} · {frame}
					</EdgePin>
				) : null}
			</div>,
		);
	}

	for (const id of PEOPLE) {
		const p = personAt(scene.pointers[id], t);
		if (p === undefined) continue;
		const at = project(cam, p.at);
		const seen = pointOnScreen(at, 4);
		const hovered = scene.hover !== undefined && scene.hover.person === id && t >= scene.hover.from && t < scene.hover.to;
		const inFocus = rectContains(scene.selected, cam, at) || rectContains(entered, cam, at);
		const followed = follow?.kind === "person" && follow.who === id;
		const tier: Tier = hovered || inFocus || followed ? 2 : p.still < 2.5 && cam.k >= 0.3 ? 1 : 0;
		if (!seen) continue;
		const own = agentOf(id);
		const agent = own === undefined ? undefined : agentPresence(scene.runs[own], t);
		const agentAt = agent === undefined ? undefined : center(rectOf(cam, agent.now.run.frame));
		const apart = agentAt !== undefined && (distance(agentAt, at) > 500 || !pointOnScreen(agentAt));
		const trail =
			tier >= 1 && apart && agent !== undefined && agentAt !== undefined ? (
				<span className="flex items-center gap-1 text-muted">
					<span>{AGENT_KIND[own ?? "you"]} on {agent.now.run.frame}</span>
					<Bearing from={at} to={agentAt} />
				</span>
			) : null;
		layers.push(
			<PeerDot
				key={id}
				at={at}
				ink={tier === 0 ? 0.6 : tier === 1 ? 0.85 : 1}
				size={tier === 0 ? 6 : 8}
				name={tier === 0 ? undefined : id}
				trail={trail}
			/>,
		);
		if (hovered && agentAt !== undefined) {
			const end = pointOnScreen(agentAt, 30) ? agentAt : toRim(agentAt, 30);
			const v = ease((t - (scene.hover?.from ?? 0)) / 0.6) * (1 - ease((t - (scene.hover?.to ?? 0) + 0.4) / 0.4));
			layers.push(
				<svg key={`${id}-leash`} className="pointer-events-none absolute inset-0 h-full w-full mix-blend-difference" aria-hidden="true">
					<line
						x1={at.x}
						y1={at.y}
						x2={lerpPt(at, end, v).x}
						y2={lerpPt(at, end, v).y}
						stroke="#ffffff"
						strokeOpacity={0.55}
						strokeWidth={1}
						strokeDasharray="3 4"
					/>
				</svg>,
			);
			if (!pointOnScreen(agentAt, 30) && agent !== undefined) {
				layers.push(
					<EdgePin key={`${id}-pin`} toward={agentAt} ink={v}>
						{agentLabel(own ?? "you")} · {agent.now.run.frame}
					</EdgePin>,
				);
			}
		}
	}

	if (scene.you !== undefined) {
		const at = project(cam, sampleYou(scene, t));
		const pressed = scene.entered !== undefined && t >= scene.entered.from - 0.25 && t < scene.entered.from + 0.05;
		layers.push(<YouPointer key="you" at={at} pressed={pressed} />);
	}

	// coming back: your frames get the precise depth, held still until you have
	// looked at them; frames near you get a line; the rest only their mark
	const away = scene.away;
	const awayMarks = new Map<string, NonNullable<TileDeco["mark"]>>();
	if (away !== undefined) {
		for (const change of away.changes) {
			const looked = lookedAt(scene, change.frame);
			const cleared = t > looked + 1.2;
			if (!cleared) awayMarks.set(change.frame, change.isNew === true ? "new" : "changed");
			const rect = rectOf(cam, change.frame);
			if (!onScreen(rect)) continue;
			const mine = MINE.has(change.frame);
			const near = distance(center(rect), CENTER) < VIEW_W * 0.42;
			if ((mine || near) && cam.k >= 0.3 && !cleared) {
				say(change.frame, <Who key="away">{agentLabel(change.by)} · {change.edits} edits · {change.ago}m</Who>);
			}
			if (mine && cam.k >= 0.3) {
				change.blocks.forEach((block, i) => {
					const box = blockRect(rect, block, cam.k);
					const fade = clamp01((t - looked - 0.6 - i * 0.25) / 0.6);
					layers.push(
						<span
							key={`${change.frame}-${block}`}
							className="pointer-events-none absolute rounded-[3px] bg-[#fff] mix-blend-difference"
							style={{ left: box.x, top: box.y, width: box.w, height: box.h, opacity: 0.2 * (1 - ease(fade)) }}
						/>,
					);
				});
			}
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
		life: agentPresence(scene.runs.you, t) !== undefined ? "running" : away !== undefined ? "unread" : undefined,
		overlay: (
			<>
				{layers}
				{follow !== undefined ? (
					<>
						<div className="pointer-events-none absolute inset-0 border border-text/25" />
						<FollowChip>following {follow.kind === "person" ? follow.who : agentLabel(follow.who)} · esc stops</FollowChip>
					</>
				) : null}
			</>
		),
	};
};

function lerpPt(a: Pt, b: Pt, v: number): Pt {
	return { x: a.x + (b.x - a.x) * v, y: a.y + (b.y - a.y) * v };
}

function rectContains(frame: string | undefined, cam: Cam, p: Pt): boolean {
	if (frame === undefined) return false;
	const r = rectOf(cam, frame);
	return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

function sampleYou(scene: Scene, t: number): Pt {
	return personAt(scene.you, t)?.at ?? centerOf("cart");
}

