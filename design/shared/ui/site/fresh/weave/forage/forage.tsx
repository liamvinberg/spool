import { useEffect, useRef } from "react";
import { WeaveFooter, WeaveHead } from "../chrome";
import { CopyLine, DOWNLOAD, INSTALL } from "../install";
import { clamp, ease, glide, lerp, window4 } from "../math";
import { type ReelFrame, runReel, setLayer } from "../reel";
import { createSim, type Scene } from "./sim";
import "../weave.css";
import "./forage.css";

/* The page runs on u, from 0 to 6: one unit of scroll per scene, a screen tall each. */
const SCENES = 6;
const NAMES = ["cart", "checkout", "pay", "receipt"];

type Rect = { x: number; y: number; w: number; h: number };
type Layout = { single: Rect; row: Rect[]; path: [number, number][] };

/** Where the frames sit for a viewport: one large frame first, then the row of four. */
function layout(width: number, height: number): Layout {
	const narrow = width < 760;
	const [r0, t0, r1, t1] = narrow ? [0.07, 0.15, 0.93, 0.5] : [0.47, 0.22, 0.93, 0.7];
	const rx = r0 * width;
	const rw = (r1 - r0) * width;
	const cy = ((t0 + t1) / 2) * height;
	const wide = rw * 0.25;
	const hh = Math.min(wide * 0.66, (t1 - t0) * height * 0.5);
	const widths = [0.25, 0.25, 0.1, 0.25];
	const row: Rect[] = [];
	let x = rx;
	widths.forEach((f, i) => {
		const w = rw * f;
		const h = i === 2 ? hh * 1.55 : hh;
		row.push({ x, y: cy - h / 2, w, h });
		x += w + rw * 0.05;
	});
	const sw = rw * (narrow ? 0.7 : 0.56);
	const sh = Math.min(sw * 0.64, (t1 - t0) * height);
	const single = { x: rx + (rw - sw) / 2, y: cy - sh / 2, w: sw, h: sh };
	// The walk between the frames' middles: under, over, under.
	const centres = row.map((r) => [r.x + r.w / 2, cy] as [number, number]);
	const path: [number, number][] = [];
	for (let k = 0; k < 3; k++) {
		const a = centres[k];
		const b = centres[k + 1];
		if (!a || !b) continue;
		const sign = k === 1 ? -1 : 1;
		for (let s = 0; s < 4; s++) {
			const t = s / 4;
			path.push([lerp(a[0], b[0], t), cy + sign * hh * 1.05 * Math.sin(Math.PI * t)]);
		}
	}
	const end = centres[3];
	if (end) path.push(end);
	return { single, row, path };
}

