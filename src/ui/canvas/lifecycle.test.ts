import { describe, expect, it } from "vitest";
import type { Camera, ProjectedFrame } from "../api";
import type { FrameState, SweepInput } from "./lifecycle";
import {
	CAPTURE_AFTER_READY_MS,
	CAPTURES_PER_SWEEP,
	createLifecycleModel,
	MOUNTS_PER_SWEEP,
	noteExitCapture,
	sweepLifecycle,
	WARM_POOL_CAP,
} from "./lifecycle";

/**
 * The lifecycle decision function (#40): fabricated frames and camera in,
 * per-sweep states out — no browser, no real timers. The fixed stage is a
 * 1000×1000 viewport with the camera at origin and k=1, so the strict view
 * is world (0,0)–(1000,1000), the margin ring reaches 500 beyond every edge,
 * and the viewport center sits at world (500,500).
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

/** The camera panned (k=1) so the frame sits centered in the viewport. */
const over = (f: ProjectedFrame): Camera => ({ k: 1, x: 500 - f.x - f.w / 2, y: 500 - f.y - f.h / 2 });

/**
 * Threads states and a fake clock through consecutive sweeps of one model.
 * Every frame reports loaded at time 0, so by the first sweep they are all
 * long past the settle a capture waits for; a test about that wait says so.
 */
