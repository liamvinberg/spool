import type { ReactNode } from "react";
import { UnseenMark } from "shared/ui/spool/unseen-mark";
import {
	AgentRing,
	type Ctx,
	edgePoint,
	onViewport,
	PersonDisc,
	RemotePointer,
	type Take,
	threadGeometry,
} from "shared/ui/explore/cloud/presence-wild/stage";
import {
	type AgentNow,
	type AgentPlan,
	type Aim,
	clamp,
	ease,
	easeOut,
	type FrameBox,
	frame,
	lerp,
	PEOPLE,
	type Person,
	type Vec,
	VIEWPORT,
} from "shared/ui/explore/cloud/presence-wild/world";

/**
 * Tether. A person and their agent are one being in two places, so draw them joined: a
 * thread runs from each pointer to the edge of the frame its agent is working on. spool's
 * own name is the metaphor and the shipped hand is already a thread on the frame's wall;
 * this lets that thread run all the way home.
 *
 * The thread's length is the news. Short means someone is watching their agent work;
 * long means they have wandered off and it is working alone. It spools out when a turn
 * starts and reels back in when the turn ends, so an idle team draws nothing. Every write
 * sends a bead up the thread to its owner, which is how you see work happening on a frame
 * that is off screen.
 */

interface Line {
	readonly person: Person;
	readonly from: Vec;
	readonly to: Vec;
	readonly control: Vec;
	readonly reach: number;
	readonly agent: AgentNow;
}

function q(line: Pick<Line, "from" | "to" | "control">, u: number): Vec {
	const a = (1 - u) * (1 - u);
	const b = 2 * (1 - u) * u;
	const c = u * u;
	return {
		x: a * line.from.x + b * line.control.x + c * line.to.x,
		y: a * line.from.y + b * line.control.y + c * line.to.y,
	};
}

/** consecutive calls of one turn, so the thread stays out between them */
function runs(plan: AgentPlan): { from: number; to: number }[] {
	const sorted = [...plan.spans].sort((a, b) => a.from - b.from);
	const out: { from: number; to: number }[] = [];
	for (const span of sorted) {
		const last = out.at(-1);
		if (last !== undefined && span.from - last.to < 0.8) last.to = Math.max(last.to, span.to);
		else out.push({ from: span.from, to: span.to });
	}
	return out;
}

const SPOOL_OUT = 0.6;
const REEL_IN = 0.8;

function reachOf(plan: AgentPlan, t: number): number {
	for (const run of runs(plan)) {
		if (t >= run.from && t < run.to) return easeOut(clamp((t - run.from) / SPOOL_OUT));
		if (t >= run.to && t < run.to + REEL_IN) return 1 - ease(clamp((t - run.to) / REEL_IN));
	}
	return 0;
}

/** the span the thread is tied to: the current one, or the last one while it reels in */
function tiedSpan(a: AgentNow, t: number) {
	if (a.span !== null) return a.span;
	return a.plan.spans.filter((s) => s.to <= t && t - s.to < REEL_IN).at(-1) ?? null;
}

function lines(ctx: Ctx): Line[] {
	const out: Line[] = [];
	for (const a of ctx.agents) {
		if (a.person.id === "you") continue;
		const owner = ctx.people.find((p) => p.person.id === a.person.id);
		if (owner === undefined || owner.pointer === null) continue;
		const reach = reachOf(a.plan, ctx.t);
		if (reach <= 0) continue;
		const span = tiedSpan(a, ctx.t);
		if (span === null) continue;
		const anchor = anchorOf(ctx, a, span.frame);
		const from = ctx.at(owner.pointer);
		const dist = Math.hypot(anchor.x - from.x, anchor.y - from.y);
		const control = { x: (from.x + anchor.x) / 2, y: (from.y + anchor.y) / 2 + Math.min(160, dist * 0.22) };
		out.push({ person: a.person, from, to: anchor, control, reach, agent: a });
	}
	return out;
}

function anchorOf(ctx: Ctx, a: AgentNow, frameName: string): Vec {
	const g = threadGeometry(ctx, a);
	if (g !== null) return { x: g.wall, y: g.mid };
	const b = ctx.box(frame(frameName));
	return { x: b.x - 8, y: b.y + b.h / 2 };
}

function clampIn(v: Vec, inset: number): Vec {
	return { x: Math.min(VIEWPORT.w - inset, Math.max(inset, v.x)), y: Math.min(VIEWPORT.h - 84, Math.max(inset, v.y)) };
}

interface Pin {
	readonly key: string;
	readonly at: Vec;
	readonly person: Person;
	readonly agent: boolean;
	readonly label: string;
	readonly align: "left" | "right";
}

