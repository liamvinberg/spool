import type { AgentEvent } from "../../daemon/agent-events";
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

/** a place held on the canvas for a designer before its frame exists, in canvas units */
export interface CompanionSpot {
	readonly name: string;
	readonly x: number;
	readonly y: number;
	readonly w: number;
	readonly h: number;
}

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

interface Held {
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

function firstWord(description: string): string | null {
	const word = description
		.toLowerCase()
		.replace(/[^a-z0-9\s-]+/g, " ")
		.split(/\s+/)
		.find((one) => one !== "" && !["design", "draw", "make", "create", "build", "the", "a", "an"].includes(one));
	return word ?? null;
}

/**
 * Every working agent and where it is, as of the last event.
 *
 * Only agents that are somewhere: a frame or a held spot. An agent that has touched nothing
 * on the canvas has no square, and a designer that reported back has gone. Once the turn is
 * over there is nobody; the layer lets them go.
 */
export function companionsOf(seen: readonly { readonly event: AgentEvent }[], root = ""): AgentCompanion[] {
	const by = new Map<string, Held>();
	/** the agent each call was made on */
	const threadOf = new Map<string, string>();
	/** each delegation's own words for its task */
	const described = new Map<string, string>();
	const taskCalls = new Map<string, string>();
	let cwd = root;

	const agentOf = (task: string | null, parent: string | null): string =>
		(task === null ? undefined : taskCalls.get(task)) ?? parent ?? "";
	const put = (agent: string, next: Partial<Held> & { act: CompanionAct }, beat: number) => {
		const was = by.get(agent);
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

	seen.forEach(({ event }, index) => {
		switch (event.kind) {
			case "ready":
				if (event.cwd !== null) cwd = event.cwd;
				return;
			case "call":
				if (event.id !== null) threadOf.set(event.id, event.parent ?? "");
				return;
			case "called": {
				threadOf.set(event.id, event.parent ?? "");
				if (event.tool === "Agent") {
					const words = (event.input as { description?: unknown } | null)?.description;
					if (typeof words === "string") described.set(event.id, words);
					return;
				}
				const named = nameCall({ tool: event.tool, input: event.input, root: cwd, whole: true });
				if (named?.frame == null || named.writes) return;
				const agent = event.parent ?? "";
				const act: CompanionAct = named.verb === "shot" ? "shot" : READS.has(named.verb) ? "read" : "idle";
				put(agent, { frame: named.frame, spot: null, act, call: act === "idle" ? null : event.id }, index);
				return;
			}
			case "result": {
				for (const [agent, held] of by) {
					if (held.call !== event.id) continue;
					put(agent, { act: "idle", lines: held.lines }, index);
				}
				return;
			}
			case "task-started":
				if (event.call !== null) {
					taskCalls.set(event.task, event.call);
					if (event.description !== null && !described.has(event.call))
						described.set(event.call, event.description);
				}
				return;
			case "task-step":
				if (event.call !== null) taskCalls.set(event.task, event.call);
				return;
			case "task-done": {
				// a designer that reported back is done here: its square goes
				const call = taskCalls.get(event.task);
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
					const spot = { name: event.name, x: event.x, y: event.y, w: event.w, h: event.h };
					put(agent, { frame: null, spot, act: "idle" }, index);
				} else if (event.state === "released") {
					const held = by.get(agent);
					if (held !== undefined && held.frame === null && held.spot?.name === event.name) by.delete(agent);
				}
				return;
			}
			case "asking": {
				const agent = event.parent ?? (event.call === null ? undefined : threadOf.get(event.call)) ?? "";
				const held = by.get(agent);
				// an agent nowhere on the canvas asks in the rail alone
				if (held === undefined) return;
				put(agent, { act: "ask", request: event.request }, index);
				return;
			}
			case "answered": {
				for (const [agent, held] of by) if (held.request === event.request) put(agent, { act: "idle" }, index);
				return;
			}
			default:
				return;
		}
	});

	return [...by].map(([key, held]) => {
		const words = key === "" ? null : (described.get(key) ?? null);
		const name =
			key === ""
				? null
				: held.frame !== null
					? takeOf(held.frame)
					: held.spot !== null
						? (takeOf(held.spot.name).split("-")[0] ?? held.spot.name)
						: words === null
							? null
							: firstWord(words);
		return {
			key,
			name,
			frame: held.frame,
			spot: held.frame === null ? held.spot : null,
			act: held.act,
			lines: held.lines,
			range: held.range,
			beat: held.beat,
		};
	});
}
