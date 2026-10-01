import { type ReactNode, useEffect, useRef, useState } from "react";
import { AUTHOR, CopyCommand, DOWNLOAD, INSTALL, REPO } from "shared/ui/site/fresh/words/get-spool";
import { SpoolMark } from "shared/ui/spool/mark";
import "./essay.css";

/* The essay. spool explained the way a small printed book would: one measure,
 * a reading serif, the machine's words set in mono, notes in the margin, and red
 * kept for the rubric. Motion is kept to three places: the running head turns
 * with the section, a note lights with its mark, and the terminal at the end
 * types what you would type. */

function Section({ n, title, children }: { n: string; title: string; children: ReactNode }) {
	return (
		<section className="wes-section" data-title={title}>
			<h2 className="wes-h2">
				<span className="wes-n" aria-hidden="true">
					{n}
				</span>
				{title}
			</h2>
			{children}
		</section>
	);
}

/* A margin note: the mark in the line, the note beside it. On a phone the mark is a button that opens it in place. */
function Note({ n, children }: { n: string; children: ReactNode }) {
	const [open, setOpen] = useState(false);
	return (
		<span className="wes-pair" data-open={open}>
			<button
				type="button"
				className="wes-ref"
				aria-label={`Note ${n}`}
				aria-expanded={open}
				onClick={() => setOpen((o) => !o)}
			>
				{n}
			</button>
			<span className="wes-side" role="note">
				<span className="wes-side-n">{n}</span>
				{children}
			</span>
		</span>
	);
}

function C({ children }: { children: ReactNode }) {
	return <code className="wes-c">{children}</code>;
}

/* What the terminal says, set as text. The prompt names the directory. */
function Shell({ lines, typed = false }: { lines: { at: string; command: string }[]; typed?: boolean }) {
	const block = useRef<HTMLPreElement>(null);
	const [shown, setShown] = useState(typed ? 0 : Number.POSITIVE_INFINITY);
	useEffect(() => {
		if (!typed) return;
		const el = block.current;
		if (!el) return;
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
			setShown(Number.POSITIVE_INFINITY);
			return;
		}
		let timer = 0;
		const total = lines.reduce((sum, l) => sum + l.command.length, 0);
		const seen = new IntersectionObserver(
			([entry]) => {
				if (!entry?.isIntersecting) return;
				seen.disconnect();
				let count = 0;
				const tick = () => {
					count += 1;
					setShown(count);
					if (count < total) timer = window.setTimeout(tick, 38 + Math.round(Math.sin(count * 1.7) * 9));
				};
				timer = window.setTimeout(tick, 500);
			},
			{ threshold: 0.9 },
		);
		seen.observe(el);
		return () => {
			seen.disconnect();
			window.clearTimeout(timer);
		};
	}, [typed, lines]);
	let rest = shown;
	let caret = false;
	return (
		<pre ref={block} className="wes-shell" aria-label={lines.map((l) => `${l.at} ${l.command}`).join(", ")}>
			{lines.map((line, i) => {
				const reached = !typed || rest >= 0;
				const visible = line.command.slice(0, Math.max(0, rest));
				const here = typed && !caret && reached && (rest < line.command.length || i === lines.length - 1);
				if (here) caret = true;
				rest -= line.command.length;
				return (
					<span key={line.command} className="wes-shell-line" data-reached={reached}>
						<span className="wes-at">{line.at}</span>
						<span className="wes-cmd">{visible}</span>
						{here ? <span className="wes-caret" /> : null}
						{"\n"}
					</span>
				);
			})}
		</pre>
	);
}

const TREE = [
	{ depth: 0, name: "design/" },
	{ depth: 1, name: "frames/" },
	{ depth: 2, name: "checkout/" },
	{ depth: 3, name: "frame.tsx", file: true },
	{ depth: 3, name: "frame.json", file: true },
	{ depth: 2, name: "checkout--empty/" },
	{ depth: 3, name: "frame.tsx", file: true },
	{ depth: 3, name: "frame.json", file: true },
];

function Tree() {
	return (
		<pre className="wes-shell wes-tree" aria-label="A design folder holding two frames">
			{TREE.map((row, i) => (
				<span key={`${row.name}-${i}`} data-file={row.file === true}>
					{"  ".repeat(row.depth)}
					{row.name}
					{"\n"}
				</span>
			))}
		</pre>
	);
}

const START = [
	{ at: "~", command: "npm i -g spool.page" },
	{ at: "~/projects/shop", command: "spool init" },
];

