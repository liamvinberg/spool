import { describe, expect, it } from "vitest";
import type { AgentCompanion } from "./agent-companion";
import { dockRoom } from "./agent-companion-layer";
import { pillSlots as dock, pillWidth } from "./presence-layer";

const pillSlots = (...args: Parameters<typeof dock>) => dock(...args).pills;

/**
 * Where teammates' pills dock on a frame's name row (DEV-196), and that they step aside left of an
 * agent's companion docked on the same row rather than drawing over it (#373).
 */

const HOME = { name: "home", x: 100, y: 100, w: 400, h: 800 };
const CART = { name: "cart", x: 600, y: 100, w: 400, h: 800 };
const flat = (x: number, y: number) => ({ x, y });
const PAGE = [HOME, CART];
const ben = { id: "ben", name: "ben" };
const ada = { id: "ada", name: "ada lovelace" };
const companion = (over: Partial<AgentCompanion> = {}): AgentCompanion => ({
	key: "",
	name: null,
	own: false,
	frame: "home",
	spot: null,
	act: "idle",
	lines: 0,
	range: null,
	beat: 1,
	...over,
});

describe("pills on a frame's name", () => {
	it("line up right to left from the frame's top-right corner", () => {
		const slots = pillSlots([HOME], () => [ben, ada], flat);
		expect(slots.get("ben")).toMatchObject({ x: 500 - pillWidth("ben"), y: 100 - 27, dotted: false });
		expect(slots.get("ada")).toMatchObject({ x: 500 - pillWidth("ben") - 6 - pillWidth("ada lovelace"), y: 73 });
	});

	it("step aside left of an agent's square docked on the same frame, and only that frame", () => {
		const taken = dockRoom([companion()], PAGE);
		const slots = pillSlots([HOME, CART], (frame) => (frame === "home" ? [ben] : [ada]), flat, taken);
		const pill = slots.get("ben");
		// the square's left edge, docked at the corner, is 10px in
		expect(pill !== undefined && pill.x + pillWidth("ben")).toBeLessThanOrEqual(500 - 10 - 6);
		expect(slots.get("ada")).toMatchObject({ x: 1000 - pillWidth("ada lovelace"), y: 73 });
	});

	it("clear the agent's name too once two agents share the page", () => {
		const taken = dockRoom(
			[companion({ key: "a", name: "researcher" }), companion({ key: "b", frame: "cart" })],
			PAGE,
		);
		expect(taken.get("home")).toBeGreaterThan(10 + 6 + 9 * 7);
		expect(taken.get("cart")).toBe(10);
		const pill = pillSlots([HOME], () => [ben], flat, taken).get("ben");
		expect(pill !== undefined && pill.x + pillWidth("ben")).toBeLessThanOrEqual(500 - (taken.get("home") ?? 0));
	});

	it("name no agent for one on another page, as the layer draws none there (#376)", () => {
		const taken = dockRoom(
			[companion({ key: "a", name: "researcher" }), companion({ key: "b", frame: "elsewhere/home" })],
			PAGE,
		);
		expect(taken.get("home")).toBe(10);
		expect(taken.has("elsewhere/home")).toBe(false);
	});

	it("ignore an agent at a spot rather than a frame", () => {
		expect(dockRoom([companion({ frame: null })], PAGE).size).toBe(0);
	});

	it("ignore a designer at its own work, which draws no square", () => {
		expect(dockRoom([companion({ own: true })], PAGE).size).toBe(0);
	});

	it("clear every square of a fan and its one label", () => {
		const taken = dockRoom([companion({ key: "a" }), companion({ key: "b" }), companion({ key: "c" })], PAGE);
		expect(taken.get("home")).toBe(2 * 14 + 10 + 6 + Math.round("3 designers".length * 7.2));
	});

	it("stand in screen pixels at any zoom", () => {
		const half = (x: number, y: number) => ({ x: x / 2 + 20, y: y / 2 });
		const slots = pillSlots([HOME], () => [ben], half, dockRoom([companion()], PAGE));
		expect(slots.get("ben")).toMatchObject({ x: 270 - 10 - 6 - pillWidth("ben"), y: 50 - 27 });
	});

	it("shrink to dots stacked from the corner once they would crowd the frame's own name", () => {
		const far = (x: number, y: number) => ({ x: x / 8, y: y / 8 });
		const slots = pillSlots([HOME], () => [ben, ada], far);
		const first = slots.get("ben");
		const second = slots.get("ada");
		expect(first?.dotted).toBe(true);
		expect(second?.dotted).toBe(true);
		// right-aligned on the corner, each next one overlapping the one before
		expect(first?.dot).toEqual({ x: 500 / 8 - 10, y: 100 / 8 - 27 + 4 });
		expect(second?.dot).toEqual({ x: 500 / 8 - 10 - 7, y: 100 / 8 - 27 + 4 });
	});

	it("stay pills on a frame wide enough for its name and theirs", () => {
		expect(pillSlots([HOME], () => [ben, ada], flat).get("ada")?.dotted).toBe(false);
		// a name crowded by one pill's worth, all of them dot together
		const narrow = { ...HOME, w: pillWidth("ben") + 6 + pillWidth("ada lovelace") + 40 };
		const slots = pillSlots([narrow], () => [ben, ada], flat);
		expect([slots.get("ben")?.dotted, slots.get("ada")?.dotted]).toEqual([true, true]);
	});

	it("line up by the width they're drawn at, an even gap between each", () => {
		const drawn: Record<string, number> = { ben: 31.5, ada: 80.25 };
		const slots = pillSlots(
			[HOME],
			() => [ben, ada],
			flat,
			undefined,
			(key) => drawn[key] ?? 0,
		);
		expect(slots.get("ben")?.x).toBe(500 - 31.5);
		expect(slots.get("ada")?.x).toBe(500 - 31.5 - 6 - 80.25);
	});

	const cleo = { id: "cleo", name: "cleo" };
	const dan = { id: "dan", name: "dan" };
	const eve = { id: "eve", name: "eve" };
	const WIDE = { ...HOME, x: -1000, w: 1500 };

	it("name up to three people side by side", () => {
		const { pills, more } = dock([WIDE], () => [ben, ada, cleo], flat);
		expect(more).toEqual([]);
		expect([...pills.values()].map((pill) => pill.folded)).toEqual([false, false, false]);
		expect(pills.get("cleo")?.x).toBe(500 - pillWidth("ben") - 6 - pillWidth("ada lovelace") - 6 - pillWidth("cleo"));
	});

	it("name the first two of four or more, and count the rest in a third pill that names them", () => {
		const { pills, more } = dock([WIDE], () => [ben, ada, cleo, dan, eve], flat);
		const x = 500 - pillWidth("ben") - 6 - pillWidth("ada lovelace") - 6 - pillWidth("+3");
		expect(more).toEqual([{ frame: "home", x, y: 73, names: ["cleo", "dan", "eve"] }]);
		expect(pills.get("ada")).toMatchObject({ folded: false });
		// the rest stand where the count is, drawn as none
		for (const id of ["cleo", "dan", "eve"]) expect(pills.get(id)).toMatchObject({ x, y: 73, folded: true });
	});

	it("line the count up by its own drawn width", () => {
		const widths = (key: string) => (key === "more:home" ? 24 : 40);
		const { more } = dock([WIDE], () => [ben, ada, cleo, dan], flat, undefined, widths);
		expect(more[0]?.x).toBe(500 - 40 - 6 - 40 - 6 - 24);
	});

	it("stack everyone inside as dots when zoomed out, however many, with no count", () => {
		const far = (x: number, y: number) => ({ x: x / 8, y: y / 8 });
		const { pills, more } = dock([HOME], () => [ben, ada, cleo, dan], far);
		expect(more).toEqual([]);
		expect([...pills.values()].map((pill) => [pill.dotted, pill.folded])).toEqual([
			[true, false],
			[true, false],
			[true, false],
			[true, false],
		]);
		expect(pills.get("dan")?.dot.x).toBe(500 / 8 - 10 - 3 * 7);
	});
});
