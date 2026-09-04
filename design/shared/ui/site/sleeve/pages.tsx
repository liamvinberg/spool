import { useEffect, useRef, useState, type ReactNode } from "react";
import { SleeveProduct, SLEEVE_TAKES, SLEEVE_NAMES, type SleeveTake } from "shared/ui/demo/sleeve/variations";
import { DesktopProduct, type DesktopScreen } from "shared/ui/demo/desktop/products";
import { ProductCanvas } from "shared/ui/site/desktop/landing";
import { SpoolMark } from "shared/ui/spool/mark";
import { PlayIcon, FrameIcon, FolderIcon } from "shared/ui/spool/icons";
import "./pages.css";

export type SleeveSiteTake = "studio" | "folio" | "workbench";
type Open = (take: SleeveTake, screen?: DesktopScreen, headline?: string) => void;
const REPO = "https://github.com/liamvinberg/spool";
const DOWNLOAD = `${REPO}/releases/latest/download/Spool.dmg`;

function useWidth(initial: number) {
	const ref = useRef<HTMLDivElement>(null);
	const [width, setWidth] = useState(initial);
	useEffect(() => {
		const node = ref.current;
		if (!node) return;
		const observer = new ResizeObserver(([entry]) => {
			if (entry) setWidth(entry.contentRect.width);
		});
		observer.observe(node);
		return () => observer.disconnect();
	}, []);
	return { ref, width };
}
function Brand() {
	return (
		<span className="ss-brand">
			<SpoolMark />
			<span>spool</span>
		</span>
	);
}
function Install({ short = false }: { short?: boolean }) {
	const [copied, setCopied] = useState(false);
	return (
		<div className="ss-install">
			<a href={DOWNLOAD}>
				Get spool for Mac <span>↓</span>
			</a>
			{!short && (
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
			)}
		</div>
	);
}
function Preview({
	take,
	live = false,
	width: fixed,
	headline,
}: {
	take: SleeveTake;
	live?: boolean;
	width?: number;
	headline?: string;
}) {
	const { ref, width } = useWidth(fixed ?? 400);
	const w = fixed ?? width;
	return (
		<div
			ref={ref}
			className="ss-preview"
			style={{ height: (w * 2) / 3, ...(fixed === undefined ? {} : { width: fixed }) }}
		>
			<div inert={!live} className="ss-preview-inner" style={{ transform: `scale(${w / 1200})` }}>
				<SleeveProduct take={take} {...(headline === undefined ? {} : { headline })} />
			</div>
		</div>
	);
}
function FullCanvas({ open }: { open: Open }) {
	const { ref, width } = useWidth(1280);
	return (
		<div className="ss-canvas" ref={ref} style={{ height: (width * 850) / 1600 }}>
			<div style={{ width: 1600, height: 850, transform: `scale(${width / 1600})`, transformOrigin: "top left" }}>
				<ProductCanvas take="records" onPlay={(screen, headline) => open("shelf", screen, headline)} />
			</div>
		</div>
	);
}

function VariationBoard({ open, collage = false }: { open: Open; collage?: boolean }) {
	const [kept, setKept] = useState<SleeveTake | null>(null);
	return (
		<div className={`ss-variations ${collage ? "ss-collage" : ""}`}>
			<div className="ss-variation-bar">
				<span>
					<FolderIcon /> sleeve / directions
				</span>
				<span>3 frames</span>
			</div>
			<div className="ss-variation-grid">
				{SLEEVE_TAKES.map((take) => (
					<article key={take} className={`ss-variation ss-variation-${take}`} data-kept={kept === take}>
						<header>
							<FrameIcon />
							<span>home-{take}</span>
							<span>1200 × 800</span>
						</header>
						<div className="ss-variation-art">
							<Preview take={take} />
							<button
								type="button"
								aria-label={`Play ${SLEEVE_NAMES[take]}`}
								className="ss-preview-hit"
								onClick={() => open(take)}
							>
								<span>
									<PlayIcon /> Play
								</span>
							</button>
						</div>
						<footer>
							<span>{SLEEVE_NAMES[take]}</span>
							<button type="button" aria-pressed={kept === take} onClick={() => setKept(kept === take ? null : take)}>
								{kept === take ? "✓ Kept" : "Keep this one"}
							</button>
						</footer>
					</article>
				))}
			</div>
			<div className="ss-variation-status" role="status">
				{kept
					? `${SLEEVE_NAMES[kept]} is kept in this preview. You can still play all three.`
					: "Same brief, different directions. Open any frame to try it."}
			</div>
		</div>
	);
}

