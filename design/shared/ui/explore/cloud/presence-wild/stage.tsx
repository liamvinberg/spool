import { memo, type ReactNode } from "react";
import { cn } from "shared/lib/utils";
import { CoffeeScreen } from "shared/ui/demo/coffee-screens";
import { CanvasChrome, type PageRow } from "shared/ui/spool/canvas-chrome";
import { SpoolShell } from "shared/ui/spool/shell";
import { ScrubBar, useClock } from "shared/ui/explore/cloud/presence-wild/clock";
import {
	type AgentNow,
	agentNow,
	type Aim,
	BLOCKS,
	type Cam,
	camOf,
	clamp,
	ease,
	easeOut,
	type Follow,
	FRAMES,
	type FrameBox,
	frame,
	lerp,
	type Person,
	type PersonPlan,
	PEOPLE,
	plateInk,
	pointerOf,
	roomOf,
	type Scene,
	type Vec,
	type View,
	VIEWPORT,
	agentName,
} from "shared/ui/explore/cloud/presence-wild/world";

export interface Box {
	readonly x: number;
	readonly y: number;
	readonly w: number;
	readonly h: number;
}

export interface PersonNow {
	readonly person: Person;
	readonly plan: PersonPlan;
	/** world position, null when they are not on this page */
	readonly pointer: Vec | null;
	readonly room: FrameBox | null;
}

/** everything a take needs to draw one instant */
export interface Ctx {
	readonly t: number;
	readonly scene: Scene;
	readonly cam: Cam;
	readonly agents: readonly AgentNow[];
	readonly people: readonly PersonNow[];
	readonly entered: string | null;
	readonly follow: Follow | null;
	/** what the watcher's cursor is resting on, if it is a thing a take drew */
	readonly hovered: Aim | null;
	box: (f: FrameBox) => Box;
	at: (v: Vec) => Vec;
	visible: (b: Box, pad?: number) => boolean;
	/** which wall of its frame an agent's thread stands on: the first one there takes the left */
	side: (a: AgentNow) => "left" | "right";
}

export interface Take {
	/** a take may move the camera itself, as a catch-up walk does */
	readonly steer?: ((scene: Scene, t: number) => View | null) | undefined;
	readonly labelStart?: ((ctx: Ctx, f: FrameBox, b: Box) => ReactNode) | undefined;
	readonly labelEnd?: ((ctx: Ctx, f: FrameBox, b: Box) => ReactNode) | undefined;
	/** below the frames' labels and above the frames */
	readonly under?: ((ctx: Ctx) => ReactNode) | undefined;
	readonly overlay: (ctx: Ctx) => ReactNode;
	/** where on screen a person, an agent or a control of this take is drawn */
	readonly aim: (ctx: Ctx, aim: Aim) => Vec | null;
	readonly pages?: ((ctx: Ctx) => readonly PageRow[]) | undefined;
	/** the shipped follow treatment: a coloured edge on the viewport and a chip */
	readonly followChip?: boolean | undefined;
}

export function PresenceWindow({ scene, take }: { scene: Scene; take: Take }) {
	const clock = useClock(scene.duration, scene.poster);
	const t = clock.t;
	const ctx = buildCtx(scene, take, t);
	const yours = ctx.agents.find((a) => a.person.id === "you");
	const pages = take.pages?.(ctx) ?? defaultPages(ctx);
	return (
		<div className="flex h-full w-full flex-col overflow-hidden bg-bg">
			<div className="min-h-0 flex-1">
				<SpoolShell activeTab="kaffe" tabs={["kaffe", "spool"]} zoom={`${Math.round(ctx.cam.k * 100)}%`}>
					<CanvasChrome
						pages={pages}
						rail={null}
						selected={ctx.entered ?? undefined}
						life={yours?.span === null || yours === undefined ? undefined : "running"}
					>
						<Viewport ctx={ctx} take={take} />
					</CanvasChrome>
				</SpoolShell>
			</div>
			<ScrubBar
				t={t}
				duration={scene.duration}
				playing={clock.playing}
				beats={scene.beats}
				onPlay={clock.setPlaying}
				onSeek={clock.seek}
			/>
		</div>
	);
}

function defaultPages(_ctx: Ctx): readonly PageRow[] {
	return [
		{ name: "app", frames: FRAMES.map((f) => f.name), active: true, open: true },
		{ name: "marketing", frames: ["landing", "pricing", "press"] },
		{ name: "explore", frames: ["loyalty-cards", "loyalty-stamps", "tipping"] },
	].map((page) => page);
}

