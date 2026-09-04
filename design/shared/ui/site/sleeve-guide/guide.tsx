import { useEffect, useRef, useState } from "react";
import { SleeveProduct, SLEEVE_TAKES, SLEEVE_NAMES, type SleeveTake } from "shared/ui/demo/sleeve/variations";
import { AppSurface } from "shared/ui/site/sleeve-real/app";
import { SpoolMark } from "shared/ui/spool/mark";
import { FieldworkPresentation, FieldworkWebsite } from "shared/ui/demo/fieldwork/examples";
import { GuideIcon } from "./icons";
import "./guide.css";

const REPO = "https://github.com/liamvinberg/spool";
const DOWNLOAD = `${REPO}/releases/latest/download/Spool.dmg`;
type Example = SleeveTake | "website" | "presentation";
const EXAMPLE_NAMES: Record<Example, string> = {
	...SLEEVE_NAMES,
	website: "Fieldwork website",
	presentation: "Fieldwork presentation",
};
const CHAPTERS = [
	{ id: "try", name: "Try what you’re making" },
	{ id: "compare", name: "Explore directions" },
	{ id: "agent", name: "Work with your agent" },
	{ id: "files", name: "Keep the source" },
	{ id: "start", name: "Get started" },
] as const;

function Brand() {
	return (
		<span className="sg-brand">
			<SpoolMark />
			<span>spool</span>
		</span>
	);
}
function Install() {
	const [copied, setCopied] = useState(false);
	return (
		<div className="sg-install">
			<a href={DOWNLOAD}>
				Download for Mac <GuideIcon name="down" />
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
				<code>{copied ? "copied" : "npm i -g spool.page"}</code>
				<GuideIcon name={copied ? "check" : "copy"} />
			</button>
		</div>
	);
}

function Product({ take, live = false }: { take: Example; live?: boolean }) {
	const ref = useRef<HTMLDivElement>(null);
	const [width, setWidth] = useState(720);
	useEffect(() => {
		const node = ref.current;
		if (!node) return;
		const observer = new ResizeObserver(([entry]) => {
			if (entry) setWidth(entry.contentRect.width);
		});
		observer.observe(node);
		return () => observer.disconnect();
	}, []);
	return (
		<div className="sg-product" ref={ref} style={{ height: (width * 2) / 3 }}>
			<div className="sg-product-inner" inert={!live} style={{ transform: `scale(${width / 1200})` }}>
				{take === "website" ? (
					<FieldworkWebsite />
				) : take === "presentation" ? (
					<FieldworkPresentation />
				) : (
					<SleeveProduct take={take} />
				)}
			</div>
		</div>
	);
}

function Source() {
	return (
		<figure className="sg-source-pair">
			<div className="sg-source-snippet">
				<p>sleeve-shelf/frame.tsx</p>
				<pre>
					<code>
						<span>export default function</span>
						{` Frame() {\n  return (\n    <SleeveProduct\n      take="shelf"\n    />\n  );\n}`}
					</code>
				</pre>
				<small>The component in your project.</small>
			</div>
			<div className="sg-source-arrow">
				<GuideIcon name="right" />
			</div>
			<div className="sg-source-result">
				<Product take="shelf" />
				<p>The frame on your canvas.</p>
			</div>
			<figcaption>Edit the file. See the result.</figcaption>
		</figure>
	);
}

