import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FlowEdge, ProjectedFrame } from "../api";
import {
	createAltHold,
	forkNote,
	landOverview,
	moveOverview,
	nothingThat,
	OVERVIEW_HOLD_MS,
	openOverview,
	overviewCamera,
	overviewNeighbours,
	pointOverview,
	sideOf,
	stepDirection,
	threadBack,
	threadNext,
	threadsFrom,
} from "./live-moves";

const frame = (name: string, x: number, y: number): ProjectedFrame =>
	({ name, x, y, w: 400, h: 300 }) as unknown as ProjectedFrame;

// a plus: centre, one each way, and one far off to the right
const frames = [
	frame("centre", 0, 0),
	frame("left", -500, 0),
	frame("right", 500, 0),
	frame("up", 0, -400),
	frame("down", 0, 400),
	frame("far", 1000, 0),
];

const edge = (from: string, to: string, extra: Partial<FlowEdge> = {}): FlowEdge => ({
	from,
	to,
	certainty: "will",
	sites: [],
	...extra,
});

describe("which way a key steps", () => {
	it("takes arrows by key and hjkl by place, whatever ⌥ spelled", () => {
		expect(stepDirection({ key: "ArrowLeft", code: "ArrowLeft" })).toBe("left");
		expect(stepDirection({ key: "ArrowDown", code: "ArrowDown" })).toBe("down");
		expect(stepDirection({ key: "˙", code: "KeyH" })).toBe("left");
		expect(stepDirection({ key: "∆", code: "KeyJ" })).toBe("down");
		expect(stepDirection({ key: "˚", code: "KeyK" })).toBe("up");
		expect(stepDirection({ key: "¬", code: "KeyL" })).toBe("right");
		expect(stepDirection({ key: "@", code: "Digit2" })).toBeUndefined();
	});
});

describe("⌥ held alone", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it("opens the overview once it has been held a moment", () => {
		const open = vi.fn();
		const hold = createAltHold(open);
		hold.down();
		vi.advanceTimersByTime(OVERVIEW_HOLD_MS - 1);
		expect(open).not.toHaveBeenCalled();
		expect(hold.armed).toBe(true);
		vi.advanceTimersByTime(1);
		expect(open).toHaveBeenCalledTimes(1);
		expect(hold.up()).toBe(true);
	});

	it("is only a tap when let go first, and opens nothing", () => {
		const open = vi.fn();
		const hold = createAltHold(open);
		hold.down();
		vi.advanceTimersByTime(60);
		expect(hold.up()).toBe(false);
		vi.advanceTimersByTime(OVERVIEW_HOLD_MS * 2);
		expect(open).not.toHaveBeenCalled();
	});

	it("never opens once another key went down under it", () => {
		const open = vi.fn();
		const hold = createAltHold(open);
		hold.down();
		vi.advanceTimersByTime(50);
		hold.cancel();
		vi.advanceTimersByTime(OVERVIEW_HOLD_MS * 2);
		expect(open).not.toHaveBeenCalled();
		expect(hold.armed).toBe(false);
	});

	it("takes a held key's repeats as the one hold", () => {
		const open = vi.fn();
		const hold = createAltHold(open);
		hold.down();
		vi.advanceTimersByTime(80);
		hold.down();
		vi.advanceTimersByTime(40);
		expect(open).toHaveBeenCalledTimes(1);
		hold.down();
		vi.advanceTimersByTime(OVERVIEW_HOLD_MS * 2);
		expect(open).toHaveBeenCalledTimes(1);
	});
});

