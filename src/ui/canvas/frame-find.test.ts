import { describe, expect, it } from "vitest";
import type { ProjectedFrame } from "../api";
import { ageOf, findFrames, newestFirst } from "./frame-find";

const frame = (name: string, born?: number): ProjectedFrame => ({
	name,
	page: "agent",
	x: 0,
	y: 0,
	w: 320,
	h: 200,
	...(born === undefined ? {} : { born }),
});

const names = (hits: ReturnType<typeof findFrames>): string[] => hits.map((hit) => hit.frame.name);

describe("findFrames", () => {
	it("ranks a whole segment above letters scavenged across the name", () => {
		const rows = newestFirst([
			frame("agent-play--nav-dock", 3),
			frame("agent-play--plan-log", 2),
			frame("agent-play--plan-pinned", 1),
		]);
		const hits = names(findFrames("plan", rows));
		expect(hits.slice(0, 2)).toEqual(["agent-play--plan-log", "agent-play--plan-pinned"]);
		expect(hits).toContain("agent-play--nav-dock");
	});

	it("crosses separators the way people type", () => {
		const rows = newestFirst([frame("agent-play--nav-shut", 2), frame("agent-play--nav-host", 1)]);
		expect(names(findFrames("navshut", rows))).toEqual(["agent-play--nav-shut"]);
	});

	it("lets an exact name outrank the variants it prefixes", () => {
		const rows = newestFirst([frame("agent-play--entered", 2), frame("agent-play", 1)]);
		expect(names(findFrames("agent-play", rows))[0]).toBe("agent-play");
	});

	it("finds the variant tail at full strength", () => {
		const rows = newestFirst([
			frame("agent-play--ask-drop", 3),
			frame("agent-play--entered-drop", 2),
			frame("agent-play--ask-composer", 1),
		]);
		expect(names(findFrames("drop", rows))).toEqual(["agent-play--ask-drop", "agent-play--entered-drop"]);
	});

	it("drops a coincidence that spends more than it earns", () => {
		const rows = newestFirst([frame("site-disk", 1)]);
		expect(findFrames("sd", rows)).toEqual([]);
	});

	it("answers an empty query with every frame, newest first", () => {
		const rows = newestFirst([frame("old", 1), frame("new", 3), frame("mid", 2)]);
		expect(names(findFrames("", rows))).toEqual(["new", "mid", "old"]);
	});

	it("breaks score ties by recency", () => {
		const rows = newestFirst([frame("agent-play--plan-log", 1), frame("agent-play--plan-pinned", 2)]);
		expect(names(findFrames("plan", rows))[0]).toBe("agent-play--plan-pinned");
	});
});

describe("newestFirst", () => {
	it("sorts by born, name as the stable fallback", () => {
		const rows = newestFirst([frame("b"), frame("a"), frame("c", 5)]);
		expect(rows.map((row) => row.name)).toEqual(["c", "a", "b"]);
	});
});

describe("ageOf", () => {
	it("words an age the way the empty list prints it", () => {
		const now = 1_000_000_000;
		expect(ageOf(undefined, now)).toBeUndefined();
		expect(ageOf(now - 30_000, now)).toBe("now");
		expect(ageOf(now - 90_000, now)).toBe("1m");
		expect(ageOf(now - 5 * 3_600_000, now)).toBe("5h");
		expect(ageOf(now - 3 * 86_400_000, now)).toBe("3d");
	});
});
