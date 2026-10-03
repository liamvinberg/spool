import { Fragment } from "react";
import { type ActorId, agentLabel, colorOf, isAgent, ownerOf } from "./cast";
import type { Ctx, TakeLayers } from "./ctx";
import { ActorMark, AgentTag, NameTag, Pointer } from "./marks";
import { Corners, fmtPx, type Occupant, occupantsOf, Plates } from "./occupancy";
import { edgePoint, envelope, type FrameSpec, onScreen, PRICE_ROWS, type Rect, toScreen, VIEW } from "./world";

/**
 * territory-edge: the shipped hand, given names and a queue.
 *
 * Every writer on a frame stands in its own lane down the frame's left edge,
 * first to arrive nearest the frame, in its owner's colour. A reader runs the
 * full height, a writer runs a short segment beside the block it is writing,
 * a person who is only looking is a notch at the top. The rule for collisions
 * lives at the block: an agent that wants a block another agent is writing
 * stands beside it, dashed, and takes it when the other lets go. People never
 * wait; they are told, at the pointer, what is being written under them.
 *
 * Zoomed out, the lanes fold onto the frame's top edge as a roof, one segment
 * per occupant, because a 3px lane on a 50px thumbnail is nothing.
 */

const LANE = 7;

export const edgeTake: TakeLayers = {
	label: (ctx, f) => <NameRow ctx={ctx} frame={f} />,
	over: (ctx) => (
		<>
			<Plates ctx={ctx} />
			{ctx.frames.map((f) => (
				<FrameMarks key={f.id} ctx={ctx} frame={f} />
			))}
			<Ledger ctx={ctx} />
			<People ctx={ctx} />
			<UnderPointer ctx={ctx} />
			<Pins ctx={ctx} />
			<Following ctx={ctx} />
		</>
	),
};

/* ---------- on the frame ---------- */

function FrameMarks({ ctx, frame }: { ctx: Ctx; frame: FrameSpec }) {
	const r = ctx.frameScreen(frame.id);
	if (r === undefined || r.x + r.w < -40 || r.x > VIEW.w + 40 || r.y > VIEW.h || r.y + r.h < 0) return null;
	const occupants = occupantsOf(ctx, frame.id);
	if (r.w < 120) return <Roof rect={r} occupants={occupants} />;
	return (
		<>
			{occupants.map((o, i) => (
				<Lane key={o.actor} ctx={ctx} frame={frame} rect={r} occupant={o} index={i} />
			))}
			{occupants
				.filter((o) => o.stance === "shot")
				.map((o) => (
					<Corners key={`shot-${o.actor}`} rect={r} color={colorOf(o.actor)} k={envelope(ctx.t, o.since, o.since + 0.7, 0.15)} />
				))}
		</>
	);
}

function Lane({ ctx, frame, rect, occupant, index }: { ctx: Ctx; frame: FrameSpec; rect: Rect; occupant: Occupant; index: number }) {
	const color = colorOf(occupant.actor);
	const x = rect.x - 8 - index * LANE;
	const born = Math.min(1, (ctx.t - occupant.since) / 0.24);
	const full = rect.h * (occupant.stance === "visit" ? 0 : 1);
	const seg = segmentOf(ctx, frame, occupant);
	return (
		<>
			{occupant.stance === "visit" ? (
				<span className="absolute w-[3px] rounded-full" style={{ left: x - 1.5, top: rect.y, height: 12, background: color }} />
			) : (
				<span
					className="absolute w-[2px] origin-top rounded-full"
					style={{
						left: x - 1,
						top: rect.y,
						height: full,
						background: color,
						opacity: occupant.stance === "read" || occupant.stance === "shot" ? 0.7 : 0.22,
						transform: `scaleY(${born})`,
					}}
				/>
			)}
			{seg === null ? null : (
				<span
					className="absolute rounded-full transition-[top,height] duration-[260ms] ease-[cubic-bezier(0.22,0.61,0.36,1)]"
					style={{
						left: x - 1.5,
						top: seg.y,
						height: seg.h,
						width: 3,
						...(occupant.stance === "wait"
							? { background: `repeating-linear-gradient(to bottom, ${color} 0 4px, transparent 4px 7px)` }
							: { background: color }),
					}}
				/>
			)}
			{occupant.stance === "wait" && seg !== null ? (
				<span className="absolute flex justify-end" style={{ right: VIEW.w - x + 10, top: seg.y + seg.h / 2 - 9, width: 240 }}>
					<span className="rounded-xs bg-bg/90 px-1.5 py-px type-detail" style={{ color }}>
						waits for {agentLabel(blockerOf(ctx, frame.id, occupant) ?? occupant.actor)}
					</span>
				</span>
			) : null}
		</>
	);
}

