import { describe, expect, it } from "vitest";
import type { Camera, ProjectedFrame } from "../api";
import type { FrameState, SweepInput } from "./lifecycle";
import {
	CAPTURE_AFTER_READY_MS,
	createLifecycleModel,
	noteRefreshShot,
	PICTURE_TRIES,
	REFRESH_ERRAND_MS,
	REFRESH_JOBS_IN_FLIGHT,
	sweepLifecycle,
} from "./lifecycle";

/**
 * The lifecycle decision function (#40, #112): fabricated frames and camera in,
 * per-sweep states out — no browser, no real timers. Mounting is caused, so
 * these tests are a list of causes: you went to a frame, its picture is
 * missing, its picture is wrong. Where a frame sits and how big it draws are
 * not among them, and several tests below exist only to hold that line.
 */

const SWEEP_MS = 300;

const frame = (name: string, x: number, y: number, kind: "html" | "term" = "html"): ProjectedFrame => ({
	name,
	kind,
	x,
	y,
	w: 100,
	h: 100,
	cover: { hash: "0".repeat(32), widths: [200, 100, 50] },
});

const origin: Camera = { x: 0, y: 0, k: 1 };

/**
 * Threads states and a fake clock through consecutive sweeps of one model.
 * Every frame reports loaded at time 0, so by the first sweep they are all long
 * past the settle a capture waits for, and the camera starts long since
 * stopped, so a sweep may borrow a frame straight away. The tests that are
 * about either wait move the camera or set the clock themselves.
 */
function sweeper() {
	const model = createLifecycleModel();
	model.prevCamera = { ...origin };
	model.lastCameraMove = -100_000;
	let now = 0;
	let states: Record<string, FrameState> = {};
	const sweep = (frames: ProjectedFrame[], input: Partial<Omit<SweepInput, "frames">> = {}) => {
		now += SWEEP_MS;
		const result = sweepLifecycle(model, {
			frames,
			camera: origin,
			entered: null,
			frozen: null,
			inspected: null,
			states,
			ready: new Map(frames.map((f) => [f.name, -CAPTURE_AFTER_READY_MS])),
			capturing: new Set(),
			hasCover: () => true,
			now,
			...input,
		});
		states = result.states;
		return result;
	};
	return { sweep, model, states: () => states, clock: () => now };
}

const mounted = (states: Record<string, FrameState>): string[] =>
	Object.entries(states)
		.filter(([, state]) => state !== "picture")
		.map(([name]) => name)
		.sort();

describe("being on screen is not a cause", () => {
	it("mounts nothing for a screenful of covered frames, however long it sits there", () => {
		const frames = [frame("a", 450, 450), frame("b", 350, 450), frame("c", 450, 300)];
		const s = sweeper();
		for (let i = 0; i < 20; i++) {
			expect(mounted(s.sweep(frames).states)).toEqual([]);
		}
	});

	it("mounts nothing at any zoom, near or far", () => {
		const frames = [frame("a", 450, 450), frame("b", 350, 450)];
		const s = sweeper();
		for (const k of [0.02, 0.16, 0.5, 1, 4]) {
			expect(mounted(s.sweep(frames, { camera: { x: 0, y: 0, k } }).states)).toEqual([]);
		}
	});

	it("mounts nothing while the camera pans across thirty frames", () => {
		const frames = Array.from({ length: 30 }, (_, i) => frame(`f${i}`, i * 120, 0));
		const s = sweeper();
		for (let step = 0; step < 30; step++) {
			const panning: Camera = { x: -step * 120, y: 0, k: 1 };
			expect(mounted(s.sweep(frames, { camera: panning }).states)).toEqual([]);
		}
	});
});

