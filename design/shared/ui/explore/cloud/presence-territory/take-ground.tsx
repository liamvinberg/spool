import { Fragment } from "react";
import { type ActorId, agentLabel, colorOf, isAgent, ownerOf } from "./cast";
import type { Ctx, TakeLayers } from "./ctx";
import { NameTag, Pointer } from "./marks";
import { Corners, fmtPx, type Occupant, occupantsOf, Plates } from "./occupancy";
import { easeOut, edgePoint, envelope, onScreen, type Rect, toScreen, VIEW } from "./world";

/**
 * territory-ground: whoever works a frame stands on ground you can see.
 *
 * Occupancy is painted on the canvas floor, under the frames, never on the
 * design. Each occupant lays a ring of ground round the frame in their colour,
 * the first to arrive nearest; writing ground is wider and every write sends
 * one slow ripple across it. A shared component lays ground under every frame
 * that renders it and joins them with a path, so you can see its reach.
 *
 * The rule for collisions is about land: an agent sent to a frame someone
 * else's agent is working builds next door instead, as a `--` sibling beside
 * it, and the two versions sit side by side once the first one leaves. People
 * walk wherever they like.
 *
 * Zoomed out, one owner's ground on neighbouring frames runs together, so the
 * board reads as a map of who is working where.
 */

export const groundTake: TakeLayers = {
	under: (ctx) => <Ground ctx={ctx} />,
	over: (ctx) => (
		<>
			<Plates ctx={ctx} />
			<Shots ctx={ctx} />
			<FloorLabels ctx={ctx} />
			<People ctx={ctx} />
			<Crossing ctx={ctx} />
			<Horizon ctx={ctx} />
			<Following ctx={ctx} />
		</>
	),
};

interface Pad {
	readonly key: string;
	readonly actor: ActorId;
	readonly rect: Rect;
	readonly stance: Occupant["stance"] | "worn";
	readonly ring: number;
	readonly grow: number;
	readonly alpha: number;
}

/** ground takes in the frame's name row, so the name stands on it rather than across its edge */
function head(r: Rect): number {
	return r.w < 80 ? 0 : 26;
}

function zoomedOut(ctx: Ctx): boolean {
	return ctx.cam.z < 0.3;
}

function padsOf(ctx: Ctx): Pad[] {
	const pads: Pad[] = [];
	const far = zoomedOut(ctx);
	const base = far ? 14 : 16;
	const step = far ? 6 : 12;
	for (const f of ctx.frames) {
		const r = ctx.frameScreen(f.id);
		if (r === undefined) continue;
		const occupants = occupantsOf(ctx, f.id);
		occupants.forEach((o, i) => {
			const grow = o.stance === "visit" ? 1 : easeOut((ctx.t - o.since) / 0.4) * leaving(ctx, o);
			const width = o.stance === "write" || o.stance === "reach" ? step + 4 : o.stance === "visit" ? 6 : step;
			pads.push({ key: `${f.id}-${o.actor}`, actor: o.actor, rect: r, stance: o.stance, ring: base + i * step + width * grow - step, grow, alpha: 1 });
		});
	}
	// coming back: the ground keeps a stain of every stretch of work, fainter the older it is
	for (const entry of ctx.scn.ledger ?? []) {
		const reached = entry.file === undefined ? [ctx.frame(entry.frame)] : ctx.frames.filter((f) => f.uses.includes(entry.file ?? ""));
		for (const f of reached) {
			if (f === undefined) continue;
			const r = ctx.frameScreen(f.id);
			if (r === undefined) continue;
			pads.push({
				key: `worn-${f.id}-${entry.actor}`,
				actor: entry.actor,
				rect: r,
				stance: "worn",
				ring: base + Math.min(entry.writes, 14) * (far ? 0.6 : 1.4),
				grow: 1,
				alpha: Math.max(0.25, 1 - entry.ago / 45) * (entry.file === undefined ? 1 : 0.6),
			});
		}
	}
	return pads;
}

