import { PathBuilder, type Point, type ThreadPath } from "shared/ui/site/fresh/thread/ply";

/** Where the thread goes, read off the page's own layout in document coordinates. */

type Box = { left: number; top: number; right: number; bottom: number; width: number; height: number; cx: number; cy: number };

function box(el: Element | null | undefined): Box {
	if (!el) return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, cx: 0, cy: 0 };
	const r = el.getBoundingClientRect();
	const top = r.top + window.scrollY;
	const left = r.left + window.scrollX;
	return {
		left,
		top,
		right: left + r.width,
		bottom: top + r.height,
		width: r.width,
		height: r.height,
		cx: left + r.width / 2,
		cy: top + r.height / 2,
	};
}

/** Builder with a sense of direction, so hand-offs between figures stay smooth. */
class Route extends PathBuilder {
	constructor(
		private min: number,
		private max: number,
	) {
		super();
	}
	private clamp(p: Point): Point {
		return { x: Math.min(this.max, Math.max(this.min, p.x)), y: p.y };
	}
	tail(): Point {
		return this.points[this.points.length - 1] as Point;
	}
	heading(): Point {
		const n = this.points.length;
		const a = this.points[Math.max(0, n - 4)] as Point;
		const b = this.points[n - 1] as Point;
		const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
		return { x: (b.x - a.x) / d, y: (b.y - a.y) / d };
	}
	/** Leave along the current heading, arrive at `p` along `arrive`, control reaches d1 and d2. */
	to(p: Point, arrive: Point, d1: number, d2 = d1) {
		const a = this.tail();
		const h = this.heading();
		return this.cubic(
			this.clamp({ x: a.x + h.x * d1, y: a.y + h.y * d1 }),
			this.clamp({ x: p.x - arrive.x * d2, y: p.y - arrive.y * d2 }),
			p,
		);
	}
	/**
	 * Sweep across to the left and turn around a pin, arriving at `p` heading
	 * right. The turn is a half ellipse, rx wide, ry tall.
	 */
	hook(p: Point, rx: number, ry: number, d1: number, d2: number) {
		const top = { x: p.x, y: p.y - ry * 2 };
		this.to(top, { x: -1, y: 0 }, d1, d2);
		const steps = Math.ceil((Math.PI * (rx + ry)) / 3);
		for (let i = 1; i <= steps; i++) {
			const t = -Math.PI / 2 - (Math.PI * i) / steps;
			this.points.push({ x: p.x + Math.cos(t) * rx, y: p.y - ry + Math.sin(t) * ry });
		}
		return this;
	}
	/**
	 * A clockwise lap of a rounded rectangle, opening outward as it goes so the
	 * end rides just outside the start, then running on as a second strand.
	 * "tl" starts at (left + r, top) heading right; "tr" at (right, top + r) heading down.
	 */
	wind(b: Box, r: number, grow: number, run: number, from: "tl" | "tr" = "tl") {
		const at = (g: number) => ({ l: b.left - g, t: b.top - g, rt: b.right + g, bt: b.bottom + g });
		const sides = [
			(g: number) => {
				const c = at(g);
				this.line({ x: c.rt - r, y: c.t });
				this.arc(c.rt - r, c.t + r, r, -Math.PI / 2, 0);
			},
			(g: number) => {
				const c = at(g);
				this.line({ x: c.rt, y: c.bt - r });
				this.arc(c.rt - r, c.bt - r, r, 0, Math.PI / 2);
			},
			(g: number) => {
				const c = at(g);
				this.line({ x: c.l + r, y: c.bt });
				this.arc(c.l + r, c.bt - r, r, Math.PI / 2, Math.PI);
			},
			(g: number) => {
				const c = at(g);
				this.line({ x: c.l, y: c.t + r });
				this.arc(c.l + r, c.t + r, r, Math.PI, Math.PI * 1.5);
			},
		];
		const first = from === "tl" ? 0 : 1;
		for (let k = 0; k < 4; k++) (sides[(first + k) % 4] as (g: number) => void)((grow * (k + 1)) / 4);
		const c = at(grow);
		if (from === "tl") this.line({ x: c.l + r + run, y: c.t });
		else this.line({ x: c.rt, y: c.t + r + run });
		return this;
	}
	/** A loop that leaves heading right and comes back heading right, above the line. */
	loopUp(r: number) {
		const a = this.tail();
		return this.arc(a.x, a.y - r, r, Math.PI / 2, Math.PI / 2 - Math.PI * 2);
	}
	/** A knot in a falling thread: a full turn to the right, back where it started, heading down. */
	knot(r: number) {
		const a = this.tail();
		return this.arc(a.x + r, a.y, r, Math.PI, -Math.PI);
	}
}

export type Stage = { el: HTMLElement; done: number };
export type Layout = {
	path: ThreadPath;
	/** samples on the far side of the spool's windings */
	back: Uint8Array;
	hero: number;
	/** [scrollY, drawn length] keyframes, increasing in both */
	keys: [number, number][];
	stages: Stage[];
};

