import "shared/ui/site/fresh/toy/toy.css";
import "./reel.css";
import { SpoolMark } from "shared/ui/site/current/ui/spool/mark";
import { AUTHOR, CopyCommand, DOWNLOAD, INSTALL, REPO } from "shared/ui/site/fresh/toy/copy-command";
import { Reel } from "./reel";

const sections = [
	{
		title: "Your agent draws the first frame.",
		body: "Ask Claude Code, Codex or whichever agent you already use for a screen. It writes a TSX file into your project, and spool shows it the moment the file lands.",
		detail: "design/frames/checkout/frame.tsx",
	},
	{
		title: "Lay it all out.",
		body: "Every frame runs live on one infinite canvas. Put the checkout beside the cart and the empty state under both, then move them as the idea moves.",
		detail: 'frame.json   { "x": 1520, "y": 0, "w": 390, "h": 844 }',
	},
	{
		title: "Then walk through it.",
		body: "Link frames into a flow and click from one to the next. Buttons press and fields take typing, so you find where it sticks before anything ships.",
		detail: "cart → checkout → paid",
	},
	{
		title: "It lives in your repo.",
		body: "Frames are plain files. Git tracks them with the rest of your code, and they get reviewed in the same pull request.",
		detail: "git log --oneline -- design/",
	},
];

export default function Frame() {
	return (
		<main className="toy reel">
			<Reel>
				<span className="reel-gutter" data-gutter aria-hidden="true" />
				<header className="reel-nav">
					<a href="https://spool.page/" className="reel-brand" aria-label="spool home">
						<SpoolMark className="reel-mark" />
						<span>spool</span>
					</a>
					<nav aria-label="Website">
						<a href={`${REPO}#readme`}>Docs</a>
						<a href={REPO}>GitHub</a>
					</nav>
				</header>

				<section className="reel-hero" data-sew>
					<h1>
						<span data-stitch="10">
							A canvas
							<br />
							for <em>working</em>
							<br />
							things out.
						</span>
					</h1>
					<p className="reel-lede">Design websites, apps, and presentations with your agent. Try them live. Keep what works.</p>
					<div className="reel-get">
						<a className="reel-download" href={DOWNLOAD}>
							Download for Mac
						</a>
						<CopyCommand command={INSTALL} />
					</div>
					<p className="reel-hint" aria-hidden="true">
						drag the spool
					</p>
				</section>

				{sections.map((section) => (
					<section key={section.title} className="reel-section" data-sew>
						<h2>
							<span data-stitch="8">{section.title}</span>
						</h2>
						<p>{section.body}</p>
						<code>{section.detail}</code>
					</section>
				))}

				<section className="reel-section reel-start" data-sew>
					<h2>
						<span data-stitch="8">Start with one frame.</span>
					</h2>
					<p>spool is free and MIT licensed. It runs on Apple silicon with macOS 14 or later.</p>
					<div className="reel-terminal" aria-label="Or install from a terminal">
						<p>
							<span>~/shop %</span> <CopyCommand command={INSTALL} />
						</p>
						<p>
							<span>~/shop %</span> <CopyCommand command="spool init" />
						</p>
					</div>
					<a className="reel-download reel-download--large" href={DOWNLOAD} data-loop>
						Download for Mac
					</a>
				</section>

				<footer className="reel-footer">
					<a href="https://spool.page/" className="reel-brand" aria-label="spool home">
						<SpoolMark className="reel-mark" />
						<span>spool</span>
					</a>
					<nav aria-label="Elsewhere">
						<a href={REPO}>GitHub</a>
						<a href={`${REPO}/blob/main/LICENSE`}>MIT licence</a>
						<a href={AUTHOR}>Made by Liam</a>
					</nav>
				</footer>
			</Reel>
		</main>
	);
}
