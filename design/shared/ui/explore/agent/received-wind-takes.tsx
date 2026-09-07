import { useId, useLayoutEffect, useRef } from "react";
import { ReceivedIndicator } from "shared/ui/explore/agent/received-indicator";
import "./received-wind-takes.css";

type Take = "joined" | "silk" | "feed" | "draw";
interface Point { x: number; y: number; at: number }
const smooth = (t: number) => t * t * (3 - 2 * t);
const xy = (point: Point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`;

/** One tapered shape, including the wind's bright end. */
function ribbon(points: Point[], width: number, endLength: number) {
	const distances = [0];
	let length = 0;
	for (let at = 1; at < points.length; at++) {
		const a = points[at - 1];
		const b = points[at];
		if (!a || !b) continue;
		length += Math.hypot(b.x - a.x, b.y - a.y);
		distances.push(length);
	}
	const left: Point[] = [];
	const right: Point[] = [];
	points.forEach((point, at) => {
		const before = points[Math.max(0, at - 1)] ?? point;
		const after = points[Math.min(points.length - 1, at + 1)] ?? point;
		const dx = after.x - before.x;
		const dy = after.y - before.y;
		const distance = Math.hypot(dx, dy) || 1;
		const along = distances[at] ?? 0;
		const body = Math.max(1, length - endLength);
		const radius = along < body ? .06 + .94 * (along / body) ** 1.7 : 1;
		const half = Math.min(width / 2, radius);
		left.push({ x: point.x - dy / distance * half, y: point.y + dx / distance * half, at: point.at });
		right.push({ x: point.x + dy / distance * half, y: point.y - dx / distance * half, at: point.at });
	});
	return `M${left.map(xy).join(" L")} L${right.reverse().map(xy).join(" L")} Z`;
}

/** Separate takes over the accepted replay; paragraphs and their entry motion belong to it. */
export function ReceivedWindTake({ take, history = false }: { take: Take; history?: boolean }) {
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
		let before = performance.now();
		let elapsed = -1;
		let position: Point | null = null;
		let velocity = { x: 0, y: 0 };
		let points: Point[] = [];
		let previousMark: HTMLElement | null = null;
		let draw: { at: number; from: number; left: number } | null = null;
		const paint = (now: number) => {
			frame = requestAnimationFrame(paint);
			const dt = Math.min(32, now - before) / 1000;
			before = now;
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
				previousMark = null;
				draw = null;
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
				previousMark = null;
				draw = null;
			}
			elapsed = nextElapsed;
			// A sweep starts only when the app actually releases a paragraph onto the screen.
			if (take === "draw" && previousMark && mark !== previousMark) {
				const paragraph = mark.closest("[data-agent-paragraph]")?.getBoundingClientRect();
				if (paragraph) draw = { at: now, from: position.x, left: paragraph.x - bounds.x + 15 };
			}
			previousMark = mark;
			const decay = Math.exp(-18 * dt);
			for (const axis of ["x", "y"] as const) {
				const distance = position[axis] - target[axis];
				const drift = velocity[axis] + 18 * distance;
				position[axis] = target[axis] + (distance + drift * dt) * decay;
				velocity[axis] = (velocity[axis] - 18 * drift * dt) * decay;
			}
			if (draw) {
				const age = now - draw.at;
				if (age < 160) position.x = draw.from + (draw.left - draw.from) * smooth(age / 160);
				else if (age < 500) position.x = draw.left + (target.x - draw.left) * smooth((age - 160) / 340);
				else draw = null;
				velocity.x = 0;
			}
			points.push({ x: position.x, y: position.y, at: now });
			points = points.filter(point => now - point.at < (take === "silk" ? 280 : 220));
			const limit = take === "silk" ? 110 : take === "draw" ? 130 : 80;
			let length = 0;
			for (let at = points.length - 1; at > 0; at--) {
				const a = points[at];
				const b = points[at - 1];
				if (!a || !b) continue;
				const distance = Math.hypot(a.x - b.x, a.y - b.y);
				if (length + distance > limit) {
					const fraction = (limit - length) / distance;
					points = [{ x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction, at: b.at }, ...points.slice(at)];
					length = limit;
					break;
				}
				length += distance;
			}
			const opacity = Number(getComputedStyle(mark).opacity);
			const windLeft = position.x + ink.x - anchor.x - anchor.width / 2;
			const windRight = windLeft + ink.width;
			const tail = points[0] ?? position;
			const moving = length > 1;
			const goingLeft = moving && tail.x > position.x;
			// Attach inside the actual visible wind, including when it shrinks or reverses direction.
			const join = { x: goingLeft ? windRight - Math.min(1, ink.width / 2) : windLeft + Math.min(1, ink.width / 2), y: position.y, at: now };
			const tip = { x: goingLeft ? windLeft : windRight, y: position.y, at: now };
			const visible = Math.min(1, ink.width / 2);
			let path = "";
			let start = tail;
			let strength = Math.min(1, length / 10);
			if (take === "silk") {
				const centreline = moving ? [...points.slice(0, -1), join, tip] : [{ x: windLeft, y: position.y, at: now }, { x: windRight, y: position.y, at: now }];
				path = ribbon(centreline, 2, ink.width);
				start = centreline[0] ?? join;
				strength = 1;
			} else if (moving) {
				const history = points.slice(0, -1);
				const end = history.at(-1) ?? tail;
				const approach = join.x + (goingLeft ? 8 : -8);
				path = `${history.map((point, at) => `${at ? "L" : "M"}${xy(point)}`).join(" ")} C${end.x},${end.y} ${approach},${join.y} ${xy(join)}`;
			} else if (take === "feed") {
				// This little attached curl breathes with the received wind's own phase.
				const reach = 7 + ink.width * 1.2;
				start = { x: join.x - reach, y: join.y + 2, at: now };
				path = `M${xy(start)} C${start.x + reach * .35},${join.y + 4} ${join.x - reach * .3},${join.y - 3} ${xy(join)}`;
				strength = .75;
			}
			head.current.setAttribute("visibility", take === "silk" ? "hidden" : "visible");
			head.current.setAttribute("x", String(windLeft));
			head.current.setAttribute("y", String(position.y - 1));
			head.current.setAttribute("width", String(ink.width));
			head.current.setAttribute("opacity", String(opacity));
			thread.current.setAttribute("d", path);
			thread.current.setAttribute("opacity", String(opacity * visible * strength));
			gradient.current.setAttribute("x1", String(start.x));
			gradient.current.setAttribute("y1", String(start.y));
			gradient.current.setAttribute("x2", String(tip.x));
			gradient.current.setAttribute("y2", String(tip.y));
			clip.current.setAttribute("x", String(view.x - bounds.x));
			clip.current.setAttribute("y", String(view.y - bounds.y));
			clip.current.setAttribute("width", String(view.width));
			clip.current.setAttribute("height", String(view.height));
		};
		frame = requestAnimationFrame(paint);
		return () => cancelAnimationFrame(frame);
	}, [take]);
	return (
		<div ref={root} data-wind-take={take} className="received-wind-take">
			<ReceivedIndicator take="wind" history={history} />
			<svg className="received-wind-take-overlay" aria-hidden="true">
				<defs>
					<linearGradient ref={gradient} id={`${id}-ink`} gradientUnits="userSpaceOnUse"><stop stopColor="var(--color-text)" stopOpacity="0" /><stop offset=".78" stopColor="var(--color-text)" stopOpacity={take === "silk" ? ".6" : ".38"} /><stop offset="1" stopColor="var(--color-text)" stopOpacity="1" /></linearGradient>
					<clipPath id={`${id}-view`}><rect ref={clip} /></clipPath>
				</defs>
				<g clipPath={`url(#${id}-view)`}>
					<path ref={thread} data-wind-thread="" fill={take === "silk" ? `url(#${id}-ink)` : "none"} stroke={take === "silk" ? "none" : `url(#${id}-ink)`} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
					<rect ref={head} data-wind-head="" height="2" rx="1" fill="var(--color-text)" visibility="hidden" />
				</g>
			</svg>
		</div>
	);
}
