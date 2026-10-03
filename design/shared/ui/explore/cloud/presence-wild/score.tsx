import type { ReactNode } from "react";
import { cn } from "shared/lib/utils";
import { UnseenMark } from "shared/ui/spool/unseen-mark";
import { AgentRing, type Ctx, PersonDisc, type Take } from "shared/ui/explore/cloud/presence-wild/stage";
import {
	type Aim,
	clamp,
	easeOut,
	type FrameBox,
	frame,
	type MemberId,
	ORDER,
	PEOPLE,
	type Person,
	type PersonPlan,
	roomOf,
	type Scene,
	type Vec,
	type View,
	VIEWPORT,
} from "shared/ui/explore/cloud/presence-wild/world";

/**
 * Score. Most of what happens on a shared canvas is agents writing over time, and very
 * little of it is people moving. So presence moves off the field and into time: a strip
 * along the top of the canvas with one row per person and their agent's row under it,
 * running like a tape recorder with now at the right edge. The canvas keeps only the
 * hand, in its owner's colour, and stays clean.
 *
 * Distance stops mattering, because a person and their agent sit on adjacent rows
 * whatever the canvas distance between them. Zoom stops mattering, because the strip is
 * drawn in screen space. And coming back is a scrub: the tape kept recording.
 */

const NAME_W = 132;
const NOW_W = 214;
const PAD_X = 12;
const HEAD_H = 24;
const PERSON_H = 22;
const AGENT_H = 20;
const WINDOW = 60;
const TAPE_X = PAD_X + NAME_W;
const TAPE_W = VIEWPORT.w - PAD_X * 2 - NAME_W - NOW_W;
const NOW_X = TAPE_X + TAPE_W;

interface Lane {
	readonly id: MemberId;
	readonly agent: boolean;
	readonly y: number;
	readonly h: number;
}

/** a row per person and a row under it for their agent, the same nine rows in every scene */
function lanesOf(): { lanes: Lane[]; height: number } {
	const lanes: Lane[] = [];
	let y = HEAD_H;
	for (const id of ORDER) {
		lanes.push({ id, agent: false, y, h: PERSON_H });
		y += PERSON_H;
		if (PEOPLE[id].agent !== null) {
			lanes.push({ id, agent: true, y, h: AGENT_H });
			y += AGENT_H;
		}
	}
	return { lanes, height: y + 8 };
}

const PANEL_H = lanesOf().height;

/** the strip takes the top of the viewport, so the camera looks at what is left under it */
function steer(scene: Scene, t: number): View {
	const v = scene.camera(t);
	const k = Math.min(v.k, (VIEWPORT.h - PANEL_H - 56) / 844);
	return { cx: v.cx, cy: v.cy - (PANEL_H / 2 + 22) / k, k };
}

const xOf = (time: number, now: number) => TAPE_X + ((time - (now - WINDOW)) / WINDOW) * TAPE_W;

function roomSegments(plan: PersonPlan, now: number) {
	const out: { from: number; to: number; frame: string | null }[] = [];
	for (let s = now - WINDOW; s <= now; s += 0.5) {
		const room = roomOf(plan, s)?.name ?? null;
		const last = out.at(-1);
		if (last !== undefined && last.frame === room) last.to = s + 0.5;
		else out.push({ from: s, to: s + 0.5, frame: room });
	}
	return out;
}

function verbWord(verb: string | null): string {
	return verb === "write" ? "writing" : verb === "read" ? "reading" : verb === "shot" ? "shooting" : "idle";
}