/** an agent's ground lifts over the last 0.4s of its span rather than vanishing */
function leaving(ctx: Ctx, o: Occupant): number {
	const agent = ctx.agents.find((a) => a.actor === o.actor);
	if (agent === undefined) return 1;
	const left = agent.span.to - ctx.t;
	const next = ctx.scn.spans.find((s) => s.actor === o.actor && s.frame === agent.frame && Math.abs(s.from - agent.span.to) < 0.2);
	return next === undefined ? easeOut(left / 0.4) : 1;
}

function Ground({ ctx }: { ctx: Ctx }) {
	const pads = padsOf(ctx);
	const owners = [...new Set(pads.map((p) => p.actor))];
	const far = zoomedOut(ctx);
	return (
		<svg className="absolute inset-0" width={VIEW.w} height={VIEW.h} aria-hidden="true">
			<Paths ctx={ctx} />
			{/* one owner's ground is one layer, so where two of their pads meet the colour
			    runs on instead of doubling: zoomed out, that is what draws the map */}
			{owners.map((actor) => {
				const mine = pads.filter((p) => p.actor === actor);
				const worn = mine.every((p) => p.stance === "worn");
				return (
					<g key={actor} opacity={worn ? 0.1 * Math.max(...mine.map((p) => p.alpha)) : far ? 0.2 : 0.13}>
						{mine.map((p) => (
							<rect
								key={p.key}
								x={p.rect.x - p.ring}
								y={p.rect.y - p.ring - head(p.rect)}
								width={p.rect.w + p.ring * 2}
								height={p.rect.h + p.ring * 2 + head(p.rect)}
								rx={Math.min(18, 6 + p.ring * 0.4)}
								fill={colorOf(actor)}
								fillOpacity={p.stance === "reach" ? (far ? 0 : 0.45) : 1}
								stroke={p.stance === "reach" && far ? colorOf(actor) : undefined}
								strokeDasharray={p.stance === "reach" && far ? "2 3" : undefined}
								strokeWidth={p.stance === "reach" && far ? 4 : undefined}
							/>
						))}
					</g>
				);
			})}
			{far
				? null
				: pads
						.filter((p) => p.stance !== "worn" && p.stance !== "visit")
						.map((p) => (
							<rect
								key={`edge-${p.key}`}
								x={p.rect.x - p.ring}
								y={p.rect.y - p.ring - head(p.rect)}
								width={p.rect.w + p.ring * 2}
								height={p.rect.h + p.ring * 2 + head(p.rect)}
								rx={Math.min(18, 6 + p.ring * 0.4)}
								fill="none"
								stroke={colorOf(p.actor)}
								strokeOpacity={0.55 * p.grow}
								strokeDasharray={p.stance === "reach" ? "3 4" : undefined}
								strokeWidth="1"
							/>
						))}
			<Ripples ctx={ctx} pads={pads} />
		</svg>
	);
}

/** every write sends one ring out across the writer's ground, slow and once */
function Ripples({ ctx, pads }: { ctx: Ctx; pads: Pad[] }) {
	const rings: { key: string; pad: Pad; age: number }[] = [];
	for (const w of ctx.writes) {
		const age = ctx.t - w.t;
		if (age < 0 || age > 0.9) continue;
		for (const pad of pads) {
			if (pad.actor !== w.actor || pad.stance === "worn") continue;
			if (w.file === undefined && !pad.key.startsWith(`${w.frame}-`)) continue;
			rings.push({ key: `${w.t}-${pad.key}`, pad, age });
		}
	}
	return (
		<>
			{rings.map(({ key, pad, age }) => {
				const u = easeOut(age / 0.9);
				const out = pad.ring + 4 + u * 16;
				return (
					<rect
						key={key}
						x={pad.rect.x - out}
						y={pad.rect.y - out - head(pad.rect)}
						width={pad.rect.w + out * 2}
						height={pad.rect.h + out * 2 + head(pad.rect)}
						rx={Math.min(22, 6 + out * 0.4)}
						fill="none"
						stroke={colorOf(pad.actor)}
						strokeOpacity={0.45 * (1 - u)}
						strokeWidth="1"
					/>
				);
			})}
		</>
	);
}

