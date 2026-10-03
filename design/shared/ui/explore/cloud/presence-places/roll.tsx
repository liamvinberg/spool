import type { ReactNode } from "react";
import { cn } from "shared/lib/utils";
import { Stage, useClock } from "shared/ui/explore/cloud/presence-places/clock";
import {
	AgentNode,
	type Camera,
	AwayVeil,
	Hands,
	NameRow,
	onScreenBox,
	PersonDot,
	Plates,
	visible,
	World,
} from "shared/ui/explore/cloud/presence-places/field";
import { appPlace, type Place, placesAt, verb, whereIs } from "shared/ui/explore/cloud/presence-places/occupancy";
import {
	cameraAt,
	followAt,
	SCENARIOS,
	type Scenario,
	type ScenarioId,
} from "shared/ui/explore/cloud/presence-places/scenarios";
import { type AwayNews, awayMarks, followChipText } from "shared/ui/explore/cloud/presence-places/shell-bits";
import {
	clamp01,
	easeOut,
	FRAMES,
	FRAME_NAMES,
	type FrameName,
	frameOf,
	MEMBERS,
	OTHER_PAGES,
	VH,
	VW,
	type Who,
} from "shared/ui/explore/cloud/presence-places/world";
import { CanvasTools } from "shared/ui/spool/canvas-tools";
import { AgentIcon, ChevronIcon, FolderIcon, FrameIcon, PanelCaret, PropertiesIcon } from "shared/ui/spool/icons";
import { SpoolShell } from "shared/ui/spool/shell";
import { UnseenMark } from "shared/ui/spool/unseen-mark";

/**
 * Roll call. The pages rail is already the map of every place in the project, so
 * presence lives there first: a short roll of who is here at the top, each person
 * with their agent hanging under them, and each one's place written beside them
 * with a needle pointing at it from where you are looking. The tree below wears
 * the same marks on the rows they are in. The canvas keeps only the hand, now in
 * its owner's colour, and a quiet mark on an occupied name.
 *
 * Zoom changes nothing in the rail, which is the point: it reads the same at 26%
 * as at 92%, and a place off screen is one row like any other.
 */
export function RollStage({ scenario }: { scenario: ScenarioId }) {
	const scene = SCENARIOS[scenario];
	const clock = useClock(scene.total);
	const t = clock.t;
	const cam = cameraAt(scene.camera, t);
	const places = placesAt(scene, t);
	const follow = followAt(scene, t);
	const entered = scene.enter !== undefined && t >= scene.enter.at ? scene.enter.frame : null;

	return (
		<Stage t={t} total={scene.total} playing={clock.playing} beats={scene.beats} onToggle={clock.toggle} onSeek={clock.seek}>
			<SpoolShell activeTab="kaffe" tabs={["kaffe", "spool"]} zoom={`${Math.round(cam.k * 100)}%`}>
				<div className="flex h-full w-full overflow-hidden bg-bg">
					<RollRail scene={scene} t={t} cam={cam} places={places} follow={follow === null ? null : { who: follow.who, kind: follow.kind }} />
					<div className="relative min-w-0 flex-1 overflow-hidden bg-canvas">
						<World cam={cam} />
						<Plates scene={scene} t={t} cam={cam} />
						<Hands scene={scene} t={t} cam={cam} />
					<AwayVeil scene={scene} t={t} />
						<QuietLabels cam={cam} places={places} entered={entered} away={awayMarks(scene, t)} />
						{follow === null ? null : (
							<div className="pointer-events-none absolute inset-x-0 bottom-[84px] flex justify-center" style={{ opacity: follow.from < 0.01 ? 1 : easeOut(clamp01((t - follow.from) / 0.3)) }}>
								<div className="flex h-7 items-center gap-2 rounded-sm border border-border-raised bg-bg px-2.5">
									{follow.kind === "person" ? <PersonDot who={follow.who} /> : <AgentNode who={follow.who} />}
									<span className="text-text type-detail">{followChipText(follow.who, follow.kind)}</span>
								</div>
							</div>
						)}
						<CanvasTools tool="select" />
					</div>
					<Strip />
				</div>
			</SpoolShell>
		</Stage>
	);
}