function Strip({ ctx }: { ctx: Ctx }) {
	const { lanes } = lanesOf();
	const now = ctx.t;
	const away = ctx.scene.away;
	const replay = away === undefined ? 0 : replayPhase(ctx.t);
	const live = away === undefined ? 1 : 1 - replay;
	// who is on which frame right now, for the bracket that ties rows sharing one
	const current = lanes.map((lane) => {
		if (lane.agent) {
			const a = ctx.agents.find((one) => one.person.id === lane.id);
			return a?.frame?.name ?? null;
		}
		if (lane.id === "you") return ctx.entered;
		const p = ctx.people.find((one) => one.person.id === lane.id);
		return p?.pointer === null ? null : (p?.room?.name ?? null);
	});
	const shared = new Map<string, number[]>();
	current.forEach((name, i) => {
		if (name === null) return;
		shared.set(name, [...(shared.get(name) ?? []), i]);
	});
	return (
		<div className="absolute inset-x-0 top-0 border-border border-b bg-bg" style={{ height: PANEL_H }}>
			{/* the ruler */}
			<div className="absolute inset-x-0 top-0" style={{ height: HEAD_H }}>
				{live > 0
					? [60, 45, 30, 15].map((ago) => (
							<span key={ago} className="absolute top-1 text-muted type-detail" style={{ left: xOf(now - ago, now) - 8, opacity: live }}>
								{ago === 60 ? "1 min" : `${ago} s`}
							</span>
						))
					: null}
				<span className="absolute top-1 text-text type-detail" style={{ left: NOW_X - 12 }}>
					now
				</span>
				{away === undefined ? null : <ReplayButton ctx={ctx} />}
			</div>
			<span className="absolute w-px bg-border-raised" style={{ left: NOW_X, top: HEAD_H - 2, bottom: 6 }} />
			{lanes.map((lane, i) => {
				const person = PEOPLE[lane.id];
				const followed = ctx.follow !== null && ctx.follow.who === lane.id && ctx.follow.agent === lane.agent;
				const hovered = isHovered(ctx.hovered, lane);
				const here = current[i] ?? null;
				const crowd = here === null ? 1 : (shared.get(here)?.length ?? 1);
				return (
					<div
						key={`${lane.id}-${lane.agent}`}
						className={cn("absolute inset-x-0 transition-colors duration-200", (followed || hovered) && "bg-surface")}
						style={{ top: lane.y, height: lane.h }}
					>
						{followed ? <span className="absolute top-0.5 bottom-0.5 left-0 w-[2px] rounded-full" style={{ background: person.color }} /> : null}
						<div className="absolute top-0 bottom-0 flex items-center gap-2" style={{ left: PAD_X + (lane.agent ? 14 : 0), width: NAME_W - 14 }}>
							{lane.agent ? <AgentRing person={person} size={14} turning={here === null ? undefined : ctx.t} /> : <PersonDisc person={person} size={14} />}
							{lane.agent ? (
								<span className="text-muted type-detail">{person.agent}</span>
							) : (
								<span className="text-text type-label">{lane.id === "you" ? "You" : person.name}</span>
							)}
						</div>
						<div className="absolute top-0 bottom-0 overflow-hidden" style={{ left: TAPE_X, width: TAPE_W }}>
							<div className="absolute inset-0" style={{ opacity: live }}>
								{lane.agent ? <AgentTape ctx={ctx} id={lane.id} /> : <PersonTape ctx={ctx} id={lane.id} />}
							</div>
							{away === undefined || replay <= 0 ? null : (
								<div className="absolute inset-0" style={{ opacity: replay }}>
									<ReplayTape ctx={ctx} lane={lane} />
								</div>
							)}
						</div>
						<div className="absolute top-0 bottom-0 flex items-center gap-1.5 overflow-hidden" style={{ left: NOW_X + 14, width: NOW_W - 22 }}>
							{followed ? <span className="shrink-0 rounded-xs px-1 type-detail" style={{ background: person.color, color: "#0e0e0e" }}>following</span> : null}
							<NowText ctx={ctx} lane={lane} here={here} crowd={crowd} />
						</div>
					</div>
				);
			})}
			{away === undefined || live <= 0 ? null : <AwayBand now={now} minutes={away.minutes} opacity={live} />}
			{[...shared.entries()]
				.filter(([, rows]) => rows.length > 1)
				.map(([name, rows]) => {
					const ys = rows.map((r) => lanes[r]).filter((lane): lane is Lane => lane !== undefined).map((lane) => lane.y + lane.h / 2);
					const top = Math.min(...ys);
					const bottom = Math.max(...ys);
					return (
						<svg key={name} className="absolute overflow-visible" style={{ left: NOW_X + 4, top: 0 }} width={8} height={PANEL_H} aria-hidden="true">
							<path d={`M6 ${top}H2V${bottom}H6`} stroke="#f0efed" strokeOpacity={0.55} strokeWidth={1.2} fill="none" />
						</svg>
					);
				})}
		</div>
	);
}

