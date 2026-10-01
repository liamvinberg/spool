import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createQuad, prefersReducedMotion, stepSpring } from "shared/ui/site/fresh/toy/gl";
import { layThread, lengthAtDepth, pointAt, type Segment, svgCubic, type Thread } from "./path";
import fragment from "./spool.glsl";

/** Radius of the wound thread, in spool units, from full to nearly bare. */
const FULL = 0.9;
const BARE = 0.42;
/** The camera's elevation in spool.glsl, which places the exit point on screen. */
const ELEVATION = 0.4;
/** Where the thread leaves the spool, as a height on the barrel in spool units. */
const EXIT_Y = 0.0;
/** Pixels per spool unit, as a share of the canvas width. */
const UNIT = 0.36;
/** The double running stitch: dash, gap. */
const DASH = 11;
const GAP = 8;

type Rope = { x: number[]; y: number[]; px: number[]; py: number[] };

function radiusAt(length: number, total: number) {
	const used = total > 0 ? Math.min(1, Math.max(0, length / total)) : 0;
	return Math.sqrt(FULL * FULL - (FULL * FULL - BARE * BARE) * used);
}

/**
 * The reel: a spool that stays with the reader and sews the page as it scrolls.
 * Scrolling pulls thread; dragging the spool reels the page.
 */
