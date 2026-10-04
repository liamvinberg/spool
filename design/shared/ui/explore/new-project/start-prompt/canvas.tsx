import { AnimatePresence, motion } from "motion/react";
import type { Artwork } from "shared/ui/demo/home-data";
import { cn } from "shared/lib/utils";
import { ProjectArtwork } from "shared/ui/demo/home-artwork";
import { CanvasChrome, type PageRow } from "shared/ui/spool/canvas-chrome";
import { StateMark } from "shared/ui/spool/play-rail";
import { ProjectEmpty } from "shared/ui/spool/project-empty";
import { type Beat, FRAMES, type FrameName } from "./fixture";
import { EASE, ENTER } from "./marks";
import { EbbScreen } from "./screens";

/**
 * A project tab's canvas. A project started from an ask opens with its agent already
 * in the turn: the ask is the thread's first line, the rows land under it, and the
 * frames it writes arrive on the canvas as outlines that paint once their file
 * compiles. The other kinds are what the walk can open: an empty design/ (started
 * without an ask), a project spool is still fetching or cloning, and one that is
 * simply there.
 */

export type CanvasKind =
	| { kind: "agent"; ask: string; beats: Beat[]; elapsed: number; ended: boolean; where: string }
	| { kind: "empty"; root: string; name: string }
	| { kind: "arriving"; verb: string; source: string; total: number; got: number; art: Artwork }
	| { kind: "static"; art: Artwork; frames: number };

export function CanvasView({ view }: { view: CanvasKind }) {
	if (view.kind === "empty") {
		return (
			<CanvasChrome pages={[]} tool="none">
				<ProjectEmpty project={view.name} root={view.root} />
			</CanvasChrome>
		);
	}
	if (view.kind === "arriving" || view.kind === "static") {
		const arriving = view.kind === "arriving";
		const art = view.art;
		const shown = arriving ? Math.round((view.got / view.total) * 3) : 3;
		return (
			<CanvasChrome pages={[{ name: "app", frames: arriving ? [] : ["home", "detail", "flow"], active: true, open: true }]} selected={arriving ? undefined : "home"}>
				<div className="absolute inset-0 flex items-start justify-center gap-[40px] pt-[110px]">
					{["home", "detail", "flow"].map((name, index) => (
						<div key={name} className="flex flex-col gap-[8px]">
							<span className="text-text type-detail">{name}</span>
							<motion.div
								initial={false}
								animate={{ opacity: index < shown ? 1 : 0.25 }}
								transition={ENTER}
								className={cn("h-[132px] w-[240px] overflow-hidden rounded-[6px] bg-surface", index >= shown && "border border-border-raised border-dashed")}
							>
								{index < shown && <ProjectArtwork kind={art} className="h-full w-full object-cover object-top" />}
							</motion.div>
						</div>
					))}
				</div>
				{arriving && (
					<div className="absolute bottom-[96px] left-1/2 flex -translate-x-1/2 items-center gap-[10px] rounded-[8px] border border-border-raised bg-bg px-[14px] py-[8px]">
						<StateMark state="running" />
						<span className="type-detail">
							{view.verb} {view.source} · {view.got} of {view.total} frames
						</span>
					</div>
				)}
			</CanvasChrome>
		);
	}
	return <AgentCanvas view={view} />;
}

/* ── the agent's first turn ─────────────────────────────────── */

type RowAt = { beat: Beat; state: "running" | "done" };

function rowsAt(beats: Beat[], elapsed: number): RowAt[] {
	return beats.filter((beat) => elapsed >= beat.at).map((beat) => ({ beat, state: elapsed >= beat.at + beat.runs ? "done" : "running" }));
}

function frameState(beats: Beat[], elapsed: number, name: FrameName): "none" | "writing" | "painted" {
	const beat = beats.find((item) => item.frame === name);
	if (beat === undefined || elapsed < beat.at) return "none";
	return elapsed >= beat.at + beat.runs ? "painted" : "writing";
}

function AgentCanvas({ view }: { view: Extract<CanvasKind, { kind: "agent" }> }) {
	const { beats, elapsed, ended } = view;
	const states = FRAMES.map((name) => ({ name, state: frameState(beats, elapsed, name) }));
	const arrived = states.filter((frame) => frame.state !== "none").map((frame) => frame.name);
	const pages: PageRow[] = [{ name: "app", frames: arrived, active: true, open: true }];
	return (
		<CanvasChrome
			pages={pages}
			railWidth={420}
			railLabel="agent"
			rail={<Rail ask={view.ask} rows={rowsAt(beats, elapsed)} working={!ended} where={view.where} />}
		>
			<div className="absolute inset-0">
				{arrived.length === 0 && (
					<motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-muted type-detail">
						no frames yet · the agent is reading the ask
					</motion.p>
				)}
				<div className="absolute top-[92px] left-1/2 flex -translate-x-1/2 items-start gap-[56px]">
					<AnimatePresence initial={false}>
						{states
							.filter((frame) => frame.state !== "none")
							.map((frame) => (
								<CanvasFrame key={frame.name} name={frame.name} state={frame.state as "writing" | "painted"} />
							))}
					</AnimatePresence>
				</div>
			</div>
		</CanvasChrome>
	);
}

