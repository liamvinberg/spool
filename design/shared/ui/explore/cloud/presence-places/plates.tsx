import { cn } from "shared/lib/utils";
import { Stage, useClock } from "shared/ui/explore/cloud/presence-places/clock";
import {
	AgentNode,
	type Camera,
	edgePoint,
	AwayVeil,
	Hands,
	NameRow,
	onScreenBox,
	PersonDot,
	Plates,
	Pointer,
	visible,
	World,
} from "shared/ui/explore/cloud/presence-places/field";
import { appPlace, type Occupant, type Place, placesAt, verb, whereIs } from "shared/ui/explore/cloud/presence-places/occupancy";
import {
	cameraAt,
	followAt,
	personAt,
	pointerAt,
	SCENARIOS,
	type Scenario,
	type ScenarioId,
} from "shared/ui/explore/cloud/presence-places/scenarios";
import { awayMarks, followChipText, kaffePages } from "shared/ui/explore/cloud/presence-places/shell-bits";
import {
	agentName,
	clamp01,
	easeOut,
	FRAMES,
	type FrameName,
	frameOf,
	MEMBERS,
	VH,
	VW,
	type Who,
} from "shared/ui/explore/cloud/presence-places/world";
import { CanvasChrome } from "shared/ui/spool/canvas-chrome";
import { SpoolShell } from "shared/ui/spool/shell";
import { UnseenMark } from "shared/ui/spool/unseen-mark";

/**
 * Plates. A frame is a room, and its name row is the plate on the door: whoever is
 * inside is listed on it, people as discs, agents as the hand's square node in
 * their owner's colour. Nobody has a pointer out on the canvas. A place you cannot
 * see sends a door to the edge of the view, one per place rather than one per
 * person, so Ana and her claude in two rooms are two doors.
 *
 * Pointers are earned in one spot only: inside a frame you are in yourself, where
 * "this button" is the question and a pointer is the answer.
 */
export function PlatesStage({ scenario }: { scenario: ScenarioId }) {
	const scene = SCENARIOS[scenario];
	const clock = useClock(scene.total);
	const t = clock.t;
	const cam = cameraAt(scene.camera, t);
	const places = placesAt(scene, t);
	const follow = followAt(scene, t);
	const entered = scene.enter !== undefined && t >= scene.enter.at ? scene.enter.frame : null;
	const followed = follow === null ? null : whereIs(places, follow.who, follow.kind);
	// a frame you are in: entered, or the one you are carried into by following
	const inside = new Set<string>();
	if (entered !== null) inside.add(entered);
	if (followed !== null) inside.add(followed.frame);

	return (
		<Stage t={t} total={scene.total} playing={clock.playing} beats={scene.beats} onToggle={clock.toggle} onSeek={clock.seek}>
			<SpoolShell activeTab="kaffe" tabs={["kaffe", "spool"]} zoom={`${Math.round(cam.k * 100)}%`}>
				<CanvasChrome pages={kaffePages(scene, t)} rail={null}>
					<World cam={cam} />
					<Plates scene={scene} t={t} cam={cam} />
					<Hands scene={scene} t={t} cam={cam} />
					<AwayVeil scene={scene} t={t} />
					<Pointers scene={scene} t={t} cam={cam} places={places} inside={inside} />
					<Labels scene={scene} t={t} cam={cam} places={places} entered={entered} followed={followed?.frame ?? null} />
					<Doors cam={cam} places={places} />
					{follow === null ? null : <FollowChip who={follow.who} kind={follow.kind} since={follow.from} t={t} />}
				</CanvasChrome>
			</SpoolShell>
		</Stage>
	);
}

/* ---------- the plate ---------- */

type Tier = "wide" | "mid" | "narrow";

function tierOf(width: number): Tier {
	if (width >= 300) return "wide";
	if (width >= 150) return "mid";
	return "narrow";
}