describe("the overview", () => {
	const saved = { x: 0, y: 0, k: 1 };

	it("moves its target by arrows, steps back the way it came, and bumps at nothing", () => {
		let overview = openOverview("live", "centre", saved);
		overview = moveOverview(overview, frames, "right");
		expect(overview.target).toBe("right");
		expect(overview.came).toBe("right");
		overview = moveOverview(overview, frames, "left");
		expect(overview.target).toBe("centre");
		overview = moveOverview(overview, frames, "up");
		overview = moveOverview(overview, frames, "up");
		expect(overview.target).toBe("up");
		expect(overview.bump).toEqual({ direction: "up", at: "up", n: 1 });
		expect(nothingThat("up")).toBe("nothing above");
		expect(nothingThat("right")).toBe("nothing to the right");
	});

	it("enters where it was let go, or stays live where it opened", () => {
		const opened = openOverview("live", "centre", saved);
		expect(landOverview(opened)).toEqual({ kind: "stay", target: "centre" });
		expect(landOverview(moveOverview(opened, frames, "down"))).toEqual({
			kind: "enter",
			target: "down",
			came: "down",
		});
		const selecting = moveOverview(openOverview("select", "centre", saved), frames, "left");
		expect(landOverview(selecting)).toEqual({ kind: "select", target: "left" });
	});

	it("takes the frame the pointer is on as its target, the arrows' way back starting over", () => {
		const stepped = moveOverview(moveOverview(openOverview("live", "centre", saved), frames, "up"), frames, "up");
		expect(stepped.bump).not.toBeNull();
		const pointed = pointOverview(stepped, "left");
		expect(pointed).toMatchObject({ target: "left", trail: null, bump: null, came: null, origin: "centre" });
		expect(landOverview(pointed)).toEqual({ kind: "enter", target: "left", came: null });
		expect(pointOverview(pointed, "left")).toBe(pointed);
		expect(landOverview(pointOverview(pointed, "centre"))).toEqual({ kind: "stay", target: "centre" });
	});

	it("steps back far enough to hold the target and its nearest neighbour each way", () => {
		const centre = frames[0] as ProjectedFrame;
		expect(Object.keys(overviewNeighbours(centre, frames)).sort()).toEqual(["down", "left", "right", "up"]);
		const camera = overviewCamera(centre, frames, saved, 1200, 800);
		const shows = (x: number, y: number) => {
			const sx = x * camera.k + camera.x;
			const sy = y * camera.k + camera.y;
			return sx >= 0 && sx <= 1200 && sy >= 0 && sy <= 800;
		};
		expect(camera.k).toBeLessThan(1);
		for (const [x, y] of [
			[-500, 0],
			[900, 300],
			[0, -400],
			[400, 700],
		] as const)
			expect(shows(x, y)).toBe(true);
		// never pulls in closer than the camera it opened from
		const far = { x: 0, y: 0, k: 0.1 };
		expect(overviewCamera(centre, frames, far, 1200, 800).k).toBe(0.1);
	});

	it("tells the side a frame lies on", () => {
		const centre = frames[0] as ProjectedFrame;
		expect(sideOf(centre, frames[1] as ProjectedFrame)).toBe("left");
		expect(sideOf(centre, frames[4] as ProjectedFrame)).toBe("down");
	});
});

describe("walking the threads", () => {
	const edges = [
		edge("welcome", "sign-up"),
		edge("sign-up", "verify"),
		edge("sign-up", "pick-a-plan"),
		edge("sign-up", "verify"),
		edge("sign-up", "gone", { missing: true }),
		edge("verify", "home"),
	];

	it("takes the one thread out, and stops at the end", () => {
		expect(threadsFrom("sign-up", edges)).toEqual(["verify", "pick-a-plan"]);
		expect(threadNext("welcome", edges, null)).toEqual({ kind: "walk", to: "sign-up", fork: null, replace: false });
		expect(threadNext("home", edges, null)).toEqual({ kind: "none", note: "end of the thread" });
	});

	it("takes the first thread at a fork, and ] again swaps to the next", () => {
		const first = threadNext("sign-up", edges, null);
		expect(first).toEqual({
			kind: "walk",
			to: "verify",
			fork: { from: "sign-up", options: ["verify", "pick-a-plan"], index: 0 },
			replace: false,
		});
		const fork = first.kind === "walk" ? first.fork : null;
		expect(fork && forkNote(fork, "]")).toBe("1 of 2 · ] again for pick-a-plan");
		const second = threadNext("verify", edges, fork);
		expect(second).toEqual({
			kind: "walk",
			to: "pick-a-plan",
			fork: { from: "sign-up", options: ["verify", "pick-a-plan"], index: 1 },
			replace: true,
		});
		// and round again
		const third = threadNext("pick-a-plan", edges, second.kind === "walk" ? second.fork : null);
		expect(third.kind === "walk" && third.to).toBe("verify");
		// with ⌘ let go the fork is gone, and ] walks on from where it stands
		expect(threadNext("verify", edges, null)).toMatchObject({ to: "home" });
	});

	it("walks back the way actually taken, else the first thread in", () => {
		const taken = [
			{ from: "welcome", to: "sign-up" },
			{ from: "sign-up", to: "pick-a-plan" },
		];
		expect(threadBack("pick-a-plan", taken, edges)).toEqual({
			kind: "walk",
			to: "sign-up",
			taken: [{ from: "welcome", to: "sign-up" }],
		});
		// a trail that no longer ends here is not the way you came
		expect(threadBack("verify", taken, edges)).toEqual({ kind: "walk", to: "sign-up", taken: [] });
		expect(threadBack("welcome", [], edges)).toEqual({ kind: "none", note: "start of the thread" });
	});
});
