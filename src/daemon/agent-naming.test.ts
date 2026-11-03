import { describe, expect, it, vi } from "vitest";
import { SpoolError } from "../errors";
import { fixtureAgentExecutor } from "../test-helpers";
import { askOnce, kebabName, nameFirst, spokenBefore } from "./agent-naming";

describe("a reply as a project name", () => {
	it("keeps one to three words, lowercase and hyphenated, from the reply's last line", () => {
		expect(kebabName("tide-planner\n")).toBe("tide-planner");
		expect(kebabName("Sure! Here it is:\n\n  Tide Planner ")).toBe("tide-planner");
		expect(kebabName("`café_menu`")).toBe("cafe-menu");
		expect(kebabName("a planner for sea kayakers")).toBeNull();
		expect(kebabName("")).toBeNull();
		expect(kebabName("!!!")).toBeNull();
		expect(kebabName("untitled-2")).toBeNull();
	});
});

describe("asking the agent", () => {
	it("hears a reply only from a clean exit: a signed-out agent says so on stdout", async () => {
		const answering = (code: number, line: string) =>
			fixtureAgentExecutor(undefined, (proc) => {
				proc.emit(line);
				proc.exit(code);
			}).executor;
		const spawn = { command: "claude", args: ["-p"], cwd: "/w", env: {} };
		expect(await askOnce(answering(0, "tide-planner"), spawn)).toBe("tide-planner");
		expect(await askOnce(answering(1, "Not logged in"), spawn)).toBeNull();
	});
});

describe("naming a new project from its first ask", () => {
	const waiting = {
		namings: new Map(),
		turn: undefined,
		signal: new AbortController().signal,
		registered: () => true,
	};
	const named = (root: string, hasFrames = false, reply: string | null = "tide-planner") => {
		const ask = vi.fn(async () => reply);
		const rename = vi.fn((from: string, name: string) => ({ root: from.replace(/[^/]+$/u, name) }));
		return {
			ask,
			rename,
			root: nameFirst(root, { ...waiting, hasFrames: () => hasFrames, spoken: () => false, ask, rename }),
		};
	};

	it("renames an untitled project with no frames to the agent's name for it", async () => {
		const run = named("/w/untitled-2");
		expect(await run.root).toBe("/w/tide-planner");
		expect(run.rename).toHaveBeenCalledExactlyOnceWith("/w/untitled-2", "tide-planner");
	});

	it("never asks about a project a person named, or one that has frames", async () => {
		for (const run of [named("/w/coffee"), named("/w/untitled", true)]) {
			expect(await run.root).toMatch(/coffee|untitled/u);
			expect(run.ask).not.toHaveBeenCalled();
		}
	});

	it("names from the very first ask only: not after a turn in this chat, nor with another chat in the project", () => {
		const user = { kind: "user", text: "A tide planner" };
		expect(spokenBefore([], "a")).toBe(false);
		expect(spokenBefore([{ id: "a", entries: [user] }], "a")).toBe(false);
		expect(spokenBefore([{ id: "a", entries: [user, { kind: "prose", text: "Here it is." }, user] }], "a")).toBe(
			true,
		);
		expect(spokenBefore([{ id: "b", entries: [user] }], "a")).toBe(true);
	});

	it("stays untitled when the agent gives no name, or the name is refused", async () => {
		expect(await named("/w/untitled", false, null).root).toBe("/w/untitled");
		expect(await named("/w/untitled", false, "I can't name this without more context.").root).toBe("/w/untitled");
		const refused = nameFirst("/w/untitled", {
			...waiting,
			hasFrames: () => false,
			spoken: () => false,
			ask: async () => "coffee",
			rename: () => {
				throw new SpoolError("A project with that name is already open in Spool. Choose another name.");
			},
		});
		expect(await refused).toBe("/w/untitled");
	});
});