/**
 * Everything before you came back, folded: the tape cannot show 47 minutes at this scale,
 * so it says how long the gap was and leaves the rows readable through it.
 */
function AwayBand({ now, minutes, opacity }: { now: number; minutes: number; opacity: number }) {
	const right = Math.min(NOW_X, xOf(0, now));
	if (right <= TAPE_X) return null;
	return (
		<div
			className="pointer-events-none absolute flex items-center justify-center"
			style={{
				left: TAPE_X,
				width: right - TAPE_X,
				top: HEAD_H - 2,
				bottom: 6,
				opacity,
				background: "repeating-linear-gradient(135deg, rgb(14 14 14 / 0.9) 0 5px, rgb(28 28 28 / 0.9) 5px 10px)",
				borderRight: "1px solid var(--color-border-raised)",
			}}
		>
			<span className="rounded-xs bg-bg px-1.5 text-muted type-detail">{minutes} min while you were away</span>
		</div>
	);
}

function isHovered(h: Aim | null, lane: Lane): boolean {
	if (h === null) return false;
	return (h.kind === "agent" && lane.agent && h.id === lane.id) || (h.kind === "person" && !lane.agent && h.id === lane.id);
}

function NowText({ ctx, lane, here, crowd }: { ctx: Ctx; lane: Lane; here: string | null; crowd: number }) {
	if (lane.agent) {
		const a = ctx.agents.find((one) => one.person.id === lane.id);
		if (a === undefined || a.frame === null) return <span className="text-muted type-detail">idle</span>;
		return (
			<>
				<span className="shrink-0 text-muted type-detail">{verbWord(a.verb)}</span>
				<span className={cn("truncate type-detail", crowd > 1 ? "text-text" : "text-muted")}>{a.frame.name}</span>
			</>
		);
	}
	if (lane.id === "you") {
		return <span className={cn("truncate type-detail", crowd > 1 ? "text-text" : "text-muted")}>{here ?? "looking around"}</span>;
	}
	const p = ctx.people.find((one) => one.person.id === lane.id);
	if (p === undefined || p.pointer === null) return <span className="text-muted type-detail">away</span>;
	return <span className={cn("truncate type-detail", crowd > 1 ? "text-text" : "text-muted")}>{here ?? "between frames"}</span>;
}

function PersonTape({ ctx, id }: { ctx: Ctx; id: MemberId }) {
	const plan = ctx.scene.people.find((p) => p.id === id);
	const person = PEOPLE[id];
	if (plan === undefined) {
		if (id !== "you") return null;
		// you: what you had open, which is the one thing the canvas knows about you
		const opened = ctx.scene.entered;
		if (opened === undefined) return null;
		const segs: { from: number; to: number; name: string }[] = [];
		for (let s = ctx.t - WINDOW; s <= ctx.t; s += 0.25) {
			const name = opened(s);
			if (name === null) continue;
			const last = segs.at(-1);
			if (last !== undefined && last.name === name && Math.abs(last.to - s) < 0.3) last.to = s + 0.25;
			else segs.push({ from: s, to: s + 0.25, name });
		}
		return <>{segs.map((seg) => <Bar key={seg.from} ctx={ctx} from={seg.from} to={Math.min(seg.to, ctx.t)} color={person.color} label={seg.name} solid={false} />)}</>;
	}
	return (
		<>
			{roomSegments(plan, ctx.t).map((seg) =>
				seg.frame === null || (seg.to - seg.from < 0.8 && seg.to < ctx.t - 0.5) ? null : <Bar key={seg.from} ctx={ctx} from={seg.from} to={Math.min(seg.to, ctx.t)} color={person.color} label={seg.frame} solid={false} />,
			)}
		</>
	);
}