function Prompt({ compact = false }: { compact?: boolean }) {
	const [choice, setChoice] = useState(0);
	const requests = [
		"Explore three directions for Sleeve, a desktop music app.",
		"Keep the record-store feeling. Try a layout that starts with the music.",
		"Make the album open, and let me try the player.",
	];
	const responses = [
		"Three live frames: a record shelf, a split catalog, and a listening room.",
		"The listening room puts the artwork and tracks together. The other directions stay on the canvas.",
		"The album, player controls, and track selection are ready to try.",
	];
	return (
		<div className={`ss-prompt ${compact ? "ss-prompt-compact" : ""}`}>
			<header>
				<SpoolMark />
				<span>sleeve / agent</span>
				<span>example conversation</span>
			</header>
			<div className="ss-prompt-body">
				<div>
					<span>you</span>
					<p>{requests[choice]}</p>
				</div>
				<div>
					<SpoolMark />
					<p>{responses[choice]}</p>
					<div className="ss-file-chips">
						<span>
							<FrameIcon /> home-shelf
						</span>
						<span>
							<FrameIcon /> home-catalog
						</span>
						<span>
							<FrameIcon /> home-listening
						</span>
					</div>
				</div>
			</div>
			<footer>
				{["Explore", "Refine", "Make it work"].map((label, i) => (
					<button type="button" aria-pressed={choice === i} key={label} onClick={() => setChoice(i)}>
						{label}
						<span>↗</span>
					</button>
				))}
			</footer>
		</div>
	);
}

function Repo() {
	const [file, setFile] = useState("home-shelf");
	return (
		<div className="ss-repo-demo">
			<header>
				<span>
					<FolderIcon /> sleeve
				</span>
				<span>your project</span>
			</header>
			<div>
				<nav aria-label="Example project files">
					<span>design/</span>
					<span>　frames/</span>
					{["home-shelf", "home-catalog", "home-listening"].map((name) => (
						<button key={name} type="button" aria-pressed={file === name} onClick={() => setFile(name)}>
							<FrameIcon />
							{name}/
						</button>
					))}
					<span>　shared/</span>
					<span>src/</span>
					<span>package.json</span>
				</nav>
				<section>
					<header>{file}/frame.tsx</header>
					<pre>
						<code>
							<span>import</span>
							{` { SleeveProduct }\n  from "shared/ui/sleeve";\n\n`}
							<span>export default function</span>
							{` Frame() {\n  return (\n    <SleeveProduct\n      take="${file.replace("home-", "")}"\n    />\n  );\n}`}
						</code>
					</pre>
					<small>Each frame is a React component.</small>
				</section>
			</div>
		</div>
	);
}

