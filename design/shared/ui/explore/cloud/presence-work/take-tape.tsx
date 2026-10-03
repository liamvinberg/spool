import { cn } from "shared/lib/utils";
import { CanvasTools } from "shared/ui/spool/canvas-tools";
import { UnseenMark } from "shared/ui/spool/unseen-mark";
import {
	agentName,
	alpha,
	clamp,
	easeInOut,
	easeOut,
	type FrameDef,
	frameRect,
	landed,
	lerp,
	MEMBERS,
	onScreen,
	PHONE_H,
	PHONE_W,
	pathAt,
	plate,
	type Scene,
	toScreen,
	type Turn,
	typed,
	VIEW_H,
	type Who,
} from "./model";
import { clockAt, followMix } from "./scenes";
import type { BlockMark } from "./screens";
import {
	type EdgeItem,
	EdgeMarks,
	EdgePill,
	FollowChip,
	FollowRing,
	FrameName,
	FramesLayer,
	Glyph,
	Pointer,
	PresenceWindow,
	useLoop,
	You,
} from "./stage";

/**
 * work-tape: the canvas keeps a tape.
 *
 * A strip along the foot of the canvas runs one lane per person, and time runs along
 * it with now at the right edge. Each lane is a pair: the person's line says where their
 * pointer is, the agent's line says which frame it holds, so Ana on `welcome` and her
 * claude on `cart` are one row read left to right instead of two marks 3,000px apart.
 * Along the lane the turn is a bar titled with the ask, and every write is a tick with
 * its line written after it. The tick lands in the same instant the block lights on the
 * canvas, which is the whole of the link between the two.
 *
 * Because the tape is time, coming back is pressing play: the canvas rewinds to where
 * you left it and rebuilds as the playhead crosses each tick.
 */

const HEAD_W = 214;
const LANE_H = 44;
/** where the run sits in its lane, under the ask that titles it */
const BAR_Y = 26;
const RULER_H = 26;
const WINDOW = 18;
const LEAD = 1.2;

interface Lane {
	readonly who: Who;
	readonly turns: readonly Turn[];
	readonly hand: boolean;
}

function lanesOf(scene: Scene): Lane[] {
	const order: Who[] = [];
	for (const turn of [...scene.turns].sort((a, b) => a.start - b.start)) if (!order.includes(turn.who)) order.push(turn.who);
	return order.map((who) => {
		const turns = scene.turns.filter((turn) => turn.who === who);
		return { who, turns, hand: turns.every((turn) => turn.hand === true) };
	});
}

/** the frame a world point is over or nearest, in the machine's words */
function nearestFrame(scene: Scene, x: number, y: number): string {
	let best = "";
	let bestD = Number.POSITIVE_INFINITY;
	for (const frame of scene.frames) {
		const dx = Math.max(frame.x - x, 0, x - (frame.x + PHONE_W));
		const dy = Math.max(frame.y - y, 0, y - (frame.y + PHONE_H));
		const d = Math.hypot(dx, dy);
		if (d < bestD) {
			bestD = d;
			best = frame.name;
		}
	}
	return bestD > 900 ? "canvas" : best;
}

function marksFor(scene: Scene, frame: FrameDef, t: number, from = Number.NEGATIVE_INFINITY): Record<string, BlockMark> {
	const marks: Record<string, BlockMark> = {};
	for (const turn of scene.turns) {
		if (turn.frame !== frame.name) continue;
		for (const write of landed(turn, t)) {
			if (write.at < from) continue;
			const ink = plate(t - write.at);
			const prev = marks[write.block];
			if (prev === undefined || ink >= prev.ink) marks[write.block] = { color: MEMBERS[turn.who].color, ink };
		}
	}
	return marks;
}

/* ---------- the tape ---------- */

