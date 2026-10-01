import { type ReactNode, useEffect, useState } from "react";
import { HalftoneField } from "shared/ui/site/fresh/material/halftone";
import {
	CopyCommand,
	DOCS,
	DOWNLOAD,
	INSTALL_COMMAND,
	Icon,
	LICENCE,
	REPO,
	SpoolMark,
	useOnScreen,
	useSeen,
	X,
} from "shared/ui/site/fresh/material/site";
import "shared/ui/site/fresh/material/material.css";
import "./page.css";

const FRAME_SOURCE = `export default function Pay() {
  return (
    <Sheet title="Pay 340 kr">
      <CardField />
      <Button data-go="checkout/done">
        Pay
      </Button>
    </Sheet>
  );
}`;

export default function Frame() {
	return (
		<div className="m-page px-page">
			<HalftoneField page=".px-page" hero=".px-hero-type" mid=".px-mid" band=".px-band" quiet=".px-quiet" />

			<header className="px-nav m-width">
				<span className="px-quiet px-nav-quiet" aria-hidden="true" />
				<a href="https://spool.page/" className="px-brand" aria-label="spool home">
					<SpoolMark className="px-mark" />
					<span>spool</span>
				</a>
				<nav aria-label="Website">
					<a href={DOCS}>Docs</a>
					<a href={REPO}>GitHub</a>
					<a href="#start">Download</a>
				</nav>
			</header>

			<main>
				<section className="px-hero m-width">
					<Crops />
					<h1 className="px-hero-type">
						<span>A canvas for</span>
						<span>working things out.</span>
					</h1>
					<div className="px-hero-foot">
						<p className="px-lede px-quiet">
							Design websites, apps, and presentations with your agent. Try them live. Keep what works.
						</p>
						<div className="px-get px-quiet">
							<a className="px-download" href={DOWNLOAD}>
								<span>Download for Mac</span>
								<Icon name="down" />
							</a>
							<CopyCommand className="px-command" command={INSTALL_COMMAND} prompt="$" />
						</div>
					</div>
				</section>

				<Section
					heading="Your agent writes each screen as a file."
					body={[
						"Claude Code, Codex, or whichever agent you use writes TSX into your project, one folder per frame.",
						"spool watches the folder and draws every frame live on an infinite canvas.",
					]}
					mid
				>
					<figure className="px-source px-quiet">
						<figcaption className="m-mono">design/frames/checkout/pay/frame.tsx</figcaption>
						<pre className="m-mono">
							<code>{FRAME_SOURCE}</code>
						</pre>
					</figure>
				</Section>

				<Section
					heading="Lay them side by side, then walk through them."
					body={[
						"Link a button to the next frame and press play.",
						"The flow runs in a real browser tab, and what you chose on one screen is still there on the next.",
					]}
				>
					<Walk />
				</Section>

				<Section
					heading="It’s all in your repo, so Git keeps the history."
					body={[
						"frame.tsx is the screen. frame.json is where it sits on the canvas.",
						"A design change arrives as a pull request, like any other change.",
					]}
				>
					<div className="px-tree m-mono" aria-label="The design folder">
						{[
							["design/", 0],
							["frames/", 1],
							["checkout/", 2],
							["cart/", 3],
							["shipping/", 3],
							["pay/", 3],
							["frame.tsx", 4],
							["frame.json", 4],
							["shared/", 1],
						].map(([name, depth]) => (
							<p key={`${name}${depth}`} style={{ paddingLeft: `${Number(depth) * 2.4}ch` }}>
								{name}
							</p>
						))}
					</div>
				</Section>

				<section id="start" className="px-band">
					<div className="m-width px-band-inner">
						<h2>Start with one frame.</h2>
						<div className="px-band-foot">
							<p>
								Download spool for Mac, or install it from npm and run <code>spool init</code> in your project.
							</p>
							<div className="px-band-get">
								<a className="px-band-download" href={DOWNLOAD}>
									<Icon name="down" />
									<span>Download for Mac</span>
								</a>
								<CopyCommand className="px-band-command" command={INSTALL_COMMAND} prompt="$" />
								<CopyCommand className="px-band-command" command="spool init" prompt="$" />
							</div>
						</div>
						<p className="px-band-meta">Free and MIT licensed. Apple silicon, macOS 14 or later.</p>
					</div>
				</section>
			</main>

			<footer className="px-footer m-width">
				<div className="px-footer-brand">
					<a href="https://spool.page/" className="px-brand" aria-label="spool home">
						<SpoolMark className="px-mark" />
						<span>spool</span>
					</a>
					<Registration />
				</div>
				<p>
					Made by Liam, who posts what he is working on at{" "}
					<a href={X} target="_blank" rel="noreferrer">
						@liamvinberg
					</a>
					.
				</p>
				<nav aria-label="Footer">
					<a href={DOCS}>Docs</a>
					<a href={REPO}>GitHub</a>
					<a href={LICENCE}>MIT licence</a>
				</nav>
			</footer>
		</div>
	);
}

function Section({
	heading,
	body,
	children,
	mid = false,
}: {
	heading: string;
	body: string[];
	children: ReactNode;
	mid?: boolean;
}) {
	const [ref, seen] = useSeen<HTMLElement>(0.2);
	return (
		<section ref={ref} className="px-section m-width" data-seen={seen}>
			{mid && <div className="px-mid" aria-hidden="true" />}
			<h2>{heading}</h2>
			<div className="px-section-body">
				<div className="px-copy px-quiet">
					{body.map((line) => (
						<p key={line}>{line}</p>
					))}
				</div>
				<div className="px-visual">{children}</div>
			</div>
		</section>
	);
}

const STEPS = ["cart", "shipping", "pay", "done"];

function Walk() {
	const [ref, on] = useOnScreen<HTMLDivElement>();
	const [at, setAt] = useState(0);
	useEffect(() => {
		if (!on || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
		const timer = window.setInterval(() => setAt((value) => (value + 1) % (STEPS.length + 1)), 1100);
		return () => window.clearInterval(timer);
	}, [on]);
	return (
		<div ref={ref} className="px-walk" aria-label="A flow of four frames: cart, shipping, pay, done">
			{STEPS.map((step, index) => (
				<p key={step} className="px-step" data-lit={index < at || undefined}>
					<span>{step}</span>
				</p>
			))}
		</div>
	);
}

function Crops() {
	return (
		<div className="px-crops" aria-hidden="true">
			<i />
			<i />
			<i />
			<i />
		</div>
	);
}

function Registration() {
	return (
		<svg className="px-registration" viewBox="0 0 24 24" aria-hidden="true">
			<circle cx="12" cy="12" r="6.5" fill="none" stroke="currentColor" strokeWidth="1" />
			<path d="M12 1v22M1 12h22" stroke="currentColor" strokeWidth="1" />
		</svg>
	);
}