const SCALE = 0.42;

function CanvasFrame({ name, state }: { name: FrameName; state: "writing" | "painted" }) {
	return (
		<motion.div layout initial={{ opacity: 0, y: 10, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={ENTER} className="flex flex-col gap-[8px]">
			<span className="flex items-center gap-[7px] text-text type-detail">
				{name}
				<AnimatePresence>
					{state === "writing" && (
						<motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-[6px] text-muted">
							<span className="h-[5px] w-[5px] rounded-full bg-thread" />
							writing
						</motion.span>
					)}
				</AnimatePresence>
			</span>
			<div className={cn("relative overflow-hidden rounded-[10px]", state === "writing" ? "border border-border-raised border-dashed bg-surface/40" : "")} style={{ width: 390 * SCALE, height: 844 * SCALE }}>
				<AnimatePresence>
					{state === "painted" ? (
						<motion.div key="paint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.28, ease: EASE }} className="absolute inset-0 origin-top-left" style={{ transform: `scale(${SCALE})` }}>
							<EbbScreen name={name} />
						</motion.div>
					) : (
						<motion.div key="ghost" exit={{ opacity: 0 }} className="absolute inset-0 flex flex-col gap-[8px] p-[12px]">
							{[56, 80, 40, 92, 64].map((width, index) => (
								<span key={index} className="h-[8px] animate-pulse rounded-[3px] bg-raised motion-reduce:animate-none" style={{ width: `${width}%` }} />
							))}
						</motion.div>
					)}
				</AnimatePresence>
			</div>
		</motion.div>
	);
}

/* ── the rail ───────────────────────────────────────────────── */

/**
 * The agent rail at its shipped 420, drawn in the shipped rail's language: the
 * thread plate named by the ask, rows that settle from a turning ring to a check,
 * the person's turn on the thread spine. Only one row is new, `name`, the agent's
 * first call, which gives the project the name it will be filed under.
 */
function Rail({ ask, rows, working, where }: { ask: string; rows: RowAt[]; working: boolean; where: string }) {
	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="flex h-11 shrink-0 items-center gap-[10px] border-border border-b pr-[14px]">
				<span className="grid h-full w-[40px] place-items-center border-border border-r text-muted">+</span>
				<StateMark state={working ? "running" : "done"} />
				<span className="min-w-0 flex-1 truncate text-text type-value">{ask}</span>
			</div>
			<div className="flex min-h-0 flex-1 flex-col justify-end gap-[14px] overflow-hidden px-[14px] pt-[16px] pb-[14px] [&>*]:shrink-0">
				<motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={ENTER} className="relative flex flex-col gap-[6px] pl-[12px]">
					<span className="absolute top-[2px] bottom-[2px] left-0 w-[2px] rounded-full bg-thread" />
					<p className="text-text type-body">{ask}</p>
					<span className="text-muted type-detail">new project · {where}</span>
				</motion.div>
				<div className="flex flex-col gap-[2px]">
					<AnimatePresence initial={false}>
						{rows
							.filter((row) => row.beat.kind !== "say")
							.map((row) => (
								<motion.div key={row.beat.label + row.beat.at} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={ENTER} className="flex h-[26px] items-center gap-[10px]">
									<StateMark state={row.state} />
									{row.beat.kind === "think" ? (
										<span className="text-muted type-value">
											thinking{row.state === "done" ? ` ${(row.beat.runs / 1000).toFixed(1)}s` : ""}
										</span>
									) : (
										<>
											<span className="w-[38px] shrink-0 text-muted type-value">{row.beat.tool}</span>
											<span className={cn("min-w-0 flex-1 truncate type-value", row.beat.names ? "text-text" : "text-text")}>{row.beat.label}</span>
											{row.beat.names && row.state === "done" && <span className="shrink-0 text-muted type-detail">the project's name</span>}
											{row.beat.meta && row.state === "done" && <span className="shrink-0 text-text type-detail">{row.beat.meta}</span>}
										</>
									)}
								</motion.div>
							))}
					</AnimatePresence>
				</div>
				{rows
					.filter((row) => row.beat.kind === "say")
					.map((row) => (
						<motion.p key="say" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: EASE }} className="text-text type-body">
							{row.beat.label}
						</motion.p>
					))}
			</div>
			<div className="shrink-0 border-border border-t p-[14px]">
				<div className="flex min-h-[92px] flex-col justify-between rounded-[8px] border border-border-raised bg-surface px-[12px] py-[10px]">
					<span className="text-muted type-body">say what to change</span>
				</div>
				<div className="mt-[10px] flex h-[20px] items-center justify-between">
					<span className="text-muted type-detail">Opus · high</span>
					{working ? (
						<span className="flex h-[22px] items-center gap-[8px] rounded-[6px] border border-border-raised bg-raised px-[8px]">
							<span className="h-[7px] w-[7px] rounded-[1px] bg-text" />
							<span className="type-detail">stop</span>
							<span className="text-muted type-detail">⎋</span>
						</span>
					) : (
						<span className="text-muted type-detail">⏎ to send</span>
					)}
				</div>
			</div>
		</div>
	);
}
