import type { ReactNode } from "react";
import type { PageRow } from "shared/ui/spool/canvas-chrome";
import { type Mark as Unseen, UnseenMark } from "shared/ui/spool/unseen-mark";
import {
	AgentRing,
	type Box,
	type Ctx,
	edgePoint,
	PersonDisc,
	RemotePointer,
	type Take,
} from "shared/ui/explore/cloud/presence-wild/stage";
import {
	type Aim,
	agentName,
	BASE,
	clamp,
	easeOut,
	FRAMES,
	type FrameBox,
	frame,
	type Key,
	on,
	PEOPLE,
	type Person,
	type Scene,
	type Vec,
	type View,
	VIEWPORT,
	views,
} from "shared/ui/explore/cloud/presence-wild/world";

/**
 * Rooms. On a canvas where agents do the writing, where a pointer sits is mostly noise;
 * what a teammate needs is who is in which frame. So a frame is a room and presence is
 * its occupancy: people as solid discs and agents as hollow rings on the frame's name
 * row, which already holds its size at every zoom. Nobody's pointer is drawn on the open
 * field. Inside a frame you have opened, the people in it with you show their pointers,
 * because in there pointing means something.
 *
 * Off screen is answered twice: a plate on the viewport's edge pointing at each busy
 * room, and the pages rail, which lists every room with who is in it, the way a voice
 * app lists channels.
 */

interface Placed {
	readonly person: Person;
	readonly agent: boolean;
	readonly x: number;
	readonly y: number;
	readonly size: number;
	readonly dim: boolean;
	readonly working: boolean;
	readonly frame: string;
}

interface Plate {
	readonly frame: FrameBox;
	readonly x: number;
	readonly y: number;
	readonly w: number;
	readonly angle: number;
	readonly marks: readonly Placed[];
	readonly note: string | null;
}

const PLATE_H = 26;
/** Fragment Mono at 11px advances 0.6em */
const CHAR = 6.6;

function plateWidth(name: string, marks: number, note: string | null): number {
	return 6 + 12 + 8 + name.length * CHAR + 8 + marks * 17 - 3 + (note === null ? 0 : 8 + note.length * CHAR) + 10;
}

function occupants(ctx: Ctx, name: string) {
	const people = ctx.people.filter((p) => p.pointer !== null && p.room?.name === name);
	const agents = ctx.agents.filter((a) => a.frame?.name === name);
	return { people, agents };
}

function markSize(b: Box): number {
	return b.w >= 100 ? 16 : 11;
}

function layout(ctx: Ctx): { marks: Placed[]; plates: Plate[] } {
	const marks: Placed[] = [];
	const loose: { frame: FrameBox; w: number; wall: string; at: Vec; angle: number; who: Omit<Placed, "x" | "y">[]; note: string | null }[] = [];
	const changed = awayChanges(ctx);
	for (const f of FRAMES) {
		const { people, agents } = occupants(ctx, f.name);
		const change = changed.find((c) => c.frame === f.name && c.shown && !c.seen);
		if (people.length === 0 && agents.length === 0 && change === undefined) continue;
		const b = ctx.box(f);
		const size = markSize(b);
		const who: Omit<Placed, "x" | "y">[] = [
			...people.map((p) => ({
				person: p.person,
				agent: false,
				size,
				dim: p.pointer === null || !inside(ctx, p.pointer, f),
				working: false,
				frame: f.name,
			})),
			...agents.map((a) => ({ person: a.person, agent: true, size, dim: false, working: a.verb !== null, frame: f.name })),
		];
		if (ctx.entered === f.name) continue;
		if (ctx.visible(b, -4)) {
			const right = b.x + Math.max(b.w, 60);
			const y = Math.max(12, b.y - 13);
			const step = size + 3;
			who.forEach((one, i) => marks.push({ ...one, x: right - (who.length - i - 0.5) * step, y }));
			continue;
		}
		const centre = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
		const edge = edgePoint(centre, 18);
		const note = change === undefined ? null : `${change.writes} writes`;
		const w = plateWidth(f.name, who.length, note);
		loose.push({ frame: f, w, wall: edge.wall, at: edge.at, angle: edge.angle, who: who.map((one) => ({ ...one, size: 14 })), note });
	}
	// plates on one wall stack along it rather than on top of each other
	const plates: Plate[] = [];
	for (const wall of ["top", "right", "bottom", "left"]) {
		const here = loose.filter((p) => p.wall === wall).sort((p, q) => (wall === "top" || wall === "bottom" ? p.at.x - q.at.x : p.at.y - q.at.y));
		let cursor = -Infinity;
		for (const p of here) {
			let x: number;
			let y: number;
			if (wall === "left" || wall === "right") {
				x = wall === "left" ? 12 : VIEWPORT.w - 12 - p.w;
				y = Math.max(p.at.y - PLATE_H / 2, cursor + 6, 12);
				y = Math.min(y, VIEWPORT.h - 84 - PLATE_H);
				cursor = y + PLATE_H;
			} else {
				y = wall === "top" ? 12 : VIEWPORT.h - 84 - PLATE_H;
				x = Math.max(p.at.x - p.w / 2, cursor + 6, 12);
				x = Math.min(x, VIEWPORT.w - 12 - p.w);
				cursor = x + p.w;
			}
			const nameEnd = x + 6 + 12 + 8 + p.frame.name.length * CHAR;
			const placed = p.who.map((one, i) => ({ ...one, x: nameEnd + 8 + 7 + i * 17, y: y + PLATE_H / 2 }));
			plates.push({ frame: p.frame, x, y, w: p.w, angle: p.angle, marks: placed, note: p.note });
		}
	}
	return { marks, plates };
}

