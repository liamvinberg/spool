import { useEffect, useRef } from "react";
import { SpoolMark } from "shared/ui/spool/mark";
import { createField } from "../field";
import { CopyLine, DOWNLOAD, INSTALL, REPO } from "../install";
import { ease, glide, lerp } from "../math";
import { runReel, setLayer } from "../reel";
import fragment from "./fall.glsl";
import "../film.css";
import "./fall.css";

/*
 * One unbroken shot, falling. The layers of a project hang one under the next
 * in real depth, and the camera drops through them toward a red core: the
 * folder, the file, three frames you fall through like doorways, the history,
 * and then the light. The cursor leans the camera; nothing cuts.
 * The film runs on u, one layer per unit of scroll.
 */
const GAP = 1200; // px of depth between layers
const PERSPECTIVE = 900;
const LENGTH = 7.4;
/* Under reduced motion the camera cuts from layer to layer instead of falling. */
const RESTS = [0, 1, 2, 3, 4, 5, 6, LENGTH];

type Layer = {
	/** What the machine would call this layer, printed on its edge. */
	path?: string;
	/** The doorway, in vw/vh from the centre: x, y, width, height. */
	door?: [number, number, number, number];
	/** A frame in the flow: its doorway is drawn in the thread's red. */
	flow?: boolean;
	/** Lines printed inside the doorway. */
	lines?: string[];
	/** What a person says about this layer. */
	line: string;
};

const LAYERS: Layer[] = [
	{ line: "Design websites, apps and presentations with your agent, on a canvas that runs on your Mac." },
	{
		path: "~/shop/design/",
		door: [-3, -4, 66, 64],
		line: "spool keeps everything it makes in one folder of your repo.",
	},
	{
		path: "frames/checkout/frame.tsx",
		door: [3, -6, 60, 58],
		lines: [
			"export default function Checkout() {",
			"  const [step, setStep] = useState(1);",
			"  return step === 1 ? <Address /> : <Payment />;",
			"}",
		],
		line: "Your agent writes each frame there as a TSX file.",
	},
	{ path: "cart", door: [-5, -5, 58, 56], flow: true, line: "spool shows every frame live." },
	{ path: "checkout", door: [4, -7, 56, 54], flow: true, line: "Link them into a flow." },
	{ path: "receipt", door: [-2, -5, 54, 52], flow: true, line: "Then walk through it like the real thing." },
	{
		path: "git log --oneline design/",
		door: [2, -6, 60, 56],
		lines: [
			"a41f2c9 receipt: lead with the order number",
			"7d03e18 checkout: split into two steps",
			"c2b95a4 cart: first pass",
		],
		line: "It's all files, so Git keeps every version you try.",
	},
];

