import { useEffect, useRef, useState } from "react";
import { createBloomRenderer } from "shared/ui/site/current/ui/site/bloom/renderer";
import { OffprintSurface } from "shared/ui/site/current/ui/site/demo-apps/landing-canvas";
import { SpoolMark } from "shared/ui/site/current/ui/spool/mark";
import { CopyCommand, DOWNLOAD, INSTALL_COMMAND } from "shared/ui/site/current/install";
import "shared/ui/site/current/ui/site/bloom/page.css";
import "./page.css";

const REPO = "https://github.com/liamvinberg/spool";
export function PlayLanding({ take }: { take: "enter" | "threshold" }) {
	const canvas = useRef<HTMLCanvasElement>(null);
	const renderer = useRef<ReturnType<typeof createBloomRenderer>>(null);
	const preview = useRef<HTMLElement>(null);
	const [paused, setPaused] = useState(false);
	const [entered, setEntered] = useState(false);
	useEffect(() => {
		if (!canvas.current) return;
		const bloom = createBloomRenderer(canvas.current);
		renderer.current = bloom;
		return () => {
			bloom?.dispose();
			renderer.current = null;
		};
	}, []);
	useEffect(() => renderer.current?.setPaused(paused), [paused]);
	const enter = () => {
		setEntered(true);
		preview.current?.scrollIntoView({
			behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
			block: "start",
		});
		preview.current?.focus({ preventScroll: true });
	};
	return (
		<div className="bl-page pf-root" data-take={take}>
			<div className="bl-field" aria-hidden="true" data-backend="fallback">
				<canvas ref={canvas} className="bl-canvas" />
			</div>
			<div className="sg-page pf-page">
				<header className="pf-nav pf-width">
					<a href="#" aria-label="spool home" className="pf-brand">
						<SpoolMark />
						spool
					</a>
					{take === "enter" ? (
						<nav aria-label="Main navigation">
							<a href={`${REPO}#readme`}>Docs ↗</a>
							<a href={REPO}>GitHub ↗</a>
							<a href={DOWNLOAD} className="pf-nav-download">
								Get spool for Mac <span>↓</span>
							</a>
						</nav>
					) : (
						<nav aria-label="Main navigation">
							<a href={`${REPO}#readme`}>How it works ↗</a>
							<a href={REPO}>GitHub ↗</a>
							<a href="#start">Get spool ↓</a>
						</nav>
					)}
				</header>
				<main>
					<section className="sg-hero pf-hero pf-width">
						<h1>
							A canvas for
							<br />
							working things out.
						</h1>
						{take === "enter" ? (
							<div className="pf-invitation">
								<p>Design websites, apps, and presentations with your agent. Try them live. Keep what works.</p>
								<button type="button" className="pf-enter" onClick={enter}>
									<span className="pf-play-glyph">▶</span>
									<span>
										Take it for a spin<small>Right here in your browser.</small>
									</span>
									<span className="pf-enter-arrow">↓</span>
								</button>
							</div>
						) : (
							<p className="pf-description">
								Design websites, apps, and presentations with your agent.
								<br />
								Try them live. Keep what works.
							</p>
						)}
					</section>
					<section
						className="pf-preview pf-width"
						ref={preview}
						tabIndex={-1}
						aria-label="Interactive spool canvas"
					>
						{take === "threshold" ? (
							<div className="pf-threshold">
								<button onClick={enter} type="button">
									Go on. Press something.<span>↘</span>
								</button>
								<p>
									This is Offprint, a workshop app made in spool.
									<br />
									Double-click a frame and try booking a seat.
								</p>
							</div>
						) : (
							<div className="pf-preview-top">
								<p>
									<span className="pf-live-dot" />
									{entered
										? "You’re in. Double-click a frame to play."
										: "A little project to get your hands on."}
								</p>
								<span>offprint / 3 live frames</span>
							</div>
						)}
						<OffprintSurface view="canvas" />
						<div className="pf-preview-foot">
							<p>
								{take === "enter"
									? "Double-click a frame. Find a workshop. Book a seat."
									: "Select a frame to look around. Double-click to step inside."}
							</p>
							<span>Interactive demo · changes stay here</span>
						</div>
					</section>
					<section className="pf-explain pf-width" id="compare">
						<h2>
							Make it.
							<br />
							Try it.
							<br />
							Work it out.
						</h2>
						<div>
							<p>
								Ask your agent for a few directions. Put them side by side. Click through them while the idea is
								still taking shape.
							</p>
							<p>
								Every frame is a live TSX file in your project. The buttons work. The forms take input. Your
								agent can keep building from the same source.
							</p>
							<a href={`${REPO}#readme`}>See how spool works ↗</a>
						</div>
					</section>
					<section className="pf-start pf-width" id="start">
						<div>
							<h2>
								Your next idea
								<br />
								can start here.
							</h2>
							<p>Download spool, open a project, and bring your agent.</p>
						</div>
						<div className="pf-install">
							<a href={DOWNLOAD}>
								Download for Mac <span>↓</span>
							</a>
							<CopyCommand command={INSTALL_COMMAND} placement="play-first-footer" />
							<small>Or install from your terminal.</small>
						</div>
					</section>
				</main>
				<footer className="pf-footer pf-width">
					<a className="pf-brand" href="#">
						<SpoolMark />
						spool
					</a>
					<span>Made in spool. Of course.</span>
					<a href={`${REPO}#readme`}>Docs ↗</a>
					<a href={REPO}>GitHub ↗</a>
					<button type="button" onClick={() => setPaused(!paused)} aria-pressed={paused}>
						{paused ? "motion off" : "motion on"}
					</button>
				</footer>
			</div>
		</div>
	);
}
