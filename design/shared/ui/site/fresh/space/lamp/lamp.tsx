import { Fragment, type ReactNode, useEffect, useRef } from "react";
import { cn } from "shared/lib/utils";
import { SpoolMark } from "shared/ui/spool/mark";
import { SpaceFooter } from "../footer";
import { createSpace, type Program, type Space } from "../gl";
import { CopyLine, DOWNLOAD, INSTALL, REPO } from "../install";
import { clamp, ease, lerp } from "../math";
import { runReel } from "../reel";
import fragment from "./lamp.glsl";
import { paintWall } from "./relief";
import "../space.css";
import "./lamp.css";

/** Words the wall casts in relief. Each word is its own span so the painter can find it. */
function Words({ children }: { children: string }) {
	const list = children.split(" ");
	return (
		<>
			{list.map((word, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: words repeat; their order is their identity.
				<Fragment key={i}>
					<span data-w>{word}</span>
					{i < list.length - 1 ? " " : null}
				</Fragment>
			))}
		</>
	);
}

/** A raised headline: real text for readers and selection, relief for the light. */
function Cast({ as: Tag = "h2", className, children }: { as?: "h1" | "h2"; className?: string; children: string }) {
	return (
		<Tag className={cn("lp-cast", className)} data-relief="raise">
			<Words>{children}</Words>
		</Tag>
	);
}

/** Lines cut into a plate, one per row. */
function Carved({ lines, className }: { lines: string[]; className?: string }) {
	return (
		<div className={cn("lp-carved", className)}>
			{lines.map((line) => (
				<p key={line} data-relief="carve">
					<Words>{line}</Words>
				</p>
			))}
		</div>
	);
}

/** Small copy printed on the wall: always readable, brighter as the lamp comes near. */
function Printed({ children, className }: { children: ReactNode; className?: string }) {
	return <p className={cn("lp-printed", className)}>{children}</p>;
}

const CODE = [
	'~/shop $ claude "make checkout two steps"',
	"design/frames/checkout/frame.tsx",
	"export default function Checkout() {",
	"const [step, setStep] = useState(1);",
	'return <Sheet title="Checkout">',
];

const FRAMES = ["home", "search", "listing", "cart", "checkout", "receipt"];

const LOG = [
	"a41f2c9 checkout: lead with the total",
	"7d03e18 checkout: split into two steps",
	"3be6d70 checkout: try Apple Pay first",
	"c2b95a4 checkout: first pass",
];

const ROOMS = 5;
const TRAIL = 16;

