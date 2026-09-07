import { useId, useLayoutEffect, useRef } from "react";
import { ReceivedIndicator } from "shared/ui/explore/agent/received-indicator";
import "./received-wind-thread.css";

interface Point { x: number; y: number; at: number }

/** The accepted wind stays the source. Only its journey between paragraphs is drawn here. */
export function ReceivedWindThread({ history = false }: { history?: boolean }) {
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
				return;
			}
			const bounds = container.getBoundingClientRect();
			const view = viewport.getBoundingClientRect();
			const anchor = track.getBoundingClientRect();
			const ink = strand.getBoundingClientRect();
			// Follow the marker as the paragraph opens, keeping its journey above the composer.
			const target = {
				x: anchor.x - bounds.x + anchor.width / 2,
				y: Math.min(anchor.y + 1, view.bottom - 8) - bounds.y,
			};
			const nextElapsed = Number(preview?.dataset.sourceElapsed ?? 0);
			if (position === null || nextElapsed < elapsed) {
				position = { ...target, at: now };
				velocity = { x: 0, y: 0 };
				points = [];
			}
			elapsed = nextElapsed;
			// A damped follow preserves velocity as the app's existing paragraph animation opens.
			const decay = Math.exp(-18 * dt);
			for (const axis of ["x", "y"] as const) {
				const distance = position[axis] - target[axis];
				const drift = velocity[axis] + 18 * distance;
				position[axis] = target[axis] + (distance + drift * dt) * decay;
				velocity[axis] = (velocity[axis] - 18 * drift * dt) * decay;
			}
			points.push({ x: position.x, y: position.y, at: now });
			points = points.filter(point => now - point.at < 220);
			let length = 0;
			for (let at = points.length - 1; at > 0; at--) {
				const a = points[at];
				const b = points[at - 1];
				if (!a || !b) continue;
				const distance = Math.hypot(a.x - b.x, a.y - b.y);
				if (length + distance > 90) {
					const fraction = (90 - length) / distance;
					points = [{ x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction, at: b.at }, ...points.slice(at)];
					length = 90;
					break;
				}
				length += distance;
			}
			const tail = points[0] ?? position;
			const opacity = getComputedStyle(mark).opacity;
			head.current.setAttribute("visibility", "visible");
			head.current.setAttribute("x", String(position.x + ink.x - anchor.x - anchor.width / 2));
			head.current.setAttribute("y", String(position.y - 1));
			head.current.setAttribute("width", String(ink.width));
			head.current.setAttribute("opacity", opacity);
			thread.current.setAttribute("d", length > .5 ? points.map((point, at) => `${at === 0 ? "M" : "L"}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ") : "");
			thread.current.setAttribute("opacity", String(Math.min(1, length / 8) * Number(opacity)));
			gradient.current.setAttribute("x1", String(tail.x));
			gradient.current.setAttribute("y1", String(tail.y));
			gradient.current.setAttribute("x2", String(position.x));
			gradient.current.setAttribute("y2", String(position.y));
			clip.current.setAttribute("x", String(view.x - bounds.x));
			clip.current.setAttribute("y", String(view.y - bounds.y));
			clip.current.setAttribute("width", String(view.width));
			clip.current.setAttribute("height", String(view.height));
		};
		frame = requestAnimationFrame(paint);
		return () => cancelAnimationFrame(frame);
	}, []);
	return (
		<div ref={root} className="received-wind-thread">
			<ReceivedIndicator take="wind" history={history} />
			<svg className="received-wind-thread-overlay" aria-hidden="true">
				<defs>
					<linearGradient ref={gradient} id={`${id}-ink`} gradientUnits="userSpaceOnUse"><stop stopColor="var(--color-text)" stopOpacity="0" /><stop offset="1" stopColor="var(--color-text)" stopOpacity=".45" /></linearGradient>
					<clipPath id={`${id}-view`}><rect ref={clip} /></clipPath>
				</defs>
				<g clipPath={`url(#${id}-view)`}>
					<path ref={thread} data-wind-thread="" fill="none" stroke={`url(#${id}-ink)`} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
					<rect ref={head} data-wind-head="" height="2" rx="1" fill="var(--color-text)" visibility="hidden" />
				</g>
			</svg>
		</div>
	);
}
