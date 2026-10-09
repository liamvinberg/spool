import { describe, expect, it } from "vitest";
import type { Presence, PresenceState } from "../../team-sync-protocol";
import {
	agentSays,
	CLICK_MS,
	createPresenceRoom,
	followCamera,
	followGesture,
	gestureMoving,
	IDLE_MS,
	idle,
	idleFor,
	LEAVE_MS,
	nextChange,
	PILL_HOLD_MS,
	type PointerGesture,
	pointerShape,
	SCROLL_MS,
	speaking,
	springStep,
} from "./presence";

const ben = { accountId: "ben", name: "ben", color: "#eaa94a" };
const at = (x: number, y: number, more: Partial<PresenceState> = {}): PresenceState => ({
	page: "",
	pointer: { x, y },
	pressed: false,
	dragging: [],
	inside: null,
	view: null,
	...more,
});
const heard = (state: PresenceState | null, still = 0): Presence => ({ type: "presence", person: ben, state, still });

describe("what one person sees of another", () => {
	it("says their name while they move, holds it 1.4s after they stop, then lets it go", () => {
		const room = createPresenceRoom(() => 0);
		room.hear(heard(at(1, 1)), 1_000);
		room.hear(heard(at(2, 2)), 1_200);
		const mate = room.get("ben");
		if (mate === undefined) throw new Error("ben is here");
		expect(speaking(mate, 1_200 + PILL_HOLD_MS - 1)).toBe(true);
		expect(speaking(mate, 1_200 + PILL_HOLD_MS)).toBe(false);
		expect(nextChange([mate], 1_300)).toBe(1_200 + PILL_HOLD_MS);

		// a camera move alone isn't moving: the name stays quiet, but they're not idle
		room.hear(heard(at(2, 2, { view: { x: 0, y: 0, w: 10, h: 10 } })), 5_000);
		const still = room.get("ben");
		if (still === undefined) throw new Error("ben is here");
		expect(speaking(still, 5_000)).toBe(false);
		expect(idle(still, 5_000 + IDLE_MS - 1)).toBe(false);
		// a press says it however still they are
		room.hear(heard(at(2, 2, { pressed: true })), 6_000);
		expect(speaking(room.get("ben") as never, 60_000)).toBe(true);
	});

	it("is idle after a while of nothing, and says how long", () => {
		const room = createPresenceRoom(() => 0);
		room.hear(heard(at(1, 1), 4 * 60_000), 10 * 60_000);
		const mate = room.get("ben");
		if (mate === undefined) throw new Error("ben is here");
		expect(idle(mate, 10 * 60_000)).toBe(true);
		expect(idleFor(mate, 10 * 60_000)).toBe("idle · 4m");
		expect(idleFor(mate, 10 * 60_000 + 3 * 3_600_000)).toBe("idle · 3h");
	});

	it("fades someone who left, then forgets them", async () => {
		let now = 0;
		const room = createPresenceRoom(() => now);
		let told = 0;
		room.subscribe(() => {
			told += 1;
		});
		room.hear(heard(at(1, 1)));
		room.hear(heard(null));
		expect(room.get("ben")?.left).toBe(0);
		now = LEAVE_MS;
		await new Promise((done) => setTimeout(done, LEAVE_MS + 50));
		expect(room.teammates()).toEqual([]);
		expect(told).toBe(3);
		// leaving twice says nothing new
		room.hear(heard(null));
		expect(told).toBe(3);
	});

	it("keeps the order people went inside a frame, which lines their pills up", () => {
		const room = createPresenceRoom(() => 0);
		room.hear(heard(at(1, 1, { inside: "home" })), 100);
		room.hear(heard(at(5, 5, { inside: "home" })), 900);
		expect(room.get("ben")?.entered).toBe(100);
		room.hear(heard(at(5, 5, { inside: null })), 1_000);
		room.hear(heard(at(5, 5, { inside: "home" })), 2_000);
		expect(room.get("ben")?.entered).toBe(2_000);
	});
});

describe("following a view", () => {
	it("frames the whole of the followed view, centred", () => {
		const camera = followCamera({ x: 100, y: 50, w: 800, h: 400 }, { width: 1600, height: 1000 });
		expect(camera.k).toBe(2);
		expect((800 - camera.x) / camera.k).toBe(500);
		expect((500 - camera.y) / camera.k).toBe(250);
	});
});

describe("smoothing", () => {
	it("eases a pointer onto where it was heard and never past it", () => {
		let value = { p: 0, v: 0 };
		let passed = false;
		for (let frame = 0; frame < 120; frame += 1) {
			value = springStep(value, 100, 1 / 60, 15);
			if (value.p > 100) passed = true;
		}
		expect(passed).toBe(false);
		expect(value.p).toBeCloseTo(100, 1);
		// a long frame doesn't throw it past either
		expect(springStep({ p: 0, v: 0 }, 100, 1, 15).p).toBeLessThanOrEqual(100);
	});
});

