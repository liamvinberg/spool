import { useRef, useState } from "react";
import { cn } from "shared/lib/utils";
import { SpoolMark } from "shared/ui/spool/mark";
import { AppSurface } from "shared/ui/site/sleeve-real/app";
import "./directions.css";

const REPO = "https://github.com/liamvinberg/spool";
const DOWNLOAD = `${REPO}/releases/latest/download/Spool.dmg`;

function Brand() {
	return (
		<span className="ld-brand">
			<SpoolMark />
			<span>spool</span>
		</span>
	);
}

function Install() {
	const [copied, setCopied] = useState(false);
	return (
		<div className="ld-install">
			<a href={DOWNLOAD} className="ld-download">
				Get spool for Mac <span aria-hidden="true">↓</span>
			</a>
			<button
				type="button"
				className="ld-command"
				aria-label="Copy install command"
				onClick={() => {
					void navigator.clipboard?.writeText("npm i -g spool.page").then(
						() => setCopied(true),
						() => setCopied(false),
					);
				}}
			>
				<code>{copied ? "copied" : "npm i -g spool.page"}</code>
				<span aria-hidden="true">{copied ? "✓" : "⧉"}</span>
			</button>
		</div>
	);
}

function AppCrop({ view, className }: { view: "agent" | "properties"; className?: string }) {
	return (
		<figure className="ld-crop-figure">
			<div className={cn("ld-app-crop", className)}>
				<div className="ld-app-crop-inner">
					<AppSurface view={view} />
				</div>
			</div>
			<figcaption className="ld-demo-note">Demo content. Changes stay in this preview.</figcaption>
		</figure>
	);
}

function Questions() {
	return (
		<div className="ld-questions">
			<details open>
				<summary>
					What do I need to get started?<span aria-hidden="true">+</span>
				</summary>
				<p>
					The Mac app runs on Apple silicon with macOS 14 or later. The CLI needs Node 22+ and works on macOS, Linux,
					and Windows through WSL. Use Chrome for the canvas.
				</p>
			</details>
			<details>
				<summary>
					Where does my work live?<span aria-hidden="true">+</span>
				</summary>
				<p>
					In a design/ folder inside your project. Your frames are TSX files, rendered by a local daemon. You can keep
					their history in Git.
				</p>
			</details>
			<details>
				<summary>
					Is spool open source?<span aria-hidden="true">+</span>
				</summary>
				<p>
					Yes. spool is MIT licensed, published, and used daily to design spool itself. It is still before version 1.0,
					so expect changes.
				</p>
			</details>
		</div>
	);
}

function End({ editorial = false }: { editorial?: boolean }) {
	return (
		<>
			<section id="questions" className="ld-faq ld-contained">
				<h2 className="ld-h2">Before you start.</h2>
				<Questions />
			</section>
			<section className="ld-start ld-contained">
				<div>
					<h2 className="ld-start-title">{editorial ? "Start with a screen." : "Put an idea on the canvas."}</h2>
					<p className="ld-body">Open a project. Give your agent a brief. See what takes shape.</p>
				</div>
				<Install />
			</section>
			<footer className="ld-footer ld-contained">
				<Brand />
				<p>A local canvas. An open source project.</p>
				<div>
					<a href={`${REPO}#readme`}>Documentation ↗</a>
					<a href={REPO}>GitHub ↗</a>
				</div>
			</footer>
		</>
	);
}

function Proof({ jump }: { jump: (id: string) => void }) {
	return (
		<>
			<section className="ld-proof-hero ld-contained">
				<h1 className="ld-h1">See what you’re making.</h1>
				<p className="ld-hero-copy">
					Design with your agent on a canvas of live screens. <br />
					Explore a few directions, try the interactions, and work out the flow.
				</p>
				<Install />
			</section>
			<section id="canvas" className="ld-proof-canvas ld-contained">
				<AppSurface view="canvas" />
				<div className="ld-caption">
					<span>Sleeve, a music app taking shape in spool.</span>
					<button type="button" onClick={() => jump("workflow")}>
						A closer look <span aria-hidden="true">↓</span>
					</button>
				</div>
			</section>
			<section className="ld-proof-intro ld-contained">
				<h2 className="ld-h2">
					A screen gives you
					<br />
					something to respond to.
				</h2>
				<p className="ld-body">
					The first take is a starting point. Put another beside it. Open each one, use the controls, and compare how
					they feel. The canvas gives every direction room while you decide what’s worth carrying forward.
				</p>
			</section>
			<section id="workflow" className="ld-proof-row ld-contained">
				<div className="ld-section-copy">
					<h2 className="ld-h2">
						Work with your agent.
						<br />
						Right here.
					</h2>
					<p className="ld-body">
						Describe what you want to explore. Your agent authors the frames as TSX, and they appear on the canvas as it
						works.
					</p>
					<p className="ld-body">
						Keep the conversation beside the result. Ask for another layout, change the hierarchy, or take an idea
						further.
					</p>
				</div>
				<AppCrop view="agent" />
			</section>
			<section className="ld-proof-row ld-proof-row-reverse ld-contained">
				<AppCrop view="properties" />
				<div className="ld-section-copy">
					<h2 className="ld-h2">
						Give each screen
						<br />
						its place.
					</h2>
					<p className="ld-body">
						Select a frame to inspect its position and dimensions. Move it beside another take, or resize it to give the
						layout more room.
					</p>
					<p className="ld-body">
						Then play the frame. Real inputs, state, and motion help you judge what a screen will feel like to use.
					</p>
				</div>
			</section>
			<section className="ld-files ld-contained">
				<div>
					<h2 className="ld-h2">
						Your project.
						<br />
						Your files.
					</h2>
					<a className="ld-text-link" href={`${REPO}#readme`}>
						Read how it works <span aria-hidden="true">↗</span>
					</a>
				</div>
				<div>
					<p className="ld-large-copy">
						Every frame is code in your project’s <code>design/</code> folder.
					</p>
					<p className="ld-body">
						Shared components stay shared. Git can keep the history. Once you’ve settled on a direction, the source is
						there to help you build it into your product.
					</p>
					<p className="ld-body">spool runs locally on your machine.</p>
				</div>
			</section>
			<End />
		</>
	);
}

