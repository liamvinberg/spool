import { describe, expect, it } from "vitest";
import type { ProjectedFrame } from "../api";
import type { FrameState, SweepInput } from "./lifecycle";
import {
	CAPTURE_AFTER_READY_MS,
	createLifecycleModel,
	ERRAND_DEADLINE_MS,
	ERRANDS_IN_FLIGHT,
	noteErrandShot,
	PICTURE_TRIES,
	sweepLifecycle,
} from "./lifecycle";

/**
 * The lifecycle decision function (#40, #112): fabricated frames in, per-sweep
 * states out — no browser, no real timers, and no camera, because the decision
 * does not have one. Mounting is caused, so these tests are a list of causes:
 * you went to a frame, its picture is missing, its picture is wrong. Where a
 * frame sits, how big it draws and whether the camera is moving are not among
 * them — `SweepInput` cannot express them, which is the strongest form the
 * claim can take.
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

/**
 * Threads states and a fake clock through consecutive sweeps of one model.
 * Every frame reports loaded at time 0, so by the first sweep they are all long
 * past the wait a capture makes for a frame to finish arriving; the test that
 * is about that wait sets the clock itself.
 */
function sweeper() {
	const model = createLifecycleModel();
	let now = 0;
	let states: Record<string, FrameState> = {};
	const sweep = (frames: ProjectedFrame[], input: Partial<Omit<SweepInput, "frames">> = {}) => {
		now += SWEEP_MS;
		const result = sweepLifecycle(model, {
			frames,
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

	it("mounts nothing for thirty covered frames, wherever they sit", () => {
		const frames = Array.from({ length: 30 }, (_, i) => frame(`f${i}`, i * 120, i * 7));
		const s = sweeper();
		for (let sweeps = 0; sweeps < 30; sweeps++) {
			expect(mounted(s.sweep(frames).states)).toEqual([]);
		}
	});
});

describe("you went to it", () => {
	it("mounts the entered frame in its own sweep, and keeps it live wherever the camera goes", () => {
		const frames = [frame("a", 450, 450), frame("b", 350, 450)];
		const s = sweeper();

		expect(s.sweep(frames, { entered: "a" }).states).toEqual({ a: "live", b: "picture" });
		expect(s.sweep(frames, { entered: "a" }).states.a).toBe("live");
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
		noteErrandShot(s.model, "a", true);
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
			noteErrandShot(s.model, "a", false);
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
			noteErrandShot(s.model, "a", false);
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

		noteErrandShot(s.model, "a", true);
		expect(s.sweep(frames).states.a).toBe("picture");
	});

	it("tries again when the errand comes back empty-handed, then keeps the old picture", () => {
		// Its picture is still wrong — that is not made false by the capture
		// meant to fix it failing. So it is worth another errand, and then a
		// third, and then it stops: out of date beats booting forever, and the
		// next real change asks again.
		const frames = [frame("a", 450, 450)];
		const s = sweeper();
		s.model.stale.add("a");

		for (let tries = 0; tries < PICTURE_TRIES; tries++) {
			expect(s.sweep(frames).states.a).toBe("refreshing");
			expect(s.sweep(frames).refreshCaptures).toEqual(["a"]);
			noteErrandShot(s.model, "a", false);
		}

		for (let i = 0; i < 5; i++) expect(s.sweep(frames).states.a).toBe("picture");
	});

	it("clears the debt outright when the picture lands", () => {
		const frames = [frame("a", 450, 450)];
		const s = sweeper();
		s.model.stale.add("a");
		s.sweep(frames);
		expect(s.sweep(frames).refreshCaptures).toEqual(["a"]);

		noteErrandShot(s.model, "a", true);
		for (let i = 0; i < 5; i++) expect(s.sweep(frames).states.a).toBe("picture");
		expect(s.model.stale.has("a")).toBe(false);
	});

	it("notices a picture that goes missing again after one landed", () => {
		// The flag that bridges "shot resolved" and "cover on disk" must not
		// outlive the cover it was waiting for.
		const frames = [frame("a", 450, 450)];
		const s = sweeper();
		const uncovered = { hasCover: () => false };
		s.sweep(frames, uncovered);
		s.sweep(frames, uncovered);
		noteErrandShot(s.model, "a", true);

		// the cover lands, so the bridge retires
		expect(s.sweep(frames).states.a).toBe("picture");
		expect(s.model.photographed.has("a")).toBe(false);

		// and if it later goes missing, the frame is owed one again
		expect(s.sweep(frames, uncovered).states.a).toBe("refreshing");
	});
});

describe("the cap on frames borrowed at once", () => {
	it("borrows no more than the cap, and fills a slot as one frees", () => {
		const frames = Array.from({ length: 8 }, (_, i) => frame(`f${i}`, i * 200, 0));
		const s = sweeper();
		const uncovered = { hasCover: () => false };
		expect(ERRANDS_IN_FLIGHT).toBe(3);

		for (let i = 0; i < 6; i++) {
			expect(mounted(s.sweep(frames, uncovered).states)).toHaveLength(ERRANDS_IN_FLIGHT);
		}

		// one comes home, and exactly one more goes out
		noteErrandShot(s.model, "f0", true);
		const next = mounted(s.sweep(frames, uncovered).states);
		expect(next).toHaveLength(ERRANDS_IN_FLIGHT);
		expect(next).not.toContain("f0");
	});

	it("holds the worst case to six documents: entered, frozen, inspected and the cap", () => {
		const frames = Array.from({ length: 40 }, (_, i) => frame(`f${i}`, i * 200, 0));
		const s = sweeper();
		const busy = { hasCover: () => false, entered: "f0", frozen: "f1", inspected: "f2" };

		for (let i = 0; i < 8; i++) {
			expect(mounted(s.sweep(frames, busy).states)).toHaveLength(3 + ERRANDS_IN_FLIGHT);
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
		while (s.model.errands.has("a") && s.clock() < ERRAND_DEADLINE_MS * 2) s.sweep(frames, unbooted);
		expect(s.clock()).toBeGreaterThanOrEqual(ERRAND_DEADLINE_MS);
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

describe("what an errand waits for", () => {
	it("is not the camera", () => {
		// #80 made mounting wait for a still camera, on the theory that a booting
		// document's paint is the stutter. #94 disproved that outright and #112
		// deleted the gate rather than reverting it: the cap is the pacing, and a
		// capped errand is no burst. There is nothing left to wait for, and no
		// camera in `SweepInput` to wait on.
		const frames = [frame("a", 450, 450), frame("b", 350, 450)];
		const s = sweeper();
		const uncovered = { hasCover: () => false };

		expect(mounted(s.sweep(frames, uncovered).states)).toEqual(["a", "b"]);
	});

	it("is a boot somebody is waiting on", () => {
		// A page switch puts a screenful of frames that owe pictures on screen at
		// the moment the walk's target is booting, and an errand wants the same
		// daemon, the same connection pool and the same compile. It is never
		// urgent; an arrival is.
		const frames = [frame("target", 0, 0), frame("a", 450, 450), frame("b", 350, 450)];
		const s = sweeper();
		const arriving = { hasCover: () => false, entered: "target", ready: new Map<string, number>() };

		for (let sweeps = 0; sweeps < 4; sweeps++) {
			expect(mounted(s.sweep(frames, arriving).states)).toEqual(["target"]);
		}

		// the arrival lands, and the rest of the page fills itself in behind it
		const arrived = { hasCover: () => false, entered: "target" };
		expect(mounted(s.sweep(frames, arrived).states)).toEqual(["a", "b", "target"]);
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

// TEMPORARY (CANVAS_ARM_KEY, #107 follow-up). Deleted with the arms themselves.
//
// `frame()` above builds 100x100 boxes, so LIVE_MIN_CSS_PX is reached at k = 4
// and missed below it. The viewport is named per sweep rather than inferred.
describe("the canvas arms", () => {
	const view = { width: 1000, height: 1000 };
	const at = (k: number) => ({ camera: { x: 0, y: 0, k }, viewport: view });

	describe("live", () => {
		it("runs every frame on the page and photographs none of them", () => {
			const frames = [frame("a", 0, 0), frame("b", 450, 0), frame("c", 900, 0)];
			const s = sweeper();
			// uncovered, which under the shipped model is the whole of a page's debt
			const result = s.sweep(frames, { hasCover: () => false, arm: "live" });

			expect(result.states).toEqual({ a: "live", b: "live", c: "live" });
			expect(result.refreshCaptures).toEqual([]);
			expect(s.model.errands.size).toBe(0);
		});

		it("keeps freezing and entering above it", () => {
			const frames = [frame("a", 0, 0), frame("b", 450, 0)];
			const s = sweeper();
			// ⌘ over a frame still stops it, or it moves under the cursor mid-pick
			const result = s.sweep(frames, { arm: "live", frozen: "a", entered: "b" });

			expect(result.states).toEqual({ a: "held", b: "live" });
		});
	});

	describe("readable", () => {
		it("runs a frame drawn big enough and inside the ring", () => {
			const frames = [frame("a", 0, 0)];
			const s = sweeper();

			expect(s.sweep(frames, { arm: "readable", ...at(4) }).states).toEqual({ a: "live" });
		});

		it("leaves a frame drawn too small to read as its picture", () => {
			const frames = [frame("a", 0, 0)];
			const s = sweeper();

			// 100px wide at k = 1: legible as a still, not worth a document
			expect(s.sweep(frames, { arm: "readable", ...at(1) }).states).toEqual({ a: "picture" });
		});

		it("leaves a frame far outside the viewport as its picture, however big it draws", () => {
			const frames = [frame("near", 0, 0), frame("far", 100_000, 0)];
			const s = sweeper();

			expect(s.sweep(frames, { arm: "readable", ...at(4) }).states).toEqual({ near: "live", far: "picture" });
		});

		it("bounds the live count by the viewport rather than by the page", () => {
			// two hundred frames in a row: the ring admits a fixed span of world,
			// and the page's own size never enters the arithmetic
			const many = Array.from({ length: 200 }, (_, index) => frame(`f${index}`, index * 150, 0));
			const s = sweeper();
			const live = Object.values(s.sweep(many, { arm: "readable", ...at(4) }).states).filter(
				(state) => state === "live",
			);

			expect(live.length).toBeGreaterThan(0);
			expect(live.length).toBeLessThan(30);
		});

		it("still photographs the frames it is not running", () => {
			const frames = [frame("a", 0, 0), frame("b", 100_000, 0)];
			const s = sweeper();
			// the still is what a frame below the threshold draws, so the debt stands
			const result = s.sweep(frames, { arm: "readable", hasCover: () => false, ...at(4) });

			expect(result.states.b).toBe("refreshing");
		});
	});

	describe("what a frame owes when it stops being live", () => {
		it("owes nothing when the arm was what made it live", () => {
			const frames = [frame("a", 0, 0)];
			const s = sweeper();
			s.sweep(frames, { arm: "readable", ...at(4) });

			// zooming past a frame is not using it: a still of a frame that booted
			// and did nothing is still true of it
			const out = s.sweep(frames, { arm: "readable", ...at(1) });
			expect(out.states).toEqual({ a: "picture" });
			expect(s.model.stale.size).toBe(0);
		});

		it("owes nothing when the arm is switched off underneath it", () => {
			const frames = [frame("a", 0, 0), frame("b", 450, 0)];
			const s = sweeper();
			s.sweep(frames, { arm: "live" });

			const off = s.sweep(frames);
			expect(off.states).toEqual({ a: "picture", b: "picture" });
			expect(s.model.stale.size).toBe(0);
			expect(s.model.errands.size).toBe(0);
		});

		it("owes a fresh picture for the frame you actually went inside", () => {
			const frames = [frame("a", 0, 0), frame("b", 450, 0)];
			const s = sweeper();
			s.sweep(frames, { entered: "a" });
			s.sweep(frames);

			expect(s.model.stale.has("a")).toBe(true);
		});
	});
});
