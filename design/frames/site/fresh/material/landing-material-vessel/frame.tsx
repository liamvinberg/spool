import { type ReactNode, useEffect, useState } from "react";
import { InkType } from "shared/ui/site/fresh/material/ink-type";
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

export default function Frame() {
	return (
		<div className="m-page vx-page">
			<header className="vx-nav m-width">
				<a href="https://spool.page/" className="vx-brand" aria-label="spool home">
					<SpoolMark className="vx-mark" />
					<span>spool</span>
				</a>
				<nav aria-label="Website">
					<a href={DOCS}>Docs</a>
					<a href={REPO}>GitHub</a>
					<a href="#start" className="vx-nav-get">
						Download
					</a>
				</nav>
			</header>

			<main>
				<section className="vx-hero m-width">
					<InkType
						as="h1"
						className="vx-display vx-hero-type"
						lines={["A canvas", "for working", "things out."]}
						origin={[0.12, 0.3]}
						seed={1.7}
					/>
					<div className="vx-hero-foot">
						<p className="vx-lede">
							Design websites, apps, and presentations with your agent, then try them live.
						</p>
						<Acquire />
					</div>
				</section>

				<Section
					heading="Your agent writes the screens."
					body={[
						"Claude Code, Codex, or whichever agent you already use writes each frame as a TSX file in your project.",
						"spool picks it up the moment it is saved and puts it on an infinite canvas.",
					]}
				>
					<Transcript />
				</Section>

				<Section
					heading="Then you walk through them."
					body={[
						"Put frames side by side and link one to the next.",
						"Press play and the flow runs like the real thing. Buttons press, forms keep what you typed, and the next screen opens where it should.",
					]}
				>
					<Walk />
				</Section>

				<Section
					heading="It all stays in your repo."
					body={[
						"frame.tsx is the screen. frame.json is where it sits on the canvas.",
						"Commit them with the rest of your code, and Git keeps every version.",
					]}
				>
					<Files />
				</Section>

				<section id="start" className="vx-start m-width">
					<InkType
						className="vx-display vx-start-type"
						lines={["Keep what", "works."]}
						origin={[0.85, 0.7]}
						seed={6.3}
						delay={0.15}
					/>
					<div className="vx-start-foot">
						<p className="vx-lede">Free and open source. One download, or one line in your terminal.</p>
						<div className="vx-start-get">
							<a className="vx-download" href={DOWNLOAD}>
								<Icon name="down" />
								<span>Download for Mac</span>
							</a>
							<div className="vx-commands">
								<CopyCommand className="vx-command" command={INSTALL_COMMAND} prompt="$" />
								<CopyCommand className="vx-command" command="spool init" prompt="$" />
							</div>
							<p className="vx-meta">MIT licence · Apple silicon · macOS 14 or later</p>
						</div>
					</div>
				</section>
			</main>

			<footer className="vx-footer m-width">
				<a href="https://spool.page/" className="vx-brand" aria-label="spool home">
					<SpoolMark className="vx-mark" />
					<span>spool</span>
				</a>
				<p>
					Made by Liam. Follow along at{" "}
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

function Acquire() {
	return (
		<div className="vx-acquire">
			<a className="vx-download" href={DOWNLOAD}>
				<Icon name="down" />
				<span>Download for Mac</span>
			</a>
			<CopyCommand className="vx-command" command={INSTALL_COMMAND} prompt="$" />
		</div>
	);
}

function Section({ heading, body, children }: { heading: string; body: string[]; children: ReactNode }) {
	const [ref, seen] = useSeen<HTMLElement>(0.2);
	return (
		<section ref={ref} className="vx-section m-width" data-seen={seen}>
			<div className="vx-copy">
				<h2>{heading}</h2>
				<div>
					{body.map((line) => (
						<p key={line}>{line}</p>
					))}
				</div>
			</div>
			<div className="vx-visual">{children}</div>
		</section>
	);
}

function Transcript() {
	return (
		<div className="vx-transcript m-mono" aria-label="An agent writing three frames">
			<p className="vx-t-prompt">
				<span>~/kaffe</span> claude
			</p>
			<p className="vx-t-ask">Draw the checkout as three screens. Card details last.</p>
			{["design/frames/checkout/cart/frame.tsx", "design/frames/checkout/shipping/frame.tsx", "design/frames/checkout/pay/frame.tsx"].map(
				(path) => (
					<p key={path} className="vx-t-write">
						<i />
						Write <span>{path}</span>
					</p>
				),
			)}
			<p className="vx-t-done">3 frames on the canvas</p>
		</div>
	);
}

const SCREENS = [
	{ name: "checkout/cart", title: "Two items", action: "Continue" },
	{ name: "checkout/shipping", title: "Deliver to", action: "Pay next" },
	{ name: "checkout/pay", title: "Pay 340 kr", action: "Pay" },
];

function Walk() {
	const [ref, on] = useOnScreen<HTMLDivElement>();
	const [step, setStep] = useState(0);
	useEffect(() => {
		if (!on || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
		const timer = window.setInterval(() => setStep((value) => (value + 1) % 4), 1500);
		return () => window.clearInterval(timer);
	}, [on]);
	return (
		<div ref={ref} className="vx-walk" data-step={step}>
			{SCREENS.map((screen, index) => (
				<div key={screen.name} className="vx-screen" data-state={index < step ? "past" : index === step ? "here" : "ahead"}>
					<p className="m-mono">{screen.name}</p>
					<div className="vx-screen-body">
						<strong>{screen.title}</strong>
						<span className="vx-screen-lines">
							<i />
							<i />
						</span>
						<span className="vx-screen-action">{screen.action}</span>
					</div>
				</div>
			))}
		</div>
	);
}

function Files() {
	return (
		<div className="vx-files m-mono">
			<div className="vx-tree" aria-label="The design folder">
				<p>design/</p>
				<p className="d1">frames/</p>
				<p className="d2">checkout/</p>
				<p className="d3">cart/</p>
				<p className="d4 vx-here">frame.tsx</p>
				<p className="d4">frame.json</p>
				<p className="d3">shipping/</p>
				<p className="d3">pay/</p>
				<p className="d1">shared/</p>
			</div>
			<div className="vx-log" aria-label="Recent commits">
				<p className="vx-log-cmd">
					<span>$</span> git log --oneline
				</p>
				{[
					["a41c9e2", "checkout: move card details last"],
					["7d0b315", "checkout: add a shipping step"],
					["c2e8f04", "checkout: first pass at the cart"],
				].map(([hash, message]) => (
					<p key={hash}>
						<span>{hash}</span> {message}
					</p>
				))}
			</div>
		</div>
	);
}
