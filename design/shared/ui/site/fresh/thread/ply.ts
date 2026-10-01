/**
 * A plied red thread on a 2D canvas: a dark core, a lit body, the diagonal
 * twist of its strands, and the odd loose fibre. Both thread takes draw with
 * it, one along an authored path, the other along a simulated rope.
 */

export type Point = { x: number; y: number };

/** Collects a path as a dense polyline, with named lengths along the way. */
export class PathBuilder {
	points: Point[] = [];
	private names: { name: string; index: number }[] = [];

	private get last(): Point {
		const point = this.points[this.points.length - 1];
		if (!point) throw new Error("PathBuilder needs a start point");
		return point;
	}

	start(p: Point) {
		this.points.push({ ...p });
		return this;
	}

	line(p: Point) {
		const a = this.last;
		const steps = Math.max(1, Math.ceil(Math.hypot(p.x - a.x, p.y - a.y) / 3));
		for (let i = 1; i <= steps; i++) {
			const t = i / steps;
			this.points.push({ x: a.x + (p.x - a.x) * t, y: a.y + (p.y - a.y) * t });
		}
		return this;
	}

	cubic(c1: Point, c2: Point, p: Point) {
		const a = this.last;
		const rough = Math.hypot(c1.x - a.x, c1.y - a.y) + Math.hypot(c2.x - c1.x, c2.y - c1.y) + Math.hypot(p.x - c2.x, p.y - c2.y);
		const steps = Math.max(2, Math.ceil(rough / 3));
		for (let i = 1; i <= steps; i++) {
			const t = i / steps;
			const u = 1 - t;
			this.points.push({
				x: u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p.x,
				y: u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p.y,
			});
		}
		return this;
	}

	/** A smooth vertical-ish hand-off: leaves `a` heading down, arrives heading down. */
	drop(p: Point, bend = 0.5) {
		const a = this.last;
		const d = Math.max(40, Math.abs(p.y - a.y) * bend);
		return this.cubic({ x: a.x, y: a.y + d }, { x: p.x, y: p.y - d }, p);
	}

	/** Arc around a centre from angle a0 to a1 (radians, either direction). */
	arc(cx: number, cy: number, r: number, a0: number, a1: number) {
		const steps = Math.max(4, Math.ceil((Math.abs(a1 - a0) * r) / 3));
		for (let i = 1; i <= steps; i++) {
			const a = a0 + ((a1 - a0) * i) / steps;
			this.points.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
		}
		return this;
	}

	/** A clockwise lap of a rounded rectangle, starting and ending at its top-left corner. */
	lap(left: number, top: number, w: number, h: number, r = 10) {
		const right = left + w;
		const bottom = top + h;
		this.line({ x: right - r, y: top });
		this.arc(right - r, top + r, r, -Math.PI / 2, 0);
		this.line({ x: right, y: bottom - r });
		this.arc(right - r, bottom - r, r, 0, Math.PI / 2);
		this.line({ x: left + r, y: bottom });
		this.arc(left + r, bottom - r, r, Math.PI / 2, Math.PI);
		this.line({ x: left, y: top + r });
		this.arc(left + r, top + r, r, Math.PI, Math.PI * 1.5);
		return this;
	}

	mark(name: string) {
		this.names.push({ name, index: this.points.length - 1 });
		return this;
	}

	build(step = 2): ThreadPath {
		return resample(this.points, this.names, step);
	}
}

export type ThreadPath = {
	step: number;
	length: number;
	count: number;
	x: Float32Array;
	y: Float32Array;
	/** unit tangent */
	tx: Float32Array;
	ty: Float32Array;
	marks: Record<string, number>;
};

function resample(points: Point[], names: { name: string; index: number }[], step: number): ThreadPath {
	const cumulative = new Float64Array(points.length);
	for (let i = 1; i < points.length; i++) {
		const a = points[i - 1] as Point;
		const b = points[i] as Point;
		cumulative[i] = (cumulative[i - 1] ?? 0) + Math.hypot(b.x - a.x, b.y - a.y);
	}
	const length = cumulative[points.length - 1] ?? 0;
	const count = Math.max(2, Math.floor(length / step) + 1);
	const x = new Float32Array(count);
	const y = new Float32Array(count);
	let j = 0;
	for (let i = 0; i < count; i++) {
		const s = Math.min(length, i * step);
		while (j < points.length - 2 && (cumulative[j + 1] ?? 0) < s) j++;
		const a = points[j] as Point;
		const b = (points[j + 1] ?? a) as Point;
		const span = (cumulative[j + 1] ?? 0) - (cumulative[j] ?? 0);
		const t = span > 0 ? (s - (cumulative[j] ?? 0)) / span : 0;
		x[i] = a.x + (b.x - a.x) * t;
		y[i] = a.y + (b.y - a.y) * t;
	}
	const { tx, ty } = tangents(x, y, count);
	const marks: Record<string, number> = {};
	for (const { name, index } of names) marks[name] = cumulative[index] ?? 0;
	return { step, length, count, x, y, tx, ty, marks };
}

export function tangents(x: Float32Array, y: Float32Array, count: number) {
	const tx = new Float32Array(count);
	const ty = new Float32Array(count);
	for (let i = 0; i < count; i++) {
		const a = Math.max(0, i - 1);
		const b = Math.min(count - 1, i + 1);
		const dx = (x[b] ?? 0) - (x[a] ?? 0);
		const dy = (y[b] ?? 0) - (y[a] ?? 0);
		const d = Math.hypot(dx, dy) || 1;
		tx[i] = dx / d;
		ty[i] = dy / d;
	}
	return { tx, ty };
}

