import {
	createContext,
	type ReactNode,
	type RefObject,
	useContext,
	useId,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";
import { Paragraphs } from "./agent-said";

interface Surface {
	layer: HTMLDivElement | null;
	viewport: RefObject<HTMLDivElement | null>;
}
const SeedContext = createContext<Surface | null>(null);

/** A stable drawing surface lets Seed cross the clips of opening paragraphs. */
export function SeedSurface({ children, viewport }: { children: ReactNode; viewport: Surface["viewport"] }) {
	const [layer, setLayer] = useState<HTMLDivElement | null>(null);
	const surface = useMemo(() => ({ layer, viewport }), [layer, viewport]);
	return (
		<div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
			<SeedContext value={surface}>{children}</SeedContext>
			<div ref={setLayer} className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true" />
		</div>
	);
}

interface Arrival {
	at: number;
	count: number;
}
interface Point {
	x: number;
	y: number;
}
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => t * t * (3 - 2 * t);

/** The accepted Seed: wind at rest, a round seed while travelling, with no trail. */
export function SeedParagraphs({ text, finished, still }: { text: string; finished: boolean; still: boolean }) {
	const surface = useContext(SeedContext);
	const anchor = useRef<HTMLSpanElement>(null);
	const receipts = useRef<{ length: number; arrivals: Arrival[] }>({ length: 0, arrivals: [] });
	useLayoutEffect(() => {
		const received = receipts.current;
		if (finished || still) received.arrivals = [];
		else if (text.length > received.length) {
			received.arrivals.push({ at: performance.now(), count: text.length - received.length });
		} else if (text.length < received.length) received.arrivals = [];
		received.length = text.length;
	}, [text, finished, still]);
	const live = !finished && !still;
	return (
		<>
			<Paragraphs
				text={text}
				finished={finished}
				still={still}
				caret={
					live ? (
						<span
							data-agent-caret=""
							className="invisible ml-1.5 inline-flex h-3.5 items-center align-baseline"
							aria-hidden="true"
						>
							<span ref={anchor} className="relative inline-block h-0.5 w-[30px] overflow-hidden" />
						</span>
					) : undefined
				}
			/>
			{live && surface?.layer
				? createPortal(<Seed anchor={anchor} receipts={receipts} surface={surface} />, surface.layer)
				: null}
		</>
	);
}

function Seed({
	anchor,
	receipts,
	surface,
}: {
	anchor: RefObject<HTMLSpanElement | null>;
	receipts: RefObject<{ length: number; arrivals: Arrival[] }>;
	surface: Surface;
}) {
	const wind = useRef<HTMLSpanElement>(null);
	const ink = useRef<SVGRectElement>(null);
	const clip = useRef<SVGRectElement>(null);
	const id = useId();
	useLayoutEffect(() => {
		const strand = wind.current;
		const body = ink.current;
		const crop = clip.current;
		const layer = surface.layer;
		const viewport = surface.viewport.current;
		if (!strand || !body || !crop || !layer || !viewport) return;
		const animation = strand.getAnimations()[0];
		if (!animation) return;
		// One native wind clock for this live message. Paragraph handoffs never seek it.
		animation.currentTime = 400;
		animation.playbackRate = 0;
		animation.play();
		let frame = 0;
		let previous = performance.now();
		let position: Point | null = null;
		const velocity: Point = { x: 0, y: 0 };
		let morph = 0;
		let rate = 0;
		let scroll = viewport.scrollTop;
		const paint = (now: number) => {
			const elapsed = Math.min(64, now - previous);
			const dt = Math.min(32, elapsed) / 1000;
			previous = now;
			const received = receipts.current;
			received.arrivals = received.arrivals.filter((arrival) => now - arrival.at < 1000);
			const latest = received.arrivals.at(-1);
			const active = latest !== undefined && now - latest.at <= 750;
			const count = received.arrivals.reduce((sum, arrival) => sum + arrival.count, 0);
			const targetRate = active ? Math.max(0.55, Math.min(1.15, count / 170)) : 0;
			rate += (targetRate - rate) * (1 - Math.exp(-elapsed / (active ? 280 : 150)));
			if (!active && rate < 0.01) rate = 0;
			animation.updatePlaybackRate(rate);
			body.style.opacity = active ? ".9" : ".32";
			body.dataset.receiving = String(active);

			const mark = anchor.current;
			if (!mark) {
				body.setAttribute("visibility", "hidden");
				position = null;
				velocity.x = 0;
				velocity.y = 0;
				morph = 0;
			} else {
				const bounds = layer.getBoundingClientRect();
				const view = viewport.getBoundingClientRect();
				const track = mark.getBoundingClientRect();
				const stroke = strand.getBoundingClientRect();
				const target = {
					x: track.x - bounds.x + track.width / 2,
					y: Math.min(track.y + 1, view.bottom - 8) - bounds.y,
				};
				if (position === null) position = { ...target };
				// A reader scrolling moves the page, not the seed's destination on the page.
				// Follow-scroll during an opening paragraph keeps the prototype's smooth move.
				const atEnd = viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop <= 2;
				if (!atEnd) {
					position.y -= viewport.scrollTop - scroll;
				}
				const distance = Math.hypot(target.x - position.x, target.y - position.y);
				const speed = Math.hypot(velocity.x, velocity.y);
				const travelling = smooth(Math.min(1, Math.max(distance / 24, speed / 150)));
				morph += (travelling - morph) * (1 - Math.exp(-dt / (travelling > morph ? 0.055 : 0.12)));
				if (morph < 0.001 && travelling < 0.001) morph = 0;
				const round = smooth(morph);
				const follow = mix(5, 18, Math.max(round, 1 - smooth(Math.min(1, distance / 24))));
				const decay = Math.exp(-follow * dt);
				for (const axis of ["x", "y"] as const) {
					const delta = position[axis] - target[axis];
					const drift = velocity[axis] + follow * delta;
					position[axis] = target[axis] + (delta + drift * dt) * decay;
					velocity[axis] = (velocity[axis] - follow * drift * dt) * decay;
					if (Math.abs(position[axis] - target[axis]) < 0.01 && Math.abs(velocity[axis]) < 0.1) {
						position[axis] = target[axis];
						velocity[axis] = 0;
					}
				}
				const width = mix(stroke.width, 4, round);
				const height = mix(2, 4, round);
				const offset = stroke.x - bounds.x + stroke.width / 2 - 15;
				const values = {
					x: position.x + offset * (1 - round) - width / 2,
					y: position.y - height / 2,
					width,
					height,
					rx: height / 2,
				};
				for (const [key, value] of Object.entries(values)) body.setAttribute(key, String(value));
				for (const [key, value] of Object.entries({
					x: view.x - bounds.x,
					y: view.y - bounds.y,
					width: view.width,
					height: view.height,
				})) {
					crop.setAttribute(key, String(value));
				}
				body.setAttribute(
					"visibility",
					track.bottom >= view.top && (atEnd || track.top < view.bottom) ? "visible" : "hidden",
				);
			}
			scroll = viewport.scrollTop;
			frame = requestAnimationFrame(paint);
		};
		frame = requestAnimationFrame(paint);
		return () => {
			cancelAnimationFrame(frame);
			animation.cancel();
		};
	}, [anchor, receipts, surface]);
	return (
		<>
			<span ref={wind} className="invisible absolute top-0 left-0 h-0.5 w-[30px] origin-left animate-agent-wind" />
			<svg data-agent-seed="" className="absolute inset-0 h-full w-full motion-reduce:hidden" aria-hidden="true">
				<defs>
					<clipPath id={id}>
						<rect ref={clip} />
					</clipPath>
				</defs>
				<g clipPath={`url(#${id})`}>
					<rect
						ref={ink}
						visibility="hidden"
						fill="var(--color-text)"
						style={{ opacity: 0.32, transition: "opacity 180ms ease-out" }}
					/>
				</g>
			</svg>
		</>
	);
}