function Labels({
	scene,
	t,
	cam,
	places,
	entered,
	followed,
}: {
	scene: Scenario;
	t: number;
	cam: Camera;
	places: Map<string, Place>;
	entered: string | null;
	followed: string | null;
}) {
	const away = awayMarks(scene, t);
	return (
		<div className="pointer-events-none absolute inset-0">
			{FRAMES.map((frame) => {
				const rect = onScreenBox(cam, frame);
				if (!visible(rect, -40)) return null;
				const occupants = (appPlace(places, frame.name)?.occupants ?? []).filter((o) => o.alpha > 0.01);
				const news = away.get(frame.name);
				const lit = occupants.length > 0 || news !== undefined;
				// a plate scrolled off the top is a place off screen: its door says it instead
				if (rect.y - 26 < 0 && occupants.length > 0) return null;
				const pinned = rect;
				const isEntered = entered === frame.name;
				// a crowded plate says less per head rather than running into its neighbour
				const agents = occupants.filter((o) => o.kind === "agent").length;
				const tier = tierOf(rect.w - (isEntered ? 130 : 0) - (agents > 1 ? 180 : 0));
				return (
					<NameRow key={frame.name} rect={pinned} className="gap-2">
						{isEntered ? (
							<span className="shrink-0 rounded-xs bg-thread px-2 py-[3px] text-on-thread type-detail">live · esc exits</span>
						) : (
							<>
								{news === undefined ? null : (
									<span style={{ opacity: news.alpha }} className="-ml-0.5 -mr-1">
										<UnseenMark mark={news.mark} />
									</span>
								)}
								<span
									className={cn(
										"min-w-0 flex-1 truncate type-value",
										lit || followed === frame.name ? "text-text" : "text-muted",
									)}
								>
									{frame.name}
								</span>
							</>
						)}
						<span className={cn("flex min-w-0 shrink-0 items-center gap-2.5 overflow-hidden", (isEntered || tier === "narrow") && "ml-auto")}>
							{occupants.map((occupant) => (
								<Tag key={`${occupant.kind}-${occupant.who}`} occupant={occupant} tier={tier} />
							))}
							{news === undefined
								? null
								: news.by.map((past) => (
										<span key={past.who} className="flex items-center gap-1.5" style={{ opacity: news.alpha * 0.85 }}>
											<AgentNode who={past.who} faded />
											<span className="text-muted type-detail">
												{tier === "narrow" ? past.writes : `${past.writes} writes`}
											</span>
										</span>
									))}
							{news?.left.map((gone) => (
								<span key={gone.who} className="flex items-center gap-1.5" style={{ opacity: news.alpha * 0.85 }}>
									<PersonDot who={gone.who} ring size={12} />
									<span className="text-muted type-detail">{gone.ago}</span>
								</span>
							))}
						</span>
					</NameRow>
				);
			})}
		</div>
	);
}

function Tag({ occupant, tier }: { occupant: Occupant; tier: Tier }) {
	const style = { opacity: occupant.alpha, transform: `translateY(${(1 - occupant.alpha) * 4}px)` };
	if (occupant.kind === "person") {
		return (
			<span className="flex items-center gap-1.5" style={style}>
				<PersonDot who={occupant.who} />
				{tier === "wide" ? <span className="text-text type-label">{MEMBERS[occupant.who].name}</span> : null}
			</span>
		);
	}
	return (
		<span className="flex items-center gap-1.5" style={style}>
			<AgentNode who={occupant.who} />
			{tier === "narrow" ? null : (
				<span className="text-muted type-detail">
					{tier === "wide" ? `${agentName(occupant.who)} · ${verb(occupant.posture)}` : agentName(occupant.who)}
				</span>
			)}
		</span>
	);
}

/* ---------- pointers, inside a frame you are in ---------- */

function Pointers({
	scene,
	t,
	cam,
	places,
	inside,
}: {
	scene: Scenario;
	t: number;
	cam: Camera;
	places: Map<string, Place>;
	inside: ReadonlySet<string>;
}) {
	const drawn: { who: Who; x: number; y: number; alpha: number }[] = [];
	for (const frame of inside) {
		const place = appPlace(places, frame as FrameName);
		if (place === undefined) continue;
		const rect = onScreenBox(cam, frameOf(frame));
		for (const occupant of place.occupants) {
			if (occupant.kind !== "person") continue;
			const span = personAt(scene, occupant.who, t);
			if (span === null || span.frame !== frame) continue;
			const at = pointerAt(span, t);
			if (at === null) continue;
			drawn.push({ who: occupant.who, x: rect.x + at.u * rect.w, y: rect.y + at.v * rect.h, alpha: occupant.alpha });
		}
	}
	return (
		<div className="pointer-events-none absolute inset-0">
			{drawn.map((p) => (
				<div key={p.who} style={{ opacity: p.alpha }}>
					<Pointer who={p.who} x={p.x} y={p.y} />
				</div>
			))}
		</div>
	);
}

