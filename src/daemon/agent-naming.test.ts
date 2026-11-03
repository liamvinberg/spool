import { describe, expect, it, vi } from "vitest";
import { SpoolError } from "../errors";
import { kebabName, nameFirst } from "./agent-naming";

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

describe("naming a new project from its first ask", () => {
	const named = (root: string, hasFrames = false, reply: string | null = "tide-planner") => {
		const ask = vi.fn(async () => reply);
		const rename = vi.fn((from: string, name: string) => ({ root: from.replace(/[^/]+$/u, name) }));
		return { ask, rename, root: nameFirst(root, { hasFrames: () => hasFrames, ask, rename }) };
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

	it("stays untitled when the agent gives no name, or the name is refused", async () => {
		expect(await named("/w/untitled", false, null).root).toBe("/w/untitled");
		expect(await named("/w/untitled", false, "I can't name this without more context.").root).toBe("/w/untitled");
		const refused = nameFirst("/w/untitled", {
			hasFrames: () => false,
			ask: async () => "coffee",
			rename: () => {
				throw new SpoolError("A project with that name is already open in Spool. Choose another name.");
			},
		});
		expect(await refused).toBe("/w/untitled");
	});
});