function Tape({
	scene,
	lanes,
	t,
	span,
	head,
	ruler,
	lit,
	pointerAt,
	focus,
}: {
	scene: Scene;
	lanes: readonly Lane[];
	/** the playhead, in story time */
	t: number;
	/** the stretch of time the track shows */
	span: readonly [number, number];
	/** draw only what has happened by here */
	head: number;
	ruler: (time: number) => string;
	/** which line of a lane is being followed */
	lit?: { who: Who; agent: boolean } | undefined;
	pointerAt: (who: Who) => string | undefined;
	focus?: string | undefined;
}) {
	const height = RULER_H + lanes.length * LANE_H + 10;
	return (
		<div className="absolute inset-x-0 bottom-0 z-20 flex border-border border-t bg-bg" style={{ height }}>
			<div className="flex shrink-0 flex-col border-border border-r" style={{ width: HEAD_W }}>
				<div style={{ height: RULER_H }} />
				{lanes.map((lane) => {
					const member = MEMBERS[lane.who];
					const turn = lane.turns.filter((candidate) => candidate.start <= head).at(-1);
					const running = turn !== undefined && head < turn.end;
					const where = pointerAt(lane.who);
					const dim = focus !== undefined && turn?.frame !== focus;
					return (
						<div key={lane.who} className="flex flex-col justify-center px-3" style={{ height: LANE_H, opacity: dim ? 0.45 : 1 }}>
							{lane.hand ? null : (
								<span
									className={cn("-mx-1.5 flex items-center gap-1.5 rounded-xs px-1.5 type-detail")}
									style={{
										color: member.color,
										background: lit?.who === lane.who && lit.agent ? alpha(member.color, 0.16) : undefined,
									}}
								>
									<Glyph who={lane.who} agent size={6} />
									<span className="truncate">{agentName(lane.who)}</span>
									<span className="ml-auto text-muted">{turn === undefined ? "idle" : running ? turn.frame : "done"}</span>
								</span>
							)}
							<span
								className="-mx-1.5 flex items-center gap-1.5 rounded-xs px-1.5 type-detail"
								style={{ background: lit?.who === lane.who && !lit.agent ? alpha(member.color, 0.16) : undefined }}
							>
								<Glyph who={lane.who} agent={false} size={6} />
								<span className="font-sans text-[11px] text-text">{member.name}</span>
								<span className="ml-auto text-muted">{where ?? "away"}</span>
							</span>
						</div>
					);
				})}
			</div>
			<Track scene={scene} lanes={lanes} t={t} span={span} head={head} ruler={ruler} focus={focus} />
		</div>
	);
}

function Track({
	scene,
	lanes,
	t,
	span,
	head,
	ruler,
	focus,
}: {
	scene: Scene;
	lanes: readonly Lane[];
	t: number;
	span: readonly [number, number];
	head: number;
	ruler: (time: number) => string;
	focus?: string | undefined;
}) {
	const W = 1148 - HEAD_W - 24;
	const x = (time: number) => ((time - span[0]) / (span[1] - span[0])) * W;
	const ticks: number[] = [];
	const every = span[1] - span[0] > 24 ? 5 : 2;
	for (let time = Math.ceil(span[0] / every) * every; time <= span[1]; time += every) if (Math.abs(time - t) > every * 0.4) ticks.push(time);
	// two writes from different lanes on one block of one frame, joined on the tape
	const joins: { a: [number, number]; b: [number, number]; color: string }[] = [];
	lanes.forEach((lane, li) => {
		for (const turn of lane.turns) {
			for (const write of turn.writes) {
				if (write.at > head) continue;
				lanes.forEach((other, oi) => {
					if (oi === li) return;
					for (const otherTurn of other.turns) {
						if (otherTurn.frame !== turn.frame) continue;
						for (const earlier of otherTurn.writes) {
							if (earlier.block === write.block && earlier.at < write.at) {
								joins.push({ a: [x(earlier.at), RULER_H + oi * LANE_H + BAR_Y], b: [x(write.at), RULER_H + li * LANE_H + BAR_Y], color: MEMBERS[lane.who].color });
							}
						}
					}
				});
			}
		}
	});
	return (
		<div className="relative min-w-0 flex-1 overflow-hidden">
			<div className="absolute inset-y-0 left-3" style={{ width: W }}>
				{ticks.map((time) => (
					<span key={time} className="absolute top-0 flex flex-col items-start" style={{ left: x(time) }}>
						<span className="h-1.5 w-px bg-border-raised" />
						<span className="-translate-x-1/2 text-muted/70 type-detail">{ruler(time)}</span>
					</span>
				))}
				<svg className="pointer-events-none absolute inset-0 overflow-visible" width={W} height="100%" aria-hidden="true">
					{joins.map((join, index) => (
						<path
							key={index}
							d={`M${join.a[0]} ${join.a[1]} C${join.a[0] + 30} ${join.a[1]}, ${join.b[0] - 30} ${join.b[1]}, ${join.b[0]} ${join.b[1]}`}
							fill="none"
							stroke={join.color}
							strokeWidth="1"
							strokeDasharray="3 3"
							opacity="0.8"
						/>
					))}
				</svg>
				{lanes.map((lane, li) => (
					<div key={lane.who} className="absolute inset-x-0" style={{ top: RULER_H + li * LANE_H, height: LANE_H }}>
						{lane.turns.map((turn, ti) => {
							if (turn.start > head) return null;
							const color = MEMBERS[lane.who].color;
							const a = x(Math.max(turn.start, span[0] - 1));
							const b = x(Math.min(turn.end, head));
							const first = turn.writes[0];
							const readTo = x(Math.min(first?.at ?? turn.end, head));
							const dim = focus !== undefined && turn.frame !== focus;
							const writes = turn.writes.filter((write) => write.at <= head);
							const nextTurn = lane.turns[ti + 1];
							const askRoom = (nextTurn === undefined || nextTurn.start > head ? W + 60 : x(nextTurn.start)) - Math.max(a, 0) - 12;
							return (
								<div key={turn.id} className="absolute inset-0" style={{ opacity: dim ? 0.4 : 1 }}>
									{/* the ask titles the run; reading is dotted, writing solid */}
									{turn.hand === true ? null : (
										<span
											className="absolute top-0 truncate whitespace-nowrap text-[12px] text-text leading-4"
											style={{ left: Math.max(a, 0), maxWidth: Math.max(0, askRoom) }}
										>
											{turn.ask}
										</span>
									)}
									<span className="absolute h-px" style={{ top: BAR_Y, left: a, width: Math.max(0, readTo - a), backgroundImage: `linear-gradient(90deg, ${color} 50%, transparent 0)`, backgroundSize: "4px 1px" }} />
									<span className="absolute h-[2px]" style={{ top: BAR_Y - 0.5, left: readTo, width: Math.max(0, b - readTo), background: color }} />
									{writes.map((write, wi) => {
										const age = head - write.at;
										const next = writes[wi + 1];
										const room = (next === undefined ? W + 60 : x(next.at)) - x(write.at) - 16;
										return (
											<span key={write.at} className="absolute flex items-center" style={{ left: x(write.at) - 3.5, top: BAR_Y - 8, height: 16 }}>
												<span
													className="h-[7px] w-[7px] shrink-0 rounded-[1.5px]"
													style={{ background: color, transform: `scale(${lerp(1.8, 1, easeOut(age / 0.35))})` }}
												/>
												<span
													className="ml-1 truncate whitespace-nowrap bg-bg px-1 type-detail"
													style={{ maxWidth: Math.max(0, room), color: age < 1.5 ? "var(--color-text)" : "var(--color-muted)" }}
												>
													{typed(write.note, age)}
												</span>
											</span>
										);
									})}
								</div>
							);
						})}
					</div>
				))}
				<span className="absolute top-0 bottom-0 w-px bg-text/70" style={{ left: x(t) }} />
				<span className="-translate-x-1/2 absolute top-[3px] rounded-xs bg-text px-1 text-bg type-detail" style={{ left: x(t) }}>
					{ruler(t)}
				</span>
			</div>
		</div>
	);
}