function Editorial({ jump }: { jump: (id: string) => void }) {
	return (
		<>
			<section className="ld-editorial-hero ld-contained">
				<div className="ld-editorial-title">
					<h1 className="ld-h1">
						Room for
						<br />
						another take.
					</h1>
					<p className="ld-hero-copy">
						spool is a local canvas for designing with your agent. Make live screens, put the alternatives together, and
						try the flow before you build it.
					</p>
					<Install />
					<button className="ld-editorial-see" type="button" onClick={() => jump("canvas")}>
						Step inside the canvas <span aria-hidden="true">↓</span>
					</button>
				</div>
				<div className="ld-editorial-hero-art">
					<AppCrop view="agent" />
					<p className="ld-caption">Sleeve, a music app in progress.</p>
				</div>
			</section>
			<section className="ld-editorial-statement ld-contained">
				<h2 className="ld-h2">
					Design happens
					<br />
					between the takes.
				</h2>
				<div>
					<p className="ld-large-copy">
						A shelf of records.
						<br />A catalog to browse.
						<br />A room for listening.
					</p>
					<p className="ld-body">
						The same music app can take a few different forms. Seeing them together makes the differences easier to
						judge. Keep the useful parts, ask for another take, and keep working.
					</p>
				</div>
			</section>
			<section id="canvas" className="ld-editorial-spread">
				<div className="ld-contained">
					<AppSurface view="canvas" />
					<div className="ld-caption">
						<span>One canvas, a few possible directions.</span>
						<span>Live TSX frames, arranged in space.</span>
					</div>
				</div>
			</section>
			<section id="workflow" className="ld-editorial-work ld-contained">
				<div className="ld-editorial-work-heading">
					<h2 className="ld-h2">
						From the broad idea
						<br />
						to the little things.
					</h2>
					<p className="ld-body">
						A prototype becomes more useful when you can get specific. Move between the whole canvas and the screen
						you’re working on.
					</p>
				</div>
				<div className="ld-editorial-work-body">
					<AppCrop view="properties" />
					<div className="ld-editorial-notes">
						<article>
							<h3 className="ld-h3">Give the agent a direction.</h3>
							<p className="ld-body">
								Your agent writes the frame files and spool renders them. The conversation stays beside the work, so
								your next request has something concrete to refer to.
							</p>
						</article>
						<article>
							<h3 className="ld-h3">Arrange the screens.</h3>
							<p className="ld-body">
								Select a frame to see its position and dimensions. Resize it, move it alongside another take, and play
								it to try the controls.
							</p>
						</article>
						<article>
							<h3 className="ld-h3">Follow it through.</h3>
							<p className="ld-body">
								Link frames into a flow. Walk from one screen to the next and find the places that need another pass.
							</p>
						</article>
					</div>
				</div>
			</section>
			<section className="ld-editorial-files ld-contained">
				<SpoolMark className="ld-files-mark" />
				<div>
					<h2 className="ld-h2">
						It all lives
						<br />
						with your project.
					</h2>
					<p className="ld-body">
						The canvas reads your design/ folder. Every frame is TSX, shared components are code, and your history can
						live in Git. The files stay on your machine.
					</p>
					<a className="ld-text-link" href={`${REPO}#readme`}>
						Read the documentation <span aria-hidden="true">↗</span>
					</a>
				</div>
			</section>
			<End editorial />
		</>
	);
}

export function LandingDirection({ take }: { take: "proof" | "editorial" }) {
	const root = useRef<HTMLDivElement>(null);
	const jump = (id: string) => {
		const page = root.current;
		const section = page?.querySelector<HTMLElement>(`#${id}`);
		if (page && section)
			page.scrollTo({
				top: section.getBoundingClientRect().top - page.getBoundingClientRect().top + page.scrollTop - 24,
			});
	};
	return (
		<div ref={root} className={cn("ld-page", take === "proof" ? "ld-proof" : "ld-editorial")}>
			<header className="ld-nav ld-contained">
				<button type="button" aria-label="spool home" onClick={() => root.current?.scrollTo({ top: 0 })}>
					<Brand />
				</button>
				<nav aria-label="Main navigation">
					<button type="button" onClick={() => jump("canvas")}>
						The canvas
					</button>
					<button type="button" onClick={() => jump("workflow")}>
						How it works
					</button>
					<a href={REPO}>GitHub ↗</a>
				</nav>
				<a className="ld-nav-download" href={DOWNLOAD}>
					Get spool <span aria-hidden="true">↓</span>
				</a>
			</header>
			<main>{take === "proof" ? <Proof jump={jump} /> : <Editorial jump={jump} />}</main>
		</div>
	);
}