/** where each end of each thread is when it is off screen: pinned to the edge it leaves by */
function pins(ctx: Ctx, all: readonly Line[]): Pin[] {
	const out: Pin[] = [];
	for (const line of all) {
		const samples = Array.from({ length: 49 }, (_, i) => q(line, i / 48));
		const shown = samples.map((s) => onViewport(s, -6));
		const fromIn = shown[0] === true;
		const toIn = shown[48] === true;
		const firstIn = shown.indexOf(true);
		const lastIn = shown.lastIndexOf(true);
		const span = tiedSpan(line.agent, ctx.t);
		const where = span?.frame ?? "";
		if (!toIn && line.reach > 0.95) {
			const at = lastIn >= 0 ? samples[lastIn] : edgePoint(line.to, 20).at;
			if (at !== undefined) out.push(pinAt(`${line.person.id}-a`, at, line.person, true, where));
		}
		if (!fromIn) {
			const at = firstIn >= 0 ? samples[firstIn] : edgePoint(line.from, 20).at;
			if (at !== undefined) out.push(pinAt(`${line.person.id}-p`, at, line.person, false, line.person.name));
		}
	}
	// people whose pointer is off screen and whose agent is not out: the disc alone at the edge
	for (const p of ctx.people) {
		if (p.pointer === null) continue;
		if (all.some((line) => line.person.id === p.person.id)) continue;
		const at = ctx.at(p.pointer);
		if (onViewport(at, 0)) continue;
		out.push(pinAt(`${p.person.id}-p`, edgePoint(at, 20).at, p.person, false, p.person.name));
	}
	return out;
}

function pinAt(key: string, at: Vec, person: Person, agent: boolean, label: string): Pin {
	const c = clampIn(at, 16);
	return { key, at: c, person, agent, label, align: c.x > VIEWPORT.w - 220 ? "right" : "left" };
}

function Overlay({ ctx }: { ctx: Ctx }) {
	const all = lines(ctx);
	const focus = ctx.hovered !== null && (ctx.hovered.kind === "person" || ctx.hovered.kind === "agent") ? ctx.hovered.id : null;
	const small = ctx.cam.k < 0.25;
	return (
		<div className="pointer-events-none absolute inset-0">
			<svg className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
				{all.map((line) => {
					const lit = focus === null || focus === line.person.id;
					return (
						<g key={line.person.id} opacity={lit ? 1 : 0.25}>
							<path
								d={`M${line.from.x} ${line.from.y}Q${line.control.x} ${line.control.y} ${line.to.x} ${line.to.y}`}
								pathLength={1}
								strokeDasharray={`${line.reach} 2`}
								stroke={line.person.color}
								strokeWidth={focus === line.person.id ? 2 : 1.3}
								strokeOpacity={0.62}
								fill="none"
								strokeLinecap="round"
							/>
							{line.reach >= 1 ? <Beads ctx={ctx} line={line} /> : null}
							{line.reach >= 1 ? <circle cx={line.to.x} cy={line.to.y} r={3} fill={line.person.color} /> : null}
						</g>
					);
				})}
				<AwayThreads ctx={ctx} />
			</svg>
			{ctx.people.map((p) => {
				if (p.pointer === null) return null;
				const at = ctx.at(p.pointer);
				if (!onViewport(at, 10)) return null;
				const lit = focus === null || focus === p.person.id;
				return <RemotePointer key={p.person.id} person={p.person} at={at} name={!small || focus === p.person.id} opacity={lit ? 1 : 0.35} />;
			})}
			{pins(ctx, all).map((pin) => (
				<PinMark key={pin.key} pin={pin} />
			))}
			<HoverNote ctx={ctx} all={all} />
			<AwayLayer ctx={ctx} />
		</div>
	);
}

/** one bead per write, carried from the frame up to the person whose agent made it */
function Beads({ ctx, line }: { ctx: Ctx; line: Line }) {
	const travel = 1.1;
	const beads = line.agent.plan.writes.filter((w) => ctx.t - w.at >= 0 && ctx.t - w.at < travel);
	return (
		<>
			{beads.map((w) => {
				const u = ease(clamp((ctx.t - w.at) / travel));
				const p = q(line, 1 - u);
				return <circle key={w.at} cx={p.x} cy={p.y} r={2.6} fill={line.person.color} opacity={1 - u * 0.5} />;
			})}
		</>
	);
}