function buildCtx(scene: Scene, take: Take, t: number): Ctx {
	const view = take.steer?.(scene, t) ?? scene.camera(t);
	const cam = camOf(view);
	const at = (v: Vec): Vec => ({ x: (v.x - cam.x) * cam.k, y: (v.y - cam.y) * cam.k });
	const box = (f: FrameBox): Box => ({ x: (f.x - cam.x) * cam.k, y: (f.y - cam.y) * cam.k, w: f.w * cam.k, h: f.h * cam.k });
	const visible = (b: Box, pad = 0) => b.x + b.w > -pad && b.x < VIEWPORT.w + pad && b.y + b.h > -pad && b.y < VIEWPORT.h + pad;
	const agents = scene.agents.map((plan) => agentNow(plan, t));
	const people = scene.people.map((plan) => ({
		person: PEOPLE[plan.id],
		plan,
		pointer: pointerOf(plan, t),
		room: roomOf(plan, t),
	}));
	const side = (a: AgentNow): "left" | "right" => {
		if (a.frame === null || a.span === null) return "left";
		const name = a.frame.name;
		const here = agents
			.filter((other) => other.frame?.name === name && other.span !== null)
			.sort((p, q) => (p.span?.from ?? 0) - (q.span?.from ?? 0));
		return here.indexOf(a) === 1 ? "right" : "left";
	};
	const partial: Omit<Ctx, "hovered"> = {
		t,
		scene,
		cam,
		agents,
		people,
		entered: scene.entered?.(t) ?? null,
		follow: scene.follow?.(t) ?? null,
		box,
		at,
		visible,
		side,
	};
	const hovered = hoveredAim(scene, t);
	return { ...partial, hovered };
}

function same(a: Aim | null, b: Aim | null): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}

function hoveredAim(scene: Scene, t: number): Aim | null {
	const keys = scene.cursor ?? [];
	for (let i = 0; i < keys.length - 1; i += 1) {
		const a = keys[i];
		const b = keys[i + 1];
		if (a === undefined || b === undefined) continue;
		if (t >= a[0] && t < b[0] && a[1] !== null && same(a[1], b[1]) && a[1].kind !== "screen" && a[1].kind !== "frame") return a[1];
	}
	return null;
}

function resolve(ctx: Ctx, take: Take, aim: Aim): Vec | null {
	if (aim.kind === "screen") return { x: aim.x, y: aim.y };
	if (aim.kind === "frame") {
		const b = ctx.box(frame(aim.name));
		return { x: b.x + b.w * aim.fx, y: b.y + b.h * aim.fy };
	}
	return take.aim(ctx, aim);
}

function cursorAt(ctx: Ctx, take: Take): Vec | null {
	const keys = ctx.scene.cursor ?? [];
	const t = ctx.t;
	for (let i = 0; i < keys.length - 1; i += 1) {
		const a = keys[i];
		const b = keys[i + 1];
		if (a === undefined || b === undefined) continue;
		if (t >= a[0] && t < b[0]) {
			if (a[1] === null) return null;
			const from = resolve(ctx, take, a[1]);
			if (b[1] === null || from === null) return from;
			const to = resolve(ctx, take, b[1]) ?? from;
			const u = ease(clamp((t - a[0]) / (b[0] - a[0])));
			return { x: lerp(from.x, to.x, u), y: lerp(from.y, to.y, u) };
		}
	}
	return null;
}

const Field = memo(function Field() {
	return (
		<>
			{FRAMES.map((f) => (
				<div key={f.name} className="absolute" style={{ left: f.x, top: f.y, width: f.w, height: f.h }}>
					<CoffeeScreen screen={f.screen} scale="full" />
				</div>
			))}
		</>
	);
});

