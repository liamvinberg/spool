import { useEffect, useRef } from "react";
import { SpoolMark } from "shared/ui/spool/mark";
import { createField } from "../field";
import { CopyLine, DOWNLOAD, INSTALL, REPO } from "../install";
import { ease, glide, type Key, lerp, track, window4 } from "../math";
import { runReel, setLayer } from "../reel";
import fragment from "./light.glsl";
import "../film.css";
import "./light.css";

/*
 * A film told in type. The words are the actors: they arrive, hold, and some
 * of them walk across the screen to become the next line. One red lamp lights
 * them from behind. The film runs on u, from 0 to 6, a screen of scroll each.
 */
const SCENES = 6;
const FACE = "Inter Tight";

type Shot = {
	lines: string[];
	/** Line breaks for a phone. */
	narrow?: string[];
	/** Type size as a share of the screen's width, before it is fitted. */
	size: number;
	align: "left" | "center";
	/** Where the first line's top sits, as a share of the screen's height. */
	top: number;
	/** Words spread evenly across the width, like frames in a row. */
	spread?: boolean;
	/** In and out, in u. A shot that becomes the next one leaves by its morph instead. */
	cue: [number, number, number, number];
	/** The window in which this shot's letters walk into the next shot's places. */
	morph?: [number, number];
};

const SHOTS: Shot[] = [
	{
		lines: ["A canvas for", "working things out."],
		narrow: ["A canvas", "for working", "things out."],
		size: 0.094,
		align: "left",
		top: 0.24,
		cue: [-Infinity, -Infinity, 0.45, 0.8],
	},
	{
		lines: ["“make checkout two steps”"],
		narrow: ["“make checkout", "two steps”"],
		size: 0.068,
		align: "center",
		top: 0.38,
		cue: [0.85, 1.15, Infinity, Infinity],
		morph: [1.42, 1.85],
	},
	{
		lines: ["checkout/frame.tsx"],
		size: 0.09,
		align: "center",
		top: 0.38,
		cue: [Infinity, Infinity, Infinity, Infinity],
		morph: [2.05, 2.5],
	},
	{
		lines: ["cart checkout pay receipt"],
		narrow: ["cart checkout", "pay receipt"],
		size: 0.05,
		align: "center",
		top: 0.42,
		spread: true,
		cue: [Infinity, Infinity, 3.88, 4.08],
	},
	{
		lines: ["It's all files."],
		size: 0.11,
		align: "left",
		top: 0.28,
		cue: [4.1, 4.4, 4.75, 4.95],
	},
	{
		lines: ["Your turn."],
		size: 0.14,
		align: "left",
		top: 0.2,
		cue: [5.05, 5.45, Infinity, Infinity],
	},
];

/* The lamp: x and y as shares of the screen, radius as a share of its short side, power. */
const LAMP: Key<[number, number, number, number]>[] = [
	{ at: 0, value: [0.4, 0.43, 0.11, 1] },
	{ at: 0.6, value: [0.56, 0.62, 0.14, 1] },
	{ at: 1.05, value: [0.5, 0.43, 0.1, 1.05] },
	{ at: 1.65, value: [0.38, 0.47, 0.12, 1.05] },
	{ at: 2.0, value: [0.56, 0.45, 0.1, 1.05] },
	{ at: 2.6, value: [0.5, 0.24, 0.11, 1.15] },
	{ at: 2.95, value: [0.1, 0.475, 0.075, 1.15] },
	{ at: 3.85, value: [0.9, 0.475, 0.075, 1.15] },
	{ at: 4.3, value: [0.26, 0.36, 0.11, 1] },
	{ at: 5.0, value: [0.32, 0.3, 0.14, 1] },
	{ at: 6, value: [0.42, 0.34, 0.24, 1.05] },
];

/* The small literal lines under the type, and when each shows. */
const CAPTIONS: [number, number, number, number][] = [
	[-Infinity, -Infinity, 0.45, 0.75],
	[0.95, 1.2, 1.95, 2.12],
	[2.35, 2.6, 2.8, 2.96],
	[2.98, 3.2, 3.82, 4.0],
	[4.15, 4.4, 4.75, 4.95],
	[5.2, 5.55, Infinity, Infinity],
];

/* Under reduced motion the film cuts between these composed shots. */
const RESTS = [0.2, 1.25, 1.95, 2.72, 3.4, 4.55, 5.9];

type Glyph = { ch: string; x: number; y: number; size: number };

