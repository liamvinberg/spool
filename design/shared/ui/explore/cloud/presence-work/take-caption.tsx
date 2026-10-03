import type { ReactNode } from "react";
import { cn } from "shared/lib/utils";
import { UnseenMark } from "shared/ui/spool/unseen-mark";
import {
	agentName,
	alpha,
	type Camera,
	clamp,
	easeOut,
	type FrameDef,
	frameRect,
	landed,
	MEMBERS,
	onScreen,
	PHONE_W,
	pathAt,
	phaseOf,
	plate,
	type Scene,
	toScreen,
	type Turn,
	typed,
	VIEW_H,
	type Who,
	type Write,
	edgeOf,
} from "./model";
import { AWAY_LOOKS as LOOKS, clockAt, followMix, type Look } from "./scenes";
import type { BlockMark } from "./screens";
import {
	type EdgeItem,
	EdgeMarks,
	FollowChip,
	FollowRing,
	FrameName,
	FramesLayer,
	Glyph,
	EdgePill,
	Pointer,
	PresenceWindow,
	useLoop,
	You,
} from "./stage";

/**
 * work-caption: the turn writes its own caption.
 *
 * Under a frame an agent is working on, the canvas sets the ask the way a figure
 * caption sits under a picture: the person's name and what they asked, in their own
 * words. Every write the agent lands is typed on under it as one machine line, the
 * same instant the block it changed lights in the frame, so the line and the block
 * are bound by time rather than by a leader. The caption is the agent's whole body.
 * It has no pointer, because where it is was never the interesting part.
 *
 * People keep a pointer. When yours is far from your agent, the pointer's name says
 * where the agent is (`claude on cart`), so the two halves of one person can always
 * be joined from either end.
 */

const LINGER = 5;

function captionLife(turn: Turn, t: number): number {
	if (t < turn.start) return 0;
	const open = easeOut((t - turn.start) / 0.35);
	if (t < turn.end + LINGER) return open;
	return clamp(1 - (t - turn.end - LINGER) / 0.5);
}

/** a later write by somebody else, on the same block of the same frame */
function replacedBy(turns: readonly Turn[], turn: Turn, write: Write, t: number): Turn | undefined {
	return turns.find(
		(other) =>
			other !== turn &&
			other.frame === turn.frame &&
			other.writes.some((candidate) => candidate.block === write.block && candidate.at > write.at && candidate.at <= t),
	);
}

function marksFor(scene: Scene, frame: FrameDef, t: number, residue = 0.32): Record<string, BlockMark> {
	const marks: Record<string, BlockMark> = {};
	for (const turn of scene.turns) {
		if (turn.frame !== frame.name) continue;
		const life = captionLife(turn, t);
		for (const write of landed(turn, t)) {
			const ink = plate(t - write.at);
			const prev = marks[write.block];
			const ring = residue * life;
			if (prev === undefined || ink > prev.ink || (ink === prev.ink && write.at > 0)) {
				marks[write.block] = { color: MEMBERS[turn.who].color, ink, ring };
			}
		}
	}
	return marks;
}

/* ---------- the caption ---------- */