function inside(ctx: Ctx, at: Vec, f: FrameBox): boolean {
	return at.x >= f.x - 40 && at.x <= f.x + f.w + 40 && at.y >= f.y - 40 && at.y <= f.y + f.h + 40 && ctx.t >= 0;
}

function MarkAt({ m, t }: { m: Placed; t: number }) {
	return (
		<div className="absolute top-0 left-0" style={{ transform: `translate(${m.x - m.size / 2}px, ${m.y - m.size / 2}px)` }}>
			{m.agent ? (
				<AgentRing person={m.person} size={m.size} turning={m.working ? t : undefined} />
			) : (
				<PersonDisc person={m.person} size={m.size} dim={m.dim} />
			)}
		</div>
	);
}

function Overlay({ ctx }: { ctx: Ctx }) {
	const { marks, plates } = layout(ctx);
	const enteredBox = ctx.entered === null ? null : frame(ctx.entered);
	return (
		<div className="pointer-events-none absolute inset-0">
			{/* inside a room you have opened, the others in it point at things */}
			{enteredBox === null
				? null
				: ctx.people
						.filter((p) => p.pointer !== null && inside(ctx, p.pointer, enteredBox))
						.map((p) => (p.pointer === null ? null : <RemotePointer key={p.person.id} person={p.person} at={ctx.at(p.pointer)} name={false} />))}
			{marks.map((m) => (
				<MarkAt key={`${m.frame}-${m.person.id}-${m.agent}`} m={m} t={ctx.t} />
			))}
			{plates.map((p) => (
				<div
					key={p.frame.name}
					className="absolute flex items-center gap-2 rounded-sm border border-border-raised bg-bg pr-2 pl-1.5"
					style={{ left: p.x, top: p.y, width: p.w, height: PLATE_H }}
				>
					<svg viewBox="0 0 12 12" className="h-3 w-3 shrink-0 text-muted" style={{ transform: `rotate(${p.angle}rad)` }} aria-hidden="true">
						<path d="M2 6h7.5M6.5 2.8 9.7 6 6.5 9.2" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
					</svg>
					<span className="whitespace-nowrap text-text type-detail">{p.frame.name}</span>
					<span className="flex shrink-0 items-center gap-[3px]">
						{p.marks.map((m) =>
							m.agent ? (
								<AgentRing key={`${m.person.id}-a`} person={m.person} size={14} turning={m.working ? ctx.t : undefined} />
							) : (
								<PersonDisc key={m.person.id} person={m.person} size={14} dim={m.dim} />
							),
						)}
					</span>
					{p.note === null ? null : <span className="whitespace-nowrap text-muted type-detail">{p.note}</span>}
				</div>
			))}
			<Hover ctx={ctx} marks={[...marks, ...plates.flatMap((p) => p.marks)]} />
			<AwayLayer ctx={ctx} />
		</div>
	);
}

/**
 * What a room says to someone who has just opened it while agents are at work in it, on
 * the label row beside the live chip. The people in it need no words: their pointers are
 * right there.
 */
