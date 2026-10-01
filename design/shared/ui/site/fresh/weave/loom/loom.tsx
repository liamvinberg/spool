import { useEffect, useRef } from "react";
import { WeaveFooter, WeaveHead } from "../chrome";
import { createField } from "../field";
import { CopyLine, DOWNLOAD, INSTALL } from "../install";
import { clamp, ease, glide, lerp, range, window4 } from "../math";
import { type ReelFrame, runReel, setLayer } from "../reel";
import { type Camera, FRAMES, frame, LINES, PATCH, pathY, ROWS, type Shot, W } from "./cloth";
import fragment from "./loom.glsl";
import "../weave.css";
import "./loom.css";

/* The page runs on u, from 0 to 6: one unit of scroll per scene, a screen tall each. */
const SCENES = 6;

/* Rows woven by u. Linear between keys, so the shuttle never stalls mid-pass. */
const PICKS: [number, number][] = [
	[0, 6],
	[1.0, 6],
	[1.72, 20],
	[1.98, 24],
	[2.8, 64],
	[3.0, 68],
	[4.05, 68],
	[4.85, ROWS],
];
function picksAt(u: number) {
	for (let i = 0; i < PICKS.length - 1; i++) {
		const a = PICKS[i];
		const b = PICKS[i + 1];
		if (a && b && u <= b[0]) return u <= a[0] ? a[1] : lerp(a[1], b[1], range(u, a[0], b[0]));
	}
	return ROWS;
}

type Key = { at: number; wide: Shot; narrow: Shot };
/* Camera shots, each a world box fitted into part of the screen; the copy owns the rest. */
const SHOTS: Key[] = [
	{
		at: 0,
		wide: { box: [0, -4, 22, 12], screen: [0.5, 0.06, 1, 0.64] },
		narrow: { box: [0, -3, 13, 9], screen: [0.3, 0.1, 1, 0.5] },
	},
	{
		at: 0.4,
		wide: { box: [0, -4, 22, 12], screen: [0.5, 0.06, 1, 0.64] },
		narrow: { box: [0, -3, 13, 9], screen: [0.3, 0.1, 1, 0.5] },
	},
	{
		at: 1.0,
		wide: { box: [0, 3, 24, 23], screen: [0.47, 0.1, 1, 0.86] },
		narrow: { box: [0, 3, 14, 22], screen: [0.3, 0.1, 1, 0.58] },
	},
	{
		at: 1.75,
		wide: { box: [0, 3, 24, 23], screen: [0.47, 0.1, 1, 0.86] },
		narrow: { box: [0, 3, 14, 22], screen: [0.3, 0.1, 1, 0.58] },
	},
	{
		at: 2.35,
		wide: { box: [-2, 26, 98, 66], screen: [0.42, 0.12, 0.96, 0.88] },
		narrow: { box: [-1, 26, 97, 66], screen: [0.04, 0.12, 0.96, 0.6] },
	},
	{
		at: 2.9,
		wide: { box: [-2, 26, 98, 66], screen: [0.42, 0.12, 0.96, 0.88] },
		narrow: { box: [-1, 26, 97, 66], screen: [0.04, 0.12, 0.96, 0.6] },
	},
	{
		at: 3.15,
		wide: { box: [3, 30, 93, 60], screen: [0.4, 0.16, 0.97, 0.92] },
		narrow: { box: [3, 30, 93, 60], screen: [0.02, 0.12, 0.98, 0.6] },
	},
	{
		at: 3.9,
		wide: { box: [3, 30, 93, 60], screen: [0.4, 0.16, 0.97, 0.92] },
		narrow: { box: [3, 30, 93, 60], screen: [0.02, 0.12, 0.98, 0.6] },
	},
	{
		at: 4.25,
		wide: { box: [-4, -9, 100, 137], screen: [0.5, 0.07, 0.94, 0.95] },
		narrow: { box: [-4, -9, 100, 137], screen: [0.1, 0.09, 0.9, 0.62] },
	},
	{
		at: 4.85,
		wide: { box: [-4, -9, 100, 137], screen: [0.5, 0.07, 0.94, 0.95] },
		narrow: { box: [-4, -9, 100, 137], screen: [0.1, 0.09, 0.9, 0.62] },
	},
	{
		at: 5.4,
		wide: { box: [0, 68, 96, 128], screen: [0, 0, 1, 1], cover: true },
		narrow: { box: [30, 70, 96, 126], screen: [0, 0, 1, 1], cover: true },
	},
];

