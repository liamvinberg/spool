import { cn } from "shared/lib/utils";
import { type ActorId, agentLabel, colorOf, isAgent, ownerOf } from "./cast";
import type { Ctx, TakeLayers } from "./ctx";
import { ActorMark, NameTag, Pointer } from "./marks";
import { Corners, fmtPx, Plates } from "./occupancy";
import { type AgentNow, edgePoint, envelope, type FrameSpec, onScreen, PRICE_ROWS, type Rect, toScreen, type V, VIEW } from "./world";

/**
 * territory-reach: the ground is files, not frames.
 *
 * An agent never stands on the canvas. What stands there is the file it holds,
 * as a tile: a frame's own source docks on that frame's name row, a shared
 * component floats in the gutter between the frames it renders in, with a
 * thread to each. Two writers on one file share one tile, so a collision is a
 * tile with two rings rather than two marks that happen to overlap.
 *
 * The rule for collisions is the one version control already has: nobody
 * waits, and a write made against a file that changed since it was read is
 * refused, so the agent reads again and writes on top of the newer copy. The
 * tile says when that happens. Under each block that changed, a hairline in
 * the writer's colour stays for six seconds, so you can see what a file did to
 * the pixels.
 *
 * Anything off screen goes in a tray at the viewport's foot, and coming back,
 * the same tray lists what changed while you were gone.
 */

export const reachTake: TakeLayers = {
	over: (ctx) => (
		<>
			<Plates ctx={ctx} />
			<Hunks ctx={ctx} />
			<ShotMarks ctx={ctx} />
			<Threads ctx={ctx} />
			<Tiles ctx={ctx} />
			<People ctx={ctx} />
			<Tray ctx={ctx} />
			<Following ctx={ctx} />
		</>
	),
};

/* ---------- tiles ---------- */

interface Tile {
	readonly file: string;
	readonly shared: boolean;
	readonly holders: readonly AgentNow[];
	/** where the tile stands, in world space */
	readonly world: V;
	/** the frames it reaches */
	readonly frames: readonly FrameSpec[];
}

function fileOf(a: AgentNow): string {
	return a.span.file ?? `${a.frame}/frame.tsx`;
}

function tilesOf(ctx: Ctx): Tile[] {
	const byFile = new Map<string, AgentNow[]>();
	for (const a of ctx.agents) byFile.set(fileOf(a), [...(byFile.get(fileOf(a)) ?? []), a]);
	const tiles: Tile[] = [];
	for (const [file, holders] of byFile) {
		const first = holders[0];
		if (first === undefined) continue;
		const shared = first.span.file !== undefined;
		if (!shared) {
			const f = ctx.frame(first.frame);
			if (f === undefined) continue;
			tiles.push({ file, shared, holders, world: { x: f.x + 390, y: f.y }, frames: [f] });
			continue;
		}
		const frames = ctx.frames.filter((f) => f.uses.includes(file));
		// it stands among the frames you can see it reaching; the rest get threads off the edge
		const seen = frames.filter((f) => onScreen(toScreen(ctx.cam, { x: f.x + 195, y: f.y + 422 }), 0));
		const among = seen.length > 0 ? seen : frames;
		const cx = among.reduce((s, f) => s + f.x + 195, 0) / Math.max(1, among.length);
		const cy = among.reduce((s, f) => s + f.y + 422, 0) / Math.max(1, among.length);
		// never on a design: into the nearest gutter between rows if the middle lands on a frame
		const onFrame = ctx.frames.some((f) => cx > f.x - 120 && cx < f.x + 510 && cy > f.y - 40 && cy < f.y + 884);
		const world = onFrame ? { x: cx, y: Math.round((cy - 922) / 1000) * 1000 + 922 } : { x: cx, y: cy };
		tiles.push({ file, shared, holders, world, frames });
	}
	return tiles;
}

/** the line a holder's tile speaks: what it is doing to the file now */
function verbOf(ctx: Ctx, a: AgentNow, together: boolean): string {
	if (a.mode === "read") {
		const before = ctx.scn.spans.find((s) => s.actor === a.actor && s.mode === "write" && Math.abs(s.to - a.span.from) < 0.05);
		return before === undefined ? "reading" : "changed since read · reading again";
	}
	if (a.mode === "shot") return "looking";
	if (a.mode === "write") return together ? "writing · 2 writers" : "writing";
	return "reading";
}

