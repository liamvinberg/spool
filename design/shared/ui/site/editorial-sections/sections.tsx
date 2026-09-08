import { LandingEnding, type EndingTake } from "shared/ui/site/editorial-endings/ending";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { OffprintSurface } from "shared/ui/site/current/ui/site/demo-apps/landing-canvas";
import {
	DemoProduct,
	type DemoTake,
	DEMO_NAMES,
	DEMO_TAKES,
} from "shared/ui/site/current/ui/site/demo-apps/landing-product";
import { CopyCommand, DOWNLOAD, INSTALL_COMMAND } from "shared/ui/site/current/install";
import { SpoolMark } from "shared/ui/site/current/ui/spool/mark";
import { createBloomRenderer } from "shared/ui/site/current/ui/site/bloom/renderer";
import { EditorialOpening } from "shared/ui/site/editorial-details/opening";
import "shared/ui/site/current/ui/site/bloom/page.css";
import "shared/ui/site/current/landing.css";
import "shared/ui/site/current/ui/site/sleeve-guide/guide.css";
import "shared/ui/site/current/ui/site/sleeve-guide/modern.css";
import "shared/ui/site/current/ui/site/demo-apps/landing.css";
import "shared/ui/site/editorial/editorial.css";
import "shared/ui/site/editorial-details/details.css";
import "./sections.css";

export type SectionName = "try" | "flow" | "agent" | "files" | "start" | "footer";
export type SectionTake = "spread" | "stage" | "paper";
const REPO = "https://github.com/liamvinberg/spool";
function Product({ take = "workshops" }: { take?: DemoTake }) {
	return (
		<div className="sg-product sc-mobile-product">
			<div className="sg-product-inner">
				<DemoProduct take={take} />
			</div>
		</div>
	);
}
function Heading({ title, children }: { title: ReactNode; children: ReactNode }) {
	return (
		<div className="es-heading">
			<h2>{title}</h2>
			<div>{children}</div>
		</div>
	);
}
function Source({ tree = false }: { tree?: boolean }) {
	return (
		<div className="es-code">
			{tree && (
				<div className="es-tree">
					<span>design/</span>
					<span> frames/</span>
					<span> app/</span>
					<strong> offprint-workshops/</strong>
					<span> frame.tsx</span>
					<span> frame.json</span>
					<span> shared/</span>
				</div>
			)}
			<div>
				<p>offprint-workshops/frame.tsx</p>
				<pre>
					<code>
						<span>export default function</span>
						{' Frame() {\n  return (\n    <DemoProduct\n      take="workshops"\n    />\n  );\n}'}
					</code>
				</pre>
				<small>The component in your project.</small>
			</div>
		</div>
	);
}
function Acquire({ tray = false }: { tray?: boolean }) {
	return (
		<div className="es-acquire" data-tray={tray}>
			<a href={DOWNLOAD}>
				{tray && (
					<svg
						width="20"
						height="20"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.5"
						aria-hidden="true"
					>
						<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />
					</svg>
				)}
				Download for Mac
			</a>
			<CopyCommand command={INSTALL_COMMAND} placement="section" />
			<span>Free · Apple silicon · macOS 14+</span>
		</div>
	);
}

