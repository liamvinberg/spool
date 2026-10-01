/* A thread hung between pins: a verlet chain per span, gravity, and a little
 * slack so it sags like the real thing. Pins are read from the page every
 * frame, so when a note is dragged its pin moves and the thread swings after
 * it. The loop sleeps once nothing has moved for a while. */

export type Point = { x: number; y: number };

type Node = { x: number; y: number; px: number; py: number };

const LINKS = 22;
const SLACK = 0.03;
const GRAVITY = 0.32;
const DAMPING = 0.955;
const ITERATIONS = 24;

export function createThread(read: () => Point[], draw: (d: string, pins: Point[]) => void) {
	let spans: Node[][] = [];
	let frame = 0;
	let quiet = 0;
	let last = 0;

	const build = (pins: Point[]) => {
		spans = [];
		for (let s = 0; s < pins.length - 1; s++) {
			const a = pins[s];
			const b = pins[s + 1];
			const chain: Node[] = [];
			for (let i = 0; i <= LINKS; i++) {
				const t = i / LINKS;
				const x = a.x + (b.x - a.x) * t;
				const y = a.y + (b.y - a.y) * t;
				chain.push({ x, y, px: x, py: y });
			}
			spans.push(chain);
		}
	};

	const step = (pins: Point[]) => {
		let moved = 0;
		for (let s = 0; s < spans.length; s++) {
			const chain = spans[s];
			const a = pins[s];
			const b = pins[s + 1];
			const span = Math.hypot(b.x - a.x, b.y - a.y) || 1;
			/* slack only where the thread can sag sideways; a plumb span hangs straight instead of looping under its pin */
			const lean = ((b.x - a.x) / span) ** 2;
			const rest = (span * (1 + SLACK * lean)) / LINKS;
			for (let i = 1; i < chain.length - 1; i++) {
				const n = chain[i];
				const vx = (n.x - n.px) * DAMPING;
				const vy = (n.y - n.py) * DAMPING;
				n.px = n.x;
				n.py = n.y;
				n.x += vx;
				n.y += vy + GRAVITY;
			}
			for (let k = 0; k < ITERATIONS; k++) {
				chain[0].x = a.x;
				chain[0].y = a.y;
				chain[chain.length - 1].x = b.x;
				chain[chain.length - 1].y = b.y;
				for (let i = 0; i < chain.length - 1; i++) {
					const p = chain[i];
					const q = chain[i + 1];
					const dx = q.x - p.x;
					const dy = q.y - p.y;
					const dist = Math.hypot(dx, dy) || 0.0001;
					const diff = (dist - rest) / dist / 2;
					const ox = dx * diff;
					const oy = dy * diff;
					if (i > 0) {
						p.x += ox;
						p.y += oy;
					}
					if (i + 1 < chain.length - 1) {
						q.x -= ox;
						q.y -= oy;
					}
				}
			}
			for (let i = 1; i < chain.length - 1; i++) {
				const n = chain[i];
				moved = Math.max(moved, Math.abs(n.x - n.px) + Math.abs(n.y - n.py));
			}
		}
		return moved;
	};

	const path = () => {
		let d = "";
		for (let s = 0; s < spans.length; s++) {
			const c = spans[s];
			if (s === 0) d += `M${c[0].x.toFixed(2)} ${c[0].y.toFixed(2)}`;
			for (let i = 1; i < c.length - 1; i++) {
				const mx = (c[i].x + c[i + 1].x) / 2;
				const my = (c[i].y + c[i + 1].y) / 2;
				d += `Q${c[i].x.toFixed(2)} ${c[i].y.toFixed(2)} ${mx.toFixed(2)} ${my.toFixed(2)}`;
			}
			const end = c[c.length - 1];
			d += `L${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
		}
		return d;
	};

	const tick = (now: number) => {
		const pins = read();
		if (pins.length - 1 !== spans.length) build(pins);
		const steps = last ? Math.min(3, Math.max(1, Math.round((now - last) / 16.7))) : 1;
		last = now;
		let moved = 0;
		for (let i = 0; i < steps; i++) moved = Math.max(moved, step(pins));
		draw(path(), pins);
		quiet = moved < 0.02 ? quiet + 1 : 0;
		frame = quiet > 45 ? 0 : requestAnimationFrame(tick);
		if (!frame) last = 0;
	};

	return {
		/* Hang the thread at rest before anyone sees it. */
		settle() {
			const pins = read();
			build(pins);
			for (let i = 0; i < 400; i++) step(pins);
			draw(path(), pins);
		},
		wake() {
			quiet = 0;
			if (!frame) frame = requestAnimationFrame(tick);
		},
		stop() {
			cancelAnimationFrame(frame);
			frame = 0;
		},
		/* Arc length from the first pin to each pin, as a share of the whole. */
		reach(): number[] {
			const lengths = spans.map((c) => {
				let l = 0;
				for (let i = 0; i < c.length - 1; i++) l += Math.hypot(c[i + 1].x - c[i].x, c[i + 1].y - c[i].y);
				return l;
			});
			const total = lengths.reduce((a, b) => a + b, 0) || 1;
			let run = 0;
			return [0, ...lengths.map((l) => (run += l) / total)];
		},
	};
}
