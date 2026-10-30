// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, onTestFinished } from "vitest";
import type { AgentEvent } from "../../daemon/agent-events";
import type { PresenceAgentWork, PresenceState } from "../../team-sync-protocol";
import type { AgentCompanion } from "./agent-companion";
import { transcriptOf } from "./agent-transcript";
import { type FrameAgent, FrameAgentsMark, frameAgents, NO_AGENTS, steady } from "./frame-agents";
import { createPresenceRoom } from "./presence";

/** Agents at a frame, said on its name row (task 164): which frames, and what the row says. */

const companion = (over: Partial<AgentCompanion> = {}): AgentCompanion => ({
	key: "",
	name: null,
	own: false,
	frame: "app/home",
	spot: null,
	act: "edit",
	lines: 0,
	range: null,
	beat: 1,
	...over,
});
const here: PresenceState = { page: "app", pointer: null, pressed: false, dragging: [], inside: null, view: null };
const ada = { accountId: "acct-ada", name: "ada", color: "#eaa94a" };

function roomWith(work: PresenceAgentWork[], running = true) {
	const room = createPresenceRoom();
	room.hear({ type: "presence", person: ada, state: { ...here, agent: { running, status: null, work } }, still: 0 });
	return room;
}

describe("which frames agents are at", () => {
	it("keeps the lists and the map a turn's tick did not change, so no label redraws for it (task 169)", () => {
		const first = steady(NO_AGENTS, frameAgents([companion(), companion({ frame: "app/cart", key: "d1" })], []));
		const tick = steady(
			first,
			frameAgents([companion({ beat: 2 }), companion({ frame: "app/cart", key: "d1" })], []),
		);
		expect(tick).toBe(first);
		const asked = steady(
			tick,
			frameAgents([companion({ act: "ask" }), companion({ frame: "app/cart", key: "d1" })], []),
		);
		expect(asked).not.toBe(tick);
		expect(asked.get("app/cart")).toBe(first.get("app/cart"));
		expect(asked.get("app/home")?.[0]?.waiting).toBe(true);
		expect(steady(asked, frameAgents([], []))).toBe(NO_AGENTS);
	});

	it("puts this canvas's agents at their frames, and a designer holding only its placeholder at the placeholder", () => {
		const at = frameAgents(
			[
				companion(),
				companion({
					key: "d1",
					name: "Split home",
					frame: null,
					spot: { name: "ideas/split", x: 0, y: 0, w: 1, h: 1 },
				}),
				companion({ key: "d2", frame: null, spot: null }),
			],
			[],
		);
		expect([...at.keys()]).toEqual(["app/home", "ideas/split"]);
		expect(at.get("app/home")).toEqual([{ color: null, own: true, waiting: false, says: "Your agent" }]);
		expect(at.get("ideas/split")?.[0]?.says).toBe("Split home");
	});

	it("waits on you where your agent stopped to ask", () => {
		const at = frameAgents([companion({ act: "ask" })], []);
		expect(at.get("app/home")).toEqual([
			{ color: null, own: true, waiting: true, says: "Your agent · waiting on you" },
		]);
	});

	it("puts a teammate's agents where their presence says, in their colour, with what each is doing", () => {
		const room = roomWith([
			{ frame: "app/cart", act: "edit", detail: "Changing lines 12–30", lines: 80 },
			{ frame: "app/home", act: "ask", detail: "Can it use the new logo?", lines: 0 },
		]);
		const at = frameAgents([companion()], room.teammates());
		expect(at.get("app/cart")).toEqual([
			{ color: "#eaa94a", own: false, waiting: false, says: "ada's agent · Changing lines 12–30" },
		]);
		expect(at.get("app/home")?.map((one) => one.own)).toEqual([true, false]);
		expect(at.get("app/home")?.[1]).toMatchObject({ waiting: true, says: "ada's agent · waiting" });
	});

	it.each<[string, AgentEvent[]]>([
		["done", [{ kind: "ended", ending: "done", reason: null, stopReason: "end_turn", parent: null }]],
		["stopped", [{ kind: "ended", ending: "stopped", reason: "aborted_streaming", stopReason: null, parent: null }]],
		["failed", [{ kind: "ended", ending: "failed", reason: "rate limit", stopReason: null, parent: null }]],
		["gone with nothing said", [{ kind: "closed", code: null, message: "stopped", parent: null }]],
	])("lets go of the frame once the turn is %s (task 168)", (_how, ending) => {
		const editing: AgentEvent = {
			kind: "frame",
			change: "changed",
			frame: "app/home",
			lines: 40,
			call: "c1",
			task: null,
			parent: null,
		};
		const marks = (events: AgentEvent[]) =>
			frameAgents(
				transcriptOf(
					[],
					events.map((event, at) => ({ at, event })),
				).companions,
				[],
			);
		expect(marks([editing]).get("app/home")).toHaveLength(1);
		expect(marks([editing, ...ending]).size).toBe(0);
	});

	it("forgets a teammate's agents once they leave", () => {
		const room = roomWith([{ frame: "app/cart", act: "edit", detail: null, lines: 0 }]);
		room.hear({ type: "presence", person: ada, state: null, still: 0 });
		expect(frameAgents([], room.teammates()).size).toBe(0);
	});
});

describe("what a frame's name row says", () => {
	function draw(agents: readonly FrameAgent[] | undefined): HTMLElement {
		const host = document.createElement("div");
		document.body.append(host);
		const root = createRoot(host);
		onTestFinished(() => {
			act(() => root.unmount());
			host.remove();
		});
		act(() => root.render(createElement(FrameAgentsMark, { name: "app/home", agents })));
		return host;
	}
	const mine: FrameAgent = { color: null, own: true, waiting: false, says: "Your agent" };
	const adas: FrameAgent = { color: "#eaa94a", own: false, waiting: false, says: "ada's agent · Drawing" };

	it("says nothing with no agent there", () => {
		expect(draw(undefined).textContent).toBe("");
		expect(draw([]).textContent).toBe("");
	});

	it("says working with a turning ring, in neutral ink for yours and their colour for a teammate's", () => {
		const yours = draw([mine]).querySelector<HTMLElement>("[data-frame-agents]");
		expect(yours?.textContent).toBe("working");
		expect(yours?.querySelector(".animate-agent-spin")).not.toBeNull();
		expect(yours?.style.color).toBe("");
		const theirs = draw([adas]).querySelector<HTMLElement>("[data-frame-agents]");
		expect(theirs?.style.color).toBe("#eaa94a");
		expect(theirs?.title).toBe("ada's agent · Drawing");
	});

	it("says waiting over working, on you when it is yours that asks", () => {
		const yours = draw([adas, { ...mine, waiting: true }]).querySelector<HTMLElement>("[data-frame-agents]");
		expect(yours?.getAttribute("data-frame-agents-state")).toBe("waiting");
		expect(yours?.textContent).toBe("waiting on you");
		const theirs = draw([{ ...adas, waiting: true }]).querySelector<HTMLElement>("[data-frame-agents]");
		expect(theirs?.textContent).toBe("waiting");
		expect(theirs?.style.color).toBe("#eaa94a");
	});
});
