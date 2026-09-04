import { useEffect, useRef, useState } from "react";
import { DesktopProduct, type DesktopTake, type DesktopScreen } from "shared/ui/demo/desktop/products";
import { CanvasTools, type CanvasTool } from "shared/ui/spool/canvas-tools";
import { SpoolMark } from "shared/ui/spool/mark";
import {
	AgentIcon,
	PropertiesIcon,
	FolderIcon,
	FrameIcon,
	PanelCaret,
	ThreadIcon,
	PlayIcon,
	CloseIcon,
} from "shared/ui/spool/icons";
import "../live/landing.css";
import "./landing.css";

const TITLES: Record<DesktopTake, string> = { music: "sunda", records: "sleeve", library: "index", cinema: "still" };
const HEADLINES: Record<DesktopTake, string> = {
	music: "Stay a little longer.",
	records: "Good things,\non repeat.",
	library: "Keep what moves you.",
	cinema: "Somewhere,\na little quieter.",
};
const DETAILS: Record<DesktopTake, string> = {
	music: "album",
	records: "record",
	library: "reference",
	cinema: "film",
};
const REPO = "https://github.com/liamvinberg/spool";
const INITIAL = { home: { x: 50, y: 84 }, detail: { x: 971, y: 166 } };
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
function Lockup() {
	return (
		<span className="ds-brand">
			<SpoolMark />
			<span>spool</span>
		</span>
	);
}
function Install() {
	const [copied, setCopied] = useState(false);
	return (
		<div className="lp-install">
			<a className="lp-download" href={`${REPO}/releases/latest/download/Spool.dmg`}>
				Download for Mac <span>↓</span>
			</a>
			<button
				type="button"
				onClick={() => {
					void navigator.clipboard?.writeText("npm i -g spool.page").then(
						() => setCopied(true),
						() => setCopied(false),
					);
				}}
				aria-label="Copy install command"
			>
				<span>{copied ? "Copied" : "npm i -g spool.page"}</span>
				<span>⧉</span>
			</button>
		</div>
	);
}

function Artboard({
	take,
	screen,
	width,
	headline,
	live = false,
}: {
	take: DesktopTake;
	screen: DesktopScreen;
	width: number;
	headline: string;
	live?: boolean;
}) {
	return (
		<div className="ds-artboard" style={{ width, height: (width * 2) / 3 }}>
			<div
				inert={!live}
				style={{ width: 1200, height: 800, transform: `scale(${width / 1200})`, transformOrigin: "top left" }}
			>
				<DesktopProduct key={`${take}-${screen}`} take={take} screen={screen} headline={headline} />
			</div>
		</div>
	);
}

