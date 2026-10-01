import { useEffect, useRef } from "react";
import { CopyLine, DOWNLOAD, INSTALL, REPO } from "shared/ui/site/fresh/thread/copy-line";
import { SpoolMark } from "shared/ui/spool/mark";
import "shared/ui/site/fresh/thread/thread.css";
import "./pull.css";
import { createRope } from "./rope";

/** The full stop of a heading, punched through so the thread can pass. */
function Stop() {
	return (
		<span className="tp-stop">
			.<i data-pin aria-hidden="true" />
		</span>
	);
}

function Tag({ at, children, length = 26 }: { at: string; children: React.ReactNode; length?: number }) {
	return (
		<span className="tp-tag" data-charm={at} data-length={length} aria-hidden="true">
			{children}
		</span>
	);
}

export default function LandingThreadPull() {
	const page = useRef<HTMLDivElement>(null);
	const canvas = useRef<HTMLCanvasElement>(null);
	useEffect(() => {
		if (!page.current || !canvas.current) return;
		const rope = createRope({ page: page.current, canvas: canvas.current });
		return () => rope?.dispose();
	}, []);
	return (
		<div ref={page} className="th-page tp-page">
			<canvas ref={canvas} className="tp-canvas" aria-hidden="true" />

			<header className="tp-nav">
				<a className="tp-brand" href="#top">
					<span className="tp-mark">
						<SpoolMark />
					</span>
					spool
				</a>
				<nav aria-label="Main">
					<a href={`${REPO}#readme`}>Docs</a>
					<a href={REPO}>GitHub</a>
					<a href={DOWNLOAD}>Download</a>
				</nav>
			</header>

			<section className="tp-hero" id="top">
				<h1>
					Pull the
					<br />
					thread
					<Stop />
				</h1>
				<div className="tp-spool" data-spool aria-hidden="true" />
				<p className="tp-hint">Go on, pull it.</p>
				<div className="tp-hero-foot">
					<p>
						spool is a canvas where your agent designs websites, apps and presentations as live frames. Try
						them side by side, link them into flows, and keep what works.
					</p>
					<div className="tp-actions">
						<a className="tp-download" href={DOWNLOAD}>
							Download for Mac
						</a>
						<CopyLine command={INSTALL} />
					</div>
				</div>
			</section>

			<main>
				<section className="tp-section" data-side="right">
					<h2>
						Say what
						<br />
						you want
						<Stop />
					</h2>
					<p>
						Ask Claude Code, Codex or any agent you already use. It writes each screen as a TSX file in{" "}
						<code>design/frames</code>, and spool shows the frame the moment the file lands.
					</p>
				</section>

				<section className="tp-section" data-side="left">
					<h2>
						Press
						<br />
						everything
						<Stop />
					</h2>
					<p>
						A frame is running code, so the button works and the form takes typing. Put a few versions side by
						side and keep the one that feels right.
					</p>
				</section>

				<section className="tp-section" data-side="right">
					<h2>
						Walk
						<br />
						the flow
						<Stop />
					</h2>
					<p>
						Link frames together and play them like the finished thing. A choice made on the first screen is
						still there on the third.
					</p>
				</section>

				<section className="tp-section" data-side="left">
					<h2>
						Keep it
						<br />
						in your repo
						<Stop />
					</h2>
					<p>
						Frames are files in your repo, and <code>frame.json</code> says where each one sits on the canvas.
						Commit them, branch them and review them like the rest of your code.
					</p>
				</section>

				<section className="tp-section tp-close" data-side="right" id="start">
					<h2>
						Get spool
						<br />
						for Mac
						<Stop />
					</h2>
					<div className="tp-close-copy">
						<p>Free and MIT licensed. Apple silicon, macOS 14 or later.</p>
						<div className="tp-terminal">
							<CopyLine command={INSTALL} prompt="~/kaffe" />
							<CopyLine command="spool init" prompt="~/kaffe" />
						</div>
					</div>
				</section>
			</main>

			<footer className="tp-footer">
				<span className="tp-brand">
					<span className="tp-mark">
						<SpoolMark />
					</span>
					spool
				</span>
				<p>
					Made by Liam. Follow along at{" "}
					<a href="https://x.com/liamvinberg" target="_blank" rel="noreferrer">
						@liamvinberg
					</a>
					.
				</p>
				<nav aria-label="Footer">
					<a href={`${REPO}#readme`}>Docs</a>
					<a href={REPO}>GitHub</a>
					<a href={`${REPO}/blob/main/LICENSE.md`}>MIT licence</a>
				</nav>
			</footer>

			{/* What hangs on the thread, placed by the rope each frame. */}
			<div className="tp-charms">
				<Tag at="2:0.5">design/frames/checkout/frame.tsx</Tag>
				<Tag at="3:0.2">checkout</Tag>
				<Tag at="3:0.36" length={34}>
					checkout--warm
				</Tag>
				<Tag at="3:0.52">checkout--short</Tag>
				<Tag at="4:0.3">cart</Tag>
				<Tag at="4:0.5" length={34}>
					checkout
				</Tag>
				<Tag at="4:0.7">sent</Tag>
				<Tag at="5:0.3">frame.json</Tag>
				<a className="tp-tag tp-tag-download" data-charm="6:1" data-length="10" href={DOWNLOAD}>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
						<path d="M12 4v12m-5-5 5 5 5-5M5 20h14" strokeLinecap="round" strokeLinejoin="round" />
					</svg>
					Download for Mac
				</a>
			</div>
		</div>
	);
}