function Caption({ scene, turn, t, width, compact = false }: { scene: Scene; turn: Turn; t: number; width: number; compact?: boolean }) {
	const member = MEMBERS[turn.who];
	const phase = phaseOf(turn, t);
	const writes = landed(turn, t);
	const last = writes.at(-1);
	return (
		<div className="flex flex-col gap-1.5" style={{ width }}>
			<p className={cn("type-label text-text", compact && "line-clamp-1")}>
				<span className="font-medium" style={{ color: member.color }}>
					{member.name}
				</span>{" "}
				{turn.ask}
			</p>
			{compact ? null : (
				<div className="flex flex-col">
					{writes.map((write) => {
						const age = t - write.at;
						const fresh = age < 1.4;
						const over = replacedBy(scene.turns, turn, write, t);
						return (
							<div key={write.at} className="flex min-h-4 items-start gap-1.5">
								<span
									className="mt-[5px] h-[6px] w-[6px] shrink-0 rounded-[1.5px]"
									style={{ background: over === undefined ? member.color : "transparent", boxShadow: `inset 0 0 0 1px ${member.color}` }}
								/>
								<span
									className="min-w-0 type-detail"
									style={{ color: over !== undefined ? "var(--color-muted)" : fresh ? "var(--color-text)" : "var(--color-muted)" }}
								>
									<span className={cn(over !== undefined && "line-through decoration-1")}>{typed(write.note, age)}</span>
									{over === undefined ? null : <span style={{ color: MEMBERS[over.who].color }}> {over.who} changed it</span>}
								</span>
							</div>
						);
					})}
				</div>
			)}
			<span className="flex items-center gap-1.5 text-muted type-detail">
				<Glyph who={turn.who} agent size={6} />
				{agentName(turn.who)}
				<span>·</span>
				{phase === "reading" ? (
					<span>reading {turn.frame}</span>
				) : phase === "writing" ? (
					<span className="flex items-center gap-1">
						writing
						{last !== undefined && t - last.at > 0.9 ? (
							<span className="inline-block h-[11px] w-[6px] rounded-[1px]" style={{ background: alpha(member.color, 0.75) }} />
						) : null}
					</span>
				) : (
					<span>
						done · {writes.length} {writes.length === 1 ? "change" : "changes"}
					</span>
				)}
			</span>
		</div>
	);
}

/** at a distance a caption cannot be read, so it says the newest line and nothing else */
function Ticker({ turn, t }: { turn: Turn; t: number }) {
	const writes = landed(turn, t);
	const last = writes.at(-1);
	const member = MEMBERS[turn.who];
	const age = last === undefined ? 99 : t - last.at;
	const showing = age < 2.8;
	return (
		<div className="flex flex-col items-start gap-1 whitespace-nowrap">
			<span className="flex items-center gap-1 type-detail" style={{ color: member.color }}>
				<Glyph who={turn.who} agent size={6} />
				{turn.hand === true ? member.name : turn.who}
				{writes.length > 0 ? <span className="text-muted">+{writes.length}</span> : null}
			</span>
			{last === undefined ? null : (
				<span
					className="rounded-xs bg-bg px-1 text-text type-detail"
					style={{ opacity: showing ? clamp((2.8 - age) / 0.4) : 0 }}
				>
					{typed(last.note, age)}
				</span>
			)}
		</div>
	);
}

/* ---------- the take ---------- */

