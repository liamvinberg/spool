import { useEffect, useRef } from "react";
import { GlyphFoot, GlyphHead } from "../chrome";
import { createPass, createSurface, createTexture } from "../gl";
import { CopyLine, DOWNLOAD, INSTALL } from "../install";
import { ease, glide, type Key, lerp, range, track, window4 } from "../math";
import { runReel, setLayer } from "../reel";
import { drawAtlas } from "./atlas";
import fragment from "./field.glsl";
import pigmentPass from "./pigment.glsl";
import { coverage, createGrid, dense, type Grid, KIND, print, put, reset, shape, word as setWord, writeTrail } from "./grid";
import { CART, CHECKOUT, PAY, RECEIPT } from "./sources";
import "../glyph.css";
import "./field.css";

/* The film runs on u, from 0 to 6: one unit of scroll per scene, a screen tall each. */
const SCENES = 6;

type Frame = { name: string; x: number; y: number; hw: number; hh: number; delay: number; source: string[] };
/* Four frames in world units, y down, each holding its own source. */
const FRAMES: Frame[] = [
	{ name: "cart", x: -1.3, y: 0, hw: 0.5, hh: 0.32, delay: 0.1, source: CART.split("\n") },
	{ name: "checkout", x: 0, y: 0, hw: 0.5, hh: 0.32, delay: 0, source: CHECKOUT.split("\n") },
	{ name: "pay", x: 0.97, y: 0, hw: 0.2, hh: 0.36, delay: 0.18, source: PAY.split("\n") },
	{ name: "receipt", x: 1.94, y: 0, hw: 0.5, hh: 0.32, delay: 0.26, source: RECEIPT.split("\n") },
];
const TYPED = CHECKOUT.replace(/\n/g, "").length;

