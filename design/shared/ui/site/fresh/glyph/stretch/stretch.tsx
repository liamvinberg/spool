import { useEffect, useRef } from "react";
import { GlyphFoot, GlyphHead } from "../chrome";
import { createSurface } from "../gl";
import { CopyLine, DOWNLOAD, INSTALL } from "../install";
import { clamp, ease, lerp, range, window4 } from "../math";
import { runReel, setLayer } from "../reel";
import fragment from "./light.glsl";
import "../glyph.css";
import "./stretch.css";

/* The film runs on u, from 0 to 6: one unit of scroll per scene, a screen tall each. */
const SCENES = 6;

/* When each scene arrives and leaves, in u. The opening is already there. */
const CUES: [number, number, number, number][] = [
	[-Infinity, -Infinity, 0.38, 0.8],
	[0.82, 1.02, 1.8, 2.02],
	[2.02, 2.2, 2.82, 3.02],
	[3.02, 3.2, 3.86, 4.06],
	[4.06, 4.26, 4.82, 5.02],
	[5.02, 5.3, Infinity, Infinity],
];
/* Under reduced motion the film cuts between these held shots, one per scene. */
const RESTS = [0.2, 1.72, 2.76, 3.62, 4.62, 5.9];

/* Each heading's resting axes and the widest it may ever get, which sets its size. */
type Rest = { wdth: number; wght: number; peak: [number, number] };
const REST: Rest[] = [
	{ wdth: 100, wght: 560, peak: [112, 820] },
	{ wdth: 100, wght: 520, peak: [112, 820] },
	{ wdth: 125, wght: 330, peak: [125, 520] },
	{ wdth: 100, wght: 480, peak: [114, 860] },
	{ wdth: 96, wght: 420, peak: [112, 820] },
	{ wdth: 100, wght: 600, peak: [112, 820] },
];

const WALK = ["cart", "checkout", "pay", "receipt"];
const HISTORY = [
	{ hash: "a41f2c9", message: "receipt: lead with the order number" },
	{ hash: "7d03e18", message: "checkout: split into two steps" },
	{ hash: "3be6d70", message: "pay: try a phone layout" },
	{ hash: "c2b95a4", message: "cart: first pass" },
];
const FILE = "design/frames/checkout/frame.tsx";

type Glyph = { el: HTMLElement; index: number; x: number; y: number; axes: string; alpha: string };
type Heading = { el: HTMLElement; scene: number; lines: HTMLElement[]; glyphs: Glyph[]; size: number };

/** A heading set one letter to a box, so every letter can carry its own axes. */
function Kinetic({ as: Tag, scene, lines, className }: { as: "h1" | "h2"; scene: number; lines: string[]; className: string }) {
	let index = 0;
	return (
		<Tag className={className} data-kinetic={scene}>
			<span className="gp-sr">{lines.join(" ")}</span>
			<span aria-hidden="true">
				{lines.map((line) => (
					<span key={line} className="gs-line">
						{Array.from(line).map((char) => {
							const at = index++;
							return (
								<span key={at} className="gs-ch" data-at={at}>
									{char === " " ? " " : char}
								</span>
							);
						})}
					</span>
				))}
			</span>
		</Tag>
	);
}