export type PlyStyle = {
	width: number;
	/** the shadowed core */
	core: string;
	/** the lit body */
	body: string;
	/** the twist highlights */
	light: string;
	/** distance between twists, px */
	pitch: number;
	/** loose fibres along the edge */
	fibres?: boolean;
	/** samples drawn as the far side of a winding: dimmer, no twist */
	back?: Uint8Array;
	backColor?: string;
};

function hash(n: number) {
	const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
	return s - Math.floor(s);
}

/**
 * Draw the stretch of `path` between lengths `from` and `to`, skipping what
 * falls outside [top, bottom] in the path's own coordinates.
 */
export function drawPly(
	ctx: CanvasRenderingContext2D,
	path: Pick<ThreadPath, "step" | "count" | "x" | "y" | "tx" | "ty">,
	from: number,
	to: number,
	top: number,
	bottom: number,
	style: PlyStyle,
) {
	const { step, count, x, y, tx, ty } = path;
	if (to <= from || count < 2) return;
	const i0 = Math.max(0, Math.floor(from / step));
	const last = Math.min(count - 1, to / step);
	const i1 = Math.floor(last);
	const hw = style.width / 2;
	const margin = style.width * 4;
	const visible = (i: number) => {
		const py = y[i] ?? 0;
		return py > top - margin && py < bottom + margin;
	};
	const back = style.back;

	// The tip, interpolated so a growing thread never steps sample by sample.
	const frac = last - i1;
	const tipX = (x[i1] ?? 0) + ((x[Math.min(count - 1, i1 + 1)] ?? 0) - (x[i1] ?? 0)) * frac;
	const tipY = (y[i1] ?? 0) + ((y[Math.min(count - 1, i1 + 1)] ?? 0) - (y[i1] ?? 0)) * frac;

	const trace = (keep: (i: number) => boolean) => {
		ctx.beginPath();
		let pen = false;
		for (let i = i0; i <= i1; i++) {
			if (!visible(i) || !keep(i)) {
				pen = false;
				continue;
			}
			if (pen) ctx.lineTo(x[i] ?? 0, y[i] ?? 0);
			else ctx.moveTo(x[i] ?? 0, y[i] ?? 0);
			pen = true;
		}
		if (pen && frac > 0) ctx.lineTo(tipX, tipY);
	};

	ctx.lineCap = "round";
	ctx.lineJoin = "round";

	if (back) {
		trace((i) => back[i] === 1);
		ctx.strokeStyle = style.backColor ?? style.core;
		ctx.lineWidth = style.width * 0.8;
		ctx.stroke();
	}
	const front = back ? (i: number) => back[i] !== 1 || back[Math.max(0, i - 1)] !== 1 : () => true;

	trace(front);
	ctx.strokeStyle = style.core;
	ctx.lineWidth = style.width;
	ctx.stroke();
	ctx.strokeStyle = style.body;
	ctx.lineWidth = style.width * 0.62;
	ctx.stroke();

	// The twist: short diagonals across the body, one per pitch.
	const every = Math.max(1, Math.round(style.pitch / step));
	ctx.beginPath();
	for (let i = i0 - (i0 % every); i <= i1; i += every) {
		if (i < i0 || !visible(i) || !front(i)) continue;
		const px = x[i] ?? 0;
		const py = y[i] ?? 0;
		const ax = tx[i] ?? 0;
		const ay = ty[i] ?? 0;
		// normal
		const nx = -ay;
		const ny = ax;
		const lean = hw * 0.9;
		ctx.moveTo(px - nx * hw * 0.78 - ax * lean, py - ny * hw * 0.78 - ay * lean);
		ctx.lineTo(px + nx * hw * 0.78 + ax * lean, py + ny * hw * 0.78 + ay * lean);
	}
	ctx.lineCap = "butt";
	ctx.strokeStyle = style.light;
	ctx.lineWidth = Math.max(0.55, style.width * 0.2);
	ctx.stroke();

	if (style.fibres) {
		ctx.beginPath();
		const gap = Math.max(1, Math.round(23 / step));
		for (let i = i0 - (i0 % gap); i <= i1; i += gap) {
			if (i < i0 || !visible(i) || !front(i)) continue;
			const h = hash(i);
			if (h > 0.42) continue;
			const side = hash(i + 7) > 0.5 ? 1 : -1;
			const px = x[i] ?? 0;
			const py = y[i] ?? 0;
			const ax = tx[i] ?? 0;
			const ay = ty[i] ?? 0;
			const nx = -ay * side;
			const ny = ax * side;
			const len = 2.5 + hash(i + 3) * 5;
			const sx = px + nx * hw * 0.7;
			const sy = py + ny * hw * 0.7;
			ctx.moveTo(sx, sy);
			ctx.quadraticCurveTo(
				sx + nx * len * 0.6 + ax * len * 0.3,
				sy + ny * len * 0.6 + ay * len * 0.3,
				sx + nx * len * 0.5 + ax * len,
				sy + ny * len * 0.5 + ay * len,
			);
		}
		ctx.lineCap = "round";
		ctx.strokeStyle = style.body;
		ctx.globalAlpha = 0.5;
		ctx.lineWidth = 0.6;
		ctx.stroke();
		ctx.globalAlpha = 1;
	}
}

/** The canvas's drawing buffer, kept to its box at a capped device pixel ratio. */
export function fitCanvas(canvas: HTMLCanvasElement, width: number, height: number, cap = 2) {
	const ratio = Math.min(window.devicePixelRatio || 1, cap);
	const w = Math.max(1, Math.round(width * ratio));
	const h = Math.max(1, Math.round(height * ratio));
	if (canvas.width !== w || canvas.height !== h) {
		canvas.width = w;
		canvas.height = h;
	}
	return ratio;
}

export const RED = {
	core: "#8a1a0a",
	body: "#f5391a",
	light: "#ff8a66",
	back: "#4a120a",
};