/**
 * Paths on the floor. A shared file being written joins every frame that renders
 * it; a `--` sibling an agent built next door is joined to the frame it came from.
 */
function Paths({ ctx }: { ctx: Ctx }) {
	const lines: { key: string; a: Rect; b: Rect; color: string; alpha: number; dashed: boolean }[] = [];
	for (const agent of ctx.agents) {
		const file = agent.span.file;
		if (file !== undefined && agent.mode === "write") {
			const reached = ctx.frames.filter((f) => f.uses.includes(file)).sort((a, b) => a.y - b.y || a.x - b.x);
			const grow = easeOut(agent.into / 0.8);
			for (let i = 1; i < reached.length; i += 1) {
				const a = ctx.frameScreen(reached[i - 1]?.id ?? "");
				const b = ctx.frameScreen(reached[i]?.id ?? "");
				if (a !== undefined && b !== undefined) lines.push({ key: `${file}-${i}`, a, b, color: colorOf(agent.actor), alpha: 0.16 * grow, dashed: false });
			}
		}
	}
	for (const f of ctx.frames) {
		if (f.bornAt === undefined) continue;
		const base = ctx.frame(f.id.split("--")[0] ?? "");
		const a = base === undefined ? undefined : ctx.frameScreen(base.id);
		const b = ctx.frameScreen(f.id);
		if (a !== undefined && b !== undefined) lines.push({ key: `sib-${f.id}`, a, b, color: "var(--color-thread)", alpha: 0.6 * easeOut((ctx.t - f.bornAt) / 0.5), dashed: true });
	}
	return (
		<>
			{lines.map((l) => (
				<line
					key={l.key}
					x1={l.a.x + l.a.w / 2}
					y1={l.a.y + l.a.h / 2}
					x2={l.b.x + l.b.w / 2}
					y2={l.b.y + l.b.h / 2}
					stroke={l.color}
					strokeOpacity={l.alpha}
					strokeWidth={l.dashed ? 1.5 : Math.max(3, 10 * ctx.cam.z)}
					strokeDasharray={l.dashed ? "4 5" : undefined}
					strokeLinecap="round"
				/>
			))}
		</>
	);
}

function Shots({ ctx }: { ctx: Ctx }) {
	return (
		<>
			{ctx.agents
				.filter((a) => a.mode === "shot")
				.map((a) => {
					const r = ctx.frameScreen(a.frame);
					return r === undefined ? null : <Corners key={a.actor} rect={r} color={colorOf(a.actor)} k={envelope(ctx.t, a.span.from, a.span.to, 0.15)} />;
				})}
		</>
	);
}

/* ---------- names on the floor ---------- */

/**
 * Ground is labelled where it is, on the floor under the frame's bottom edge:
 * a person by name, an agent by its machine name and what it is doing. Zoomed
 * out, one label per owner, under the lowest frame of their ground.
 */