/* ---------- the canvas, kept quiet ---------- */

function QuietLabels({
	cam,
	places,
	entered,
	away,
}: {
	cam: Camera;
	places: Map<string, Place>;
	entered: string | null;
	away: Map<FrameName, AwayNews>;
}) {
	return (
		<div className="pointer-events-none absolute inset-0">
			{FRAMES.map((frame) => {
				const rect = onScreenBox(cam, frame);
				if (!visible(rect, -40)) return null;
				const occupants = (appPlace(places, frame.name)?.occupants ?? []).filter((o) => o.alpha > 0.01);
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
								<span className={cn("min-w-0 flex-1 truncate type-value", occupants.length > 0 || news !== undefined ? "text-text" : "text-muted")}>
									{frame.name}
								</span>
							</>
						)}
						<span className="ml-auto flex shrink-0 items-center gap-1">
							{occupants.map((o) =>
								o.kind === "person" ? (
									<span key={`p-${o.who}`} style={{ opacity: o.alpha }}>
										<PersonDot who={o.who} size={8} />
									</span>
								) : (
									<span key={`a-${o.who}`} style={{ opacity: o.alpha }}>
										<AgentNode who={o.who} size={8} />
									</span>
								),
							)}
						</span>
					</NameRow>
				);
			})}
		</div>
	);
}

/* ---------- the rail ---------- */

const ROLL: readonly Who[] = ["you", "ana", "ben", "cleo", "dev"];

/** where a place is from where you are looking: here, a bearing, or another page */
type Bearing = { kind: "here" } | { kind: "away"; angle: number } | { kind: "page"; page: string };

function bearingOf(cam: Camera, place: Place): Bearing {
	if (place.page !== "app") return { kind: "page", page: place.page };
	const rect = onScreenBox(cam, frameOf(place.frame));
	if (visible(rect, 24)) return { kind: "here" };
	return { kind: "away", angle: Math.atan2(rect.y + rect.h / 2 - VH / 2, rect.x + rect.w / 2 - VW / 2) };
}

