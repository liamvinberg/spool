import type { AgentEvent, AgentSpot } from "../../daemon/agent-events";
import { nameCall } from "./agent-nouns";

/**
 * The agent's presence on the canvas, folded from the turn (#366).
 *
 * One small ink square per working agent: the agent the person talks to, and every designer
 * it fanned out to. This is the fact underneath it, read off the same events the rail draws
 * from: where each agent is and what it is doing there. How the square moves between those
 * facts is `agent-companion-layer`'s.
 *
 * - `new`: the frame's source is streaming in; `lines` counts it. The square is its caret.
 * - `landed`: the frame just landed; the square rides down its edge as the picture draws in.
 * - `read`: a call is reading the frame; the square slides down its edge.
 * - `edit`: a change landed in the frame; `range` is the lines that moved.
 * - `shot`: spool is taking the frame's picture.
 * - `delete`: the frame went; it shrinks into the square.
 * - `ask`: the agent stopped to ask the person something; the square is the waiting ring.
 * - `idle`: at the frame between calls.
 */
export type CompanionAct = "new" | "landed" | "read" | "edit" | "shot" | "delete" | "ask" | "idle";

/** a place reserved on the canvas for a designer before its frame exists: the spot event's own shape */
export type CompanionSpot = Pick<AgentSpot, "name" | "x" | "y" | "w" | "h">;

export interface AgentCompanion {
	/** "" for the agent the person talks to, the delegating call for a designer */
	readonly key: string;
	/** a designer's short name, which the canvas shows once two agents share a page */
	readonly name: string | null;
	/** the frame it is at, as a path under frames/; null while it holds only a spot */
	readonly frame: string | null;
	readonly spot: CompanionSpot | null;
	readonly act: CompanionAct;
	/** new: lines streamed so far; edit and landed: lines in the file */
	readonly lines: number;
	readonly range: { readonly from: number; readonly to: number } | null;
	/**
	 * Which event put it in this act, so the same events give the same beat and the layer
	 * replays a motion only when something new happened. A caret gliding down a frame
	 * keeps its beat: the stream is one act, not one per line.
	 */
	readonly beat: number;
}

/** the calls that read a frame: the square slides down its edge while one is out */
const READS: ReadonlySet<string> = new Set(["read", "look", "logs", "check", "url"]);

interface Standing {
	frame: string | null;
	spot: CompanionSpot | null;
	act: CompanionAct;
	lines: number;
	range: { from: number; to: number } | null;
	beat: number;
	/** the call that holds the act open, so its result lets go of it */
	call: string | null;
	/** the request it waits on */
	request: string | null;
}

/** the take after a frame's last `--`, which is what five designers are told apart by */
function takeOf(name: string): string {
	const leaf = name.split("/").pop() ?? name;
	const at = leaf.lastIndexOf("--");
	return at >= 0 ? leaf.slice(at + 2) : leaf;
}

/**
 * What the companions read off the transcript's own fold rather than keeping a second copy
 * of: it already knows which delegation each call was made on, which delegating call each
 * task answers to, and where the agent stands.
 */
export interface CompanionIndexes {
	/** the delegation a call was made on, "" for the agent the person talks to */
	readonly delegationOf: (call: string) => string | undefined;
	/** the delegating call a delegated task answers to */
	readonly callOfTask: (task: string) => string | undefined;
	/** the project the agent stands in, so a path names a frame */
	readonly root: () => string;
}

export interface CompanionFold {
	/** one event of the turn, at its place in it, which is its beat */
	see(event: AgentEvent, beat: number): void;
	/**
	 * Every working agent and where it is, as of the last event.
	 *
	 * Only agents that are somewhere: a frame or a reserved spot. An agent that has touched
	 * nothing on the canvas has no square, and a designer that reported back has gone.
	 */
	companions(): AgentCompanion[];
}

/**
 * Where each agent is on the canvas, folded event by event alongside the transcript
 * (`transcriptOf` feeds it), so the two read one set of indexes.
 */
