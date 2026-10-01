import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { cn } from "shared/lib/utils";
import { createQuad, prefersReducedMotion, stepSpring } from "shared/ui/site/fresh/toy/gl";
import fragment from "./felt.glsl";

export type Place = { x: number; y: number; r: number };
/** Where a sheet rests, as a share of the table: x and y of its centre, r in degrees. */
export type Spot = { wide: Place; narrow: Place };

type Body = {
	id: string;
	element: HTMLDivElement;
	turn: HTMLDivElement;
	w: number;
	h: number;
	spot: Spot;
	x: { x: number; v: number };
	y: { x: number; v: number };
	r: { x: number; v: number };
	lift: { x: number; v: number };
	flip: { x: number; v: number };
	rest: number;
	flipped: boolean;
	held: boolean;
	homing: number;
	z: number;
};

type Desk = {
	register: (body: Omit<Body, "x" | "y" | "r" | "lift" | "flip" | "rest" | "flipped" | "held" | "homing" | "z">) => () => void;
	turnOver: (id: string) => void;
};

const DeskContext = createContext<Desk | null>(null);

const NARROW = 760;

/**
 * The table: a pigment-stained surface you can lay sheets on. Every sheet is
 * a body with springs for position, tilt, lift and turn, stepped in one loop.
 */