describe("you went to it", () => {
	it("mounts the entered frame in its own sweep, and keeps it live wherever the camera goes", () => {
		const frames = [frame("a", 450, 450), frame("b", 350, 450)];
		const s = sweeper();

		expect(s.sweep(frames, { entered: "a" }).states).toEqual({ a: "live", b: "picture" });

		const away = s.sweep(frames, { entered: "a", camera: { x: -10_000, y: 0, k: 1 } });
		expect(away.states.a).toBe("live");
	});

	it("mounts the entered frame at an overview zoom, where nothing else exists as DOM", () => {
		const frames = [frame("a", 450, 450), frame("b", 350, 450)];
		const s = sweeper();
		const overview: Camera = { x: 0, y: 0, k: 0.02 };

		expect(s.sweep(frames, { camera: overview, entered: "a" }).states).toEqual({ a: "live", b: "picture" });
	});

	it("hands the frame back to its picture when you leave, and owes it a fresh one", () => {
		const frames = [frame("a", 450, 450)];
		const s = sweeper();
		s.sweep(frames, { entered: "a" });

		// leaving stales the picture: the document ran, and the still is of a
		// frame that had not
		expect(s.sweep(frames).states.a).toBe("refreshing");
	});
});

describe("its picture is missing", () => {
	const uncovered = { hasCover: () => false };

	it("borrows the frame, photographs it once it has arrived, and hands it back", () => {
		const frames = [frame("a", 450, 450)];
		const s = sweeper();

		const borrowed = s.sweep(frames, uncovered);
		expect(borrowed.states.a).toBe("refreshing");
		// nothing to photograph yet: the document is only now being inserted
		expect(borrowed.refreshCaptures).toEqual([]);

		// the sweep after the mount finds it arrived and asks for the picture
		const shot = s.sweep(frames, uncovered);
		expect(shot.refreshCaptures).toEqual(["a"]);

		// the shot lands; the frame goes straight back to being a picture, even
		// though the cover is still on its way to disk
		noteRefreshShot(s.model, "a", true);
		expect(s.sweep(frames, uncovered).states.a).toBe("picture");
	});

	it("never asks twice while the capture it asked for is still in flight", () => {
		const frames = [frame("a", 450, 450)];
		const s = sweeper();
		s.sweep(frames, uncovered);
		expect(s.sweep(frames, uncovered).refreshCaptures).toEqual(["a"]);

		for (let i = 0; i < 3; i++) {
			const held = s.sweep(frames, { ...uncovered, capturing: new Set(["a"]) });
			expect(held.refreshCaptures).toEqual([]);
			expect(held.states.a).toBe("refreshing");
		}
	});

	it("stops asking after a few errands that produced nothing", () => {
		const frames = [frame("a", 450, 450)];
		const s = sweeper();
		for (let tries = 0; tries < PICTURE_TRIES; tries++) {
			s.sweep(frames, uncovered);
			expect(s.sweep(frames, uncovered).refreshCaptures).toEqual(["a"]);
			noteRefreshShot(s.model, "a", false);
		}

		// out of tries: a frame that cannot be photographed keeps its placeholder
		// rather than booting for it forever
		for (let i = 0; i < 5; i++) {
			expect(s.sweep(frames, uncovered).states.a).toBe("picture");
		}
	});

	it("asks again once something about the frame changes", () => {
		const frames = [frame("a", 450, 450)];
		const s = sweeper();
		for (let tries = 0; tries < PICTURE_TRIES; tries++) {
			s.sweep(frames, uncovered);
			s.sweep(frames, uncovered);
			noteRefreshShot(s.model, "a", false);
		}
		expect(s.sweep(frames, uncovered).states.a).toBe("picture");

		// a source edit is a real change: the frame is worth another look
		s.model.stale.add("a");
		s.model.tries.delete("a");
		expect(s.sweep(frames, uncovered).states.a).toBe("refreshing");
	});
});