export function Reel({ children }: { children: ReactNode }) {
	const root = useRef<HTMLDivElement>(null);
	const spool = useRef<HTMLDivElement>(null);
	const canvas = useRef<HTMLCanvasElement>(null);
	const rope = useRef<HTMLCanvasElement>(null);
	const paths = useRef<(SVGPathElement | null)[]>([]);
	const knot = useRef<SVGCircleElement>(null);
	const [thread, setThread] = useState<Thread | null>(null);
	const threadRef = useRef<Thread | null>(null);
	const kick = useRef<() => void>(() => {});

	// Lay the thread through whatever the page measures as.
	useLayoutEffect(() => {
		const page = root.current;
		if (!page) return;
		const measure = () => {
			const origin = page.getBoundingClientRect();
			const top = origin.top;
			const stitches = [...page.querySelectorAll<HTMLElement>("[data-stitch]")].map((element) => {
				const rects = element.getClientRects();
				const last = rects[rects.length - 1] ?? element.getBoundingClientRect();
				const drop = Number(element.dataset.stitch || 0);
				return { left: last.left - origin.left, right: last.right - origin.left, y: last.bottom - top + drop };
			});
			const button = page.querySelector<HTMLElement>("[data-loop]")?.getBoundingClientRect();
			const loop = button
				? {
						left: button.left - origin.left,
						right: button.right - origin.left,
						top: button.top - top,
						bottom: button.bottom - top,
					}
				: null;
			const gutterAt = page.querySelector<HTMLElement>("[data-gutter]")?.getBoundingClientRect();
			const gutter = gutterAt ? gutterAt.left - origin.left : page.clientWidth - 40;
			const next = layThread(stitches, loop, gutter);
			threadRef.current = next;
			setThread(next);
			kick.current();
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(page);
		void document.fonts.ready.then(measure);
		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		const page = root.current;
		const holder = spool.current;
		const surface = canvas.current;
		const ropeCanvas = rope.current;
		if (!page || !holder || !surface || !ropeCanvas) return;
		const reduce = prefersReducedMotion();
		let quad: ReturnType<typeof createQuad> = null;
		try {
			quad = createQuad(surface, fragment, true);
			holder.dataset.backend = quad ? "webgl" : "fallback";
		} catch (error) {
			holder.dataset.backend = "fallback";
			console.warn("spool object unavailable:", error);
		}
		const context = ropeCanvas.getContext("2d");
		const sewn = [...page.querySelectorAll<HTMLElement>("[data-sew]")];

		const length = { x: 0, v: 0 };
		let angle = 0.6;
		let drawn = { angle: Number.NaN, radius: Number.NaN, width: 0 };
		let fling = 0;
		let raf = 0;
		let last = 0;
		let rest = 0;
		let grabbed = false;
		const cord: Rope = { x: [], y: [], px: [], py: [] };
		const LINKS = 22;

		const sizeCanvas = () => {
			const dpr = Math.min(window.devicePixelRatio || 1, 2);
			const box = holder.getBoundingClientRect();
			surface.width = Math.round(box.width * dpr);
			surface.height = Math.round(box.height * dpr);
			ropeCanvas.width = Math.round(window.innerWidth * dpr);
			ropeCanvas.height = Math.round(window.innerHeight * dpr);
			drawn = { angle: Number.NaN, radius: Number.NaN, width: 0 };
		};
		const exitPoint = (radius: number) => {
			const box = holder.getBoundingClientRect();
			const unit = box.width * UNIT;
			return {
				x: box.left + box.width / 2 - radius * unit + 1,
				y: box.top + box.height / 2 - EXIT_Y * Math.cos(ELEVATION) * unit,
			};
		};
		// The needle's line: the height on screen where the thread meets the page.
		const needleLine = () => exitPoint(FULL).y;

		const drawSpool = (radius: number) => {
			if (!quad) return;
			if (Math.abs(drawn.angle - angle) < 0.0005 && Math.abs(drawn.radius - radius) < 0.0002) return;
			const { gl } = quad;
			gl.uniform2f(quad.uniform("u_center"), surface.width / 2, surface.height / 2);
			gl.uniform1f(quad.uniform("u_scale"), surface.width * UNIT);
			gl.uniform1f(quad.uniform("u_rot"), angle);
			gl.uniform1f(quad.uniform("u_r"), radius);
			quad.draw();
			drawn = { angle, radius, width: surface.width };
		};

		const revealPath = (current: Thread, out: number) => {
			for (const [index, segment] of current.segments.entries()) {
				const path = paths.current[index];
				if (!path) continue;
				const visible = Math.min(segment.length, Math.max(0, out - segment.start));
				if (segment.kind === "pass") {
					const t = segment.length > 0 ? visible / segment.length : 0;
					const x = segment.a.x + (segment.b.x - segment.a.x) * t;
					path.setAttribute("d", visible > 0.5 ? `M${segment.a.x} ${segment.a.y}L${x} ${segment.a.y}` : "");
				} else {
					path.style.strokeDashoffset = String(segment.length - visible);
				}
			}
			knot.current?.setAttribute("r", out >= current.total - 1 ? "3.6" : "0");
			for (const [index, section] of sewn.entries()) {
				const mark = current.marks[index];
				const on = mark !== undefined && out >= mark - 2;
				if ((section.dataset.sewn === "true") !== on) section.dataset.sewn = String(on);
			}
		};

		const target = (current: Thread) => {
			const max = document.documentElement.scrollHeight - window.innerHeight;
			if (window.scrollY >= max - 2) return current.total;
			const offset = page.getBoundingClientRect().top + window.scrollY;
			const depth = window.scrollY + needleLine() - offset;
			// The headline is always sewn, both passes: that is the opening.
			const back = current.segments.find((segment) => segment.kind === "cubic" && segment.start > (current.marks[0] ?? 0));
			const opening = back ? back.start : 0;
			return Math.min(current.total, Math.max(lengthAtDepth(current, depth), opening));
		};

		const drawRope = (from: { x: number; y: number }, to: { x: number; y: number }, dt: number) => {
			if (!context) return 0;
			const dpr = ropeCanvas.width / Math.max(1, window.innerWidth);
			if (cord.x.length !== LINKS) {
				for (let i = 0; i < LINKS; i++) {
					const t = i / (LINKS - 1);
					const x = from.x + (to.x - from.x) * t;
					const y = from.y + (to.y - from.y) * t;
					cord.x[i] = x;
					cord.y[i] = y;
					cord.px[i] = x;
					cord.py[i] = y;
				}
			}
			const span = Math.hypot(to.x - from.x, to.y - from.y);
			const restLength = (span * 1.006 + 2) / (LINKS - 1);
			let energy = 0;
			if (reduce) {
				for (let i = 0; i < LINKS; i++) {
					const t = i / (LINKS - 1);
					cord.x[i] = from.x + (to.x - from.x) * t;
					cord.y[i] = from.y + (to.y - from.y) * t + Math.sin(Math.PI * t) * Math.min(14, span * 0.04);
				}
			} else {
				const h = Math.min(dt, 1 / 30);
				for (let i = 1; i < LINKS - 1; i++) {
					const vx = (cord.x[i] - cord.px[i]) * 0.975;
					const vy = (cord.y[i] - cord.py[i]) * 0.975;
					cord.px[i] = cord.x[i];
					cord.py[i] = cord.y[i];
					cord.x[i] += vx;
					cord.y[i] += vy + 1600 * h * h;
					energy += vx * vx + vy * vy;
				}
				cord.x[0] = from.x;
				cord.y[0] = from.y;
				cord.x[LINKS - 1] = to.x;
				cord.y[LINKS - 1] = to.y;
				for (let pass = 0; pass < 18; pass++) {
					for (let i = 0; i < LINKS - 1; i++) {
						const dx = cord.x[i + 1] - cord.x[i];
						const dy = cord.y[i + 1] - cord.y[i];
						const d = Math.hypot(dx, dy) || 0.0001;
						const push = (d - restLength) / d / 2;
						const ax = i === 0 ? 0 : 1;
						const bx = i + 1 === LINKS - 1 ? 0 : 1;
						const share = ax + bx || 1;
						cord.x[i] += (dx * push * 2 * ax) / share;
						cord.y[i] += (dy * push * 2 * ax) / share;
						cord.x[i + 1] -= (dx * push * 2 * bx) / share;
						cord.y[i + 1] -= (dy * push * 2 * bx) / share;
					}
				}
			}
			context.setTransform(dpr, 0, 0, dpr, 0, 0);
			context.clearRect(0, 0, window.innerWidth, window.innerHeight);
			context.lineCap = "round";
			context.lineJoin = "round";
			context.strokeStyle = "#f5391a";
			context.lineWidth = holder.clientWidth < 200 ? 1.6 : 2.2;
			context.beginPath();
			context.moveTo(cord.x[0], cord.y[0]);
			for (let i = 1; i < LINKS - 1; i++) {
				const mx = (cord.x[i] + cord.x[i + 1]) / 2;
				const my = (cord.y[i] + cord.y[i + 1]) / 2;
				context.quadraticCurveTo(cord.x[i], cord.y[i], mx, my);
			}
			context.lineTo(cord.x[LINKS - 1], cord.y[LINKS - 1]);
			context.stroke();
			return energy;
		};

		const frame = (stamp: number) => {
			raf = 0;
			const current = threadRef.current;
			if (!current) return;
			const dt = last ? Math.min((stamp - last) / 1000, 0.05) : 1 / 60;
			last = stamp;
			if (fling !== 0) {
				window.scrollBy(0, fling * dt);
				fling *= Math.exp(-dt * 3.2);
				if (Math.abs(fling) < 12) fling = 0;
			}
			const goal = target(current);
			const before = length.x;
			if (reduce) {
				length.x = goal;
				length.v = 0;
			} else {
				stepSpring(length, goal, dt, 140, 22);
				length.v = Math.max(-4200, Math.min(4200, length.v));
			}
			length.x = Math.max(0, Math.min(current.total, length.x));
			const radius = radiusAt(length.x, current.total);
			const unit = holder.clientWidth * UNIT;
			angle += (length.x - before) / Math.max(1, radius * unit);
			drawSpool(radius);
			revealPath(current, length.x);
			const offset = page.getBoundingClientRect();
			const tip = pointAt(current, length.x);
			const energy = drawRope(exitPoint(radius), { x: tip.x + offset.left, y: tip.y + offset.top }, dt);
			const settled = Math.abs(goal - length.x) < 0.3 && Math.abs(length.v) < 2 && fling === 0 && energy < 0.002 && !grabbed;
			rest = settled ? rest + 1 : 0;
			if (rest < 30) raf = window.requestAnimationFrame(frame);
			else last = 0;
		};
		const wake = () => {
			rest = 0;
			if (!raf) raf = window.requestAnimationFrame(frame);
		};
		kick.current = wake;

		// Reeling: drag across the spool to pull the page through.
		let lastPoint = { x: 0, y: 0, t: 0 };
		let speed = 0;
		const down = (event: PointerEvent) => {
			if (event.button !== 0) return;
			holder.setPointerCapture(event.pointerId);
			grabbed = true;
			fling = 0;
			speed = 0;
			holder.dataset.held = "true";
			lastPoint = { x: event.clientX, y: event.clientY, t: event.timeStamp };
			wake();
		};
		const move = (event: PointerEvent) => {
			if (!grabbed) return;
			const dx = event.clientX - lastPoint.x;
			const dy = event.clientY - lastPoint.y;
			const pull = Math.abs(dx) > Math.abs(dy) ? -dx : dy;
			const gain = 2.4;
			window.scrollBy(0, pull * gain);
			const elapsed = Math.max(1, event.timeStamp - lastPoint.t);
			speed = speed * 0.6 + ((pull * gain) / elapsed) * 1000 * 0.4;
			lastPoint = { x: event.clientX, y: event.clientY, t: event.timeStamp };
			wake();
		};
		const up = (event: PointerEvent) => {
			if (!grabbed) return;
			grabbed = false;
			holder.dataset.held = "false";
			if (holder.hasPointerCapture(event.pointerId)) holder.releasePointerCapture(event.pointerId);
			const idle = event.timeStamp - lastPoint.t;
			if (!reduce && idle < 90) fling = Math.max(-6000, Math.min(6000, speed));
			wake();
		};
		const key = (event: KeyboardEvent) => {
			const step = { ArrowDown: 160, ArrowRight: 160, ArrowUp: -160, ArrowLeft: -160 }[event.key];
			if (step === undefined) return;
			event.preventDefault();
			if (reduce) window.scrollBy(0, step);
			else fling += step * 5;
			wake();
		};
		const resize = () => {
			sizeCanvas();
			wake();
		};
		sizeCanvas();
		holder.addEventListener("pointerdown", down);
		holder.addEventListener("pointermove", move);
		holder.addEventListener("pointerup", up);
		holder.addEventListener("pointercancel", up);
		holder.addEventListener("keydown", key);
		window.addEventListener("scroll", wake, { passive: true });
		window.addEventListener("resize", resize);
		const observer = new ResizeObserver(resize);
		observer.observe(holder);
		wake();
		return () => {
			window.cancelAnimationFrame(raf);
			holder.removeEventListener("pointerdown", down);
			holder.removeEventListener("pointermove", move);
			holder.removeEventListener("pointerup", up);
			holder.removeEventListener("pointercancel", up);
			holder.removeEventListener("keydown", key);
			window.removeEventListener("scroll", wake);
			window.removeEventListener("resize", resize);
			observer.disconnect();
			quad?.dispose();
		};
	}, []);

	return (
		<div ref={root} className="reel-root">
			{children}
			<svg className="reel-sewn" width="100%" height="100%" aria-hidden="true">
				{thread?.segments.map((segment: Segment, index) =>
					segment.kind === "pass" ? (
						<path
							// biome-ignore lint/suspicious/noArrayIndexKey: segments are positional
							key={index}
							ref={(element) => {
								paths.current[index] = element;
							}}
							d=""
							strokeDasharray={segment.fill ? `${GAP + 0.8} ${DASH - 0.8}` : `${DASH} ${GAP}`}
							// The return pass lands its dashes in the first pass's gaps.
							strokeDashoffset={segment.fill ? 0.4 - (segment.length % (DASH + GAP)) : 0}
						/>
					) : (
						<path
							// biome-ignore lint/suspicious/noArrayIndexKey: segments are positional
							key={index}
							ref={(element) => {
								paths.current[index] = element;
							}}
							d={svgCubic(segment.p)}
							strokeDasharray={`${segment.length} ${segment.length + 40}`}
							strokeDashoffset={segment.length}
						/>
					),
				)}
				{thread && <circle ref={knot} cx={thread.end.x} cy={thread.end.y} r={0} className="reel-knot" />}
			</svg>
			<canvas ref={rope} className="reel-rope" aria-hidden="true" />
			<div
				ref={spool}
				className="reel-spool"
				role="slider"
				aria-label="Reel the page"
				aria-valuetext="Drag to reel the page"
				aria-valuenow={0}
				tabIndex={0}
				data-held="false"
			>
				<canvas ref={canvas} />
			</div>
		</div>
	);
}
