import { useId, useLayoutEffect, useRef } from "react";
import { ReceivedIndicator } from "shared/ui/explore/agent/received-indicator";
import "./received-wind-takes.css";

interface Point { x: number; y: number; at: number }
const mix = (from: number, to: number, amount: number) => from + (to - from) * amount;
const smooth = (amount: number) => amount * amount * (3 - 2 * amount);
const xy = (point: Point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`;

/** Feed gathers into a travelling dot, then opens back into the received wind at rest. */
export function ReceivedWindMorph({ history = false }: { history?: boolean }) {
	const root = useRef<HTMLDivElement>(null);
	const head = useRef<SVGRectElement>(null);
	const thread = useRef<SVGPathElement>(null);
	const clip = useRef<SVGRectElement>(null);
	const gradient = useRef<SVGLinearGradientElement>(null);
	const id = useId();
	useLayoutEffect(() => {
		const container = root.current;
		if (!container) return;
		let frame = 0;
		let previous = performance.now();
		let elapsed = -1;
		let position: Point | null = null;
		let velocity = { x: 0, y: 0 };
		let points: Point[] = [];
		let morph = 0;
		const paint = (now: number) => {
			frame = requestAnimationFrame(paint);
			const dt = Math.min(32, now - previous) / 1000;
			previous = now;
			const mark = container.querySelector<HTMLElement>("[data-received-marker]");
			const track = mark?.querySelector<HTMLElement>(".received-track");
			const strand = mark?.querySelector<HTMLElement>(".received-strand");
			const viewport = container.querySelector<HTMLElement>(".received-preview > .pages-scrollbar");
			const preview = container.querySelector<HTMLElement>("[data-source-elapsed]");
			if (!mark || !track || !strand || !viewport || !head.current || !thread.current || !clip.current || !gradient.current) {
				head.current?.setAttribute("visibility", "hidden");
				thread.current?.setAttribute("d", "");
				position = null;
				points = [];
				morph = 0;
				return;
			}
			const bounds = container.getBoundingClientRect();
			const view = viewport.getBoundingClientRect();
			const anchor = track.getBoundingClientRect();
			const ink = strand.getBoundingClientRect();
			const target = { x: anchor.x - bounds.x + anchor.width / 2, y: Math.min(anchor.y + 1, view.bottom - 8) - bounds.y };
			const nextElapsed = Number(preview?.dataset.sourceElapsed ?? 0);
			if (position === null || nextElapsed < elapsed) {
				position = { ...target, at: now };
				velocity = { x: 0, y: 0 };
				points = [];
				morph = 0;
			}
			elapsed = nextElapsed;
			// Shape follows the journey, so received chunks never trigger a decorative dot pulse.
			const distance = Math.hypot(target.x - position.x, target.y - position.y);
			const speed = Math.hypot(velocity.x, velocity.y);
			const travelling = smooth(Math.min(1, Math.max(distance / 24, speed / 150)));
			morph += (travelling - morph) * (1 - Math.exp(-dt / (travelling > morph ? .055 : .12)));
			if (morph < .001 && travelling < .001) morph = 0;
			const round = smooth(morph);
			// Gathering the line and accelerating its travel overlap rather than cutting between states.
			const follow = mix(5, 18, round);
			const decay = Math.exp(-follow * dt);
			for (const axis of ["x", "y"] as const) {
				const delta = position[axis] - target[axis];
				const drift = velocity[axis] + follow * delta;
				position[axis] = target[axis] + (delta + drift * dt) * decay;
				velocity[axis] = (velocity[axis] - follow * drift * dt) * decay;
				if (Math.abs(position[axis] - target[axis]) < .01 && Math.abs(velocity[axis]) < .1) {
					position[axis] = target[axis];
					velocity[axis] = 0;
				}
			}
			points.push({ x: position.x, y: position.y, at: now });
			points = points.filter(point => now - point.at < 220);
			let length = 0;
			for (let at = points.length - 1; at > 0; at--) {
				const a = points[at];
				const b = points[at - 1];
				if (!a || !b) continue;
				const distance = Math.hypot(a.x - b.x, a.y - b.y);
				if (length + distance > 80) {
					const fraction = (80 - length) / distance;
					points = [{ x: mix(a.x, b.x, fraction), y: mix(a.y, b.y, fraction), at: b.at }, ...points.slice(at)];
					length = 80;
					break;
				}
				length += distance;
			}
			const width = mix(ink.width, 4, round);
			const height = mix(2, 4, round);
			const windOffset = ink.x - anchor.x + ink.width / 2 - anchor.width / 2;
			const centre = { x: position.x + windOffset * (1 - round), y: position.y, at: now };
			const tail = points[0] ?? position;
			const moving = smooth(Math.min(1, length / 12));
			const behind = points.at(-2) ?? tail;
			const dx = behind.x - centre.x;
			const dy = behind.y - centre.y;
			const magnitude = Math.hypot(dx, dy) || 1;
			// The thread meets the curved travelling head; it returns to Feed's left edge as it settles.
			const join = {
				x: mix(centre.x - width / 2 + Math.min(1, width / 2), centre.x + dx / magnitude * Math.max(0, width / 2 - .3), moving),
				y: mix(centre.y, centre.y + dy / magnitude * (height / 2 - .3), moving),
				at: now,
			};
			const reach = 7 + ink.width * 1.2;
			const curve: Point[] = [];
			for (let at = 0; at <= 16; at++) {
				const t = at / 16;
				const u = 1 - t;
				const idle = {
					x: u ** 3 * (join.x - reach) + 3 * u * u * t * (join.x - reach * .65) + 3 * u * t * t * (join.x - reach * .3) + t ** 3 * join.x,
					y: u ** 3 * (join.y + 2) + 3 * u * u * t * (join.y + 4) + 3 * u * t * t * (join.y - 3) + t ** 3 * join.y,
				};
				const index = t * (points.length - 1);
				const a = points[Math.floor(index)] ?? position;
				const b = points[Math.ceil(index)] ?? position;
				const fraction = index % 1;
				const trail = { x: mix(a.x, b.x, fraction), y: mix(a.y, b.y, fraction) };
				const attach = smooth(Math.max(0, (t - .75) * 4));
				curve.push({ x: mix(idle.x, mix(trail.x, join.x, attach), moving), y: mix(idle.y, mix(trail.y, join.y, attach), moving), at: now });
			}
			const opacity = Number(getComputedStyle(mark).opacity);
			head.current.setAttribute("visibility", "visible");
			head.current.setAttribute("x", String(centre.x - width / 2));
			head.current.setAttribute("y", String(centre.y - height / 2));
			head.current.setAttribute("width", String(width));
			head.current.setAttribute("height", String(height));
			head.current.setAttribute("rx", String(height / 2));
			head.current.setAttribute("opacity", String(opacity));
			thread.current.setAttribute("d", curve.map((point, at) => `${at ? "L" : "M"}${xy(point)}`).join(" "));
			thread.current.setAttribute("opacity", String(opacity * mix(Math.min(1, ink.width / 2), 1, round) * mix(.75, 1, moving)));
			const start = curve[0] ?? join;
			gradient.current.setAttribute("x1", String(start.x));
			gradient.current.setAttribute("y1", String(start.y));
			gradient.current.setAttribute("x2", String(centre.x));
			gradient.current.setAttribute("y2", String(centre.y));
			clip.current.setAttribute("x", String(view.x - bounds.x));
			clip.current.setAttribute("y", String(view.y - bounds.y));
			clip.current.setAttribute("width", String(view.width));
			clip.current.setAttribute("height", String(view.height));
		};
		frame = requestAnimationFrame(paint);
		return () => cancelAnimationFrame(frame);
	}, []);
	return (
		<div ref={root} data-wind-take="morph" className="received-wind-take">
			<ReceivedIndicator take="wind" history={history} />
			<svg className="received-wind-take-overlay" aria-hidden="true">
				<defs>
					<linearGradient ref={gradient} id={`${id}-ink`} gradientUnits="userSpaceOnUse"><stop stopColor="var(--color-text)" stopOpacity="0" /><stop offset=".78" stopColor="var(--color-text)" stopOpacity=".38" /><stop offset="1" stopColor="var(--color-text)" stopOpacity="1" /></linearGradient>
					<clipPath id={`${id}-view`}><rect ref={clip} /></clipPath>
				</defs>
				<g clipPath={`url(#${id}-view)`}>
					<path ref={thread} data-wind-thread="" fill="none" stroke={`url(#${id}-ink)`} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
					<rect ref={head} data-wind-head="" fill="var(--color-text)" visibility="hidden" />
				</g>
			</svg>
		</div>
	);
}
