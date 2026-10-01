import { useEffect, useRef } from "react";
import { SpoolMark } from "shared/ui/spool/mark";
import { createField } from "../field";
import { CopyLine, DOWNLOAD, INSTALL, REPO } from "../install";
import { ease, glide, type Key, lerp, range, track, window4 } from "../math";
import { runReel, setLayer } from "../reel";
import fragment from "./night.glsl";
import "../film.css";
import "./night.css";

/* The film runs on u, from 0 to 6: one unit of scroll per scene, a screen tall each. */
const SCENES = 6;

type Frame = { name: string; x: number; y: number; hw: number; hh: number; delay: number };
/* Four frames in world units, y down. The point blooms inside checkout first. */
const FRAMES: Frame[] = [
	{ name: "cart", x: -1.3, y: 0, hw: 0.5, hh: 0.32, delay: 0.1 },
	{ name: "checkout", x: 0, y: 0, hw: 0.5, hh: 0.32, delay: 0 },
	{ name: "pay", x: 0.97, y: 0, hw: 0.17, hh: 0.35, delay: 0.18 },
	{ name: "receipt", x: 1.94, y: 0, hw: 0.5, hh: 0.32, delay: 0.26 },
];

/* The thread weaves under and over between frames, through each one's middle. */
const STITCHES: [number, number][] = [
	[-1.3, 0],
	[-0.65, 0.5],
	[0, 0],
	[0.485, -0.52],
	[0.97, 0],
	[1.45, 0.5],
	[1.94, 0],
];

function sampleThread(points: [number, number][], steps: number) {
	const out: [number, number][] = [];
	for (let i = 0; i < points.length - 1; i++) {
		const p0 = points[Math.max(0, i - 1)] ?? points[i];
		const p1 = points[i];
		const p2 = points[i + 1];
		const p3 = points[Math.min(points.length - 1, i + 2)] ?? p2;
		if (!p0 || !p1 || !p2 || !p3) continue;
		for (let s = 0; s < steps; s++) {
			const t = s / steps;
			const t2 = t * t;
			const t3 = t2 * t;
			const at = (a: number, b: number, c: number, d: number) =>
				0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
			out.push([at(p0[0], p1[0], p2[0], p3[0]), at(p0[1], p1[1], p2[1], p3[1])]);
		}
	}
	const end = points[points.length - 1];
	if (end) out.push(end);
	const lengths = [0];
	for (let i = 1; i < out.length; i++) {
		const a = out[i - 1];
		const b = out[i];
		if (a && b) lengths.push((lengths[i - 1] ?? 0) + Math.hypot(b[0] - a[0], b[1] - a[1]));
	}
	return { points: out, lengths, total: lengths[lengths.length - 1] ?? 1 };
}
const THREAD = sampleThread(STITCHES, 48);

