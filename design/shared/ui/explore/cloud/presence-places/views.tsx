import { cn } from "shared/lib/utils";
import { Stage, useClock } from "shared/ui/explore/cloud/presence-places/clock";
import {
	AgentNode,
	type Camera,
	edgePoint,
	AwayVeil,
	Hands,
	ink,
	NameRow,
	onScreenBox,
	PersonDot,
	Plates,
	visible,
	World,
} from "shared/ui/explore/cloud/presence-places/field";
import { appPlace, type Place, placesAt, whereIs } from "shared/ui/explore/cloud/presence-places/occupancy";
import {
	agentFrame,
	cameraAt,
	followAt,
	personAt,
	pointerAt,
	SCENARIOS,
	type Scenario,
	type ScenarioId,
	platesAt,
} from "shared/ui/explore/cloud/presence-places/scenarios";
import { type AwayNews, awayMarks, followChipText, kaffePages } from "shared/ui/explore/cloud/presence-places/shell-bits";
import {
	agentName,
	type BlockId,
	blockBox,
	type Box,
	clamp01,
	easeInOut,
	easeOut,
	FRAMES,
	type FrameName,
	frameOf,
	lerp,
	MEMBERS,
	TEAM,
	VH,
	VW,
	type Who,
	WORLD,
} from "shared/ui/explore/cloud/presence-places/world";
import { CanvasChrome } from "shared/ui/spool/canvas-chrome";
import { SpoolShell } from "shared/ui/spool/shell";
import { UnseenMark } from "shared/ui/spool/unseen-mark";

/**
 * Views. What a person is doing on a canvas of many frames is looking at a part
 * of it, so the place a person occupies is the rectangle their window shows: drawn
 * on the canvas as a thin outline in their colour, named once at its corner. An
 * agent occupies the one frame it holds, which the hand already draws. Following
 * someone is taking their rectangle as your own.
 *
 * A small map of the whole page carries every view and every held frame, so off
 * screen is never unknown. There are no pointers anywhere; inside a frame you share,
 * what someone has selected is drawn instead, which is the part of a pointer that
 * was ever about a place.
 */
export function ViewsStage({ scenario }: { scenario: ScenarioId }) {
	const scene = SCENARIOS[scenario];
	const clock = useClock(scene.total);
	const t = clock.t;
	const cam = cameraAt(scene.camera, t);
	const places = placesAt(scene, t);
	const follow = followAt(scene, t);
	const entered = scene.enter !== undefined && t >= scene.enter.at ? scene.enter.frame : null;
	const followedPerson = follow?.kind === "person" ? follow.who : null;
	const views = TEAM.map((who) => viewOf(scene, who, t, followedPerson === who ? cam : null)).filter((v): v is View => v !== null);
	const inside = new Set<string>();
	if (entered !== null) inside.add(entered);
	if (followedPerson !== null) {
		const place = whereIs(places, followedPerson, "person");
		if (place !== null) inside.add(place.frame);
	}
	const away = awayMarks(scene, t);

	return (
		<Stage t={t} total={scene.total} playing={clock.playing} beats={scene.beats} onToggle={clock.toggle} onSeek={clock.seek}>
			<SpoolShell activeTab="kaffe" tabs={["kaffe", "spool"]} zoom={`${Math.round(cam.k * 100)}%`}>
				<CanvasChrome pages={kaffePages(scene, t)} rail={null}>
					<World cam={cam} />
					<Plates scene={scene} t={t} cam={cam} />
					<Selections scene={scene} t={t} cam={cam} inside={inside} />
					<Labels cam={cam} entered={entered} away={away} />
					<ViewOutlines views={views} cam={cam} followed={followedPerson} />
					<Hands scene={scene} t={t} cam={cam} />
					<AwayVeil scene={scene} t={t} />
					<AgentTags cam={cam} places={places} />
					<EdgeTicks views={views} scene={scene} t={t} cam={cam} />
					<Overview scene={scene} t={t} cam={cam} views={views} places={places} away={away} />
					{follow === null ? null : (
						<>
							{follow.kind === "person" ? (
								<div
									className="pointer-events-none absolute inset-0 rounded-[2px]"
									style={{ boxShadow: `inset 0 0 0 2px ${ink(follow.who)}`, opacity: follow.from < 0.01 ? 1 : easeOut(clamp01((t - follow.from) / 0.3)) }}
								/>
							) : null}
							<div className="pointer-events-none absolute inset-x-0 bottom-[84px] flex justify-center">
								<div className="flex h-7 items-center gap-2 rounded-sm border border-border-raised bg-bg px-2.5">
									{follow.kind === "person" ? <PersonDot who={follow.who} /> : <AgentNode who={follow.who} />}
									<span className="text-text type-detail">{followChipText(follow.who, follow.kind)}</span>
								</div>
							</div>
						</>
					)}
				</CanvasChrome>
			</SpoolShell>
		</Stage>
	);
}