function layout(ctx: CanvasRenderingContext2D, shot: Shot, width: number, height: number): Glyph[] {
	const narrow = width < 760;
	const lines = narrow && shot.narrow ? shot.narrow : shot.lines;
	const margin = narrow ? 20 : Math.min(80, width * 0.056);
	const room = width - margin * 2;
	let size = Math.min(shot.size * width * (narrow ? 1.9 : 1), height * 0.17);
	const track = -0.045;
	const measure = (text: string, s: number) => {
		ctx.font = `600 ${s}px "${FACE}"`;
		return ctx.measureText(text).width + Math.max(0, text.length - 1) * track * s;
	};
	if (!shot.spread) {
		const widest = Math.max(...lines.map((line) => measure(line, size)));
		if (widest > room) size *= room / widest;
	}
	ctx.font = `600 ${size}px "${FACE}"`;
	const glyphs: Glyph[] = [];
	const lead = size * (shot.spread ? 1.7 : 0.98);
	lines.forEach((line, row) => {
		const baseline = shot.top * height + size * 0.8 + row * lead;
		if (shot.spread) {
			const words = line.split(" ");
			words.forEach((word, i) => {
				const center = margin + ((i + 0.5) / words.length) * room;
				const w = measure(word, size);
				ctx.font = `600 ${size}px "${FACE}"`;
				for (let j = 0; j < word.length; j++) {
					const x = center - w / 2 + ctx.measureText(word.slice(0, j)).width + j * track * size;
					glyphs.push({ ch: word[j] ?? "", x, y: baseline, size });
				}
			});
			return;
		}
		const w = measure(line, size);
		ctx.font = `600 ${size}px "${FACE}"`;
		const start = shot.align === "center" ? (width - w) / 2 : margin;
		for (let j = 0; j < line.length; j++) {
			const ch = line[j] ?? "";
			if (ch === " ") continue;
			glyphs.push({ ch, x: start + ctx.measureText(line.slice(0, j)).width + j * track * size, y: baseline, size });
		}
	});
	return glyphs;
}

/** Pair each letter of the next shot with a matching letter of this one, nearest in reading order. */
function cast(from: Glyph[], to: Glyph[]) {
	const used = new Set<number>();
	return to.map((glyph, i) => {
		let best = -1,
			distance = Infinity;
		from.forEach((candidate, j) => {
			if (used.has(j) || candidate.ch.toLowerCase() !== glyph.ch.toLowerCase()) return;
			const d = Math.abs(j / from.length - i / to.length);
			if (d < distance) {
				distance = d;
				best = j;
			}
		});
		if (best >= 0) used.add(best);
		return best;
	});
}

type Draw = { ch: string; x: number; y: number; size: number; alpha: number };

