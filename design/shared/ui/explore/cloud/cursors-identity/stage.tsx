import { type ComponentType, memo, useRef } from "react";
import { cn } from "shared/lib/utils";
import { CoffeeScreen } from "shared/ui/demo/coffee-screens";
import { CanvasChrome, type PageRow } from "shared/ui/spool/canvas-chrome";
import { SpoolShell } from "shared/ui/spool/shell";
import { ScrubBar, useLoop } from "./clock";
import {
	type FrameId,
	FRAME_H,
	FRAME_W,
	FRAMES,
	frameAt,
	into,
	LOOP,
	MOMENTS,
	PEOPLE,
	type Person,
	type PersonId,
	position,
	ramp,
	SCENARIOS,
	type Scenario,
	stillFor,
	type Track,
	within,
	YOU,
} from "./script";

/**
 * The shared stage: spool's window at 1440 by 900 with the canvas showing the
 * coffee app, three people on it from the script, and the scrub bar under the
 * window. A take hands in how a person is drawn and nothing else, so the rows
 * on this page are the same moment told in different marks.
 */

/** one person at this instant, in viewport pixels */
export interface Seen {
	person: Person;
	x: number;
	y: number;
	/** 0 to 1: how far the press has gone in, so a take never snaps */
	press: number;
	/** 0 to 1: how idle, eased in over 600ms and out over 300ms */
	idle: number;
	/** seconds the pointer has not moved */
	still: number;
	over: FrameId | null;
	/** seconds since the pointer crossed onto or off a frame, up to one */
	overFor: number;
	selecting: FrameId | null;
	/** 0 to 1: the selection arriving */
	select: number;
	/** the last half second of the pointer, newest first */
	trail: readonly { x: number; y: number }[];
}

export interface Roster {
	here: readonly Seen[];
	away: readonly { person: Person; page: string }[];
	you: Person;
	following: PersonId | null;
	listOpen: boolean;
	idleFor: Partial<Record<PersonId, string>>;
}

export interface Take {
	Cursor: ComponentType<{ seen: Seen; zoomed: boolean }>;
	/** drawn at the frame's top-left in viewport pixels, over the frame */
	Selection: ComponentType<{ seen: Seen; w: number; h: number }>;
	/** who is on this frame, in its label row */
	LabelMark: ComponentType<{ seen: Seen }>;
	Faces: ComponentType<{ roster: Roster }>;
	/** the who's-here list, open under the faces */
	List: ComponentType<{ roster: Roster }>;
	/** the window edge while you follow someone */
	FollowEdge: ComponentType<{ seen: Seen }>;
	/** a cursor that inverts what is under it, so one ink reads on a white frame and the dark canvas alike */
	blend?: "difference";
}

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["menu", "cart", "receipt"], active: true, open: true },
	{ name: "site", frames: ["landing", "pricing"] },
	{ name: "onboarding", frames: ["welcome", "connect", "ready"] },
];

const VIEW_W = 1148;
const VIEW_H = 856;
const FOLLOW_K = 1.5;

function camera(scenario: Scenario, t: number): { x: number; y: number; k: number } {
	const followed = SCENARIOS[scenario].follow;
	if (followed === undefined) return { x: 0, y: 0, k: 1 };
	const track = SCENARIOS[scenario].tracks.find((candidate) => candidate.person === followed);
	if (track === undefined) return { x: 0, y: 0, k: 1 };
	// they pan to keep their pointer in view, a couple of seconds behind it
	let cx = 0;
	let cy = 0;
	const samples = 16;
	for (let i = 0; i < samples; i += 1) {
		const at = position(track.keys, t - (i / samples) * 2.8);
		cx += at.x;
		cy += at.y;
	}
	cx /= samples;
	cy /= samples;
	return { x: cx - VIEW_W / (2 * FOLLOW_K), y: cy - VIEW_H / (2 * FOLLOW_K), k: FOLLOW_K };
}

function envelope(spans: Track["idle"], t: number, inDur: number, outDur: number): number {
	if (spans === undefined) return 0;
	const tt = ((t % LOOP) + LOOP) % LOOP;
	for (const [from, to] of spans) {
		if (from <= 0 && to >= LOOP) return 1;
		if (tt >= from && tt < to) return ramp(tt - from, 0, inDur);
		const since = tt - to;
		if (since >= 0 && since < outDur) return 1 - ramp(since, 0, outDur);
	}
	return 0;
}

