import { useId, useLayoutEffect, useRef } from "react";
import { ReceivedIndicator } from "shared/ui/explore/agent/received-indicator";
import "./received-wind-takes.css";

type Take = "seed" | "comet" | "lens" | "fold" | "pair" | "orbit" | "tide" | "margin" | "wound" | "tension" | "stitch";
interface Point { x: number; y: number; at: number }
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => t * t * (3 - 2 * t);
const xy = (p: Point) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
const attrs = (node: SVGElement, values: Record<string, string | number>) => {
	for (const [key, value] of Object.entries(values)) node.setAttribute(key, String(value));
};

/** Live-edge ideas over the same received text and app paragraph motion, including Spool's thread gestures. */
export function ReceivedDirection({ take, history = false }: { take: Take; history?: boolean }) {
	const root = useRef<HTMLDivElement>(null);
	const ink = useRef<SVGGElement>(null);
	const shape = useRef<SVGPathElement>(null);
	const detail = useRef<SVGPathElement>(null);
	const first = useRef<SVGCircleElement>(null);
	const second = useRef<SVGCircleElement>(null);
	const body = useRef<SVGRectElement>(null);
	const trail = useRef<SVGPathElement>(null);
	const gradient = useRef<SVGLinearGradientElement>(null);
	const clip = useRef<SVGRectElement>(null);
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
			if (!mark || !track || !strand || !viewport || !ink.current || !clip.current || !shape.current || !detail.current || !first.current || !second.current || !body.current || !gradient.current) {
				ink.current?.setAttribute("visibility", "hidden");
				trail.current?.setAttribute("d", "");
				position = null;
				points = [];
				morph = 0;
				return;
			}
			const bounds = container.getBoundingClientRect();
			const view = viewport.getBoundingClientRect();
			const anchor = track.getBoundingClientRect();
			const wind = strand.getBoundingClientRect();
			const paragraph = mark.closest("[data-agent-paragraph]")?.getBoundingClientRect();
			const target = take === "margin"
				? { x: view.x - bounds.x + 7, y: Math.max(view.y + 8, Math.min(paragraph ? paragraph.y + Math.min(14, paragraph.height / 2) : anchor.y + 1, view.bottom - 8)) - bounds.y }
				: { x: anchor.x - bounds.x + anchor.width / 2, y: Math.min(anchor.y + 1, view.bottom - 8) - bounds.y };
			const nextElapsed = Number(preview?.dataset.sourceElapsed ?? 0);
			if (position === null || nextElapsed < elapsed) {
				position = { ...target, at: now };
				velocity = { x: 0, y: 0 };
				points = [];
				morph = 0;
			}
			elapsed = nextElapsed;
			const distance = Math.hypot(target.x - position.x, target.y - position.y);
			const speed = Math.hypot(velocity.x, velocity.y);
			const travelling = smooth(Math.min(1, Math.max(distance / 24, speed / 150)));
			morph += (travelling - morph) * (1 - Math.exp(-dt / (travelling > morph ? .055 : .12)));
			if (morph < .001 && travelling < .001) morph = 0;
			const round = smooth(morph);
			const follow = mix(5, 18, Math.max(round, 1 - smooth(Math.min(1, distance / 24))));
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
			// The accepted wind's clock already eases with received text and stops when input pauses.
			const phase = Number(strand.getAnimations()[0]?.currentTime ?? 0) / 1600 * Math.PI * 2;
			const pulse = (1 + Math.sin(phase)) / 2;
			const x = position.x;
			const y = position.y;
			attrs(ink.current, { visibility: "visible", opacity: getComputedStyle(mark).opacity });
			attrs(clip.current, { x: view.x - bounds.x, y: view.y - bounds.y, width: view.width, height: view.height });
			if (take === "seed" || take === "comet") {
				const width = mix(wind.width, 4, round);
				const height = mix(2, 4, round);
				const offset = wind.x - anchor.x + wind.width / 2 - anchor.width / 2;
				const centre = { x: x + offset * (1 - round), y, at: now };
				attrs(body.current, { x: centre.x - width / 2, y: y - height / 2, width, height, rx: height / 2 });
				if (take === "comet" && trail.current) {
					points.push({ x, y, at: now });
					points = points.filter(p => now - p.at < 140);
					let length = 0;
					for (let at = points.length - 1; at > 0; at--) {
						const a = points[at];
						const b = points[at - 1];
						if (!a || !b) continue;
						const span = Math.hypot(a.x - b.x, a.y - b.y);
						if (length + span > 40) {
							const t = (40 - length) / span;
							points = [{ x: mix(a.x, b.x, t), y: mix(a.y, b.y, t), at: b.at }, ...points.slice(at)];
							length = 40;
							break;
						}
						length += span;
					}
					const tail = points[0] ?? position;
					const behind = points.at(-2) ?? tail;
					const dx = behind.x - centre.x;
					const dy = behind.y - centre.y;
					const magnitude = Math.hypot(dx, dy) || 1;
					const join = { x: centre.x + dx / magnitude * Math.max(0, width / 2 - .3), y: y + dy / magnitude * (height / 2 - .3), at: now };
					const path = [...points.slice(0, -1), join];
					attrs(trail.current, { d: length > .5 ? path.map((p, at) => `${at ? "L" : "M"}${xy(p)}`).join(" ") : "", opacity: smooth(Math.min(1, length / 10)) * round });
					attrs(gradient.current, { x1: tail.x, y1: tail.y, x2: centre.x, y2: centre.y });
				}
			} else if (take === "lens") {
				const radius = mix(3.5 + pulse, 1.5, round);
				attrs(first.current, { cx: x, cy: y, r: radius, fill: "none", stroke: "var(--color-text)", "stroke-width": mix(1, 2.5, round) });
				attrs(second.current, { cx: x, cy: y, r: mix(.6 + pulse * .4, 1, round), opacity: mix(.45, 1, round) });
			} else if (take === "fold") {
				const half = mix(5, 2.5, round);
				const rise = mix(.8 + pulse * 1.2, 3.5, round);
				attrs(shape.current, { d: `M${x-half},${y} L${x},${y-rise} L${x+half},${y} L${x},${y+rise} Z`, fill: "var(--color-text)", opacity: .9 });
				attrs(detail.current, { d: `M${x},${y-rise} L${x},${y+rise}`, stroke: "var(--color-bg)", "stroke-width": .65, opacity: .65 });
			} else if (take === "pair") {
				const gap = (3 + pulse * 1.5) * (1 - round);
				const lift = Math.sin(phase) * (1 - round) * 1.2;
				attrs(first.current, { cx: x - gap, cy: y - lift, r: mix(1.5, 2, round) });
				attrs(second.current, { cx: x + gap, cy: y + lift, r: mix(1.5, 2, round) });
			} else if (take === "orbit") {
				const radius = 3.5;
				const start = phase - 2.5;
				const sx = x + Math.cos(start) * radius;
				const sy = y + Math.sin(start) * radius;
				const ex = x + Math.cos(phase) * radius;
				const ey = y + Math.sin(phase) * radius;
				attrs(shape.current, { d: `M${sx},${sy} A${radius},${radius} 0 0 1 ${ex},${ey}`, stroke: "var(--color-text)", "stroke-width": 1, opacity: .55 });
				attrs(first.current, { cx: ex, cy: ey, r: 1.25 });
			} else if (take === "tide") {
				const width = 14 + pulse * 16 + round * 24;
				const left = Math.max(view.x - bounds.x + 16, x - 24 - width / 2);
				attrs(body.current, { x: left, y: y + 4, width, height: 1.5, rx: .75, fill: `url(#${id}-ink)` });
				attrs(gradient.current, { x1: left, y1: y + 4, x2: left + width, y2: y + 4 });
			} else if (take === "margin") {
				const height = 7 + pulse * 5;
				attrs(body.current, { x: x - .75, y: y - height / 2, width: 1.5, height, rx: .75 });
				attrs(first.current, { cx: x, cy: y + height / 2, r: 1.25, opacity: .8 });
			} else if (take === "wound") {
				// The winding gesture of the ribbon mark, reduced to one thread rather than a miniature logo.
				const ribbon: Point[] = [];
				for (let at = 0; at <= 40; at++) {
					const t = at / 40;
					const coil = t * Math.PI * 2.6 + Math.sin(phase) * .3;
					const loop = t * Math.PI * 2 + phase;
					ribbon.push({ x: x + mix(Math.cos(coil) * 4.5, Math.cos(loop) * 1.6, round), y: y + mix((t - .5) * 8 + Math.sin(coil) * .5, Math.sin(loop) * 1.6, round), at: now });
				}
				attrs(shape.current, { d: ribbon.map((p, at) => `${at ? "L" : "M"}${xy(p)}`).join(" "), stroke: "var(--color-text)", "stroke-width": mix(1.15, 1.6, round) });
				attrs(first.current, { cx: x, cy: y, r: round * 1.2 });
			} else if (take === "tension") {
				// The canvas hand already uses a thread's tension to express activity.
				const span = mix(12, .01, round);
				const bend = Math.sin(phase) * 1.4 * (1 - round);
				attrs(shape.current, { d: `M${x-span/2},${y} C${x-span/6},${y+bend} ${x+span/6},${y-bend} ${x+span/2},${y}`, stroke: "var(--color-text)", "stroke-width": mix(1.2, 3.8, round) });
			} else if (trail.current) {
				// A node and a short walk borrow the canvas's language; a settled node has no trailing line.
				points.push({ x, y, at: now });
				points = points.filter(p => now - p.at < 180);
				const behind = points[0] ?? position;
				const length = Math.hypot(behind.x - x, behind.y - y);
				const ratio = length > 56 ? 56 / length : 1;
				const tail = { x: mix(x, behind.x, ratio), y: mix(y, behind.y, ratio), at: now };
				const middle = (tail.x + x) / 2;
				attrs(trail.current, { d: length > .5 ? `M${xy(tail)} C${middle},${tail.y} ${middle},${y} ${x},${y}` : "", opacity: smooth(Math.min(1, length / 10)) * round });
				attrs(gradient.current, { x1: tail.x, y1: tail.y, x2: x, y2: y });
				const size = mix(2.8, 3.5, round);
				attrs(body.current, { x: x - size / 2, y: y - size / 2, width: size, height: size, rx: .5, fill: `color-mix(in srgb, var(--color-thread) ${round*100}%, var(--color-text))` });
			}
		};
		frame = requestAnimationFrame(paint);
		return () => cancelAnimationFrame(frame);
	}, [take, id]);
	return (
		<div ref={root} data-generation-direction={take} className="received-wind-take">
			<ReceivedIndicator take="wind" history={history} />
			<svg className="received-wind-take-overlay" aria-hidden="true">
				<defs>
					<linearGradient ref={gradient} id={`${id}-ink`} gradientUnits="userSpaceOnUse">
						<stop stopColor="var(--color-text)" stopOpacity="0" />
						<stop offset={take === "tide" ? ".6" : "1"} stopColor="var(--color-text)" stopOpacity={take === "tide" ? ".7" : ".75"} />
						{take === "tide" ? <stop offset="1" stopColor="var(--color-text)" stopOpacity="0" /> : null}
					</linearGradient>
					<clipPath id={`${id}-view`}><rect ref={clip} /></clipPath>
				</defs>
				<g clipPath={`url(#${id}-view)`}>
					<g ref={ink} data-generation-ink="" visibility="hidden">
						{take === "comet" || take === "stitch" ? <path ref={trail} data-travel-trail="" fill="none" stroke={`url(#${id}-ink)`} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" /> : null}
						<path ref={shape} fill="none" strokeLinecap="round" strokeLinejoin="round" />
						<path ref={detail} fill="none" strokeLinecap="round" />
						<circle ref={first} r="0" fill="var(--color-text)" />
						<circle ref={second} r="0" fill="var(--color-text)" />
						<rect ref={body} width="0" height="0" fill="var(--color-text)" />
					</g>
				</g>
			</svg>
		</div>
	);
}