export function companionFold(indexes: CompanionIndexes): CompanionFold {
	const by = new Map<string, Standing>();
	/** asks from agents nowhere on the canvas yet, still waiting */
	const waits = new Map<string, { call: string | null; request: string }>();

	const agentOf = (task: string | null, parent: string | null): string =>
		(task === null ? undefined : indexes.callOfTask(task)) ?? parent ?? "";
	const put = (agent: string, next: Partial<Standing> & { act: CompanionAct; release?: boolean }, beat: number) => {
		const pending = waits.get(agent);
		const was =
			by.get(agent) ??
			// an agent that asked before it was anywhere on the canvas arrives already waiting
			(pending === undefined
				? undefined
				: { frame: null, spot: null, act: "ask" as const, lines: 0, range: null, beat, ...pending });
		waits.delete(agent);
		// a square waiting on a person stays the waiting ring until somebody answers or the
		// call it asked for is over: the frame a write landed in catching up behind the ask
		// moves where it waits, not what it is doing
		if (was !== undefined && was.act === "ask" && was.request !== null && next.act !== "ask" && !next.release) {
			by.set(agent, {
				...was,
				frame: next.frame !== undefined ? next.frame : was.frame,
				spot: next.spot !== undefined ? next.spot : was.spot,
			});
			return;
		}
		by.set(agent, {
			frame: next.frame !== undefined ? next.frame : (was?.frame ?? null),
			spot: next.spot !== undefined ? next.spot : (was?.spot ?? null),
			act: next.act,
			lines: next.lines ?? 0,
			range: next.range ?? null,
			beat,
			call: next.call ?? null,
			request: next.request ?? null,
		});
	};

	const see = (event: AgentEvent, index: number) => {
		switch (event.kind) {
			case "called": {
				if (event.tool === "Agent") return;
				const named = nameCall({ tool: event.tool, input: event.input, root: indexes.root(), whole: true });
				if (named?.frame == null || named.writes) return;
				const agent = event.parent ?? "";
				const act: CompanionAct = named.verb === "shot" ? "shot" : READS.has(named.verb) ? "read" : "idle";
				put(agent, { frame: named.frame, spot: null, act, call: act === "idle" ? null : event.id }, index);
				return;
			}
			case "result": {
				for (const [agent, wait] of waits) if (wait.call === event.id) waits.delete(agent);
				for (const [agent, standing] of by) {
					if (standing.call !== event.id) continue;
					put(agent, { act: "idle", lines: standing.lines, release: true }, index);
				}
				return;
			}
			case "task-done": {
				// a designer that reported back is done here: its square goes
				const call = indexes.callOfTask(event.task);
				if (call !== undefined) by.delete(call);
				return;
			}
			case "frame-source": {
				const agent = event.parent ?? "";
				const was = by.get(agent);
				// one stream is one act: the caret glides down it rather than restarting per line
				const same = was?.act === "new" && was.frame === event.frame;
				put(agent, { frame: event.frame, act: "new", lines: event.lines }, same ? was.beat : index);
				return;
			}
			case "frame": {
				const agent = agentOf(event.task, event.parent);
				const act: CompanionAct =
					event.change === "changed" ? "edit" : event.change === "deleted" ? "delete" : "landed";
				put(agent, { frame: event.frame, spot: null, act, lines: event.lines, range: event.range ?? null }, index);
				return;
			}
			case "spot": {
				const agent = event.call ?? agentOf(event.task, event.parent);
				if (event.state === "held") {
					const { name, x, y, w, h } = event;
					put(agent, { frame: null, spot: { name, x, y, w, h }, act: "idle" }, index);
				} else if (event.state === "released") {
					const standing = by.get(agent);
					if (standing !== undefined && standing.frame === null && standing.spot?.name === event.name)
						by.delete(agent);
				}
				return;
			}
			case "asking": {
				const agent = event.parent ?? (event.call === null ? undefined : indexes.delegationOf(event.call)) ?? "";
				const standing = by.get(agent);
				// an agent nowhere on the canvas asks in the rail alone, unless a frame it
				// wrote catches up with the ask
				if (standing === undefined) waits.set(agent, { call: event.call, request: event.request });
				else put(agent, { act: "ask", request: event.request, call: event.call }, index);
				return;
			}
			case "answered": {
				for (const [agent, wait] of waits) if (wait.request === event.request) waits.delete(agent);
				for (const [agent, standing] of by)
					if (standing.request === event.request) put(agent, { act: "idle", release: true }, index);
				return;
			}
			default:
				return;
		}
	};

	const companions = (): AgentCompanion[] =>
		[...by].map(([key, standing]) => ({
			key,
			name:
				key === ""
					? null
					: standing.frame !== null
						? takeOf(standing.frame)
						: standing.spot !== null
							? (takeOf(standing.spot.name).split("-")[0] ?? standing.spot.name)
							: null,
			frame: standing.frame,
			spot: standing.frame === null ? standing.spot : null,
			act: standing.act,
			lines: standing.lines,
			range: standing.range,
			beat: standing.beat,
		}));

	return { see, companions };
}
