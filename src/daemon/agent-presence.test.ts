import { describe, expect, it } from "vitest";
import { PRESENCE_AGENT_WORDS, PRESENCE_AGENT_WORK } from "../team-sync-protocol";
import type { AgentCompanion } from "../ui/canvas/agent-companion";
import type { AgentTile, AgentTurnFoot } from "../ui/canvas/agent-transcript";
import { presenceAgentOf } from "./agent-presence";

/**
 * What a turn says of its agent to the team (#378): the little a teammate's canvas draws,
 * folded from the same transcript the rail draws, and bounded the way presence is read.
 */

const tile = (frame: string, over: Partial<AgentTile> = {}): AgentTile => ({
	key: `tile:${frame}`,
	frame,
	state: "reading",
	lines: 0,
	by: null,
	range: null,
	took: null,
	...over,
});

const companion = (frame: string, over: Partial<AgentCompanion> = {}): AgentCompanion => ({
	key: `call-${frame}`,
	name: null,
	frame,
	spot: null,
	own: false,
	act: "edit",
	lines: 40,
	range: null,
	beat: 1,
	...over,
});

const foot = (tiles: AgentTile[], status: string | null): AgentTurnFoot => ({
	key: "turn",
	kind: "turn",
	tiles,
	status,
	thinking: false,
	ms: null,
	ending: null,
});

describe("a turn's agent, as its team hears it", () => {
	it("says its status, each designer in its placeholder, and each agent at a frame that stands", () => {
		const agent = presenceAgentOf({
			over: false,
			asking: null,
			foot: foot(
				[
					tile("ideas/calm", { step: "Running Read the home frame" }),
					tile("ideas/loud", { state: "drawing", lines: 12 }),
					tile("ideas/done", { state: "fresh", lines: 80 }),
				],
				"2 designers working, 1 done",
			),
			companions: [
				companion("app/home"),
				// a designer at its own frame is its placeholder's to show
				companion("ideas/done", { own: true }),
				// one already said in its placeholder is said once
				companion("ideas/loud", { act: "new" }),
			],
		});
		expect(agent).toEqual({
			running: true,
			status: "2 designers working, 1 done",
			work: [
				{ frame: "ideas/calm", act: "reading", detail: "Running Read the home frame", lines: 0 },
				{ frame: "ideas/loud", act: "drawing", detail: null, lines: 12 },
				{ frame: "app/home", act: "edit", detail: null, lines: 40 },
			],
		});
	});

	it("is not at work while it waits on its person, and is nothing once the turn is over", () => {
		const turn = { over: false, asking: "req-1", foot: foot([], "Asking"), companions: [] };
		expect(presenceAgentOf(turn)?.running).toBe(false);
		expect(presenceAgentOf({ ...turn, over: true })).toBeNull();
	});

	it("keeps within presence's bounds however much the turn holds", () => {
		const long = "x".repeat(PRESENCE_AGENT_WORDS + 40);
		const agent = presenceAgentOf({
			over: false,
			asking: null,
			foot: foot(
				Array.from({ length: PRESENCE_AGENT_WORK + 3 }, (_, n) => tile(`ideas/take-${n}`, { step: long })),
				long,
			),
			companions: [companion("app/home")],
		});
		expect(agent?.status).toHaveLength(PRESENCE_AGENT_WORDS);
		expect(agent?.status?.endsWith("…")).toBe(true);
		expect(agent?.work).toHaveLength(PRESENCE_AGENT_WORK);
		expect(agent?.work.every((one) => (one.detail?.length ?? 0) <= PRESENCE_AGENT_WORDS)).toBe(true);
	});
});