export function LightFilm() {
	const trackRef = useRef<HTMLElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const captions = useRef<(HTMLDivElement | null)[]>([]);
	const shotsRef = useRef<(HTMLParagraphElement | null)[]>([]);

	useEffect(() => {
		const trackEl = trackRef.current;
		const canvas = canvasRef.current;
		if (!trackEl || !canvas) return;
		const stage = canvas.closest<HTMLElement>(".fl-stage");
		const field = createField(canvas, fragment, 1.25);
		if (stage) stage.dataset.backend = field ? field.backend : "fallback";
		const type = document.createElement("canvas");
		const ctx = type.getContext("2d");
		let texture: WebGLTexture | null = null;
		if (field) {
			const { gl } = field;
			texture = gl.createTexture();
			gl.bindTexture(gl.TEXTURE_2D, texture);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		}
		let width = 1,
			height = 1,
			placed: Glyph[][] = [],
			roles: number[][] = [],
			drawnAt = Number.NaN,
			fontsReady = false;

		const measure = (w: number, h: number) => {
			width = w;
			height = h;
			field?.resize(w, h);
			if (!ctx) return;
			placed = SHOTS.map((shot) => layout(ctx, shot, w, h));
			roles = SHOTS.map((shot, i) => (shot.morph ? cast(placed[i] ?? [], placed[i + 1] ?? []) : []));
			drawnAt = Number.NaN;
		};

		// Every letter on screen at u: shots entering and leaving, or walking into the next shot.
		const cue = (u: number): Draw[] => {
			const out: Draw[] = [];
			SHOTS.forEach((shot, k) => {
				const glyphs = placed[k] ?? [];
				const previous = SHOTS[k - 1];
				const [a, b, c, d] = shot.cue;
				const n = Math.max(1, glyphs.length);
				if (shot.morph && u >= shot.morph[0]) {
					const [m0, m1] = shot.morph;
					if (u > m1) return;
					const next = placed[k + 1] ?? [];
					const role = roles[k] ?? [];
					const span = m1 - m0;
					const kept = new Set(role.filter((j) => j >= 0));
					glyphs.forEach((g, j) => {
						if (kept.has(j)) return;
						const fade = ease(u, m0, m0 + span * 0.45);
						out.push({ ...g, y: g.y - fade * g.size * 0.3, alpha: 1 - fade });
					});
					next.forEach((g, i) => {
						const from = glyphs[role[i] ?? -1];
						if (!from) {
							out.push({ ...g, alpha: ease(u, m1 - span * 0.45, m1) });
							return;
						}
						const lag = (i / Math.max(1, next.length)) * span * 0.3;
						const t = glide(u, m0 + lag, m0 + lag + span * 0.7);
						out.push({
							ch: g.ch,
							x: lerp(from.x, g.x, t),
							y: lerp(from.y, g.y, t) - Math.sin(Math.PI * t) * g.size * 0.35,
							size: lerp(from.size, g.size, t),
							alpha: 1,
						});
					});
					return;
				}
				// A shot that arrived by a morph is already in place once the morph ends.
				if (previous?.morph && u <= previous.morph[1]) return;
				if (Number.isFinite(a) && !previous?.morph && u < a) return;
				if (Number.isFinite(d) && u > d + 0.2) return;
				glyphs.forEach((g, j) => {
					const lag = (j / n) * 0.16;
					const arrive = Number.isFinite(a) && !previous?.morph ? ease(u, a + lag, b + lag) : 1;
					const leave = Number.isFinite(c) ? ease(u, c + lag, d + lag) : 0;
					const alpha = arrive * (1 - leave);
					if (alpha <= 0.002) return;
					out.push({
						ch: g.ch,
						x: g.x + ((j - n / 2) / n) * leave * g.size * 1.2,
						y: g.y + (1 - arrive) * g.size * 0.28 - leave * g.size * 0.22,
						size: g.size,
						alpha,
					});
				});
			});
			return out;
		};

		const paintType = (u: number) => {
			if (!field || !ctx || !texture) return;
			const { gl } = field;
			if (type.width !== canvas.width || type.height !== canvas.height) {
				type.width = canvas.width;
				type.height = canvas.height;
			}
			ctx.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
			ctx.clearRect(0, 0, width, height);
			ctx.fillStyle = "#fff";
			ctx.textBaseline = "alphabetic";
			let font = "";
			for (const glyph of cue(u)) {
				const next = `600 ${glyph.size.toFixed(1)}px "${FACE}"`;
				if (next !== font) {
					ctx.font = next;
					font = next;
				}
				ctx.globalAlpha = Math.min(1, glyph.alpha);
				ctx.fillText(glyph.ch, glyph.x, glyph.y);
			}
			ctx.globalAlpha = 1;
			gl.bindTexture(gl.TEXTURE_2D, texture);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, type);
		};

		const render = ({ progress, time, reduced, interval }: Parameters<Parameters<typeof runReel>[0]["render"]>[0]) => {
			const u = reduced ? (RESTS[Math.min(RESTS.length - 1, Math.floor(progress * RESTS.length))] ?? 0) : progress * SCENES;
			CAPTIONS.forEach(([a, b, c, d], i) => {
				const alpha = window4(u, a, b, c, d);
				const rise = reduced || a === -Infinity ? 0 : (1 - ease(u, a, b)) * 14;
				setLayer(captions.current[i], alpha, `translate3d(0, ${rise.toFixed(2)}px, 0)`);
			});
			// Without WebGL the words fall back to plain text, cued the same way.
			if (!field) {
				SHOTS.forEach((shot, i) => {
					const [a, b] = shot.cue;
					const start = Number.isFinite(a) ? a : (SHOTS[i - 1]?.morph?.[1] ?? 0) - 0.2;
					const end = shot.morph ? shot.morph[0] : shot.cue[3];
					setLayer(shotsRef.current[i], window4(u, start, Number.isFinite(b) ? b : start + 0.2, end - 0.2, end));
				});
				return;
			}
			if (!fontsReady) return;
			if (field.sample(interval)) {
				field.resize(width, height);
				drawnAt = Number.NaN;
			}
			if (u !== drawnAt) {
				paintType(u);
				drawnAt = u;
			}
			const [lx = 0.5, ly = 0.5, lr = 0.3, lp = 1] = track(LAMP, u);
			const short = Math.min(width, height);
			const walking = ease(u, 2.9, 3.05) * (1 - ease(u, 3.85, 4.05));
			const sway = reduced ? 0 : Math.sin(time * 0.5) * 0.012;
			const { gl } = field;
			gl.uniform1i(field.uniform("u_type"), 0);
			gl.uniform2f(field.uniform("u_size"), width, height);
			gl.uniform4f(field.uniform("u_light"), (lx + sway) * width, (ly + sway * 0.6) * height, lr * short, lp);
			gl.uniform1f(field.uniform("u_face"), lerp(0.95, 0.2, walking));
			gl.uniform1f(field.uniform("u_near"), lerp(0.1, 0.9, walking));
			gl.uniform1f(field.uniform("u_flood"), ease(u, 5.0, 5.8) * 0.7);
			gl.uniform1f(field.uniform("u_time"), field.backend === "software" ? 4 : time + 4);
			field.draw();
		};

		const stop = runReel({
			track: trackEl,
			render,
			measure,
			ambient: () => field?.backend === "webgl",
		});
		void document.fonts.load(`600 100px "${FACE}"`).then(() => {
			fontsReady = true;
			measure(window.innerWidth, window.innerHeight);
			render({ progress: 0, time: 0, width, height, reduced: false, settling: false, interval: 16 });
			window.dispatchEvent(new Event("scroll"));
		});
		return () => {
			stop();
			if (field && texture) field.gl.deleteTexture(texture);
			field?.dispose();
		};
	}, []);

	const captionRef = (i: number) => (el: HTMLDivElement | null) => {
		captions.current[i] = el;
	};

	return (
		<div className="fm-page fl-page">
			<section ref={trackRef} className="fl-track" style={{ height: `${(SCENES + 1) * 100}vh` }}>
				<div className="fl-stage" data-backend="fallback">
					<canvas ref={canvasRef} className="fl-canvas" aria-hidden="true" />
					<div className="fl-shots">
						{SHOTS.map((shot, i) => (
							<p
								key={shot.lines.join(" ")}
								ref={(el) => {
									shotsRef.current[i] = el;
								}}
								className="fl-shot"
								style={{ top: `${shot.top * 100}vh` }}
								data-align={shot.align}
							>
								{shot.lines.join(" ")}
							</p>
						))}
					</div>

					<header className="fl-head">
						<a className="fl-brand" href="https://spool.page/" aria-label="spool home">
							<SpoolMark className="fl-mark" />
							<span>spool</span>
						</a>
						<nav aria-label="Website">
							<a href={`${REPO}#readme`}>Docs</a>
							<a href={REPO}>GitHub</a>
							<a href={DOWNLOAD}>Download</a>
						</nav>
					</header>

					<div ref={captionRef(0)} className="fl-caption fl-visible">
						<p>Design websites, apps and presentations with your agent, on a canvas that runs on your Mac.</p>
					</div>
					<div ref={captionRef(1)} className="fl-caption">
						<p>Ask your agent for a screen. It writes the frame as a TSX file in your project.</p>
					</div>
					<div ref={captionRef(2)} className="fl-caption">
						<p>spool shows every frame live, side by side on one infinite canvas.</p>
					</div>
					<div ref={captionRef(3)} className="fl-caption">
						<p>Link them into a flow and walk through it like the real thing.</p>
					</div>
					<div ref={captionRef(4)} className="fl-caption">
						<p>Every frame is a TSX file in your repo, so Git keeps each version you try.</p>
					</div>
					<div ref={captionRef(5)} className="fl-caption fl-start" id="start">
						<div className="fl-actions">
							<a className="fl-download" href={DOWNLOAD}>
								Download for Mac
							</a>
							<CopyLine className="fl-command" command={INSTALL} />
						</div>
						<p>Free and MIT licensed. Apple silicon, macOS 14 or later.</p>
					</div>
				</div>
			</section>

			<footer className="fl-footer">
				<p>
					Made by Liam. Follow along on X as <a href="https://x.com/liamvinberg">@liamvinberg</a>.
				</p>
				<nav aria-label="Footer">
					<span className="fl-brand">
						<SpoolMark className="fl-mark" />
						<span>spool</span>
					</span>
					<a href={`${REPO}#readme`}>Docs</a>
					<a href={REPO}>GitHub</a>
					<a href={`${REPO}/blob/main/LICENSE.md`}>MIT licence</a>
					<a href="https://spool.page/privacy">Privacy</a>
				</nav>
			</footer>
		</div>
	);
}