function segmentOf(ctx: Ctx, frame: FrameSpec, o: Occupant): { y: number; h: number } | null {
	if (o.stance === "write" || o.stance === "wait") {
		if (o.block === null) return null;
		const b = ctx.blockScreen(frame.id, o.block);
		return b === undefined ? null : { y: b.y - 3, h: Math.max(12, b.h + 6) };
	}
	if (o.stance === "reach") {
		const bs = o.blocks.map((b) => ctx.blockScreen(frame.id, b)).filter((b): b is Rect => b !== undefined);
		const top = Math.min(...bs.map((b) => b.y));
		const bottom = Math.max(...bs.map((b) => b.y + b.h));
		return bs.length === 0 ? null : { y: top - 3, h: bottom - top + 6 };
	}
	return null;
}

function blockerOf(ctx: Ctx, frameId: string, waiter: Occupant): ActorId | undefined {
	return ctx.agents.find((a) => a.frame === frameId && a.mode === "write" && a.block === waiter.block && a.actor !== waiter.actor)?.actor;
}

/** zoomed out: the lanes fold onto the top edge, one segment each, in arrival order */
function Roof({ rect, occupants }: { rect: Rect; occupants: Occupant[] }) {
	if (occupants.length === 0) return null;
	const w = rect.w / occupants.length;
	return (
		<>
			{occupants.map((o, i) => {
				const color = colorOf(o.actor);
				const writing = o.stance === "write" || o.stance === "reach";
				return (
					<span
						key={o.actor}
						className="absolute rounded-full"
						style={{
							left: rect.x + i * w + (i > 0 ? 1 : 0),
							top: rect.y - (writing ? 6 : 5),
							width: w - (i > 0 ? 1 : 0),
							height: writing ? 4 : 3,
							opacity: o.stance === "visit" ? 0.5 : 1,
							...(o.stance === "wait" || o.stance === "reach"
								? { background: `repeating-linear-gradient(to right, ${color} 0 4px, transparent 4px 6px)` }
								: { background: color }),
						}}
					/>
				);
			})}
			{occupants.filter((o) => isAgent(o.actor)).length > 1 && occupants.some((o) => o.stance === "wait" || o.stance === "write") ? (
				<span className="absolute flex items-center gap-0.5" style={{ left: rect.x, top: rect.y - 22 }}>
					{occupants
						.filter((o) => isAgent(o.actor) && o.stance !== "reach")
						.map((o) => (
							<ActorMark key={o.actor} actor={o.actor} size={12} busy={o.stance === "write"} />
						))}
				</span>
			) : null}
		</>
	);
}

/** the name row: who is on this frame, as marks after its name */
function NameRow({ ctx, frame }: { ctx: Ctx; frame: FrameSpec }) {
	const occupants = occupantsOf(ctx, frame.id).filter((o) => o.stance !== "visit");
	if (occupants.length === 0) return null;
	return (
		<span className="flex items-center gap-1">
			{occupants.map((o) => (
				<ActorMark key={o.actor} actor={o.actor} size={13} busy={o.stance === "write" || o.stance === "reach"} />
			))}
			{occupants.some((o) => o.stance === "reach") ? (
				<span className="ml-0.5 type-detail" style={{ color: colorOf(occupants.find((o) => o.stance === "reach")?.actor ?? "you") }}>
					price-row.tsx
				</span>
			) : null}
		</span>
	);
}

/* ---------- people ---------- */

/**
 * A pointer carries its owner's name, and when their agent is somewhere other
 * than the frame they are on, the agent's ring and the frame it holds ride the
 * tag. That is the whole of how a person and their agent are paired here.
 */
function People({ ctx }: { ctx: Ctx }) {
	return (
		<>
			{ctx.people.map((person) => {
				if (!onScreen(person.screen, 4)) return null;
				const agent = ctx.agents.find((a) => a.actor === `${person.actor}:agent`);
				const apart = agent !== undefined && agent.frame !== person.frame?.id;
				const agentScreen = agent === undefined ? undefined : ctx.frameScreen(agent.frame);
				const agentVisible = agentScreen !== undefined && agentScreen.x + agentScreen.w > 0 && agentScreen.x < VIEW.w;
				const tiny = ctx.cam.z < 0.3;
				return (
					<Pointer key={person.actor} at={person.screen} color={colorOf(person.actor)}>
						<NameTag actor={person.actor}>
							{apart && !tiny ? (
								<span className="flex items-center gap-1 rounded-[3px] bg-[#0e0e0e]/85 px-1 py-px">
									<ActorMark actor={`${person.actor}:agent` as ActorId} size={10} busy={agent?.mode === "write"} />
									<span className="type-detail" style={{ color: colorOf(person.actor) }}>
										{agent?.span.file === undefined ? agent?.frame : "price-row.tsx"}
										{agentVisible ? "" : " ›"}
									</span>
								</span>
							) : null}
						</NameTag>
					</Pointer>
				);
			})}
		</>
	);
}

