// Deterministic camera tour + per-policy benchmark rows. The tour is the same
// every run so numbers are comparable across policies and machines: fit → slow
// pan across the field and back → zoom into the middle → out → zoom pulse.

import { type Bounds, type Camera, POLICIES, type Policy, type Stats } from "./lifecycle";

export type TourDeps = {
	setCamera(c: Camera): void;
	viewport(): { w: number; h: number };
	bounds(): Bounds;
	getStats(): Stats;
	setPolicy(p: Policy): void;
	getPolicy(): Policy;
	loadedPending(): number;
};

export type TourRow = {
	policy: string;
	avgFps: number;
	p95ms: number;
	p99ms: number;
	longFrames: number;
	samples: number;
	ticksPerSec: number;
	heapStartMB: number | null;
	heapEndMB: number | null;
	live: number;
	warm: number;
	snapshot: number;
	hydrateMs: number | null;
};

export type RigApi = {
	setPolicy(p: Policy): void;
	getPolicy(): Policy;
	setCamera(c: Camera): void;
	runTour(): Promise<TourRow>;
	runFull(): Promise<{ rows: TourRow[]; md: string }>;
	captureAll(): Promise<{ n: number; ms: number; failed: number }>;
	getStats(): Stats;
	loadedPending(): number;
	getShots(): Record<string, string>;
};

declare global {
	interface Window {
		__rig?: RigApi;
	}
}

const fitCamera = (b: Bounds, vw: number, vh: number, pad = 96): Camera => {
	const k = Math.min((vw - pad) / b.w, (vh - pad) / b.h);
	return { k, x: (vw - b.w * k) / 2 - b.x * k, y: (vh - b.h * k) / 2 - b.y * k };
};

const lerp = (a: Camera, b: Camera, p: number): Camera => ({
	x: a.x + (b.x - a.x) * p,
	y: a.y + (b.y - a.y) * p,
	k: a.k + (b.k - a.k) * p,
});

const quantile = (sorted: number[], q: number): number => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;

async function drive(deps: TourDeps): Promise<{ deltas: number[]; tickSamples: number[] }> {
	const { w: vw, h: vh } = deps.viewport();
	const b = deps.bounds();
	const fit = fitCamera(b, vw, vh);
	const kPan = 0.35;
	const yMid = vh / 2 - (b.y + b.h / 2) * kPan;
	const left: Camera = { k: kPan, x: 64 - b.x * kPan, y: yMid };
	const right: Camera = { k: kPan, x: vw - 64 - (b.x + b.w) * kPan, y: yMid };
	const cx = b.x + b.w / 2;
	const cy = b.y + b.h / 2;
	const kIn = 0.9;
	const zoomIn: Camera = { k: kIn, x: vw / 2 - cx * kIn, y: vh / 2 - cy * kIn };
	const kPulse = Math.min(1, fit.k * 3);
	const pulse: Camera = { k: kPulse, x: vw / 2 - cx * kPulse, y: vh / 2 - cy * kPulse };

	const segs = [
		{ from: fit, to: left, ms: 500 },
		{ from: left, to: right, ms: 2400 },
		{ from: right, to: left, ms: 2400 },
		{ from: left, to: zoomIn, ms: 900 },
		{ from: zoomIn, to: fit, ms: 900 },
		{ from: fit, to: pulse, ms: 600 },
		{ from: pulse, to: fit, ms: 600 },
	];

	const deltas: number[] = [];
	const tickSamples: number[] = [];

	await new Promise<void>((resolve) => {
		let t0 = 0;
		let last = 0;
		let lastTick = 0;
		const step = (t: number) => {
			if (t0 === 0) {
				t0 = t;
				last = t;
				lastTick = t;
				requestAnimationFrame(step);
				return;
			}
			deltas.push(t - last);
			last = t;
			if (t - lastTick > 800) {
				const s = deps.getStats();
				tickSamples.push(s.buckets.visLive.tps + s.buckets.offLive.tps + s.buckets.warm.tps);
				lastTick = t;
			}
			const el = t - t0;
			let acc = 0;
			let cam: Camera | null = null;
			for (const seg of segs) {
				if (el < acc + seg.ms) {
					cam = lerp(seg.from, seg.to, (el - acc) / seg.ms);
					break;
				}
				acc += seg.ms;
			}
			if (!cam) {
				deps.setCamera(fit);
				resolve();
				return;
			}
			deps.setCamera(cam);
			requestAnimationFrame(step);
		};
		requestAnimationFrame(step);
	});

	return { deltas, tickSamples };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function settle(deps: TourDeps, timeoutMs = 20000): Promise<void> {
	const t0 = performance.now();
	while (deps.loadedPending() > 0 && performance.now() - t0 < timeoutMs) await wait(200);
	await wait(1500);
}

export async function runTourRow(deps: TourDeps): Promise<TourRow> {
	const before = deps.getStats();
	const { deltas, tickSamples } = await drive(deps);
	await wait(700); // two lifecycle sweeps, so counts reflect the settled end state
	const after = deps.getStats();
	const sorted = [...deltas].sort((a, b) => a - b);
	const mean = deltas.reduce((a, v) => a + v, 0) / Math.max(1, deltas.length);
	return {
		policy: deps.getPolicy(),
		avgFps: Math.round(1000 / mean),
		p95ms: Math.round(quantile(sorted, 0.95) * 10) / 10,
		p99ms: Math.round(quantile(sorted, 0.99) * 10) / 10,
		longFrames: deltas.filter((d) => d > 33.4).length,
		samples: deltas.length,
		ticksPerSec: Math.round(tickSamples.reduce((a, v) => a + v, 0) / Math.max(1, tickSamples.length)),
		heapStartMB: before.heapMB,
		heapEndMB: after.heapMB,
		live: after.counts.live,
		warm: after.counts.warm,
		snapshot: after.counts.snapshot,
		hydrateMs: after.hydrate?.ms ?? null,
	};
}

export async function runFullBenchmark(deps: TourDeps): Promise<{ rows: TourRow[]; md: string }> {
	const original = deps.getPolicy();
	const rows: TourRow[] = [];
	for (const policy of POLICIES) {
		deps.setPolicy(policy);
		await settle(deps);
		rows.push(await runTourRow(deps));
	}
	deps.setPolicy(original);
	return { rows, md: mdTable(rows) };
}

export function mdTable(rows: TourRow[]): string {
	const head =
		"| policy | avg fps | p95 ms | p99 ms | long frames | in-frame ticks/s | live/warm/snap | heap MB | hydrate ms |\n" +
		"|---|---|---|---|---|---|---|---|---|";
	const lines = rows.map(
		(r) =>
			`| ${r.policy} | ${r.avgFps} | ${r.p95ms} | ${r.p99ms} | ${r.longFrames}/${r.samples} | ${r.ticksPerSec} | ${r.live}/${r.warm}/${r.snapshot} | ${r.heapStartMB ?? "–"}→${r.heapEndMB ?? "–"} | ${r.hydrateMs ?? "–"} |`,
	);
	return [head, ...lines].join("\n");
}