function FloorLabels({ ctx }: { ctx: Ctx }) {
	if (zoomedOut(ctx)) return <MapLabels ctx={ctx} />;
	const labels: { key: string; x: number; y: number; max: number; actor: ActorId; text: string }[] = [];
	const named = new Set<ActorId>();
	for (const f of ctx.frames) {
		const r = ctx.frameScreen(f.id);
		if (r === undefined || r.y + r.h > VIEW.h + 30 || r.x + r.w < 0 || r.x > VIEW.w) continue;
		const occupants = occupantsOf(ctx, f.id).filter((o) => isAgent(o.actor));
		const x = r.x;
		let y = r.y + r.h + 10;
		for (const o of occupants) {
			// a shared file's ground is named once, on the first frame it reaches
			if (o.stance === "reach") {
				if (named.has(o.actor)) continue;
				named.add(o.actor);
			}
			const text = `${agentLabel(o.actor)} · ${verb(o)}`;
			labels.push({ key: `${f.id}-${o.actor}`, x, y, max: r.w + 40, actor: o.actor, text });
			y += 16;
		}
		// a stain is named once, under the frame its work was on
		const worn = (ctx.scn.ledger ?? []).filter((e) => e.frame === f.id);
		for (const e of worn) {
			if (ctx.seen.has(f.id)) continue;
			const text = `${isAgent(e.actor) ? agentLabel(e.actor) : ownerOf(e.actor).id} · ${e.file === undefined ? `${e.writes} writes` : "price-row.tsx"} · ${e.ago}m`;
			labels.push({ key: `worn-${f.id}-${e.actor}`, x, y, max: r.w + 40, actor: e.actor, text });
			y += 16;
		}
	}
	return (
		<>
			{labels.map((l) => (
				<span key={l.key} className="absolute truncate whitespace-nowrap type-detail" style={{ left: l.x, top: l.y, maxWidth: l.max, color: colorOf(l.actor) }}>
					{l.text}
				</span>
			))}
		</>
	);
}

function verb(o: Occupant): string {
	if (o.stance === "reach") return "price-row.tsx";
	if (o.stance === "write") return "writing";
	if (o.stance === "shot") return "looking";
	return "reading";
}

function MapLabels({ ctx }: { ctx: Ctx }) {
	const byOwner = new Map<ActorId, Rect[]>();
	for (const f of ctx.frames) {
		const r = ctx.frameScreen(f.id);
		if (r === undefined) continue;
		for (const o of occupantsOf(ctx, f.id)) {
			if (!isAgent(o.actor)) continue;
			byOwner.set(o.actor, [...(byOwner.get(o.actor) ?? []), r]);
		}
	}
	return (
		<>
			{[...byOwner].map(([actor, rects]) => {
				const bottom = Math.max(...rects.map((r) => r.y + r.h));
				const left = Math.min(...rects.map((r) => r.x));
				return (
					<span key={actor} className="absolute whitespace-nowrap type-detail" style={{ left, top: bottom + 18, color: colorOf(actor) }}>
						{agentLabel(actor)}
					</span>
				);
			})}
		</>
	);
}

/* ---------- people ---------- */

function People({ ctx }: { ctx: Ctx }) {
	return (
		<>
			{ctx.people.map((person) =>
				onScreen(person.screen, 4) ? (
					<Pointer key={person.actor} at={person.screen} color={colorOf(person.actor)}>
						<NameTag actor={person.actor} />
					</Pointer>
				) : null,
			)}
		</>
	);
}

/**
 * Your pointer on somebody else's ground: the note says whose it is and what is
 * happening on it. It stays out of the way of the click.
 */
function Crossing({ ctx }: { ctx: Ctx }) {
	const you = ctx.you;
	if (you === null || zoomedOut(ctx)) return null;
	for (const f of ctx.frames) {
		const r = ctx.frameScreen(f.id);
		if (r === undefined || you.x < r.x - 20 || you.x > r.x + r.w + 20 || you.y < r.y - 20 || you.y > r.y + r.h + 20) continue;
		const owner = occupantsOf(ctx, f.id).find((o) => isAgent(o.actor) && o.actor !== "you:agent" && o.stance !== "reach");
		if (owner === undefined) return null;
		return (
			<span className="absolute whitespace-nowrap rounded-xs bg-bg/95 px-1.5 py-px type-detail" style={{ left: you.x + 18, top: you.y + 18, color: colorOf(owner.actor) }}>
				{ownerOf(owner.actor).id}'s ground · {agentLabel(owner.actor)} {verb(owner)}
			</span>
		);
	}
	return null;
}

/* ---------- beyond the edge ---------- */

/**
 * Ground off screen lights the viewport's edge on its side, like light from a
 * room next door: a soft band in the owner's colour, with who it is and how far.
 */
