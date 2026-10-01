import { drawPly, fitCanvas, RED, tangents } from "shared/ui/site/fresh/thread/ply";

/**
 * One rope, stitched through the page. It comes off a spool, drops through the
 * full stop of each heading, hangs in the gaps between them, and ends in a
 * tag. Each visible stretch between two holes is a span of verlet points in
 * document coordinates. The rope resists stretching and never compression,
 * so slack falls into a catenary on its own.
 */

const REST = 10;
const GRAVITY = 0.32;
const DAMPING = 0.978;
const ITERATIONS = 22;
const MAX_UNSPOOL = 70;

type Span = {
	x: Float32Array;
	y: Float32Array;
	px: Float32Array;
	py: Float32Array;
	mass: Float32Array;
	count: number;
	/** the first point is always pinned; the last unless the span is the tail */
	free: boolean;
	rest: number;
	/** span 0 can pay out more rope from the spool */
	spool: boolean;
	pinA: { x: number; y: number };
	pinB: { x: number; y: number };
};

type Charm = {
	el: HTMLElement;
	span: number;
	at: number;
	length: number;
	angle: number;
	speed: number;
	lastX: number;
	lastY: number;
	vx: number;
	ax: number;
};

function makeSpan(a: { x: number; y: number }, b: { x: number; y: number }, slack: number, free = false, length?: number) {
	const distance = Math.hypot(b.x - a.x, b.y - a.y);
	const total = length ?? distance * slack;
	const count = Math.max(3, Math.round(total / REST) + 1);
	const span: Span = {
		x: new Float32Array(count + MAX_UNSPOOL),
		y: new Float32Array(count + MAX_UNSPOOL),
		px: new Float32Array(count + MAX_UNSPOOL),
		py: new Float32Array(count + MAX_UNSPOOL),
		mass: new Float32Array(count + MAX_UNSPOOL).fill(1),
		count,
		free,
		rest: total / (count - 1),
		spool: false,
		pinA: { ...a },
		pinB: { ...b },
	};
	for (let i = 0; i < count; i++) {
		const t = i / (count - 1);
		// a free tail starts hanging straight down; a pinned span starts taut and falls into its curve
		const x = free ? a.x : a.x + (b.x - a.x) * t;
		const y = free ? a.y + t * total : a.y + (b.y - a.y) * t;
		span.x[i] = span.px[i] = x;
		span.y[i] = span.py[i] = y;
	}
	return span;
}

export type RopeOptions = {
	page: HTMLElement;
	canvas: HTMLCanvasElement;
};

