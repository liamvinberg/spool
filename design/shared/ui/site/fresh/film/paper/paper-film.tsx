import { useEffect, useRef } from "react";
import { SpoolMark } from "shared/ui/spool/mark";
import { createField } from "../field";
import { CopyLine, DOWNLOAD, INSTALL, REPO } from "../install";
import { ease, glide, lerp, range } from "../math";
import { runReel, setLayer } from "../reel";
import fragment from "./paper.glsl";
import "../film.css";
import "./paper.css";

/*
 * One long sheet, five panels wide, and a camera tracking along it. The film runs
 * on u from 0 to LENGTH. Each panel rests a moment before the camera moves on,
 * then the sheet pulls back to show the whole storyboard at once.
 */
const PANELS = 5;
const LENGTH = 6.2;
const arrival = (panel: number) => (panel === 0 ? 0 : 0.3 + panel);
const PULL = [4.75, 5.6] as const;
/* Under reduced motion the camera cuts between these resting points. */
const RESTS = [0.6, 1.62, 2.62, 3.62, 4.7, LENGTH];

/* When each drop of ink lands and how long it bleeds, in u. */
const BLEEDS: [number, number, number][] = [
	// start, end, size it starts at
	[0.02, 1.15, 0.1],
	[0.25, 0.95, 0],
	[0.95, 1.9, 0],
	[3.1, 3.75, 0],
	[3.95, 4.55, 0],
];

type Line = { text: string; kind: "prompt" | "note" | "code" | "blank" };
const WRITING: Line[] = [
	{ text: '~/studio $ codex "a booking page for the wheel class"', kind: "prompt" },
	{ text: "wrote design/frames/booking/frame.tsx", kind: "note" },
	{ text: "", kind: "blank" },
	{ text: "export default function Booking() {", kind: "code" },
	{ text: "  return (", kind: "code" },
	{ text: '    <Page title="Thursday wheel class">', kind: "code" },
	{ text: "      <Seats left={4} />", kind: "code" },
	{ text: "      <Button>Book a seat</Button>", kind: "code" },
	{ text: "    </Page>", kind: "code" },
	{ text: "  );", kind: "code" },
	{ text: "}", kind: "code" },
];
const TYPED = WRITING.reduce((sum, line) => sum + Math.max(1, line.text.length), 0);

const SKETCHES = [
	{ name: "class", shape: "wide" },
	{ name: "booking", shape: "wide" },
	{ name: "confirm", shape: "phone" },
	{ name: "reminder", shape: "small" },
];

const HISTORY = [
	{ hash: "e1c07a3", message: "reminder: send it the day before" },
	{ hash: "9f4b210", message: "confirm: show the studio on a map" },
	{ hash: "52ad8e1", message: "booking: fewer fields" },
	{ hash: "0b7f6c4", message: "class: first draft" },
];

/** Where an element sits on the sheet, in sheet pixels, ignoring the camera's transform. */
function onSheet(element: HTMLElement, sheet: HTMLElement) {
	let x = 0,
		y = 0;
	let node: HTMLElement | null = element;
	while (node && node !== sheet) {
		x += node.offsetLeft;
		y += node.offsetTop;
		node = node.offsetParent as HTMLElement | null;
	}
	return { x, y, w: element.offsetWidth, h: element.offsetHeight };
}