describe("its picture is wrong", () => {
	it("borrows a covered frame whose source changed, and hands it back photographed", () => {
		const frames = [frame("a", 450, 450)];
		const s = sweeper();
		expect(mounted(s.sweep(frames).states)).toEqual([]);

		s.model.stale.add("a");
		expect(s.sweep(frames).states.a).toBe("refreshing");
		expect(s.sweep(frames).refreshCaptures).toEqual(["a"]);

		noteRefreshShot(s.model, "a", true);
		expect(s.sweep(frames).states.a).toBe("picture");
	});

	it("keeps the old picture when the errand comes back empty-handed", () => {
		// It has a picture. It is out of date, and out of date beats absent —
		// the next real change asks again.
		const frames = [frame("a", 450, 450)];
		const s = sweeper();
		s.model.stale.add("a");
		s.sweep(frames);
		expect(s.sweep(frames).refreshCaptures).toEqual(["a"]);

		noteRefreshShot(s.model, "a", false);
		for (let i = 0; i < 5; i++) expect(s.sweep(frames).states.a).toBe("picture");
	});
});

describe("the cap on frames borrowed at once", () => {
	it("borrows no more than the cap, and fills a slot as one frees", () => {
		const frames = Array.from({ length: 8 }, (_, i) => frame(`f${i}`, i * 200, 0));
		const s = sweeper();
		const uncovered = { hasCover: () => false };
		expect(REFRESH_JOBS_IN_FLIGHT).toBe(3);

		for (let i = 0; i < 6; i++) {
			expect(mounted(s.sweep(frames, uncovered).states)).toHaveLength(REFRESH_JOBS_IN_FLIGHT);
		}

		// one comes home, and exactly one more goes out
		noteRefreshShot(s.model, "f0", true);
		const next = mounted(s.sweep(frames, uncovered).states);
		expect(next).toHaveLength(REFRESH_JOBS_IN_FLIGHT);
		expect(next).not.toContain("f0");
	});

	it("holds the worst case to six documents: entered, frozen, inspected and the cap", () => {
		const frames = Array.from({ length: 40 }, (_, i) => frame(`f${i}`, i * 200, 0));
		const s = sweeper();
		const busy = { hasCover: () => false, entered: "f0", frozen: "f1", inspected: "f2" };

		for (let i = 0; i < 8; i++) {
			expect(mounted(s.sweep(frames, busy).states)).toHaveLength(3 + REFRESH_JOBS_IN_FLIGHT);
		}
	});
});

describe("intent", () => {
	it("holds the frozen selection target, and thaws the previous one", () => {
		const frames = [frame("a", 350, 450), frame("b", 550, 450)];
		const s = sweeper();

		expect(s.sweep(frames, { frozen: "a" }).states).toEqual({ a: "held", b: "picture" });
		expect(s.sweep(frames, { frozen: "b" }).states).toEqual({ a: "picture", b: "held" });
	});

	it("holds the frame an open rail reads, wherever the camera is", () => {
		const frames = [frame("a", 450, 450), frame("far", -900_000, 0)];
		const s = sweeper();

		expect(s.sweep(frames, { inspected: "far" }).states.far).toBe("held");
	});

	it("freezes the entered frame rather than running it, then thaws it live", () => {
		const frames = [frame("a", 450, 450)];
		const s = sweeper();

		expect(s.sweep(frames, { entered: "a", frozen: "a" }).states).toEqual({ a: "held" });
		expect(s.sweep(frames, { entered: "a" }).states).toEqual({ a: "live" });
	});

	it("takes a borrowed frame back, and the picture it owes stands", () => {
		const frames = [frame("a", 450, 450)];
		const s = sweeper();
		const uncovered = { hasCover: () => false };
		s.sweep(frames, uncovered);
		expect(s.states().a).toBe("refreshing");

		// going inside it mid-errand: the document is now mounted for a reason
		// somebody asked for, and the errand gives up its slot
		expect(s.sweep(frames, { ...uncovered, entered: "a" }).states.a).toBe("live");
		expect(s.model.errands.size).toBe(0);

		// leaving hands it back, still owed a picture
		expect(s.sweep(frames, uncovered).states.a).toBe("refreshing");
	});
});