function RoomNote({ ctx, f }: { ctx: Ctx; f: FrameBox }) {
	const agents = ctx.agents.filter((a) => a.frame?.name === f.name && a.verb !== null);
	if (agents.length === 0) return null;
	return (
		<span className="absolute top-0 left-[146px] flex h-[18px] items-center gap-3 whitespace-nowrap">
			{agents.map((a) => (
				<span key={a.person.id} className="flex items-center gap-1.5">
					<AgentRing person={a.person} size={14} turning={ctx.t} />
					<span className="text-muted type-detail">
						{agentName(a.person.id)} {a.verb === "write" ? "writing" : a.verb === "read" ? "reading" : "shooting"}
					</span>
				</span>
			))}
		</span>
	);
}

/** resting on a mark opens the pair: where this person is and where their agent is */
function Hover({ ctx, marks }: { ctx: Ctx; marks: readonly Placed[] }) {
	const h = ctx.hovered;
	if (h === null || (h.kind !== "person" && h.kind !== "agent")) return null;
	const m = marks.find((one) => one.person.id === h.id && one.agent === (h.kind === "agent"));
	if (m === undefined) return null;
	const p = ctx.people.find((one) => one.person.id === h.id);
	const a = ctx.agents.find((one) => one.person.id === h.id);
	const right = m.x > VIEWPORT.w - 320;
	return (
		<div
			className="absolute flex flex-col gap-1 rounded-sm border border-border-raised bg-bg px-2.5 py-2"
			style={{ left: right ? m.x - 290 : m.x - 10, top: m.y + 14, width: 280 }}
		>
			<div className="flex items-center gap-2">
				<PersonDisc person={m.person} size={16} />
				<span className="text-text type-label">{m.person.name}</span>
				<span className="ml-auto text-muted type-detail">{p?.room?.name ?? "not on this page"}</span>
			</div>
			{a === undefined || m.person.agent === null ? null : (
				<div className="flex items-center gap-2">
					<AgentRing person={m.person} size={16} turning={a.verb === null ? undefined : ctx.t} />
					<span className="text-text type-detail">{m.person.agent}</span>
					<span className="ml-auto text-muted type-detail">
						{a.frame === null ? "idle" : `${a.verb === "write" ? "writing" : a.verb === "read" ? "reading" : "shooting"} ${a.frame.name}`}
					</span>
				</div>
			)}
		</div>
	);
}

/* coming back: the rooms that changed say so on their own name row, and a walk visits them */

const ARRIVE = 1.3;
const WALK_FROM = 5.4;
const STOP = 1.7;

function stops(scene: Scene) {
	return [...(scene.away?.changes ?? [])].sort((a, b) => a.at - b.at);
}

function awayChanges(ctx: Ctx) {
	return stops(ctx.scene).map((c, i) => {
		const shownAt = ARRIVE + i * 0.22;
		const arrival = WALK_FROM + i * STOP + 0.8;
		return {
			...c,
			index: i,
			shown: ctx.t >= shownAt,
			shownAt,
			arrival,
			seen: ctx.t >= arrival + 0.6,
		};
	});
}

function steer(scene: Scene, t: number): View | null {
	if (scene.away === undefined || t < WALK_FROM) return null;
	const keys: Key<View>[] = [[WALK_FROM, BASE]];
	stops(scene).forEach((c, i) => {
		const at = WALK_FROM + i * STOP;
		keys.push([at + 0.8, on(c.frame, 0.6)], [at + STOP, on(c.frame, 0.6)]);
	});
	const end = WALK_FROM + stops(scene).length * STOP;
	keys.push([end + 1.4, BASE]);
	return views(keys)(t);
}