function PinMark({ pin }: { pin: Pin }) {
	return (
		<div
			className="absolute flex h-6 items-center gap-1.5 rounded-sm border bg-bg px-1.5"
			style={{
				left: pin.align === "left" ? pin.at.x - 10 : undefined,
				right: pin.align === "right" ? VIEWPORT.w - pin.at.x - 10 : undefined,
				top: pin.at.y - 12,
				borderColor: pin.person.color,
				flexDirection: pin.align === "right" ? "row-reverse" : "row",
			}}
		>
			{pin.agent ? <AgentRing person={pin.person} size={14} /> : <PersonDisc person={pin.person} size={14} />}
			<span className={pin.agent ? "whitespace-nowrap text-text type-detail" : "whitespace-nowrap text-text type-caption"}>{pin.label}</span>
		</div>
	);
}

function HoverNote({ ctx, all }: { ctx: Ctx; all: readonly Line[] }) {
	const h = ctx.hovered;
	if (h === null || (h.kind !== "agent" && h.kind !== "person")) return null;
	const line = all.find((one) => one.person.id === h.id);
	if (line === undefined) return null;
	const at = h.kind === "agent" ? line.to : line.from;
	const a = line.agent;
	const left = at.x > VIEWPORT.w - 300 ? at.x - 270 : at.x + 14;
	return (
		<div className="absolute flex items-center gap-2 rounded-sm border border-border-raised bg-bg px-2 py-1" style={{ left, top: at.y + 14 }}>
			<AgentRing person={line.person} size={14} turning={ctx.t} />
			<span className="whitespace-nowrap text-text type-detail">{line.person.agent}</span>
			<span className="whitespace-nowrap text-muted type-detail">
				{a.verb === "write" ? "writing" : a.verb === "read" ? "reading" : "shooting"} {a.frame?.name ?? ""}
			</span>
		</div>
	);
}

/* coming back: changed frames carry stitches, one per write, sewn in the order they happened */

const SEW_FROM = 1.3;
const SEW_EACH = 0.55;
const ASK_AT = 5.2;

function sewn(ctx: Ctx) {
	const changes = [...(ctx.scene.away?.changes ?? [])].sort((a, b) => a.at - b.at);
	return changes.map((c, i) => ({ ...c, start: SEW_FROM + i * SEW_EACH }));
}

function Stitches({ ctx, f, owner, writes, start }: { ctx: Ctx; f: FrameBox; owner: Person; writes: number; start: number }) {
	const b = ctx.box(f);
	const gap = b.w >= 100 ? 6 : 4;
	const fit = Math.max(1, Math.floor((b.w - 26) / gap));
	const n = Math.min(writes, fit);
	const y = b.y + b.h + 7;
	const shown = Math.floor(n * clamp((ctx.t - start) / 0.5));
	if (shown <= 0) return null;
	return (
		<>
			<svg className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
				{Array.from({ length: shown }, (_, i) => (
					<path
						key={i}
						d={`M${b.x + i * gap} ${y + 3}l${gap * 0.6} -5`}
						stroke={owner.color}
						strokeWidth={1.4}
						strokeLinecap="round"
					/>
				))}
			</svg>
			{shown === n ? (
				<span className="absolute text-muted type-detail" style={{ left: b.x + n * gap + 6, top: y - 9 }}>
					{writes}
				</span>
			) : null}
		</>
	);
}

function AwayLayer({ ctx }: { ctx: Ctx }) {
	const away = ctx.scene.away;
	if (away === undefined) return null;
	const all = sewn(ctx);
	const u = easeOut(clamp((ctx.t - 1.6) / 0.3));
	const asked = ctx.t >= ASK_AT;
	return (
		<>
			{all.map((c) => {
				const f = frame(c.frame);
				const b = ctx.box(f);
				if (ctx.visible(b, -4)) return <Stitches key={c.frame} ctx={ctx} f={f} owner={PEOPLE[c.owner]} writes={c.writes} start={c.start} />;
				if (ctx.t < c.start) return null;
				const edge = edgePoint({ x: b.x + b.w / 2, y: b.y + b.h / 2 }, 20);
				const at = clampIn(edge.at, 16);
				return (
					<div
						key={c.frame}
						className="absolute flex h-6 items-center gap-1.5 rounded-sm border border-border-raised bg-bg px-2"
						style={{ left: Math.min(at.x, VIEWPORT.w - 210), top: at.y - 12 }}
					>
						<svg viewBox="0 0 24 8" className="h-2 w-6" aria-hidden="true">
							{[0, 6, 12, 18].map((x) => (
								<path key={x} d={`M${x + 1} 7l3.6 -5`} stroke={PEOPLE[c.owner].color} strokeWidth={1.4} strokeLinecap="round" />
							))}
						</svg>
						<span className="whitespace-nowrap text-text type-detail">{c.frame}</span>
						<span className="text-muted type-detail">{c.writes}</span>
					</div>
				);
			})}
			<div
				className="-translate-x-1/2 absolute top-3 left-1/2 flex h-8 items-center gap-3 rounded-sm border border-border-raised bg-bg pr-1 pl-3"
				style={{ opacity: u }}
			>
				<span className="text-muted type-detail">{away.minutes} min away</span>
				<span className="text-text type-detail">{all.length} frames changed</span>
				<span className={asked ? "flex h-6 items-center rounded-xs bg-thread px-2 text-on-thread type-detail" : "flex h-6 items-center rounded-xs bg-raised px-2 text-text type-detail"}>
					who
				</span>
			</div>
		</>
	);
}