/* ---------- a person's view ---------- */

interface View {
	who: Who;
	box: Box;
	alpha: number;
	/** a view left behind by someone who has gone */
	ghost?: string | undefined;
}

/** how far in each teammate tends to work: the scene says where they are, this says how much they see */
const ZOOM: Readonly<Record<Who, number>> = { you: 1, ana: 0.62, ben: 0.5, cleo: 0.44, dev: 0.38 };
const SEED: Readonly<Record<Who, number>> = { you: 0, ana: 0.3, ben: 1.7, cleo: 2.9, dev: 4.1 };

function centreOf(frame: string): { x: number; y: number } {
	const box = frameOf(frame);
	return { x: box.x + box.w / 2, y: box.y + box.h / 2 };
}

function viewOf(scene: Scenario, who: Who, t: number, followedCam: Camera | null): View | null {
	if (followedCam !== null) {
		return { who, box: { x: followedCam.x - VW / 2 / followedCam.k, y: followedCam.y - VH / 2 / followedCam.k, w: VW / followedCam.k, h: VH / followedCam.k }, alpha: 1 };
	}
	const spans = scene.people[who] ?? [];
	const i = spans.findIndex((span) => t >= span.from && t < span.to + 0.45);
	const span = spans[i];
	if (span === undefined || span.page !== "app") {
		const gone = scene.away?.left.find((g) => g.who === who);
		if (gone === undefined || scene.away === undefined || t < scene.away.back) return null;
		const c = centreOf(gone.frame);
		const k = ZOOM[who];
		return {
			who,
			box: { x: c.x - VW / 2 / k, y: c.y - VH / 2 / k, w: VW / k, h: VH / k },
			alpha: easeOut(clamp01((t - scene.away.back - 0.6) / 0.4)),
			ghost: gone.ago,
		};
	}
	const prev = spans[i - 1];
	const to = centreOf(span.frame);
	const moving = prev !== undefined && prev.page === "app" && Math.abs(prev.to - span.from) < 0.01;
	const from = moving ? centreOf(prev.frame) : to;
	const v = easeInOut((t - span.from) / 1.1);
	// people pan a little while they look; slow enough to read as a person, never as noise
	const drift = { x: Math.sin(t * 0.35 + SEED[who]) * 40, y: Math.cos(t * 0.27 + SEED[who]) * 26 };
	const x = lerp(from.x, to.x, v) + drift.x;
	const y = lerp(from.y, to.y, v) + drift.y;
	const k = ZOOM[who];
	const arriving = moving || span.from < 0.01 ? 1 : easeOut(clamp01((t - span.from) / 0.35));
	const leaving = t > span.to && span.to < scene.total - 0.01 ? 1 - clamp01((t - span.to) / 0.45) : 1;
	return { who, box: { x: x - VW / 2 / k, y: y - VH / 2 / k, w: VW / k, h: VH / k }, alpha: Math.min(arriving, leaving) };
}