export function SleeveGuide() {
	const root = useRef<HTMLDivElement>(null);
	const dialog = useRef<HTMLDialogElement>(null);
	const [active, setActive] = useState("try");
	const [playing, setPlaying] = useState<Example>("shelf");
	const [session, setSession] = useState(0);
	const pointer = useRef(false);
	const playerAnimation = useRef<Animation | null>(null);
	const jump = (id: string) => {
		setActive(id);
		const page = root.current;
		const node = page?.querySelector<HTMLElement>(`#${id}`);
		if (node && page)
			page.scrollTo({
				top: page.scrollTop + node.getBoundingClientRect().top - page.getBoundingClientRect().top - 100,
			});
	};
	useEffect(() => {
		const page = root.current;
		if (!page) return;
		const update = () => {
			const line = page.getBoundingClientRect().top + page.clientHeight * 0.4;
			let next: string = "try";
			for (const chapter of CHAPTERS) {
				const section = page.querySelector(`#${chapter.id}`);
				if (section && section.getBoundingClientRect().top < line) next = chapter.id;
			}
			setActive(next);
		};
		page.addEventListener("scroll", update, { passive: true });
		return () => page.removeEventListener("scroll", update);
	}, []);
	const canAnimate = () => pointer.current && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	const open = (take: Example) => {
		playerAnimation.current?.cancel();
		setPlaying(take);
		setSession((value) => value + 1);
		dialog.current?.showModal();
		if (canAnimate() && dialog.current)
			playerAnimation.current = dialog.current.animate(
				[
					{ opacity: 0, transform: "translateY(8px) scale(.985)" },
					{ opacity: 1, transform: "translateY(0) scale(1)" },
				],
				{ duration: 200, easing: "cubic-bezier(.23,1,.32,1)" },
			);
	};
	const close = () => {
		playerAnimation.current?.cancel();
		const player = dialog.current;
		if (!player || !canAnimate()) {
			player?.close();
			return;
		}
		const animation = player.animate(
			[
				{ opacity: 1, transform: "scale(1)" },
				{ opacity: 0, transform: "scale(.99)" },
			],
			{ duration: 120, easing: "cubic-bezier(.23,1,.32,1)" },
		);
		playerAnimation.current = animation;
		void animation.finished.then(
			() => player.close(),
			() => {},
		);
	};
	return (
		<div
			className="sg-page"
			ref={root}
			onPointerDownCapture={() => {
				pointer.current = true;
				if (root.current) root.current.dataset.input = "pointer";
			}}
			onKeyDownCapture={() => {
				pointer.current = false;
				if (root.current) root.current.dataset.input = "keyboard";
			}}
		>
			<header className="sg-nav sg-width">
				<button type="button" aria-label="spool home" onClick={() => root.current?.scrollTo({ top: 0 })}>
					<Brand />
				</button>
				<nav aria-label="Website navigation">
					<a href={`${REPO}#readme`}>
						Docs <GuideIcon name="arrow" />
					</a>
					<a href={REPO}>
						GitHub <GuideIcon name="arrow" />
					</a>
					<button type="button" onClick={() => jump("start")}>
						Get spool <GuideIcon name="down" />
					</button>
				</nav>
			</header>
			<main>
				<section className="sg-hero sg-width">
					<h1>
						A canvas for
						<br />
						working things out.
					</h1>
					<p>
						Design with your agent on a live canvas. Explore a website, a presentation, an interface, or something you
						haven’t figured out yet.
					</p>
					<div className="sg-hero-actions">
						<Install />
						<button className="sg-text-button" type="button" onClick={() => jump("try")}>
							Let’s try it together <GuideIcon name="down" />
						</button>
					</div>
				</section>
				<section className="sg-hero-app sg-width" aria-label="Sleeve on the spool canvas">
					<AppSurface view="canvas" />
					<div className="sg-caption">
						<p>We’ll start with Sleeve, a music app. It’s one example of what you can make in spool.</p>
						<span>Interactive preview · changes stay here</span>
					</div>
				</section>
				<nav className="sg-chapters" aria-label="Page chapters">
					<div className="sg-width">
						{CHAPTERS.map((chapter, index) => (
							<button
								key={chapter.id}
								type="button"
								onClick={() => jump(chapter.id)}
								aria-current={active === chapter.id ? "step" : undefined}
							>
								<span>0{index + 1}</span>
								{chapter.name}
							</button>
						))}
					</div>
				</nav>
				<section id="try" className="sg-try sg-section sg-width">
					<div className="sg-copy">
						<h2>
							Try what
							<br />
							you’re making.
						</h2>
						<p>Open a record. Pick a track. Try the player.</p>
						<p>
							Your work in spool is live. Use the controls, move through a presentation, or follow a flow while you’re
							still deciding how it should feel.
						</p>
						<p>This one works right here. Start with “Find your next record” and see where it takes you.</p>
						<button className="sg-text-button" type="button" onClick={() => open("shelf")}>
							Open Sleeve larger <GuideIcon name="arrow" />
						</button>
					</div>
					<div className="sg-live-example">
						<Product take="shelf" live />
						<div className="sg-caption">
							<span>Sleeve / The record shelf</span>
							<span>Player controls work · audio off</span>
						</div>
					</div>
				</section>
				<section id="compare" className="sg-compare sg-section sg-width">
					<div className="sg-section-heading">
						<h2>
							Now, try a<br />
							different direction.
						</h2>
						<div>
							<p>
								Ask your agent to explore different layouts for the same screen. Keep them together on the canvas, open
								each one, and see what feels right.
							</p>
							<p>You can take parts from several before asking for another pass.</p>
						</div>
					</div>
					<div className="sg-variants">
						{SLEEVE_TAKES.map((take, index) => (
							<article key={take}>
								<div className="sg-variant-top">
									<span>sleeve-{take}</span>
									<span>1200 × 800</span>
								</div>
								<div className="sg-variant-open">
									<Product take={take} />
									<button
										type="button"
										aria-label={`Open ${SLEEVE_NAMES[take]}`}
										className="sg-variant-hit"
										onClick={() => open(take)}
									>
										<span className="sg-variant-open-hint">
											Open layout <GuideIcon name="arrow" />
										</span>
									</button>
								</div>
								<div className="sg-variant-caption">
									<h3>{SLEEVE_NAMES[take]}</h3>
									<p>
										{
											[
												"Start with the whole collection.",
												"Bring the feature and browsing together.",
												"Give one record your attention.",
											][index]
										}
									</p>
								</div>
							</article>
						))}
					</div>
					<p className="sg-next-thought">Same idea, three ways in. Which parts would you keep?</p>
					<div className="sg-range">
						<div className="sg-range-heading">
							<h3>What else are you working on?</h3>
							<p>
								A website, a presentation, an idea you want to explain. The canvas gives each one a place to take shape.
							</p>
						</div>
						<div className="sg-range-grid">
							{(["website", "presentation"] as const).map((take) => (
								<article key={take}>
									<div className="sg-variant-open">
										<Product take={take} />
										<button
											type="button"
											className="sg-variant-hit"
											aria-label={`Open ${EXAMPLE_NAMES[take]}`}
											onClick={() => open(take)}
										>
											<span className="sg-variant-open-hint">
												{take === "presentation" ? "Try the slides" : "Explore the website"}
												<GuideIcon name="arrow" />
											</span>
										</button>
									</div>
									<div className="sg-variant-caption">
										<h3>{take === "website" ? "A website for a small studio." : "A presentation for a new idea."}</h3>
										<p>
											{take === "website"
												? "Try the project page and find the right first impression."
												: "Step through the slides and see how the story holds together."}
										</p>
									</div>
								</article>
							))}
						</div>
					</div>
				</section>
				<section id="agent" className="sg-agent sg-section sg-width">
					<div className="sg-section-heading">
						<h2>
							Keep working
							<br />
							with your agent.
						</h2>
						<div>
							<p>
								Once you’ve tried the screens, it’s easier to say what needs changing. Select a frame and that selection
								becomes context for your next request.
							</p>
							<p>
								Ask for a quieter layout, a different headline, or another idea entirely. Your agent edits the files
								while you keep the work in view.
							</p>
						</div>
					</div>
					<AppSurface view="agent" />
					<div className="sg-caption">
						<p>Try selecting another screen. Its name appears above the composer.</p>
						<span>Example conversation · no agent is running</span>
					</div>
				</section>
				<section id="files" className="sg-files sg-section sg-width">
					<div className="sg-copy">
						<h2>
							It’s all in
							<br />
							your project.
						</h2>
						<p>Each frame is a TSX file. Your agent edits it, and spool shows the result.</p>
						<p>
							The files live in your project’s design/ folder. Share components between frames and use Git to keep track
							of changes.
						</p>
						<p>
							Keep refining, present it, or use it as the starting point for what comes next. The work and its source
							are yours.
						</p>
						<a className="sg-text-button" href={`${REPO}#readme`}>
							A little more about the files <GuideIcon name="arrow" />
						</a>
					</div>
					<Source />
				</section>
				<section id="start" className="sg-start sg-width">
					<div className="sg-section-heading">
						<h2>
							Try it with
							<br />
							your own idea.
						</h2>
						<div>
							<p>
								Start with something you’re already working on. Give your agent a direction to explore and see what
								turns up.
							</p>
							<p>You can keep refining it from there.</p>
						</div>
					</div>
					<ol className="sg-setup">
						<li>
							<span>1</span>
							<div>
								<h3>Get spool.</h3>
								<p>Download the Mac app, or install the CLI.</p>
								<Install />
							</div>
						</li>
						<li>
							<span>2</span>
							<div>
								<h3>Open your project.</h3>
								<p>From your project folder, run:</p>
								<code>spool init</code>
								<p className="sg-setup-note">This creates design/ and the instructions your agent needs.</p>
							</div>
						</li>
						<li>
							<span>3</span>
							<div>
								<h3>Ask for a first take.</h3>
								<p>Tell your agent what you’re working on. For Sleeve, we started here:</p>
								<blockquote>“A desktop music app that feels like a record shop. Try a few directions.”</blockquote>
							</div>
						</li>
					</ol>
					<div className="sg-requirements">
						<p>
							Mac app: Apple silicon, macOS 14+.
							<br />
							CLI: Node 22+ and Chrome. macOS, Linux, or Windows through WSL.
						</p>
						<a href={`${REPO}#install`}>
							Installation details <GuideIcon name="arrow" />
						</a>
					</div>
				</section>
				<section className="sg-ending sg-width">
					<SpoolMark />
					<div>
						<h2>
							Made in spool.
							<br />
							Yours to build on.
						</h2>
						<p>spool is open source and free to use. It runs on your machine, and we use it to design spool itself.</p>
					</div>
					<a className="sg-text-button" href={REPO}>
						Explore the source <GuideIcon name="arrow" />
					</a>
				</section>
			</main>
			<footer className="sg-footer sg-width">
				<Brand />
				<span>A local canvas, still taking shape.</span>
				<a href={`${REPO}#readme`}>
					Docs <GuideIcon name="arrow" />
				</a>
				<a href={REPO}>
					GitHub <GuideIcon name="arrow" />
				</a>
				<a href={`${REPO}/blob/main/LICENSE.md`}>MIT licence</a>
			</footer>
			<dialog
				className="sg-player"
				ref={dialog}
				aria-label={EXAMPLE_NAMES[playing]}
				onCancel={(event) => {
					event.preventDefault();
					close();
				}}
			>
				<div className="sg-player-heading">
					<span>{EXAMPLE_NAMES[playing]}</span>
					<button type="button" onClick={close} aria-label="Close preview">
						Close <GuideIcon name="close" />
					</button>
				</div>
				<Product key={session} take={playing} live />
			</dialog>
		</div>
	);
}