function cameraAt(u: number, width: number, height: number): Camera {
	const narrow = width < 760;
	const at = (key: Key) => frame(narrow ? key.narrow : key.wide, width, height);
	const first = SHOTS[0];
	const last = SHOTS[SHOTS.length - 1];
	if (!first || !last) return { x: 0, y: 0, pitch: 10 };
	if (u <= first.at) return at(first);
	for (let i = 0; i < SHOTS.length - 1; i++) {
		const a = SHOTS[i];
		const b = SHOTS[i + 1];
		if (!a || !b || u > b.at) continue;
		const t = glide(u, a.at, b.at);
		const ca = at(a);
		const cb = at(b);
		// Zoom moves in ratios, so a pull back reads as one steady move.
		return {
			x: lerp(ca.x, cb.x, t),
			y: lerp(ca.y, cb.y, t),
			pitch: Math.exp(lerp(Math.log(ca.pitch), Math.log(cb.pitch), t)),
		};
	}
	return at(last);
}

/* Under reduced motion the page cuts between these held shots, one per scene. */
const RESTS = [0.2, 1.68, 2.75, 3.5, 4.8, 5.9];

/* When each scene's words arrive and leave, in u. */
const CUES: [number, number, number, number][] = [
	[-Infinity, -Infinity, 0.42, 0.72],
	[0.82, 1.1, 1.72, 1.95],
	[2.05, 2.35, 2.82, 3.02],
	[3.06, 3.3, 3.86, 4.05],
	[4.12, 4.4, 4.86, 5.06],
	[5.12, 5.45, Infinity, Infinity],
];

type Line = { text: string; kind: "prompt" | "note" | "code" | "blank" };
/* One pick of the shuttle per line of the file. */
const WRITING: Line[] = [
	{ text: '~/shop $ claude "make checkout two steps"', kind: "prompt" },
	{ text: "", kind: "blank" },
	{ text: "design/frames/checkout/frame.tsx", kind: "note" },
	{ text: "export default function Checkout() {", kind: "code" },
	{ text: "  const [step, setStep] = useState(1);", kind: "code" },
	{ text: "  return (", kind: "code" },
	{ text: '    <Sheet title="Checkout">', kind: "code" },
	{ text: "      {step === 1 ? <Address /> : <Payment />}", kind: "code" },
	{ text: "      <Button onClick={() => setStep(2)}>", kind: "code" },
	{ text: "        Continue", kind: "code" },
	{ text: "      </Button>", kind: "code" },
	{ text: "    </Sheet>", kind: "code" },
	{ text: "  );", kind: "code" },
	{ text: "}", kind: "code" },
];

const HISTORY = [
	{ hash: "a41f2c9", message: "receipt: lead with the order number" },
	{ hash: "7d03e18", message: "checkout: split into two steps" },
	{ hash: "3be6d70", message: "pay: try a phone layout" },
	{ hash: "c2b95a4", message: "cart: first pass" },
];