function see(scenario: Scenario, t: number) {
	const { tracks } = SCENARIOS[scenario];
	const cam = camera(scenario, t);
	const frames = FRAMES.map((frame) => ({ ...frame, ...frameAt(frame, tracks, t) }));
	const toScreen = (p: { x: number; y: number }) => ({ x: (p.x - cam.x) * cam.k, y: (p.y - cam.y) * cam.k });
	const people: Seen[] = tracks.map((track) => {
		const world = position(track.keys, t);
		const hit = (at: number) => {
			const p = position(track.keys, at);
			const boxes = at === t ? frames : FRAMES.map((frame) => ({ ...frame, ...frameAt(frame, tracks, at) }));
			return boxes.find((f) => p.x >= f.x && p.x <= f.x + FRAME_W && p.y >= f.y && p.y <= f.y + FRAME_H)?.id ?? null;
		};
		const over = hit(t);
		let overFor = 1;
		for (let back = 0.05; back < 1; back += 0.05) {
			if (hit(t - back) !== over) {
				overFor = back - 0.05;
				break;
			}
		}
		const selection = track.selects?.find((s) => within([s.span], t));
		const trail = Array.from({ length: 12 }, (_, i) => toScreen(position(track.keys, t - i * 0.03)));
		return {
			person: PEOPLE[track.person],
			...toScreen(world),
			press: envelope(track.presses, t, 0.09, 0.14),
			idle: envelope(track.idle, t, 0.6, 0.3),
			still: stillFor(track.keys, t),
			over,
			overFor,
			selecting: selection?.frame ?? null,
			select: selection === undefined ? 0 : ramp(into([selection.span], t), 0, 0.16),
			trail,
		};
	});
	return { cam, frames, people };
}

export function PresenceStage({
	take,
	scenario,
	start = 0,
}: {
	take: Take;
	scenario: Scenario;
	/** where the loop opens, so the still a canvas shows is a moment worth seeing */
	start?: number;
}) {
	const loop = useLoop(LOOP, start);
	const wasPlaying = useRef(false);
	const { cam, frames, people } = see(scenario, loop.t);
	const plan = SCENARIOS[scenario];
	const roster: Roster = {
		here: people,
		away: plan.away.map((a) => ({ person: PEOPLE[a.person], page: a.page })),
		you: YOU,
		following: plan.follow ?? null,
		listOpen: scenario === "crowd",
		idleFor: Object.fromEntries(
			plan.tracks.filter((track) => track.idleFor !== undefined).map((track) => [track.person, track.idleFor]),
		),
	};
	const followed = people.find((p) => p.person.id === plan.follow);
	const { Cursor, Selection, LabelMark, Faces, List, FollowEdge } = take;

	return (
		<div className="flex h-full w-full flex-col bg-bg">
			<div className="relative h-[900px] shrink-0">
				{/* over the window rather than inside the bar, which the dock would paint over */}
				{roster.listOpen ? (
					<div className="absolute top-[48px] right-3 z-50">
						<List roster={roster} />
					</div>
				) : null}
				<SpoolShell activeTab="spool" tabs={["spool"]} zoom={`${Math.round(cam.k * 100)}%`} headerAccessory={<Faces roster={roster} />}>
					<CanvasChrome pages={PAGES} rail={null} tool="select">
						{frames.map((frame) => {
							const x = (frame.x - cam.x) * cam.k;
							const y = (frame.y - cam.y) * cam.k;
							const w = FRAME_W * cam.k;
							const h = FRAME_H * cam.k;
							const onIt = people.filter((p) => p.over === frame.id || p.selecting === frame.id);
							const selectors = people.filter((p) => p.selecting === frame.id);
							return (
								<div key={frame.id}>
									<div
										className="absolute flex items-center gap-1.5"
										style={{ left: x, top: y - 24, width: w, height: 18 }}
									>
										<span className={cn("min-w-0 truncate type-value", onIt.length > 0 ? "text-text" : "text-muted")}>
											{frame.id}
										</span>
										<span className="ml-auto flex shrink-0 items-center gap-1">
											{onIt.map((p) => (
												<LabelMark key={p.person.id} seen={p} />
											))}
										</span>
									</div>
									<div className="absolute" style={{ left: x, top: y, width: w, height: h }}>
										<div className="origin-top-left" style={{ width: FRAME_W, height: FRAME_H, transform: `scale(${cam.k})` }}>
											<FrameBody id={frame.id} />
										</div>
										{selectors.map((p) => (
											<div key={p.person.id} className="pointer-events-none absolute inset-0">
												<Selection seen={p} w={w} h={h} />
											</div>
										))}
									</div>
								</div>
							);
						})}
						{/* no z-index here: a stacking context would isolate the cursors and a
						    blending take would invert only itself */}
						<div className="pointer-events-none absolute inset-0">
							{people.map((p) => (
								<div
									key={p.person.id}
									className="absolute top-0 left-0"
									style={{ transform: `translate3d(${p.x}px, ${p.y}px, 0)`, mixBlendMode: take.blend ?? "normal" }}
								>
									<Cursor seen={p} zoomed={cam.k !== 1} />
								</div>
							))}
						</div>
						{followed === undefined ? null : (
							<div className="pointer-events-none absolute inset-0 z-30">
								<FollowEdge seen={followed} />
							</div>
						)}
					</CanvasChrome>
				</SpoolShell>
			</div>
			<ScrubBar
				t={loop.t}
				duration={LOOP}
				playing={loop.playing}
				moments={MOMENTS[scenario]}
				onToggle={() => loop.setPlaying(!loop.playing)}
				onSeek={loop.seek}
				onHold={(held) => {
					if (held) {
						wasPlaying.current = loop.playing;
						loop.setPlaying(false);
					} else if (wasPlaying.current) loop.setPlaying(true);
				}}
			/>
		</div>
	);
}

const FrameBody = memo(function FrameBody({ id }: { id: FrameId }) {
	return <CoffeeScreen screen={id} />;
});