/* ---------- doors to places off screen ---------- */

interface Door {
	key: string;
	x: number;
	y: number;
	side: "top" | "right" | "bottom" | "left";
	angle: number;
	place: Place;
	alpha: number;
}

const DOOR_H = 26;

function Doors({ cam, places }: { cam: Camera; places: Map<string, Place> }) {
	const doors: Door[] = [];
	const elsewhere: Place[] = [];
	for (const [key, place] of places) {
		const live = place.occupants.filter((o) => o.alpha > 0.01);
		if (live.length === 0) continue;
		if (place.page !== "app") {
			elsewhere.push(place);
			continue;
		}
		const rect = onScreenBox(cam, frameOf(place.frame));
		// the plate is the answer while it can be read; past that, a door is
		if (visible(rect, 24) && rect.y - 26 >= 0) continue;
		const cx = rect.x + rect.w / 2;
		const cy = rect.y + rect.h / 2;
		const edge = edgePoint(cx, cy, { x: 18, y: 18 });
		doors.push({
			key,
			...edge,
			angle: Math.atan2(cy - VH / 2, cx - VW / 2),
			place,
			alpha: Math.max(...live.map((o) => o.alpha)),
		});
	}
	// doors on one wall never sit on each other
	for (const side of ["left", "right"] as const) {
		const column = doors.filter((d) => d.side === side).sort((a, b) => a.y - b.y);
		for (let i = 1; i < column.length; i += 1) {
			const prev = column[i - 1];
			const door = column[i];
			if (prev !== undefined && door !== undefined && door.y - prev.y < DOOR_H + 6) door.y = prev.y + DOOR_H + 6;
		}
	}
	return (
		<div className="pointer-events-none absolute inset-0">
			{doors.map((door) => {
				const shift =
					door.side === "right"
						? "translate(-100%, -50%)"
						: door.side === "left"
							? "translate(0, -50%)"
							: door.side === "top"
								? "translate(-50%, 0)"
								: "translate(-50%, -100%)";
				return (
					<div
						key={door.key}
						className="absolute flex items-center gap-2 rounded-sm border border-border-raised bg-bg/95 pr-2.5 pl-2"
						style={{ left: door.x, top: door.y, height: DOOR_H, transform: shift, opacity: door.alpha }}
					>
						<svg viewBox="0 0 10 10" className="h-2.5 w-2.5 text-muted" style={{ transform: `rotate(${door.angle}rad)` }} aria-hidden="true">
							<path d="M1 5h6.5M5 2l3 3-3 3" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
						</svg>
						<Occupants place={door.place} />
						<span className="whitespace-nowrap text-muted type-detail">{door.place.frame}</span>
					</div>
				);
			})}
			{elsewhere.map((place, i) => (
				<div
					key={`${place.page}/${place.frame}`}
					className="absolute flex items-center gap-2 rounded-sm border border-border-raised bg-bg/95 pr-2.5 pl-2"
					style={{ left: 18, top: 18 + i * (DOOR_H + 6), height: DOOR_H }}
				>
					<Occupants place={place} />
					<span className="whitespace-nowrap text-muted type-detail">
						{place.page} / {place.frame}
					</span>
				</div>
			))}
		</div>
	);
}

function Occupants({ place }: { place: Place }) {
	return (
		<span className="flex items-center gap-1.5">
			{place.occupants.map((o) =>
				o.kind === "person" ? (
					<span key={`p-${o.who}`} style={{ opacity: o.alpha }}>
						<PersonDot who={o.who} />
					</span>
				) : (
					<span key={`a-${o.who}`} style={{ opacity: o.alpha }}>
						<AgentNode who={o.who} />
					</span>
				),
			)}
		</span>
	);
}

/* ---------- following ---------- */

function FollowChip({ who, kind, since, t }: { who: Who; kind: "person" | "agent"; since: number; t: number }) {
	const alpha = since < 0.01 ? 1 : easeOut(clamp01((t - since) / 0.3));
	return (
		<div className="pointer-events-none absolute inset-x-0 bottom-[84px] flex justify-center" style={{ opacity: alpha }}>
			<div className="flex h-7 items-center gap-2 rounded-sm border border-border-raised bg-bg px-2.5">
				{kind === "person" ? <PersonDot who={who} /> : <AgentNode who={who} />}
				<span className="text-text type-detail">{followChipText(who, kind)}</span>
			</div>
		</div>
	);
}