function Tiles({ ctx }: { ctx: Ctx }) {
	const tiny = ctx.cam.z < 0.3;
	const you = ctx.you;
	return (
		<>
			{tilesOf(ctx).map((tile) => {
				const at = toScreen(ctx.cam, tile.world);
				if (!onScreen(at, 60)) return null;
				const own = tile.shared ? undefined : ctx.frameScreen(tile.frames[0]?.id ?? "");
				const hovered = you !== null && tile.frames.some((f) => {
					const r = ctx.frameScreen(f.id);
					return r !== undefined && you.x >= r.x && you.x <= r.x + r.w && you.y >= r.y && you.y <= r.y + r.h;
				});
				const open = hovered && !tiny;
				const together = tile.holders.filter((h) => h.mode === "write").length > 1;
				const style =
					tile.shared || own === undefined
						? { left: at.x, top: at.y, transform: "translate(-50%, -50%)" }
						: tiny
							? { left: own.x, top: own.y - 4, transform: "translateY(-100%)" }
							: {
									left: Math.min(VIEW.w - tile.file.length * 7.3 - 44, own.x + (tile.frames[0]?.id.length ?? 0) * 7.3 + 6),
									top: own.y - 4,
									transform: "translateY(-100%)",
								};
				return (
					<div
						key={tile.file}
						className={cn("absolute flex flex-col gap-0.5 whitespace-nowrap rounded-sm border bg-bg px-1 py-1", together ? "border-text/40" : "border-border-raised")}
						style={style}
					>
						<span className="flex items-center gap-1.5">
							<span className="flex items-center">
								{tile.holders.map((h, i) => (
									<span key={h.actor} className={cn(i > 0 && "-ml-1 rounded-full bg-bg")}>
										<ActorMark actor={h.actor} size={13} busy={h.mode === "write"} />
									</span>
								))}
							</span>
							{tile.shared || open || together || (own !== undefined && own.w > 300) ? (
								<span className="text-text type-detail">{tile.file}</span>
							) : null}
						</span>
						{open || together || tile.holders.some((h) => verbOf(ctx, h, false).startsWith("changed")) ? (
							tile.holders.map((h) => (
								<span key={h.actor} className="flex items-center gap-1.5 pl-[19px] type-detail">
									<span style={{ color: colorOf(h.actor) }}>{agentLabel(h.actor)}</span>
									<span className="text-muted">{verbOf(ctx, h, together)}</span>
								</span>
							))
						) : null}
					</div>
				);
			})}
		</>
	);
}

/** a shared file's tile is tied to every frame that renders it */
function Threads({ ctx }: { ctx: Ctx }) {
	const lines: { key: string; a: V; b: V; color: string; alpha: number }[] = [];
	for (const tile of tilesOf(ctx)) {
		if (!tile.shared) continue;
		const at = toScreen(ctx.cam, tile.world);
		const writer = tile.holders[0];
		if (writer === undefined) continue;
		const grow = Math.min(1, writer.into / 0.6);
		for (const f of tile.frames) {
			const r = ctx.frameScreen(f.id);
			if (r === undefined) continue;
			const below = r.y > at.y;
			lines.push({ key: `${tile.file}-${f.id}`, a: at, b: { x: r.x + r.w / 2, y: below ? r.y : r.y + r.h }, color: colorOf(writer.actor), alpha: 0.6 * grow });
		}
	}
	return (
		<svg className="absolute inset-0 overflow-visible" width={VIEW.w} height={VIEW.h} aria-hidden="true">
			{lines.map((l) => {
				const midY = (l.a.y + l.b.y) / 2;
				return (
					<path
						key={l.key}
						d={`M${l.a.x} ${l.a.y}C${l.a.x} ${midY} ${l.b.x} ${midY} ${l.b.x} ${l.b.y}`}
						fill="none"
						stroke={l.color}
						strokeOpacity={l.alpha}
						strokeWidth="1"
					/>
				);
			})}
		</svg>
	);
}

/**
 * Under each block a write changed, a hairline in the writer's colour that
 * thins out over six seconds: what the file did to the pixels, in order.
 */
function Hunks({ ctx }: { ctx: Ctx }) {
	const marks = new Map<string, { rect: Rect; color: string; age: number }>();
	for (const w of ctx.writes) {
		const age = ctx.t - w.t;
		if (age < 0 || age > 6) continue;
		const targets: { frame: string; block: number }[] =
			w.file === undefined
				? [{ frame: w.frame, block: w.block }]
				: ctx.frames.filter((f) => f.uses.includes(w.file ?? "")).flatMap((f) => PRICE_ROWS[f.screen].map((block) => ({ frame: f.id, block })));
		for (const target of targets) {
			const rect = ctx.blockScreen(target.frame, target.block);
			if (rect === undefined) continue;
			marks.set(`${target.frame}-${target.block}-${w.actor}`, { rect, color: colorOf(w.actor), age });
		}
	}
	for (const entry of ctx.scn.ledger ?? []) {
		const frames = entry.file === undefined ? [ctx.frame(entry.frame)] : ctx.frames.filter((f) => f.uses.includes(entry.file ?? ""));
		for (const f of frames) {
			if (f === undefined) continue;
			const blocks = entry.file === undefined ? entry.blocks : PRICE_ROWS[f.screen];
			for (const b of blocks) {
				const rect = ctx.blockScreen(f.id, b);
				if (rect !== undefined) marks.set(`${f.id}-${b}-${entry.actor}`, { rect, color: colorOf(entry.actor), age: 1.5 });
			}
		}
	}
	let i = 0;
	return (
		<>
			{[...marks].map(([key, m]) => {
				i += 1;
				const u = Math.max(0, (m.age - 0.8) / 5.2);
				return (
					<span
						key={key}
						className="absolute rounded-full"
						style={{ left: m.rect.x, top: m.rect.y + m.rect.h + 2 + (i % 2), width: m.rect.w, height: 2 - u, background: m.color, opacity: 0.9 * (1 - u) }}
					/>
				);
			})}
		</>
	);
}