function sweeper() {
	const model = createLifecycleModel();
	let now = 0;
	let states: Record<string, FrameState> = {};
	const sweep = (frames: ProjectedFrame[], input: Partial<Omit<SweepInput, "frames">> = {}) => {
		now += SWEEP_MS;
		const result = sweepLifecycle(model, {
			frames,
			camera: origin,
			viewportWidth: 1000,
			viewportHeight: 1000,
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

/** One frame per 2000 world units: the camera parked over one sees only it. */
const strip = (count: number, kind: "html" | "term" = "html") =>
	Array.from({ length: count }, (_, i) => frame(`f${i}`, i * 2000, 0, kind));

/**
 * Mounts each frame in turn, giving strictly ascending last-usable times. Two
 * sweeps per stop: the camera arriving, then the camera holding still — only a
 * sweep that finds the camera where it left it drains the wake queue.
 */
const tour = (s: ReturnType<typeof sweeper>, frames: ProjectedFrame[]) => {
	for (const f of frames) {
		s.sweep(frames, { camera: over(f) });
		s.sweep(frames, { camera: over(f) });
	}
};

const parked: Camera = { x: -10_000_000, y: 0, k: 1 };

describe("wake queue", () => {
	it("drains a page entry a few mounts per sweep, nearest the viewport center first", () => {
		// five hibernated frames strictly in view, listed out of distance order;
		// centers sit 0/100/150/200/300 from the viewport center
		const frames = [
			frame("d", 250, 450),
			frame("a", 450, 450),
			frame("e", 450, 150),
			frame("b", 350, 450),
			frame("c", 450, 300),
		];
		const { sweep } = sweeper();

		const first = sweep(frames);
		expect(first.states).toEqual({ a: "live", b: "live", c: "live", d: "hibernated", e: "hibernated" });
		expect(MOUNTS_PER_SWEEP).toBe(3);

		const second = sweep(frames);
		expect(second.states).toEqual({ a: "live", b: "live", c: "live", d: "live", e: "live" });
	});

	it("mounts nothing at an overview zoom, where a frame draws smaller than its own still", () => {
		const frames = [frame("a", 450, 450), frame("b", 350, 450), frame("c", 450, 300)];
		const { sweep } = sweeper();

		// the whole canvas fitted on screen: real DOM here buys no crispness and
		// costs a renderer apiece, so the stills carry the view
		const overview: Camera = { x: 0, y: 0, k: 0.02 };
		for (let i = 0; i < 4; i++) {
			expect(Object.values(sweep(frames, { camera: overview }).states)).toEqual([
				"hibernated",
				"hibernated",
				"hibernated",
			]);
		}

		// zooming in past the gate mounts them, once the zoom stops
		expect(Object.values(sweep(frames).states)).toEqual(["hibernated", "hibernated", "hibernated"]);
		expect(Object.values(sweep(frames).states)).toEqual(["live", "live", "live"]);
	});

	it("holds every mount while the camera moves, and drains the sweep after it stops", () => {
		const frames = [frame("a", 450, 450), frame("b", 350, 450)];
		const { sweep } = sweeper();
		// a document booting paints, and a paint under a moving camera is the
		// stutter this whole lifecycle exists to keep off the screen
		const drifting = (step: number): Camera => ({ x: -step, y: 0, k: 1 });
		sweep([], { camera: drifting(0) }); // the camera exists before it moves
		for (let step = 1; step <= 4; step++) {
			expect(Object.values(sweep(frames, { camera: drifting(step) }).states)).toEqual(["hibernated", "hibernated"]);
		}
		expect(Object.values(sweep(frames, { camera: drifting(4) }).states)).toEqual(["live", "live"]);
	});

	it("still mounts the entered frame at an overview zoom", () => {
		const frames = [frame("a", 450, 450), frame("b", 350, 450)];
		const { sweep } = sweeper();
		const overview: Camera = { x: 0, y: 0, k: 0.02 };

		// zoom gates mounting, never the frame you are actually inside
		const entered = sweep(frames, { camera: overview, entered: "a" });
		expect(entered.states).toEqual({ a: "live", b: "hibernated" });
	});

	it("admits every strictly-visible frame before the margin ring, however near the ring frame sits", () => {
		// ring frames end nearer the center in world distance (551, 650) than
		// the strict pair parked in the far corners (602, 636)
		const frames = [
			frame("ring-near", -101, 450),
			frame("ring-far", -200, 450),
			frame("corner-a", 900, 900),
			frame("corner-b", 900, 50),
		];
		const { sweep } = sweeper();

		const first = sweep(frames);
		expect(first.states).toEqual({
			"ring-near": "live",
			"ring-far": "hibernated",
			"corner-a": "live",
			"corner-b": "live",
		});

		const second = sweep(frames);
		expect(second.states["ring-far"]).toBe("live");
	});
});

describe("entered frame", () => {
	const inView = [
		frame("d", 250, 450),
		frame("a", 450, 450),
		frame("e", 450, 150),
		frame("b", 350, 450),
		frame("c", 450, 300),
	];

	it("mounts the entered frame in its own sweep regardless of queue depth, and keeps it live offscreen", () => {
		const { sweep } = sweeper();

		// e sits farthest from the center, yet enters alongside a full queue
		const first = sweep(inView, { entered: "e" });
		expect(first.states).toEqual({ a: "live", b: "live", c: "live", d: "hibernated", e: "live" });

		// entered survives leaving the view
		const away = sweep(inView, { entered: "e", camera: { x: -10000, y: 0, k: 1 } });
		expect(away.states.e).toBe("live");
	});
});

describe("frozen frame", () => {
	it("freezes only the current target and thaws the previous one", () => {
		const frames = [frame("a", 350, 450), frame("b", 550, 450)];
		const { sweep } = sweeper();
		sweep(frames);

		const aFrozen = sweep(frames, { frozen: "a" });
		expect(aFrozen.states).toEqual({ a: "warm", b: "live" });

		const bFrozen = sweep(frames, { frozen: "b" });
		expect(bFrozen.states).toEqual({ a: "live", b: "warm" });
	});

	it("keeps an entered frozen frame warm, then thaws it live", () => {
		const frames = [frame("a", 450, 450)];
		const { sweep } = sweeper();

		const frozen = sweep(frames, { entered: "a", frozen: "a" });
		expect(frozen.states).toEqual({ a: "warm" });

		const thawed = sweep(frames, { entered: "a" });
		expect(thawed.states).toEqual({ a: "live" });
	});

	it("rescues the frozen target from an eviction already in flight", () => {
		const frames = strip(WARM_POOL_CAP + 1);
		const s = sweeper();
		tour(s, frames);

		const evicting = s.sweep(frames, { camera: parked });
		expect(evicting.exitCaptures).toEqual(["f0"]);

		for (let i = 0; i < 3; i++) {
			const held = s.sweep(frames, { camera: parked, frozen: "f0" });
			expect(held.states.f0).toBe("warm");
			expect(held.exitCaptures).toEqual([]);
		}
	});
});

describe("inspected frame", () => {
	it("wakes an offscreen frame the open rail reads, and keeps it out of the pool", () => {
		const frames = strip(WARM_POOL_CAP + 1);
		const s = sweeper();
		tour(s, frames);

		// parked far away, f0 is nobody's neighbour: only the rail keeps it real
		const evicting = s.sweep(frames, { camera: parked });
		expect(evicting.exitCaptures).toEqual(["f0"]);

		for (let i = 0; i < 3; i++) {
			const held = s.sweep(frames, { camera: parked, inspected: "f0" });
			expect(held.states.f0).toBe("warm");
			expect(held.exitCaptures).toEqual([]);
		}
	});

	it("mounts a hibernated frame the rail turns to, ahead of the visible queue", () => {
		const frames = [frame("far", -9000, 0), ...strip(6)];
		const { sweep } = sweeper();
		const first = sweep(frames, { inspected: "far" });

		expect(first.states.far).toBe("warm");
	});
});

describe("warm pool", () => {
	it("a zoom round trip within capacity only freezes and unfreezes — no hibernation, ever", () => {
		const frames = [
			frame("a", 450, 450),
			frame("b", 350, 450),
			frame("c", 450, 300),
			frame("d", 250, 450),
			frame("e", 450, 150),
		];
		const allWarm = ["warm", "warm", "warm", "warm", "warm"];
		const { sweep } = sweeper();
		sweep(frames);
		sweep(frames);

		const zoomedOut: Camera = { x: 450, y: 450, k: 0.1 };
		expect(Object.values(sweep(frames, { camera: zoomedOut }).states)).toEqual(allWarm);

		// hold for 6 s — far past the retired grace window — and nothing hibernates
		for (let i = 0; i < 20; i++) {
			const later = sweep(frames, { camera: zoomedOut });
			expect(Object.values(later.states)).toEqual(allWarm);
		}

		// zooming back unfreezes every frame in one sweep — no queue, no remount
		const back = sweep(frames);
		expect(Object.values(back.states)).toEqual(["live", "live", "live", "live", "live"]);
	});

	it("overflow evicts the oldest-seen html frame; its goodbye landing unmounts it", () => {
		const frames = strip(WARM_POOL_CAP + 1);
		const s = sweeper();
		tour(s, frames);

		// leaving the strip strands 25 offscreen warm frames — one over the cap
		const evict = s.sweep(frames, { camera: parked });
		expect(evict.exitCaptures).toEqual(["f0"]);
		expect(evict.states.f0).toBe("warm");

		noteExitCapture(s.model, "f0", true);
		const landed = s.sweep(frames, { camera: parked });
		expect(landed.states.f0).toBe("hibernated");

		// the pool sits at the cap now — nothing else ever hibernates
		expect(landed.exitCaptures).toEqual([]);
		const rest = Object.entries(landed.states).filter(([name]) => name !== "f0");
		expect(rest.every(([, state]) => state === "warm")).toBe(true);
	});

	it("a goodbye that never lands rides out the timeout, then unmounts", () => {
		const frames = strip(WARM_POOL_CAP + 1);
		const s = sweeper();
		tour(s, frames);

		const evict = s.sweep(frames, { camera: parked });
		expect(evict.exitCaptures).toEqual(["f0"]);

		// 300 ms in: still inside the 600 ms goodbye window
		const waiting = s.sweep(frames, { camera: parked });
		expect(waiting.states.f0).toBe("warm");

		// 600 ms in: the window closes without a shot
		const timedOut = s.sweep(frames, { camera: parked });
		expect(timedOut.states.f0).toBe("hibernated");
	});

	it("rescues an eviction mid-goodbye when its frame comes back into view", () => {
		const frames = strip(WARM_POOL_CAP + 1);
		const s = sweeper();
		tour(s, frames);

		const evict = s.sweep(frames, { camera: parked });
		expect(evict.exitCaptures).toEqual(["f0"]);

		// the camera returns to f0 before its goodbye resolves
		const rescued = s.sweep(frames, { camera: over(frame("f0", 0, 0)) });
		expect(rescued.states.f0).toBe("live");
		expect(rescued.exitCaptures).toEqual([]);

		// leaving again, past the old goodbye window: f0 is now the newest-seen
		// and stays warm — the pool evicts f1, the oldest, instead
		const leave = s.sweep(frames, { camera: parked });
		expect(leave.states.f0).toBe("warm");
		expect(leave.states.f1).toBe("warm");
		expect(leave.exitCaptures).toEqual(["f1"]);
	});

	it("evicts a terminal frame without requesting a goodbye capture", () => {
		const frames = strip(WARM_POOL_CAP + 1, "term");
		const s = sweeper();
		tour(s, frames);

		const evict = s.sweep(frames, { camera: parked });
		expect(evict.exitCaptures).toEqual([]);
		expect(evict.states.f0).toBe("hibernated");
		expect(evict.states.f1).toBe("warm");
	});
});

describe("thumbnail refresh", () => {
	it("a frame leaving live refreshes its still once the camera settles", () => {
		const frames = [frame("a", 450, 450)];
		const s = sweeper();
		s.sweep(frames, { entered: "a" });

		// leaving live stales the still, but the camera just moved — no shot yet
		const left = s.sweep(frames, { entered: null, camera: parked });
		expect(left.states.a).toBe("warm");
		expect(left.refreshCaptures).toEqual([]);

		// 300 ms after the move: still inside the 400 ms settle window
		expect(s.sweep(frames, { camera: parked }).refreshCaptures).toEqual([]);

		// settled: the refresh fires once, then the debt is paid
		expect(s.sweep(frames, { camera: parked }).refreshCaptures).toEqual(["a"]);
		expect(s.sweep(frames, { camera: parked }).refreshCaptures).toEqual([]);
	});

	it("waits for a fresh boot to finish arriving before photographing it", () => {
		// Frames animate their content in. A capture fired on the loaded report
		// records the frame mid-arrival, and that half-drawn picture is what the
		// canvas would then show in the frame's own place while the camera moves.
		const frames = [frame("a", 450, 450)];
		const s = sweeper();
		const hasCover = () => false;
		const bootedAt = s.clock();
		const booting = { hasCover, ready: new Map([["a", bootedAt]]) };
		while (s.clock() + SWEEP_MS - bootedAt < CAPTURE_AFTER_READY_MS) {
			expect(s.sweep(frames, booting).refreshCaptures).toEqual([]);
		}
		expect(s.sweep(frames, booting).refreshCaptures).toEqual(["a"]);
	});

	it("never photographs a frame that has not run: no boot, or frozen since it booted", () => {
		const frames = [frame("a", 450, 450)];
		const s = sweeper();
		const hasCover = () => false;

		// mounted but never reported loaded — there is nothing to photograph
		const unbooted = { hasCover, ready: new Map<string, number>() };
		for (let sweeps = 0; sweeps < 4; sweeps++) {
			expect(s.sweep(frames, unbooted).refreshCaptures).toEqual([]);
		}

		// booted long ago, but held frozen ever since: its entry animation never
		// ran, and its still would record that absence
		const frozen = { hasCover, frozen: "a", ready: new Map([["a", -CAPTURE_AFTER_READY_MS]]) };
		for (let sweeps = 0; sweeps < 4; sweeps++) {
			expect(s.sweep(frames, frozen).refreshCaptures).toEqual([]);
		}

		// let it run, and the debt is payable again
		s.sweep(frames, { hasCover });
		expect(s.sweep(frames, { hasCover }).refreshCaptures).toEqual(["a"]);
	});

	it("keeps refreshing a frame that ran once and then went offscreen", () => {
		// running long enough is remembered: an offscreen frame is frozen, but
		// its content arrived while it was on screen and its still is still true
		const frames = [frame("a", 450, 450)];
		const s = sweeper();
		s.sweep(frames);
		s.sweep(frames);
		const left = s.sweep(frames, { camera: parked });
		expect(left.states.a).toBe("warm");
		s.sweep(frames, { camera: parked });
		expect(s.sweep(frames, { camera: parked }).refreshCaptures).toEqual(["a"]);
	});

	it("a missing still backfills when settled, unless a capture is already in flight", () => {
		const frames = [frame("a", 450, 450)];
		const s = sweeper();
		const hasCover = () => false;
		s.sweep(frames, { hasCover });
		expect(s.sweep(frames, { hasCover }).refreshCaptures).toEqual([]);

		// settled and thumbless — but an in-flight capture holds the debt open
		expect(s.sweep(frames, { hasCover, capturing: new Set(["a"]) }).refreshCaptures).toEqual([]);
		expect(s.sweep(frames, { hasCover }).refreshCaptures).toEqual(["a"]);
	});

	it("drains the refresh queue a couple per settled sweep, nearest the center first", () => {
		// five thumbless frames in view; centers sit 0/100/150/200/300 from the
		// viewport center, so a settle owes five whole-document rasterizations
		const frames = [
			frame("d", 250, 450),
			frame("a", 450, 450),
			frame("e", 450, 150),
			frame("b", 350, 450),
			frame("c", 450, 300),
		];
		const s = sweeper();
		const hasCover = () => false;
		s.sweep(frames, { hasCover });
		s.sweep(frames, { hasCover });

		// settled at last, and the burst is refused: the nearest two go now
		expect(CAPTURES_PER_SWEEP).toBe(2);
		expect(s.sweep(frames, { hasCover }).refreshCaptures).toEqual(["a", "b"]);

		// the rest kept their debt rather than firing into one commit
		expect(s.sweep(frames, { hasCover, capturing: new Set(["a", "b"]) }).refreshCaptures).toEqual(["c", "d"]);
	});
});

describe("first arrival", () => {
	it("re-photographs every frame once it has arrived, however old its stored still", () => {
		// The canvas stands the stored still in for the document every time the
		// camera moves. That still was taken by some earlier render — an older
		// document, an older capture — so the first thing a booted frame owes is
		// a picture of itself as it is now.
		const frames = [frame("a", 450, 450)];
		const s = sweeper();
		s.sweep(frames);
		s.sweep(frames);
		expect(s.sweep(frames).refreshCaptures).toEqual(["a"]);
		// and only once: a settled frame is not re-photographed every sweep
		expect(s.sweep(frames).refreshCaptures).toEqual([]);
		expect(s.sweep(frames).refreshCaptures).toEqual([]);
	});

	it("owes a fresh still again after a reload drops the boot", () => {
		const frames = [frame("a", 450, 450)];
		const s = sweeper();
		s.sweep(frames);
		s.sweep(frames);
		expect(s.sweep(frames).refreshCaptures).toEqual(["a"]);
		// the document was replaced: no loaded report, so nothing to photograph
		const unbooted = { ready: new Map<string, number>() };
		expect(s.sweep(frames, unbooted).refreshCaptures).toEqual([]);
		// and the new boot owes its own
		expect(s.sweep(frames).refreshCaptures).toEqual(["a"]);
	});
});