describe("a teammate's agent in their presence (#378)", () => {
	const agent = { running: true, status: "2 designers working", work: [] };

	it("says what their agent is doing while a turn of theirs runs, and nothing once it is over", () => {
		const room = createPresenceRoom(() => 0);
		room.hear(heard(at(1, 1, { agent })), 0);
		const mate = () => room.get("ben") ?? (undefined as never);
		expect(agentSays(mate())).toBe("2 designers working");
		room.hear(heard(at(1, 1, { agent: { ...agent, running: false } })), 10);
		expect(agentSays(mate())).toBe("agent waiting");
		room.hear(heard(at(1, 1, { agent: { ...agent, status: null } })), 20);
		expect(agentSays(mate())).toBe("agent working");
		room.hear(heard(at(1, 1)), 30);
		expect(agentSays(mate())).toBeNull();
	});

	it("is not them at work: their agent alone never keeps them from going idle", () => {
		const room = createPresenceRoom(() => 0);
		room.hear(heard(at(1, 1)), 0);
		room.hear(heard(at(1, 1, { agent })), IDLE_MS - 10);
		room.hear(heard(at(1, 1, { agent: { ...agent, status: "1 designer working, 1 done" } })), IDLE_MS + 10);
		const mate = room.get("ben");
		expect(mate !== undefined && idle(mate, IDLE_MS + 10)).toBe(true);
		room.hear(heard(at(5, 5, { agent })), IDLE_MS + 20);
		const moved = room.get("ben");
		expect(moved !== undefined && idle(moved, IDLE_MS + 20)).toBe(false);
	});

	it("remembers who someone is after they leave", () => {
		const room = createPresenceRoom(() => 0);
		room.hear(heard(at(1, 1)), 0);
		room.hear(heard(null), 10);
		room.reset();
		expect(room.person("ben")).toEqual(ben);
		expect(room.person("nobody")).toBeUndefined();
	});
});

describe("what their pointer does inside a live frame", () => {
	const inside = (x: number, y: number, more: Partial<PresenceState> = {}) => at(x, y, { inside: "home", ...more });
	/** Each state heard in turn, one render each, 10ms apart, the pointer drawn where it was heard. */
	const follow = (...states: PresenceState[]) => {
		let gesture: PointerGesture | undefined;
		states.forEach((state, i) => {
			gesture = followGesture(gesture, state, state.pointer, i * 10);
		});
		return gesture as PointerGesture;
	};

	it("plays each new click once, and none they made before they were seen", () => {
		const seen = follow(inside(10, 10, { clicks: 4 }));
		expect(seen.click).toBeNull();
		const clicked = follow(inside(10, 10, { clicks: 4 }), inside(10, 10, { clicks: 5 }));
		expect(clicked.click).toEqual({ n: 1, at: 10 });
		expect(gestureMoving(clicked, 10 + CLICK_MS - 1)).toBe(true);
		expect(gestureMoving(clicked, 10 + CLICK_MS)).toBe(false);
		// a press and its release that land between two hearings still click
		const twice = follow(inside(10, 10, { clicks: 5 }), inside(10, 10, { clicks: 6 }), inside(10, 10, { clicks: 7 }));
		expect(twice.click?.n).toBe(2);
	});

	it("drags once a press moves past the slop, with a line behind it, and lets go on release", () => {
		const held = follow(inside(10, 10), inside(10, 10, { pressed: true }), inside(12, 11, { pressed: true }));
		expect(pointerShape(held, 20)).toBe("pressed");
		expect(held.dragging).toBe(false);
		const dragged = follow(
			inside(10, 10),
			inside(10, 10, { pressed: true }),
			inside(30, 10, { pressed: true }),
			inside(60, 10, { pressed: true }),
		);
		expect(pointerShape(dragged, 30)).toBe("hand");
		expect(dragged.trail.map((point) => point.x)).toEqual([30, 60]);
		const dropped = followGesture(dragged, inside(60, 10), { x: 60, y: 10 }, 40);
		expect(pointerShape(dropped, 40)).toBe("arrow");
		// the line lingers after the drop, then goes
		expect(gestureMoving(dropped, 40)).toBe(true);
		expect(followGesture(dropped, inside(60, 10), { x: 60, y: 10 }, 10_000).trail).toEqual([]);
	});

	it("scrolls the way the frame's scrollers moved, and goes back to an arrow once they rest", () => {
		const down = follow(inside(10, 10, { scrolled: { x: 0, y: 0 } }), inside(10, 10, { scrolled: { x: 0, y: 80 } }));
		expect(down.scroll).toEqual({ way: "down", at: 10 });
		expect(pointerShape(down, 10)).toBe("scroll");
		expect(pointerShape(down, 10 + SCROLL_MS)).toBe("arrow");
		const up = follow(inside(10, 10, { scrolled: { x: 0, y: 80 } }), inside(10, 10, { scrolled: { x: 4, y: 20 } }));
		expect(up.scroll?.way).toBe("up");
		const left = follow(inside(10, 10, { scrolled: { x: 90, y: 0 } }), inside(10, 10, { scrolled: { x: 30, y: 2 } }));
		expect(left.scroll?.way).toBe("left");
		// how far it's scrolled when they're first seen is no scroll at all
		expect(follow(inside(10, 10, { scrolled: { x: 0, y: 500 } })).scroll).toBeNull();
	});

	it("does none of it out on the canvas, where a press is a canvas gesture", () => {
		const canvas = follow(at(10, 10), at(10, 10, { pressed: true, clicks: 1 }), at(80, 10, { pressed: true }));
		expect(canvas.click).toBeNull();
		expect(canvas.dragging).toBe(false);
		expect(pointerShape(canvas, 20)).toBe("arrow");
	});
});