function AwayLayer({ ctx }: { ctx: Ctx }) {
	const away = ctx.scene.away;
	if (away === undefined) return null;
	const changes = awayChanges(ctx);
	const walking = ctx.t >= WALK_FROM;
	const current = changes.filter((c) => ctx.t >= c.arrival - 0.8).at(-1);
	const done = ctx.t >= WALK_FROM + changes.length * STOP;
	const u = easeOut(clamp((ctx.t - 1.6) / 0.3));
	return (
		<>
			{changes.map((c) => {
				if (!c.shown) return null;
				const b = ctx.box(frame(c.frame));
				if (!ctx.visible(b, -4)) return null;
				const grow = easeOut(clamp((ctx.t - c.shownAt) / 0.3));
				const fade = c.seen ? 1 - clamp((ctx.t - c.arrival - 0.6) / 0.4) : 1;
				return (
					<div
						key={c.frame}
						className="absolute flex items-center gap-1.5"
						style={{ left: b.x, top: b.y + b.h + 8, opacity: grow * Math.max(0.35, fade), transform: `translateY(${(1 - grow) * 4}px)` }}
					>
						<AgentRing person={personOf(c.owner)} size={b.w >= 100 ? 14 : 10} />
						<span className="text-muted type-detail">{b.w >= 100 ? `${c.writes} writes` : c.writes}</span>
					</div>
				);
			})}
			<div
				className="-translate-x-1/2 absolute top-3 left-1/2 flex h-8 items-center gap-3 rounded-sm border border-border-raised bg-bg pr-1 pl-3"
				style={{ opacity: done ? 1 - clamp((ctx.t - (WALK_FROM + changes.length * STOP)) / 0.4) : u }}
			>
				{walking && current !== undefined ? (
					<>
						<span className="text-muted type-detail">
							{current.index + 1} of {changes.length}
						</span>
						<span className="text-text type-detail">{current.frame}</span>
						<span className="flex items-center gap-1.5 pr-2">
							<AgentRing person={personOf(current.owner)} size={14} />
							<span className="text-muted type-detail">
								{agentName(current.owner)} · {current.writes} writes{current.fresh ? " · new" : ""}
							</span>
						</span>
					</>
				) : (
					<>
						<span className="text-muted type-detail">{away.minutes} min away</span>
						<span className="text-text type-detail">{changes.length} frames changed</span>
						<span className="flex h-6 items-center rounded-xs bg-raised px-2 text-text type-detail">walk</span>
					</>
				)}
			</div>
		</>
	);
}

function personOf(id: Person["id"]): Person {
	return PEOPLE[id];
}

function aim(ctx: Ctx, target: Aim): Vec | null {
	if (target.kind === "control") return { x: VIEWPORT.w / 2 + 128, y: 28 };
	if (target.kind !== "person" && target.kind !== "agent") return null;
	const { marks, plates } = layout(ctx);
	const all = [...marks, ...plates.flatMap((p) => p.marks)];
	const m = all.find((one) => one.person.id === target.id && one.agent === (target.kind === "agent"));
	return m === undefined ? null : { x: m.x + 2, y: m.y + 3 };
}

function labelEnd(ctx: Ctx, f: FrameBox, b: Box): ReactNode {
	if (ctx.entered === f.name) return <RoomNote ctx={ctx} f={f} />;
	const { people, agents } = occupants(ctx, f.name);
	const n = people.length + agents.length;
	if (n === 0) return null;
	return <span className="shrink-0" style={{ width: n * (markSize(b) + 3) }} />;
}

function labelStart(ctx: Ctx, f: FrameBox): ReactNode {
	const c = awayChanges(ctx).find((one) => one.frame === f.name);
	if (c === undefined || !c.shown || c.seen) return null;
	return <UnseenMark mark={c.fresh ? "new" : "changed"} />;
}

function pages(ctx: Ctx): readonly PageRow[] {
	const under: Record<string, ReactNode> = {};
	for (const f of FRAMES) {
		const { people, agents } = occupants(ctx, f.name);
		if (people.length === 0 && agents.length === 0) continue;
		const working = agents.find((a) => a.verb !== null);
		under[f.name] = (
			<div className="flex h-6 items-center gap-1 pl-[56px]">
				{people.map((p) => (
					<PersonDisc key={p.person.id} person={p.person} size={14} />
				))}
				{agents.map((a) => (
					<AgentRing key={a.person.id} person={a.person} size={14} turning={a.verb === null ? undefined : ctx.t} />
				))}
				{working === undefined ? null : (
					<span className="ml-1.5 truncate text-muted type-detail">{working.verb === "write" ? "writing" : working.verb === "read" ? "reading" : "shooting"}</span>
				)}
			</div>
		);
	}
	const unseen: Record<string, Unseen> = {};
	for (const c of awayChanges(ctx)) if (c.shown && !c.seen) unseen[c.frame] = c.fresh ? "new" : "changed";
	return [
		{ name: "app", frames: FRAMES.map((f) => f.name), active: true, open: true, under, unseen },
		{ name: "marketing", frames: ["landing", "pricing", "press"] },
		{ name: "explore", frames: ["loyalty-cards", "loyalty-stamps", "tipping"] },
	];
}

export const rooms: Take = {
	steer,
	labelStart,
	labelEnd,
	overlay: (ctx) => <Overlay ctx={ctx} />,
	aim,
	pages,
};