/**
 * Your pointer over a block somebody is writing: the block is drawn round in
 * their colour and the pointer says whose. Nothing stops the click.
 */
function UnderPointer({ ctx }: { ctx: Ctx }) {
	if (ctx.you === null) return null;
	for (const agent of ctx.agents) {
		if (agent.mode !== "write" || agent.block === null || agent.span.file !== undefined) continue;
		const b = ctx.blockScreen(agent.frame, agent.block);
		if (b === undefined) continue;
		const inside = ctx.you.x >= b.x && ctx.you.x <= b.x + b.w && ctx.you.y >= b.y && ctx.you.y <= b.y + b.h;
		if (!inside) continue;
		const color = colorOf(agent.actor);
		return (
			<>
				<span className="absolute rounded-[3px] border-[1.5px] border-dashed" style={{ left: b.x - 3, top: b.y - 3, width: b.w + 6, height: b.h + 6, borderColor: color }} />
				<span className="absolute rounded-xs bg-bg/95 px-1.5 py-px type-detail" style={{ left: ctx.you.x + 18, top: ctx.you.y + 18, color }}>
					{agentLabel(agent.actor)} writing this
				</span>
			</>
		);
	}
	return null;
}

/* ---------- off screen ---------- */

/**
 * Anyone off screen is a pin on the viewport's edge, on the line toward where
 * they are: a disc for a person, a ring for an agent, and the agent's frame in
 * mono with how far it is. A person and their agent in the same direction sit
 * side by side, which is the pairing.
 */
function Pins({ ctx }: { ctx: Ctx }) {
	const pins: { actor: ActorId; at: { x: number; y: number }; side: string; text: string | null; dist: number }[] = [];
	for (const person of ctx.people) {
		if (onScreen(person.screen, 4) || person.actor === ctx.follow) continue;
		const e = edgePoint(person.screen, 18);
		pins.push({ actor: person.actor, at: e.at, side: e.side, text: null, dist: 0 });
	}
	for (const agent of ctx.agents) {
		if (agent.actor === "you:agent" || agent.actor === ctx.follow) continue;
		const f = ctx.frame(agent.frame);
		if (f === undefined || agent.span.file !== undefined) continue;
		const c = toScreen(ctx.cam, { x: f.x + 195, y: f.y + 422 });
		const r = ctx.frameScreen(f.id);
		if (r !== undefined && r.x + r.w > 0 && r.x < VIEW.w && r.y + r.h > 0 && r.y < VIEW.h) continue;
		const e = edgePoint(c, 18);
		const dist = Math.hypot(c.x - e.at.x, c.y - e.at.y) / ctx.cam.z;
		pins.push({ actor: agent.actor, at: e.at, side: e.side, text: agent.frame, dist });
	}
	// a person and their agent heading the same way stack, so they read as one pair
	const placed = pins.map((pin, i) => {
		const earlier = pins.slice(0, i).filter((o) => o.side === pin.side && Math.abs(o.at.y - pin.at.y) < 40 && Math.abs(o.at.x - pin.at.x) < 160).length;
		const vertical = pin.side === "left" || pin.side === "right";
		return { ...pin, at: vertical ? { x: pin.at.x, y: pin.at.y + earlier * 26 } : { x: pin.at.x + earlier * 120, y: pin.at.y } };
	});
	return (
		<>
			{placed.map((pin) => {
				const right = pin.side === "right";
				return (
					<span
						key={pin.actor}
						className="absolute flex items-center gap-1.5 rounded-full bg-bg/90 py-[3px] pr-2 pl-[3px]"
						style={{
							left: right ? undefined : Math.min(VIEW.w - 250, Math.max(8, pin.at.x - 8)),
							right: right ? VIEW.w - pin.at.x - 8 : undefined,
							top: Math.min(VIEW.h - 30, Math.max(8, pin.at.y - 11)),
							flexDirection: right ? "row-reverse" : "row",
							paddingLeft: right ? 8 : 3,
							paddingRight: right ? 3 : 8,
						}}
					>
						<span className="text-muted type-detail">{chevron(pin.side)}</span>
						<ActorMark actor={pin.actor} size={16} busy={isAgent(pin.actor)} />
						{pin.text === null ? (
							<span className="type-caption" style={{ color: colorOf(pin.actor) }}>
								{ownerOf(pin.actor).name}
							</span>
						) : (
							<AgentTag actor={pin.actor}>
								{pin.text} · {fmtPx(pin.dist)}px
							</AgentTag>
						)}
					</span>
				);
			})}
		</>
	);
}

function chevron(side: string): string {
	return side === "right" ? "›" : side === "left" ? "‹" : side === "top" ? "˄" : "˅";
}

/* ---------- following ---------- */