export function Desk({
	children,
	tidy,
	className,
}: {
	children: ReactNode;
	tidy: boolean;
	className?: string;
}) {
	const table = useRef<HTMLDivElement>(null);
	const felt = useRef<HTMLCanvasElement>(null);
	const bodies = useRef(new Map<string, Body>());
	const tidyRef = useRef(tidy);
	const wake = useRef<() => void>(() => {});
	const order = useRef<string[]>([]);
	const top = useRef(10);

	const register = useCallback<Desk["register"]>((input) => {
		const body: Body = {
			...input,
			x: { x: 0, v: 0 },
			y: { x: 0, v: 0 },
			r: { x: 0, v: 0 },
			lift: { x: 0, v: 0 },
			flip: { x: 0, v: 0 },
			rest: 0,
			flipped: false,
			held: false,
			homing: 1,
			z: top.current++,
		};
		bodies.current.set(input.id, body);
		if (!order.current.includes(input.id)) order.current.push(input.id);
		wake.current();
		return () => {
			bodies.current.delete(input.id);
		};
	}, []);

	const turnOver = useCallback((id: string) => {
		const body = bodies.current.get(id);
		if (!body) return;
		body.flipped = !body.flipped;
		body.z = top.current++;
		body.element.style.zIndex = String(body.z);
		body.element.dataset.flipped = String(body.flipped);
		wake.current();
	}, []);

	const [desk] = useState<Desk>(() => ({ register, turnOver }));

	useEffect(() => {
		tidyRef.current = tidy;
		const ids = order.current.filter((id) => bodies.current.has(id));
		const base = top.current;
		for (const body of bodies.current.values()) {
			body.homing = 1;
			// Squaring the pile restacks it so the first sheet lands on top.
			if (tidy) {
				body.z = base + ids.length - ids.indexOf(body.id);
				body.element.style.zIndex = String(body.z);
			}
		}
		if (tidy) top.current = base + ids.length + 1;
		wake.current();
	}, [tidy]);

	useLayoutEffect(() => {
		const surface = table.current;
		const canvas = felt.current;
		if (!surface || !canvas) return;
		const reduce = prefersReducedMotion();
		let quad: ReturnType<typeof createQuad> = null;
		try {
			quad = createQuad(canvas, fragment, false);
			surface.dataset.backend = quad ? "webgl" : "fallback";
		} catch (error) {
			surface.dataset.backend = "fallback";
			console.warn("table surface unavailable:", error);
		}
		let width = surface.clientWidth;
		let height = surface.clientHeight;
		let raf = 0;
		let last = 0;
		let elapsed = 0;
		let placed = false;
		let still = 0;

		const narrow = () => width < NARROW;
		const scaleFor = () => (narrow() ? Math.min(1, width / 440) : Math.max(0.8, Math.min(1.1, Math.min(width / 1440, height / 900))));

		// Tidy: the sheets squared into one pile, in reading order, the first on top.
		const tidyPlace = (body: Body): Place => {
			const ids = order.current.filter((id) => bodies.current.has(id));
			const index = ids.indexOf(body.id);
			const centre = narrow() ? { x: width / 2, y: 820 } : { x: width * 0.73, y: height * 0.5 };
			const step = 7;
			return {
				x: centre.x + (index - (ids.length - 1) / 2) * step,
				y: centre.y + (index - (ids.length - 1) / 2) * step,
				r: index % 2 === 0 ? -1.2 : 1.4,
			};
		};
		const homeOf = (body: Body): Place => {
			if (tidyRef.current) return tidyPlace(body);
			const spot = narrow() ? body.spot.narrow : body.spot.wide;
			return { x: spot.x * width, y: spot.y * height, r: spot.r };
		};

		const place = () => {
			for (const body of bodies.current.values()) {
				const home = homeOf(body);
				body.x.x = home.x;
				body.y.x = home.y;
				body.r.x = home.r;
				body.rest = home.r;
				body.homing = 0;
			}
			placed = true;
		};

		const sizeCanvas = () => {
			width = surface.clientWidth;
			height = surface.clientHeight;
			const ratio = Math.min(window.devicePixelRatio || 1, width < NARROW ? 1 : 1.25);
			canvas.width = Math.max(1, Math.round(width * ratio));
			canvas.height = Math.max(1, Math.round(height * ratio));
		};

		const cards = new Float32Array(24);
		const drawFelt = () => {
			if (!quad) return;
			const { gl } = quad;
			let i = 0;
			for (const body of bodies.current.values()) {
				if (i >= 6) break;
				cards[i * 4] = body.x.x;
				cards[i * 4 + 1] = body.y.x;
				cards[i * 4 + 2] = body.x.v;
				cards[i * 4 + 3] = body.y.v;
				i++;
			}
			gl.uniform2f(quad.uniform("u_size"), width, height);
			gl.uniform1f(quad.uniform("u_time"), elapsed + 12);
			gl.uniform1f(quad.uniform("u_wide"), narrow() ? 0 : 1);
			gl.uniform4fv(quad.uniform("u_cards[0]"), cards);
			quad.draw();
		};

		const frame = (stamp: number) => {
			raf = 0;
			const dt = last ? Math.min((stamp - last) / 1000, 1 / 30) : 1 / 60;
			last = stamp;
			if (!placed) place();
			if (!reduce) elapsed += dt;
			let moving = false;
			const s = scaleFor();
			for (const body of bodies.current.values()) {
				if (!body.held) {
					const home = homeOf(body);
					if (body.homing > 0) {
						// Returning home: a soft spring, so the sheet glides rather than snaps.
						if (reduce) {
							body.x.x = home.x;
							body.y.x = home.y;
							body.x.v = 0;
							body.y.v = 0;
						} else {
							stepSpring(body.x, home.x, dt, 60, 13);
							stepSpring(body.y, home.y, dt, 60, 13);
						}
						body.rest = home.r;
						if (Math.hypot(body.x.x - home.x, body.y.x - home.y) < 0.5 && Math.hypot(body.x.v, body.y.v) < 4) body.homing = 0;
					} else {
						// Thrown: it slides and slows on the felt, and the table's edge pushes back.
						const friction = Math.exp(-dt * 4.2);
						body.x.v *= friction;
						body.y.v *= friction;
						body.x.x += body.x.v * dt;
						body.y.x += body.y.v * dt;
						// Up to a fifth of a sheet may hang off the table's edge.
						const minX = body.w * s * 0.3;
						const maxX = width - minX;
						const minY = body.h * s * 0.3;
						const maxY = height - minY;
						if (body.x.x < minX) body.x.v += (minX - body.x.x) * 90 * dt;
						if (body.x.x > maxX) body.x.v += (maxX - body.x.x) * 90 * dt;
						if (body.y.x < minY) body.y.v += (minY - body.y.x) * 90 * dt;
						if (body.y.x > maxY) body.y.v += (maxY - body.y.x) * 90 * dt;
					}
				}
				const tilt = body.held ? Math.max(-9, Math.min(9, body.x.v * 0.011)) : 0;
				if (reduce) {
					body.r.x = body.rest + tilt;
					body.lift.x = body.held ? 1 : 0;
					body.flip.x = body.flipped ? 180 : 0;
				} else {
					stepSpring(body.r, body.rest + tilt, dt, 170, 16);
					stepSpring(body.lift, body.held ? 1 : 0, dt, 320, 22);
					stepSpring(body.flip, body.flipped ? 180 : 0, dt, 190, 19);
				}
				const scale = s * (1 + body.lift.x * 0.035);
				body.element.style.transform = `translate3d(${(body.x.x - body.w / 2).toFixed(2)}px, ${(body.y.x - body.h / 2).toFixed(2)}px, 0) rotate(${body.r.x.toFixed(3)}deg) scale(${scale.toFixed(4)})`;
				body.turn.style.transform = `rotateY(${body.flip.x.toFixed(2)}deg)`;
				const energy =
					Math.abs(body.x.v) + Math.abs(body.y.v) + Math.abs(body.r.v) + Math.abs(body.flip.v) * 0.2 + Math.abs(body.lift.v) * 20;
				if (body.held || body.homing > 0 || energy > 0.6 || Math.abs(body.flip.x - (body.flipped ? 180 : 0)) > 0.2) moving = true;
			}
			drawFelt();
			// The pigment keeps drifting slowly while the page is open, unless motion is reduced.
			still = moving ? 0 : still + 1;
			if (!reduce || moving || still < 2) raf = window.requestAnimationFrame(frame);
			else last = 0;
		};
		const start = () => {
			if (!raf) raf = window.requestAnimationFrame(frame);
		};
		wake.current = start;

		// Picking a sheet up: mouse grabs at once, touch after a short hold so the page still scrolls.
		let active: { body: Body; id: number; dx: number; dy: number; t: number; x: number; y: number; moved: boolean; lifted: boolean; timer: number; samples: { x: number; y: number; t: number }[] } | null = null;
		const toDesk = (event: PointerEvent) => {
			const box = surface.getBoundingClientRect();
			return { x: event.clientX - box.left, y: event.clientY - box.top };
		};
		const lift = () => {
			if (!active) return;
			active.lifted = true;
			const { body } = active;
			body.held = true;
			body.homing = 0;
			body.z = top.current++;
			body.element.style.zIndex = String(body.z);
			body.element.dataset.held = "true";
			start();
		};
		const down = (event: PointerEvent) => {
			if (event.button !== 0 || active) return;
			const target = event.target as HTMLElement;
			const element = target.closest<HTMLElement>("[data-sheet]");
			if (!element) return;
			if (target.closest("[data-no-drag]")) return;
			const body = bodies.current.get(element.dataset.sheet ?? "");
			if (!body) return;
			const at = toDesk(event);
			active = {
				body,
				id: event.pointerId,
				dx: at.x - body.x.x,
				dy: at.y - body.y.x,
				t: event.timeStamp,
				x: event.clientX,
				y: event.clientY,
				moved: false,
				lifted: false,
				timer: 0,
				samples: [{ x: at.x, y: at.y, t: event.timeStamp }],
			};
			if (event.pointerType === "touch") {
				active.timer = window.setTimeout(lift, 180);
			} else {
				element.setPointerCapture(event.pointerId);
				lift();
			}
		};
		const move = (event: PointerEvent) => {
			if (!active || event.pointerId !== active.id) return;
			const distance = Math.hypot(event.clientX - active.x, event.clientY - active.y);
			if (distance > 5) active.moved = true;
			if (!active.lifted) {
				// A touch that travels before the hold is a scroll; let it go.
				if (active.moved) {
					window.clearTimeout(active.timer);
					active = null;
				}
				return;
			}
			const at = toDesk(event);
			const { body } = active;
			const nx = at.x - active.dx;
			const ny = at.y - active.dy;
			active.samples.push({ x: at.x, y: at.y, t: event.timeStamp });
			if (active.samples.length > 6) active.samples.shift();
			const first = active.samples[0];
			const span = Math.max(8, event.timeStamp - first.t) / 1000;
			body.x.v = body.x.v * 0.5 + ((at.x - first.x) / span) * 0.5;
			body.y.v = body.y.v * 0.5 + ((at.y - first.y) / span) * 0.5;
			body.x.x = nx;
			body.y.x = ny;
			start();
		};
		const up = (event: PointerEvent) => {
			if (!active || event.pointerId !== active.id) return;
			window.clearTimeout(active.timer);
			const { body, moved, lifted } = active;
			const quick = event.timeStamp - active.t < 320;
			const target = event.target as HTMLElement;
			if (body.element.hasPointerCapture(event.pointerId)) body.element.releasePointerCapture(event.pointerId);
			body.held = false;
			body.element.dataset.held = "false";
			const recent = active.samples[active.samples.length - 1];
			if (!recent || event.timeStamp - recent.t > 80 || reduce) {
				body.x.v = 0;
				body.y.v = 0;
			}
			const speed = Math.hypot(body.x.v, body.y.v);
			if (speed > 4200) {
				body.x.v *= 4200 / speed;
				body.y.v *= 4200 / speed;
			}
			// A throw leaves a little spin; a sheet lands at a new casual angle.
			body.rest = body.r.x + Math.max(-6, Math.min(6, body.x.v * 0.0016));
			if (!moved && quick && event.type === "pointerup" && !target.closest("a, button, [data-no-drag]")) {
				turnOver(body.id);
			}
			if (moved) suppressClick = true;
			active = null;
			if (!lifted) body.x.v = body.y.v = 0;
			start();
		};
		let suppressClick = false;
		const click = (event: MouseEvent) => {
			if (!suppressClick) return;
			suppressClick = false;
			event.preventDefault();
			event.stopPropagation();
		};
		// While a sheet is held by touch, the page must not scroll under it.
		const touchMove = (event: TouchEvent) => {
			if (active?.lifted && event.cancelable) event.preventDefault();
		};
		const resize = () => {
			sizeCanvas();
			for (const body of bodies.current.values()) body.homing = 1;
			start();
		};
		sizeCanvas();
		surface.addEventListener("pointerdown", down);
		window.addEventListener("pointermove", move);
		window.addEventListener("pointerup", up);
		window.addEventListener("pointercancel", up);
		surface.addEventListener("click", click, true);
		surface.addEventListener("touchmove", touchMove, { passive: false });
		const observer = new ResizeObserver(resize);
		observer.observe(surface);
		start();
		return () => {
			window.cancelAnimationFrame(raf);
			surface.removeEventListener("pointerdown", down);
			window.removeEventListener("pointermove", move);
			window.removeEventListener("pointerup", up);
			window.removeEventListener("pointercancel", up);
			surface.removeEventListener("click", click, true);
			surface.removeEventListener("touchmove", touchMove);
			observer.disconnect();
			quad?.dispose();
		};
	}, [turnOver]);

	return (
		<DeskContext.Provider value={desk}>
			<div ref={table} className={cn("desk", className)}>
				<canvas ref={felt} className="desk-felt" aria-hidden="true" />
				{children}
			</div>
		</DeskContext.Provider>
	);
}