export function SectionPart({ section, take }: { section: SectionName; take: SectionTake }) {
	return (
		<section
			id={section === "flow" ? "compare" : section}
			className="es-section sg-width"
			data-section={section}
			data-layout={take}
		>
			{section === "try" && (
				<>
					<Heading
						title={
							take === "stage" ? (
								"Go on. Press something."
							) : (
								<>
									Go on.
									<br />
									Press something.
								</>
							)
						}
					>
						<p>Find a workshop. Bring a friend. Get your ticket.</p>
						<p>This is a live prototype. Try “Find your seat” and follow it through.</p>
					</Heading>
					<div className="es-visual">
						<Product />
						<p className="es-caption">Offprint, a workshop app made in spool. No booking is made.</p>
					</div>
				</>
			)}
			{section === "flow" && (
				<>
					<Heading
						title={
							<>
								See how it
								<br />
								comes together.
							</>
						}
					>
						<p>
							{take === "stage" ? (
								<>
									Lay out a short flow.{" "}
									<span className="es-desktop-copy">Double-click a frame to enter it.</span>
									<span className="es-touch-copy">Open the demo to try it.</span>
								</>
							) : (
								"Three screens, laid out together. Try each one."
							)}
						</p>
						<p>
							{take === "stage"
								? "Your choices carry through to the next screen."
								: "Follow a workshop from the first look to the final ticket."}
						</p>
					</Heading>
					{take === "stage" ? (
						<div className="es-visual">
							<OffprintSurface view="canvas" />
							<p className="es-caption">
								<span className="es-desktop-copy">
									Double-click to enter. Follow the flow. Esc leaves the frame.
								</span>
								<span className="es-touch-copy">
									Open the demo. Follow the flow. Close the preview to return.
								</span>
							</p>
						</div>
					) : (
						<div className="es-flow">
							{DEMO_TAKES.map((item, i) => (
								<figure key={item}>
									<Product take={item} />
									<figcaption>
										<h3>{DEMO_NAMES[item]}</h3>
										<p>
											{
												[
													"Find something worth a Saturday.",
													"Pick a time. Bring someone along.",
													"See your choices become a plan.",
												][i]
											}
										</p>
									</figcaption>
								</figure>
							))}
						</div>
					)}
				</>
			)}
			{section === "agent" && (
				<>
					<Heading
						title={
							<>
								A little more this.
								<br />A little less that.
							</>
						}
					>
						<p>Select a frame and tell your agent what to change.</p>
						<p>The selection gives it context. The canvas shows you what changed.</p>
					</Heading>
					<div className="es-visual">
						<OffprintSurface view="agent" />
						<p className="es-caption">
							Select another frame to change the context. This conversation is an example.
						</p>
					</div>
				</>
			)}
			{section === "files" && (
				<>
					<Heading
						title={
							<>
								It’s all in
								<br />
								your project.
							</>
						}
					>
						<p>Each frame is a TSX file. Your agent edits it, and spool shows the result.</p>
						<p>Share components between frames. Keep track of changes with Git.</p>
						<a href={`${REPO}#readme`}>How the files work</a>
					</Heading>
					<div className="es-source">
						<Source tree={take === "paper"} />
						<div className="es-source-result">
							<OffprintSurface view="canvas" />
							<p className="es-caption">The frames on your canvas.</p>
						</div>
						<p className="es-source-foot">Edit the file. See the result.</p>
					</div>
				</>
			)}
			{section === "start" && (
				<>
					<Heading title={<>Your turn.</>}>
						<p>That idea you keep coming back to?</p>
						<p>Try it in spool.</p>
					</Heading>
					<Acquire tray={take === "paper"} />
					<details className="es-terminal">
						<summary>More of a terminal person?</summary>
						<p>Install spool, then run it in your project folder.</p>
						<CopyCommand command={INSTALL_COMMAND} placement="details" />
						<CopyCommand command="spool init" placement="details" />
					</details>
				</>
			)}
			{section === "footer" && (
				<>
					<div className="es-follow">
						<Heading title={take === "stage" ? "Made by a person." : "See what I’m working on."}>
							<p>
								I’m Liam, the person building spool. I share new features, design experiments, and things I’m
								figuring out as I go.
							</p>
						</Heading>
						<a href="https://x.com/liamv1nberg" target="_blank" rel="noreferrer">
							Follow @liamv1nberg
						</a>
					</div>
					<footer className="es-footer">
						<span className="sg-brand">
							<SpoolMark />
							<span>spool</span>
						</span>
						<p>Made in spool. Of course.</p>
						<nav aria-label="Footer">
							<a href={`${REPO}#readme`}>Docs</a>
							<a href={REPO}>GitHub</a>
							<a href={`${REPO}/blob/main/LICENSE.md`}>MIT licence</a>
							<a href="https://spool.page/privacy#settings">Privacy &amp; cookies</a>
						</nav>
					</footer>
				</>
			)}
		</section>
	);
}
function Bloom({ children, hero }: { children: ReactNode; hero?: "inline" | "tray" }) {
	const canvas = useRef<HTMLCanvasElement>(null),
		renderer = useRef<ReturnType<typeof createBloomRenderer>>(null);
	const [paused, setPaused] = useState(false);
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
	return (
		<div className="bl-page es-page" data-bloom="returns-end">
			<div className="bl-field" aria-hidden="true" data-backend="fallback">
				<canvas ref={canvas} className="bl-canvas" />
			</div>
			<div
				className="sg-page sm-page dl-page"
				data-take="play"
				data-editorial="folio"
				data-refinement={hero}
				data-study={!hero}
			>
				{children}
				<button
					type="button"
					className="bl-motion"
					aria-label={paused ? "Play background motion" : "Pause background motion"}
					aria-pressed={paused}
					onClick={() => setPaused(!paused)}
				>
					{paused ? "motion off" : "motion on"}
				</button>
			</div>
		</div>
	);
}
export function SectionStudy({ section, take }: { section: SectionName; take: SectionTake }) {
	return (
		<Bloom>
			<SectionPart section={section} take={take} />
		</Bloom>
	);
}
export function EndingStudy({ take }: { take: EndingTake }) {
	return (
		<Bloom hero="inline">
			<LandingEnding take={take} />
		</Bloom>
	);
}
export function AssembledLanding({ hero, ending }: { hero: "inline" | "tray"; ending?: EndingTake }) {
	return (
		<Bloom hero={hero}>
			<EditorialOpening take={hero} />
			<main>
				<SectionPart section="try" take="spread" />
				<SectionPart section="flow" take="stage" />
				<SectionPart section="agent" take="stage" />
				<SectionPart section="files" take="stage" />
				{ending ? (
					<LandingEnding take={ending} />
				) : (
					<>
						<SectionPart section="start" take={hero === "tray" ? "paper" : "stage"} />
						<SectionPart section="footer" take="spread" />
					</>
				)}
			</main>
		</Bloom>
	);
}