export function CaptionTake({ scene }: { scene: Scene }) {
	const clock = useLoop(scene.duration, scene.poster);
	const t = clock.t;
	const cam = scene.camera(t);
	const away = scene.away;

	// a catch-up scene draws the canvas as it stands now; the story happened before the loop
	const story = away === undefined ? t : away.story;
	const looks = away === undefined ? [] : LOOKS;
	const seenAt = (frame: string) => looks.find((look) => look.frame === frame);

	const far = cam.k < 0.25;
	const following = scene.follow?.find((span) => t >= span.from && t < span.to);
	const mix = scene.name === "follow" ? followMix(t) : 0;

	const live = away === undefined ? scene.turns.filter((turn) => captionLife(turn, story) > 0) : scene.turns;
	const byFrame = new Map<string, Turn[]>();
	for (const turn of live) byFrame.set(turn.frame, [...(byFrame.get(turn.frame) ?? []), turn]);

	const header =
		following !== undefined ? (
			<FollowChip who="ana" agent={mix > 0.5} text={mix > 0.5 ? `following ${agentName("ana")}` : "Following Ana"} />
		) : away !== undefined ? (
			<span className="flex h-7 items-center gap-2 text-muted type-detail">
				<UnseenMark mark="changed" />
				{`${4 - looks.filter((look) => t >= look.done).length} frames changed since ${away.left}`}
			</span>
		) : undefined;

	const offAgents = new Map<Who, OffAgent>();
	const offPeople = new Map<Who, { x: number; y: number; apart: string | undefined }>();

	return (
		<PresenceWindow scene={scene} clock={clock} header={header}>
			<FramesLayer
				scene={scene}
				cam={cam}
				t={story}
				marksFor={(frame) => {
					if (away !== undefined) return replayMarks(scene, frame, t);
					return marksFor(scene, frame, t);
				}}
				liftFor={(frame) => {
					const turns = byFrame.get(frame.name);
					if (turns === undefined) return undefined;
					if (away !== undefined) return undefined;
					const turn = turns.at(-1);
					if (turn === undefined) return undefined;
					const running = t < turn.end ? 1 : clamp(1 - (t - turn.end) / 1.2);
					return { color: MEMBERS[turn.who].color, ink: 0.85 * running * captionLife(turn, t) };
				}}
			/>

			{scene.frames.map((frame) => {
				const turns = byFrame.get(frame.name) ?? [];
				const r = frameRect(cam, frame);
				const visible = r.x < 1148 && r.x + r.w > 0 && r.y < VIEW_H && r.y + r.h > 0;
				if (!visible) {
					for (const turn of turns) {
						if (away !== undefined && t >= (seenAt(frame.name)?.done ?? 99)) continue;
						const c = toScreen(cam, frame.x + PHONE_W / 2, frame.y + 300);
						offAgents.set(turn.who, { turn, frame: frame.name, x: c.x, y: c.y });
					}
					return null;
				}
				const seen = seenAt(frame.name);
				const unseen = away !== undefined && turns.length > 0 && (seen === undefined || t < seen.done);
				const showTurns = away !== undefined ? turns.filter(() => seen === undefined || t < seen.done + 0.5) : turns;
				const fade = away !== undefined && seen !== undefined ? clamp(1 - (t - seen.done) / 0.5) : 1;
				return (
					<FrameCaption
						key={frame.name}
						scene={scene}
						frame={frame}
						cam={cam}
						turns={showTurns}
						t={story}
						far={far}
						fade={fade}
						unseen={unseen}
						entered={scene.entered !== undefined && scene.entered.frame === frame.name && t >= scene.entered.from && t < scene.entered.to}
						away={away === undefined ? undefined : { scene, look: seen, t }}
					/>
				);
			})}

			{scene.pointers.map((path) => {
				const at = pathAt(path.keys, t);
				const p = toScreen(cam, at.x, at.y);
				const mine = live.filter((turn) => turn.who === path.who && turn.hand !== true && phaseOf(turn, story) !== "done").at(-1);
				let apart: string | undefined;
				if (mine !== undefined) {
					const frame = scene.frames.find((candidate) => candidate.name === mine.frame);
					if (frame !== undefined) {
						const fr = frameRect(cam, frame);
						const dx = Math.max(fr.x - p.x, 0, p.x - (fr.x + fr.w));
						const dy = Math.max(fr.y - p.y, 0, p.y - (fr.y + fr.h));
						if (Math.hypot(dx, dy) > Math.max(60, fr.w * 0.5)) apart = `${MEMBERS[path.who].engine} on ${mine.frame}`;
					}
				}
				if (!onScreen(p.x, p.y, 4)) {
					offPeople.set(path.who, { x: p.x, y: p.y, apart });
					return null;
				}
				return (
					<Pointer key={path.who} who={path.who} x={p.x} y={p.y}>
						{apart === undefined ? null : <span className="type-detail opacity-70">{apart}</span>}
					</Pointer>
				);
			})}

			{scene.you === undefined ? null : <You scene={scene} cam={cam} t={t} />}

			<EdgeMarks items={edgeItems(offAgents, offPeople, story, away?.left)} />

			{following === undefined ? null : <FollowRing color={MEMBERS.ana.color} ink={0.9} />}
		</PresenceWindow>
	);
}