export function LampLanding() {
	const trackRef = useRef<HTMLElement>(null);
	const stageRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const wallRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const trackEl = trackRef.current;
		const stage = stageRef.current;
		const canvas = canvasRef.current;
		const wall = wallRef.current;
		if (!trackEl || !stage || !canvas || !wall) return;

		let space: Space | null = null;
		let program: Program | null = null;
		let texture: WebGLTexture | null = null;
		try {
			space = createSpace(canvas, { maxRatio: 1.5, maxPixels: 2_400_000 });
			if (space) {
				program = space.program(fragment);
				texture = space.gl.createTexture();
			}
		} catch (error) {
			console.warn("Lamp unavailable:", error);
			space?.dispose();
			space = null;
		}
		stage.dataset.backend = space ? space.backend : "fallback";

		const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
		let width = 1,
			height = 1,
			wallHeight = 1,
			reach = 380,
			painted = false,
			repaint = 0;
		// Printed copy and where it sits on the wall, for brightening it near the lamp.
		let printed: { el: HTMLElement; x: number; y: number }[] = [];

		const paint = () => {
			repaint = 0;
			if (!space || !texture) return;
			const { gl } = space;
			const result = paintWall(wall, 5_200_000);
			gl.bindTexture(gl.TEXTURE_2D, texture);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, result.canvas);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
			painted = true;
			stage.dataset.painted = "true";
		};

		const measure = (w: number, h: number) => {
			width = w;
			height = h;
			wallHeight = wall.offsetHeight;
			reach = Math.max(260, Math.min(w * 0.3, h * 0.46));
			space?.resize(w, h);
			const origin = wall.getBoundingClientRect();
			printed = Array.from(wall.querySelectorAll<HTMLElement>(".lp-printed, .lp-actions, .lp-fine")).map((el) => {
				const box = el.getBoundingClientRect();
				return { el, x: box.left - origin.left + box.width / 2, y: box.top - origin.top + box.height / 2 };
			});
			// Painting reads layout; let a burst of resizes settle first.
			window.clearTimeout(repaint);
			repaint = window.setTimeout(paint, painted ? 160 : 0);
		};

		// The lamp: the pointer when there is one, a slow walk of its own when there is not.
		const lamp = { x: width * 0.3, y: height * 0.55, tx: 0, ty: 0 };
		// A mouse holds the lamp for as long as it is over the page; a tap borrows it for a few seconds.
		let held = false,
			lastTap = -Infinity,
			started = false;
		const aim = (event: PointerEvent) => {
			const box = stage.getBoundingClientRect();
			lamp.tx = event.clientX - box.left;
			lamp.ty = event.clientY - box.top;
		};
		const onMove = (event: PointerEvent) => {
			if (event.pointerType === "touch") return;
			held = true;
			aim(event);
		};
		const onLeave = (event: PointerEvent) => {
			if (event.pointerType !== "touch") held = false;
		};
		const onTap = (event: PointerEvent) => {
			if (event.pointerType !== "touch") return;
			lastTap = performance.now();
			aim(event);
		};
		stage.addEventListener("pointermove", onMove);
		stage.addEventListener("pointerleave", onLeave);
		stage.addEventListener("pointerdown", onTap);

		const trail = new Float32Array(TRAIL * 4);
		let trailHead = 0,
			sinceDrop = 0;

		const render = ({ progress, time, reduced, interval }: Parameters<Parameters<typeof runReel>[0]["render"]>[0]) => {
			const offset = progress * Math.max(0, wallHeight - height);
			wall.style.transform = `translate3d(0, ${(-offset).toFixed(2)}px, 0)`;

			const now = performance.now();
			const idle = !held && now - lastTap > 6000;
			if (idle) {
				// A slow figure across the room, wide enough to pass over everything in it.
				const t = time * 0.16;
				lamp.tx = width * (0.5 + 0.34 * Math.sin(t * 1.3 + 0.6));
				lamp.ty = height * (0.5 + 0.2 * Math.sin(t * 2.1 + 1.9));
				if (reduced) {
					lamp.tx = width * 0.36;
					lamp.ty = height * 0.55;
				}
			}
			const dt = Math.min(interval, 64) / 1000;
			const follow = reduced || !started ? 1 : 1 - Math.exp(-dt * (idle ? 1.6 : 7));
			lamp.x = lerp(lamp.x, lamp.tx, follow);
			lamp.y = lerp(lamp.y, lamp.ty, follow);
			started = true;

			// The trail the pigment remembers, in wall coordinates so it stays put as the wall moves.
			const decay = Math.exp(-dt / 1.3);
			for (let i = 0; i < TRAIL; i++) trail[i * 4 + 2] = (trail[i * 4 + 2] ?? 0) * decay;
			sinceDrop += interval;
			if (sinceDrop > 60 && !reduced) {
				sinceDrop = 0;
				trail.set([lamp.x, lamp.y + offset, 0.55, reach * 0.32], trailHead * 4);
				trailHead = (trailHead + 1) % TRAIL;
			}

			const warm = ease(offset, wallHeight - height * 1.6, wallHeight - height);

			// Printed copy brightens as the light reaches it.
			for (const item of printed) {
				const d = Math.hypot(item.x - lamp.x, item.y - offset - lamp.y);
				const lit = clamp(1 - d / (reach * 1.9));
				item.el.style.setProperty("--lit", (lit * lit).toFixed(3));
			}

			if (!space || !program || !texture || !painted) return;
			const { gl } = space;
			if (space.sample(interval)) space.resize(width, height);
			program.use();
			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_2D, texture);
			gl.uniform1i(program.uniform("u_wall"), 0);
			gl.uniform2f(program.uniform("u_size"), width, height);
			gl.uniform2f(program.uniform("u_wallSize"), wall.offsetWidth, wallHeight);
			gl.uniform1f(program.uniform("u_offset"), offset);
			gl.uniform4f(program.uniform("u_lamp"), lamp.x, lamp.y, 260, 1.3);
			gl.uniform1f(program.uniform("u_reach"), reach);
			gl.uniform1f(program.uniform("u_moon"), 0.26);
			gl.uniform1f(program.uniform("u_stain"), 0.03 + warm * 0.05);
			gl.uniform1f(program.uniform("u_time"), space.backend === "software" ? 4 : time + 4);
			gl.uniform1f(program.uniform("u_warm"), warm);
			gl.uniform4fv(program.uniform("u_trail[0]"), trail);
			space.draw(null);
		};

		const stop = runReel({
			track: trackEl,
			render,
			measure,
			follow: 10,
			ambient: () => !motion.matches,
		});
		return () => {
			stop();
			window.clearTimeout(repaint);
			stage.removeEventListener("pointermove", onMove);
			stage.removeEventListener("pointerleave", onLeave);
			stage.removeEventListener("pointerdown", onTap);
			if (space && texture) space.gl.deleteTexture(texture);
			space?.dispose();
		};
	}, []);

	return (
		<div className="sp-page lp-page">
			<section ref={trackRef} className="lp-track" style={{ height: `${ROOMS * 100}vh` }}>
				<div ref={stageRef} className="lp-stage" data-backend="fallback">
					<canvas ref={canvasRef} className="lp-canvas" aria-hidden="true" />
					<header className="lp-head">
						<a className="sp-brand" href="https://spool.page/" aria-label="spool home">
							<SpoolMark className="sp-mark" />
							<span>spool</span>
						</a>
						<nav aria-label="Website">
							<a href={`${REPO}#readme`}>Docs</a>
							<a href={REPO}>GitHub</a>
							<a href={DOWNLOAD}>Download</a>
						</nav>
					</header>

					<div ref={wallRef} className="lp-wall">
						<section className="lp-room lp-hero">
							<span className="lp-stain lp-hero-stain" data-relief="stain" aria-hidden="true" />
							<span className="lp-relief-mark" data-relief="mark" aria-hidden="true">
								<SpoolMark />
							</span>
							<Cast as="h1">A canvas for working things out.</Cast>
							<Printed className="lp-hero-note">
								Design websites, apps and presentations with your agent, on a canvas that runs on your Mac.
							</Printed>
						</section>

						<section className="lp-room lp-write">
							<div className="lp-copy">
								<Cast>Your agent writes the frames.</Cast>
								<Printed>
									Each one is a TSX file in your project, written by Claude Code, Codex or whichever agent you already use.
								</Printed>
							</div>
							<div className="lp-plate lp-code" data-relief="plate">
								<Carved lines={CODE} />
							</div>
						</section>

						<section className="lp-room lp-canvas-room">
							<div className="lp-copy">
								<Cast>spool lays them out live.</Cast>
								<Printed>
									Every frame runs side by side on one infinite canvas. Link them into a flow and walk through it like the
									real thing.
								</Printed>
							</div>
							<div className="lp-gallery">
								{FRAMES.map((name) => (
									<figure key={name} className="lp-frame" data-frame={name}>
										<span className="lp-frame-plate" data-relief="plate" data-plate={name} />
										<figcaption data-relief="carve">
											<Words>{name}</Words>
										</figcaption>
									</figure>
								))}
								<span className="lp-thread" data-relief="inlay" data-links={FRAMES.join(" ")} aria-hidden="true" />
							</div>
						</section>

						<section className="lp-room lp-history">
							<div className="lp-copy">
								<Cast>Git keeps every version.</Cast>
								<Printed>It's all files in your repo. Try something, keep it, or check out the one before.</Printed>
							</div>
							<div className="lp-plate lp-log" data-relief="plate">
								<Carved lines={LOG} />
							</div>
						</section>

						<section className="lp-room lp-start" id="start">
							<div className="lp-niche" data-relief="niche">
								<span className="lp-stain lp-start-stain" data-relief="stain" data-depth="0.9" aria-hidden="true" />
								<Cast>Try it on the next thing you're unsure about.</Cast>
								<div className="lp-actions">
									<a className="sp-download" href={DOWNLOAD}>
										Download for Mac
									</a>
									<CopyLine className="sp-command" command={INSTALL} />
								</div>
								<p className="lp-fine">Free and MIT licensed. Apple silicon, macOS 14 or later.</p>
							</div>
						</section>
					</div>
				</div>
			</section>
			<SpaceFooter />
		</div>
	);
}