function ViewOutlines({ views, cam, followed }: { views: readonly View[]; cam: Camera; followed: Who | null }) {
	return (
		<div className="pointer-events-none absolute inset-0">
			{views.map((view) => {
				// a view left behind lives on the map; on the canvas the frame's name says it
				if (view.who === followed || view.ghost !== undefined) return null;
				const rect = onScreenBox(cam, view.box);
				const color = MEMBERS[view.who].color;
				// the corner the name sits in, kept inside the viewport while any of the view is
				const tagX = Math.min(Math.max(rect.x, 10), VW - 120);
				const tagY = Math.min(Math.max(rect.y, 10), VH - 30);
				const shown = visible(rect, 0);
				return (
					<div key={view.who} style={{ opacity: view.alpha }}>
						<Viewfinder rect={rect} color={color} ghost={view.ghost !== undefined} />
						{shown ? (
							<span
								className="absolute flex items-center gap-1.5 whitespace-nowrap rounded-xs px-1.5 py-[1px] font-sans text-[11px] leading-4"
								style={{
									left: tagX + 6,
									top: tagY + 6,
									background: view.ghost === undefined ? color : "transparent",
									color: view.ghost === undefined ? "#0e0e0e" : color,
									boxShadow: view.ghost === undefined ? undefined : `inset 0 0 0 1px ${color}`,
								}}
							>
								{MEMBERS[view.who].name}
								{view.ghost === undefined ? null : <span className="font-mono">left {view.ghost} ago</span>}
							</span>
						) : null}
					</div>
				);
			})}
		</div>
	);
}

/**
 * A view is drawn as a viewfinder: four corners in the owner's colour and the open
 * sides between them, so a view that runs across frames never draws a line
 * through them.
 */
function Viewfinder({ rect, color, ghost }: { rect: Box; color: string; ghost: boolean }) {
	const arm = Math.min(34, rect.w / 4, rect.h / 4);
	const r = 6;
	const { x, y, w, h } = rect;
	const x1 = x + w;
	const y1 = y + h;
	const d = [
		`M ${x} ${y + arm} V ${y + r} Q ${x} ${y} ${x + r} ${y} H ${x + arm}`,
		`M ${x1 - arm} ${y} H ${x1 - r} Q ${x1} ${y} ${x1} ${y + r} V ${y + arm}`,
		`M ${x1} ${y1 - arm} V ${y1 - r} Q ${x1} ${y1} ${x1 - r} ${y1} H ${x1 - arm}`,
		`M ${x + arm} ${y1} H ${x + r} Q ${x} ${y1} ${x} ${y1 - r} V ${y1 - arm}`,
	].join(" ");
	return (
		<svg className="absolute inset-0 h-full w-full overflow-visible" fill="none" aria-hidden="true">
			<path d={d} stroke={color} strokeWidth={2} strokeLinecap="round" strokeOpacity={ghost ? 0.45 : 0.9} strokeDasharray={ghost ? "3 4" : undefined} />
		</svg>
	);
}

/* ---------- agents, named at the node ---------- */

function AgentTags({ cam, places }: { cam: Camera; places: Map<string, Place> }) {
	if (cam.k < 0.4) return null;
	const tags: { key: string; x: number; y: number; who: Who; right: boolean; alpha: number }[] = [];
	for (const place of places.values()) {
		if (place.page !== "app") continue;
		const agents = place.occupants.filter((o) => o.kind === "agent");
		agents.forEach((occupant, i) => {
			const rect = onScreenBox(cam, frameOf(place.frame));
			const right = i === 1;
			tags.push({
				key: `${occupant.who}-${place.frame}`,
				x: right ? rect.x + rect.w + 20 : rect.x - 34,
				y: rect.y,
				who: occupant.who,
				right,
				alpha: occupant.alpha,
			});
		});
	}
	return (
		<div className="pointer-events-none absolute inset-0">
			{tags.map((tag) => (
				<span
					key={tag.key}
					className="absolute whitespace-nowrap type-detail"
					style={{
						left: tag.x,
						top: tag.y,
						color: ink(tag.who),
						opacity: tag.alpha,
						writingMode: "vertical-rl",
						transform: tag.right ? undefined : "rotate(180deg)",
					}}
				>
					{agentName(tag.who)}
				</span>
			))}
		</div>
	);
}

/* ---------- selections, inside a frame you share ---------- */

function blockAt(v: number): BlockId {
	if (v < 0.09) return "head";
	if (v < 0.4) return "list";
	if (v < 0.86) return "total";
	return "cta";
}