function FrameCaption({
	scene,
	frame,
	cam,
	turns,
	t,
	far,
	fade,
	unseen,
	entered,
	away,
}: {
	scene: Scene;
	frame: FrameDef;
	cam: Camera;
	turns: readonly Turn[];
	t: number;
	far: boolean;
	fade: number;
	unseen: boolean;
	entered: boolean;
	away: { scene: Scene; look: Look | undefined; t: number } | undefined;
}) {
	const r = frameRect(cam, frame);
	const head = turns.at(-1);
	const place = captionAt(r, turns, entered);
	return (
		<>
			<FrameName frame={frame} cam={cam} tone={head === undefined ? "muted" : "text"} entered={entered}>
				{unseen ? <UnseenMark mark="changed" /> : null}
				{head === undefined || far ? null : (
					<span className="ml-auto flex items-center gap-2.5" style={{ opacity: fade }}>
						{turns.map((turn) => (
							<span key={turn.id} className="flex items-center gap-1 type-detail" style={{ color: MEMBERS[turn.who].color }}>
								<Glyph who={turn.who} agent={turn.hand !== true} size={6} />
								{turn.hand === true ? MEMBERS[turn.who].name : turn.who}
							</span>
						))}
					</span>
				)}
			</FrameName>
			{turns.length === 0 ? null : far ? (
				<div className="pointer-events-none absolute" style={{ left: r.x, top: r.y + r.h + 6 }}>
					{turns.map((turn) => (
						<Ticker key={turn.id} turn={turn} t={t} />
					))}
				</div>
			) : (
				<div
					className="pointer-events-none absolute flex flex-col gap-3"
					style={{ left: place.left, top: place.top, opacity: fade }}
				>
					{turns.map((turn) =>
						away !== undefined ? (
							<AwayCaption key={turn.id} scene={away.scene} turn={turn} t={away.t} look={away.look} width={Math.max(r.w + 30, 200)} />
						) : (
							<div key={turn.id} style={{ opacity: captionLifeOf(turn, t) }}>
								{turn.hand === true ? (
									<HandLine turn={turn} t={t} />
								) : (
									<Caption scene={scene} turn={turn} t={t} width={Math.max(r.w + 30, 200)} compact={place.compact && phaseOf(turn, t) === "done"} />
								)}
							</div>
						),
					)}
				</div>
			)}
		</>
	);
}

const captionLifeOf = captionLife;

/**
 * Under the frame, where a caption belongs, unless the frame is so big on screen that
 * the caption would fall off the bottom: then it stands in the gutter beside the frame,
 * level with its top, on whichever side has the room.
 */
function captionAt(
	r: { x: number; y: number; w: number; h: number },
	turns: readonly Turn[],
	entered: boolean,
): { left: number; top: number; compact: boolean } {
	const need = turns.reduce((sum, turn) => sum + 70 + turn.writes.length * 18, 0);
	const below = { left: r.x, top: r.y + r.h + 12 };
	if (below.top + need < VIEW_H - 96) return { ...below, compact: false };
	// a frame you are inside owns the gutter beside it; anywhere else the gutter is a neighbour's
	if (entered) {
		const right = 1148 - (r.x + r.w);
		return right >= 300 ? { left: r.x + r.w + 28, top: r.y, compact: false } : { left: Math.max(12, r.x - 300), top: r.y, compact: false };
	}
	return { ...below, compact: true };
}

function HandLine({ turn, t }: { turn: Turn; t: number }) {
	const member = MEMBERS[turn.who];
	const write = turn.writes[0];
	return (
		<span className="flex items-center gap-1.5 type-detail" style={{ color: member.color }}>
			<Glyph who={turn.who} agent={false} size={6} />
			{member.name}
			<span className="text-text">{write === undefined ? "" : typed(write.note, t - write.at)}</span>
		</span>
	);
}

/* ---------- coming back ---------- */

/** while you look, the frame plays its writes back in order, each one lit as its line lights */
function replayMarks(scene: Scene, frame: FrameDef, t: number): Record<string, BlockMark> {
	const look = LOOKS.find((candidate) => candidate.frame === frame.name);
	const marks: Record<string, BlockMark> = {};
	for (const turn of scene.turns) {
		if (turn.frame !== frame.name) continue;
		turn.writes.forEach((write, index) => {
			const step = look === undefined ? -1 : look.from + 0.3 + index * 0.65;
			const ink = look === undefined ? 0 : plate(t - step);
			const ring = look === undefined || t < look.done ? 0.38 : clamp(0.38 * (1 - (t - look.done) / 0.5));
			marks[write.block] = { color: MEMBERS[turn.who].color, ink: Math.max(ink, marks[write.block]?.ink ?? 0), ring };
		});
	}
	return marks;
}