export function ProductCanvas({
	take,
	onPlay,
}: {
	take: DesktopTake;
	onPlay: (screen: DesktopScreen, headline: string) => void;
}) {
	const [selected, setSelected] = useState<DesktopScreen>("home");
	const [positions, setPositions] = useState(INITIAL);
	const [pan, setPan] = useState({ x: 0, y: 0 });
	const [zoom, setZoom] = useState(1);
	const [tool, setTool] = useState<CanvasTool>("select");
	const [panel, setPanel] = useState<"properties" | "agent" | null>(null);
	const [pagesOpen, setPagesOpen] = useState(true);
	const [threads, setThreads] = useState(true);
	const [headline, setHeadline] = useState(HEADLINES[take]);
	const drag = useRef<{
		id: DesktopScreen | "pan";
		clientX: number;
		clientY: number;
		x: number;
		y: number;
		pointer: number;
	} | null>(null);
	const name = (screen: DesktopScreen) => (screen === "home" ? "home" : DETAILS[take]);
	const choose = (screen: DesktopScreen) => {
		setSelected(screen);
		setPan({ x: screen === "home" ? 0 : -870, y: 0 });
	};
	const reset = () => {
		setPositions(INITIAL);
		setPan({ x: 0, y: 0 });
		setZoom(1);
		setSelected("home");
	};
	return (
		<div className="ds-app">
			<header className="ds-appbar">
				<button type="button" aria-label="Reset canvas view" onClick={reset}>
					<Lockup />
				</button>
				<div className="ds-project-tab">
					{TITLES[take]} <span>⌄</span>
				</div>
				<div className="ds-bar-actions">
					<button
						type="button"
						aria-label="Show connections"
						aria-pressed={threads}
						onClick={() => setThreads(!threads)}
					>
						<ThreadIcon />
					</button>
					<button type="button" aria-label="Zoom out" onClick={() => setZoom(Math.max(0.65, zoom - 0.1))}>
						−
					</button>
					<button type="button" onClick={reset} aria-label="Fit canvas">
						{Math.round(70 * zoom)}%
					</button>
					<button type="button" aria-label="Zoom in" onClick={() => setZoom(Math.min(1.25, zoom + 0.1))}>
						+
					</button>
				</div>
			</header>
			<div className="ds-app-body">
				<aside className="ds-pages">
					<header>
						Pages <span>1</span>
						<button
							type="button"
							aria-label={pagesOpen ? "Collapse page" : "Expand page"}
							onClick={() => setPagesOpen(!pagesOpen)}
						>
							<PanelCaret dir={pagesOpen ? "left" : "right"} />
						</button>
					</header>
					<button
						className="ds-page-row"
						type="button"
						aria-expanded={pagesOpen}
						onClick={() => setPagesOpen(!pagesOpen)}
					>
						<span>{pagesOpen ? "⌄" : "›"}</span>
						<FolderIcon />
						<span>app</span>
						<small>2</small>
					</button>
					{pagesOpen && (
						<div className="ds-tree">
							{(["home", "detail"] as const).map((screen) => (
								<button key={screen} type="button" aria-pressed={selected === screen} onClick={() => choose(screen)}>
									<FrameIcon />
									<span>{name(screen)}</span>
									{screen === "detail" && threads && <span>↗</span>}
								</button>
							))}
						</div>
					)}
					<footer>
						<FolderIcon /> {TITLES[take]} / design
					</footer>
				</aside>
				<div
					className="ds-field"
					data-tool={tool}
					onPointerDown={(event) => {
						if (tool !== "hand" || event.button !== 0 || drag.current) return;
						event.currentTarget.setPointerCapture(event.pointerId);
						drag.current = {
							id: "pan",
							clientX: event.clientX,
							clientY: event.clientY,
							...pan,
							pointer: event.pointerId,
						};
					}}
					onPointerMove={(event) => {
						const start = drag.current;
						if (start?.id !== "pan" || start.pointer !== event.pointerId) return;
						const scale = event.currentTarget.getBoundingClientRect().width / event.currentTarget.offsetWidth;
						setPan({
							x: start.x + (event.clientX - start.clientX) / scale,
							y: start.y + (event.clientY - start.clientY) / scale,
						});
					}}
					onPointerUp={() => {
						drag.current = null;
					}}
					onPointerCancel={() => {
						drag.current = null;
					}}
				>
					<div className="ds-world" style={{ transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})` }}>
						{threads && (
							<svg className="ds-connection" width="2200" height="900" aria-hidden="true">
								<path
									d={`M${positions.home.x + 840} ${positions.home.y + 280} C${positions.home.x + 900} ${positions.home.y + 280},${positions.detail.x - 60} ${positions.detail.y + 220},${positions.detail.x - 12} ${positions.detail.y + 220}`}
								/>
								<path d={`m${positions.detail.x - 3} ${positions.detail.y + 220} -10 -5 v10Z`} fill="currentColor" />
							</svg>
						)}
						{(["home", "detail"] as const).map((screen) => (
							<div
								key={screen}
								className="ds-frame"
								data-selected={selected === screen}
								style={{ left: positions[screen].x, top: positions[screen].y, width: screen === "home" ? 840 : 660 }}
							>
								<div className="ds-label">
									<button
										className="ds-move"
										type="button"
										aria-label={`Move ${name(screen)}`}
										onKeyDown={(event) => {
											const delta =
												event.key === "ArrowLeft"
													? [-16, 0]
													: event.key === "ArrowRight"
														? [16, 0]
														: event.key === "ArrowUp"
															? [0, -16]
															: event.key === "ArrowDown"
																? [0, 16]
																: null;
											if (!delta) return;
											event.preventDefault();
											setPositions((old) => ({
												...old,
												[screen]: { x: old[screen].x + (delta[0] ?? 0), y: old[screen].y + (delta[1] ?? 0) },
											}));
										}}
										onPointerDown={(event) => {
											if (event.button !== 0 || drag.current) return;
											event.stopPropagation();
											event.currentTarget.setPointerCapture(event.pointerId);
											setSelected(screen);
											drag.current = {
												id: screen,
												clientX: event.clientX,
												clientY: event.clientY,
												...positions[screen],
												pointer: event.pointerId,
											};
										}}
										onPointerMove={(event) => {
											const start = drag.current;
											if (start?.id !== screen || start.pointer !== event.pointerId) return;
											const scale = event.currentTarget.getBoundingClientRect().width / event.currentTarget.offsetWidth;
											setPositions((old) => ({
												...old,
												[screen]: {
													x: start.x + (event.clientX - start.clientX) / scale,
													y: start.y + (event.clientY - start.clientY) / scale,
												},
											}));
										}}
										onPointerUp={() => {
											drag.current = null;
										}}
										onPointerCancel={() => {
											drag.current = null;
										}}
									>
										{name(screen)}
									</button>
									{selected === screen && (
										<button type="button" aria-label={`Play ${name(screen)}`} onClick={() => onPlay(screen, headline)}>
											<PlayIcon /> play
										</button>
									)}
								</div>
								<Artboard take={take} screen={screen} width={screen === "home" ? 840 : 660} headline={headline} />
								<button
									type="button"
									className="ds-frame-hit"
									aria-label={`Select ${name(screen)}`}
									onClick={() => {
										setSelected(screen);
										if (tool === "edit") setPanel("properties");
									}}
									onDoubleClick={() => onPlay(screen, headline)}
								/>
								{selected === screen && (
									<>
										<i className="ds-handle ds-nw" />
										<i className="ds-handle ds-ne" />
										<i className="ds-handle ds-sw" />
										<i className="ds-handle ds-se" />
										<span className="ds-size">1200 × 800</span>
									</>
								)}
							</div>
						))}
					</div>
					<CanvasTools
						tool={tool}
						onTool={(next) => {
							setTool(next);
							if (next === "edit") setPanel("properties");
						}}
					/>
					<span className="ds-field-help">
						{tool === "hand"
							? "drag to pan"
							: tool === "edit"
								? "try changing the headline"
								: "double-click a frame to play"}
					</span>
				</div>
				{panel && (
					<aside className="ds-panel">
						<header>
							{panel}
							<button type="button" aria-label="Close panel" onClick={() => setPanel(null)}>
								<CloseIcon />
							</button>
						</header>
						{panel === "properties" ? (
							<>
								<div className="ds-property-name">
									<FrameIcon />
									{name(selected)}
								</div>
								<section>
									<h3>Frame</h3>
									<div className="ds-dimensions">
										<span>
											W <b>1200</b>
										</span>
										<span>
											H <b>800</b>
										</span>
									</div>
								</section>
								<section>
									<h3>Try an edit</h3>
									<label>
										Headline
										<textarea
											aria-label="Headline"
											value={headline}
											maxLength={45}
											onChange={(event) => setHeadline(event.target.value)}
										/>
									</label>
									<button type="button" className="ds-text-reset" onClick={() => setHeadline(HEADLINES[take])}>
										Reset text
									</button>
								</section>
								<p>Edits stay in this preview.</p>
							</>
						) : (
							<>
								<div className="ds-agent-message">
									<span>you</span>
									<p>
										Explore a desktop{" "}
										{take === "library" ? "reference library" : take === "cinema" ? "film journal" : "music app"}. Make
										the screens work.
									</p>
								</div>
								<div className="ds-agent-message">
									<SpoolMark />
									<p>Two screens, ready to try. Open home, then explore a {DETAILS[take]}.</p>
									<button
										type="button"
										onClick={() => {
											setPanel(null);
											choose("detail");
										}}
									>
										Go to {DETAILS[take]} ↗
									</button>
								</div>
								<div className="ds-agent-foot">Example conversation</div>
							</>
						)}
					</aside>
				)}
				<aside className="ds-dock">
					<button
						type="button"
						aria-label="Properties"
						aria-pressed={panel === "properties"}
						onClick={() => setPanel(panel === "properties" ? null : "properties")}
					>
						<PropertiesIcon />
					</button>
					<button
						type="button"
						aria-label="Agent"
						aria-pressed={panel === "agent"}
						onClick={() => setPanel(panel === "agent" ? null : "agent")}
					>
						<AgentIcon />
					</button>
				</aside>
			</div>
		</div>
	);
}

export function DesktopLanding({ take }: { take: DesktopTake }) {
	const { ref: stageRef, width } = useWidth(1296);
	const { ref: playerRef, width: playerWidth } = useWidth(1200);
	const dialog = useRef<HTMLDialogElement>(null);
	const scroller = useRef<HTMLDivElement>(null);
	const showcase = useRef<HTMLElement>(null);
	const [screen, setScreen] = useState<DesktopScreen>("home");
	const [headline, setHeadline] = useState(HEADLINES[take]);
	const [session, setSession] = useState(0);
	const play = (next: DesktopScreen, title: string) => {
		setScreen(next);
		setHeadline(title);
		setSession((value) => value + 1);
		dialog.current?.showModal();
	};
	return (
		<div className="lp ds-landing" ref={scroller}>
			<div className="lp-page">
				<header className="lp-nav">
					<button type="button" aria-label="spool home" onClick={() => scroller.current?.scrollTo({ top: 0 })}>
						<Lockup />
					</button>
					<nav aria-label="Main">
						<button
							type="button"
							onClick={() => {
								if (showcase.current) scroller.current?.scrollTo({ top: showcase.current.offsetTop - 20 });
							}}
						>
							Try the canvas
						</button>
						<a href={`${REPO}#readme`}>How it works ↗</a>
						<a href={REPO}>GitHub ↗</a>
					</nav>
					<a className="lp-nav-download" href={`${REPO}/releases/latest/download/Spool.dmg`}>
						Get spool ↓
					</a>
				</header>
				<section className="lp-hero">
					<h1>
						A canvas where
						<br />
						the frames are <span>alive.</span>
					</h1>
					<div className="lp-hero-description">
						<p>
							Design with your agent. Arrange live screens.
							<br />
							Play the result, right in your project.
						</p>
						<Install />
					</div>
				</section>
				<section ref={showcase} className="lp-demo-section" aria-label={`${TITLES[take]} interactive canvas`}>
					<div ref={stageRef} className="ds-stage" style={{ height: (width * 850) / 1600 }}>
						<div className="ds-scaled" style={{ transform: `scale(${width / 1600})` }}>
							<ProductCanvas take={take} onPlay={play} />
						</div>
					</div>
				</section>
				<div className="lp-after-demo">
					<span className="lp-live-dot" />A working canvas. Give it a try.<span>Built in spool.</span>
				</div>
				<section className="ds-below">
					<div>
						<h2>
							From a first idea
							<br />
							to something you can use.
						</h2>
						<p>
							Ask for a few directions. Move the frames around.
							<br />
							Open one and follow the flow.
						</p>
					</div>
					<div className="ds-step-list">
						<button
							type="button"
							onClick={() => {
								if (showcase.current) scroller.current?.scrollTo({ top: showcase.current.offsetTop - 20 });
							}}
						>
							<span>01</span>
							<div>
								Arrange the screens.<small>Drag a frame by its name, or try the hand tool.</small>
							</div>
							<span>↗</span>
						</button>
						<button type="button" onClick={() => play("home", HEADLINES[take])}>
							<span>02</span>
							<div>
								Play what you made.<small>Every screen is a live React component.</small>
							</div>
							<span>↗</span>
						</button>
						<a href={`${REPO}#readme`}>
							<span>03</span>
							<div>
								Keep the source.<small>TSX in your repo, beside the rest of your code.</small>
							</div>
							<span>↗</span>
						</a>
					</div>
				</section>
				<section className="lp-final">
					<h2>See it before you build it.</h2>
					<p>A local prototyping canvas. Open source, under the MIT licence.</p>
					<Install />
				</section>
				<footer className="lp-footer">
					<Lockup />
					<span>Made with spool.</span>
					<a href={REPO}>GitHub ↗</a>
					<a href={`${REPO}/blob/main/LICENSE.md`}>MIT licence</a>
				</footer>
			</div>
			<dialog
				ref={dialog}
				className="ds-player"
				aria-label={`Play ${TITLES[take]}`}
				onClick={(event) => {
					if (event.target === dialog.current) dialog.current?.close();
				}}
			>
				<div ref={playerRef}>
					<header>
						<span>
							{TITLES[take]} / {screen === "home" ? "home" : DETAILS[take]}
						</span>
						<span>live · esc exits</span>
						<button type="button" onClick={() => dialog.current?.close()}>
							Close ×
						</button>
					</header>
					<Artboard key={session} take={take} screen={screen} width={playerWidth} headline={headline} live />
				</div>
			</dialog>
		</div>
	);
}
