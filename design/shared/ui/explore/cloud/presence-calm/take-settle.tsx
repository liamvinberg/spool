import type { ReactNode } from "react";
import { cn } from "shared/lib/utils";
import type { TileDeco } from "./field";
import { agentPresence, FollowChip, Hand, YouPointer } from "./marks";
import {
	AGENTS,
	type AgentId,
	agentLabel,
	agentOf,
	blockRect,
	type Cam,
	camOn,
	clamp01,
	ease,
	type FrameDef,
	frameAt,
	type Key,
	PEOPLE,
	PERSON_NAME,
	type PersonId,
	personAt,
	plate,
	project,
	rectOf,
	type Run,
	sample,
} from "./model";
import { MINE, type Scene } from "./scenes";
import { agentFollowCam, enteredAt, followingAt, sceneCam, type Take, versionOf } from "./stage";

/**
 * settle: results in public, process in private.
 *
 * Someone else's agent at work is not drawn as work. The frame it holds stays at
 * its last finished revision, a shade under its usual ink, and its label says
 * whose agent has it. Nothing on it moves. When the run ends the frame settles:
 * it comes back to full ink at the new revision, once, and keeps a ring and a
 * count until you have looked at it. That is the only motion another person's
 * agent ever makes on your canvas.
 *
 * Process is still there for whoever wants it. Your own agent is drawn live,
 * because it is yours. Enter a frame and it goes live for you, hand, plates and
 * every pointer inside it. People are placed by frame rather than by pixel: their
 * initial sits on the label of the frame they are in, and a pointer is drawn only
 * when you are both inside the same one. Everyone, and what their agent holds, is
 * in the roster at the end of the bar.
 */

interface Holding {
	readonly id: AgentId;
	readonly run: Run;
}

/** the other people's agents holding a frame, not counting yours */
function holders(scene: Scene, t: number, frame: string): Holding[] {
	const out: Holding[] = [];
	for (const id of AGENTS) {
		if (id === "you") continue;
		const run = scene.runs[id]?.find((r) => r.frame === frame && r.kind === "write" && t >= r.from && t < r.to);
		if (run !== undefined) out.push({ id, run });
	}
	return out;
}

/** the last write run on a frame that has finished, and how long ago */
function lastSettle(scene: Scene, t: number, frame: string): { id: AgentId; run: Run; ago: number } | undefined {
	let best: { id: AgentId; run: Run; ago: number } | undefined;
	for (const id of AGENTS) {
		for (const run of scene.runs[id] ?? []) {
			if (run.frame !== frame || run.kind !== "write" || run.to > t) continue;
			if (best === undefined || run.to > best.run.to) best = { id, run, ago: t - run.to };
		}
	}
	return best;
}

function Initial({ id, ink = 1 }: { id: PersonId; ink?: number }) {
	return (
		<span
			className="flex h-4 w-4 items-center justify-center rounded-full bg-raised text-text type-detail transition-opacity duration-300"
			style={{ opacity: ink, fontSize: 9, lineHeight: "16px" }}
		>
			{id.slice(0, 1)}
		</span>
	);
}

function Holder({ id, compact }: { id: AgentId; compact: boolean }) {
	return (
		<span className="flex items-center gap-1.5 text-muted type-detail">
			<span className="h-[7px] w-[7px] rounded-full border border-muted" />
			{compact ? null : <span>{agentLabel(id)}</span>}
		</span>
	);
}

/* ── the walk you take when you come back ─────────────────────────────────── */

const WALK = ["cart", "checkout", "receipt", "stamps"] as const;
const STOP = 4;
const WALK_FROM = 1.6;

const AWAY_CAM: readonly (Key<Cam> & { d?: number })[] = [
	{ t: 0, x: 1005, y: 790, k: 0.5 },
	...WALK.map((frame, i) => ({ t: WALK_FROM + i * STOP + 1.2, d: 1.2, ...camOn(frame, 0.86) })),
	{ t: WALK_FROM + WALK.length * STOP + 1.6, d: 1.6, x: 2505, y: 1522, k: 0.2 },
];

