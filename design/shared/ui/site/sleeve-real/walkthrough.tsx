import { useEffect, useRef, useState } from "react";
import { AppSurface } from "shared/ui/site/sleeve-real/app";
import { SpoolMark } from "shared/ui/spool/mark";
import "./walkthrough.css";

const REPO = "https://github.com/liamvinberg/spool";
const STEPS = [
	{
		view: "canvas",
		title: "Give the idea a few forms.",
		body: "Sleeve started with a simple brief: a desktop music app with the warmth of a record shop. Here are three ways that could look, on the same canvas.",
		more: "Arrange the screens next to each other. Compare the density, the artwork, and what each one asks you to do first. Keep looking until you know which parts you want to carry forward.",
	},
	{
		view: "agent",
		title: "Talk about what’s in front of you.",
		body: "The conversation lives beside the canvas. Select a frame and your agent has that selection as context for the next change.",
		more: "Ask for another layout or get specific about a single detail. The work stays visible while the agent edits the files. You have a screen to respond to, and the agent has a place to work.",
	},
	{
		view: "properties",
		title: "Get closer to the details.",
		body: "Select a frame to inspect its position and dimensions. Move between the overall composition and the screen you want to work on.",
		more: "The screens are live React components. Open one and try its controls, follow the flow, and notice what needs another pass. Sleeve’s player is a prototype, so its controls work without playing audio.",
	},
] as const;

function Wordmark() {
	return (
		<span className="sw-wordmark">
			<SpoolMark />
			<span>spool</span>
		</span>
	);
}

export function SleeveWalkthrough() {
	const root = useRef<HTMLDivElement>(null);
	const chapters = useRef<(HTMLElement | null)[]>([]);
	const [step, setStep] = useState(0);
	const [copied, setCopied] = useState(false);
	const jump = (id: string) => {
		const node = root.current?.querySelector<HTMLElement>(`#${id}`);
		if (node && root.current)
			root.current.scrollTo({
				top: root.current.scrollTop + node.getBoundingClientRect().top - root.current.getBoundingClientRect().top - 32,
			});
	};
	useEffect(() => {
		const scroller = root.current;
		if (!scroller) return;
		const update = () => {
			const threshold = scroller.getBoundingClientRect().top + scroller.clientHeight * 0.45;
			let next = 0;
			chapters.current.forEach((chapter, index) => {
				if (chapter && chapter.getBoundingClientRect().top < threshold) next = index;
			});
			setStep(next);
		};
		scroller.addEventListener("scroll", update, { passive: true });
		update();
		return () => scroller.removeEventListener("scroll", update);
	}, []);
	return (
		<div className="sw-page" ref={root}>
			<nav className="sw-nav" aria-label="Website navigation">
				<button type="button" onClick={() => root.current?.scrollTo({ top: 0 })} aria-label="spool home">
					<Wordmark />
				</button>
				<div>
					<button type="button" onClick={() => jump("walk")}>
						See how it works ↓
					</button>
					<a href={REPO}>GitHub ↗</a>
					<a href={`${REPO}/releases/latest/download/Spool.dmg`}>Get spool</a>
				</div>
			</nav>
			<header className="sw-hero">
				<h1>
					Design it. Try it.
					<br />
					<span>Change your mind.</span>
				</h1>
				<div>
					<p>
						spool is a local canvas for designing with your agent. Make live screens, explore a few directions, and work
						out how the app should feel.
					</p>
					<button type="button" onClick={() => jump("walk")}>
						Follow an idea through spool <span>↓</span>
					</button>
				</div>
			</header>
			<section id="walk" className="sw-walk" aria-label="Sleeve walkthrough">
				<div className="sw-chapters">
					{STEPS.map((entry, index) => (
						<section
							key={entry.view}
							id={`walk-${entry.view}`}
							ref={(node) => {
								chapters.current[index] = node;
							}}
							className="sw-chapter"
							data-current={step === index}
						>
							<div className="sw-chapter-number">
								0{index + 1}
								<span>/ 03</span>
							</div>
							<h2>{entry.title}</h2>
							<p>{entry.body}</p>
							<p>{entry.more}</p>
							{index < 2 && (
								<button type="button" onClick={() => jump(`walk-${STEPS[index + 1]?.view}`)}>
									Continue <span>↓</span>
								</button>
							)}
						</section>
					))}
				</div>
				<div className="sw-sticky">
					<AppSurface view={STEPS[step]?.view ?? "canvas"} />
					<div className="sw-caption">
						<span>Sleeve in spool. Demo content; changes stay in this preview.</span>
						<span>{step + 1} / 3</span>
					</div>
					<nav className="sw-stages" aria-label="Walkthrough chapters">
						{STEPS.map((entry, index) => (
							<button
								type="button"
								key={entry.view}
								aria-current={step === index ? "step" : undefined}
								onClick={() => jump(`walk-${entry.view}`)}
							>
								{["Compare screens", "Work with your agent", "Inspect a frame"][index]}
							</button>
						))}
					</nav>
				</div>
			</section>
			<section className="sw-files">
				<h2>
					The work lives
					<br />
					with your project.
				</h2>
				<div>
					<p>
						Each screen is a TSX file in your design/ folder. Your agent edits the source, and spool renders the result
						on the canvas.
					</p>
					<p>
						Use shared components across screens and Git to track the changes. Once the direction is clear, the
						prototype gives you a concrete reference for building it into your product.
					</p>
					<a href={`${REPO}#readme`}>Read how spool works ↗</a>
				</div>
			</section>
			<section className="sw-faq">
				<h2>A few things to know.</h2>
				<div>
					<details>
						<summary>
							Is Sleeve a finished music app?<span>+</span>
						</summary>
						<p>
							It is an interactive example built in spool. The layouts and controls are real components; the music and
							conversation are demonstration content.
						</p>
					</details>
					<details>
						<summary>
							How does my agent get started?<span>+</span>
						</summary>
						<p>
							Run spool init in your project. It creates the design folder and the signposts that direct your agent to
							spool skill, the frame-authoring contract.
						</p>
					</details>
					<details>
						<summary>
							What do I need to run spool?<span>+</span>
						</summary>
						<p>
							The Mac app runs on Apple silicon with macOS 14 or later. The CLI needs Node 22+ and Chrome on macOS or
							Linux. Use WSL on Windows.
						</p>
					</details>
				</div>
			</section>
			<section className="sw-start" id="start">
				<SpoolMark />
				<h2>
					What are you
					<br />
					working on?
				</h2>
				<p>Open your project. Give the first idea a screen.</p>
				<div>
					<a href={`${REPO}/releases/latest/download/Spool.dmg`}>
						Get spool for Mac <span>↓</span>
					</a>
					<button
						type="button"
						aria-label="Copy install command"
						onClick={() => {
							void navigator.clipboard?.writeText("npm i -g spool.page").then(
								() => setCopied(true),
								() => setCopied(false),
							);
						}}
					>
						{copied ? "Copied" : "npm i -g spool.page"}
						<span>⧉</span>
					</button>
				</div>
				<small>Open source. Local-first. Free to use.</small>
			</section>
			<footer className="sw-footer">
				<Wordmark />
				<span>Made in spool.</span>
				<a href={REPO}>GitHub ↗</a>
				<a href={`${REPO}/blob/main/LICENSE.md`}>MIT licence</a>
			</footer>
		</div>
	);
}
