import { type ReactNode, useEffect, useRef, useState } from "react";
import { SpoolMark } from "shared/ui/site/current/ui/spool/mark";
import { FollowUpdates } from "shared/ui/site/current/ui/site/sleeve-guide/follow-updates";
import { GuideIcon } from "shared/ui/site/current/ui/site/sleeve-guide/icons";
import { ModernStart } from "shared/ui/site/current/ui/site/sleeve-guide/modern-start";
import { useLandingArrival } from "shared/ui/site/current/ui/site/demo-apps/landing-arrival";
import { OffprintSurface } from "shared/ui/site/current/ui/site/demo-apps/landing-canvas";
import { DEMO_NAMES, DEMO_TAKES, DemoProduct, type DemoTake } from "shared/ui/site/current/ui/site/demo-apps/landing-product";
import "shared/ui/site/current/ui/site/sleeve-guide/guide.css";
import "shared/ui/site/current/ui/site/sleeve-guide/modern.css";
import "shared/ui/site/current/ui/site/demo-apps/landing.css";
import { CopyCommand, DOWNLOAD, INSTALL_COMMAND } from "shared/ui/site/current/install";

const REPO = "https://github.com/liamvinberg/spool";

type Example = DemoTake;
const EXAMPLE_NAMES: Record<Example, string> = {
	...DEMO_NAMES,
};
const CHAPTERS = [
	{ id: "try", name: "Try what you’re making" },
	{ id: "compare", name: "Walk through a flow" },
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

function Product({ take, live = false }: { take: Example; live?: boolean }) {
	return (
		<div className="sg-product">
			<div className="sg-product-inner" inert={!live}>
				<DemoProduct take={take} />
			</div>
		</div>
	);
}

function Source() {
	return (
		<figure className="sg-source-pair">
			<div className="sg-source-snippet">
				<p>offprint-workshops/frame.tsx</p>
				<pre>
					<code>
						<span>export default function</span>
						{` Frame() {\n  return (\n    <DemoProduct\n      take="workshops"\n    />\n  );\n}`}
					</code>
				</pre>
				<small>The component in your project.</small>
			</div>
			<div className="sg-source-arrow">
				<GuideIcon name="right" />
			</div>
			<div className="sg-source-result">
				<Product take="workshops" />
				<p>The frame on your canvas.</p>
			</div>
			<figcaption>Edit the file. See the result.</figcaption>
		</figure>
	);
}

// Ported from spool’s demo-offprint--landing frame.
export function ObjectLanding({ footerExtra, take }: { footerExtra?: ReactNode; take: "package" | "dock" }) {
	const root = useRef<HTMLDivElement>(null);
	useLandingArrival(root);
	const dialog = useRef<HTMLDialogElement>(null);
	const [active, setActive] = useState("try");
	const [playing, setPlaying] = useState<Example>("workshops");
	const [session, setSession] = useState(0);
	const pointer = useRef(false);
	const playerAnimation = useRef<Animation | null>(null);
	const jump = (id: string) => {
		setActive(id);
		const page = root.current;
		const node = page?.querySelector<HTMLElement>(`#${id}`);
		node?.scrollIntoView({ block: "start", behavior: canAnimate() ? "smooth" : "instant" });
	};
	useEffect(() => {
		const page = root.current;
		if (!page) return;
		const update = () => {
			const line = window.innerHeight * 0.4;
			let next: string = "try";
			for (const chapter of CHAPTERS) {
				const section = page.querySelector(`#${chapter.id}`);
				if (section && section.getBoundingClientRect().top < line) next = chapter.id;
			}
			setActive(next);
		};
		update();
		window.addEventListener("scroll", update, { passive: true });
		return () => window.removeEventListener("scroll", update);
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
			className={`sg-page sm-page dl-page po-page po-${take}`}
			data-take="play"
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
				<button
					type="button"
					aria-label="spool home"
					onClick={() => window.scrollTo({ top: 0, behavior: canAnimate() ? "smooth" : "instant" })}
				>
					<Brand />
				</button>
				<nav aria-label="Website navigation">
					<a href={`${REPO}#readme`}>
						Docs <GuideIcon name="arrow" />
					</a>
					<a href={REPO}>
						GitHub <GuideIcon name="arrow" />
					</a>
					{take === "dock" && <InstallObject compact /> }
				</nav>
			</header>
			<main>
				<section className="sg-hero sg-width">
					<h1>
						A canvas for
						<br />
						working things out.
					</h1>

                    <div className="po-hero-foot">
                        <div className="po-intro">
                            <p>Design websites, apps, and presentations with your agent. Try them live. Keep what works.</p>
                            {take === "package" && <button className="po-try" type="button" onClick={() => jump("po-preview")}>Take it for a spin <GuideIcon name="down" /></button>}
                        </div>
                        {take === "package" ? <InstallObject /> : <button className="po-open-canvas" type="button" onClick={() => jump("po-preview")}><span>Take it<br />for a spin.</span><span className="po-big-arrow">↙</span></button>}
                    </div>
				</section>
				<section id="po-preview" className="sg-hero-app sg-width" aria-label="Offprint on the spool canvas">
                    <div className="po-preview-title"><span>Offprint <span className="po-preview-note">A workshop app, made in spool.</span></span><button type="button" onClick={() => open("workshops")}>Open the live demo <GuideIcon name="arrow" /></button></div>
					<OffprintSurface view="canvas" />
					<div className="sg-caption">
						<p>This is Offprint, a workshop app we’re making in spool. Have a look around.</p>
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
						<p>Find a workshop. Bring a friend. Get your ticket.</p>
						<p>
							Frames are live. Click through a flow, test an interaction, or step through a presentation as you
							design.
						</p>
						<p>Start with “Find your seat”.</p>
						<button className="sg-text-button" type="button" onClick={() => open("workshops")}>
							Open Offprint larger <GuideIcon name="arrow" />
						</button>
					</div>
					<div className="sg-live-example">
						<Product take="workshops" live />
						<div className="sg-caption">
							<span>Offprint / Your Saturday starts here</span>
							<span>Interactive demo · no booking is made</span>
						</div>
					</div>
				</section>
				<section id="compare" className="sg-compare sg-section sg-width">
					<div className="sg-section-heading">
						<h2>
							See how it
							<br />
							comes together.
						</h2>
						<div>
							<p>Lay out a short flow. Open any screen and try it from there.</p>
							<p>The time you choose on one screen appears on your ticket in the next.</p>
						</div>
					</div>
					<div className="sg-variants">
						{DEMO_TAKES.map((take, index) => (
							<article key={take}>
								<div className="sg-variant-top">
									<span>offprint-{take}</span>
									<span>1200 × 800</span>
								</div>
								<div className="sg-variant-open">
									<Product take={take} />
									<button
										type="button"
										aria-label={`Open ${DEMO_NAMES[take]}`}
										className="sg-variant-hit"
										onClick={() => open(take)}
									>
										<span className="sg-variant-open-hint">
											Try this screen <GuideIcon name="arrow" />
										</span>
									</button>
								</div>
								<div className="sg-variant-caption">
									<h3>{DEMO_NAMES[take]}</h3>
									<p>
										{
											[
												"Find a reason to get your hands inky.",
												"Pick a time. Save a seat for a friend.",
												"See your choices become a plan.",
											][index]
										}
									</p>
								</div>
							</article>
						))}
					</div>
					<p className="sg-next-thought">Three screens. One small Saturday plan.</p>
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
					<OffprintSurface view="agent" />
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
							The files live in your project’s design/ folder. Share components between frames and use Git to
							keep track of changes.
						</p>
						<p>Take it wherever you want next.</p>
						<a className="sg-text-button" href={`${REPO}#readme`}>
							How the files work <GuideIcon name="arrow" />
						</a>
					</div>
					<Source />
				</section>
				<ModernStart />
				<FollowUpdates />
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
				<a href="https://spool.page/privacy#settings">Privacy &amp; cookies</a>
				{footerExtra}
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

function InstallObject({ compact = false }: { compact?: boolean }) {
    return <div className={`po-install-object ${compact ? "po-compact" : ""}`}>
        <a className="po-package-download" href={DOWNLOAD}>
            <span className="po-app-icon"><SpoolMark /></span>
            <span className="po-package-type"><strong>spool</strong><span>Download for Mac</span></span>
            <span className="po-download-arrow" aria-hidden="true">↓</span>
        </a>
        <div className="po-package-terminal"><span>Or use your terminal</span><CopyCommand command={INSTALL_COMMAND} placement="hero" /></div>
    </div>;
}