function ShotMarks({ ctx }: { ctx: Ctx }) {
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

/* ---------- the tray ---------- */

interface TrayItem {
	readonly key: string;
	readonly actor: ActorId;
	readonly head: string;
	readonly tail: string;
	readonly arrow: string | null;
	readonly gone: number;
}

function arrowFor(angle: number): string {
	const arrows = ["→", "↘", "↓", "↙", "←", "↖", "↑", "↗"];
	const i = Math.round(((angle + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8;
	return arrows[i] ?? "→";
}

/**
 * What is not on screen, at the viewport's foot: off-screen people by name, and
 * off-screen files with their holder and how far. Coming back, the same tray
 * holds what changed while you were away, and a file leaves it once you have
 * looked at its frame.
 */
function Tray({ ctx }: { ctx: Ctx }) {
	const items: TrayItem[] = [];
	if (ctx.scn.ledger !== undefined) {
		for (const e of ctx.scn.ledger) {
			const seenAt = ctx.seen.get(e.frame);
			const gone = seenAt === undefined ? 0 : Math.min(1, (ctx.t - seenAt) / 0.5);
			items.push({
				key: `${e.actor}-${e.frame}`,
				actor: e.actor,
				head: e.file ?? `${e.frame}/frame.tsx`,
				tail: `${isAgent(e.actor) ? agentLabel(e.actor) : ownerOf(e.actor).id} · ${e.writes} writes · ${e.ago}m`,
				arrow: null,
				gone,
			});
		}
	}
	for (const person of ctx.people) {
		if (onScreen(person.screen, 4) || person.actor === ctx.follow) continue;
		const e = edgePoint(person.screen, 0);
		items.push({ key: person.actor, actor: person.actor, head: ownerOf(person.actor).name, tail: "", arrow: arrowFor(e.angle), gone: 0 });
	}
	for (const tile of tilesOf(ctx)) {
		const at = toScreen(ctx.cam, tile.world);
		const r = tile.shared ? undefined : ctx.frameScreen(tile.frames[0]?.id ?? "");
		const visible = r === undefined ? onScreen(at, 0) : r.x + r.w > 0 && r.x < VIEW.w && r.y + r.h > 0 && r.y < VIEW.h;
		if (visible) continue;
		const centre = r === undefined ? at : { x: r.x + r.w / 2, y: r.y + r.h / 2 };
		const e = edgePoint(centre, 0);
		const holder = tile.holders[0];
		if (holder === undefined || holder.actor === "you:agent" || holder.actor === ctx.follow) continue;
		items.push({
			key: tile.file,
			actor: holder.actor,
			head: tile.file,
			tail: `${agentLabel(holder.actor)} · ${fmtPx(Math.hypot(centre.x - e.at.x, centre.y - e.at.y) / ctx.cam.z)}px`,
			arrow: arrowFor(e.angle),
			gone: 0,
		});
	}
	if (items.length === 0) return null;
	return (
		<div className="absolute bottom-4 left-4 flex flex-col gap-1">
			{items.map((item) => (
				<div key={item.key} className="overflow-hidden" style={{ height: 28 * (1 - item.gone), marginTop: item.gone > 0 ? -4 * item.gone : 0, opacity: 1 - item.gone }}>
					<div className="overflow-hidden">
						<div className="flex w-fit items-center gap-1.5 whitespace-nowrap rounded-sm border border-border-raised bg-bg px-1.5 py-1">
							<ActorMark actor={item.actor} size={13} busy={item.arrow !== null && isAgent(item.actor)} />
							{isAgent(item.actor) || item.tail !== "" ? (
								<span className="text-text type-detail">{item.head}</span>
							) : (
								<span className="text-text type-caption">{item.head}</span>
							)}
							{item.tail === "" ? null : <span className="type-detail" style={{ color: colorOf(item.actor) }}>{item.tail}</span>}
							{item.arrow === null ? null : <span className="text-muted type-detail">{item.arrow}</span>}
						</div>
					</div>
				</div>
			))}
		</div>
	);
}

/* ---------- following ---------- */

function Following({ ctx }: { ctx: Ctx }) {
	if (ctx.follow === null) return null;
	const follow = ctx.follow;
	const color = colorOf(follow);
	const agent = ctx.agents.find((a) => a.actor === follow);
	return (
		<>
			<span className="absolute inset-x-0 top-0 h-[2px]" style={{ background: color }} />
			<span className="-translate-x-1/2 absolute top-3 left-1/2 flex items-center gap-1.5 rounded-sm border border-border-raised bg-bg px-2 py-1 type-detail">
				<ActorMark actor={follow} size={13} busy={agent?.mode === "write"} />
				<span style={{ color }}>following {isAgent(follow) ? agentLabel(follow) : ownerOf(follow).id}</span>
				{agent === undefined ? null : <span className="text-text">{fileOf(agent)}</span>}
				<span className="text-muted">· esc stops</span>
			</span>
		</>
	);
}