function along(path: [number, number][], s: number): [number, number] {
	const lengths = [0];
	for (let i = 1; i < path.length; i++) {
		const a = path[i - 1];
		const b = path[i];
		if (a && b) lengths.push((lengths[i - 1] ?? 0) + Math.hypot(b[0] - a[0], b[1] - a[1]));
	}
	const goal = s * (lengths[lengths.length - 1] ?? 0);
	for (let i = 1; i < path.length; i++) {
		const la = lengths[i - 1] ?? 0;
		const lb = lengths[i] ?? la;
		const a = path[i - 1];
		const b = path[i];
		if (a && b && goal <= lb) {
			const t = lb > la ? (goal - la) / (lb - la) : 0;
			return [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
		}
	}
	return path[path.length - 1] ?? [0, 0];
}

type Habit = Pick<Scene, "angle" | "reach" | "turn" | "step" | "decay" | "deposit" | "food" | "scatter" | "exposure" | "ghost">;
/* How the walkers behave in each scene. Exploring wide, then tracing, then pruning to the path. */
const HABITS: { at: number; habit: Habit }[] = [
	{ at: 0, habit: { angle: 0.62, reach: 8, turn: 0.5, step: 1.1, decay: 0.92, deposit: 1, food: 0, scatter: 0.0003, exposure: 0.1, ghost: 0 } },
	{ at: 1, habit: { angle: 0.62, reach: 8, turn: 0.5, step: 1.1, decay: 0.92, deposit: 1, food: 1.4, scatter: 0.0003, exposure: 0.1, ghost: 0 } },
	{ at: 2.6, habit: { angle: 0.62, reach: 8, turn: 0.5, step: 1.1, decay: 0.92, deposit: 1, food: 1.4, scatter: 0.0003, exposure: 0.1, ghost: 0 } },
	{ at: 3.2, habit: { angle: 0.32, reach: 12, turn: 0.45, step: 1.1, decay: 0.88, deposit: 1, food: 2.2, scatter: 0.00015, exposure: 0.11, ghost: 0 } },
	{ at: 4.3, habit: { angle: 0.62, reach: 8, turn: 0.5, step: 1.1, decay: 0.9, deposit: 0.9, food: 1.2, scatter: 0.0003, exposure: 0.09, ghost: 1 } },
	{ at: 5.3, habit: { angle: 0.6, reach: 8, turn: 0.5, step: 1.1, decay: 0.91, deposit: 1, food: 1.8, scatter: 0.0003, exposure: 0.1, ghost: 0.35 } },
];
function habitAt(u: number): Habit {
	const first = HABITS[0];
	if (!first) throw new Error("no habits");
	let out = { ...first.habit };
	for (let i = 0; i < HABITS.length - 1; i++) {
		const a = HABITS[i];
		const b = HABITS[i + 1];
		if (!a || !b || u < a.at) continue;
		const t = ease(u, a.at, a.at + Math.min(0.5, b.at - a.at));
		const next = { ...out };
		for (const key of Object.keys(a.habit) as (keyof Habit)[]) next[key] = lerp(a.habit[key], b.habit[key], t);
		out = next;
	}
	return out;
}

/* Under reduced motion the page settles each scene off screen, then shows it still. */
const RESTS = [0.2, 1.6, 2.6, 3.6, 4.6, 5.8];

/* When each scene's words arrive and leave, in u. */
const CUES: [number, number, number, number][] = [
	[-Infinity, -Infinity, 0.42, 0.72],
	[0.82, 1.1, 1.72, 1.95],
	[2.05, 2.35, 2.82, 3.02],
	[3.06, 3.3, 3.86, 4.05],
	[4.12, 4.4, 4.86, 5.06],
	[5.12, 5.45, Infinity, Infinity],
];

const HISTORY = [
	{ hash: "a41f2c9", message: "receipt: lead with the order number" },
	{ hash: "7d03e18", message: "checkout: split into two steps" },
	{ hash: "3be6d70", message: "pay: try a phone layout" },
	{ hash: "c2b95a4", message: "cart: first pass" },
];

export function Forage() {
	const trackRef = useRef<HTMLElement>(null);
	const stageRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const scenes = useRef<(HTMLDivElement | null)[]>([]);
	const labels = useRef<(HTMLSpanElement | null)[]>([]);
	const pathLabel = useRef<HTMLSpanElement>(null);
	const promptRef = useRef<HTMLParagraphElement>(null);
	const historyRef = useRef<HTMLDivElement>(null);
	const commits = useRef<(HTMLLIElement | null)[]>([]);
	const downloadRef = useRef<HTMLAnchorElement>(null);
	const commandRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const trackEl = trackRef.current;
		const canvas = canvasRef.current;
		const stage = stageRef.current;
		if (!trackEl || !canvas || !stage) return;
		const sim = createSim(canvas);
		stage.dataset.backend = sim ? "webgl" : "fallback";
		const quietBoxes: [number, number, number, number][][] = [];
		let width = 1,
			height = 1,
			place = layout(1, 1),
			buttons: [number, number, number, number][] = [];
		let settle = 0,
			lastRest = -1;
		const pointer = { x: 0, y: 0, on: 0, live: false };
		const onMove = (event: PointerEvent) => {
			pointer.x = event.clientX;
			pointer.y = event.clientY;
			pointer.live = true;
		};
		const onLeave = () => {
			pointer.live = false;
		};
		stage.addEventListener("pointermove", onMove, { passive: true });
		stage.addEventListener("pointerleave", onLeave);

		const boxOf = (el: Element | null | undefined, pad = 0): [number, number, number, number] => {
			if (!el) return [-9999, -9999, 0, 0];
			const r = el.getBoundingClientRect();
			const s = stage.getBoundingClientRect();
			return [r.left - s.left - pad, r.top - s.top - pad, r.width + pad * 2, r.height + pad * 2];
		};
		const measure = (w: number, h: number) => {
			width = w;
			height = h;
			place = layout(w, h);
			sim?.resize(w, h);
			// Measured with transforms off, so a scene mid-arrival does not skew its box.
			quietBoxes.length = 0;
			scenes.current.forEach((scene) => {
				if (!scene) {
					quietBoxes.push([]);
					return;
				}
				const transform = scene.style.transform;
				scene.style.transform = "none";
				const parts = Array.from(scene.querySelectorAll("[data-quiet]")).map((el) => boxOf(el, 14));
				scene.style.transform = transform;
				quietBoxes.push(parts);
			});
			const closing = scenes.current[5];
			if (closing) {
				const transform = closing.style.transform;
				closing.style.transform = "none";
				buttons = [boxOf(downloadRef.current, 7), boxOf(commandRef.current, 7)];
				closing.style.transform = transform;
			}
		};

		const render = ({ progress, reduced, interval }: ReelFrame) => {
			const rest = Math.min(RESTS.length - 1, Math.floor(progress * RESTS.length));
			const u = reduced ? (RESTS[rest] ?? 0) : progress * SCENES;
			if (reduced && rest !== lastRest) {
				lastRest = rest;
				settle = 360;
			}

			let loudest = 0,
				quiet = 0;
			CUES.forEach(([a, b, c, d], i) => {
				const alpha = window4(u, a, b, c, d);
				const arriving = a === -Infinity ? 0 : 1 - ease(u, a, b);
				const leaving = d === Infinity ? 0 : ease(u, c, d);
				const y = reduced ? 0 : arriving * 26 - leaving * 20;
				setLayer(scenes.current[i], alpha, `translate3d(0, ${y.toFixed(2)}px, 0)`, reduced ? 0 : arriving * 6 + leaving * 4);
				if (alpha > quiet) {
					quiet = alpha;
					loudest = i;
				}
			});

			// The frames: one large, then it takes its place in the row and the others arrive.
			const grow = glide(u, 1.85, 2.4);
			const shown = window4(u, 0.75, 1.1, Infinity, Infinity);
			const ending = 1 - ease(u, 4.9, 5.3);
			const fading = lerp(1, 0.08, ease(u, 4.0, 4.4));
			const rects = place.row.map((slot, i) => {
				const r =
					i === 1
						? {
								x: lerp(place.single.x, slot.x, grow),
								y: lerp(place.single.y, slot.y, grow),
								w: lerp(place.single.w, slot.w, grow),
								h: lerp(place.single.h, slot.h, grow),
							}
						: slot;
				const on = (i === 1 ? shown : ease(u, 2.0 + i * 0.08, 2.35 + i * 0.08)) * ending * fading;
				return { ...r, on };
			});
			rects.forEach((r, i) => {
				const el = labels.current[i];
				if (!el) return;
				el.style.transform = `translate3d(${r.x.toFixed(1)}px, ${(r.y - 22).toFixed(1)}px, 0)`;
				const label = i === 1 ? ease(u, 2.1, 2.4) : 1;
				el.style.opacity = (clamp(r.on * 1.3) * window4(u, 0.9, 1.2, 4.1, 4.4) * label).toFixed(3);
			});
			const single = rects[1];
			if (pathLabel.current && single) {
				pathLabel.current.style.transform = `translate3d(${single.x.toFixed(1)}px, ${(single.y - 22).toFixed(1)}px, 0)`;
				pathLabel.current.style.opacity = (window4(u, 0.95, 1.2, 1.8, 2.05) * (width < 760 ? 0 : 1)).toFixed(3);
			}
			if (promptRef.current && single) {
				promptRef.current.style.transform = `translate3d(${single.x.toFixed(1)}px, ${(single.y + single.h + 18).toFixed(1)}px, 0)`;
				setLayer(promptRef.current, window4(u, 0.95, 1.2, 1.75, 2.0) * (width < 760 ? 0 : 1));
			}

			setLayer(historyRef.current, window4(u, 4.18, 4.42, 4.86, 5.06));
			HISTORY.forEach((_, i) => {
				const el = commits.current[i];
				if (!el) return;
				const a = ease(u, 4.25 + i * 0.08, 4.47 + i * 0.08);
				el.style.opacity = a.toFixed(3);
				el.style.transform = reduced ? "" : `translate3d(0, ${((1 - a) * 10).toFixed(2)}px, 0)`;
			});

			// At the end the food is the two ways in.
			const arrive = ease(u, 5.2, 5.6);
			const ways = buttons.map(([x, y, w, h]) => ({ x, y, w, h, on: arrive }));

			const pathOn = window4(u, 3.0, 3.3, 4.0, 4.3);
			const walkOn = window4(u, 3.25, 3.4, 3.88, 4.02);
			const [px, py] = along(place.path, reduced ? 0.5 : glide(u, 3.38, 3.86));

			const near = u < 0.8 ? 0.9 : 0.35;
			pointer.on += ((pointer.live && !reduced ? near : 0) - pointer.on) * Math.min(1, interval / 200);

			// The network gathers round the frames, then round the two ways in.
			const row = place.row;
			const first = row[0];
			const last = row[3];
			const frameBox =
				first && last
					? { x: first.x, y: Math.min(...row.map((r) => r.y)), w: last.x + last.w - first.x, h: Math.max(...row.map((r) => r.h)) }
					: { x: 0, y: 0, w: width, h: height };
			const box = (() => {
				const single = place.single;
				const t = glide(u, 1.85, 2.4);
				const f = {
					x: lerp(single.x, frameBox.x, t),
					y: lerp(single.y, frameBox.y, t),
					w: lerp(single.w, frameBox.w, t),
					h: lerp(single.h, frameBox.h, t),
				};
				const [bx, by, bw, bh] = buttons.reduce<[number, number, number, number]>(
					([x0, y0, x1, y1], [x, y, w, h]) => [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x + w), Math.max(y1, y + h)],
					[Infinity, Infinity, -Infinity, -Infinity],
				);
				// Scene four lets go of the frames and roams the right of the page, leaving the flow as ash.
				const roam = window4(u, 4.0, 4.35, 4.95, 5.2);
				const wide = { x: width * (width < 760 ? 0.04 : 0.44), y: height * 0.1, w: width * (width < 760 ? 0.92 : 0.52), h: height * (width < 760 ? 0.42 : 0.78) };
				const g = {
					x: lerp(f.x, wide.x, roam),
					y: lerp(f.y, wide.y, roam),
					w: lerp(f.w, wide.w, roam),
					h: lerp(f.h, wide.h, roam),
				};
				const e = ease(u, 5.1, 5.5);
				if (!Number.isFinite(bx)) return g;
				return { x: lerp(g.x, bx, e), y: lerp(g.y, by, e), w: lerp(g.w, bw - bx, e), h: lerp(g.h, bh - by, e) };
			})();
			const focusOn = 0.92 * ease(u, 0.7, 1.15);

			const habit = habitAt(u);
			const scene: Scene = {
				...habit,
				rects: [...rects, ...ways],
				path: place.path,
				pathOn,
				pointer,
				quiet: quiet > 0.2 ? (quietBoxes[loudest]?.slice(0, 2) ?? []) : [],
				point: { x: px, y: py, on: walkOn },
				focus: { ...box, on: focusOn },
				awake: lerp(1, 0.42, focusOn),
			};

			if (!sim) return;
			if (reduced) {
				// Settle the scene off screen in one go, then show it once, held.
				if (settle > 0) {
					sim.step(scene, settle);
					settle = 0;
					sim.draw(scene, 1);
				}
				return;
			}
			sim.step(scene, 2);
			sim.draw(scene, 1);
		};

		const stop = runReel({
			track: trackEl,
			render,
			measure,
			follow: 7,
			ambient: () => Boolean(sim),
		});
		return () => {
			stop();
			stage.removeEventListener("pointermove", onMove);
			stage.removeEventListener("pointerleave", onLeave);
			sim?.dispose();
		};
	}, []);

	return (
		<div className="wv-page fg-page">
			<section ref={trackRef} className="fg-track" style={{ height: `${(SCENES + 1) * 100}vh` }}>
				<div ref={stageRef} className="wv-stage fg-stage" data-backend="fallback">
					<WeaveHead />
					<canvas ref={canvasRef} className="wv-canvas" aria-hidden="true" />

					<div className="fg-labels" aria-hidden="true">
						{NAMES.map((name, i) => (
							<span
								key={name}
								ref={(el) => {
									labels.current[i] = el;
								}}
							>
								{name}
							</span>
						))}
						<span ref={pathLabel}>design/frames/checkout/frame.tsx</span>
					</div>
					<p ref={promptRef} className="fg-prompt" aria-hidden="true">
						<span>~/shop $</span> claude "make checkout two steps"
					</p>

					<div
						ref={(el) => {
							scenes.current[0] = el;
						}}
						className="wv-scene fg-opening"
					>
						<div>
							<h1 data-quiet>
								A canvas for
								<br />
								working things out.
							</h1>
							<p data-quiet>Design websites, apps and presentations with your agent, on a canvas that runs on your Mac.</p>
						</div>
					</div>

					<div
						ref={(el) => {
							scenes.current[1] = el;
						}}
						className="wv-scene"
					>
						<h2 data-quiet>Ask your agent for a screen. It writes the frame as a TSX file in your project.</h2>
					</div>

					<div
						ref={(el) => {
							scenes.current[2] = el;
						}}
						className="wv-scene"
					>
						<h2 data-quiet>spool shows every frame live, side by side on one infinite canvas.</h2>
					</div>

					<div
						ref={(el) => {
							scenes.current[3] = el;
						}}
						className="wv-scene"
					>
						<h2 data-quiet>Link frames into a flow and walk through it like the real thing.</h2>
					</div>

					<div
						ref={(el) => {
							scenes.current[4] = el;
						}}
						className="wv-scene"
					>
						<div>
							<div ref={historyRef} className="fg-history" data-quiet>
								<p>~/shop $ git log --oneline design/</p>
								<ul>
									{HISTORY.map((commit, i) => (
										<li
											key={commit.hash}
											ref={(el) => {
												commits.current[i] = el;
											}}
										>
											<span>{commit.hash}</span> {commit.message}
										</li>
									))}
								</ul>
							</div>
							<h2 data-quiet>Every path you tried is still there. Frames are files in your repo, and Git keeps each version.</h2>
						</div>
					</div>

					<div
						ref={(el) => {
							scenes.current[5] = el;
						}}
						className="wv-scene fg-ending"
						id="start"
					>
						<div>
							<h2 data-quiet>Bring it the next thing you're unsure about.</h2>
							<div className="wv-actions">
								<a ref={downloadRef} className="wv-download" href={DOWNLOAD}>
									Download for Mac
								</a>
								<div ref={commandRef} className="fg-command">
									<CopyLine className="wv-command" command={INSTALL} />
								</div>
							</div>
							<p className="wv-fine" data-quiet>
								Free and MIT licensed. Apple silicon, macOS 14 or later.
							</p>
						</div>
					</div>
				</div>
			</section>
			<WeaveFooter />
		</div>
	);
}