export function layout(root: HTMLElement): Layout | null {
	const q = (s: string) => root.querySelector<HTMLElement>(s);
	const all = (s: string) => [...root.querySelectorAll<HTMLElement>(s)];
	const word = box(q("[data-t='word']"));
	const prompt = q("[data-fig='prompt']");
	const versions = q("[data-fig='versions']");
	const flow = q("[data-fig='flow']");
	const log = q("[data-fig='log']");
	const spool = q("[data-fig='spool']");
	if (!prompt || !versions || !flow || !log || !spool || !word.width) return null;
	const vw = document.documentElement.clientWidth;
	const vh = window.innerHeight;
	const narrow = vw < 760;
	const edge = narrow ? 10 : Math.min(48, (vw - 1280) / 2 + 40);
	const right = vw - edge;
	const R = new Route(edge, right);
	const stages: Stage[] = [];
	const keys: [number, number][] = [[0, 0]];
	const length = () => {
		// running length of what has been laid so far
		let s = 0;
		const p = R.points;
		for (let i = 1; i < p.length; i++) s += Math.hypot((p[i] as Point).x - (p[i - 1] as Point).x, (p[i] as Point).y - (p[i - 1] as Point).y);
		return s;
	};

	// In from the edge of the page, under the word.
	const under = word.top + word.height * (narrow ? 0.9 : 0.84);
	R.start({ x: -12, y: under });
	R.line({ x: word.right + (narrow ? 10 : 120), y: under });
	const hero = length();
	keys[0] = [0, hero];

	// On a phone the thread keeps to the right-hand gutter between figures.
	const gutter = (y: number) => {
		if (!narrow) return;
		const a = R.tail();
		if (a.x < right - 2) R.to({ x: right, y: a.y + 70 }, { x: 0, y: 1 }, 30, 40);
		if (R.tail().y < y) R.line({ x: right, y });
	};

	// 1. A sentence underlined, then a frame wound into being.
	{
		const line = box(prompt.querySelector("[data-part='prompt']"));
		const frame = box(prompt.querySelector("[data-part='frame']"));
		const u = line.bottom + 7;
		const a0 = length();
		if (narrow) {
			gutter(line.top - 110);
			R.hook({ x: line.left - 2, y: u }, 8, 22, 40, 160);
		} else R.to({ x: line.left - 8, y: u }, { x: 1, y: 0 }, 260, 220);
		const k0 = length();
		R.line({ x: line.right + 4, y: u });
		R.to({ x: frame.right, y: frame.top + 14 }, { x: 0, y: 1 }, Math.max(40, (frame.right - line.right) * 0.7), 60);
		R.wind(frame, 14, 5, narrow ? 60 : 160, "tr");
		const done = length();
		keys.push([Math.max(1, box(prompt).top - vh * 0.85), a0], [box(prompt).top - vh * 0.5, k0], [frame.bottom - vh * 0.7, done]);
		stages.push({ el: prompt, done });
	}

	// 2. Three versions, each wound in turn, with a hop between them.
	{
		const figures = all("[data-fig='versions'] .td-frame");
		const frames = all("[data-fig='versions'] [data-part='frame']").map(box);
		const first = frames[0] as Box;
		const a0 = length();
		{
			gutter(first.top - 150);
			const a = R.tail();
			const p = { x: first.left + 12, y: first.top };
			R.hook(p, narrow ? 10 : 34, narrow ? 24 : 36, (p.y - a.y) * 0.7, Math.abs(a.x - p.x) * 0.8);
		}
		frames.forEach((f, i) => {
			const next = frames[i + 1];
			const stacked = next && next.top > f.bottom;
			R.wind(f, 12, 4, stacked ? 30 : f.width - 44);
			const figure = figures[i];
			if (figure) stages.push({ el: figure, done: length() });
			if (!next) {
				R.to({ x: Math.min(vw - 30, f.right + 40), y: f.bottom + 110 }, { x: 0, y: 1 }, 90, 150);
				return;
			}
			const a = R.tail();
			if (stacked) {
				// stacked: round the right side and turn in over the next one
				R.to({ x: right, y: f.bottom }, { x: 0, y: 1 }, 30, 120);
				R.hook({ x: next.left + 12, y: next.top }, 10, 22, 60, 120);
			} else {
				const lift = 46;
				R.cubic({ x: a.x + 46, y: a.y - lift }, { x: next.left - 34, y: next.top - lift }, { x: next.left + 12, y: next.top });
			}
		});
		const done = length();
		const b = box(versions);
		keys.push([b.top - vh * 0.75, a0], [Math.max(b.top - vh * 0.75 + 240, b.bottom - vh * 0.68), done]);
	}

	// 3. The frames of a flow strung on it like beads, a loop between each.
	{
		const frames = all("[data-fig='flow'] [data-part='frame']").map(box);
		const first = frames[0] as Box;
		const y = first.cy;
		const a0 = length();
		const lead = Math.max(edge + 4, first.left - 34);
		{
			gutter(first.top - 140);
			const a = R.tail();
			const ry = (y - (first.top - 64)) / 2;
			R.hook({ x: lead, y }, narrow ? 8 : 28, ry, (y - 2 * ry - a.y) * 0.75, Math.abs(a.x - lead) * 0.8);
		}
		const k0 = length();
		frames.forEach((f, i) => {
			const next = frames[i + 1];
			if (next) {
				const gap = (f.right + next.left) / 2;
				R.line({ x: gap, y });
				R.loopUp(narrow ? 8 : 15);
			} else {
				const turn = narrow ? 6 : 24;
				const x = Math.min(right - turn, f.right + (narrow ? 2 : 14));
				R.line({ x, y });
				R.arc(x, y + turn, turn, -Math.PI / 2, 0);
			}
		});
		const done = length();
		const b = box(flow);
		keys.push([b.top - vh * 0.95, a0], [b.top - vh * 0.62, k0], [b.bottom - vh * 0.6, done]);
		stages.push({ el: flow, done });
	}

	// 4. Down the history, a knot at every commit.
	{
		const rows = all("[data-fig='log'] [data-part='row']").map(box);
		const first = rows[0] as Box;
		const x = first.left + (narrow ? 10 : 14);
		const a0 = length();
		{
			gutter(first.top - 150);
			const a = R.tail();
			const dy = first.top - 30 - a.y;
			R.to({ x, y: first.top - 30 }, { x: 0, y: 1 }, dy * 0.55, dy * 0.5);
		}
		const k0 = length();
		for (const row of rows) {
			R.line({ x, y: row.cy - 7 });
			R.knot(7);
		}
		R.line({ x, y: (rows[rows.length - 1] as Box).bottom + 50 });
		const done = length();
		const b = box(log);
		keys.push([b.top - vh * 0.85, a0], [b.top - vh * 0.6, k0], [b.bottom - vh * 0.62, done]);
		stages.push({ el: log, done });
	}

	// 5. Back onto a spool.
	const coil = box(spool.querySelector("[data-part='barrel']"));
	const rx = coil.width / 2;
	const ry = Math.max(6, rx * 0.2);
	const pitch = narrow ? 7 : 8;
	const turns = Math.max(4, Math.floor((coil.height - ry * 2) / pitch));
	const top0 = coil.top + ry;
	const a0 = length();
	gutter(coil.top - 140);
	R.to({ x: coil.cx, y: top0 + ry }, { x: 1, y: 0 }, narrow ? 80 : 200, narrow ? 100 : 140);
	const coilFrom = R.points.length;
	const steps = turns * 64;
	for (let i = 1; i <= steps; i++) {
		const t = (i / 64) * Math.PI * 2;
		// starts at the front-centre heading right; sin < 0 is the far side
		R.points.push({ x: coil.cx + Math.sin(t) * rx, y: top0 + Math.cos(t) * ry + (pitch * t) / (Math.PI * 2) });
	}
	const coilTo = R.points.length;
	const done = length();
	{
		const b = box(spool);
		const max = document.documentElement.scrollHeight - vh;
		keys.push([b.top - vh * 0.85, a0], [Math.min(max - 4, Math.max(b.top - vh * 0.85 + 300, coil.bottom - vh * 0.7)), done]);
		stages.push({ el: spool, done });
	}

	const path = R.build(2);
	// Mark the far side of each winding, by sample.
	const back = new Uint8Array(path.count);
	{
		let s = 0;
		const raw = R.points;
		for (let i = 1; i < raw.length; i++) {
			const a = raw[i - 1] as Point;
			const b = raw[i] as Point;
			const from = s;
			s += Math.hypot(b.x - a.x, b.y - a.y);
			if (i <= coilFrom || i >= coilTo) continue;
			const t = ((i - coilFrom) / 64) * Math.PI * 2;
			if (Math.cos(t) < 0) {
				for (let k = Math.floor(from / path.step); k <= Math.ceil(s / path.step) && k < path.count; k++) back[k] = 1;
			}
		}
	}

	// Keyframes must rise in both columns.
	const clean: [number, number][] = [];
	for (const [y, l] of keys) {
		const prev = clean[clean.length - 1];
		if (prev && (y <= prev[0] || l <= prev[1])) {
			if (l > prev[1]) clean.push([prev[0] + 1, l]);
			continue;
		}
		clean.push([y, l]);
	}
	return { path, back, hero, keys: clean, stages };
}

/** The drawn length the scroll position asks for. */
export function lengthAt(keys: [number, number][], y: number) {
	if (!keys.length) return 0;
	const first = keys[0] as [number, number];
	if (y <= first[0]) return first[1];
	for (let i = 1; i < keys.length; i++) {
		const [y1, l1] = keys[i] as [number, number];
		const [y0, l0] = keys[i - 1] as [number, number];
		if (y <= y1) return l0 + ((l1 - l0) * (y - y0)) / (y1 - y0);
	}
	return (keys[keys.length - 1] as [number, number])[1];
}
