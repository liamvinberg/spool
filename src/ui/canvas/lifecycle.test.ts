import { describe, expect, it } from "vitest";
import type { ProjectedFrame } from "../api";
import type { FrameState, SweepInput } from "./lifecycle";
import {
	CAPTURE_AFTER_READY_MS,
	CAPTURE_MAX_STALE_MS,
	createLifecycleModel,
	ERRAND_DEADLINE_MS,
	ERRANDS_IN_FLIGHT,
	noteErrandShot,
	PICTURE_TRIES,
	renewPictureDebt,
	sweepLifecycle,
} from "./lifecycle";

/**
 * The lifecycle decision function (#40, #112): fabricated frames in, per-sweep
 * states out, with no browser and no real timers. Mounting is caused: you went to
 * a frame, its picture is missing, its picture is wrong, or it is readable on
 * the resting canvas. The named camera and viewport make the last cause plain.
 */

const SWEEP_MS = 300;

const frame = (name: string, x: number, y: number, kind: "html" | "term" = "html"): ProjectedFrame => ({
	name,
	kind,
	x,
	y,
	w: 100,
	h: 100,
	cover: { hash: "0".repeat(32) },
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
			selectionTargets: new Set(),
			held: null,
			states,
			ready: new Map(frames.map((f) => [f.name, -CAPTURE_AFTER_READY_MS])),
			capturing: new Set(),
			hasCover: () => true,
			now,
			camera: { x: 0, y: 0, k: 1 },
			viewport: { width: 1000, height: 1000 },
			pictured: false,
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
		expect(shot.refreshCaptures).toEqual([{ frame: "a", overdue: false }]);

		// the shot lands; the frame goes straight back to being a picture, even
		// though the cover is still on its way to disk
		noteErrandShot(s.model, "a", true);
		expect(s.sweep(frames, uncovered).states.a).toBe("picture");
	});

	it("never asks twice while the capture it asked for is still in flight", () => {
		const frames = [frame("a", 450, 450)];
		const s = sweeper();
		s.sweep(frames, uncovered);
		expect(s.sweep(frames, uncovered).refreshCaptures).toEqual([{ frame: "a", overdue: false }]);

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
			expect(s.sweep(frames, uncovered).refreshCaptures).toEqual([{ frame: "a", overdue: false }]);
			noteErrandShot(s.model, "a", false);
		}

		// out of tries: a frame that cannot be photographed keeps its placeholder
		// rather than booting for it forever
		for (let i = 0; i < 5; i++) {
			expect(s.sweep(frames, uncovered).states.a).toBe("picture");
		}
	});

	it("asks again once the tab it gave up in is being looked at", () => {
		const frames = [frame("a", 450, 450)];
		const s = sweeper();
		for (let tries = 0; tries < PICTURE_TRIES; tries++) {
			s.sweep(frames, uncovered);
			s.sweep(frames, uncovered);
			noteErrandShot(s.model, "a", false);
		}
		expect(s.sweep(frames, uncovered).states.a).toBe("picture");

		// the three errands were spent in a background tab, against throttled
		// timers: nothing about the frame said it could not be photographed
		renewPictureDebt(s.model);
		expect(s.sweep(frames, uncovered).states.a).toBe("refreshing");
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
		expect(s.sweep(frames).refreshCaptures).toEqual([{ frame: "a", overdue: false }]);

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
			expect(s.sweep(frames).refreshCaptures).toEqual([{ frame: "a", overdue: false }]);
			noteErrandShot(s.model, "a", false);
		}

		for (let i = 0; i < 5; i++) expect(s.sweep(frames).states.a).toBe("picture");
	});

	it("clears the debt outright when the picture lands", () => {
		const frames = [frame("a", 450, 450)];
		const s = sweeper();
		s.model.stale.add("a");
		s.sweep(frames);
		expect(s.sweep(frames).refreshCaptures).toEqual([{ frame: "a", overdue: false }]);

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

describe("a picture staled by a steady stream of writes (#215)", () => {
	it("never captures before the cap while every reboot resets the ready wait, then captures overdue past it", () => {
		const frames = [frame("a", 450, 450)];
		const s = sweeper();
		const uncovered = { hasCover: () => false };
		s.model.stale.add("a");

		// The document keeps rebooting: readyAt stays under CAPTURE_AFTER_READY_MS
		// old on every sweep, exactly what a steady stream of writes does to the
		// frame's own arrival clock. The first sweep only borrows the errand — a
		// state that was not already running cannot be timed as arrived — so it is
		// excluded from the loop below same as the other "borrows, then" cases.
		s.sweep(frames, { ...uncovered, ready: new Map([["a", s.clock() + SWEEP_MS - 100]]) });

		while (s.clock() < CAPTURE_MAX_STALE_MS) {
			const nextNow = s.clock() + SWEEP_MS;
			const result = s.sweep(frames, { ...uncovered, ready: new Map([["a", nextNow - 100]]) });
			expect(result.refreshCaptures).toEqual([]);
		}

		// staleSince is old enough now: the sweep stops waiting for a reboot that
		// never finishes settling and takes the shot mid-arrival instead.
		const nextNow = s.clock() + SWEEP_MS;
		const overdue = s.sweep(frames, { ...uncovered, ready: new Map([["a", nextNow - 100]]) });
		expect(overdue.refreshCaptures).toEqual([{ frame: "a", overdue: true }]);
	});

	it("clears staleSince when a capture lands; the next staling restarts the clock", () => {
		const frames = [frame("a", 450, 450)];
		const s = sweeper();
		const uncovered = { hasCover: () => false };
		s.model.stale.add("a");
		s.sweep(frames, uncovered);
		const firstStaleSince = s.model.staleSince.get("a");
		expect(firstStaleSince).toBe(s.clock());

		noteErrandShot(s.model, "a", true);
		expect(s.model.stale.has("a")).toBe(false);
		expect(s.model.staleSince.has("a")).toBe(false);

		// staled again, later: the clock starts over, not from the first staling
		s.sweep(frames, uncovered);
		s.model.stale.add("a");
		s.sweep(frames, uncovered);
		expect(s.model.staleSince.get("a")).toBe(s.clock());
		expect(s.model.staleSince.get("a")).not.toBe(firstStaleSince);
	});

	it("never treats a cold frame with no cover as overdue, however long it waits", () => {
		// Cover absence alone is not staleness: a frame that never had a picture
		// keeps the patient cold-boot path, and its first still still gets the
		// full CAPTURE_AFTER_READY_MS settle.
		const frames = [frame("a", 450, 450)];
		const s = sweeper();
		const uncovered = { hasCover: () => false };

		for (let sweeps = 0; sweeps < 20; sweeps++) {
			const result = s.sweep(frames, uncovered);
			expect(result.refreshCaptures.some((capture) => capture.overdue)).toBe(false);
		}
		expect(s.model.staleSince.size).toBe(0);
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

	it("adds entered, selected and held intent to the capped errands", () => {
		const frames = Array.from({ length: 40 }, (_, i) => frame(`f${i}`, i * 200, 0));
		const s = sweeper();
		const busy = {
			hasCover: () => false,
			entered: "f0",
			selectionTargets: new Set(["f1"]),
			held: "f2",
		};

		for (let i = 0; i < 8; i++) {
			expect(mounted(s.sweep(frames, busy).states)).toHaveLength(3 + ERRANDS_IN_FLIGHT);
		}
	});
});

describe("intent", () => {
	it("holds every unreadable frame represented by a multi-frame element selection", () => {
		const frames = [frame("a", 350, 450), frame("b", 550, 450), frame("c", 750, 450)];
		const s = sweeper();

		expect(s.sweep(frames, { selectionTargets: new Set(["a", "b", "c"]) }).states).toEqual({
			a: "held",
			b: "held",
			c: "held",
		});
	});

	it("keeps every readable HTML pick live", () => {
		const frames = [frame("a", 0, 0), frame("b", 100, 0), frame("c", 200, 0)];
		const s = sweeper();

		expect(
			s.sweep(frames, {
				selectionTargets: new Set(["a", "b", "c"]),
				camera: { x: 0, y: 0, k: 4 },
				viewport: { width: 1000, height: 1000 },
			}).states,
		).toEqual({ a: "live", b: "live", c: "live" });
	});

	it("releases only picks no longer represented, then releases the whole selection", () => {
		const frames = [frame("a", 350, 450), frame("b", 550, 450), frame("c", 750, 450)];
		const s = sweeper();
		s.sweep(frames, { selectionTargets: new Set(["a", "b", "c"]) });

		expect(s.sweep(frames, { selectionTargets: new Set(["a", "c"]) }).states).toEqual({
			a: "held",
			b: "picture",
			c: "held",
		});
		expect(s.sweep(frames, { selectionTargets: new Set() }).states).toEqual({
			a: "picture",
			b: "picture",
			c: "picture",
		});
	});

	it("unites picked-frame intent with the frame an export holds", () => {
		const frames = [frame("a", 350, 450), frame("b", 550, 450), frame("export", 750, 450)];
		const s = sweeper();

		expect(
			s.sweep(frames, {
				selectionTargets: new Set(["a", "b"]),
				held: "export",
			}).states,
		).toEqual({ a: "held", b: "held", export: "held" });
	});

	it("leaves a readable HTML selection live while Select owns it and an export holds it", () => {
		const frames = [frame("a", 0, 0), frame("terminal", 200, 0, "term")];
		const s = sweeper();

		expect(
			s.sweep(frames, {
				selectionTargets: new Set(["a"]),
				held: "a",
				camera: { x: 0, y: 0, k: 4 },
				viewport: { width: 1000, height: 1000 },
			}).states,
		).toEqual({ a: "live", terminal: "live" });
		expect(
			s.sweep(frames, {
				selectionTargets: new Set(["terminal"]),
				camera: { x: 0, y: 0, k: 4 },
				viewport: { width: 1000, height: 1000 },
			}).states.terminal,
		).toBe("held");
	});

	it("keeps an unreadable selection held behind its still", () => {
		const frames = [frame("a", 350, 450), frame("b", 550, 450)];
		const s = sweeper();

		expect(s.sweep(frames, { selectionTargets: new Set(["a"]) }).states).toEqual({ a: "held", b: "picture" });
		expect(s.sweep(frames, { selectionTargets: new Set(["b"]) }).states).toEqual({ a: "picture", b: "held" });
	});

	it("holds a frame being read rather than looked at, wherever the camera is", () => {
		const frames = [frame("a", 450, 450), frame("far", -900_000, 0)];
		const s = sweeper();

		expect(s.sweep(frames, { held: "far" }).states.far).toBe("held");
	});

	it("keeps an unreadable entered selection held, then returns it live", () => {
		const frames = [frame("a", 450, 450)];
		const s = sweeper();

		expect(s.sweep(frames, { entered: "a", selectionTargets: new Set(["a"]) }).states).toEqual({ a: "held" });
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
		expect(s.sweep(frames, booting).refreshCaptures).toEqual([{ frame: "a", overdue: false }]);
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

		// the deadline is the only thing that can end an errand nobody can finish —
		// and a frame that still owes a picture is re-borrowed the same tick it
		// expires, so `model.errands` never actually empties out on its own
		const expired: string[] = [];
		while (s.model.tries.get("a") === undefined && s.clock() < ERRAND_DEADLINE_MS * 2) {
			expired.push(...s.sweep(frames, unbooted).expiredErrands);
		}
		expect(s.clock()).toBeGreaterThanOrEqual(ERRAND_DEADLINE_MS);
		expect(s.model.tries.get("a")).toBe(1);
		// the sweep that retired it is the one and only place this frame is ever
		// named as an expired errand (#173) — the boot-failure case `spool logs`
		// has to be told about, since nothing later carries a reason of its own
		expect(expired).toEqual(["a"]);
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

describe("expired errands (#173)", () => {
	it("names nothing while the deadline has not passed, and nothing once it is retired", () => {
		const frames = [frame("a", 450, 450)];
		const s = sweeper();
		const unbooted = { hasCover: () => false, ready: new Map<string, number>() };
		s.sweep(frames, unbooted);

		// a frame that still owes a picture is re-borrowed the same tick its
		// errand expires, so the loop watches for the naming itself rather than
		// for `model.errands` emptying out — it never does on its own
		const before: string[][] = [];
		let onExpiry: string[] = [];
		while (s.clock() < ERRAND_DEADLINE_MS * 2) {
			onExpiry = s.sweep(frames, unbooted).expiredErrands;
			if (onExpiry.length > 0) break;
			before.push(onExpiry);
		}

		expect(before.every((expired) => expired.length === 0)).toBe(true);
		expect(onExpiry).toEqual(["a"]);
		// the re-borrow's own clock starts fresh, so the very next sweep has
		// nothing to expire again
		expect(s.sweep(frames, unbooted).expiredErrands).toEqual([]);
	});

	it("never names a picture that landed on its own", () => {
		const frames = [frame("a", 450, 450)];
		const s = sweeper();
		const uncovered = { hasCover: () => false };
		s.sweep(frames, uncovered);
		s.sweep(frames, uncovered);

		noteErrandShot(s.model, "a", true);

		expect(s.sweep(frames, uncovered).expiredErrands).toEqual([]);
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

	it("keeps what a frame on another page is owed, and hands its errand slot over", () => {
		// An agent edits a frame on the page you are not on. The page is the
		// canvas, so the frame is not in this sweep at all — but it is in the
		// project, and its picture is now wrong.
		const here = [frame("a", 450, 450)];
		const project = new Set(["a", "elsewhere"]);
		const s = sweeper();
		s.sweep([...here, frame("elsewhere", 350, 450)], { hasCover: () => false, projection: project });
		expect(s.model.errands.has("elsewhere")).toBe(true);
		s.model.stale.add("elsewhere");

		const switched = s.sweep(here, { hasCover: () => false, projection: project });

		expect(switched.states).toEqual({ a: "refreshing" });
		// the borrow ended with the page: its slot belongs to the page arriving
		expect(s.model.errands.has("elsewhere")).toBe(false);
		// the debt did not: going back must find a frame that owes a fresh still
		expect(s.model.stale.has("elsewhere")).toBe(true);
	});

	it("still forgets a frame the project itself lost", () => {
		const frames = [frame("a", 450, 450), frame("b", 350, 450)];
		const s = sweeper();
		s.sweep(frames, { hasCover: () => false, projection: new Set(["a", "b"]) });
		s.model.stale.add("b");

		s.sweep([frames[0] as ProjectedFrame], { hasCover: () => false, projection: new Set(["a"]) });

		expect(s.model.stale.has("b")).toBe(false);
		expect(s.model.tries.has("b")).toBe(false);
	});
});

// `frame()` above builds 100x100 boxes, so LIVE_MIN_CSS_PX is reached at k = 4
// and missed below it. The viewport is named per sweep rather than inferred.
describe("a readable frame", () => {
	const view = { width: 1000, height: 1000 };
	const at = (k: number) => ({ camera: { x: 0, y: 0, k }, viewport: view });

	it("runs a frame drawn big enough and inside the ring", () => {
		const frames = [frame("a", 0, 0)];
		const s = sweeper();

		expect(s.sweep(frames, at(4)).states).toEqual({ a: "live" });
	});

	it("leaves a frame drawn too small to read as its picture", () => {
		const frames = [frame("a", 0, 0)];
		const s = sweeper();

		// 100px wide at k = 1: legible as a still, not worth a document
		expect(s.sweep(frames, at(1)).states).toEqual({ a: "picture" });
	});

	it("leaves a frame far outside the viewport as its picture, however big it draws", () => {
		const frames = [frame("near", 0, 0), frame("far", 100_000, 0)];
		const s = sweeper();

		expect(s.sweep(frames, at(4)).states).toEqual({ near: "live", far: "picture" });
	});

	it("keeps a frame in the viewport's 25% ring live", () => {
		const frames = [frame("ring", 300, 0)];
		const s = sweeper();

		expect(s.sweep(frames, at(4)).states).toEqual({ ring: "live" });
	});

	it("bounds natural live frames by the viewport and adds only explicit selection", () => {
		// two hundred frames in a row: the ring admits a fixed span of world,
		// and the page's own size never enters the arithmetic
		const many = Array.from({ length: 200 }, (_, index) => frame(`f${index}`, index * 150, 0));
		const s = sweeper();
		const view = at(4);
		const natural = mounted(s.sweep(many, view).states);

		expect(natural.length).toBeGreaterThan(0);
		expect(natural.length).toBeLessThan(30);
		const additions = ["f50", "f100", "f199"];
		const withSelection = mounted(s.sweep(many, { ...view, selectionTargets: new Set(additions) }).states);

		expect(withSelection).toEqual([...natural, ...additions].sort());
	});

	it("still photographs a frame below the threshold when its picture is missing", () => {
		const frames = [frame("a", 0, 0)];
		const s = sweeper();
		// the still is what a frame below the threshold draws, so the debt stands
		const result = s.sweep(frames, { hasCover: () => false, ...at(1) });

		expect(result.states.a).toBe("refreshing");
	});

	it("owes nothing when the model made it live", () => {
		const frames = [frame("a", 0, 0)];
		const s = sweeper();
		s.sweep(frames, at(4));

		// zooming past a frame is not using it: a still of a frame that booted
		// and did nothing is still true of it
		const out = s.sweep(frames, at(1));
		expect(out.states).toEqual({ a: "picture" });
		expect(s.model.stale.size).toBe(0);
	});

	it("keeps natural live provenance while selection carries it below readable size", () => {
		const frames = [frame("a", 0, 0)];
		const s = sweeper();
		s.sweep(frames, at(4));
		s.sweep(frames, { selectionTargets: new Set(["a"]), ...at(4) });

		const held = s.sweep(frames, { selectionTargets: new Set(["a"]), ...at(1) });
		expect(held.states.a).toBe("held");
		expect(s.model.stale.has("a")).toBe(false);

		const released = s.sweep(frames, at(1));
		expect(released.states.a).toBe("picture");
		expect(released.refreshCaptures).toEqual([]);
		expect(s.model.stale.has("a")).toBe(false);
	});

	it("owes a fresh picture for the frame you actually went inside", () => {
		const frames = [frame("a", 0, 0)];
		const s = sweeper();
		s.sweep(frames, at(4));
		s.sweep(frames, { entered: "a", ...at(4) });
		s.sweep(frames, at(1));

		expect(s.model.stale.has("a")).toBe(true);
	});

	it("owes a fresh picture after leaving an entered frame at readable size", () => {
		const frames = [frame("a", 0, 0)];
		const s = sweeper();
		s.sweep(frames, at(4));
		s.sweep(frames, { entered: "a", ...at(4) });
		s.sweep(frames, at(4));

		expect(s.sweep(frames, at(1)).states.a).toBe("refreshing");
	});
});