/* The walk weaves under and over between frames, through each one's middle. */
const STITCHES: [number, number][] = [
	[-1.3, 0],
	[-0.65, 0.52],
	[0, 0],
	[0.485, -0.54],
	[0.97, 0],
	[1.45, 0.52],
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
const THREAD = sampleThread(STITCHES, 160);

/* Camera keys: world x, world y, zoom. */
const CAMERA: Key<[number, number, number]>[] = [
	{ at: 0, value: [0.16, 0.04, 1] },
	{ at: 0.4, value: [0.16, 0.04, 1] },
	{ at: 1.1, value: [-0.24, 0.12, 1.35] },
	{ at: 1.72, value: [-0.26, 0.12, 1.4] },
	{ at: 2.25, value: [0.32, 0.3, 0.66] },
	{ at: 2.75, value: [0.32, 0.3, 0.68] },
	{ at: 3.95, value: [0.32, 0.3, 0.7] },
	{ at: 4.45, value: [0.42, 0.55, 0.62] },
	{ at: 5.05, value: [0.32, 0.4, 0.9] },
	{ at: 6, value: [0.32, 0.4, 1] },
];

/* On a phone the row of frames is narrow, so the camera frames each moment closer. */
const CAMERA_SMALL: Key<[number, number, number]>[] = [
	{ at: 0, value: [0.16, -0.75, 1] },
	{ at: 0.4, value: [0.16, -0.75, 1] },
	{ at: 1.1, value: [0, 0.42, 2.6] },
	{ at: 1.72, value: [0, 0.42, 2.65] },
	{ at: 2.25, value: [0.32, 0.55, 0.72] },
	{ at: 3.95, value: [0.32, 0.55, 0.74] },
	{ at: 4.45, value: [0.42, 0.55, 0.62] },
	{ at: 5.05, value: [0.32, 0.4, 0.9] },
	{ at: 6, value: [0.32, 0.4, 1] },
];

/* When each scene's copy arrives and leaves, in u. */
const CUES: [number, number, number, number][] = [
	[-Infinity, -Infinity, 0.42, 0.72],
	[0.85, 1.12, 1.62, 1.9],
	[1.95, 2.25, 2.72, 2.95],
	[2.98, 3.22, 3.8, 4.0],
	[4.05, 4.32, 4.75, 4.98],
	[5.02, 5.4, Infinity, Infinity],
];
/* Under reduced motion the film cuts between these held shots, one per scene. */
const RESTS = [0.2, 1.7, 2.6, 3.58, 4.62, 5.9];

const LOG = [
	{ hash: "a41f2c9", message: "receipt: lead with the order number" },
	{ hash: "7d03e18", message: "checkout: split into two steps" },
	{ hash: "3be6d70", message: "pay: try a phone layout" },
	{ hash: "c2b95a4", message: "cart: first pass" },
];

const LIGHT = Array.from(" .,'`:;-_\"", (c) => c.charCodeAt(0));

type Pointer = { x: number; y: number; speed: number; at: number };

export function FieldFilm() {
	const trackRef = useRef<HTMLElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const scenes = useRef<(HTMLDivElement | null)[]>([]);

	useEffect(() => {
		const trackEl = trackRef.current;
		const canvas = canvasRef.current;
		const stage = canvas?.closest<HTMLElement>(".gp-stage");
		if (!trackEl || !canvas || !stage) return;
		const surface = createSurface(canvas, fragment, { maxRatio: 2, minRatio: 1 });
		stage.dataset.backend = surface ? surface.backend : "fallback";
		const gl = surface?.gl;
		const gridTexture = gl ? createTexture(gl, 0, gl.NEAREST) : null;
		const atlasTexture = gl ? createTexture(gl, 1, gl.LINEAR) : null;
		const pass = gl ? createPass(gl, pigmentPass, 2) : null;
		if (surface && gl) {
			surface.use();
			gl.uniform1i(surface.uniform("u_grid"), 0);
			gl.uniform1i(surface.uniform("u_atlas"), 1);
			gl.uniform1i(surface.uniform("u_pigment"), 2);
		}

		let width = 1,
			height = 1,
			unit = 1;
		let grid: Grid | null = null;
		let gridSize = "";
		let atlasKey = "";
		let word = new Float32Array(0);
		const quiet: number[][] = [];

		const loadAtlas = (cell: [number, number], fontSize: number) => {
			if (!gl || !atlasTexture) return;
			const key = `${cell.join("x")}@${fontSize}`;
			if (key === atlasKey) return;
			atlasKey = key;
			const sheet = drawAtlas(cell, fontSize, 3);
			gl.activeTexture(gl.TEXTURE1);
			gl.bindTexture(gl.TEXTURE_2D, atlasTexture);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sheet);
		};

		const measure = (w: number, h: number) => {
			width = w;
			height = h;
			unit = Math.min(w / 3.2, h / 2);
			surface?.resize(w, h);
			const small = w < 760;
			const cell: [number, number] = small ? [6, 12] : [8, 16];
			const fontSize = small ? 10 : 13;
			loadAtlas(cell, fontSize);
			grid = createGrid(w, h, cell);
			const edge = small ? 20 : Math.min(80, w * 0.056);
			// The ending sets the name across a wide screen, and the ribbon mark on a tall one.
			const mark = stage.querySelector(".gp-mark path")?.getAttribute("d");
			word = coverage(
				grid,
				small && mark
					? shape(mark, [250, 182, 524, 660], { x: edge, y: h * 0.1, w: w - edge * 2, h: h * 0.42 })
					: setWord("spool", { x: edge, y: h * 0.08, w: w - edge * 2, h: h * 0.5 }),
			);
			if (gl && gridTexture) {
				gl.activeTexture(gl.TEXTURE0);
				gl.bindTexture(gl.TEXTURE_2D, gridTexture);
				gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, grid.cols, grid.rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, grid.data);
				gridSize = `${grid.cols}x${grid.rows}`;
			}
			quiet.length = 0;
			for (const scene of scenes.current) {
				const copy = scene?.querySelector<HTMLElement>("[data-copy]");
				if (!copy) {
					quiet.push([0, -9999, 0, 0]);
					continue;
				}
				const box = copy.getBoundingClientRect();
				const stageBox = stage.getBoundingClientRect();
				quiet.push([box.left - stageBox.left, box.top - stageBox.top, box.width, box.height]);
			}
		};
		// Fonts change both the atlas and the word, so measure again once they are in.
		void Promise.all([
			document.fonts?.load('400 39px "Fragment Mono"'),
			document.fonts?.load('700 200px "Familjen Grotesk"'),
		]).then(() => {
			atlasKey = "";
			measure(window.innerWidth, window.innerHeight);
		});

		// The cursor stirs the ink: cells it passes take on more of it, then let it go.
		let pointer: Pointer | null = null;
		const onMove = (event: PointerEvent) => {
			if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
			const now = performance.now();
			const speed = pointer ? Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) / Math.max(8, now - pointer.at) : 0;
			pointer = { x: event.clientX, y: event.clientY, speed: lerp(pointer?.speed ?? 0, speed, 0.4), at: now };
		};
		const onLeave = () => {
			pointer = null;
		};
		window.addEventListener("pointermove", onMove, { passive: true });
		document.documentElement.addEventListener("pointerleave", onLeave);
		let last = performance.now();
		const typists = [
			{ row: 0, col: 0, end: 0, left: 0.4 },
			{ row: 0, col: 0, end: 0, left: 1.5 },
		];

		const render = ({ progress, time, reduced, interval }: Parameters<Parameters<typeof runReel>[0]["render"]>[0]) => {
			const now = performance.now();
			const dt = Math.min(0.1, (now - last) / 1000);
			last = now;
			const u = reduced ? (RESTS[Math.min(RESTS.length - 1, Math.floor(progress * RESTS.length))] ?? 0) : progress * SCENES;
			const [cx = 0, cy = 0, zoom = 1] = track(width < 760 ? CAMERA_SMALL : CAMERA, u);
			const scale = unit * zoom;

			// The copy for each scene rises in and drifts away.
			let loudest = 0,
				quietest = 0;
			CUES.forEach(([a, b, c, d], i) => {
				const alpha = window4(u, a, b, c, d);
				const arriving = a === -Infinity ? 0 : 1 - ease(u, a, b);
				const leaving = d === Infinity ? 0 : ease(u, c, d);
				const y = reduced ? 0 : arriving * 24 - leaving * 18;
				setLayer(scenes.current[i], alpha, `translate3d(0, ${y.toFixed(2)}px, 0)`);
				if (alpha > quietest) {
					quietest = alpha;
					loudest = i;
				}
			});

			if (!grid || !surface || !gl || !gridTexture) return;
			const g = grid;
			const [cw, ch] = g.cell;
			reset(g);

			const toCell = (wx: number, wy: number): [number, number] => [
				Math.round(((wx - cx) * scale + width / 2) / cw),
				Math.round(((wy - cy) * scale + height / 2) / ch),
			];

			// Frames: an edge of ASCII, a name above it, and the frame's own source inside.
			const fade = 1 - ease(u, 3.98, 4.22);
			const walk = glide(u, 3.18, 3.86);
			const walking = window4(u, 3.05, 3.2, 3.86, 4.0);
			const [walkX] = along(walk);
			const rects: [number, number, number, number][] = [];
			FRAMES.forEach((f, i) => {
				const lit =
					(i === 1 ? ease(u, 0.88, 1.08) : ease(u, 1.8 + f.delay, 2.15 + f.delay)) * fade;
				if (lit <= 0.002) return;
				const hot = walking * Math.max(0, 1 - Math.abs(walkX - f.x) / (f.hw + 0.25));
				const [c0, r0] = toCell(f.x - f.hw, f.y - f.hh);
				const [c1, r1] = toCell(f.x + f.hw, f.y + f.hh);
				rects.push([c0, r0 - 1, c1, r1]);
				const typed = i === 1 ? Math.round(range(u, 0.98, 1.62) * TYPED) : Number.POSITIVE_INFINITY;
				// The source, clipped to the frame, written one character at a time in checkout.
				let budget = typed;
				let caret: [number, number] | null = null;
				const inner = 0.45 + 0.55 * lit;
				for (let line = 0; line < f.source.length; line++) {
					const text = f.source[line] ?? "";
					const row = r0 + 2 + line;
					const shown = Math.max(0, Math.min(text.length, budget));
					budget -= text.length;
					if (row >= r1 - 1) continue;
					for (let k = 0; k < shown; k++) {
						const col = c0 + 3 + k;
						if (col >= c1 - 1) break;
						const code = text.charCodeAt(k);
						if (code !== 32) put(g, col, row, KIND.shape, (0.8 + 0.3 * hot) * lit * inner, code);
						else put(g, col, row, KIND.shape, 0.01, 32);
					}
					if (shown < text.length && caret === null && budget < 0) caret = [c0 + 3 + shown, row];
				}
				// Empty cells inside a frame stay empty, so its code reads as a page.
				for (let row = r0 + 1; row < r1; row++) {
					for (let col = c0 + 1; col < c1; col++) {
						const at = (row * g.cols + col) * 4;
						if (col < 0 || row < 0 || col >= g.cols || row >= g.rows) continue;
						if ((g.data[at + 2] ?? 0) !== KIND.shape) {
							g.data[at] = 32;
							g.data[at + 1] = 0;
							g.data[at + 2] = KIND.shape;
						}
					}
				}
				if (caret && lit > 0.5) put(g, caret[0], caret[1], KIND.hot, 1, 95);
				const edge = Math.min(1, lit * 1.2) * (0.55 + 0.45 * hot);
				for (let col = c0; col <= c1; col++) {
					const corner = col === c0 || col === c1;
					put(g, col, r0, KIND.edge, edge, corner ? 43 : 45);
					put(g, col, r1, KIND.edge, edge, corner ? 43 : 45);
				}
				for (let row = r0 + 1; row < r1; row++) {
					put(g, c0, row, KIND.edge, edge, 124);
					put(g, c1, row, KIND.edge, edge, 124);
				}
				print(g, c0, r0 - 1, f.name, KIND.name, lit * (c1 - c0 > f.name.length + 2 ? 1 : 0));
			});

			// The walk: the thread drawn up to where the point has got, the point itself hot.
			if (walking > 0.002) {
				// Drawn the way ASCII draws a line: each cell's mark follows the thread's slope there.
				const goal = walk * THREAD.total;
				let prev: [number, number] | null = null;
				for (let i = 0; i < THREAD.points.length; i++) {
					if ((THREAD.lengths[i] ?? 0) > goal) break;
					const p = THREAD.points[i];
					const q = THREAD.points[Math.min(THREAD.points.length - 1, i + 4)];
					if (!p || !q) continue;
					const [col, row] = toCell(p[0], p[1]);
					if (prev && prev[0] === col && prev[1] === row) continue;
					if (rects.some(([a, b, c, d]) => col >= a && col <= c && row >= b && row <= d)) continue;
					prev = [col, row];
					const slope = ((q[1] - p[1]) * cw) / Math.max(1e-6, Math.abs(q[0] - p[0]) * ch);
					const mark = Math.abs(slope) < 0.4 ? 45 : Math.abs(slope) > 2.6 ? 124 : slope > 0 ? 92 : 47;
					put(g, col, row, KIND.hot, 0.7 * walking, mark);
				}
				const [px, py] = along(walk);
				const [pc, pr] = toCell(px, py);
				for (let dy = -1; dy <= 1; dy++) {
					for (let dx = -2; dx <= 2; dx++) {
						const falloff = 1 - (Math.abs(dx) / 3 + Math.abs(dy) / 2) * 0.5;
						const col = pc + dx;
						const row = pr + dy;
						if (rects.some(([a, b, c, d]) => col >= a && col <= c && row >= b && row <= d)) continue;
						put(g, col, row, KIND.hot, falloff * walking);
					}
				}
			}

			// The history, printed into the field one commit at a time.
			const logShown = window4(u, 4.1, 4.3, 4.78, 4.98);
			if (logShown > 0.002) {
				const small = width < 760;
				const col = small ? 3 : Math.round(g.cols * 0.56);
				const row = small ? Math.round(g.rows * 0.16) : Math.round(g.rows * 0.3);
				const prompt = "~/shop $ git log --oneline design/";
				// A clean window cut into the ink for the log to print in.
				const wide = Math.min(g.cols - col, prompt.length + 6);
				for (let r = row - 2; r <= row + LOG.length * 2 + 2; r++) {
					for (let c = col - 4; c < col + wide; c++) put(g, c, r, KIND.shape, 0.004, 32);
				}
				print(g, col, row, prompt, KIND.name, logShown, Math.round(range(u, 4.12, 4.3) * prompt.length));
				LOG.forEach((entry, i) => {
					const on = range(u, 4.3 + i * 0.08, 4.4 + i * 0.08);
					if (on <= 0) return;
					const line = row + 2 + i * 2;
					print(g, col, line, entry.hash, KIND.hot, logShown * 0.85, Math.round(on * 7));
					print(g, col + 8, line, entry.message, KIND.print, logShown * 0.9, Math.round(on * entry.message.length));
				});
			}

			// The name, set in the field's own source, sweeping in from the left.
			const named = ease(u, 5.0, 5.55);
			if (named > 0.002) {
				for (let row = 0; row < g.rows; row++) {
					for (let col = 0; col < g.cols; col++) {
						const cover = word[row * g.cols + col] ?? 0;
						if (cover < 0.12) continue;
						const sweep = ease(u, 5.0 + (col / g.cols) * 0.35, 5.2 + (col / g.cols) * 0.35);
						const at = (row * g.cols + col) * 4;
						// Light marks would thin the letters out, so heavier source takes their place.
						const char = LIGHT.includes(g.data[at] ?? 32) ? dense(col, row) : g.data[at];
						put(g, col, row, KIND.shape, Math.min(1, cover * 1.7) * sweep, char);
					}
				}
			}

			// The cursor's trail decays over about a second.
			const decay = Math.exp(-dt / 0.9);
			const trail = g.trail;
			for (let i = 0; i < trail.length; i++) trail[i] = (trail[i] ?? 0) * decay;

			// While the opening holds, a couple of lines in the cloud are being written: a head
			// runs along a line of source and leaves it lit, fading behind it.
			const writingCloud = (1 - ease(u, 0.3, 0.6)) + ease(u, 5.5, 5.9);
			if (!reduced && writingCloud > 0.01) {
				for (const typist of typists) {
					typist.left -= dt;
					if (typist.left <= 0 || typist.col >= typist.end) {
						const small = width < 760;
						const row = Math.floor(g.rows * (small ? 0.12 + Math.random() * 0.4 : 0.1 + Math.random() * 0.55));
						let col = Math.floor(g.cols * (small ? 0.05 + Math.random() * 0.5 : 0.4 + Math.random() * 0.4));
						while (col < g.cols - 1 && (g.template[(row * g.cols + col) * 4] ?? 32) === 32) col++;
						typist.row = row;
						typist.col = col;
						typist.end = Math.min(g.cols, col + 14 + Math.floor(Math.random() * 26));
						typist.left = 1.6 + Math.random() * 2.2;
					}
					const from = Math.floor(typist.col);
					typist.col += dt * 38;
					for (let col = from; col < Math.min(typist.end, Math.floor(typist.col)); col++) {
						const i = typist.row * g.cols + col;
						if ((g.template[i * 4] ?? 32) !== 32) trail[i] = Math.max(trail[i] ?? 0, 0.85 * writingCloud);
					}
				}
			}
			if (pointer && !reduced) {
				const pc = pointer.x / cw;
				const pr = pointer.y / ch;
				const radius = 9;
				const add = Math.min(0.5, (0.06 + pointer.speed * 0.08) * dt * 60);
				pointer.speed *= Math.exp(-dt / 0.25);
				for (let row = Math.floor(pr - radius / 2); row <= pr + radius / 2; row++) {
					for (let col = Math.floor(pc - radius); col <= pc + radius; col++) {
						if (col < 0 || row < 0 || col >= g.cols || row >= g.rows) continue;
						const d2 = ((col + 0.5 - pc) / radius) ** 2 + ((row + 0.5 - pr) / (radius / 2)) ** 2;
						if (d2 >= 1) continue;
						const i = row * g.cols + col;
						trail[i] = Math.min(1, (trail[i] ?? 0) + add * (1 - d2) ** 2);
					}
				}
			}
			writeTrail(g);

			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_2D, gridTexture);
			if (gridSize === `${g.cols}x${g.rows}`) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, g.cols, g.rows, gl.RGBA, gl.UNSIGNED_BYTE, g.data);

			if (surface.sample(interval)) surface.resize(width, height);
			// Where the pigment gathers: right of the opening, into checkout, then around the log.
			const opening = 1 - ease(u, 0.5, 1.2);
			const logged = window4(u, 4.02, 4.3, 4.75, 4.98);
			const logCol = width < 760 ? 3 : Math.round(g.cols * 0.56);
			const logRow = width < 760 ? Math.round(g.rows * 0.16) : Math.round(g.rows * 0.3);
			const logX = ((logCol + 20) * cw - width / 2) / scale + cx;
			const logY = ((logRow + 5) * ch - height / 2) / scale + cy;
			const flood = ease(u, 5.1, 5.8);
			const small = width < 760;
			const hero: [number, number, number] = small ? [0.16, -0.95, 2.4] : [0.62, 0.02, 1.15];
			const pool: [number, number, number, number] =
				u < 2.5
					? [lerp(0, hero[0], opening), lerp(0, hero[1], opening), lerp(0.3, hero[2], opening), opening]
					: [logX, logY, 1.15 / zoom, logged * 0.8];

			// First the pigment, once per cell, into a texture the size of the grid.
			pass?.render(g.cols, g.rows, () => {
				gl.uniform2f(pass.uniform("u_cell"), cw, ch);
				gl.uniform2f(pass.uniform("u_size"), width, height);
				gl.uniform1f(pass.uniform("u_unit"), unit);
				gl.uniform3f(pass.uniform("u_cam"), cx, cy, zoom);
				gl.uniform1f(pass.uniform("u_time"), surface.backend === "software" ? 6 : time + 6);
				gl.uniform4f(pass.uniform("u_pool"), ...pool);
			});
			// Then every pixel draws its cell's character at the ink that pigment gives it.
			surface.use();
			gl.uniform2f(surface.uniform("u_cells"), g.cols, g.rows);
			gl.uniform2f(surface.uniform("u_cell"), cw, ch);
			gl.uniform2f(surface.uniform("u_size"), width, height);
			gl.uniform1f(surface.uniform("u_cloud"), lerp(0.13, 0.05, ease(u, 0.4, 1.0)) + flood * 0.08);
			const box = quiet[loudest] ?? [0, -9999, 0, 0];
			gl.uniform4f(surface.uniform("u_quiet"), box[0] ?? 0, box[1] ?? 0, box[2] ?? 0, box[3] ?? 0);
			gl.uniform1f(surface.uniform("u_quietness"), 0.85 * quietest);
			surface.draw();
		};

		const stop = runReel({ track: trackEl, render, measure, ambient: () => surface?.backend === "webgl" });
		return () => {
			stop();
			window.removeEventListener("pointermove", onMove);
			document.documentElement.removeEventListener("pointerleave", onLeave);
			pass?.dispose();
			if (gl) {
				gl.deleteTexture(gridTexture);
				gl.deleteTexture(atlasTexture);
			}
			surface?.dispose();
		};
	}, []);

	const scene = (i: number) => (el: HTMLDivElement | null) => {
		scenes.current[i] = el;
	};

	return (
		<div className="gp-page gf-page">
			<section ref={trackRef} className="gf-track" style={{ height: `${(SCENES + 1) * 100}vh` }}>
				<div className="gp-stage gf-stage" data-backend="fallback">
					<canvas ref={canvasRef} className="gp-canvas" aria-hidden="true" />
					<GlyphHead />

					<div ref={scene(0)} className="gf-scene gf-opening">
						<div data-copy>
							<h1>
								A canvas for
								<br />
								working things out.
							</h1>
							<p>Design websites, apps and presentations with your agent, on a canvas that runs on your Mac.</p>
						</div>
					</div>
					<div ref={scene(1)} className="gf-scene">
						<h2 data-copy>Ask your agent for a screen. It writes the frame as a TSX file in your project.</h2>
					</div>
					<div ref={scene(2)} className="gf-scene">
						<h2 data-copy>spool runs every frame live, side by side on one infinite canvas.</h2>
					</div>
					<div ref={scene(3)} className="gf-scene">
						<h2 data-copy>Link frames into a flow and walk through it like the real thing.</h2>
					</div>
					<div ref={scene(4)} className="gf-scene">
						<h2 data-copy>Every frame is a file in your repo, so Git keeps each version you try.</h2>
					</div>
					<div ref={scene(5)} className="gf-scene gf-ending" id="start">
						<div data-copy>
							<h2>Try it on the next thing you're unsure about.</h2>
							<div className="gp-actions">
								<a className="gp-download" href={DOWNLOAD}>
									Download for Mac
								</a>
								<CopyLine className="gp-command" command={INSTALL} />
							</div>
							<p className="gp-fine">Free and MIT licensed. Apple silicon, macOS 14 or later.</p>
						</div>
					</div>
				</div>
			</section>
			<GlyphFoot />
		</div>
	);
}

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