function Selections({ scene, t, cam, inside }: { scene: Scenario; t: number; cam: Camera; inside: ReadonlySet<string> }) {
	const marks: { who: Who; box: Box; key: string }[] = [];
	for (const who of TEAM) {
		const span = personAt(scene, who, t);
		if (span === null || !inside.has(span.frame)) continue;
		const at = pointerAt(span, t);
		if (at === null) continue;
		const block = blockAt(at.v);
		marks.push({ who, key: `${who}-${span.frame}-${block}`, box: onScreenBox(cam, blockBox(frameOf(span.frame), block)) });
	}
	return (
		<div className="pointer-events-none absolute inset-0">
			{marks.map((mark) => (
				<div
					key={mark.key}
					className="absolute animate-[menu-in_180ms_cubic-bezier(0.22,0.61,0.36,1)] rounded-[4px]"
					style={{ left: mark.box.x - 3, top: mark.box.y - 3, width: mark.box.w + 6, height: mark.box.h + 6, boxShadow: `inset 0 0 0 1.5px ${ink(mark.who)}` }}
				>
					<span
						className="-top-[18px] absolute left-0 rounded-t-[3px] px-1.5 font-sans text-[11px] leading-[18px]"
						style={{ background: ink(mark.who), color: "#0e0e0e" }}
					>
						{MEMBERS[mark.who].name}
					</span>
				</div>
			))}
		</div>
	);
}

/* ---------- names ---------- */

function Labels({ cam, entered, away }: { cam: Camera; entered: string | null; away: Map<FrameName, AwayNews> }) {
	return (
		<div className="pointer-events-none absolute inset-0">
			{FRAMES.map((frame) => {
				const rect = onScreenBox(cam, frame);
				if (!visible(rect, -40)) return null;
				const news = away.get(frame.name);
				return (
					<NameRow key={frame.name} rect={rect}>
						{entered === frame.name ? (
							<span className="shrink-0 rounded-xs bg-thread px-2 py-[3px] text-on-thread type-detail">live · esc exits</span>
						) : (
							<>
								{news === undefined ? null : (
									<span style={{ opacity: news.alpha }} className="-ml-0.5 -mr-1">
										<UnseenMark mark={news.mark} />
									</span>
								)}
								<span className={cn("min-w-0 flex-1 truncate type-value", news !== undefined ? "text-text" : "text-muted")}>{frame.name}</span>
							</>
						)}
						{news?.left.map((gone) => (
							<span key={gone.who} className="flex shrink-0 items-center gap-1.5" style={{ opacity: news.alpha }}>
								<PersonDot who={gone.who} ring size={12} />
								<span className="text-muted type-detail">{gone.ago}</span>
							</span>
						))}
					</NameRow>
				);
			})}
		</div>
	);
}

/* ---------- the edge of the view ---------- */

/** a short mark on the viewport's edge toward a view or a hold you cannot see */
function EdgeTicks({ views, scene, t, cam }: { views: readonly View[]; scene: Scenario; t: number; cam: Camera }) {
	const ticks: { key: string; x: number; y: number; side: string; color: string; square: boolean; alpha: number }[] = [];
	for (const view of views) {
		if (view.ghost !== undefined) continue;
		const rect = onScreenBox(cam, view.box);
		if (visible(rect, 0)) continue;
		const e = edgePoint(rect.x + rect.w / 2, rect.y + rect.h / 2, { x: 3, y: 3 });
		ticks.push({ key: `v-${view.who}`, ...e, color: ink(view.who), square: false, alpha: view.alpha });
	}
	for (const who of [...TEAM, "you" as const]) {
		const span = agentFrame(scene, who, t);
		if (span === null) continue;
		const rect = onScreenBox(cam, frameOf(span.frame));
		if (visible(rect, 0)) continue;
		const e = edgePoint(rect.x + rect.w / 2, rect.y + rect.h / 2, { x: 9, y: 9 });
		ticks.push({ key: `a-${who}`, ...e, color: ink(who), square: true, alpha: 1 });
	}
	return (
		<div className="pointer-events-none absolute inset-0">
			{ticks.map((tick) => {
				const vertical = tick.side === "left" || tick.side === "right";
				return tick.square ? (
					<span
						key={tick.key}
						className="absolute rounded-[2px] bg-canvas"
						style={{ left: tick.x - 4.5, top: tick.y - 4.5, width: 9, height: 9, boxShadow: `inset 0 0 0 1.5px ${tick.color}`, opacity: tick.alpha }}
					/>
				) : (
					<span
						key={tick.key}
						className="absolute rounded-full"
						style={{
							left: tick.x - (vertical ? 1.5 : 14),
							top: tick.y - (vertical ? 14 : 1.5),
							width: vertical ? 3 : 28,
							height: vertical ? 28 : 3,
							background: tick.color,
							opacity: tick.alpha,
						}}
					/>
				);
			})}
		</div>
	);
}