export function FallFilm() {
	const trackRef = useRef<HTMLElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const worldRef = useRef<HTMLDivElement>(null);
	const layers = useRef<(HTMLDivElement | null)[]>([]);
	const endRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const trackEl = trackRef.current;
		const canvas = canvasRef.current;
		const world = worldRef.current;
		if (!trackEl || !canvas || !world) return;
		const field = createField(canvas, fragment);
		const stage = canvas.closest<HTMLElement>(".fa-stage");
		if (stage) stage.dataset.backend = field ? field.backend : "fallback";
		const fine = window.matchMedia("(pointer: fine)");
		const aim = { x: 0, y: 0 };
		const lean = { x: 0, y: 0 };
		let width = 1,
			height = 1;

		const onPointer = (event: PointerEvent) => {
			if (!fine.matches) return;
			aim.x = event.clientX / width - 0.5;
			aim.y = event.clientY / height - 0.5;
		};
		const onLeave = () => {
			aim.x = 0;
			aim.y = 0;
		};
		window.addEventListener("pointermove", onPointer, { passive: true });
		document.documentElement.addEventListener("pointerleave", onLeave);

		const measure = (w: number, h: number) => {
			width = w;
			height = h;
			field?.resize(w, h);
		};

		const render = ({ progress, time, reduced, interval }: Parameters<Parameters<typeof runReel>[0]["render"]>[0]) => {
			const u = reduced ? (RESTS[Math.min(RESTS.length - 1, Math.floor(progress * RESTS.length))] ?? 0) : progress * LENGTH;

			// Rest on each layer a moment, then drop to the next. After the last, fall into the core.
			let fallen = 0;
			for (let i = 1; i < LAYERS.length; i++) fallen += glide(u, i - 0.62, i);
			const plunge = glide(u, LAYERS.length - 0.6, LENGTH - 0.3);
			fallen += plunge * 1.6;
			const camera = fallen * GAP;

			// The cursor leans the camera, eased so it settles rather than snaps.
			const follow = reduced ? 1 : 1 - Math.exp((-4 * interval) / 1000);
			const aimX = reduced ? 0 : aim.x;
			const aimY = reduced ? 0 : aim.y;
			lean.x += (aimX - lean.x) * follow;
			lean.y += (aimY - lean.y) * follow;
			world.style.transformOrigin = `50% 50% ${(-camera).toFixed(1)}px`;
			world.style.transform = `translate3d(0, 0, ${camera.toFixed(2)}px) rotateY(${(lean.x * 3.2).toFixed(3)}deg) rotateX(${(-lean.y * 2.6).toFixed(3)}deg)`;

			LAYERS.forEach((_, i) => {
				const el = layers.current[i];
				if (!el) return;
				const rel = camera - i * GAP;
				const words = ease(rel, -0.5 * GAP, -0.12 * GAP) * (1 - ease(rel, 0.1 * GAP, 0.3 * GAP));
				const near = i === 0 ? 1 - ease(rel, 0.1 * GAP, 0.3 * GAP) : words;
				const reach = ease(rel, -4.6 * GAP, -0.3 * GAP);
				const edge = reach * (0.42 + 0.58 * ease(rel, -1.3 * GAP, -0.1 * GAP)) * (1 - ease(rel, 0.16 * GAP, 0.42 * GAP));
				el.style.setProperty("--words", near.toFixed(3));
				el.style.setProperty("--edge", edge.toFixed(3));
				el.style.visibility = near < 0.002 && edge < 0.002 ? "hidden" : "visible";
				el.dataset.near = near > 0.6 ? "true" : "false";
			});

			const core = ease(u, LAYERS.length - 0.5, LENGTH - 0.35);
			setLayer(endRef.current, ease(u, LENGTH - 0.75, LENGTH - 0.2), reduced ? undefined : `translate3d(0, ${((1 - ease(u, LENGTH - 0.75, LENGTH - 0.2)) * 20).toFixed(2)}px, 0)`);

			if (!field) return;
			const { gl } = field;
			if (field.sample(interval)) field.resize(width, height);
			gl.uniform2f(field.uniform("u_size"), width, height);
			gl.uniform2f(field.uniform("u_center"), width / 2 - lean.x * 70, height / 2 - lean.y * 56);
			gl.uniform1f(field.uniform("u_depth"), fallen);
			gl.uniform1f(field.uniform("u_core"), lerp(0, 1, core));
			gl.uniform1f(field.uniform("u_time"), field.backend === "software" ? 4 : time + 4);
			field.draw();
		};

		const stop = runReel({
			track: trackEl,
			render,
			measure,
			follow: 7,
			ambient: () => field?.backend === "webgl",
		});
		return () => {
			stop();
			window.removeEventListener("pointermove", onPointer);
			document.documentElement.removeEventListener("pointerleave", onLeave);
			field?.dispose();
		};
	}, []);

	return (
		<div className="fm-page fa-page">
			<section ref={trackRef} className="fa-track" style={{ height: `${(LENGTH + 1) * 100}vh` }}>
				<div className="fa-stage" data-backend="fallback">
					<canvas ref={canvasRef} className="fa-canvas" aria-hidden="true" />
					<div className="fa-camera" style={{ perspective: `${PERSPECTIVE}px` }}>
						<div ref={worldRef} className="fa-world">
							{LAYERS.map((layer, i) => (
								<div
									key={layer.line}
									ref={(el) => {
										layers.current[i] = el;
									}}
									className="fa-layer"
									style={{ transform: `translate3d(0, 0, ${-i * GAP}px)` }}
								>
									{layer.door && (
										<div
											className="fa-door"
											data-flow={layer.flow ? "true" : "false"}
											style={{
												left: `calc(50% + ${layer.door[0] - layer.door[2] / 2}vw)`,
												top: `calc(50% + ${layer.door[1] - layer.door[3] / 2}vh)`,
												width: `${layer.door[2]}vw`,
												height: `${layer.door[3]}vh`,
											}}
										>
											<span className="fa-path">{layer.path}</span>
											{layer.lines && (
												<pre>
													{layer.lines.map((line) => (
														<span key={line}>{line}</span>
													))}
												</pre>
											)}
										</div>
									)}
									{i === 0 ? (
										<div className="fa-words fa-opening">
											<h1>
												A canvas for
												<br />
												working things out.
											</h1>
											<p>{layer.line}</p>
										</div>
									) : (
										<p className="fa-words fa-line">{layer.line}</p>
									)}
								</div>
							))}
						</div>
					</div>

					<header className="fa-head">
						<a className="fa-brand" href="https://spool.page/" aria-label="spool home">
							<SpoolMark className="fa-mark" />
							<span>spool</span>
						</a>
						<nav aria-label="Website">
							<a href={`${REPO}#readme`}>Docs</a>
							<a href={REPO}>GitHub</a>
							<a href={DOWNLOAD}>Download</a>
						</nav>
					</header>

					<div ref={endRef} className="fa-end" id="start">
						<h2>Try it on your next idea.</h2>
						<div className="fa-actions">
							<a className="fa-download" href={DOWNLOAD}>
								Download for Mac
							</a>
							<CopyLine className="fa-command" command={INSTALL} />
						</div>
						<p>Free and MIT licensed. Apple silicon, macOS 14 or later.</p>
					</div>
				</div>
			</section>

			<footer className="fa-footer">
				<p>
					Made by Liam, who shares what he is building on X as <a href="https://x.com/liamvinberg">@liamvinberg</a>.
				</p>
				<nav aria-label="Footer">
					<span className="fa-brand">
						<SpoolMark className="fa-mark" />
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
