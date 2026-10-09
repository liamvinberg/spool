import { describe, expect, it } from "vitest";
import type { AgentCompanion } from "./agent-companion";
import { dockRoom } from "./agent-companion-layer";
import { pillSlots, pillWidth } from "./presence-layer";

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
		expect(slots.get("ben")).toEqual({ x: 500 - pillWidth("ben"), y: 100 - 27 });
		expect(slots.get("ada")).toEqual({ x: 500 - pillWidth("ben") - 6 - pillWidth("ada lovelace"), y: 73 });
	});

	it("step aside left of an agent's square docked on the same frame, and only that frame", () => {
		const taken = dockRoom([companion()], PAGE);
		const slots = pillSlots([HOME, CART], (frame) => (frame === "home" ? [ben] : [ada]), flat, taken);
		const pill = slots.get("ben");
		// the square's left edge, docked at the corner, is 10px in
		expect(pill !== undefined && pill.x + pillWidth("ben")).toBeLessThanOrEqual(500 - 10 - 6);
		expect(slots.get("ada")).toEqual({ x: 1000 - pillWidth("ada lovelace"), y: 73 });
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
		expect(slots.get("ben")).toEqual({ x: 270 - 10 - 6 - pillWidth("ben"), y: 50 - 27 });
	});
});