export default function Frame() {
	const [section, setSection] = useState("");
	const [past, setPast] = useState(false);
	const page = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const root = page.current;
		if (!root) return;
		const sections = [...root.querySelectorAll<HTMLElement>(".wes-section")];
		const title = root.querySelector(".wes-title");
		const read = () => {
			const line = window.innerHeight * 0.3;
			let current = "";
			for (const s of sections) if (s.getBoundingClientRect().top < line) current = s.dataset.title ?? "";
			setSection(current);
			setPast(title ? title.getBoundingClientRect().bottom < 72 : false);
		};
		read();
		window.addEventListener("scroll", read, { passive: true });
		window.addEventListener("resize", read);
		return () => {
			window.removeEventListener("scroll", read);
			window.removeEventListener("resize", read);
		};
	}, []);

	return (
		<div ref={page} className="wes-page" lang="en">
			<header className="wes-head" data-past={past}>
				<a className="wes-name" href="#top">
					<SpoolMark className="wes-mark" />
					spool
				</a>
				<span className="wes-running" aria-hidden="true">
					<span key={section} className="wes-running-title">
						{section}
					</span>
				</span>
				<nav className="wes-nav">
					<a href={REPO}>GitHub</a>
					<a href="#get">Download</a>
				</nav>
			</header>

			<main className="wes-book" id="top">
				<div className="wes-opening">
					<h1 className="wes-title">A canvas for working things out.</h1>
					<p className="wes-stand">
						Design websites, apps and presentations with your agent. Try them live. Keep what works.
					</p>
				</div>

				<div className="wes-text">
					<p className="wes-first">
						<span className="wes-lead">Most design work with an agent</span> starts as a conversation and
						ends as a row of browser tabs. You describe the checkout, it writes one, and you go and look.
						Then you ask for the empty cart, and the declined card, and the screen after you pay, and each
						one lands somewhere else. The thread that ties them together stays in your head.
					</p>
					<p>
						spool gives those screens one place to sit, side by side, while you work out which of them is
						right.
					</p>

					<Section n="1" title="Every screen is a file">
						<p>
							Your agent writes each screen as a frame. A frame is a React component in a file called{" "}
							<C>frame.tsx</C>, inside its own folder under <C>design/</C> in your project.
							<Note n="1">
								Two dashes name a state. <C>checkout--empty</C> is the checkout with nothing in the bag,
								and spool keeps it right beside <C>checkout</C>.
							</Note>
						</p>
						<Tree />
						<p>
							Next to it, <C>frame.json</C> holds the frame’s size and where it sits on the canvas. The rest
							is the component, written in the same TSX as the app it may become. Save the file and the
							canvas shows the change.
						</p>
					</Section>

					<Section n="2" title="Laid out the way you think">
						<p>
							The canvas goes on as far as you need. Put the happy path in a row, the edge cases underneath,
							and last week’s attempt off to one side where you can still see it.
						</p>
						<p>A link between two frames is one attribute on the thing you press.</p>
						<pre className="wes-shell wes-source">
							<span>{"<button "}</span>
							<b>data-go</b>
							<span>{'="checkout--paid">Pay</button>'}</span>
						</pre>
						<p>
							spool draws each link as a line between the frames.
							<Note n="2">
								The links are read straight from the source, so the map of a flow is never out of date
								with the code that makes it.
							</Note>{" "}
							Press play and you walk the flow like the real thing, from the bag to the receipt. Pick a size
							on one screen and it is still picked on the next.
						</p>
					</Section>

					<Section n="3" title="Talking it through">
						<p>
							Point at a frame, or at one element inside it, and tell your agent what should change. It
							knows what you pointed at, and it edits the same file you could open in your editor.
						</p>
						<p>
							Use Claude Code, Codex, or whichever agent you already have open. It learns how spool works
							from one command.
							<Note n="3">
								<C>spool skill</C> prints the whole contract: how frames are named, how they link, and how to
								check one boots before saying it is done.
							</Note>
						</p>
						<Shell lines={[{ at: "~/projects/shop", command: "spool skill" }]} />
					</Section>

					<Section n="4" title="Kept with the code">
						<p>
							Everything spool makes is files in your repo, tracked by Git with the rest of your code.
							Branch it to try something. Revert it if the something was a mistake. When an idea works, the
							component your agent wrote is already sitting in the project, ready to be moved into the app.
							<SpoolMark className="wes-end" />
						</p>
					</Section>

					<section className="wes-section wes-get" id="get" data-title="Getting it">
						<h2 className="wes-h2">Getting it</h2>
						<p>
							spool is free and MIT licensed. It runs on Macs with Apple silicon and macOS 14 or later.
						</p>
						<div className="wes-actions">
							<a className="wes-download" href={DOWNLOAD}>
								Download for Mac
							</a>
							<CopyCommand className="wes-copy" command={INSTALL} />
						</div>
						<p>Or from a terminal, in the project you want to design in:</p>
						<Shell lines={START} typed />
						<p>
							<C>spool init</C> sets up <C>design/</C> and opens the project on the canvas.
						</p>
					</section>
				</div>
			</main>

			<footer className="wes-colophon">
				<p>
					Set in Newsreader and Fragment Mono. spool is made by <a href={AUTHOR}>Liam</a>, and the source is on{" "}
					<a href={REPO}>GitHub</a> under the MIT licence.
				</p>
			</footer>
		</div>
	);
}