export type Tone = "paper" | "thread" | "ink";

/** One loose sheet: a front, a back, and a corner you can turn it by. */
export function Sheet({
	id,
	spot,
	w,
	h,
	tone = "paper",
	label,
	front,
	back,
}: {
	id: string;
	spot: Spot;
	w: number;
	h: number;
	tone?: Tone;
	label: string;
	front: ReactNode;
	back: ReactNode;
}) {
	const desk = useContext(DeskContext);
	const element = useRef<HTMLDivElement>(null);
	const turn = useRef<HTMLDivElement>(null);
	const [flipped, setFlipped] = useState(false);
	const spotRef = useRef(spot);
	spotRef.current = spot;
	useLayoutEffect(() => {
		if (!desk || !element.current || !turn.current) return;
		return desk.register({ id, element: element.current, turn: turn.current, w, h, spot: spotRef.current });
	}, [desk, id, w, h]);
	useEffect(() => {
		const node = element.current;
		if (!node) return;
		const observer = new MutationObserver(() => setFlipped(node.dataset.flipped === "true"));
		observer.observe(node, { attributes: true, attributeFilter: ["data-flipped"] });
		return () => observer.disconnect();
	}, []);
	return (
		<div
			ref={element}
			className="sheet"
			data-sheet={id}
			data-tone={tone}
			data-held="false"
			data-flipped="false"
			role="group"
			aria-label={label}
			style={{ width: w, height: h }}
		>
			<div ref={turn} className="sheet-turn">
				<div className="sheet-face sheet-front" inert={flipped}>
					{front}
					<button
						type="button"
						className="sheet-corner"
						data-no-drag
						aria-label={`Turn ${label} over`}
						onClick={() => desk?.turnOver(id)}
					/>
				</div>
				<div className="sheet-face sheet-back" inert={!flipped}>
					{back}
					<button
						type="button"
						className="sheet-corner"
						data-no-drag
						aria-label={`Turn ${label} face up`}
						onClick={() => desk?.turnOver(id)}
					/>
				</div>
			</div>
		</div>
	);
}
