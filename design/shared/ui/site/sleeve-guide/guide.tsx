import { useEffect, useRef, useState } from "react";
import { SleeveProduct, SLEEVE_TAKES, SLEEVE_NAMES, type SleeveTake } from "shared/ui/demo/sleeve/variations";
import { AppSurface } from "shared/ui/site/sleeve-real/app";
import { SpoolMark } from "shared/ui/spool/mark";
import "./guide.css";

const REPO = "https://github.com/liamvinberg/spool";
const DOWNLOAD = `${REPO}/releases/latest/download/Spool.dmg`;
const CHAPTERS = [
	{ id: "try", name: "Try a screen" },
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
				Download for Mac <span>↓</span>
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
				<span>⧉</span>
			</button>
		</div>
	);
}

function Product({ take, live = false }: { take: SleeveTake; live?: boolean }) {
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
	const [take, setTake] = useState<SleeveTake>("shelf");
	return (
		<div className="sg-source">
			<div className="sg-source-files">
				<span>design/</span>
				<span>　frames/</span>
				<span>　　app/</span>
				{SLEEVE_TAKES.map((entry) => (
					<button type="button" key={entry} aria-pressed={take === entry} onClick={() => setTake(entry)}>
						　　　sleeve-{entry}/
					</button>
				))}
				<span>　shared/</span>
				<span>　　ui/</span>
			</div>
			<div className="sg-source-code">
				<p>sleeve-{take}/frame.tsx</p>
				<pre>
					<code>
						<span>import</span>
						{` { SleeveProduct }\n  from "shared/ui/demo/sleeve/variations";\n\n`}
						<span>export default function</span>
						{` Frame() {\n  return <SleeveProduct take="${take}" />;\n}`}
					</code>
				</pre>
				<small>A frame’s source. This file renders the screen above.</small>
			</div>
		</div>
	);
}

export function SleeveGuide() {
	const root = useRef<HTMLDivElement>(null);
	const dialog = useRef<HTMLDialogElement>(null);
	const [active, setActive] = useState("try");
	const [playing, setPlaying] = useState<SleeveTake>("shelf");
	const [session, setSession] = useState(0);
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
	const open = (take: SleeveTake) => {
		setPlaying(take);
		setSession((value) => value + 1);
		dialog.current?.showModal();
	};
	return (
		<div className="sg-page" ref={root}>
			<header className="sg-nav sg-width">
				<button type="button" aria-label="spool home" onClick={() => root.current?.scrollTo({ top: 0 })}>
					<Brand />
				</button>
				<nav aria-label="Website navigation">
					<a href={`${REPO}#readme`}>Docs ↗</a>
					<a href={REPO}>GitHub ↗</a>
					<button type="button" onClick={() => jump("start")}>
						Get spool <span>↓</span>
					</button>
				</nav>
			</header>
			<main>
				<section className="sg-hero sg-width">
					<h1>
						Feel the app
						<br />
						before you build it.
					</h1>
					<p>
						spool is a local canvas for designing with your agent. Make live screens, try a few directions, and work out
						how your app should feel.
					</p>
					<div className="sg-hero-actions">
						<Install />
						<button className="sg-text-button" type="button" onClick={() => jump("try")}>
							Let’s try it together <span>↓</span>
						</button>
					</div>
				</section>
				<section className="sg-hero-app sg-width" aria-label="Sleeve on the spool canvas">
					<AppSurface view="canvas" />
					<div className="sg-caption">
						<p>This is Sleeve, a music app we’re designing in spool. We’ll use it as we go.</p>
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
							First, try
							<br />
							the screen.
						</h2>
						<p>Open a record. Pick a track. Try the player.</p>
						<p>
							The screens in spool are live components, so you can use the controls and follow a flow while you’re still
							deciding how it should look.
						</p>
						<p>This one works right here. Start with “Find your next record” and see where it takes you.</p>
						<button className="sg-text-button" type="button" onClick={() => open("shelf")}>
							Open Sleeve larger <span>↗</span>
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
										<span className="sg-variant-open-hint">Open layout ↗</span>
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
						<p>Every screen you’ve just tried is a TSX file. Your agent edits it, and spool shows the result.</p>
						<p>
							The files live in a design/ folder beside your source. Share components between screens and use Git to
							keep track of changes.
						</p>
						<p>
							When the direction feels right, you have the prototype and its source to guide the work in your product.
						</p>
						<a className="sg-text-button" href={`${REPO}#readme`}>
							A little more about the files <span>↗</span>
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
								Start with a project you’re already working on. Give your agent one screen to explore and see what turns
								up.
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
								<h3>Ask for a first screen.</h3>
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
						<a href={`${REPO}#install`}>Installation details ↗</a>
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
						Explore the source <span>↗</span>
					</a>
				</section>
			</main>
			<footer className="sg-footer sg-width">
				<Brand />
				<span>A local canvas, still taking shape.</span>
				<a href={`${REPO}#readme`}>Docs ↗</a>
				<a href={REPO}>GitHub ↗</a>
				<a href={`${REPO}/blob/main/LICENSE.md`}>MIT licence</a>
			</footer>
			<dialog className="sg-player" ref={dialog} aria-label={`Sleeve: ${SLEEVE_NAMES[playing]}`}>
				<div className="sg-player-heading">
					<span>Sleeve / {SLEEVE_NAMES[playing]}</span>
					<button type="button" onClick={() => dialog.current?.close()} aria-label="Close Sleeve preview">
						Close <span>×</span>
					</button>
				</div>
				<Product key={session} take={playing} live />
			</dialog>
		</div>
	);
}