export function Loom() {
	const trackRef = useRef<HTMLElement>(null);
	const stageRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const scenes = useRef<(HTMLDivElement | null)[]>([]);
	const lines = useRef<(HTMLSpanElement | null)[]>([]);
	const writingRef = useRef<HTMLDivElement>(null);
	const labels = useRef<(HTMLSpanElement | null)[]>([]);
	const historyRef = useRef<HTMLDivElement>(null);
	const commits = useRef<(HTMLLIElement | null)[]>([]);
	const closingRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const trackEl = trackRef.current;
		const canvas = canvasRef.current;
		const stage = stageRef.current;
		if (!trackEl || !canvas || !stage) return;
		const field = createField(canvas, fragment);
		stage.dataset.backend = field ? field.backend : "fallback";
		const quietBoxes: number[][] = [];
		let width = 1,
			height = 1;
		// The light leans toward the pointer, eased so the sheen glides rather than jumps.
		const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
		const onPointer = (event: PointerEvent) => {
			pointer.tx = clamp((event.clientX / width) * 2 - 1, -1, 1);
			pointer.ty = clamp((event.clientY / height) * 2 - 1, -1, 1);
		};
		stage.addEventListener("pointermove", onPointer, { passive: true });

		const measure = (w: number, h: number) => {
			width = w;
			height = h;
			field?.resize(w, h);
			quietBoxes.length = 0;
			for (const scene of scenes.current) {
				const copy = scene?.querySelector<HTMLElement>("[data-copy]");
				quietBoxes.push(
					copy ? [copy.offsetLeft, copy.offsetTop, copy.offsetWidth, copy.offsetHeight] : [0, -9999, 0, 0],
				);
			}
		};

		const render = ({ progress, time, reduced, interval }: ReelFrame) => {
			const u = reduced ? (RESTS[Math.min(RESTS.length - 1, Math.floor(progress * RESTS.length))] ?? 0) : progress * SCENES;
			const narrow = width < 760;
			const cam = cameraAt(u, width, height);
			const toX = (x: number) => (x - cam.x) * cam.pitch + width / 2;
			const toY = (y: number) => (y - cam.y) * cam.pitch + height / 2;

			// On arrival the shuttle lays the first four red picks by itself.
			const intro = reduced ? 1 : ease(time, 0.5, 3.4);
			const picks = u < 1 ? Math.min(picksAt(u), 2 + 4 * intro) : picksAt(u);
			const row = Math.floor(picks);
			const across = picks - row;
			const tip = -2 + across * (W + 4);
			const shuttleX = row % 2 === 0 ? tip : W - tip;
			const weaving = row < ROWS && across > 0.001 && across < 0.999;

			// Words: rise into focus, then drift up and away.
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

			// The file, one line per pick, typed as the shuttle crosses.
			const writing = narrow ? 0 : window4(u, 0.9, 1.05, 1.78, 2.0);
			setLayer(writingRef.current, writing);
			const right = toX(0) - 34;
			WRITING.forEach((line, i) => {
				const el = lines.current[i];
				if (!el) return;
				const done = clamp(picks - (LINES + i));
				const shown = Math.round(done * line.text.length);
				el.style.setProperty("--shown", String(u < 1 ? 0 : shown));
				el.style.transform = `translate3d(${(right - 372).toFixed(1)}px, ${(toY(LINES + i + 0.5) - 9).toFixed(1)}px, 0)`;
				el.dataset.live = done > 0 && done < 1 ? "true" : "false";
			});

			// The frames are named once the cloth has woven past them.
			const named = window4(u, 2.3, 2.5, 3.9, 4.12);
			FRAMES.forEach((f, i) => {
				const el = labels.current[i];
				if (!el) return;
				el.style.transform = `translate3d(${toX(f.x0).toFixed(1)}px, ${(toY(f.y1) + 10).toFixed(1)}px, 0)`;
				el.style.opacity = (named * clamp((picks - f.y1) / 3)).toFixed(3);
			});

			setLayer(historyRef.current, window4(u, 4.18, 4.42, 4.86, 5.06));
			HISTORY.forEach((_, i) => {
				const el = commits.current[i];
				if (!el) return;
				const a = ease(u, 4.25 + i * 0.08, 4.47 + i * 0.08);
				el.style.opacity = a.toFixed(3);
				el.style.transform = reduced ? "" : `translate3d(0, ${((1 - a) * 10).toFixed(2)}px, 0)`;
			});

			// The closing words sit on the plain patch the cloth leaves for them.
			const closing = closingRef.current;
			if (closing && !narrow) {
				const [x0, y0, x1, y1] = PATCH;
				closing.style.transform = `translate3d(${toX(x0).toFixed(1)}px, ${toY(y0).toFixed(1)}px, 0)`;
				closing.style.width = `${((x1 - x0) * cam.pitch).toFixed(1)}px`;
				closing.style.height = `${((y1 - y0) * cam.pitch).toFixed(1)}px`;
			} else if (closing) {
				closing.style.transform = "";
				closing.style.width = "";
				closing.style.height = "";
			}

			// The point: the shuttle while it lays the first picks, then the walk through the frames.
			const walkOn = window4(u, 3.02, 3.14, 3.86, 4.02);
			const walk = reduced ? 0.55 : glide(u, 3.14, 3.84);
			const wx = lerp(16, 81, walk);
			const shuttleOn = weaving ? (u < 1 ? intro < 1 ? 1 : 0 : 1 - ease(u, 1.7, 1.85)) : 0;
			const point =
				walkOn > shuttleOn ? { x: wx, y: pathY(wx), a: walkOn } : { x: shuttleX, y: row + 0.5, a: shuttleOn };

			const tx = reduced ? 0 : pointer.tx;
			const ty = reduced ? 0 : pointer.ty;
			pointer.x += (tx - pointer.x) * Math.min(1, interval / 260);
			pointer.y += (ty - pointer.y) * Math.min(1, interval / 260);
			const drift = reduced ? 0 : time;

			if (!field) return;
			const { gl } = field;
			if (field.sample(interval)) field.resize(width, height);
			gl.uniform2f(field.uniform("u_size"), width, height);
			gl.uniform3f(field.uniform("u_cam"), cam.x, cam.y, cam.pitch);
			gl.uniform1f(field.uniform("u_time"), drift);
			gl.uniform1f(field.uniform("u_picks"), picks);
			gl.uniform3f(
				field.uniform("u_light"),
				-0.55 + 0.18 * Math.sin(drift * 0.23) + pointer.x * 0.7,
				-0.7 + 0.14 * Math.cos(drift * 0.19) + pointer.y * 0.6,
				0.62,
			);
			gl.uniform4f(field.uniform("u_point"), point.x, point.y, 4.5, point.a);
			gl.uniform1f(field.uniform("u_drape"), ease(u, 5.1, 5.7));
			if (narrow) gl.uniform4f(field.uniform("u_patch"), -1, -1, -1, -1);
			else gl.uniform4f(field.uniform("u_patch"), PATCH[0], PATCH[1], PATCH[2], PATCH[3]);
			const box = quietBoxes[loudest] ?? [0, -9999, 0, 0];
			gl.uniform4f(field.uniform("u_quiet"), box[0] ?? 0, box[1] ?? 0, box[2] ?? 0, box[3] ?? 0);
			gl.uniform1f(field.uniform("u_quietness"), (loudest === 5 ? (narrow ? 0.88 : 0) : 0.7) * quiet);
			field.draw();
		};

		const stop = runReel({ track: trackEl, render, measure, ambient: () => field?.backend === "webgl" });
		return () => {
			stop();
			stage.removeEventListener("pointermove", onPointer);
			field?.dispose();
		};
	}, []);

	return (
		<div className="wv-page lm-page">
			<section ref={trackRef} className="lm-track" style={{ height: `${(SCENES + 1) * 100}vh` }}>
				<div ref={stageRef} className="wv-stage lm-stage" data-backend="fallback">
					<WeaveHead />
					<canvas ref={canvasRef} className="wv-canvas" aria-hidden="true" />

					<div ref={writingRef} className="lm-writing" aria-label="An agent writing design/frames/checkout/frame.tsx">
						{WRITING.map((line, i) => (
							<span
								key={`${i}-${line.text}`}
								ref={(el) => {
									lines.current[i] = el;
								}}
								className="lm-line"
								data-kind={line.kind}
							>
								{line.text}
							</span>
						))}
					</div>

					<div className="lm-labels" aria-hidden="true">
						{FRAMES.map((f, i) => (
							<span
								key={f.name}
								ref={(el) => {
									labels.current[i] = el;
								}}
							>
								{f.name}
							</span>
						))}
					</div>

					<div
						ref={(el) => {
							scenes.current[0] = el;
						}}
						className="wv-scene lm-opening"
					>
						<div data-copy>
							<h1>
								A canvas for
								<br />
								working things out.
							</h1>
							<p>Design websites, apps and presentations with your agent, on a canvas that runs on your Mac.</p>
						</div>
					</div>

					<div
						ref={(el) => {
							scenes.current[1] = el;
						}}
						className="wv-scene"
					>
						<h2 data-copy>Ask your agent for a screen. It writes the frame as a TSX file in your project.</h2>
					</div>

					<div
						ref={(el) => {
							scenes.current[2] = el;
						}}
						className="wv-scene"
					>
						<h2 data-copy>spool shows every frame live, side by side on one canvas.</h2>
					</div>

					<div
						ref={(el) => {
							scenes.current[3] = el;
						}}
						className="wv-scene"
					>
						<h2 data-copy>Link frames into a flow and walk through it like the real thing.</h2>
					</div>

					<div
						ref={(el) => {
							scenes.current[4] = el;
						}}
						className="wv-scene"
					>
						<div data-copy>
							<div ref={historyRef} className="lm-history">
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
							<h2>Every pass stays in the cloth. Frames are files in your repo, so Git keeps each version you try.</h2>
						</div>
					</div>

					<div
						ref={(el) => {
							scenes.current[5] = el;
						}}
						className="wv-scene lm-ending"
						id="start"
					>
						<div ref={closingRef} className="lm-closing" data-copy>
							<h2>Try it on the next thing you're unsure about.</h2>
							<div className="wv-actions">
								<a className="wv-download" href={DOWNLOAD}>
									Download for Mac
								</a>
								<CopyLine className="wv-command" command={INSTALL} />
							</div>
							<p className="wv-fine">Free and MIT licensed. Apple silicon, macOS 14 or later.</p>
						</div>
					</div>
				</div>
			</section>
			<WeaveFooter />
		</div>
	);
}