/* ---------- the map ---------- */

const MAP_W = 196;
const MAP_S = MAP_W / WORLD.w;
const MAP_H = Math.round(WORLD.h * MAP_S);

function Overview({
	scene,
	t,
	cam,
	views,
	places,
	away,
}: {
	scene: Scenario;
	t: number;
	cam: Camera;
	views: readonly View[];
	places: Map<string, Place>;
	away: Map<FrameName, AwayNews>;
}) {
	// once the whole page is in the window the map has nothing to add, so it steps aside
	const shown = clamp01((cam.k - 0.26) / 0.04);
	if (shown <= 0) return <Elsewhere places={places} />;
	const you: Box = { x: cam.x - VW / 2 / cam.k, y: cam.y - VH / 2 / cam.k, w: VW / cam.k, h: VH / cam.k };
	const m = (box: Box): Box => ({ x: box.x * MAP_S, y: box.y * MAP_S, w: box.w * MAP_S, h: box.h * MAP_S });
	const writing = platesAt(scene, t);
	return (
		<div className="pointer-events-none absolute bottom-5 left-5 flex flex-col gap-2" style={{ opacity: shown }}>
			<Elsewhere places={places} inline />
			<div className="relative overflow-hidden rounded-md border border-border-raised bg-bg p-3">
				<div className="relative" style={{ width: MAP_W, height: MAP_H }}>
					{FRAMES.map((frame) => {
						const box = m(frame);
						const place = appPlace(places, frame.name);
						const agent = place?.occupants.find((o) => o.kind === "agent");
						const news = away.get(frame.name);
						const pulse = writing.some((w) => w.frame === frame.name) ? 1 : 0;
						const tint = agent !== undefined ? ink(agent.who) : news !== undefined ? ink(news.by[0]?.who ?? "you") : null;
						return (
							<span
								key={frame.name}
								className="absolute rounded-[1.5px] transition-[background-color] duration-300"
								style={{
									left: box.x,
									top: box.y,
									width: box.w,
									height: box.h,
									background:
										tint === null
											? "var(--color-raised)"
											: `color-mix(in srgb, ${tint} ${agent !== undefined ? 45 + pulse * 30 : Math.round(40 * (news?.alpha ?? 0))}%, var(--color-raised))`,
								}}
							/>
						);
					})}
					{views.map((view) => {
						const box = m(view.box);
						return (
							<span
								key={view.who}
								className="absolute rounded-[2px]"
								style={{
									left: box.x,
									top: box.y,
									width: box.w,
									height: box.h,
									border: `1px ${view.ghost === undefined ? "solid" : "dashed"} ${ink(view.who)}`,
									opacity: view.alpha * (view.ghost === undefined ? 0.9 : 0.4),
								}}
							/>
						);
					})}
					<span
						className="absolute rounded-[2px] border border-text"
						style={{ left: m(you).x, top: m(you).y, width: m(you).w, height: m(you).h }}
					/>
				</div>
			</div>
		</div>
	);
}

/** who is on another page: one line each, the page and the frame */
function Elsewhere({ places, inline = false }: { places: Map<string, Place>; inline?: boolean }) {
	const rows = [...places.values()].filter((p) => p.page !== "app" && p.occupants.some((o) => o.alpha > 0.01));
	if (rows.length === 0) return null;
	return (
		<div className={cn("pointer-events-none flex flex-col gap-1.5", !inline && "absolute bottom-5 left-5")}>
			{rows.map((place) => (
				<div key={`${place.page}/${place.frame}`} className="flex h-7 w-fit items-center gap-2 rounded-sm border border-border-raised bg-bg/90 px-2.5">
					{place.occupants.map((o) => (
						<span key={o.who} style={{ opacity: o.alpha }}>
							<PersonDot who={o.who} />
						</span>
					))}
					<span className="text-muted type-detail">
						{place.page} / {place.frame}
					</span>
				</div>
			))}
		</div>
	);
}