function Needle({ bearing }: { bearing: Bearing }) {
	if (bearing.kind === "here") {
		return (
			<span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center" aria-label="in view">
				<span className="h-[5px] w-[5px] rounded-full bg-text/80" />
			</span>
		);
	}
	if (bearing.kind === "page") {
		return <FolderIcon className="h-3.5 w-3.5 shrink-0 text-muted" />;
	}
	return (
		<svg viewBox="0 0 14 14" className="h-3.5 w-3.5 shrink-0 text-muted" style={{ transform: `rotate(${bearing.angle}rad)` }} aria-label="off screen">
			<path d="M2.5 7h8M7.5 4l3 3-3 3" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}

function RollRail({
	scene,
	t,
	cam,
	places,
	follow,
}: {
	scene: Scenario;
	t: number;
	cam: Camera;
	places: Map<string, Place>;
	follow: { who: Who; kind: "person" | "agent" } | null;
}) {
	const away = awayMarks(scene, t);
	const youAgent = whereIs(places, "you", "agent");
	// everyone this scene ever holds keeps their row, so a leaving never moves the roll
	const present = ROLL.filter((who) => who === "you" || scene.people[who] !== undefined || scene.away?.left.some((g) => g.who === who) === true);
	return (
		<aside className="flex w-[248px] shrink-0 flex-col border-border border-r bg-bg">
			<RailHead title="People" count={present.length} />
			<div className="shrink-0 border-border border-b py-1.5">
				{present.map((who) => {
					const place = who === "you" ? null : whereIs(places, who, "person");
					const alpha = who === "you" ? 1 : alphaOf(place, who, "person");
					const agent = who === "you" ? youAgent : whereIs(places, who, "agent");
					const agentAlpha = alphaOf(agent, who, "agent");
					const gone = scene.away?.left.find((g) => g.who === who);
					const followingPerson = follow?.who === who && follow.kind === "person";
					const followingAgent = follow?.who === who && follow.kind === "agent";
					return (
						<div key={who}>
							<Row lit={followingPerson} color={MEMBERS[who].color}>
								<span style={{ opacity: place === null && who !== "you" ? 0.6 : 1 }}>
									<PersonDot who={who} ring={gone !== undefined && place === null} />
								</span>
								<span className={cn("min-w-0 flex-1 truncate type-label", place === null && who !== "you" ? "text-muted" : "text-text")}>
									{MEMBERS[who].name}
								</span>
								{who === "you" ? (
									<span className="text-muted type-detail">here</span>
								) : place !== null ? (
									<span className="flex min-w-0 items-center gap-1.5" style={{ opacity: alpha }}>
										<span className="truncate text-muted type-detail">{place.page === "app" ? place.frame : `${place.page}/${place.frame}`}</span>
										<Needle bearing={bearingOf(cam, place)} />
									</span>
								) : gone !== undefined ? (
									<span className="text-muted type-detail">left {gone.ago} ago</span>
								) : (
									<span className="text-muted type-detail">left</span>
								)}
							</Row>
							{agent === null ? null : (
								<Row lit={followingAgent} color={MEMBERS[who].color} sub style={{ opacity: agentAlpha }}>
									<AgentNode who={who} />
									<span className="min-w-0 flex-1 truncate text-muted type-detail">
										{verb(agent.occupants.find((o) => o.kind === "agent" && o.who === who)?.posture)}
									</span>
									<span className="flex min-w-0 items-center gap-1.5">
										<span className="truncate text-text/85 type-detail">{agent.frame}</span>
										<Needle bearing={bearingOf(cam, agent)} />
									</span>
								</Row>
							)}
						</div>
					);
				})}
			</div>
			<RailHead title="Pages" count={1 + OTHER_PAGES.length} />
			<div className="min-h-0 flex-1 overflow-hidden py-1.5">
				<PageRowLine name="app" open active count={FRAME_NAMES.length} />
				<div className="relative">
					<span className="absolute top-0 bottom-1 left-[18px] w-px bg-border-raised" />
					{FRAME_NAMES.map((name) => {
						const occupants = (appPlace(places, name)?.occupants ?? []).filter((o) => o.alpha > 0.01);
						const news = away.get(name);
						return (
							<div key={name} className="relative flex h-[26px] items-center pr-2">
								<span className="absolute top-1/2 left-[18px] h-px w-2.5 bg-border-raised" />
								<span className="flex min-w-0 flex-1 items-center gap-2 pl-[34px]">
									<FrameIcon className="h-3.5 w-3.5 shrink-0 text-muted" />
									<span className={cn("min-w-0 flex-1 truncate type-value", occupants.length > 0 || news !== undefined ? "text-text" : "text-muted")}>
										{name}
									</span>
								</span>
								<span className="flex shrink-0 items-center gap-1.5">
									{news === undefined
										? null
										: news.by.map((past) => (
												<span key={past.who} className="flex items-center gap-1" style={{ opacity: news.alpha }}>
													<AgentNode who={past.who} size={8} faded />
													<span className="text-muted type-detail">{past.writes}</span>
												</span>
											))}
									{occupants.map((o) =>
										o.kind === "person" ? (
											<span key={`p-${o.who}`} style={{ opacity: o.alpha }}>
												<PersonDot who={o.who} size={9} />
											</span>
										) : (
											<span key={`a-${o.who}`} style={{ opacity: o.alpha }}>
												<AgentNode who={o.who} size={8} />
											</span>
										),
									)}
									{news === undefined ? null : (
										<span style={{ opacity: news.alpha }}>
											<UnseenMark mark={news.mark} />
										</span>
									)}
								</span>
							</div>
						);
					})}
				</div>
				{OTHER_PAGES.map((page) => {
					const here = [...places.values()].filter((p) => p.page === page.name).flatMap((p) => p.occupants);
					return (
						<PageRowLine key={page.name} name={page.name} count={page.frames.length}>
							{here.map((o) => (
								<span key={`${o.kind}-${o.who}`} style={{ opacity: o.alpha }}>
									<PersonDot who={o.who} size={9} />
								</span>
							))}
						</PageRowLine>
					);
				})}
			</div>
		</aside>
	);
}

function alphaOf(place: Place | null, who: Who, kind: "person" | "agent"): number {
	if (place === null) return 0;
	return place.occupants.find((o) => o.who === who && o.kind === kind)?.alpha ?? 0;
}

function RailHead({ title, count }: { title: string; count: number }) {
	return (
		<div className="flex h-11 shrink-0 items-center justify-between border-border border-b pr-2 pl-3.5">
			<div className="flex items-baseline gap-2">
				<h1 className="font-semibold type-control">{title}</h1>
				<span className="text-muted type-value">{count}</span>
			</div>
			<span className="flex h-7 w-7 items-center justify-center rounded-sm text-muted">
				<PanelCaret dir="left" className="h-3.5 w-2.5" />
			</span>
		</div>
	);
}

function Row({
	children,
	lit = false,
	sub = false,
	color,
	style,
}: {
	children: ReactNode;
	lit?: boolean;
	sub?: boolean;
	color: string;
	style?: React.CSSProperties | undefined;
}) {
	return (
		<div
			className={cn("relative flex items-center gap-2 pr-2.5 transition-colors duration-200", sub ? "h-7 pl-[30px]" : "h-8 pl-3.5", lit && "bg-surface")}
			style={style}
		>
			{lit ? <span className="absolute top-1.5 bottom-1.5 left-0 w-[2px] rounded-full" style={{ background: color }} /> : null}
			{sub ? (
				<>
					<span className="absolute -top-2 left-[20px] h-[22px] w-px bg-border-raised" />
					<span className="absolute top-1/2 left-[20px] h-px w-[6px] bg-border-raised" />
				</>
			) : null}
			{children}
		</div>
	);
}

function PageRowLine({
	name,
	open = false,
	active = false,
	count,
	children,
}: {
	name: string;
	open?: boolean;
	active?: boolean;
	count: number;
	children?: ReactNode;
}) {
	return (
		<div className={cn("relative flex h-8 items-center pr-1.5", active && "bg-surface")}>
			{active ? <span className="absolute top-1.5 bottom-1.5 left-0 w-[2px] rounded-full bg-thread" /> : null}
			<span className="flex h-8 w-6 shrink-0 items-center justify-center text-muted">
				<ChevronIcon open={open} className="h-2.5 w-2.5" />
			</span>
			<span className="flex min-w-0 flex-1 items-center gap-2">
				<FolderIcon className={cn("h-3.5 w-3.5 shrink-0", active ? "text-thread" : "text-muted")} />
				<span className={cn("min-w-0 flex-1 truncate type-value", active ? "text-text" : "text-muted")}>{name}</span>
			</span>
			<span className="mr-2 flex items-center gap-1">{children}</span>
			<span className="text-muted type-detail">{count}</span>
		</div>
	);
}

function Strip() {
	return (
		<aside className="flex h-full w-11 shrink-0 flex-col items-center gap-1 border-border border-l bg-bg pt-1.5">
			<span className="flex h-8 w-8 items-center justify-center rounded-sm text-muted/70">
				<PropertiesIcon className="h-4 w-4" />
			</span>
			<span className="flex h-8 w-8 items-center justify-center rounded-sm text-muted/70">
				<AgentIcon className="h-4 w-4" />
			</span>
		</aside>
	);
}