function Viewport({ ctx, take }: { ctx: Ctx; take: Take }) {
	const { cam } = ctx;
	const cursor = cursorAt(ctx, take);
	const click = (ctx.scene.clicks ?? []).map((at) => ctx.t - at).find((age) => age >= 0 && age < 0.45);
	const followed = ctx.follow === null ? null : PEOPLE[ctx.follow.who];
	const back = ctx.scene.away === undefined ? 0 : 1 - easeOut(clamp(ctx.t / 1.1));
	return (
		<div className="absolute inset-0 overflow-hidden">
			<div
				className="absolute top-0 left-0 origin-top-left"
				style={{ transform: `translate(${-cam.x * cam.k}px, ${-cam.y * cam.k}px) scale(${cam.k})` }}
			>
				<Field />
			</div>
			{take.under?.(ctx)}
			<Labels ctx={ctx} take={take} />
			<HandLayer ctx={ctx} />
			{take.overlay(ctx)}
			{followed === null || take.followChip === false ? null : (
				<FollowEdge ctx={ctx} person={followed} agent={ctx.follow?.agent === true} />
			)}
			{cursor === null ? null : <YourCursor at={cursor} click={click} />}
			{back <= 0 ? null : <div className="pointer-events-none absolute inset-0 bg-bg" style={{ opacity: back * 0.85 }} />}
		</div>
	);
}

/** frame names, at the size the canvas draws them at every zoom: the label never scales */
function Labels({ ctx, take }: { ctx: Ctx; take: Take }) {
	return (
		<div className="pointer-events-none absolute inset-0">
			{FRAMES.map((f) => {
				const b = ctx.box(f);
				if (!ctx.visible(b, 40)) return null;
				const entered = ctx.entered === f.name;
				return (
					<div
						key={f.name}
						className="absolute flex items-center gap-1.5"
						style={{ left: b.x, top: b.y - 22, width: Math.max(b.w, 60), height: 18 }}
					>
						{take.labelStart?.(ctx, f, b)}
						{entered ? (
							<span className="shrink-0 rounded-xs bg-thread px-2 py-[1px] text-on-thread type-detail">live · esc exits</span>
						) : (
							<span className="min-w-0 flex-1 truncate text-muted type-value">{f.name}</span>
						)}
						{entered ? <span className="flex-1" /> : null}
						{take.labelEnd?.(ctx, f, b)}
					</div>
				);
			})}
		</div>
	);
}

/** where a block sits on a frame on screen */
export function blockBox(b: Box, block: number): Box {
	const spec = BLOCKS[block] ?? BLOCKS[1] ?? { y: 0.1, h: 0.2 };
	return { x: b.x + b.w * 0.04, y: b.y + b.h * spec.y, w: b.w * 0.92, h: b.h * spec.h };
}

/**
 * The shipped hand, with one change: it wears its owner's colour. Thread on the wall,
 * full height while reading, a short run beside the block being written, corners while
 * it photographs; a plate on every block a write changes.
 */
function HandLayer({ ctx }: { ctx: Ctx }) {
	return (
		<svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
			{ctx.agents.flatMap((a) =>
				a.plan.writes.map((w, i) => {
					const age = ctx.t - w.at;
					const ink = plateInk(age);
					if (ink <= 0) return null;
					const b = ctx.box(frame(w.frame));
					if (!ctx.visible(b, 10)) return null;
					const block = blockBox(b, w.block);
					const open = 0.34 + 0.66 * easeOut(clamp(age / 0.14));
					return (
						<rect
							key={`${a.person.id}-${i}`}
							x={block.x}
							y={block.y + (block.h * (1 - open)) / 2}
							width={block.w}
							height={block.h * open}
							rx={3}
							fill={a.person.color}
							opacity={ink * 0.26}
						/>
					);
				}),
			)}
			{ctx.agents.map((a) => (
				<Thread key={a.person.id} ctx={ctx} a={a} />
			))}
		</svg>
	);
}

export function threadGeometry(ctx: Ctx, a: AgentNow) {
	const span = a.span ?? a.closing?.span ?? null;
	if (span === null) return null;
	const b = ctx.box(frame(span.frame));
	const side = ctx.side(a);
	const wall = side === "left" ? b.x - 8 : b.x + b.w + 8;
	const part = Math.min(76, Math.max(16, b.h * 0.2));
	const writes = a.plan.writes.filter((w) => w.frame === span.frame && w.at <= ctx.t && w.at >= span.from);
	const last = writes.at(-1);
	const prev = writes.at(-2);
	const centre = (block: number) => {
		const bb = blockBox(b, block);
		return bb.y + bb.h / 2;
	};
	const y =
		last === undefined
			? b.y + b.h / 2
			: prev === undefined
				? centre(last.block)
				: lerp(centre(prev.block), centre(last.block), ease(clamp((ctx.t - last.at) / 0.22)));
	const grow = easeOut(clamp((a.span === null ? 0 : a.since) / 0.24));
	const fade = a.closing === null ? 1 : 1 - clamp(a.closing.ago / 0.3);
	const verb = span.verb;
	const length = verb === "read" ? b.h * grow : part * grow;
	const mid = verb === "read" ? b.y + b.h / 2 : y;
	return { b, wall, mid, length, verb, fade, side };
}