const QUESTIONS = [
	[
		"What is spool?",
		"A local prototyping canvas. Your agent writes live TSX screens, and spool puts them on a canvas where you can arrange them and try their interactions.",
	],
	[
		"How does my agent use it?",
		"spool init creates the design folder and gives your agent the signposts. Your agent reads spool skill, authors the frames, and checks them with the CLI.",
	],
	[
		"Where does the work live?",
		"In a design/ folder inside your project. The files stay on your machine and can be tracked in Git alongside the rest of your code.",
	],
	[
		"Is this the final app code?",
		"The frames are real React components written for prototyping. Use them to settle the design, then implement that direction in your product.",
	],
	[
		"What do I need?",
		"The Mac app runs on Apple silicon with macOS 14 or later. The CLI needs Node 22+ and Chrome, on macOS or Linux. On Windows, use WSL.",
	],
] as const;
function Questions() {
	return (
		<div className="ss-questions">
			{QUESTIONS.map(([question, answer]) => (
				<details key={question}>
					<summary>
						{question}
						<span>+</span>
					</summary>
					<p>{answer}</p>
				</details>
			))}
		</div>
	);
}
function SectionHeading({ children, body }: { children: ReactNode; body: string }) {
	return (
		<div className="ss-section-heading">
			<h2>{children}</h2>
			<p>{body}</p>
		</div>
	);
}
function Footer() {
	return (
		<footer className="ss-footer">
			<Brand />
			<span>Made with spool. Still being made.</span>
			<a href={REPO}>GitHub ↗</a>
			<a href={`${REPO}/blob/main/LICENSE.md`}>MIT licence</a>
		</footer>
	);
}
function Start({ folio = false }: { folio?: boolean }) {
	return (
		<section className={`ss-start ${folio ? "ss-start-folio" : ""}`} id="start">
			<div>
				<h2>
					Start with your
					<br />
					next idea.
				</h2>
				<p>
					Open a project. Ask your agent for a first direction. <br />
					See what happens on the canvas.
				</p>
				<Install />
				<small>Open source. Local-first. Free to use.</small>
			</div>
			<SpoolMark />
		</section>
	);
}

function Studio({ open, jump }: { open: Open; jump: (id: string) => void }) {
	return (
		<>
			<section className="ss-studio-hero">
				<h1>
					Give your ideas
					<br />
					<span>somewhere to go.</span>
				</h1>
				<p>
					spool is a local canvas for designing with your agent. <br />
					Make live screens, compare a few directions, and try the flow before you build it.
				</p>
				<Install />
				<div className="ss-hero-foot">
					<span>For the part before you know exactly what to build.</span>
					<button type="button" onClick={() => jump("canvas")}>
						Try the canvas ↓
					</button>
				</div>
			</section>
			<section id="canvas" className="ss-wide">
				<FullCanvas open={open} />
				<div className="ss-demo-note">
					<span>Move a frame. Open the record. Try the player.</span>
					<span>Live example, made in spool.</span>
				</div>
			</section>
			<section className="ss-intro">
				<h2>
					A conversation is a good start.
					<br />
					<span>A screen gives you something to work with.</span>
				</h2>
				<p>
					Ask for an idea and your agent puts it on the canvas. You can see the spacing, try the controls, and find the
					parts that need another pass. Each change gives you something concrete to respond to.
				</p>
			</section>
			<section id="directions" className="ss-section">
				<SectionHeading body="A single brief can go a few ways. Keep the screens next to each other, try each one, and decide what to carry forward.">
					One brief.
					<br />
					Three directions.
				</SectionHeading>
				<VariationBoard open={open} />
			</section>
			<section id="workflow" className="ss-pair ss-section">
				<div>
					<h2>
						Keep the conversation
						<br />
						close to the work.
					</h2>
					<p>
						Ask for a wider layout, a different hierarchy, or another take altogether. The next frame appears alongside
						the ones you already have.
					</p>
					<p>
						Then get specific. Change the headline, open the record, and check whether the idea works when you use it.
					</p>
				</div>
				<Prompt />
			</section>
			<section className="ss-pair ss-section ss-repo-section">
				<div>
					<h2>
						The document
						<br />
						is your code.
					</h2>
					<p>
						Every frame is a TSX file in your project. Shared components stay shared, and the history can live in Git.
					</p>
					<p>When a direction is settled, the source is there to help you build it into your app.</p>
					<a href={`${REPO}#readme`}>Read how it works ↗</a>
				</div>
				<Repo />
			</section>
			<section className="ss-pair ss-section">
				<h2>A few practical things.</h2>
				<Questions />
			</section>
			<Start />
			<Footer />
		</>
	);
}