export function createRope({ page, canvas }: RopeOptions) {
	const ctx = canvas.getContext("2d");
	if (!ctx) return null;
	const still = window.matchMedia("(prefers-reduced-motion: reduce)");
	let spans: Span[] = [];
	let charms: Charm[] = [];
	let spool = { cx: 0, cy: 0, rx: 60, h: 160, turn: 0, paid: 0 };
	let holes: { x: number; y: number }[] = [];
	let raf = 0;
	let last = 0;
	let accumulator = 0;
	let calm = 0;
	let time = 0;
	let grab: { span: number; index: number; x: number; y: number } | null = null;
	let pointer = { x: -1e4, y: -1e4, inside: false };
	let disposed = false;
	let lastScroll = window.scrollY;
	let narrow = false;
	let winding = 0;

	const doc = (el: Element) => {
		const r = el.getBoundingClientRect();
		return { x: r.left + window.scrollX + r.width / 2, y: r.top + window.scrollY + r.height / 2, w: r.width, h: r.height };
	};

	const measure = () => {
		narrow = document.documentElement.clientWidth < 760;
		const spoolEl = page.querySelector("[data-spool]");
		const pins = [...page.querySelectorAll("[data-pin]")].map(doc);
		if (!spoolEl || pins.length < 2) return;
		const s = doc(spoolEl);
		spool = { ...spool, cx: s.x, cy: s.y, rx: s.w * 0.36, h: s.h * 0.62 };
		holes = pins.map((p) => ({ x: p.x, y: p.y }));
		const exit = { x: spool.cx + spool.rx, y: spool.cy + spool.h * 0.12 };
		const next: Span[] = [];
		const first = makeSpan(exit, holes[0] as { x: number; y: number }, narrow ? 1.5 : 1.42);
		first.spool = true;
		next.push(first);
		for (let i = 0; i < holes.length - 1; i++) {
			next.push(makeSpan(holes[i] as { x: number; y: number }, holes[i + 1] as { x: number; y: number }, 1.045));
		}
		const end = holes[holes.length - 1] as { x: number; y: number };
		next.push(makeSpan(end, end, 1, true, narrow ? 90 : 120));
		spans = next;

		charms = [...page.querySelectorAll<HTMLElement>("[data-charm]")].map((el) => {
			const [span = 0, at = 0.5] = (el.dataset.charm ?? "").split(":").map(Number);
			return { el, span, at, length: Number(el.dataset.length ?? 26), angle: 0, speed: 0, lastX: 0, lastY: 0, vx: 0, ax: 0 };
		});
		for (const charm of charms) {
			const span = spans[charm.span];
			if (!span) continue;
			const index = Math.round((span.count - 1) * charm.at);
			span.mass[index] = 2.6;
		}
		// Let every span below the opening view settle before anyone sees it.
		const view = window.scrollY + window.innerHeight;
		for (let k = 0; k < 360; k++) {
			for (const span of spans) {
				if (!still.matches && span.pinA.y < view && span.pinB.y < view + 40 && !span.free) continue;
				step(span, 1);
			}
		}
		if (still.matches) for (let k = 0; k < 400; k++) for (const span of spans) step(span, 1);
		for (const charm of charms) {
			const p = charmPoint(charm);
			charm.lastX = p.x;
			charm.lastY = p.y;
		}
		wake();
	};

	const charmPoint = (charm: Charm) => {
		const span = spans[charm.span];
		if (!span) return { x: 0, y: 0 };
		const index = Math.min(span.count - 1, Math.round((span.count - 1) * charm.at));
		return { x: span.x[index] ?? 0, y: span.y[index] ?? 0 };
	};

	function step(span: Span, wind: number) {
		const { x, y, px, py, mass } = span;
		const n = span.count;
		for (let i = 1; i < n; i++) {
			if (grab && spans[grab.span] === span && grab.index === i) continue;
			if (!span.free && i === n - 1) continue;
			const vx = (x[i]! - px[i]!) * DAMPING;
			const vy = (y[i]! - py[i]!) * DAMPING;
			px[i] = x[i]!;
			py[i] = y[i]!;
			const breeze = wind * Math.sin(time * 0.9 + i * 0.13 + span.pinA.y * 0.01) * 0.012;
			x[i] = x[i]! + vx + breeze;
			y[i] = y[i]! + vy + GRAVITY * Math.min(2, mass[i]!);
		}
		x[0] = span.pinA.x;
		y[0] = span.pinA.y;
		if (!span.free) {
			x[n - 1] = span.pinB.x;
			y[n - 1] = span.pinB.y;
		}
		if (grab && spans[grab.span] === span) {
			x[grab.index] = grab.x;
			y[grab.index] = grab.y;
		}
		const rest = span.rest;
		for (let k = 0; k < ITERATIONS; k++) {
			for (let i = 0; i < n - 1; i++) {
				const dx = x[i + 1]! - x[i]!;
				const dy = y[i + 1]! - y[i]!;
				const d = Math.hypot(dx, dy);
				if (d <= rest || d === 0) continue;
				const lockA = i === 0 || (grab && spans[grab.span] === span && grab.index === i);
				const lockB = (!span.free && i + 1 === n - 1) || (grab && spans[grab.span] === span && grab.index === i + 1);
				const diff = (d - rest) / d;
				if (lockA && lockB) continue;
				const share = lockA ? 1 : lockB ? 0 : 0.5;
				const cx = dx * diff;
				const cy = dy * diff;
				if (!lockA) {
					x[i] = x[i]! + cx * (1 - share);
					y[i] = y[i]! + cy * (1 - share);
				}
				if (!lockB) {
					x[i + 1] = x[i + 1]! - cx * share;
					y[i + 1] = y[i + 1]! - cy * share;
				}
			}
		}
	}

	/** The spool pays out rope while it is pulled hard, and winds it back once let go. */
	const reel = () => {
		const span = spans[0];
		if (!span) return;
		const dx = span.x[1]! - span.x[0]!;
		const dy = span.y[1]! - span.y[0]!;
		const strain = Math.hypot(dx, dy) / span.rest;
		if (grab && grab.span === 0 && strain > 1.25 && spool.paid < MAX_UNSPOOL) {
			// insert a point just off the spool
			for (let i = span.count; i > 1; i--) {
				span.x[i] = span.x[i - 1]!;
				span.y[i] = span.y[i - 1]!;
				span.px[i] = span.px[i - 1]!;
				span.py[i] = span.py[i - 1]!;
				span.mass[i] = span.mass[i - 1]!;
			}
			span.x[1] = span.px[1] = span.x[0]! + dx * 0.4;
			span.y[1] = span.py[1] = span.y[0]! + dy * 0.4;
			span.mass[1] = 1;
			span.count++;
			spool.paid++;
			spool.turn += span.rest / spool.rx;
			if (grab) grab.index++;
		} else if (!(grab && grab.span === 0) && spool.paid > 0 && ++winding % 2 === 0) {
			for (let i = 1; i < span.count - 1; i++) {
				span.x[i] = span.x[i + 1]!;
				span.y[i] = span.y[i + 1]!;
				span.px[i] = span.px[i + 1]!;
				span.py[i] = span.py[i + 1]!;
				span.mass[i] = span.mass[i + 1]!;
			}
			span.count--;
			spool.paid--;
			spool.turn -= span.rest / spool.rx;
		}
	};

	const energy = () => {
		let e = 0;
		for (const span of spans) {
			for (let i = 1; i < span.count; i++) {
				const vx = span.x[i]! - span.px[i]!;
				const vy = span.y[i]! - span.py[i]!;
				e = Math.max(e, vx * vx + vy * vy);
			}
		}
		return e;
	};

	const swingCharms = () => {
		for (const charm of charms) {
			const p = charmPoint(charm);
			const vx = p.x - charm.lastX;
			charm.ax = vx - charm.vx;
			charm.vx = vx;
			charm.lastX = p.x;
			charm.lastY = p.y;
			// a pendulum hung from the rope: gravity rights it, the rope's sideways jolts swing it
			const g = 0.5 / charm.length;
			charm.speed += -g * Math.sin(charm.angle) * 6 - (charm.ax * 0.9) / charm.length;
			charm.speed *= 0.9;
			charm.angle += charm.speed;
			charm.angle = Math.max(-1.1, Math.min(1.1, charm.angle));
		}
	};

	const smooth = (span: Span) => {
		// Catmull-Rom through the simulated points, about every 2.5px
		const n = span.count;
		const per = Math.max(2, Math.round(span.rest / 2.5));
		const count = (n - 1) * per + 1;
		const x = new Float32Array(count);
		const y = new Float32Array(count);
		let k = 0;
		for (let i = 0; i < n - 1; i++) {
			const x0 = span.x[Math.max(0, i - 1)]!;
			const y0 = span.y[Math.max(0, i - 1)]!;
			const x1 = span.x[i]!;
			const y1 = span.y[i]!;
			const x2 = span.x[i + 1]!;
			const y2 = span.y[i + 1]!;
			const x3 = span.x[Math.min(n - 1, i + 2)]!;
			const y3 = span.y[Math.min(n - 1, i + 2)]!;
			for (let j = 0; j < per; j++) {
				const t = j / per;
				const t2 = t * t;
				const t3 = t2 * t;
				x[k] = 0.5 * (2 * x1 + (-x0 + x2) * t + (2 * x0 - 5 * x1 + 4 * x2 - x3) * t2 + (-x0 + 3 * x1 - 3 * x2 + x3) * t3);
				y[k] = 0.5 * (2 * y1 + (-y0 + y2) * t + (2 * y0 - 5 * y1 + 4 * y2 - y3) * t2 + (-y0 + 3 * y1 - 3 * y2 + y3) * t3);
				k++;
			}
		}
		x[k] = span.x[n - 1]!;
		y[k] = span.y[n - 1]!;
		const { tx, ty } = tangents(x, y, count);
		return { step: 2.5, count, x, y, tx, ty };
	};

	const drawSpool = (c: CanvasRenderingContext2D, top: number, bottom: number) => {
		const { cx, cy, rx, h } = spool;
		if (cy + h < top - 100 || cy - h > bottom + 100) return;
		const flange = rx * 1.3;
		const fy = flange * 0.24;
		const y0 = cy - h / 2;
		const y1 = cy + h / 2;
		// bottom flange
		c.fillStyle = "#1a1918";
		c.strokeStyle = "#35322f";
		c.lineWidth = 1;
		c.beginPath();
		c.ellipse(cx, y1 + 6, flange, fy, 0, 0, Math.PI * 2);
		c.fill();
		c.stroke();
		// the wound barrel
		const barrel = c.createLinearGradient(cx - rx, 0, cx + rx, 0);
		barrel.addColorStop(0, "#5a1408");
		barrel.addColorStop(0.35, "#d8361a");
		barrel.addColorStop(0.55, "#f5391a");
		barrel.addColorStop(1, "#4a1006");
		c.fillStyle = barrel;
		c.fillRect(cx - rx, y0, rx * 2, h);
		// windings: a helix, so turning the spool walks its lines downwards
		const pitch = 4.2;
		const phase = (((spool.turn * pitch) / (Math.PI * 2)) * 3) % pitch;
		c.strokeStyle = "rgba(60,8,2,0.55)";
		c.lineWidth = 1;
		c.beginPath();
		for (let yy = y0 - pitch + ((phase + pitch) % pitch); yy < y1; yy += pitch) {
			c.moveTo(cx - rx, yy);
			c.quadraticCurveTo(cx, yy + rx * 0.16, cx + rx, yy - 1.5);
		}
		c.stroke();
		c.strokeStyle = "rgba(255,150,120,0.22)";
		c.beginPath();
		for (let yy = y0 - pitch + ((phase + pitch * 1.5) % pitch); yy < y1; yy += pitch) {
			c.moveTo(cx - rx * 0.5, yy + rx * 0.06);
			c.quadraticCurveTo(cx, yy + rx * 0.16, cx + rx * 0.3, yy + rx * 0.08);
		}
		c.stroke();
		// top flange, with three notches that show it turning
		c.fillStyle = "#1f1e1c";
		c.strokeStyle = "#3d3936";
		c.beginPath();
		c.ellipse(cx, y0 - 6, flange, fy, 0, 0, Math.PI * 2);
		c.fill();
		c.stroke();
		c.fillStyle = "#121110";
		c.beginPath();
		c.ellipse(cx, y0 - 6, flange * 0.16, fy * 0.16, 0, 0, Math.PI * 2);
		c.fill();
		c.fillStyle = "#57514c";
		for (let k = 0; k < 3; k++) {
			const a = spool.turn + (k * Math.PI * 2) / 3;
			const s = Math.sin(a);
			if (s < -0.1) continue;
			c.globalAlpha = 0.4 + s * 0.6;
			c.beginPath();
			c.ellipse(cx + Math.cos(a) * flange * 0.62, y0 - 6 + s * fy * 0.62, 2.2, 1.4, 0, 0, Math.PI * 2);
			c.fill();
		}
		c.globalAlpha = 1;
	};

	const paint = () => {
		const w = document.documentElement.clientWidth;
		const h = window.innerHeight;
		const ratio = fitCanvas(canvas, w, h);
		const top = window.scrollY;
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		ctx.setTransform(ratio, 0, 0, ratio, -window.scrollX * ratio, -top * ratio);
		drawSpool(ctx, top, top + h);
		const style = {
			width: narrow ? 3.2 : 4,
			core: RED.core,
			body: RED.body,
			light: RED.light,
			pitch: 4.5,
			fibres: true,
		};
		// strings to the tags, under the rope
		ctx.strokeStyle = "#c22d14";
		ctx.lineWidth = 1.2;
		ctx.beginPath();
		for (const charm of charms) {
			const p = charmPoint(charm);
			if (p.y < top - 200 || p.y > top + h + 200) continue;
			ctx.moveTo(p.x, p.y);
			ctx.lineTo(p.x + Math.sin(charm.angle) * charm.length, p.y + Math.cos(charm.angle) * charm.length);
		}
		ctx.stroke();
		for (const span of spans) {
			let lo = Number.POSITIVE_INFINITY;
			let hi = Number.NEGATIVE_INFINITY;
			for (let i = 0; i < span.count; i++) {
				lo = Math.min(lo, span.y[i]!);
				hi = Math.max(hi, span.y[i]!);
			}
			if (hi < top - 20 || lo > top + h + 20) continue;
			const path = smooth(span);
			drawPly(ctx, path, 0, (path.count - 1) * path.step, top, top + h, style);
		}
		// the holes, over the rope, so it reads as passing through the page
		for (const hole of holes) {
			if (hole.y < top - 20 || hole.y > top + h + 20) continue;
			const r = narrow ? 4.5 : 6.5;
			const g = ctx.createRadialGradient(hole.x, hole.y - r * 0.2, 0, hole.x, hole.y, r);
			g.addColorStop(0, "#030303");
			g.addColorStop(0.62, "#0a0a0a");
			g.addColorStop(1, "#2a2725");
			ctx.fillStyle = g;
			ctx.beginPath();
			ctx.arc(hole.x, hole.y, r, 0, Math.PI * 2);
			ctx.fill();
		}
		// place the tags
		for (const charm of charms) {
			const p = charmPoint(charm);
			const x = p.x + Math.sin(charm.angle) * charm.length;
			const y = p.y + Math.cos(charm.angle) * charm.length;
			charm.el.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) translateX(-50%) rotate(${(-charm.angle).toFixed(4)}rad)`;
		}
	};

	const tick = (now: number) => {
		raf = 0;
		if (disposed) return;
		const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60;
		last = now;
		accumulator += dt;
		const scroll = window.scrollY;
		const dy = scroll - lastScroll;
		lastScroll = scroll;
		if (!still.matches && dy !== 0) {
			// the page moves, the rope lags behind it a little
			const push = Math.max(-6, Math.min(6, dy * 0.05));
			for (const span of spans) for (let i = 1; i < span.count; i++) span.py[i] = span.py[i]! - push;
		}
		let steps = 0;
		while (accumulator >= 1 / 60 && steps < 4) {
			time += 1 / 60;
			for (const span of spans) step(span, still.matches ? 0 : 1);
			reel();
			swingCharms();
			accumulator -= 1 / 60;
			steps++;
		}
		if (steps === 4) accumulator = 0;
		paint();
		const moving = energy() > 0.0004 || grab || spool.paid > 0;
		calm = moving ? 0 : calm + 1;
		// The breeze keeps the opening drape alive; elsewhere the loop sleeps once still.
		const breezy = !still.matches && window.scrollY < window.innerHeight * 1.2;
		if (moving || calm < 30 || breezy) raf = window.requestAnimationFrame(tick);
		else last = 0;
	};
	function wake() {
		calm = 0;
		if (!raf && !disposed) raf = window.requestAnimationFrame(tick);
	}

	const nearest = (x: number, y: number, reach: number) => {
		let best: { span: number; index: number; d: number } | null = null;
		spans.forEach((span, s) => {
			for (let i = 1; i < span.count - (span.free ? 0 : 1); i++) {
				const d = Math.hypot(span.x[i]! - x, span.y[i]! - y);
				if (d < reach && (!best || d < best.d)) best = { span: s, index: i, d };
			}
		});
		return best as { span: number; index: number; d: number } | null;
	};

	const interactive = (target: EventTarget | null) =>
		target instanceof Element && !!target.closest("a, button, input, textarea, [data-charm]");

	const onDown = (event: PointerEvent) => {
		if (event.pointerType === "touch" || event.button !== 0 || interactive(event.target)) return;
		const x = event.clientX + window.scrollX;
		const y = event.clientY + window.scrollY;
		const hit = nearest(x, y, 28);
		if (!hit) return;
		event.preventDefault();
		grab = { span: hit.span, index: hit.index, x, y };
		document.documentElement.dataset.rope = "held";
		wake();
	};
	const onMove = (event: PointerEvent) => {
		const x = event.clientX + window.scrollX;
		const y = event.clientY + window.scrollY;
		const mx = x - pointer.x;
		const my = y - pointer.y;
		pointer = { x, y, inside: true };
		if (grab) {
			grab.x = x;
			grab.y = y;
			// past this the rope slips out of your fingers, except off the spool
			const span = spans[grab.span];
			if (span && grab.span !== 0) {
				let length = 0;
				for (let i = 1; i < span.count; i++) length += Math.hypot(span.x[i]! - span.x[i - 1]!, span.y[i]! - span.y[i - 1]!);
				if (length > span.rest * (span.count - 1) * 1.3) release();
			} else if (span && spool.paid >= MAX_UNSPOOL) {
				const d = Math.hypot(span.x[1]! - span.x[0]!, span.y[1]! - span.y[0]!);
				if (d > span.rest * 3) release();
			}
			wake();
			return;
		}
		if (event.pointerType === "touch") return;
		const hit = nearest(x, y, 22);
		document.documentElement.dataset.rope = hit ? "near" : "";
		// brushing past the rope plucks it
		const speed = Math.hypot(mx, my);
		if (speed > 1 && speed < 200) {
			let touched = false;
			for (const span of spans) {
				for (let i = 1; i < span.count - (span.free ? 0 : 1); i++) {
					const d = Math.hypot(span.x[i]! - x, span.y[i]! - y);
					if (d < 26) {
						const f = (1 - d / 26) * 0.35;
						span.px[i] = span.px[i]! - mx * f;
						span.py[i] = span.py[i]! - my * f;
						touched = true;
					}
				}
			}
			if (touched) wake();
		}
	};
	function release() {
		grab = null;
		document.documentElement.dataset.rope = "";
		wake();
	}
	const onScroll = () => wake();

	let size = "";
	const resize = new ResizeObserver(() => {
		const next = `${page.clientWidth}x${page.scrollHeight}`;
		if (next === size) return;
		size = next;
		measure();
	});
	resize.observe(page);
	window.addEventListener("pointerdown", onDown);
	window.addEventListener("pointermove", onMove, { passive: true });
	window.addEventListener("pointerup", release);
	window.addEventListener("pointercancel", release);
	window.addEventListener("blur", release);
	window.addEventListener("scroll", onScroll, { passive: true });
	window.addEventListener("resize", measure);
	still.addEventListener("change", measure);
	void document.fonts.ready.then(measure);
	measure();

	return {
		dispose() {
			disposed = true;
			window.cancelAnimationFrame(raf);
			resize.disconnect();
			window.removeEventListener("pointerdown", onDown);
			window.removeEventListener("pointermove", onMove);
			window.removeEventListener("pointerup", release);
			window.removeEventListener("pointercancel", release);
			window.removeEventListener("blur", release);
			window.removeEventListener("scroll", onScroll);
			window.removeEventListener("resize", measure);
			still.removeEventListener("change", measure);
			delete document.documentElement.dataset.rope;
		},
	};
}