/* ---------- the take ---------- */

/** coming back on the tape is one gesture rather than a tour of frames */
const REPLAY_BEATS = [
	{ at: 0, label: "you come back after 42 minutes" },
	{ at: 1.6, label: "the canvas rewinds to 13:10 and plays forward" },
	{ at: 13.6, label: "caught up at 13:52" },
] as const;

export function TapeTake({ scene }: { scene: Scene }) {
	const clock = useLoop(scene.duration, scene.poster);
	const t = clock.t;
	const cam = scene.camera(t);
	const away = scene.away;
	const lanes = lanesOf(scene);
	const tapeH = RULER_H + lanes.length * LANE_H + 10;

	// coming back: hold on now, rewind to when you left, play the 42 minutes in 12 seconds, hold on now
	const REPLAY_FROM = 1.6;
	const REPLAY_TO = 13.6;
	const story = away === undefined ? t : t < REPLAY_FROM ? away.story : lerp(0, away.story, easeInOut((t - REPLAY_FROM) / (REPLAY_TO - REPLAY_FROM)));
	const replaying = away !== undefined && t >= REPLAY_FROM && t < REPLAY_TO;

	const following = scene.follow?.find((span) => t >= span.from && t < span.to);
	const mix = scene.name === "follow" ? followMix(t) : 0;
	const entered = scene.entered !== undefined && t >= scene.entered.from && t < scene.entered.to ? scene.entered.frame : undefined;

	const span: [number, number] = away === undefined ? [t - WINDOW, t + LEAD] : [-0.6, away.story + 0.6];
	const ruler = (time: number) => {
		if (away !== undefined) return clockAt(scene, clamp(time, 0, away.story));
		const ago = Math.round(t - time);
		return ago <= 0 ? "now" : `${ago}s`;
	};

	const pointerAt = (who: Who) => {
		const path = scene.pointers.find((candidate) => candidate.who === who);
		if (path === undefined) return who === "you" ? "here" : undefined;
		const at = pathAt(path.keys, t);
		return nearestFrame(scene, at.x, at.y);
	};

	const active = scene.turns.filter((turn) => story >= turn.start && story < turn.end + 1.5);

	const header =
		following !== undefined ? (
			<FollowChip who="ana" agent={mix > 0.5} text={mix > 0.5 ? `following ${agentName("ana")}` : "Following Ana"} />
		) : away !== undefined ? (
			<span className="flex h-7 items-center gap-2 text-muted type-detail">
				{replaying ? (
					<span className="text-text">replaying {away.left} to {away.back}</span>
				) : t < REPLAY_FROM ? (
					<>
						<UnseenMark mark="changed" />
						<span>4 frames changed since {away.left}</span>
					</>
				) : (
					<span>caught up</span>
				)}
			</span>
		) : undefined;

	const edge: EdgeItem[] = [];
	const visibleH = VIEW_H - tapeH;

	return (
		<PresenceWindow scene={away === undefined ? scene : { ...scene, beats: REPLAY_BEATS }} clock={clock} header={header} tool="none">
			<FramesLayer
				scene={scene}
				cam={cam}
				t={story}
				marksFor={(frame) => marksFor(scene, frame, story, away !== undefined && !replaying ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY)}
				liftFor={(frame) => {
					const turn = active.filter((candidate) => candidate.frame === frame.name && candidate.hand !== true).at(-1);
					if (turn === undefined) return undefined;
					const ink = story < turn.end ? easeOut((story - turn.start) / 0.3) : clamp(1 - (story - turn.end) / 1.5);
					return { color: MEMBERS[turn.who].color, ink: 0.85 * ink };
				}}
			/>

			{scene.frames.map((frame) => {
				const r = frameRect(cam, frame);
				const visible = r.x < 1148 && r.x + r.w > 0 && r.y < visibleH && r.y + r.h > 0;
				const turns = active.filter((turn) => turn.frame === frame.name);
				if (!visible) {
					const turn = turns.at(-1);
					if (turn !== undefined) {
						const c = toScreen(cam, frame.x + PHONE_W / 2, frame.y + 300);
						edge.push({
							key: `turn-${turn.id}`,
							x: c.x,
							y: Math.min(c.y, visibleH - 40),
							height: 30,
							node: (side) => (
								<EdgePill side={side} color={MEMBERS[turn.who].color}>
									<span className="flex items-center gap-1.5 type-detail" style={{ color: MEMBERS[turn.who].color }}>
										<Glyph who={turn.who} agent size={6} />
										{frame.name}
									</span>
								</EdgePill>
							),
						});
					}
					return null;
				}
				return (
					<FrameName key={frame.name} frame={frame} cam={cam} tone={turns.length > 0 ? "text" : "muted"} entered={entered === frame.name}>
						{turns.length === 0 ? null : (
							<span className="ml-auto flex items-center gap-1">
								{turns.map((turn) => (
									<Glyph key={turn.id} who={turn.who} agent={turn.hand !== true} size={6} />
								))}
							</span>
						)}
					</FrameName>
				);
			})}

			{scene.pointers.map((path) => {
				const at = pathAt(path.keys, t);
				const p = toScreen(cam, at.x, at.y);
				if (!onScreen(p.x, p.y, 4) || p.y > visibleH - 8) {
					edge.push({
						key: `person-${path.who}`,
						x: p.x,
						y: Math.min(p.y, visibleH - 40),
						height: 30,
						node: (side) => (
							<EdgePill side={side} color={MEMBERS[path.who].color}>
								<span className="flex items-center gap-1.5 type-caption" style={{ color: MEMBERS[path.who].color }}>
									<Glyph who={path.who} agent={false} size={6} />
									{MEMBERS[path.who].name}
								</span>
							</EdgePill>
						),
					});
					return null;
				}
				return <Pointer key={path.who} who={path.who} x={p.x} y={p.y} />;
			})}

			{away === undefined && scene.you !== undefined ? <You scene={scene} cam={cam} t={t} /> : null}

			<div className="pointer-events-none absolute inset-x-0 top-0" style={{ height: visibleH }}>
				<EdgeMarks items={edge.map((item) => ({ ...item }))} />
				<div className="pointer-events-auto">
					<CanvasTools tool="select" />
				</div>
			</div>

			<Tape
				scene={scene}
				lanes={lanes}
				t={story}
				span={span}
				head={away === undefined ? t : story}
				ruler={ruler}
				lit={following === undefined ? undefined : { who: "ana", agent: mix > 0.5 }}
				pointerAt={pointerAt}
				focus={entered}
			/>

			{following === undefined ? null : <FollowRing color={MEMBERS.ana.color} ink={0.9} />}
		</PresenceWindow>
	);
}
