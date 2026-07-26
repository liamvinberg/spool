import { describe, expect, it } from "vitest";
import type { Camera, ProjectedFrame } from "../api";
import type { FrameState, SweepInput } from "./lifecycle";
import {
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
	hasThumb: true,
});

const origin: Camera = { x: 0, y: 0, k: 1 };

/** The camera panned (k=1) so the frame sits centered in the viewport. */
const over = (f: ProjectedFrame): Camera => ({ k: 1, x: 500 - f.x - f.w / 2, y: 500 - f.y - f.h / 2 });

/** Threads states and a fake clock through consecutive sweeps of one model. */
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
			ready: new Set(frames.map((f) => f.name)),
			capturing: new Set(),
			hasThumb: () => true,
			now,
			...input,
		});
		states = result.states;
		return result;
	};
	return { sweep, model, states: () => states };
}

/** One frame per 2000 world units: the camera parked over one sees only it. */
const strip = (count: number, kind: "html" | "term" = "html") =>
	Array.from({ length: count }, (_, i) => frame(`f${i}`, i * 2000, 0, kind));

/** Mounts each frame in turn, giving strictly ascending last-usable times. */
const tour = (s: ReturnType<typeof sweeper>, frames: ProjectedFrame[]) => {
	for (const f of frames) s.sweep(frames, { camera: over(f) });
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
		expect(first.states).toEqual({ a: "warm", b: "warm", c: "warm", d: "hibernated", e: "hibernated" });
		expect(MOUNTS_PER_SWEEP).toBe(3);

		const second = sweep(frames);
		expect(second.states).toEqual({ a: "warm", b: "warm", c: "warm", d: "warm", e: "warm" });
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

		// zooming in past the gate mounts them, frozen
		expect(Object.values(sweep(frames).states)).toEqual(["warm", "warm", "warm"]);
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
			"ring-near": "warm",
			"ring-far": "hibernated",
			"corner-a": "warm",
			"corner-b": "warm",
		});

		const second = sweep(frames);
		expect(second.states["ring-far"]).toBe("warm");
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

		// e sits farthest from the center, yet enters alongside a full queue —
		// and is the only frame running: its neighbours mount frozen
		const first = sweep(inView, { entered: "e" });
		expect(first.states).toEqual({ a: "warm", b: "warm", c: "warm", d: "hibernated", e: "live" });

		// entered survives leaving the view
		const away = sweep(inView, { entered: "e", camera: { x: -10000, y: 0, k: 1 } });
		expect(away.states.e).toBe("live");
	});

	it("stops the frame it left, whatever the zoom", () => {
		const { sweep } = sweeper();
		sweep(inView, { entered: "a" });

		// leaving is the whole of it: no zoom keeps a frame running
		expect(sweep(inView, { entered: null }).states.a).toBe("warm");
		expect(sweep(inView, { entered: null, camera: { x: 0, y: 0, k: 4 } }).states.a).toBe("warm");
	});
});

describe("frozen frame", () => {
	it("moves nothing on the canvas: an unentered frame was never running", () => {
		const frames = [frame("a", 350, 450), frame("b", 550, 450)];
		const { sweep } = sweeper();
		sweep(frames);

		const aFrozen = sweep(frames, { frozen: "a" });
		expect(aFrozen.states).toEqual({ a: "warm", b: "warm" });

		const bFrozen = sweep(frames, { frozen: "b" });
		expect(bFrozen.states).toEqual({ a: "warm", b: "warm" });
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
	it("a zoom round trip within capacity never hibernates and never remounts", () => {
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

		// zooming back is a camera move and nothing else: no queue, no remount,
		// and no frame woken into running by the zoom alone
		const back = sweep(frames);
		expect(Object.values(back.states)).toEqual(allWarm);
		expect(back.changed).toBe(false);
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
		expect(rescued.states.f0).toBe("warm");
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

	it("a missing still backfills when settled, unless a capture is already in flight", () => {
		const frames = [frame("a", 450, 450)];
		const s = sweeper();
		const hasThumb = () => false;
		s.sweep(frames, { hasThumb });
		expect(s.sweep(frames, { hasThumb }).refreshCaptures).toEqual([]);

		// settled and thumbless — but an in-flight capture holds the debt open
		expect(s.sweep(frames, { hasThumb, capturing: new Set(["a"]) }).refreshCaptures).toEqual([]);
		expect(s.sweep(frames, { hasThumb }).refreshCaptures).toEqual(["a"]);
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
		const hasThumb = () => false;
		s.sweep(frames, { hasThumb });
		s.sweep(frames, { hasThumb });

		// settled at last, and the burst is refused: the nearest two go now
		expect(CAPTURES_PER_SWEEP).toBe(2);
		expect(s.sweep(frames, { hasThumb }).refreshCaptures).toEqual(["a", "b"]);

		// the rest kept their debt rather than firing into one commit
		expect(s.sweep(frames, { hasThumb, capturing: new Set(["a", "b"]) }).refreshCaptures).toEqual(["c", "d"]);
	});
});