/**
 * Asked who did all this, each changed frame throws a loose thread back to the person whose
 * agent wrote it, wherever they are now. Someone who has left gets a pin saying so.
 */
function AwayThreads({ ctx }: { ctx: Ctx }) {
	if (ctx.scene.away === undefined || ctx.t < ASK_AT) return null;
	const all = sewn(ctx);
	return (
		<>
			{all.map((c, i) => {
				const b = ctx.box(frame(c.frame));
				const from = { x: b.x + b.w / 2, y: b.y + b.h + 8 };
				const owner = ctx.people.find((p) => p.person.id === c.owner);
				const start = ASK_AT + 0.15 + i * 0.25;
				const reach = easeOut(clamp((ctx.t - start) / 0.7));
				const fade = 1 - clamp((ctx.t - 15.5) / 1);
				if (reach <= 0) return null;
				const color = PEOPLE[c.owner].color;
				if (owner === undefined || owner.pointer === null) {
					const to = { x: VIEWPORT.w - 120, y: VIEWPORT.h - 120 };
					const control = { x: lerp(from.x, to.x, 0.5), y: Math.max(from.y, to.y) + 60 };
					return (
						<g key={c.frame} opacity={fade}>
							<path d={`M${from.x} ${from.y}Q${control.x} ${control.y} ${to.x} ${to.y}`} pathLength={1} strokeDasharray={`${reach} 2`} stroke={color} strokeWidth={1.2} strokeOpacity={0.5} strokeDashoffset={0} fill="none" />
							{reach >= 1 ? (
								<foreignObject x={to.x - 10} y={to.y - 12} width={190} height={26}>
									<div className="flex h-6 items-center gap-1.5 rounded-sm border bg-bg px-1.5" style={{ borderColor: color, width: "fit-content" }}>
										<PersonDisc person={PEOPLE[c.owner]} size={14} dim />
										<span className="whitespace-nowrap text-muted type-caption">{PEOPLE[c.owner].name} left 12 min ago</span>
									</div>
								</foreignObject>
							) : null}
						</g>
					);
				}
				const to = ctx.at(owner.pointer);
				const dist = Math.hypot(to.x - from.x, to.y - from.y);
				const control = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 + Math.min(140, dist * 0.22) };
				return (
					<path
						key={c.frame}
						d={`M${from.x} ${from.y}Q${control.x} ${control.y} ${to.x} ${to.y}`}
						pathLength={1}
						strokeDasharray={`${reach} 2`}
						stroke={color}
						strokeWidth={1.2}
						strokeOpacity={0.5 * fade}
						fill="none"
					/>
				);
			})}
		</>
	);
}

function aim(ctx: Ctx, target: Aim): Vec | null {
	if (target.kind === "control") return { x: VIEWPORT.w / 2 + 122, y: 28 };
	if (target.kind !== "person" && target.kind !== "agent") return null;
	const all = lines(ctx);
	const pin = pins(ctx, all).find((one) => one.person.id === target.id && one.agent === (target.kind === "agent"));
	if (pin !== undefined) return { x: pin.align === "left" ? pin.at.x : pin.at.x - 4, y: pin.at.y + 2 };
	const line = all.find((one) => one.person.id === target.id);
	if (target.kind === "agent") return line === undefined ? null : { x: line.to.x + 2, y: line.to.y + 2 };
	const p = ctx.people.find((one) => one.person.id === target.id);
	return p?.pointer === null || p === undefined ? null : { x: ctx.at(p.pointer).x + 22, y: ctx.at(p.pointer).y + 24 };
}

function labelStart(ctx: Ctx, f: FrameBox): ReactNode {
	const c = sewn(ctx).find((one) => one.frame === f.name);
	if (c === undefined || ctx.t < c.start) return null;
	return <UnseenMark mark={c.fresh ? "new" : "changed"} />;
}

export const tether: Take = {
	overlay: (ctx) => <Overlay ctx={ctx} />,
	aim,
	labelStart,
};