function Thread({ ctx, a }: { ctx: Ctx; a: AgentNow }) {
	const g = threadGeometry(ctx, a);
	if (g === null || !ctx.visible(g.b, 20)) return null;
	const color = a.person.color;
	if (g.verb === "shot") {
		const arm = Math.min(11, g.b.w * 0.12);
		const out = 5;
		const { x, y, w, h } = g.b;
		const corners = [
			[x - out, y - out, 1, 1],
			[x + w + out, y - out, -1, 1],
			[x - out, y + h + out, 1, -1],
			[x + w + out, y + h + out, -1, -1],
		] as const;
		return (
			<g opacity={g.fade}>
				{corners.map(([cx, cy, dx, dy]) => (
					<path
						key={`${cx}-${cy}`}
						d={`M${cx + dx * arm} ${cy}H${cx}V${cy + dy * arm}`}
						stroke={color}
						strokeWidth={2}
						fill="none"
						strokeLinecap="round"
					/>
				))}
			</g>
		);
	}
	return (
		<g opacity={g.fade}>
			<line
				x1={g.wall}
				x2={g.wall}
				y1={g.mid - g.length / 2}
				y2={g.mid + g.length / 2}
				stroke={color}
				strokeWidth={2}
				strokeLinecap="round"
			/>
		</g>
	);
}

/** the camera is someone else's: its edge says whose, and esc gives it back */
function FollowEdge({ ctx, person, agent }: { ctx: Ctx; person: Person; agent: boolean }) {
	const since = ctx.follow === null ? 0 : ctx.t - (ctx.scene.follow === undefined ? 0 : startOf(ctx));
	const u = easeOut(clamp(since / 0.3));
	return (
		<>
			<div
				className="pointer-events-none absolute inset-0"
				style={{ border: `2px solid ${person.color}`, opacity: u }}
			/>
			<div
				className="absolute top-3 left-1/2 flex items-center gap-2 rounded-sm bg-bg py-1 pr-2.5 pl-1.5"
				style={{ opacity: u, transform: `translate(-50%, ${(1 - u) * -6}px)`, outline: `1px solid ${person.color}` }}
			>
				{agent ? <AgentRing person={person} size={16} /> : <PersonDisc person={person} size={16} />}
				<span className="text-text type-detail">following {agent ? agentName(person.id) : person.name.toLowerCase()}</span>
				<span className="text-muted type-detail">esc</span>
			</div>
		</>
	);
}

function startOf(ctx: Ctx): number {
	const now = ctx.follow;
	let start = ctx.t;
	while (start > 0) {
		const before = ctx.scene.follow?.(start - 0.05) ?? null;
		if (before === null || before.agent !== now?.agent) break;
		start -= 0.05;
	}
	return start;
}

function YourCursor({ at, click }: { at: Vec; click: number | undefined }) {
	return (
		<div className="pointer-events-none absolute top-0 left-0 z-30" style={{ transform: `translate(${at.x}px, ${at.y}px)` }}>
			{click === undefined ? null : (
				<span
					className="-translate-x-1/2 -translate-y-1/2 absolute top-0 left-0 rounded-full border border-text"
					style={{
						width: 6 + 26 * easeOut(click / 0.45),
						height: 6 + 26 * easeOut(click / 0.45),
						opacity: 1 - click / 0.45,
					}}
				/>
			)}
			<svg width="18" height="22" viewBox="0 0 18 22" className="-translate-x-[2px] -translate-y-[1px]" aria-hidden="true">
				<path d="M2 1.5v16.2l4.1-3.9 2.7 6.2 2.9-1.3-2.7-6.1h5.8Z" fill="#f0efed" stroke="#0e0e0e" strokeWidth="1.3" strokeLinejoin="round" />
			</svg>
		</div>
	);
}