/** A smooth path through points: Catmull-Rom written as SVG cubic curves. */
function curve(points: [number, number][]) {
	let d = "";
	for (let i = 0; i < points.length - 1; i++) {
		const p0 = points[Math.max(0, i - 1)];
		const p1 = points[i];
		const p2 = points[i + 1];
		const p3 = points[Math.min(points.length - 1, i + 2)];
		if (!p0 || !p1 || !p2 || !p3) continue;
		if (!d) d = `M${p1[0].toFixed(1)} ${p1[1].toFixed(1)}`;
		const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
		const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
		d += `C${c1.map((v) => v.toFixed(1)).join(" ")} ${c2.map((v) => v.toFixed(1)).join(" ")} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
	}
	return d;
}

export function PaperFilm() {
	const trackRef = useRef<HTMLElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const sheetRef = useRef<HTMLDivElement>(null);
	const panels = useRef<(HTMLElement | null)[]>([]);
	const lines = useRef<(HTMLSpanElement | null)[]>([]);
	const threadRef = useRef<SVGPathElement>(null);
	const endRef = useRef<HTMLDivElement>(null);
	const headRef = useRef<HTMLElement>(null);

	useEffect(() => {
		const trackEl = trackRef.current;
		const canvas = canvasRef.current;
		const sheet = sheetRef.current;
		if (!trackEl || !canvas || !sheet) return;
		const field = createField(canvas, fragment);
		const stage = canvas.closest<HTMLElement>(".fp-stage");
		if (stage) stage.dataset.backend = field ? field.backend : "fallback";
		let width = 1,
			height = 1,
			fit = 0.18,
			stripTop = 0;
		let drops: { x: number; y: number; r: number }[] = [];
		let washes: { x: number; y: number; w: number; h: number }[] = [];

		const measure = (w: number, h: number) => {
			width = w;
			height = h;
			field?.resize(w, h);
			const margin = w < 760 ? 16 : 80;
			fit = (w - margin * 2) / (w * PANELS);
			stripTop = h * (w < 760 ? 0.17 : 0.2);
			drops = [...sheet.querySelectorAll<HTMLElement>("[data-drop]")].map((el) => {
				const box = onSheet(el, sheet);
				return { x: box.x + box.w / 2, y: box.y + box.h / 2, r: box.w / 2 };
			});
			washes = [...sheet.querySelectorAll<HTMLElement>("[data-wash]")].map((el) => onSheet(el, sheet));
			// The thread hangs under the sketches, then runs on to underline the next panel's sentence.
			const under = sheet.querySelector<HTMLElement>("[data-underline]");
			const thread = threadRef.current;
			if (thread && washes.length && under) {
				const points: [number, number][] = [];
				const dip = h * 0.09;
				washes.forEach((box, i) => {
					points.push([box.x + box.w / 2, box.y + box.h + h * 0.035]);
					const next = washes[i + 1];
					if (next) points.push([(box.x + box.w + next.x) / 2, Math.max(box.y + box.h, next.y + next.h) + dip]);
				});
				const line = onSheet(under, sheet);
				const ly = line.y + line.h + h * 0.03;
				points.push([line.x - w * 0.12, ly + h * 0.1]);
				points.push([line.x, ly]);
				points.push([line.x + line.w * 0.45, ly + 4]);
				points.push([line.x + line.w * 0.86, ly - 3]);
				thread.setAttribute("d", curve(points));
			}
		};

		const render = ({ progress, reduced, interval }: Parameters<Parameters<typeof runReel>[0]["render"]>[0]) => {
			const u = reduced ? (RESTS[Math.min(RESTS.length - 1, Math.floor(progress * RESTS.length))] ?? 0) : progress * LENGTH;

			// The tracking shot: rest on a panel, then glide to the next.
			let travel = 0;
			for (let i = 1; i < PANELS; i++) travel += glide(u, arrival(i) - 0.65, arrival(i));
			// The pull back: the camera's scale falls geometrically while its focus slides to the sheet's middle.
			const pull = glide(u, PULL[0], PULL[1]);
			const scale = Math.exp(lerp(0, Math.log(fit), pull));
			const focusX = lerp(travel * width + width / 2, (PANELS * width) / 2, pull);
			const focusY = height / 2;
			const anchorY = lerp(height / 2, stripTop + (height * fit) / 2, pull);
			const ox = width / 2 - focusX * scale;
			const oy = anchorY - focusY * scale;
			sheet.style.transform = `translate3d(${ox.toFixed(2)}px, ${oy.toFixed(2)}px, 0) scale(${scale.toFixed(5)})`;

			// Words arrive with the camera and stay, like everything else on the sheet.
			panels.current.forEach((panel, i) => {
				if (!panel) return;
				const a = i === 0 ? 1 : ease(u, arrival(i) - 0.7, arrival(i) - 0.05);
				const x = reduced ? 0 : (1 - a) * 60;
				panel.style.setProperty("--fp-in", a.toFixed(3));
				panel.style.setProperty("--fp-shift", `${x.toFixed(2)}px`);
			});

			let budget = Math.round(range(u, 0.95, 1.6) * TYPED);
			for (const [i, line] of WRITING.entries()) {
				const shown = Math.max(0, Math.min(line.text.length, budget));
				budget -= Math.max(1, line.text.length);
				lines.current[i]?.style.setProperty("--shown", String(shown));
			}

			const thread = threadRef.current;
			if (thread) thread.style.strokeDashoffset = (1 - ease(u, 2.35, 3.45)).toFixed(4);

			setLayer(endRef.current, ease(u, 5.25, 5.85), reduced ? undefined : `translate3d(0, ${((1 - ease(u, 5.25, 5.85)) * 24).toFixed(2)}px, 0)`);
			if (headRef.current) headRef.current.dataset.over = pull > 0.5 ? "desk" : "sheet";

			if (!field) return;
			const { gl } = field;
			if (field.sample(interval)) field.resize(width, height);
			gl.uniform2f(field.uniform("u_size"), width, height);
			gl.uniform3f(field.uniform("u_view"), ox, oy, scale);
			gl.uniform2f(field.uniform("u_sheet"), PANELS * width, height);
			gl.uniform1f(field.uniform("u_panel"), width);
			gl.uniform1f(field.uniform("u_board"), ease(u, PULL[0] + 0.3, PULL[1]));
			gl.uniform1f(field.uniform("u_time"), 0);
			const dropData: number[] = [];
			for (let i = 0; i < 6; i++) {
				const drop = drops[i];
				const bleed = BLEEDS[i];
				if (!drop || !bleed) {
					dropData.push(0, 0, 0, 0);
					continue;
				}
				const [start, end, seed] = bleed;
				const grown = lerp(seed, 1, glide(u, start, end));
				const landed = seed > 0 ? 1 : ease(u, start, start + 0.08);
				dropData.push(drop.x, drop.y, Math.max(1, drop.r * (0.35 + 0.65 * grown) * (seed > 0 || grown > 0 ? 1 : 0)), landed * Math.min(1, grown * 10));
			}
			gl.uniform4fv(field.uniform("u_drops[0]"), dropData);
			gl.uniform4fv(
				field.uniform("u_washes[0]"),
				[0, 1, 2, 3].flatMap((i) => {
					const box = washes[i];
					return box ? [box.x, box.y, box.w, box.h] : [0, 0, 1, 1];
				}),
			);
			const laid = [0, 1, 2, 3].map((i) => ease(u, 1.75 + i * 0.12, 2.25 + i * 0.12));
			gl.uniform4f(field.uniform("u_washAmt"), laid[0] ?? 0, laid[1] ?? 0, laid[2] ?? 0, laid[3] ?? 0);
			field.draw();
		};

		const stop = runReel({ track: trackEl, render, measure, ambient: () => false, follow: 8 });
		return () => {
			stop();
			field?.dispose();
		};
	}, []);

	const panelRef = (i: number) => (el: HTMLElement | null) => {
		panels.current[i] = el;
	};

	return (
		<div className="fm-page fp-page">
			<section ref={trackRef} className="fp-track" style={{ height: `${(LENGTH + 1) * 100}vh` }}>
				<div className="fp-stage" data-backend="fallback">
					<canvas ref={canvasRef} className="fp-canvas" aria-hidden="true" />
					<div ref={sheetRef} className="fp-sheet">
						<article ref={panelRef(0)} className="fp-panel fp-opening">
							<h1>Rough drafts that work.</h1>
							<p>
								spool is a canvas on your Mac where you and your agent design websites, apps and presentations,
								then click through them.
							</p>
							<span className="fp-drop" data-drop="0" />
							<span className="fp-drop" data-drop="1" />
						</article>

						<article ref={panelRef(1)} className="fp-panel fp-writing">
							<h2>Describe a screen. Your agent writes it as a TSX file, right in your project.</h2>
							<pre aria-label="An agent writing design/frames/booking/frame.tsx">
								{WRITING.map((line, i) => (
									<span
										key={`${i}-${line.text}`}
										ref={(el) => {
											lines.current[i] = el;
										}}
										className="fp-line"
										data-kind={line.kind}
									>
										{line.text}
									</span>
								))}
							</pre>
							<span className="fp-drop" data-drop="2" />
						</article>

						<article ref={panelRef(2)} className="fp-panel fp-sketches">
							<h2>Every frame shows up live on one canvas, so you can see them side by side.</h2>
							<div className="fp-row">
								{SKETCHES.map((sketch) => (
									<figure key={sketch.name} data-shape={sketch.shape}>
										<figcaption>{sketch.name}</figcaption>
										<div data-wash={sketch.name} />
									</figure>
								))}
							</div>
						</article>

						<article ref={panelRef(3)} className="fp-panel fp-flow">
							<h2 data-underline>Link them into a flow, then click through it the way a visitor would.</h2>
							<span className="fp-drop" data-drop="3" />
						</article>

						<article ref={panelRef(4)} className="fp-panel fp-keep">
							<h2>It all lives in your repo as files. Git keeps each version you tried.</h2>
							<div className="fp-ledger">
								<p>~/studio $ git log --oneline design/</p>
								<ul>
									{HISTORY.map((commit) => (
										<li key={commit.hash}>
											<span>{commit.hash}</span> {commit.message}
										</li>
									))}
								</ul>
							</div>
							<span className="fp-drop" data-drop="4" />
						</article>

						<svg className="fp-thread" aria-hidden="true">
							<path ref={threadRef} pathLength={1} />
						</svg>
					</div>

					<header ref={headRef} className="fp-head" data-over="sheet">
						<a className="fp-brand" href="https://spool.page/" aria-label="spool home">
							<SpoolMark className="fp-mark" />
							<span>spool</span>
						</a>
						<nav aria-label="Website">
							<a href={REPO}>GitHub</a>
							<a href={DOWNLOAD}>Download for Mac</a>
						</nav>
					</header>

					<div ref={endRef} className="fp-end" id="start">
						<h2>Try it on your next draft.</h2>
						<div className="fp-actions">
							<a className="fp-download" href={DOWNLOAD}>
								Download for Mac
							</a>
							<CopyLine className="fp-command" command={INSTALL} />
						</div>
						<p>Free and MIT licensed. Apple silicon, macOS 14 or later.</p>
					</div>
				</div>
			</section>

			<footer className="fp-footer">
				<p>
					spool is made by Liam, who posts the work in progress on X as{" "}
					<a href="https://x.com/liamvinberg">@liamvinberg</a>.
				</p>
				<div>
					<span className="fp-brand">
						<SpoolMark className="fp-mark" />
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