function AwayCaption({ scene, turn, t, look, width }: { scene: Scene; turn: Turn; t: number; look: Look | undefined; width: number }) {
	const member = MEMBERS[turn.who];
	const first = turn.writes[0];
	const last = turn.writes.at(-1);
	return (
		<div className="flex flex-col gap-1.5" style={{ width }}>
			{turn.hand === true ? (
				<p className="type-label text-text">
					<span className="font-medium" style={{ color: member.color }}>
						{member.name}
					</span>{" "}
					changed a word by hand.
				</p>
			) : (
				<p className="type-label text-text">
					<span className="font-medium" style={{ color: member.color }}>
						{member.name}
					</span>{" "}
					{turn.ask}
				</p>
			)}
			<div className="flex flex-col">
				{turn.writes.map((write, index) => {
					const step = look === undefined ? 99 : look.from + 0.3 + index * 0.65;
					const lit = t >= step && t < step + 1.4;
					return (
						<div key={write.at} className="flex min-h-4 items-start gap-1.5">
							<span className="mt-[5px] h-[6px] w-[6px] shrink-0 rounded-[1.5px]" style={{ background: member.color, opacity: lit ? 1 : 0.5 }} />
							<span className="type-detail" style={{ color: lit ? "var(--color-text)" : "var(--color-muted)" }}>
								{write.note}
							</span>
						</div>
					);
				})}
			</div>
			<span className="flex items-center gap-1.5 text-muted type-detail">
				<Glyph who={turn.who} agent={turn.hand !== true} size={6} />
				{turn.hand === true ? "by hand" : agentName(turn.who)}
				<span>·</span>
				{first === undefined || last === undefined ? null : (
					<span>
						{clockAt(scene, first.at)}
						{first === last ? "" : `–${clockAt(scene, last.at)}`}
					</span>
				)}
			</span>
		</div>
	);
}

/* ---------- off screen ---------- */

interface OffAgent {
	readonly turn: Turn;
	readonly frame: string;
	readonly x: number;
	readonly y: number;
}

/**
 * One mark per person at the edge. A person and their agent off the same edge share
 * it, because that is one fact about the canvas: Cleo and her work are both over
 * there. Apart, each gets its own, and the person's says where the agent went.
 */
function edgeItems(
	agents: ReadonlyMap<Who, OffAgent>,
	people: ReadonlyMap<Who, { x: number; y: number; apart: string | undefined }>,
	story: number,
	left: string | undefined,
): EdgeItem[] {
	const items: EdgeItem[] = [];
	const work = (agent: OffAgent) => {
		const writes = landed(agent.turn, story);
		const last = writes.at(-1);
		if (last === undefined) return <span className="text-muted type-detail">reading</span>;
		if (left !== undefined) return <span className="text-text type-detail">{writes.length} changes since {left}</span>;
		return <span className="text-text type-detail">{typed(last.note, story - last.at)}</span>;
	};
	for (const [who, agent] of agents) {
		const person = people.get(who);
		const together = person !== undefined && edgeOf(person.x, person.y, 14).side === edgeOf(agent.x, agent.y, 14).side;
		const color = MEMBERS[who].color;
		items.push({
			key: `agent-${who}`,
			x: agent.x,
			y: agent.y,
			height: together ? 62 : 46,
			node: (side) => (
				<EdgePill side={side} color={color}>
					{together ? (
						<span className="flex items-center gap-1.5 type-caption" style={{ color }}>
							<Glyph who={who} agent={false} size={6} />
							{MEMBERS[who].name}
						</span>
					) : null}
					<span className="flex items-center gap-1.5 type-detail" style={{ color }}>
						<Glyph who={who} agent size={6} />
						{agentName(who)} on {agent.frame}
					</span>
					{work(agent)}
				</EdgePill>
			),
		});
	}
	for (const [who, person] of people) {
		const agent = agents.get(who);
		if (agent !== undefined && edgeOf(person.x, person.y, 14).side === edgeOf(agent.x, agent.y, 14).side) continue;
		const color = MEMBERS[who].color;
		items.push({
			key: `person-${who}`,
			x: person.x,
			y: person.y,
			height: person.apart === undefined ? 28 : 46,
			node: (side) => (
				<EdgePill side={side} color={color}>
					<span className="flex items-center gap-1.5 type-caption" style={{ color }}>
						<Glyph who={who} agent={false} size={6} />
						{MEMBERS[who].name}
					</span>
					{person.apart === undefined ? null : <span className="text-muted type-detail">{person.apart}</span>}
				</EdgePill>
			),
		});
	}
	return items;
}