function AgentTape({ ctx, id }: { ctx: Ctx; id: MemberId }) {
	const plan = ctx.scene.agents.find((a) => a.owner === id);
	const person = PEOPLE[id];
	if (plan === undefined) return null;
	const lo = ctx.t - WINDOW;
	return (
		<>
			{plan.spans
				.filter((s) => s.to > lo && s.from < ctx.t)
				.map((s) => {
					if (s.verb === "shot") {
						const x = xOf(Math.min(s.from, ctx.t), ctx.t) - TAPE_X;
						return <span key={s.from} className="absolute top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full" style={{ left: x, background: person.color }} />;
					}
					return (
						<Bar key={s.from} ctx={ctx} from={s.from} to={Math.min(s.to, ctx.t)} color={person.color} label={s.verb === "read" ? s.frame : s.frame} solid={s.verb === "write"} />
					);
				})}
			{plan.writes
				.filter((w) => w.at > lo && w.at <= ctx.t)
				.map((w) => (
					<span key={w.at} className="absolute top-[3px] bottom-[3px] w-px" style={{ left: xOf(w.at, ctx.t) - TAPE_X, background: person.color }} />
				))}
		</>
	);
}

function Bar({ ctx, from, to, color, label, solid }: { ctx: Ctx; from: number; to: number; color: string; label: string; solid: boolean }) {
	const x0 = Math.max(0, xOf(from, ctx.t) - TAPE_X);
	const x1 = xOf(to, ctx.t) - TAPE_X;
	const w = x1 - x0;
	if (w <= 0) return null;
	return (
		<div
			className="absolute top-[3px] bottom-[3px] flex items-center overflow-hidden rounded-[3px] pl-1.5"
			style={{
				left: x0,
				width: w,
				background: solid ? `${color}38` : `${color}14`,
				boxSizing: "border-box",
				borderLeft: `2px solid ${color}`,
			}}
		>
			{w > 70 ? <span className="truncate whitespace-nowrap text-[10px] leading-none text-text/80 [font-family:var(--font-mono)]">{label}</span> : null}
		</div>
	);
}

/* coming back: the tape kept recording, and replay plays the gap back at speed */

const REPLAY_FROM = 5.2;
const REPLAY_LEN = 8;

function replayPhase(t: number): number {
	if (t < REPLAY_FROM) return 0;
	if (t < REPLAY_FROM + 0.4) return easeOut((t - REPLAY_FROM) / 0.4);
	if (t < REPLAY_FROM + REPLAY_LEN + 0.6) return 1;
	return 1 - easeOut(clamp((t - REPLAY_FROM - REPLAY_LEN - 0.6) / 0.5));
}

function playhead(t: number): number {
	return clamp((t - REPLAY_FROM - 0.3) / REPLAY_LEN);
}

function ReplayButton({ ctx }: { ctx: Ctx }) {
	const away = ctx.scene.away;
	if (away === undefined) return null;
	const on = ctx.t >= REPLAY_FROM && ctx.t < REPLAY_FROM + REPLAY_LEN + 0.6;
	const minute = Math.round(playhead(ctx.t) * away.minutes);
	return (
		<div className="absolute top-0.5 flex items-center gap-2" style={{ left: PAD_X }}>
			<span className={cn("flex h-5 items-center rounded-xs px-1.5 type-detail", on ? "bg-thread text-on-thread" : "bg-raised text-text")}>
				{on ? `replaying ${away.minutes - minute} min ago` : `replay ${away.minutes} min`}
			</span>
		</div>
	);
}