/** where in the walk t is: which stop, and how far into it */
function walkAt(t: number): { stop: number; into: number } | undefined {
	if (t < WALK_FROM) return undefined;
	const stop = Math.floor((t - WALK_FROM) / STOP);
	if (stop >= WALK.length) return undefined;
	return { stop, into: t - WALK_FROM - stop * STOP };
}

function settleCam(scene: Scene, t: number): Cam {
	if (scene.away !== undefined) return sample(AWAY_CAM, t);
	if (scene.follow !== undefined) return agentFollowCam(scene, t, "settle");
	return sceneCam(scene, t);
}

export const settleTake: Take = (scene, t) => {
	const cam = settleCam(scene, t);
	const entered = enteredAt(scene, t);
	const follow = followingAt(scene, t);
	const compact = cam.k < 0.3;
	const overlay: ReactNode[] = [];

	// people by frame
	const here = new Map<string, PersonId[]>();
	for (const id of PEOPLE) {
		const p = personAt(scene.pointers[id], t);
		const frame = p === undefined ? undefined : frameAt(p.at);
		if (p === undefined || frame === undefined) continue;
		here.set(frame.name, [...(here.get(frame.name) ?? []), id]);
		// inside the frame you are in, a person is a pointer again
		if (frame.name === entered) {
			const at = project(cam, p.at);
			overlay.push(
				<span key={`in-${id}`} className="pointer-events-none absolute" style={{ left: at.x, top: at.y }}>
					<svg viewBox="0 0 12 14" className="absolute h-3.5 w-3" aria-hidden="true">
						<path d="M1 1v10.5l2.8-2.6 1.9 4.2 1.8-.8-1.9-4.1h4Z" fill="#17171A" stroke="#fff" strokeWidth="0.9" strokeLinejoin="round" />
					</svg>
					<span className="absolute top-3 left-3 whitespace-nowrap rounded-xs bg-bg px-1.5 py-px text-text type-detail">{id}</span>
				</span>,
			);
		}
	}

	// your own agent, live wherever it is
	const mine = agentPresence(scene.runs.you, t);
	if (mine !== undefined) {
		overlay.push(<Hand key="you" rect={rectOf(cam, mine.now.run.frame)} now={mine.now} t={t} k={cam.k} ink={mine.ink} />);
	}

	// the frame you entered is live for you: every hand on it, drawn
	if (entered !== undefined) {
		const on = AGENTS.filter((id) => id !== "you" && agentPresence(scene.runs[id], t)?.now.run.frame === entered);
		on.forEach((id, i) => {
			const p = agentPresence(scene.runs[id], t);
			if (p === undefined) return;
			const rect = rectOf(cam, entered);
			const v = clamp01((t - (scene.entered?.from ?? 0)) / 0.5);
			overlay.push(
				<Hand
					key={`entered-${id}`}
					rect={rect}
					now={p.now}
					t={t}
					k={cam.k}
					ink={p.ink * v}
					side={i === 0 ? "left" : "right"}
					label={agentLabel(id)}
				/>,
			);
		});
	}

	// the walk back: each stop shows the frame as you left it, then as it is
	const away = scene.away;
	const walk = away === undefined ? undefined : walkAt(t);
	const walkedTo = (frame: string) => {
		const i = WALK.indexOf(frame as (typeof WALK)[number]);
		return i < 0 ? Number.POSITIVE_INFINITY : WALK_FROM + i * STOP + 1.2;
	};
	if (away !== undefined && walk !== undefined) {
		const frame = WALK[walk.stop] ?? "cart";
		const change = away.changes.find((c) => c.frame === frame);
		const rect = rectOf(cam, frame);
		if (change !== undefined) {
			change.blocks.forEach((block, i) => {
				const box = blockRect(rect, block, cam.k);
				const env = plate(walk.into - 1.9 - i * 0.18);
				overlay.push(
					<span
						key={`walk-${frame}-${block}`}
						className="pointer-events-none absolute rounded-[3px] bg-[#fff] mix-blend-difference"
						style={{ left: box.x, top: box.y, width: box.w, height: box.h, opacity: env.opacity * 1.2, transform: `scaleY(${env.scale})` }}
					/>,
				);
			});
		}
	}

	const deco = (frame: FrameDef): TileDeco => {
		const name = frame.name;
		const people = here.get(name) ?? [];
		const held = name === entered ? [] : holders(scene, t, name);
		const settled = lastSettle(scene, t, name);
		let version = versionOf(scene, name, t);
		let opacity = 1;
		let mark: TileDeco["mark"];
		let say: ReactNode;
		if (held.length > 0) {
			// held at the revision before the run that is open on it
			const open = held[0];
			version = open === undefined ? version : versionOf(scene, name, open.run.from - 0.001);
			opacity = 0.72;
			say = held.map((h) => <Holder key={h.id} id={h.id} compact={compact} />);
		} else if (settled !== undefined && settled.id !== "you" && !MINE.has(name) && name !== entered) {
			// settled: back to full ink over 700ms, then a ring and a count that wait for you
			opacity = 0.72 + 0.28 * ease(settled.ago / 0.7);
			mark = "changed";
			say = compact ? null : (
				<span className="text-muted type-detail">
					{agentLabel(settled.id)} · {settled.run.writes.length} edits
				</span>
			);
		}
		if (away !== undefined) {
			const change = away.changes.find((c) => c.frame === name);
			if (change !== undefined && walk !== undefined && WALK[walk.stop] === name && walk.into > 1.1) {
				say = (
					<span className="text-muted type-detail">
						{walk.into < 1.95 ? "as you left it" : `${agentLabel(change.by)} · ${change.edits} edits · ${change.ago}m ago`}
					</span>
				);
			}
			if (change !== undefined) {
				const arrived = walkedTo(name);
				const flip = arrived + 0.75;
				if (t < flip) {
					version = 0;
					mark = change.isNew === true ? "new" : "changed";
					if (change.isNew === true && t >= arrived - 1.2) opacity = 0.2;
				} else {
					opacity = change.isNew === true ? 0.2 + 0.8 * ease((t - flip) / 0.6) : 1 - 0.35 * Math.sin(Math.PI * clamp01((t - flip) / 0.5));
					mark = undefined;
				}
			}
		}
		return {
			version,
			opacity,
			mark,
			lit: name === entered,
			labelEnd:
				people.length === 0 && say === undefined ? undefined : (
					<span className="flex items-center gap-2">
						{say}
						{people.length > 0 ? (
							<span className="flex items-center gap-0.5">
								{people.map((id) => (
									<Initial key={id} id={id} />
								))}
							</span>
						) : null}
					</span>
				),
		};
	};

	// the roster: everyone, and a ring beside a person whose agent holds a frame
	const hover = scene.hover;
	const hovering = hover !== undefined && t >= hover.from && t < hover.to ? hover.person : undefined;
	const header = (
		<div className="relative flex h-full items-center gap-1.5 border-border border-l pl-4">
			{PEOPLE.map((id) => {
				const own = agentOf(id);
				const busy = own === undefined ? undefined : agentPresence(scene.runs[own], t);
				const p = personAt(scene.pointers[id], t);
				return (
					<span key={id} className="relative flex h-6 w-6 items-center justify-center">
						<span
							className={cn(
								"flex h-[22px] w-[22px] items-center justify-center rounded-full bg-raised type-detail transition-colors duration-200",
								hovering === id ? "text-text ring-1 ring-text/60" : p === undefined ? "text-muted/50" : "text-text",
							)}
						>
							{id.slice(0, 1)}
						</span>
						{busy !== undefined ? (
							<span className="-right-0.5 -bottom-0.5 absolute h-[8px] w-[8px] rounded-full border-[1.5px] border-muted bg-bg" />
						) : null}
						{hovering === id ? (
							<svg viewBox="0 0 16 20" className="pointer-events-none absolute top-[9px] left-[11px] z-10 h-5 w-4" aria-hidden="true">
								<path d="M1.2 1.2v14.6l3.7-3.5 2.4 5.6 2.5-1.1-2.4-5.5h5.2Z" fill="#fff" stroke="#000" strokeWidth="1.1" strokeLinejoin="round" />
							</svg>
						) : null}
					</span>
				);
			})}
		</div>
	);

	return {
		cam,
		deco,
		header,
		beats: away === undefined ? undefined : SETTLE_AWAY_BEATS,
		life: mine !== undefined ? "running" : (scene.runs.you ?? []).some((r) => r.kind === "write" && r.to <= t) || away !== undefined ? "unread" : undefined,
		overlay: (
			<>
				{overlay}
				{scene.you !== undefined && scene.hover === undefined ? (
					<YouPointer
						at={project(cam, personAt(scene.you, t)?.at ?? { x: 0, y: 0 })}
						pressed={scene.entered !== undefined && Math.abs(t - scene.entered.from + 0.1) < 0.15}
					/>
				) : null}
				{follow !== undefined ? (
					<FollowChip>
						following {follow.kind === "person" ? follow.who : `${agentLabel(follow.who)} · moves when a frame settles`} · esc stops
					</FollowChip>
				) : null}
				{hovering !== undefined ? <Roster scene={scene} t={t} id={hovering} /> : null}
				{away !== undefined ? <WalkBar t={t} total={away.changes.length} minutes={away.minutes} /> : null}
			</>
		),
	};
};