function Folio({ open, jump }: { open: Open; jump: (id: string) => void }) {
	return (
		<>
			<section className="ss-folio-hero">
				<h1>
					There’s more than
					<br />
					one way to build it.
				</h1>
				<div>
					<p>
						Make room for a few directions. spool lets you design with your agent on a canvas of live screens, right
						inside your project.
					</p>
					<Install />
				</div>
			</section>
			<section id="directions" className="ss-wide">
				<VariationBoard open={open} collage />
			</section>
			<section className="ss-folio-intro ss-section">
				<span>spool gives the work a place.</span>
				<p>
					A chat can describe a layout. A canvas lets you see the alternatives together. Open a screen, use the
					controls, and come back with a clearer idea of what you want.
				</p>
				<button type="button" onClick={() => jump("canvas")}>
					Take a look inside ↓
				</button>
			</section>
			<section id="workflow" className="ss-folio-workflow ss-section">
				<div>
					<h2>
						Ask. Compare.
						<br />
						Keep going.
					</h2>
					<p>
						Start with a plain-language brief. Your agent authors the frames; you arrange them, play them, and decide
						what needs another pass.
					</p>
				</div>
				<Prompt compact />
			</section>
			<section id="canvas" className="ss-folio-canvas">
				<SectionHeading body="The page tree, the frames, and the room between them. Select one, move it around, or open it to try the interaction.">
					A canvas that
					<br />
					you can use.
				</SectionHeading>
				<FullCanvas open={open} />
				<div className="ss-demo-note">
					<span>Sleeve, a working example.</span>
					<span>Double-click a frame to play.</span>
				</div>
			</section>
			<section className="ss-folio-repo ss-section">
				<Repo />
				<div>
					<h2>
						Yours, all the way
						<br />
						down to the files.
					</h2>
					<p>
						The canvas reads the design/ folder in your repo. Your agent works on those files, and spool renders what’s
						there.
					</p>
					<p>Use Git to keep the history. Bring the chosen design into your product when you’re ready.</p>
					<a href={`${REPO}#readme`}>Read the docs ↗</a>
				</div>
			</section>
			<section className="ss-pair ss-section">
				<h2>Before you start.</h2>
				<Questions />
			</section>
			<Start folio />
			<Footer />
		</>
	);
}

function Workbench({ open, jump }: { open: Open; jump: (id: string) => void }) {
	return (
		<>
			<section className="ss-workbench-hero">
				<div>
					<h1>
						A place to work
						<br />
						the idea out.
					</h1>
					<p>
						Design with your agent. Compare live screens. <br />
						Get a feel for the flow before you build it.
					</p>
					<Install />
				</div>
				<div className="ss-brief">
					<span>sleeve / brief</span>
					<p>“A desktop music app that feels like a good record shop. Try a few directions.”</p>
					<button type="button" onClick={() => jump("directions")}>
						See the three takes ↓
					</button>
				</div>
			</section>
			<section id="canvas" className="ss-workbench-canvas">
				<FullCanvas open={open} />
				<div className="ss-demo-note">
					<span>This canvas is yours to try.</span>
					<span>Drag · select · play</span>
				</div>
			</section>
			<section id="directions" className="ss-section">
				<div className="ss-workbench-heading">
					<span>01</span>
					<h2>
						Explore before
						<br />
						you settle.
					</h2>
					<p>
						Give the same idea a few different forms. Here, Sleeve becomes a record shelf, a split catalog, and a
						listening room. All three are live.
					</p>
				</div>
				<VariationBoard open={open} />
			</section>
			<section id="workflow" className="ss-section">
				<div className="ss-workbench-heading">
					<span>02</span>
					<h2>
						Use it.
						<br />
						Then change it.
					</h2>
					<p>
						Open the record, pick a track, or try another layout. Specific feedback is easier once there’s something to
						use.
					</p>
				</div>
				<div className="ss-workbench-play">
					<div>
						<Preview take="listening" />
						<button
							type="button"
							aria-label="Play the listening room"
							className="ss-preview-hit"
							onClick={() => open("listening")}
						>
							<span>
								<PlayIcon /> Try the player
							</span>
						</button>
					</div>
					<Prompt compact />
				</div>
			</section>
			<section className="ss-section">
				<div className="ss-workbench-heading">
					<span>03</span>
					<h2>
						Keep the source
						<br />
						close by.
					</h2>
					<p>
						Live TSX frames sit in your project’s design folder. The agent edits the files; spool shows the result. Your
						code and your prototypes share a repo.
					</p>
				</div>
				<Repo />
			</section>
			<section className="ss-section ss-pair">
				<h2>Useful to know.</h2>
				<Questions />
			</section>
			<Start />
			<Footer />
		</>
	);
}