function Horizon({ ctx }: { ctx: Ctx }) {
	const glows: { key: string; actor: ActorId; at: { x: number; y: number }; side: string; text: string }[] = [];
	for (const person of ctx.people) {
		if (onScreen(person.screen, 4) || person.actor === ctx.follow) continue;
		const e = edgePoint(person.screen, 0);
		glows.push({ key: person.actor, actor: person.actor, at: e.at, side: e.side, text: ownerOf(person.actor).name });
	}
	for (const agent of ctx.agents) {
		if (agent.actor === "you:agent" || agent.actor === ctx.follow || agent.span.file !== undefined) continue;
		const f = ctx.frame(agent.frame);
		const r = ctx.frameScreen(agent.frame);
		if (f === undefined || r === undefined) continue;
		if (r.x + r.w > 0 && r.x < VIEW.w && r.y + r.h > 0 && r.y < VIEW.h) continue;
		const c = toScreen(ctx.cam, { x: f.x + 195, y: f.y + 422 });
		const e = edgePoint(c, 0);
		const dist = Math.hypot(c.x - e.at.x, c.y - e.at.y) / ctx.cam.z;
		glows.push({ key: agent.actor, actor: agent.actor, at: e.at, side: e.side, text: `${agentLabel(agent.actor)} · ${agent.frame} · ${fmtPx(dist)}px` });
	}
	const placed: typeof glows = [];
	return (
		<>
			{glows.map((g) => {
				const crowd = placed.filter((o) => o.side === g.side && Math.abs(o.at.y - g.at.y) < 80 && Math.abs(o.at.x - g.at.x) < 360).length;
				const textW = g.text.length * 6.7;
				placed.push(g);
				const vertical = g.side === "left" || g.side === "right";
				const color = colorOf(g.actor);
				const cx = Math.min(VIEW.w, Math.max(0, g.at.x));
				const cy = Math.min(VIEW.h, Math.max(0, g.at.y));
				return (
					<Fragment key={g.key}>
						<span
							className="absolute"
							style={{
								left: vertical ? (g.side === "left" ? 0 : VIEW.w - 70) : cx - 160,
								top: vertical ? cy - 140 : g.side === "top" ? 0 : VIEW.h - 70,
								width: vertical ? 70 : 320,
								height: vertical ? 280 : 70,
								background: `radial-gradient(ellipse at ${g.side === "left" ? "0% 50%" : g.side === "right" ? "100% 50%" : g.side === "top" ? "50% 0%" : "50% 100%"}, color-mix(in srgb, ${color} 34%, transparent), transparent 70%)`,
							}}
						/>
						<span
							className="absolute whitespace-nowrap"
							style={{
								left: g.side === "right" ? undefined : g.side === "left" ? 12 : Math.min(VIEW.w - textW - 14, Math.max(12, cx - textW / 2)),
								right: g.side === "right" ? 12 : undefined,
								top: vertical ? cy - 9 + crowd * 22 : g.side === "top" ? 10 + crowd * 22 : VIEW.h - 30 - crowd * 22,
								color,
							}}
						>
							{isAgent(g.actor) ? <span className="type-detail">{g.text}</span> : <span className="font-medium type-caption">{g.text}</span>}
						</span>
					</Fragment>
				);
			})}
		</>
	);
}

/* ---------- following ---------- */

function Following({ ctx }: { ctx: Ctx }) {
	if (ctx.follow === null) return null;
	const color = colorOf(ctx.follow);
	const edge = (dir: string) => `linear-gradient(${dir}, color-mix(in srgb, ${color} 20%, transparent), transparent 48px)`;
	return (
		<>
			<span className="absolute inset-0" style={{ background: [edge("to bottom"), edge("to top"), edge("to right"), edge("to left")].join(",") }} />
			<span className="-translate-x-1/2 absolute top-3 left-1/2 rounded-xs bg-bg/90 px-2 py-[3px] type-detail" style={{ color }}>
				following {isAgent(ctx.follow) ? agentLabel(ctx.follow) : ownerOf(ctx.follow).id} · esc stops
			</span>
		</>
	);
}

