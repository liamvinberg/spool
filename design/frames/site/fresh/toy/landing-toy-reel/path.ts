export type Point = { x: number; y: number };

/** One piece of the sewn line. `pass` pieces are running stitches, the rest lie on top. */
export type Segment =
	| { kind: "cubic"; p: [Point, Point, Point, Point]; length: number; start: number }
	| { kind: "pass"; a: Point; b: Point; length: number; start: number; fill: boolean };

export type Thread = {
	segments: Segment[];
	total: number;
	/** cumulative length and position, every few pixels along the whole line */
	samples: { at: number; x: number; y: number }[];
	/** where each sewn heading's first pass begins, in thread length */
	marks: number[];
	end: Point;
};

const cubicAt = (p: [Point, Point, Point, Point], t: number): Point => {
	const u = 1 - t;
	return {
		x: u * u * u * p[0].x + 3 * u * u * t * p[1].x + 3 * u * t * t * p[2].x + t * t * t * p[3].x,
		y: u * u * u * p[0].y + 3 * u * u * t * p[1].y + 3 * u * t * t * p[2].y + t * t * t * p[3].y,
	};
};

export type Stitch = { left: number; right: number; y: number };
export type Loop = { left: number; right: number; top: number; bottom: number };

/**
 * Lays the thread through the page: down the gutter, out under each heading and
 * back (a double running stitch, so the return fills the gaps), and finally
 * once around the download button.
 */
export function layThread(stitches: Stitch[], loop: Loop | null, gutter: number): Thread {
	const segments: Segment[] = [];
	const marks: number[] = [];
	let length = 0;
	let at: Point | null = null;
	const cubic = (p1: Point, p2: Point, p3: Point) => {
		if (!at) return;
		const p: [Point, Point, Point, Point] = [at, p1, p2, p3];
		let l = 0;
		let prev = at;
		for (let i = 1; i <= 32; i++) {
			const q = cubicAt(p, i / 32);
			l += Math.hypot(q.x - prev.x, q.y - prev.y);
			prev = q;
		}
		segments.push({ kind: "cubic", p, length: l, start: length });
		length += l;
		at = p3;
	};
	const line = (to: Point) => {
		if (!at) return;
		cubic(
			{ x: at.x + (to.x - at.x) / 3, y: at.y + (to.y - at.y) / 3 },
			{ x: at.x + ((to.x - at.x) * 2) / 3, y: at.y + ((to.y - at.y) * 2) / 3 },
			to,
		);
	};
	const pass = (to: Point, fill: boolean) => {
		if (!at) return;
		const l = Math.hypot(to.x - at.x, to.y - at.y);
		segments.push({ kind: "pass", a: at, b: to, length: l, start: length, fill });
		length += l;
		at = to;
	};
	// A loose descent with a little sway, so it reads as thread rather than a rule.
	const descend = (x: number, toY: number) => {
		if (!at || toY - at.y < 40) return;
		const span = toY - at.y;
		const sway = Math.min(18, span * 0.05);
		cubic({ x: x + sway, y: at.y + span * 0.33 }, { x: x - sway, y: at.y + span * 0.66 }, { x, y: toY });
	};

	// The thread runs down the gutter. At each heading it turns in, stitches out
	// under the last line and back, and turns down again.
	const turn = 30;
	const k = 0.5523;
	const turnIn = (y: number) => {
		if (!at) return;
		descend(gutter, y - turn);
		cubic({ x: gutter, y: y - turn + turn * k }, { x: gutter - turn + turn * k, y }, { x: gutter - turn, y });
	};
	const turnDown = () => {
		if (!at) return;
		const y = at.y;
		cubic({ x: gutter - turn + turn * k, y }, { x: gutter, y: y + turn - turn * k }, { x: gutter, y: y + turn });
	};
	for (const [index, stitch] of stitches.entries()) {
		if (index === 0) at = { x: gutter - turn, y: stitch.y };
		else turnIn(stitch.y);
		marks.push(length);
		pass({ x: stitch.left, y: stitch.y }, false);
		pass({ x: gutter - turn, y: stitch.y }, true);
		turnDown();
	}

	if (loop && at) {
		const pad = 12;
		const box = { l: loop.left - pad, r: loop.right + pad, t: loop.top - pad, b: loop.bottom + pad };
		const mid = (box.t + box.b) / 2;
		const rad = (box.b - box.t) / 2;
		turnIn(mid);
		line({ x: box.r, y: mid });
		marks.push(length);
		// Once round the button, a clean pill, and tied off where it started.
		cubic({ x: box.r, y: mid - rad * k }, { x: box.r - rad + rad * k, y: box.t }, { x: box.r - rad, y: box.t });
		line({ x: box.l + rad, y: box.t });
		cubic({ x: box.l + rad - rad * k, y: box.t }, { x: box.l, y: mid - rad * k }, { x: box.l, y: mid });
		cubic({ x: box.l, y: mid + rad * k }, { x: box.l + rad - rad * k, y: box.b }, { x: box.l + rad, y: box.b });
		line({ x: box.r - rad, y: box.b });
		cubic({ x: box.r - rad + rad * k, y: box.b }, { x: box.r, y: mid + rad * k }, { x: box.r, y: mid });
	}

	const samples: Thread["samples"] = [];
	for (const segment of segments) {
		const steps = Math.max(2, Math.ceil(segment.length / 4));
		for (let i = 0; i <= steps; i++) {
			const t = i / steps;
			const point =
				segment.kind === "cubic"
					? cubicAt(segment.p, t)
					: { x: segment.a.x + (segment.b.x - segment.a.x) * t, y: segment.a.y + (segment.b.y - segment.a.y) * t };
			samples.push({ at: segment.start + segment.length * t, x: point.x, y: point.y });
		}
	}
	const last = samples[samples.length - 1] ?? { x: gutter, y: 0 };
	return { segments, total: length, samples, marks, end: { x: last.x, y: last.y } };
}

export function pointAt(thread: Thread, length: number): Point {
	const { samples } = thread;
	if (!samples.length) return { x: 0, y: 0 };
	if (length <= 0) return samples[0];
	if (length >= thread.total) return samples[samples.length - 1];
	let lo = 0;
	let hi = samples.length - 1;
	while (hi - lo > 1) {
		const mid = (lo + hi) >> 1;
		if (samples[mid].at <= length) lo = mid;
		else hi = mid;
	}
	const a = samples[lo];
	const b = samples[hi];
	const t = b.at === a.at ? 0 : (length - a.at) / (b.at - a.at);
	return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** How much thread has to be out for its needle to reach `y` on the page. */
export function lengthAtDepth(thread: Thread, y: number): number {
	let reached = 0;
	for (const sample of thread.samples) {
		if (sample.y > y + 0.5) break;
		reached = sample.at;
	}
	return reached;
}

export const svgCubic = (p: [Point, Point, Point, Point]) =>
	`M${p[0].x.toFixed(1)} ${p[0].y.toFixed(1)}C${p[1].x.toFixed(1)} ${p[1].y.toFixed(1)} ${p[2].x.toFixed(1)} ${p[2].y.toFixed(1)} ${p[3].x.toFixed(1)} ${p[3].y.toFixed(1)}`;