export function SleeveLanding({ take }: { take: SleeveSiteTake }) {
	const root = useRef<HTMLDivElement>(null);
	const dialog = useRef<HTMLDialogElement>(null);
	const { ref: playerRef, width: playerWidth } = useWidth(1200);
	const [playing, setPlaying] = useState<SleeveTake>("shelf");
	const [screen, setScreen] = useState<DesktopScreen>("home");
	const [headline, setHeadline] = useState("Good things,\non repeat.");
	const [session, setSession] = useState(0);
	const jump = (id: string) => {
		const node = root.current?.querySelector<HTMLElement>(`#${id}`);
		if (root.current && node)
			root.current.scrollTo({
				top: node.getBoundingClientRect().top - root.current.getBoundingClientRect().top + root.current.scrollTop - 25,
			});
	};
	const open: Open = (variant, view = "home", title = "Good things,\non repeat.") => {
		setPlaying(variant);
		setScreen(view);
		setHeadline(title);
		setSession((value) => value + 1);
		dialog.current?.showModal();
	};
	return (
		<div ref={root} className={`ss-page ss-${take}`}>
			<div className="ss-layout">
				<header className="ss-nav">
					<button type="button" aria-label="spool home" onClick={() => root.current?.scrollTo({ top: 0 })}>
						<Brand />
					</button>
					<nav aria-label="Main">
						<button type="button" onClick={() => jump("directions")}>
							Explore
						</button>
						<button type="button" onClick={() => jump("workflow")}>
							How it works
						</button>
						<a href={REPO}>GitHub ↗</a>
					</nav>
					<a className="ss-nav-get" href={DOWNLOAD}>
						Get spool <span>↓</span>
					</a>
					{take === "workbench" && (
						<div className="ss-nav-foot">
							<span>
								Local-first.
								<br />
								Open source.
							</span>
							<SpoolMark />
						</div>
					)}
				</header>
				<main>
					{take === "studio" ? (
						<Studio open={open} jump={jump} />
					) : take === "folio" ? (
						<Folio open={open} jump={jump} />
					) : (
						<Workbench open={open} jump={jump} />
					)}
				</main>
			</div>
			<dialog
				ref={dialog}
				className="ss-player"
				aria-label="Play Sleeve"
				onClick={(event) => {
					if (event.target === dialog.current) dialog.current?.close();
				}}
			>
				<div ref={playerRef}>
					<header>
						<span>sleeve / {screen === "detail" ? "record" : playing}</span>
						<span>live · esc exits</span>
						<button type="button" onClick={() => dialog.current?.close()}>
							Close ×
						</button>
					</header>
					{screen === "detail" ? (
						<div className="ss-preview" style={{ height: (playerWidth * 2) / 3 }}>
							<div className="ss-preview-inner" style={{ transform: `scale(${playerWidth / 1200})` }}>
								<DesktopProduct key={session} take="records" screen="detail" headline={headline} />
							</div>
						</div>
					) : (
						<Preview key={session} take={playing} width={playerWidth} headline={headline} live />
					)}
				</div>
			</dialog>
		</div>
	);
}