const SETTLE_AWAY_BEATS = [
	{ t: 0, label: "you come back after 41 minutes" },
	{ t: WALK_FROM, label: "the walk starts with your frames" },
	{ t: WALK_FROM + 2 * STOP, label: "receipt, as you left it and as it is" },
	{ t: WALK_FROM + 3 * STOP, label: "stamps is new" },
	{ t: WALK_FROM + 4 * STOP, label: "the two you have not walked keep their ring" },
];

/** the popover under a roster initial: where the person is, and where their agent is */
function Roster({ scene, t, id }: { scene: Scene; t: number; id: PersonId }) {
	const own = agentOf(id);
	const p = personAt(scene.pointers[id], t);
	const where = p === undefined ? "away" : (frameAt(p.at)?.name ?? "on the canvas");
	const busy = own === undefined ? undefined : agentPresence(scene.runs[own], t);
	return (
		<div
			className="absolute top-2 right-2 z-30 w-[300px] animate-menu-in rounded-md border border-border-raised bg-surface py-1.5"
		>
			<div className="flex h-7 items-center justify-between px-3">
				<span className="text-text type-label">{PERSON_NAME[id]}</span>
				<span className="text-muted type-detail">{where}</span>
			</div>
			{own === undefined ? null : (
				<div className="flex h-7 items-center justify-between px-3">
					<span className="flex items-center gap-2 text-muted type-detail">
						<span className="h-[7px] w-[7px] rounded-full border border-muted" />
						{agentLabel(own)}
					</span>
					<span className="text-text type-detail">
						{busy === undefined ? "idle" : `${busy.now.run.frame} · ${busy.now.landed} edits`}
					</span>
				</div>
			)}
		</div>
	);
}

/** coming back: one line at the top of the view, and how far through the walk you are */
function WalkBar({ t, total, minutes }: { t: number; total: number; minutes: number }) {
	const walk = walkAt(t);
	const done = walk === undefined ? (t < WALK_FROM ? 0 : WALK.length) : walk.stop + 1;
	return (
		<div className="-translate-x-1/2 pointer-events-none absolute top-3 left-1/2 z-10 flex items-center gap-3 rounded-xs border border-border-raised bg-surface px-2.5 py-[3px] type-detail">
			<span className="text-text">
				{minutes}m away · {total} frames changed
			</span>
			<span className="text-muted">
				{walk === undefined && t >= WALK_FROM ? `walked ${WALK.length} of ${total} · space walks on` : `walk ${done} of ${total}`}
			</span>
		</div>
	);
}