function along(s: number): [number, number] {
	const goal = s * THREAD.total;
	const { lengths, points } = THREAD;
	let i = 1;
	while (i < lengths.length - 1 && (lengths[i] ?? 0) < goal) i++;
	const a = points[i - 1] ?? [0, 0];
	const b = points[i] ?? a;
	const la = lengths[i - 1] ?? 0;
	const lb = lengths[i] ?? la + 1;
	const t = lb > la ? (goal - la) / (lb - la) : 0;
	return [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
}

/* Camera keys: world x, world y, zoom. The walk overrides these while it runs. */
const CAMERA: Key<[number, number, number]>[] = [
	{ at: 0, value: [0, 0.12, 1] },
	{ at: 0.35, value: [0, 0.12, 1] },
	{ at: 1.15, value: [-0.34, 0.04, 2.1] },
	{ at: 1.7, value: [-0.38, 0.04, 2.25] },
	{ at: 2.2, value: [0.32, 0.36, 0.56] },
	{ at: 2.7, value: [0.32, 0.36, 0.6] },
	{ at: 4.15, value: [0.32, 0.95, 0.3] },
	{ at: 4.75, value: [0.32, 0.95, 0.33] },
	{ at: 5.3, value: [0.55, 0.62, 1.2] },
	{ at: 6, value: [0.7, 0.55, 1.4] },
];

/* Under reduced motion the film cuts between these held shots, one per scene. */
const RESTS = [0.2, 1.62, 2.5, 3.72, 4.6, 5.9];

/* When each scene's copy arrives and leaves, in u. */
const CUES: [number, number, number, number][] = [
	[-Infinity, -Infinity, 0.42, 0.72],
	[0.85, 1.15, 1.62, 1.9],
	[1.95, 2.25, 2.72, 2.95],
	[2.98, 3.22, 3.78, 4.0],
	[4.05, 4.32, 4.72, 4.95],
	[5.0, 5.4, Infinity, Infinity],
];

type Line = { text: string; kind: "prompt" | "note" | "code" | "blank" };
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
const TYPED = WRITING.reduce((sum, line) => sum + Math.max(1, line.text.length), 0);

const HISTORY = [
	{ hash: "a41f2c9", message: "receipt: lead with the order number" },
	{ hash: "7d03e18", message: "checkout: split into two steps" },
	{ hash: "3be6d70", message: "pay: try a phone layout" },
	{ hash: "c2b95a4", message: "cart: first pass" },
];

export function NightFilm() {
	const trackRef = useRef<HTMLElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const scenes = useRef<(HTMLDivElement | null)[]>([]);
	const frames = useRef<(HTMLDivElement | null)[]>([]);
	const lines = useRef<(HTMLSpanElement | null)[]>([]);
	const caretRef = useRef<HTMLSpanElement>(null);
	const writingRef = useRef<HTMLDivElement>(null);
	const historyRef = useRef<HTMLDivElement>(null);
	const commits = useRef<(HTMLLIElement | null)[]>([]);
	const threadRef = useRef<SVGPathElement>(null);

	useEffect(() => {
		const trackEl = trackRef.current;
		const canvas = canvasRef.current;
		if (!trackEl || !canvas) return;
		const field = createField(canvas, fragment);
		const stage = canvas.closest<HTMLElement>(".fn-stage");
		if (stage) stage.dataset.backend = field ? field.backend : "fallback";
		const quietBoxes: number[][] = [];
		let width = 1,
			height = 1,
			unit = 1;

		const measure = (w: number, h: number) => {
			width = w;
			height = h;
			// Wide screens fit the row of frames; tall ones fit the width.
			unit = Math.min(w / 3.2, h / 2);
			field?.resize(w, h);
			quietBoxes.length = 0;
			for (const scene of scenes.current) {
				const copy = scene?.querySelector<HTMLElement>("[data-copy]");
				quietBoxes.push(
					copy ? [copy.offsetLeft, copy.offsetTop, copy.offsetWidth, copy.offsetHeight] : [0, -9999, 0, 0],
				);
			}
		};

		const render = ({ progress, time, reduced, interval }: Parameters<Parameters<typeof runReel>[0]["render"]>[0]) => {
			// Reduced motion cuts between composed shots instead of moving the camera through them.
			const u = reduced ? (RESTS[Math.min(RESTS.length - 1, Math.floor(progress * RESTS.length))] ?? 0) : progress * SCENES;

			// Where the point is: still, then walking the thread, then resting in receipt.
			const walk = glide(u, 2.92, 3.86);
			const [px, py] = u < 2.8 ? [0, 0] : along(walk);
			const pointOn = (1 - ease(u, 0.9, 1.35)) + ease(u, 2.78, 2.95) * (1 - ease(u, 3.86, 4.08));
			const breath = reduced ? 0 : Math.sin(time * 1.4) * 0.6;

			let [cx = 0, cy = 0, zoom = 1] = track(CAMERA, u);
			const follow = ease(u, 2.7, 3.0) * (1 - ease(u, 3.86, 4.18));
			cx = lerp(cx, px, follow);
			cy = lerp(cy, 0.3, follow);
			zoom = lerp(zoom, 1.05, follow);
			const scale = unit * zoom;

			const poolRadius = lerp(ease(u, 0.5, 1.45) * 0.64, 0.42, ease(u, 1.75, 2.15));
			const poolStrength = ease(u, 0.5, 0.95) * (1 - ease(u, 1.9, 2.35));
			const flood = ease(u, 4.75, 5.35);
			const dim = 0.35 * ease(u, 3.95, 4.2) * (1 - ease(u, 4.75, 5.1));
			const lit = FRAMES.map(
				(f) => ease(u, 1.8 + f.delay, 2.15 + f.delay) * (1 - 0.4 * ease(u, 4.0, 4.2)) * (1 - ease(u, 4.8, 5.25)),
			);
			const hot = FRAMES.map((f) => pointOn * Math.max(0, 1 - Math.abs(px - f.x) / (f.hw + 0.28)) * ease(u, 2.8, 2.95));

			// Copy: rises into focus, then drifts up and away.
			let loudest = 0,
				quiet = 0;
			CUES.forEach(([a, b, c, d], i) => {
				const alpha = window4(u, a, b, c, d);
				const arriving = a === -Infinity ? 0 : 1 - ease(u, a, b);
				const leaving = d === Infinity ? 0 : ease(u, c, d);
				const y = reduced ? 0 : arriving * 28 - leaving * 22;
				setLayer(scenes.current[i], alpha, `translate3d(0, ${y.toFixed(2)}px, 0)`, reduced ? 0 : arriving * 7 + leaving * 4);
				if (alpha > quiet) {
					quiet = alpha;
					loudest = i;
				}
			});

			// The agent writes the file, one character per sliver of scroll.
			let budget = Math.round(range(u, 0.95, 1.62) * TYPED);
			let caretLine = 0,
				caretColumn = 0;
			WRITING.forEach((line, i) => {
				const shown = Math.max(0, Math.min(line.text.length, budget));
				budget -= Math.max(1, line.text.length);
				lines.current[i]?.style.setProperty("--shown", String(shown));
				if (shown > 0 || (budget >= 0 && line.kind === "blank")) {
					caretLine = i;
					caretColumn = shown;
				}
			});
			const writing = window4(u, 0.8, 1.05, 1.66, 1.92);
			setLayer(writingRef.current, writing, reduced ? undefined : `translate3d(0, ${((1 - ease(u, 0.8, 1.05)) * 18).toFixed(2)}px, 0)`);
			if (caretRef.current) {
				caretRef.current.style.transform = `translate(${caretColumn}ch, ${caretLine * 1.7}em)`;
				caretRef.current.style.opacity = range(u, 0.95, 1.62) >= 1 ? String(0.4 + 0.6 * (Math.sin(time * 6) > 0 ? 1 : 0)) : "1";
			}

			// The history arrives one commit at a time.
			setLayer(historyRef.current, window4(u, 4.02, 4.25, 4.72, 4.95));
			HISTORY.forEach((_, i) => {
				const el = commits.current[i];
				if (!el) return;
				const a = ease(u, 4.1 + i * 0.07, 4.32 + i * 0.07);
				el.style.opacity = a.toFixed(3);
				el.style.transform = reduced ? "" : `translate3d(0, ${((1 - a) * 10).toFixed(2)}px, 0)`;
			});

			// Frame outlines and their names, drawn in screen pixels so hairlines stay hairlines.
			FRAMES.forEach((f, i) => {
				const el = frames.current[i];
				if (!el) return;
				const left = (f.x - f.hw - cx) * scale + width / 2;
				const top = (f.y - f.hh - cy) * scale + height / 2;
				el.style.transform = `translate3d(${left.toFixed(2)}px, ${top.toFixed(2)}px, 0)`;
				el.style.width = `${(f.hw * 2 * scale).toFixed(2)}px`;
				el.style.height = `${(f.hh * 2 * scale).toFixed(2)}px`;
				el.style.opacity = ((lit[i] ?? 0) * (1 - flood)).toFixed(3);
				el.dataset.small = f.hw * 2 * scale < 56 ? "true" : "false";
			});

			// The thread, drawn up to where the point has walked.
			const thread = threadRef.current;
			if (thread) {
				const goal = (u < 2.8 ? 0 : walk) * THREAD.total;
				let d = "";
				for (let i = 0; i < THREAD.points.length; i++) {
					const p = THREAD.points[i];
					if (!p) continue;
					const reached = (THREAD.lengths[i] ?? 0) <= goal;
					const q = reached ? p : along(walk);
					const sx = (q[0] - cx) * scale + width / 2;
					const sy = (q[1] - cy) * scale + height / 2;
					d += `${d ? "L" : "M"}${sx.toFixed(1)} ${sy.toFixed(1)}`;
					if (!reached) break;
				}
				thread.setAttribute("d", d);
				thread.style.opacity = (ease(u, 2.85, 2.95) * (1 - ease(u, 4.8, 5.2))).toFixed(3);
				thread.style.strokeWidth = String(lerp(1, 1.6, follow));
			}

			if (!field) return;
			const { gl } = field;
			if (field.sample(interval)) field.resize(width, height);
			gl.uniform2f(field.uniform("u_size"), width, height);
			gl.uniform1f(field.uniform("u_unit"), unit);
			gl.uniform1f(field.uniform("u_time"), field.backend === "software" ? 4 : time + 4);
			gl.uniform3f(field.uniform("u_cam"), cx, cy, zoom);
			gl.uniform4f(field.uniform("u_point"), px, py, 4.5 + breath + follow * 1.5, pointOn);
			gl.uniform4f(field.uniform("u_pool"), 0, 0, Math.max(0.0001, poolRadius), poolStrength);
			gl.uniform4fv(field.uniform("u_frames[0]"), FRAMES.flatMap((f) => [f.x, f.y, f.hw, f.hh]));
			gl.uniform4f(field.uniform("u_lit"), lit[0] ?? 0, lit[1] ?? 0, lit[2] ?? 0, lit[3] ?? 0);
			gl.uniform4f(field.uniform("u_hot"), hot[0] ?? 0, hot[1] ?? 0, hot[2] ?? 0, hot[3] ?? 0);
			gl.uniform1f(field.uniform("u_flood"), flood);
			gl.uniform1f(field.uniform("u_dim"), dim);
			const box = quietBoxes[loudest] ?? [0, -9999, 0, 0];
			gl.uniform4f(field.uniform("u_quiet"), box[0] ?? 0, box[1] ?? 0, box[2] ?? 0, box[3] ?? 0);
			gl.uniform1f(field.uniform("u_quietness"), lerp(0.6, 0.35, flood) * quiet);
			field.draw();
		};

		const stop = runReel({
			track: trackEl,
			render,
			measure,
			ambient: () => field?.backend === "webgl",
		});
		return () => {
			stop();
			field?.dispose();
		};
	}, []);

	return (
		<div className="fm-page fn-page">
			<section ref={trackRef} className="fn-track" style={{ height: `${(SCENES + 1) * 100}vh` }}>
				<div className="fn-stage" data-backend="fallback">
					<header className="fn-head">
						<a className="fn-brand" href="https://spool.page/" aria-label="spool home">
							<SpoolMark className="fn-mark" />
							<span>spool</span>
						</a>
						<nav aria-label="Website">
							<a href={`${REPO}#readme`}>Docs</a>
							<a href={REPO}>GitHub</a>
							<a href={DOWNLOAD}>Download</a>
						</nav>
					</header>
					<canvas ref={canvasRef} className="fn-canvas" aria-hidden="true" />
					<div className="fn-world" aria-hidden="true">
						{FRAMES.map((frame, i) => (
							<div
								key={frame.name}
								ref={(el) => {
									frames.current[i] = el;
								}}
								className="fn-frame"
							>
								<span>{frame.name}</span>
							</div>
						))}
						<svg className="fn-thread">
							<path ref={threadRef} />
						</svg>
					</div>

					<div
						ref={(el) => {
							scenes.current[0] = el;
						}}
						className="fn-scene fn-opening"
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
						className="fn-scene"
					>
						<h2 data-copy>Ask your agent for a screen. It writes the frame as a TSX file in your project.</h2>
					</div>
					<div ref={writingRef} className="fn-writing" aria-label="An agent writing design/frames/checkout/frame.tsx">
						<pre>
							{WRITING.map((line, i) => (
								<span
									key={`${i}-${line.text}`}
									ref={(el) => {
										lines.current[i] = el;
									}}
									className="fn-line"
									data-kind={line.kind}
								>
									{line.text}
								</span>
							))}
							<span ref={caretRef} className="fn-caret" aria-hidden="true" />
						</pre>
					</div>

					<div
						ref={(el) => {
							scenes.current[2] = el;
						}}
						className="fn-scene"
					>
						<h2 data-copy>spool shows every frame live, side by side on one infinite canvas.</h2>
					</div>

					<div
						ref={(el) => {
							scenes.current[3] = el;
						}}
						className="fn-scene"
					>
						<h2 data-copy>Link frames into a flow and walk through it like the real thing.</h2>
					</div>

					<div
						ref={(el) => {
							scenes.current[4] = el;
						}}
						className="fn-scene"
					>
						<h2 data-copy>It's all files in your repo, so Git keeps every version you try.</h2>
					</div>
					<div ref={historyRef} className="fn-history">
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

					<div
						ref={(el) => {
							scenes.current[5] = el;
						}}
						className="fn-scene fn-ending"
						id="start"
					>
						<div data-copy>
							<h2>Try it on the next thing you're unsure about.</h2>
							<div className="fn-actions">
								<a className="fn-download" href={DOWNLOAD}>
									Download for Mac
								</a>
								<CopyLine className="fn-command" command={INSTALL} />
							</div>
							<p className="fn-fine">Free and MIT licensed. Apple silicon, macOS 14 or later.</p>
						</div>
					</div>
				</div>
			</section>
			<footer className="fn-footer">
				<div className="fn-footer-top">
					<p>
						Made by Liam. I post what I'm building on X as{" "}
						<a href="https://x.com/liamvinberg">@liamvinberg</a>.
					</p>
					<p className="fn-terminal">
						<span>~/your-project $</span> spool init
					</p>
				</div>
				<div className="fn-footer-bottom">
					<span className="fn-brand">
						<SpoolMark className="fn-mark" />
						<span>spool</span>
					</span>
					<nav aria-label="Footer">
						<a href={`${REPO}#readme`}>Docs</a>
						<a href={REPO}>GitHub</a>
						<a href={`${REPO}/blob/main/LICENSE.md`}>MIT licence</a>
						<a href="https://spool.page/privacy">Privacy</a>
					</nav>
				</div>
			</footer>
		</div>
	);
}