export function StretchFilm() {
	const trackRef = useRef<HTMLElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const spillRef = useRef<HTMLDivElement>(null);
	const scenes = useRef<(HTMLDivElement | null)[]>([]);
	const fileRef = useRef<HTMLSpanElement>(null);
	const stops = useRef<(HTMLLIElement | null)[]>([]);
	const commits = useRef<(HTMLLIElement | null)[]>([]);

	useEffect(() => {
		const trackEl = trackRef.current;
		const canvas = canvasRef.current;
		const stage = canvas?.closest<HTMLElement>(".gp-stage");
		if (!trackEl || !canvas || !stage) return;
		const surface = createSurface(canvas, fragment, { scale: 0.7 });
		stage.dataset.backend = surface ? surface.backend : "fallback";

		const headings: Heading[] = Array.from(stage.querySelectorAll<HTMLElement>("[data-kinetic]")).map((el) => ({
			el,
			scene: Number(el.dataset.kinetic),
			lines: Array.from(el.querySelectorAll<HTMLElement>(".gs-line")),
			glyphs: Array.from(el.querySelectorAll<HTMLElement>(".gs-ch")).map((ch) => ({
				el: ch,
				index: Number(ch.dataset.at),
				x: 0,
				y: 0,
				axes: "",
				alpha: "",
			})),
			size: 100,
		}));

		// The walk rests on each word of its heading in turn, the way a walk rests on each frame.
		const walkHeading = headings.find((h) => h.scene === 3);
		const words: number[] = [];
		if (walkHeading) {
			let start = -1;
			walkHeading.glyphs.forEach((g, i) => {
				const blank = g.el.textContent === "\u00a0";
				if (!blank && start < 0) start = i;
				if ((blank || i === walkHeading.glyphs.length - 1) && start >= 0) {
					words.push((start + (blank ? i - 1 : i)) / 2);
					start = -1;
				}
			});
		}
		const walkIndex = (walk: number) => {
			const k = walk * (words.length - 1);
			const i = Math.min(words.length - 2, Math.floor(k));
			return lerp(words[i] ?? 0, words[i + 1] ?? 0, k - i);
		};

		let width = 1,
			height = 1,
			edge = 80,
			glow = 1000;
		// Set each heading as large as its CSS asks, then shrink it until its widest state fits.
		const measure = (w: number, h: number) => {
			width = w;
			height = h;
			edge = Number.parseFloat(getComputedStyle(stage).getPropertyValue("--gp-edge")) || Math.min(80, w * 0.056);
			surface?.resize(w, h);
			const spill = spillRef.current;
			if (spill) {
				glow = Math.round(Math.min(1000, Math.max(440, Math.min(w, h) * 1.1)));
				spill.style.width = spill.style.height = `${glow}px`;
			}
			for (const heading of headings) {
				const rest = REST[heading.scene];
				if (!rest) continue;
				heading.el.style.fontSize = "";
				const wanted = Number.parseFloat(getComputedStyle(heading.el).fontSize) || 100;
				for (const g of heading.glyphs) {
					g.el.style.fontVariationSettings = `"wdth" ${rest.peak[0]}, "wght" ${rest.peak[1]}`;
					g.axes = "";
				}
				const widest = Math.max(...heading.lines.map((line) => line.getBoundingClientRect().width), 1);
				const room = w - edge * 2;
				heading.size = Math.floor(wanted * Math.min(1, room / widest));
				heading.el.style.fontSize = `${heading.size}px`;
			}
		};

		// The cursor is the light. Without one, the light wanders on its own.
		let pointer: [number, number] | null = null;
		const onMove = (event: PointerEvent) => {
			if (event.pointerType === "mouse" || event.pointerType === "pen") pointer = [event.clientX, event.clientY];
		};
		const onLeave = () => {
			pointer = null;
		};
		window.addEventListener("pointermove", onMove, { passive: true });
		document.documentElement.addEventListener("pointerleave", onLeave);

		const born = performance.now();
		let lx = Number.NaN,
			ly = 0,
			strength = 0,
			last = born;

		const render = ({ progress, time, reduced }: Parameters<Parameters<typeof runReel>[0]["render"]>[0]) => {
			const now = performance.now();
			const dt = Math.min(0.1, (now - last) / 1000);
			last = now;
			const u = reduced ? (RESTS[Math.min(RESTS.length - 1, Math.floor(progress * RESTS.length))] ?? 0) : progress * SCENES;
			const intro = reduced ? 1 : range((now - born) / 1000, 0.15, 1.75);

			// Read every live letter's position first, from the layout the last frame left.
			const live = headings.filter((h) => {
				const cue = CUES[h.scene];
				return cue ? u >= cue[0] - 0.05 && u <= cue[3] + 0.05 : false;
			});
			for (const heading of live) {
				for (const g of heading.glyphs) {
					const box = g.el.getBoundingClientRect();
					g.x = box.left + box.width / 2;
					g.y = box.top + box.height * 0.55;
				}
			}
			const at = (heading: Heading | undefined, k: number): [number, number] | null => {
				if (!heading || heading.glyphs.length === 0) return null;
				const i = Math.max(0, Math.min(heading.glyphs.length - 1, k));
				const a = heading.glyphs[Math.floor(i)];
				const b = heading.glyphs[Math.min(heading.glyphs.length - 1, Math.floor(i) + 1)] ?? a;
				if (!a || !b) return null;
				const t = i - Math.floor(i);
				return [lerp(a.x, b.x, t), lerp(a.y, b.y, t)];
			};

			// Where the scenes want the light, and how strongly they override the cursor.
			const writeHead = range(u, 1.0, 1.66);
			const walk = glideWalk(u);
			const wander: [number, number] = [
				width * (0.6 + Math.sin(time * 0.19) * 0.22),
				height * (0.42 + Math.cos(time * 0.13 + 1) * 0.16),
			];
			let target: [number, number] = pointer && !reduced ? pointer : wander;
			let steer = 0;
			let steered: [number, number] | null = null;
			const writing = window4(u, 0.92, 1.02, 1.66, 1.82);
			const walking = window4(u, 3.1, 3.22, 3.8, 3.95);
			const stretching = window4(u, 2.04, 2.16, 2.72, 2.9);
			if (writing > 0) {
				// The light sits on the letter being written, the one the per-letter pass below makes newest.
				const h = headings.find((x) => x.scene === 1);
				steered = at(h, writeHead * ((h?.glyphs.length ?? 0) + 2) - 1);
				steer = writing;
			} else if (walking > 0) {
				steered = at(walkHeading, walkIndex(walk));
				steer = walking;
			} else if (stretching > 0) {
				const h = headings.find((x) => x.scene === 2);
				steered = at(h, ease(u, 2.08, 2.78) * ((h?.glyphs.length ?? 1) - 1));
				steer = stretching * 0.85;
			}
			if (steered) target = [lerp(target[0], steered[0], steer), lerp(target[1], steered[1], steer)];
			const calm = window4(u, 4.12, 4.3, 4.8, 4.98);
			// Between scenes, with no letters to light, the lamp dims rather than glowing at nothing.
			const present = Math.max(...CUES.map(([a, b, c, d]) => window4(u, a, b, c, d)));
			const wantStrength = (1 - calm * 0.8) * (u < 0.1 ? 0.55 + 0.45 * intro : 1) * (0.3 + 0.7 * present);
			if (Number.isNaN(lx) || reduced) {
				lx = target[0];
				ly = target[1];
				strength = wantStrength;
			} else {
				// Steered by scroll the light keeps up; following a cursor it trails a little, like a lamp on a cord.
				const rate = 1 - Math.exp(-(steer > 0.5 ? 14 : 6.5) * dt);
				lx += (target[0] - lx) * rate;
				ly += (target[1] - ly) * rate;
				strength += (wantStrength - strength) * (1 - Math.exp(-4 * dt));
			}

			// Each letter's axes: it arrives compressed and heavy, resolves, swells under the light, and leaves wide and thin.
			let size = 120;
			for (const heading of live) {
				const rest = REST[heading.scene];
				const cue = CUES[heading.scene];
				if (!rest || !cue) continue;
				size = heading.size;
				const n = Math.max(1, heading.glyphs.length - 1);
				const reach = heading.size * 0.95;
				for (const g of heading.glyphs) {
					const f = g.index / n;
					let wdth = rest.wdth;
					let wght = rest.wght;
					let alpha = 1;
					let arrive = 1;
					if (heading.scene === 0) arrive = ease(intro, f * 0.5, f * 0.5 + 0.5);
					else if (heading.scene === 1) {
						// Written one letter at a time: the newest letter is wide, heavy and lit.
						const k = writeHead * (heading.glyphs.length + 2) - g.index;
						arrive = clamp(k * 1.4);
						const fresh = k > 0 ? Math.exp(-k / 2.6) : 0;
						wdth += fresh * 22;
						wght += fresh * (880 - wght);
					} else if (heading.scene === 2) {
						// Laid out side by side: the line spreads from compressed to extended across the screen.
						const s = ease(u, 2.04 + f * 0.24, 2.4 + f * 0.36);
						wdth = lerp(75, rest.wdth, s);
						wght = lerp(780, rest.wght, s);
						arrive = ease(u, 2.02 + f * 0.12, 2.14 + f * 0.12);
					} else if (heading.scene === 3) {
						arrive = ease(u, cue[0] + f * 0.1, cue[1] + f * 0.06);
						const k = walkIndex(walk);
						const near = Math.exp(-((g.index - k) ** 2) / (2 * 1.5 ** 2)) * window4(u, 3.1, 3.22, 3.8, 3.95);
						wght += near * (860 - wght);
						wdth += near * 14;
					} else arrive = ease(u, cue[0] + f * (cue[1] - cue[0]) * 0.55, cue[1] + f * (cue[1] - cue[0]) * 0.3);

					if (heading.scene !== 1 && heading.scene !== 2) {
						wdth = lerp(75, wdth, arrive);
						wght = lerp(860, wght, arrive);
					}
					alpha = ease(arrive, 0, 0.7);

					// The light swells the letters it falls on.
					if (!reduced) {
						const d2 = (g.x - lx) ** 2 + (g.y - ly) ** 2;
						const lit = Math.exp(-d2 / (2 * reach * reach)) * strength * (pointer || steer > 0 ? 1 : 0.6);
						wght += lit * (rest.peak[1] - wght) * 0.9;
						wdth += lit * Math.max(0, rest.peak[0] - wdth) * 0.75;
					}

					const leave = cue[3] === Infinity ? 0 : ease(u, cue[2] + f * (cue[3] - cue[2]) * 0.45, cue[2] + (cue[3] - cue[2]) * (0.55 + f * 0.45));
					wdth = lerp(wdth, 125, leave);
					wght = lerp(wght, 140, leave);
					alpha *= 1 - leave;

					const axes = `"wdth" ${clamp(wdth, 75, 125).toFixed(1)}, "wght" ${clamp(wght, 100, 900).toFixed(0)}`;
					if (axes !== g.axes) {
						g.el.style.fontVariationSettings = axes;
						g.axes = axes;
					}
					const a = alpha.toFixed(3);
					if (a !== g.alpha) {
						g.el.style.opacity = a;
						g.alpha = a;
					}
				}
			}
			for (const heading of headings) {
				const cue = CUES[heading.scene];
				if (!cue) continue;
				heading.el.style.visibility = u >= cue[0] - 0.05 && u <= cue[3] + 0.05 ? "visible" : "hidden";
			}

			// The supporting lines arrive with their scene and drift away with it.
			CUES.forEach(([a, b, c, d], i) => {
				const arriving = a === -Infinity ? 1 - intro : 1 - ease(u, a, b);
				const leaving = d === Infinity ? 0 : ease(u, c, d);
				const alpha = (a === -Infinity ? ease(intro, 0.45, 1) : ease(u, a, b)) * (1 - leaving);
				const y = reduced ? 0 : arriving * 18 - leaving * 14;
				setLayer(scenes.current[i], alpha, `translate3d(0, ${y.toFixed(2)}px, 0)`);
			});
			if (fileRef.current) fileRef.current.style.setProperty("--shown", String(Math.round(range(u, 1.04, 1.6) * FILE.length)));
			stops.current.forEach((el, i) => {
				if (!el) return;
				const k = walk * (WALK.length - 1);
				el.dataset.on = Math.abs(k - i) < 0.5 && u > 3.1 && u < 3.95 ? "true" : k > i ? "past" : "false";
			});
			commits.current.forEach((el, i) => {
				if (!el) return;
				const a = ease(u, 4.24 + i * 0.08, 4.42 + i * 0.08);
				el.style.opacity = a.toFixed(3);
				el.style.transform = reduced ? "" : `translate3d(0, ${((1 - a) * 8).toFixed(2)}px, 0)`;
			});

			const spill = spillRef.current;
			if (spill) {
				spill.style.transform = `translate3d(${(lx - glow / 2).toFixed(1)}px, ${(ly - glow / 2).toFixed(1)}px, 0)`;
				spill.style.opacity = (strength * (1 - ease(u, 5.1, 5.6) * 0.3)).toFixed(3);
			}

			if (!surface) return;
			const { gl } = surface;
			gl.uniform2f(surface.uniform("u_size"), width, height);
			gl.uniform1f(surface.uniform("u_time"), surface.backend === "software" ? 3 : time + 3);
			gl.uniform4f(surface.uniform("u_light"), lx, ly, size * 1.9, strength);
			const second = (u < 0.8 ? 0.55 * (1 - ease(u, 0.3, 0.75)) : 0) * (pointer ? 1 : 0);
			gl.uniform4f(surface.uniform("u_second"), wander[0], wander[1], size * 1.6, second);
			gl.uniform1f(surface.uniform("u_flood"), ease(u, 5.25, 5.75));
			surface.draw();
		};

		const stop = runReel({
			track: trackEl,
			render,
			measure,
			ambient: () => true,
		});
		return () => {
			stop();
			window.removeEventListener("pointermove", onMove);
			document.documentElement.removeEventListener("pointerleave", onLeave);
			surface?.dispose();
		};
	}, []);

	const scene = (i: number) => (el: HTMLDivElement | null) => {
		scenes.current[i] = el;
	};

	return (
		<div className="gp-page gs-page">
			<section ref={trackRef} className="gs-track" style={{ height: `${(SCENES + 1) * 100}vh` }}>
				<div className="gp-stage gs-stage" data-backend="fallback">
					<canvas ref={canvasRef} className="gp-canvas" aria-hidden="true" />
					<div className="gs-type">
						<Kinetic as="h1" scene={0} className="gs-h gs-h0" lines={["A canvas", "for working", "things out."]} />
						<Kinetic as="h2" scene={1} className="gs-h gs-h1" lines={["Your agent", "writes the frame."]} />
						<Kinetic as="h2" scene={2} className="gs-h gs-h2" lines={["Side by side."]} />
						<Kinetic as="h2" scene={3} className="gs-h gs-h3" lines={["Then walk", "through it."]} />
						<Kinetic as="h2" scene={4} className="gs-h gs-h4" lines={["Files in", "your repo."]} />
						<Kinetic as="h2" scene={5} className="gs-h gs-h5" lines={["Try it on the next", "thing you're", "unsure about."]} />
					</div>
					<div className="gs-wall" aria-hidden="true">
						<div ref={spillRef} className="gs-glow" />
					</div>
					<GlyphHead />

					<div ref={scene(0)} className="gs-scene gs-s0">
						<p>Design websites, apps and presentations with your agent, on a canvas that runs on your Mac.</p>
						<a className="gs-quiet-link" href="#start">
							Download for Mac
						</a>
					</div>
					<div ref={scene(1)} className="gs-scene gs-s1">
						<p>Ask Claude Code, Codex or any agent for a screen. It writes a TSX file in your project and spool runs it.</p>
						<span ref={fileRef} className="gs-file gp-mono">
							{FILE}
						</span>
					</div>
					<div ref={scene(2)} className="gs-scene gs-s2">
						<p>Every frame runs live on one infinite canvas, arranged the way you think about them.</p>
					</div>
					<div ref={scene(3)} className="gs-scene gs-s3">
						<p>Link frames into a flow and click through it like the real thing.</p>
						<ol className="gs-walk gp-mono" aria-label="A walk through four frames">
							{WALK.map((name, i) => (
								<li
									key={name}
									ref={(el) => {
										stops.current[i] = el;
									}}
								>
									{name}
								</li>
							))}
						</ol>
					</div>
					<div ref={scene(4)} className="gs-scene gs-s4">
						<p>Each frame is a file, so Git keeps every version you try.</p>
						<div className="gs-log gp-mono">
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
					</div>
					<div ref={scene(5)} className="gs-scene gs-s5" id="start">
						<div className="gp-actions">
							<a className="gp-download" href={DOWNLOAD}>
								Download for Mac
							</a>
							<CopyLine className="gp-command" command={INSTALL} />
						</div>
						<p className="gp-fine">Free and MIT licensed. Apple silicon, macOS 14 or later.</p>
					</div>
				</div>
			</section>
			<GlyphFoot />
		</div>
	);
}

/** The walk holds a beat on each of the four frames rather than sliding past them. */
function glideWalk(u: number) {
	const t = range(u, 3.22, 3.8) * 3;
	const step = Math.floor(t);
	const within = t - step;
	const settle = within < 0.55 ? 0 : (within - 0.55) / 0.45;
	return Math.min(1, (step + settle * settle * (3 - 2 * settle)) / 3);
}