function ReplayTape({ ctx, lane }: { ctx: Ctx; lane: Lane }) {
	const away = ctx.scene.away;
	if (away === undefined) return null;
	const person = PEOPLE[lane.id];
	const head = playhead(ctx.t);
	const x = (u: number) => u * TAPE_W;
	if (!lane.agent) {
		// people: present for the whole gap, except Mira who left near the end
		const present = lane.id === "you" ? null : lane.id === "mira" ? 0.74 : 1;
		if (present === null) return <div className="absolute top-[9px] h-px bg-border-raised" style={{ left: 0, width: x(1) }} />;
		return (
			<>
				<div className="absolute top-[3px] bottom-[3px] rounded-[3px]" style={{ left: 0, width: x(Math.min(present, head)), background: `${person.color}14`, borderLeft: `2px solid ${person.color}` }} />
				<span className="absolute top-0 bottom-0 w-px bg-text" style={{ left: x(head) }} />
			</>
		);
	}
	const mine = away.changes.filter((c) => c.owner === lane.id);
	return (
		<>
			{mine.map((c) => {
				const from = Math.max(0, c.at - 0.09);
				const until = Math.min(c.at, head);
				if (until <= from) return null;
				return (
					<div
						key={c.frame}
						className="absolute top-[3px] bottom-[3px] flex items-center overflow-hidden rounded-[3px] pl-1.5"
						style={{ left: x(from), width: x(until - from), background: `${person.color}38`, borderLeft: `2px solid ${person.color}` }}
					>
						<span className="truncate whitespace-nowrap text-[10px] leading-none text-text/80 [font-family:var(--font-mono)]">
							{c.frame} · {c.writes}
						</span>
					</div>
				);
			})}
			<span className="absolute top-0 bottom-0 w-px bg-text" style={{ left: x(head) }} />
		</>
	);
}

/** on the canvas: the frames the hovered or followed row is touching, outlined in its colour */
function Field({ ctx }: { ctx: Ctx }) {
	const marks: { f: FrameBox; person: Person; ink: number }[] = [];
	const h = ctx.hovered;
	if (h !== null && (h.kind === "agent" || h.kind === "person")) {
		const person = PEOPLE[h.id];
		const name = h.kind === "agent" ? ctx.agents.find((a) => a.person.id === h.id)?.frame?.name : ctx.people.find((p) => p.person.id === h.id)?.room?.name;
		if (name !== undefined) marks.push({ f: frame(name), person, ink: 1 });
	}
	const away = ctx.scene.away;
	if (away !== undefined && ctx.t >= REPLAY_FROM) {
		const head = playhead(ctx.t);
		for (const c of away.changes) {
			if (head < c.at) continue;
			const fresh = clamp(1 - (head - c.at) * 6);
			marks.push({ f: frame(c.frame), person: PEOPLE[c.owner], ink: 0.55 + 0.45 * fresh });
		}
	}
	return (
		<div className="pointer-events-none absolute inset-0">
			{marks.map((m) => {
				const b = ctx.box(m.f);
				return (
					<div
						key={`${m.f.name}-${m.person.id}`}
						className="absolute rounded-[10px]"
						style={{ left: b.x - 5, top: b.y - 5, width: b.w + 10, height: b.h + 10, border: `2px solid ${m.person.color}`, opacity: m.ink }}
					/>
				);
			})}
		</div>
	);
}

function Overlay({ ctx }: { ctx: Ctx }) {
	const followed = ctx.follow === null ? null : PEOPLE[ctx.follow.who];
	return (
		<>
			<Field ctx={ctx} />
			{followed === null ? null : (
				<div className="pointer-events-none absolute inset-x-0 bottom-0" style={{ top: PANEL_H, border: `2px solid ${followed.color}`, borderTop: "none" }} />
			)}
			<Strip ctx={ctx} />
		</>
	);
}

function aim(ctx: Ctx, target: Aim): Vec | null {
	if (target.kind === "control") return { x: PAD_X + 30, y: 14 };
	if (target.kind !== "person" && target.kind !== "agent") return null;
	const lane = lanesOf().lanes.find((one) => one.id === target.id && one.agent === (target.kind === "agent"));
	if (lane === undefined) return null;
	return { x: NOW_X + 70, y: lane.y + lane.h / 2 + 3 };
}

function labelStart(ctx: Ctx, f: FrameBox): ReactNode {
	const away = ctx.scene.away;
	if (away === undefined || ctx.t < REPLAY_FROM) return null;
	const c = away.changes.find((one) => one.frame === f.name);
	if (c === undefined || playhead(ctx.t) < c.at) return null;
	return <UnseenMark mark={c.fresh ? "new" : "changed"} />;
}

export const score: Take = {
	steer,
	overlay: (ctx) => <Overlay ctx={ctx} />,
	aim,
	labelStart,
	followChip: false,
};