describe("what is worth photographing", () => {
	it("waits for a fresh boot to finish arriving", () => {
		// Frames animate their content in. A capture fired on the loaded report
		// records the frame mid-arrival, and that half-drawn picture is what the
		// canvas would then show in the frame's own place.
		const frames = [frame("a", 450, 450)];
		const s = sweeper();
		const bootedAt = s.clock() + SWEEP_MS * 2;
		const booting = { hasCover: () => false, ready: new Map([["a", bootedAt]]) };
		s.sweep(frames, booting);

		while (s.clock() + SWEEP_MS - bootedAt < CAPTURE_AFTER_READY_MS) {
			expect(s.sweep(frames, booting).refreshCaptures).toEqual([]);
		}
		expect(s.sweep(frames, booting).refreshCaptures).toEqual(["a"]);
	});

	it("never photographs a frame that never reported loaded", () => {
		const frames = [frame("a", 450, 450)];
		const s = sweeper();
		const unbooted = { hasCover: () => false, ready: new Map<string, number>() };

		for (let sweeps = 0; sweeps < 6; sweeps++) {
			expect(s.sweep(frames, unbooted).refreshCaptures).toEqual([]);
		}
		expect(s.states().a).toBe("refreshing");
	});

	it("hands back a frame that never booted, counting the errand as a try", () => {
		const frames = [frame("a", 450, 450)];
		const s = sweeper();
		const unbooted = { hasCover: () => false, ready: new Map<string, number>() };
		s.sweep(frames, unbooted);
		expect(s.states().a).toBe("refreshing");

		// the deadline is the only thing that can end an errand nobody can finish
		while (s.model.errands.has("a") && s.clock() < REFRESH_ERRAND_MS * 2) s.sweep(frames, unbooted);
		expect(s.clock()).toBeGreaterThanOrEqual(REFRESH_ERRAND_MS);
		expect(s.model.tries.get("a")).toBe(1);
	});

	it("never photographs a terminal: its still is the daemon's grid", () => {
		const frames = [frame("dash", 450, 450, "term")];
		const s = sweeper();
		const uncovered = { hasCover: () => false };

		for (let sweeps = 0; sweeps < 6; sweeps++) {
			const result = s.sweep(frames, uncovered);
			expect(result.states.dash).toBe("picture");
			expect(result.refreshCaptures).toEqual([]);
		}
	});
});

describe("the camera", () => {
	it("holds errands while it moves, and lets one already out ride the gesture through", () => {
		const frames = [frame("a", 450, 450), frame("b", 350, 450)];
		const s = sweeper();
		const uncovered = { hasCover: () => false };
		const drifting = (step: number): Camera => ({ x: -step, y: 0, k: 1 });

		for (let step = 1; step <= 5; step++) {
			expect(mounted(s.sweep(frames, { ...uncovered, camera: drifting(step) }).states)).toEqual([]);
		}

		// stopped: the camera counts as settled a couple of sweeps later, and both
		// frames go out
		s.sweep(frames, { ...uncovered, camera: drifting(5) });
		s.sweep(frames, { ...uncovered, camera: drifting(5) });
		expect(mounted(s.states())).toEqual(["a", "b"]);

		// a fresh gesture does not recall an errand already out: the boot is paid
		// for, and throwing it away would only mean paying for it again
		for (let step = 6; step <= 9; step++) {
			expect(mounted(s.sweep(frames, { ...uncovered, camera: drifting(step) }).states)).toEqual(["a", "b"]);
		}
	});
});

describe("frames that leave the projection", () => {
	it("takes their bookkeeping with them", () => {
		const frames = [frame("a", 450, 450), frame("b", 350, 450)];
		const s = sweeper();
		const uncovered = { hasCover: () => false };
		s.sweep(frames, uncovered);
		expect(s.model.errands.has("b")).toBe(true);

		const deleted = s.sweep([frames[0] as ProjectedFrame], uncovered);
		expect(deleted.states).toEqual({ a: "refreshing" });
		expect(s.model.errands.has("b")).toBe(false);
		expect(s.model.tries.has("b")).toBe(false);
	});
});