function Following({ ctx }: { ctx: Ctx }) {
	if (ctx.follow === null) return null;
	const color = colorOf(ctx.follow);
	const agent = isAgent(ctx.follow);
	return (
		<>
			<span className="absolute inset-0 border-2" style={{ borderColor: color, borderStyle: agent ? "dashed" : "solid" }} />
			<span className="-translate-x-1/2 absolute top-3 left-1/2 flex items-center gap-1.5 rounded-xs px-2 py-[3px] text-[#0e0e0e] type-detail" style={{ background: color }}>
				following {agent ? agentLabel(ctx.follow) : ownerOf(ctx.follow).id}
				<span className="opacity-60">· esc stops</span>
			</span>
		</>
	);
}

/* ---------- coming back ---------- */

/**
 * What landed while you were away stays on the lanes as ticks, one per write,
 * oldest furthest out. A frame you have looked at lets its ticks go over a
 * second; up close, a thin rule stays beside each block that changed.
 */
function Ledger({ ctx }: { ctx: Ctx }) {
	const ledger = ctx.scn.ledger;
	if (ledger === undefined) return null;
	const rows: { key: string; frame: FrameSpec; entry: (typeof ledger)[number]; lane: number; reach: boolean }[] = [];
	const lanes = new Map<string, number>();
	for (const entry of ledger) {
		const reached = entry.file === undefined ? [ctx.frame(entry.frame)] : ctx.frames.filter((f) => f.uses.includes(entry.file ?? ""));
		for (const f of reached) {
			if (f === undefined) continue;
			const lane = lanes.get(f.id) ?? 0;
			lanes.set(f.id, lane + 1);
			rows.push({ key: `${entry.actor}-${f.id}`, frame: f, entry, lane, reach: entry.file !== undefined });
		}
	}
	const hovered = hoveredFrame(ctx);
	return (
		<>
			{rows.map(({ key, frame, entry, lane, reach }) => {
				const r = ctx.frameScreen(frame.id);
				if (r === undefined) return null;
				const seenAt = ctx.seen.get(frame.id);
				const fade = seenAt === undefined ? 1 : Math.max(0, 1 - (ctx.t - seenAt) / 1.1);
				const color = colorOf(entry.actor);
				const x = r.x - 8 - lane * LANE;
				const count = reach ? Math.min(entry.writes, 6) : Math.min(entry.writes, 16);
				const blocks = reach ? PRICE_ROWS[frame.screen] : entry.blocks;
				return (
					<Fragment key={key}>
						{Array.from({ length: count }, (_, i) => (
							<span
								key={i}
								className="absolute h-[2px] rounded-full"
								style={{ left: x - 3, top: r.y + 2 + i * 5, width: 6, background: color, opacity: fade * (reach ? 0.55 : 0.95) }}
							/>
						))}
						{r.w > 200
							? blocks.map((b) => {
									const br = ctx.blockScreen(frame.id, b);
									return br === undefined ? null : (
										<span key={b} className="absolute w-[2px] rounded-full" style={{ left: x - 1, top: br.y, height: br.h, background: color, opacity: 0.55 }} />
									);
								})
							: null}
					</Fragment>
				);
			})}
			{hovered === undefined || ctx.you === null ? null : (
				<LedgerNote ctx={ctx} frame={hovered} at={ctx.you} />
			)}
		</>
	);
}

export function hoveredFrame(ctx: Ctx): FrameSpec | undefined {
	const you = ctx.you;
	if (you === null) return undefined;
	return ctx.frames.find((f) => {
		const r = ctx.frameScreen(f.id);
		return r !== undefined && you.x >= r.x && you.x <= r.x + r.w && you.y >= r.y && you.y <= r.y + r.h;
	});
}

function LedgerNote({ ctx, frame, at }: { ctx: Ctx; frame: FrameSpec; at: { x: number; y: number } }) {
	const entries = (ctx.scn.ledger ?? []).filter((e) => e.frame === frame.id || (e.file !== undefined && frame.uses.includes(e.file)));
	if (entries.length === 0) return null;
	return (
		<span className="absolute flex flex-col gap-0.5 rounded-sm border border-border-raised bg-bg px-2 py-1.5" style={{ left: at.x + 18, top: at.y + 20 }}>
			{entries.map((e) => (
				<span key={e.actor + e.frame} className="flex items-center gap-1.5 whitespace-nowrap type-detail">
					<ActorMark actor={e.actor} size={11} />
					<span style={{ color: colorOf(e.actor) }}>{isAgent(e.actor) ? agentLabel(e.actor) : ownerOf(e.actor).id}</span>
					<span className="text-muted">
						{e.file === undefined ? `${e.writes} writes` : "price-row.tsx"} · {e.ago}m ago
					</span>
				</span>
			))}
		</span>
	);
}
