import { useEffect, useRef } from "react";
import { CopyLine, DOWNLOAD, INSTALL, REPO } from "shared/ui/site/fresh/thread/copy-line";
import { drawPly, fitCanvas, RED } from "shared/ui/site/fresh/thread/ply";
import { SpoolMark } from "shared/ui/spool/mark";
import "shared/ui/site/fresh/thread/thread.css";
import "./draw.css";
import { type Layout, layout, lengthAt } from "./route";

/** One thread, drawn down the page as you read: a sentence, a frame, versions, a flow, a history, a spool. */
function useThread(root: React.RefObject<HTMLDivElement | null>, canvas: React.RefObject<HTMLCanvasElement | null>) {
	useEffect(() => {
		const page = root.current;
		const el = canvas.current;
		const ctx = el?.getContext("2d");
		if (!page || !el || !ctx) return;
		const still = window.matchMedia("(prefers-reduced-motion: reduce)");
		let map: Layout | null = null;
		let drawn = 0;
		let intro = 0;
		let introStart = -1;
		let raf = 0;
		let last = 0;
		let painted = Number.NaN;
		let paintedY = Number.NaN;
		let disposed = false;

		const measure = () => {
			map = layout(page);
			if (map && still.matches) drawn = map.path.length;
			wake();
		};
		const paint = () => {
			if (!map) return;
			const w = document.documentElement.clientWidth;
			const h = window.innerHeight;
			const ratio = fitCanvas(el, w, h);
			const y = window.scrollY;
			if (painted === drawn && paintedY === y && el.dataset.w === String(w)) return;
			el.dataset.w = String(w);
			painted = drawn;
			paintedY = y;
			ctx.setTransform(1, 0, 0, 1, 0, 0);
			ctx.clearRect(0, 0, el.width, el.height);
			ctx.setTransform(ratio, 0, 0, ratio, 0, -y * ratio);
			drawPly(ctx, map.path, 0, drawn, y, y + h, {
				width: w < 760 ? 2.2 : 2.6,
				core: RED.core,
				body: RED.body,
				light: RED.light,
				pitch: 3.2,
				fibres: true,
				back: map.back,
				backColor: RED.back,
			});
			// The live end: a soft point of light where the thread is being laid.
			if (drawn > 1 && drawn < map.path.length - 1) {
				const i = Math.min(map.path.count - 1, Math.round(drawn / map.path.step));
				const px = map.path.x[i] ?? 0;
				const py = map.path.y[i] ?? 0;
				const glow = ctx.createRadialGradient(px, py, 0, px, py, 18);
				glow.addColorStop(0, "rgba(255,110,70,0.45)");
				glow.addColorStop(1, "rgba(255,110,70,0)");
				ctx.fillStyle = glow;
				ctx.fillRect(px - 18, py - 18, 36, 36);
			}
			for (const stage of map.stages) {
				const on = drawn >= stage.done - 2;
				if ((stage.el.dataset.done === "true") !== on) stage.el.dataset.done = String(on);
			}
		};
		const tick = (now: number) => {
			raf = 0;
			if (disposed || !map) return;
			const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
			last = now;
			if (introStart < 0) introStart = now;
			const t = Math.min(1, (now - introStart) / 2600);
			intro = map.hero * (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
			const target = still.matches ? map.path.length : Math.max(t < 1 ? intro : map.hero, lengthAt(map.keys, window.scrollY));
			const ease = 1 - Math.exp(-dt * 4.2);
			drawn = still.matches ? target : drawn + (target - drawn) * ease;
			if (Math.abs(target - drawn) < 0.4) drawn = target;
			paint();
			if (drawn !== target || t < 1) raf = window.requestAnimationFrame(tick);
			else last = 0;
		};
		const wake = () => {
			if (!raf && !disposed) raf = window.requestAnimationFrame(tick);
		};
		const resize = new ResizeObserver(measure);
		resize.observe(page);
		window.addEventListener("scroll", wake, { passive: true });
		window.addEventListener("resize", measure);
		still.addEventListener("change", measure);
		void document.fonts.ready.then(measure);
		measure();
		return () => {
			disposed = true;
			window.cancelAnimationFrame(raf);
			resize.disconnect();
			window.removeEventListener("scroll", wake);
			window.removeEventListener("resize", measure);
			still.removeEventListener("change", measure);
		};
	}, [root, canvas]);
}

function Download() {
	return (
		<a className="td-download" href={DOWNLOAD}>
			Download for Mac
		</a>
	);
}

function Frame({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<figure className="td-frame">
			<div className="td-frame-box" data-part="frame">
				<div className="td-frame-inner">{children}</div>
			</div>
			<figcaption>{label}</figcaption>
		</figure>
	);
}

export default function LandingThreadDraw() {
	const root = useRef<HTMLDivElement>(null);
	const canvas = useRef<HTMLCanvasElement>(null);
	useThread(root, canvas);
	return (
		<div ref={root} className="th-page td-page">
			<canvas ref={canvas} className="td-canvas" aria-hidden="true" />

			<header className="td-nav">
				<a className="td-brand" href="#top" aria-label="spool">
					<span className="td-mark">
						<SpoolMark />
					</span>
					<span>spool</span>
				</a>
				<nav aria-label="Main">
					<a href={`${REPO}#readme`}>Docs</a>
					<a href={REPO}>GitHub</a>
					<a href={DOWNLOAD}>Download</a>
				</nav>
			</header>

			<section className="td-hero" id="top">
				<h1>
					Find the <em data-t="word">thread.</em>
				</h1>
				<div className="td-hero-foot">
					<p>
						spool is a canvas for designing with your agent. Websites, apps and presentations run live from
						the first frame, so you can try them and keep what works.
					</p>
					<div className="td-actions">
						<Download />
						<CopyLine command={INSTALL} />
					</div>
				</div>
			</section>

			<main>
				<section className="td-section td-one">
					<div className="td-copy">
						<h2>Your agent writes the frames.</h2>
						<p>
							Describe a screen to Claude Code, Codex or whichever agent you use. It writes the screen as a TSX
							file in your project, and the frame shows up on the canvas while it works.
						</p>
					</div>
					<div className="td-fig td-fig-prompt" data-fig="prompt">
						<p className="td-prompt" data-part="prompt">
							<span>~/kaffe $</span> claude "a checkout step for gift notes"
						</p>
						<Frame label="design/frames/checkout/frame.tsx">
							<div className="td-shop">
								<div className="td-shop-head">
									<span>Kaffe</span>
									<span>Step 2 of 3</span>
								</div>
								<h3>Add a gift note</h3>
								<label className="td-shop-field">
									<span>We print it on a card and tuck it in the box.</span>
									<textarea rows={2} placeholder="Happy birthday, Ana. These are the beans from Lund." />
								</label>
								<div className="td-shop-foot">
									<span>Arrives Thursday</span>
									<button type="button">Continue</button>
								</div>
							</div>
						</Frame>
					</div>
				</section>

				<section className="td-section td-two">
					<div className="td-copy">
						<h2>Every frame is live.</h2>
						<p>
							Frames are running code. Buttons press, fields take typing, pages scroll. Put three versions next
							to each other and keep the one that feels right.
						</p>
					</div>
					<div className="td-fig td-fig-versions" data-fig="versions">
						<Frame label="checkout">
							<div className="td-v td-v1">
								<h3>Add a gift note</h3>
								<span className="td-v1-line">Happy birthday, Ana.</span>
								<button type="button">Continue</button>
							</div>
						</Frame>
						<Frame label="checkout--card">
							<div className="td-v td-v2">
								<span className="td-v2-card">
									<em>For Ana,</em>
									<br />
									happy birthday.
								</span>
								<button type="button">Print this card</button>
							</div>
						</Frame>
						<Frame label="checkout--short">
							<div className="td-v td-v3">
								<span>Gift note</span>
								<span className="td-v3-row">
									<span>Optional</span>
									<button type="button" aria-label="Continue">
										→
									</button>
								</span>
							</div>
						</Frame>
					</div>
				</section>

				<section className="td-section td-three">
					<div className="td-copy">
						<h2>Link them into a flow.</h2>
						<p>
							Connect frames and walk through them like the finished thing. A choice made on the first screen is
							still there on the last.
						</p>
					</div>
					<div className="td-fig td-fig-flow" data-fig="flow">
						<Frame label="cart">
							<span className="td-bead">Cart</span>
						</Frame>
						<Frame label="checkout">
							<span className="td-bead">Gift note</span>
						</Frame>
						<Frame label="sent">
							<span className="td-bead">On its way</span>
						</Frame>
					</div>
				</section>

				<section className="td-section td-four">
					<div className="td-copy">
						<h2>It is all files in your repo.</h2>
						<p>
							Each frame is a TSX file under <code>design/frames</code>, and <code>frame.json</code> is where it
							sits on the canvas. Git keeps every version. Nothing leaves your machine until you push it.
						</p>
					</div>
					<ol className="td-fig td-log" data-fig="log" aria-label="git log --oneline">
						<li data-part="row">
							<span>e7730b5</span> checkout: ship the gift note
						</li>
						<li data-part="row">
							<span>19ce0a4</span> design: drop the short variant
						</li>
						<li data-part="row">
							<span>f2b6c88</span> design: link cart through to sent
						</li>
						<li data-part="row">
							<span>8a07f13</span> design: try the note as a card
						</li>
						<li data-part="row">
							<span>c41d9e2</span> design: gift note on checkout
						</li>
					</ol>
				</section>

				<section className="td-section td-five" id="start">
					<div className="td-fig td-spool" data-fig="spool" aria-hidden="true">
						<span className="td-flange td-flange-top" />
						<span className="td-barrel" data-part="barrel" />
						<span className="td-flange td-flange-bottom" />
					</div>
					<div className="td-copy">
						<h2>Start with one frame.</h2>
						<p>spool is free and MIT licensed. It runs on Apple silicon Macs with macOS 14 or later.</p>
						<div className="td-actions">
							<Download />
						</div>
						<div className="td-terminal">
							<CopyLine command={INSTALL} prompt="~/kaffe" />
							<CopyLine command="spool init" prompt="~/kaffe" />
						</div>
					</div>
				</section>
			</main>

			<footer className="td-footer">
				<span className="td-brand">
					<span className="td-mark">
						<SpoolMark />
					</span>
					<span>spool</span>
				</span>
				<p>
					Made by Liam. Follow along at{" "}
					<a href="https://x.com/liamvinberg" target="_blank" rel="noreferrer">
						@liamvinberg
					</a>
					.
				</p>
				<nav aria-label="Footer">
					<a href={`${REPO}#readme`}>Docs</a>
					<a href={REPO}>GitHub</a>
					<a href={`${REPO}/blob/main/LICENSE.md`}>MIT licence</a>
				</nav>
			</footer>
		</div>
	);
}
