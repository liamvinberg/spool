import { describe, expect, it } from "vitest";
import {
	PRESENCE_AGENT_WORDS,
	PRESENCE_AGENT_WORK,
	type PresenceAgent,
	type PresenceState,
	readPresence,
	readPresenceState,
} from "./team-sync-protocol";

/**
 * A presence state as a daemon, a browser or spool.page reads it: copied field by field and
 * bounded, so what one person says stays small for everyone it is relayed to.
 */

const here: PresenceState = {
	page: "ideas",
	pointer: { x: 1, y: 2 },
	pressed: false,
	dragging: [],
	inside: null,
	view: null,
};

const agent: PresenceAgent = {
	running: true,
	status: "2 designers working",
	work: [
		{ frame: "ideas/home--calm", act: "reading", detail: "Read the home frame", lines: 0 },
		{ frame: "app/home", act: "edit", detail: null, lines: 120 },
	],
};

describe("a presence state's agent (#378)", () => {
	it("is copied whole when it is well formed, and is no part of a state that has none", () => {
		expect(readPresenceState({ ...here, agent })).toEqual({ ...here, agent });
		expect(readPresenceState(here)).toEqual(here);
		expect(readPresenceState(here)).not.toHaveProperty("agent");
		expect(readPresenceState({ ...here, agent: { ...agent, status: null, work: [] } })).toEqual({
			...here,
			agent: { running: true, status: null, work: [] },
		});
	});

	it("copies only the fields it knows", () => {
		const read = readPresenceState({
			...here,
			extra: "no",
			agent: { ...agent, secret: "no", work: [{ ...agent.work[0], source: "export default …" }] },
		});
		expect(read).toEqual({ ...here, agent: { ...agent, work: [agent.work[0]] } });
	});

	it("drops an agent past its bounds or not well formed, and keeps where the person is", () => {
		const one = agent.work[0];
		const wrong = [
			"working",
			{ ...agent, running: "yes" },
			{ ...agent, status: "x".repeat(PRESENCE_AGENT_WORDS + 1) },
			{ ...agent, work: Array.from({ length: PRESENCE_AGENT_WORK + 1 }, () => one) },
			{ ...agent, work: [{ ...one, frame: "x".repeat(161) }] },
			{ ...agent, work: [{ ...one, act: "a-word-far-too-long-to-be-one" }] },
			{ ...agent, work: [{ ...one, detail: "x".repeat(PRESENCE_AGENT_WORDS + 1) }] },
			{ ...agent, work: [{ ...one, lines: -1 }] },
			{ ...agent, work: [{ ...one, lines: 1.5 }] },
			{ ...agent, work: "calm" },
		];
		for (const value of wrong) expect(readPresenceState({ ...here, agent: value })).toEqual(here);
		expect(
			readPresenceState({
				...here,
				agent: { ...agent, work: Array.from({ length: PRESENCE_AGENT_WORK }, () => one) },
			})?.agent?.work,
		).toHaveLength(PRESENCE_AGENT_WORK);
	});

	it("rides a relayed presence message to the canvas", () => {
		const message = {
			type: "presence",
			person: { accountId: "ada", name: "ada", color: "#eaa94a" },
			state: { ...here, agent },
			still: 0,
		};
		expect(readPresence(message)?.state).toEqual({ ...here, agent });
	});
});
