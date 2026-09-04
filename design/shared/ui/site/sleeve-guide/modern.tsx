import { useEffect, useRef, useState } from "react";
import { SleeveProduct, SLEEVE_TAKES, SLEEVE_NAMES, type SleeveTake } from "shared/ui/demo/sleeve/variations";
import { AppSurface } from "shared/ui/site/sleeve-real/app";
import { SpoolMark } from "shared/ui/spool/mark";
import { ModernStart, type ModernTake } from "./modern-start";
import { GuideIcon } from "./icons";
import "./guide.css";
import "./modern.css";

const REPO = "https://github.com/liamvinberg/spool";
const DOWNLOAD = `${REPO}/releases/latest/download/Spool.dmg`;
type Example = SleeveTake;
const EXAMPLE_NAMES: Record<Example, string> = {
	...SLEEVE_NAMES,
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
				<SleeveProduct take={take} />
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

// Three landing-page studies. The original guide stays untouched for comparison.
export function SleeveModern({ take }: { take: ModernTake }) {
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
			className="sg-page sm-page"
			data-take={take}
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
					<p>Design websites, apps, and presentations with your agent. Try them live. Keep what works.</p>
					<div className="sg-hero-actions">
						<Install />
						<button className="sg-text-button" type="button" onClick={() => jump("try")}>
							Take it for a spin <GuideIcon name="down" />
						</button>
					</div>
				</section>
				<section className="sg-hero-app sg-width" aria-label="Sleeve on the spool canvas">
					<AppSurface view="canvas" />
					<div className="sg-caption">
						<p>This is Sleeve, a music app we’re working on. Have a look around.</p>
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
							Go on.
							<br />
							Press something.
						</h2>
						<p>Open a record. Pick a track. Try the player.</p>
						<p>
							Frames are live. Click through a flow, test an interaction, or step through a presentation as you design.
						</p>
						<p>Start with “Find your next record”.</p>
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
							What if it
							<br />
							looked like this?
						</h2>
						<div>
							<p>Ask for a few directions. Put them side by side. Open each one and see what you think.</p>
							<p>Keep the layout from one. The player from another. Try again.</p>
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
				</section>
				<section id="agent" className="sg-agent sg-section sg-width">
					<div className="sg-section-heading">
						<h2>
							A little more this.
							<br />A little less that.
						</h2>
						<div>
							<p>Select a frame and tell your agent what to change. Your selection gives it the context.</p>
							<p>A different headline. More room for the artwork. See each change on the canvas.</p>
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
						<p>Take it wherever you want next.</p>
						<a className="sg-text-button" href={`${REPO}#readme`}>
							How the files work <GuideIcon name="arrow" />
						</a>
					</div>
					<Source />
				</section>
				<ModernStart take={take} />
			</main>
			<footer className="sg-footer sg-width">
				<Brand />
				<span>Made in spool. Of course.</span>
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