/** a person: filled, in their colour, their initial */
export function PersonDisc({ person, size = 18, dim = false }: { person: Person; size?: number; dim?: boolean }) {
	return (
		<span
			className="inline-flex shrink-0 items-center justify-center rounded-full font-medium transition-opacity duration-300"
			style={{
				width: size,
				height: size,
				background: person.color,
				color: "#0e0e0e",
				fontSize: Math.max(7, size * 0.56),
				lineHeight: 1,
				opacity: dim ? 0.45 : 1,
			}}
		>
			{size >= 12 ? person.initial : null}
		</span>
	);
}

/**
 * Their agent: the same colour as a ring, the same initial inside it. A person is solid
 * and the thing working for them is hollow, so a pair reads as a pair at a glance and
 * the two are never mistaken for each other. While it works, an arc runs round the ring.
 */
export function AgentRing({ person, size = 18, turning }: { person: Person; size?: number; turning?: number | undefined }) {
	const r = size / 2 - 1.5;
	const c = size / 2;
	return (
		<span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
			<svg width={size} height={size} className="absolute inset-0" aria-hidden="true">
				<circle cx={c} cy={c} r={r} fill="#0e0e0e" stroke={person.color} strokeWidth={1.5} strokeOpacity={turning === undefined ? 1 : 0.35} />
				{turning === undefined ? null : (
					<path
						d={`M${c} ${c - r}A${r} ${r} 0 0 1 ${c + r} ${c}`}
						stroke={person.color}
						strokeWidth={1.6}
						fill="none"
						strokeLinecap="round"
						transform={`rotate(${(turning * 313) % 360} ${c} ${c})`}
					/>
				)}
			</svg>
			{size >= 12 ? (
				<span className="relative font-medium" style={{ color: person.color, fontSize: Math.max(7, size * 0.5), lineHeight: 1 }}>
					{person.initial}
				</span>
			) : null}
		</span>
	);
}

/** someone else's pointer: their colour, and their name when there is room for it */
export function RemotePointer({ person, at, name = true, opacity = 1 }: { person: Person; at: Vec; name?: boolean; opacity?: number }) {
	return (
		<div className="pointer-events-none absolute top-0 left-0" style={{ transform: `translate(${at.x}px, ${at.y}px)`, opacity }}>
			<svg width="14" height="17" viewBox="0 0 18 22" className="-translate-x-[1px]" aria-hidden="true">
				<path d="M2 1.5v16.2l4.1-3.9 2.7 6.2 2.9-1.3-2.7-6.1h5.8Z" fill={person.color} stroke="#0e0e0e" strokeWidth="1.4" strokeLinejoin="round" />
			</svg>
			{name ? (
				<span
					className="absolute top-[14px] left-[10px] whitespace-nowrap rounded-[5px] px-1.5 py-[1px] font-medium type-caption"
					style={{ background: person.color, color: "#0e0e0e" }}
				>
					{person.name}
				</span>
			) : null}
		</div>
	);
}

/**
 * Where a ray from the middle of the viewport toward a point leaves it, pulled in by
 * `inset`, and which wall it leaves through.
 */
export function edgePoint(target: Vec, inset: number): { at: Vec; wall: "top" | "right" | "bottom" | "left"; angle: number } {
	const cx = VIEWPORT.w / 2;
	const cy = VIEWPORT.h / 2;
	const dx = target.x - cx;
	const dy = target.y - cy;
	const hw = cx - inset;
	const hh = cy - inset;
	const sx = dx === 0 ? Number.POSITIVE_INFINITY : hw / Math.abs(dx);
	const sy = dy === 0 ? Number.POSITIVE_INFINITY : hh / Math.abs(dy);
	const s = Math.min(sx, sy);
	const at = { x: cx + dx * s, y: cy + dy * s };
	const wall = sx < sy ? (dx > 0 ? "right" : "left") : dy > 0 ? "bottom" : "top";
	return { at, wall, angle: Math.atan2(dy, dx) };
}

export function onViewport(v: Vec, pad = 0): boolean {
	return v.x >= -pad && v.x <= VIEWPORT.w + pad && v.y >= -pad && v.y <= VIEWPORT.h + pad;
}

export function Chip({ children, className, color }: { children: ReactNode; className?: string | undefined; color?: string | undefined }) {
	return (
		<span
			className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm border border-border-raised bg-bg px-1.5 py-[2px] type-detail", className)}
			style={color === undefined ? undefined : { borderColor: color }}
		>
			{children}
		</span>
	);
}
