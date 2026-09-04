import { type ReactNode, useEffect, useRef, useState } from "react";
import fire from "shared/assets/restaurant/fire.jpg";
import pasta from "shared/assets/restaurant/rigatoni.jpg";
import { cn } from "shared/lib/utils";
import { FireRestaurant } from "shared/ui/demo/restaurant/fire";
import { RestaurantShowcase } from "shared/ui/demo/restaurant/showcase";
import { SpoolMark } from "shared/ui/spool/mark";
import "./landing.css";

export type LandingTake = "gallery" | "canvas" | "compare" | "edit" | "play";
type Demo = "hearth" | "kindling" | "pasta";
type Treatment = "warm" | "minimal" | "bold";
const DEMOS: readonly Demo[] = ["hearth", "kindling", "pasta"];
const NAMES: Record<Demo, string> = { hearth: "Brasa / hearth", kindling: "Brasa / daylight", pasta: "Orto / pasta" };
const FILES: Record<Demo, string> = { hearth: "brasa-home", kindling: "brasa-daylight", pasta: "orto-home" };
const REPO = "https://github.com/liamvinberg/spool";
const DOWNLOAD = `${REPO}/releases/latest/download/Spool.dmg`;

function Arrow() {
	return <span aria-hidden="true">↗</span>;
}
function Play() {
	return (
		<svg viewBox="0 0 16 16" aria-hidden="true">
			<path d="M5 3.5 12 8l-7 4.5Z" fill="currentColor" />
		</svg>
	);
}

function Brand() {
	return (
		<span className="lp-brand">
			<SpoolMark />
			<span>spool</span>
		</span>
	);
}

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

function Document({ demo, headline = "Come closer." }: { demo: Demo; headline?: string }) {
	return demo === "pasta" ? (
		<RestaurantShowcase take="orto" photo={pasta} />
	) : (
		<FireRestaurant take={demo} fire={fire} headline={headline} />
	);
}

function Preview({
	demo,
	width,
	live = false,
	headline = "Come closer.",
	treatment = "warm",
}: {
	demo: Demo;
	width: number;
	live?: boolean;
	headline?: string;
	treatment?: Treatment;
}) {
	return (
		<div className="lp-preview" data-treatment={treatment} style={{ width, height: (width * 900) / 1440 }}>
			<div className="lp-preview-document" inert={!live} style={{ transform: `scale(${width / 1440})` }}>
				<Document demo={demo} headline={headline} />
			</div>
		</div>
	);
}

function Choices({
	selected,
	onSelect,
	compact = false,
}: {
	selected: Demo;
	onSelect: (demo: Demo) => void;
	compact?: boolean;
}) {
	return (
		<div className={cn("lp-choices", compact && "lp-choices-compact")} aria-label="Choose an example">
			{DEMOS.map((demo) => (
				<button key={demo} type="button" aria-pressed={selected === demo} onClick={() => onSelect(demo)}>
					<span className={cn("lp-swatch", `lp-swatch-${demo}`)} />
					{NAMES[demo]}
				</button>
			))}
		</div>
	);
}

function WindowBar({
	selected,
	onSelect,
	children,
	fixed = false,
}: {
	selected: Demo;
	onSelect: (demo: Demo) => void;
	children?: ReactNode;
	fixed?: boolean;
}) {
	return (
		<header className="lp-windowbar">
			<Brand />
			{fixed ? (
				<span className="lp-mono">brasa</span>
			) : (
				<div className="lp-projects">
					<button type="button" aria-pressed={selected !== "pasta"} onClick={() => onSelect("hearth")}>
						brasa
					</button>
					<button type="button" aria-pressed={selected === "pasta"} onClick={() => onSelect("pasta")}>
						orto
					</button>
				</div>
			)}
			<div className="lp-window-actions">{children}</div>
		</header>
	);
}

function Gallery({
	selected,
	onSelect,
	onPlay,
}: {
	selected: Demo;
	onSelect: (demo: Demo) => void;
	onPlay: (demo: Demo) => void;
}) {
	const { ref, width } = useWidth(1296);
	const index = DEMOS.indexOf(selected);
	const cardWidth = width * 0.67;
	return (
		<div className="lp-gallery-widget" ref={ref}>
			<div className="lp-gallery-field" style={{ height: cardWidth * 0.625 + 68 }}>
				{DEMOS.map((demo, i) => (
					<div
						key={demo}
						className="lp-gallery-item"
						data-active={demo === selected}
						style={{
							width: cardWidth,
							transform: `translateX(${(((i - index + 4) % 3) - 1) * (cardWidth + 26)}px) scale(${demo === selected ? 1 : 0.88})`,
							left: (width - cardWidth) / 2,
						}}
					>
						<div className="lp-frame-label">
							<span>{FILES[demo]}</span>
							<span>1440 × 900</span>
						</div>
						<Preview demo={demo} width={cardWidth} />
						<button
							className="lp-gallery-hit"
							type="button"
							aria-label={demo === selected ? `Play ${NAMES[demo]}` : `View ${NAMES[demo]}`}
							onClick={() => (demo === selected ? onPlay(demo) : onSelect(demo))}
						>
							{demo === selected && (
								<span>
									<Play />
									Play this prototype
								</span>
							)}
						</button>
					</div>
				))}
			</div>
			<div className="lp-gallery-bottom">
				<span>Three directions. All live.</span>
				<Choices selected={selected} onSelect={onSelect} />
				<div className="lp-nextprev">
					<button
						type="button"
						aria-label="Previous example"
						onClick={() => onSelect(DEMOS[(index + 2) % 3] ?? "hearth")}
					>
						←
					</button>
					<button type="button" aria-label="Next example" onClick={() => onSelect(DEMOS[(index + 1) % 3] ?? "hearth")}>
						→
					</button>
				</div>
			</div>
		</div>
	);
}

const START_POSITIONS: Record<Demo, { x: number; y: number }> = {
	hearth: { x: 30, y: 48 },
	kindling: { x: 365, y: 435 },
	pasta: { x: 690, y: 65 },
};

function Canvas({
	selected,
	onSelect,
	onPlay,
}: {
	selected: Demo;
	onSelect: (demo: Demo) => void;
	onPlay: (demo: Demo) => void;
}) {
	const { ref, width } = useWidth(1296);
	const [positions, setPositions] = useState(START_POSITIONS);
	const [zoom, setZoom] = useState(1);
	const [dragging, setDragging] = useState<Demo | null>(null);
	const start = useRef<{ demo: Demo; clientX: number; clientY: number; x: number; y: number } | null>(null);
	const scale = width / 1296;
	const move = (demo: Demo, x: number, y: number) =>
		setPositions((old) => ({
			...old,
			[demo]: { x: Math.max(-80, Math.min(1000, x)), y: Math.max(15, Math.min(450, y)) },
		}));
	return (
		<div className="lp-canvas-window" ref={ref}>
			<WindowBar selected={selected} onSelect={onSelect}>
				<span className="lp-mono">{Math.round(zoom * 38)}%</span>
				<button className="lp-small-play" type="button" onClick={() => onPlay(selected)}>
					<Play />
					play
				</button>
			</WindowBar>
			<div className="lp-canvas-field" style={{ height: Math.max(390, 605 * scale) }}>
				{DEMOS.map((demo) => (
					<div
						key={demo}
						className="lp-draggable"
						data-selected={selected === demo}
						data-dragging={dragging === demo}
						style={{
							left: positions[demo].x * scale * zoom,
							top: positions[demo].y * scale * zoom,
							zIndex: dragging === demo ? 8 : selected === demo ? 5 : 1,
						}}
					>
						<button
							className="lp-frame-label lp-drag-handle"
							type="button"
							aria-label={`Move ${NAMES[demo]}`}
							onKeyDown={(event) => {
								const directions: Record<string, readonly [number, number]> = {
									ArrowLeft: [-16, 0],
									ArrowRight: [16, 0],
									ArrowUp: [0, -16],
									ArrowDown: [0, 16],
								};
								const delta = directions[event.key];
								if (delta) {
									event.preventDefault();
									move(demo, positions[demo].x + delta[0], positions[demo].y + delta[1]);
								}
							}}
							onPointerDown={(event) => {
								if (event.button !== 0) return;
								onSelect(demo);
								setDragging(demo);
								start.current = { demo, clientX: event.clientX, clientY: event.clientY, ...positions[demo] };
								event.currentTarget.setPointerCapture(event.pointerId);
							}}
							onPointerMove={(event) => {
								const from = start.current;
								if (from?.demo !== demo) return;
								move(
									demo,
									from.x + (event.clientX - from.clientX) / (scale * zoom),
									from.y + (event.clientY - from.clientY) / (scale * zoom),
								);
							}}
							onPointerUp={() => {
								start.current = null;
								setDragging(null);
							}}
							onPointerCancel={() => {
								start.current = null;
								setDragging(null);
							}}
						>
							<span>{FILES[demo]}</span>
							<span>⠿</span>
						</button>
						<button
							className="lp-artboard-button"
							type="button"
							aria-label={`Select ${NAMES[demo]}`}
							onClick={() => onSelect(demo)}
							onDoubleClick={() => onPlay(demo)}
						>
							<Preview demo={demo} width={560 * scale * zoom} />
						</button>
					</div>
				))}
				<div className="lp-canvas-help">Drag a frame by its name.</div>
				<div className="lp-canvas-tools">
					<button type="button" aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(0.65, value - 0.1))}>
						−
					</button>
					<button
						type="button"
						onClick={() => {
							setPositions(START_POSITIONS);
							setZoom(1);
						}}
					>
						Fit
					</button>
					<button type="button" aria-label="Zoom in" onClick={() => setZoom((value) => Math.min(1.3, value + 0.1))}>
						+
					</button>
				</div>
			</div>
		</div>
	);
}

function Compare({ onPlay }: { onPlay: (demo: Demo) => void }) {
	const { ref, width } = useWidth(1040);
	const [split, setSplit] = useState(50);
	return (
		<div className="lp-compare-widget" ref={ref}>
			<div className="lp-compare-stage" style={{ height: width * 0.625 }}>
				<Preview demo="hearth" width={width} />
				<div className="lp-compare-overlay" style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}>
					<Preview demo="kindling" width={width} />
				</div>
				<div className="lp-compare-divider" style={{ left: `${split}%` }}>
					<span>↔</span>
				</div>
				<input
					type="range"
					aria-label="Reveal the daylight direction"
					min={0}
					max={100}
					value={split}
					onChange={(event) => setSplit(Number(event.target.value))}
				/>
			</div>
			<div className="lp-compare-caption">
				<button type="button" onClick={() => onPlay("kindling")}>
					<span className="lp-swatch lp-swatch-kindling" />
					Brasa, in daylight <Arrow />
				</button>
				<span>Slide to find the feeling.</span>
				<button type="button" onClick={() => onPlay("hearth")}>
					<span className="lp-swatch lp-swatch-hearth" />
					Brasa, by the fire <Arrow />
				</button>
			</div>
		</div>
	);
}

function Editor({ onPlay }: { onPlay: (demo: Demo, edits: { headline: string; treatment: Treatment }) => void }) {
	const { ref, width } = useWidth(916);
	const [headline, setHeadline] = useState("Come closer.");
	const [treatment, setTreatment] = useState<Treatment>("minimal");
	const [saved, setSaved] = useState(false);
	return (
		<div className="lp-editor">
			<WindowBar selected="hearth" onSelect={() => {}} fixed>
				<span className="lp-mono">brasa / home</span>
				<button
					className="lp-small-play"
					type="button"
					onClick={() => onPlay("hearth", { headline: headline || "Come closer.", treatment })}
				>
					<Play />
					play
				</button>
			</WindowBar>
			<div className="lp-editor-body">
				<div className="lp-editor-canvas" ref={ref}>
					<div className="lp-frame-label">
						<span>brasa-home</span>
						<span>live</span>
					</div>
					<Preview demo="hearth" width={width} headline={headline || "Come closer."} treatment={treatment} />
				</div>
				<aside className="lp-edit-panel">
					<h3>Make it yours.</h3>
					<p>
						Change a detail.
						<br />
						See how the whole thing feels.
					</p>
					<label>
						Headline
						<input
							value={headline}
							maxLength={28}
							onChange={(event) => {
								setHeadline(event.target.value);
								setSaved(false);
							}}
						/>
					</label>
					<fieldset>
						<legend>Type</legend>
						{(["warm", "minimal", "bold"] as const).map((value) => (
							<button
								key={value}
								type="button"
								aria-pressed={treatment === value}
								onClick={() => {
									setTreatment(value);
									setSaved(false);
								}}
							>
								<span className={cn("lp-type-sample", `lp-type-${value}`)}>Aa</span>
								{value}
							</button>
						))}
					</fieldset>
					<button className="lp-save" type="button" onClick={() => setSaved(true)}>
						{saved ? "✓ Kept in this preview" : "Keep this direction"}
					</button>
					<span className="lp-edit-note">Your changes stay in this page.</span>
					<button
						className="lp-reset"
						type="button"
						onClick={() => {
							setHeadline("Come closer.");
							setTreatment("minimal");
							setSaved(false);
						}}
					>
						Reset
					</button>
				</aside>
			</div>
		</div>
	);
}

function Walk({
	selected,
	onSelect,
	onPlay,
}: {
	selected: Demo;
	onSelect: (demo: Demo) => void;
	onPlay: (demo: Demo) => void;
}) {
	const { ref, width } = useWidth(1100);
	const [step, setStep] = useState<"home" | "reserve" | "confirmed">("home");
	const [guests, setGuests] = useState("2");
	const [time, setTime] = useState("19:00");
	return (
		<div className="lp-walk" ref={ref}>
			<div className="lp-walk-bar">
				<Choices
					selected={selected}
					onSelect={(demo) => {
						onSelect(demo);
						setStep("home");
					}}
					compact
				/>
				<div className="lp-walk-steps">
					<button type="button" aria-current={step === "home" ? "step" : undefined} onClick={() => setStep("home")}>
						home
					</button>
					<span>→</span>
					<button
						type="button"
						aria-current={step === "reserve" ? "step" : undefined}
						onClick={() => setStep("reserve")}
					>
						reserve
					</button>
					<span>→</span>
					<span aria-current={step === "confirmed" ? "step" : undefined}>confirmed</span>
				</div>
			</div>
			<div className="lp-walk-stage" style={{ height: width * 0.625 }}>
				{step === "home" ? (
					<>
						<Preview demo={selected} width={width} />
						<button type="button" className="lp-walk-start" onClick={() => setStep("reserve")}>
							<Play />
							Book a table
						</button>
					</>
				) : (
					<div className={cn("lp-reservation", selected === "pasta" && "lp-reservation-pasta")}>
						<div className="lp-reservation-picture">
							<img
								src={selected === "pasta" ? pasta : fire}
								alt={selected === "pasta" ? "A plate of rigatoni" : "Glowing logs on an open fire"}
							/>
							<span>{selected === "pasta" ? "orto" : "brasa"}</span>
						</div>
						<div className="lp-reservation-form">
							{step === "confirmed" ? (
								<div role="status">
									<span className="lp-book-check">✓</span>
									<h3>See you at {time}.</h3>
									<p>A table for {guests}. Bring your appetite.</p>
									<button type="button" onClick={() => setStep("home")}>
										Play again ↺
									</button>
									<small>Example booking. Nothing is sent.</small>
								</div>
							) : (
								<>
									<h3>A table for you.</h3>
									<p>Friday, 18 September</p>
									<label>
										At the table
										<select value={guests} onChange={(event) => setGuests(event.target.value)}>
											{[1, 2, 3, 4, 5, 6].map((n) => (
												<option key={n} value={n}>
													{n} {n === 1 ? "guest" : "guests"}
												</option>
											))}
										</select>
									</label>
									<fieldset>
										<legend>Choose a time</legend>
										<div>
											{["17:30", "19:00", "20:30"].map((value) => (
												<button type="button" key={value} aria-pressed={time === value} onClick={() => setTime(value)}>
													{value}
												</button>
											))}
										</div>
									</fieldset>
									<button type="button" onClick={() => setStep("confirmed")}>
										Save our seats <Arrow />
									</button>
									<small>Example booking. Nothing is sent.</small>
								</>
							)}
						</div>
					</div>
				)}
			</div>
			<div className="lp-walk-foot">
				<span>Go on. Click your way through.</span>
				<button type="button" onClick={() => onPlay(selected)}>
					Open the full prototype <Arrow />
				</button>
			</div>
		</div>
	);
}

function Install() {
	const [status, setStatus] = useState("npm i -g spool.page");
	return (
		<div className="lp-install">
			<a className="lp-download" href={DOWNLOAD}>
				Download for Mac <span aria-hidden="true">↓</span>
			</a>
			<button
				type="button"
				aria-label="Copy install command"
				onClick={() => {
					void navigator.clipboard?.writeText("npm i -g spool.page").then(
						() => setStatus("Copied"),
						() => setStatus("npm i -g spool.page"),
					);
				}}
			>
				<span>{status}</span>
				<span aria-hidden="true">⧉</span>
			</button>
		</div>
	);
}

const INVITATIONS: Record<LandingTake, string> = {
	gallery: "Pick a direction. Press play.",
	canvas: "A little room to move things around.",
	compare: "One restaurant. Two very different feelings.",
	edit: "A few pixels can change the whole feeling.",
	play: "The buttons work. Try them.",
};

export function LiveLanding({ take }: { take: LandingTake }) {
	const scroller = useRef<HTMLDivElement>(null);
	const demoSection = useRef<HTMLElement>(null);
	const detailsSection = useRef<HTMLElement>(null);
	const player = useRef<HTMLDialogElement>(null);
	const [selected, setSelected] = useState<Demo>(take === "gallery" ? "pasta" : "hearth");
	const [playing, setPlaying] = useState<Demo>("hearth");
	const [playHeadline, setPlayHeadline] = useState("Come closer.");
	const [playTreatment, setPlayTreatment] = useState<Treatment>("warm");
	const { ref: playerRef, width: playerWidth } = useWidth(1200);
	const play = (demo: Demo, edits?: { headline: string; treatment: Treatment }) => {
		setPlaying(demo);
		setPlayHeadline(edits?.headline ?? "Come closer.");
		setPlayTreatment(edits?.treatment ?? "warm");
		player.current?.showModal();
	};
	const scrollTo = (node: HTMLElement | null) => {
		if (!node || !scroller.current) return;
		const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		scroller.current.scrollTo({ top: node.offsetTop - 30, behavior: reduce ? "instant" : "smooth" });
	};
	return (
		<div className={cn("lp", `lp-${take}`)} ref={scroller}>
			<div className="lp-page">
				<header className="lp-nav">
					<a
						href="#"
						onClick={(event) => {
							event.preventDefault();
							const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
							scroller.current?.scrollTo({ top: 0, behavior: reduce ? "instant" : "smooth" });
						}}
						aria-label="spool home"
					>
						<Brand />
					</a>
					<nav aria-label="Main">
						<button type="button" onClick={() => scrollTo(demoSection.current)}>
							Try it
						</button>
						<button type="button" onClick={() => scrollTo(detailsSection.current)}>
							How it works
						</button>
						<a href={REPO}>
							GitHub <Arrow />
						</a>
					</nav>
					<a className="lp-nav-download" href={DOWNLOAD}>
						Get spool <span aria-hidden="true">↓</span>
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
							Design with your agent. Explore the possibilities.
							<br />
							Play the result, right in your project.
						</p>
						<Install />
					</div>
				</section>
				<section ref={demoSection} className="lp-demo-section" aria-label="Interactive product showcase">
					{take === "gallery" && <Gallery selected={selected} onSelect={setSelected} onPlay={play} />}
					{take === "canvas" && <Canvas selected={selected} onSelect={setSelected} onPlay={play} />}
					{take === "compare" && <Compare onPlay={play} />}
					{take === "edit" && <Editor onPlay={play} />}
					{take === "play" && <Walk selected={selected} onSelect={setSelected} onPlay={play} />}
				</section>
				<div className="lp-after-demo">
					<span className="lp-live-dot" />
					{INVITATIONS[take]}
					<span>Built in spool.</span>
				</div>
				<section className="lp-details" ref={detailsSection}>
					<div className="lp-details-heading">
						<h2>
							Make variations
							<br />
							until one feels right.
						</h2>
						<p>
							Ask your agent for a few directions. They appear as live screens on the canvas. Arrange them, compare
							them, and walk through the one you like.
						</p>
					</div>
					<div className="lp-little-gallery">
						{DEMOS.map((demo) => (
							<button type="button" key={demo} onClick={() => play(demo)} aria-label={`Open ${NAMES[demo]}`}>
								<div className="lp-little-window">
									<Preview demo={demo} width={340} />
								</div>
								<span>
									{NAMES[demo]}
									<Arrow />
								</span>
							</button>
						))}
					</div>
				</section>
				<section className="lp-repo">
					<div>
						<h2>It lives in your repo.</h2>
						<p>
							Your agent writes TSX. spool renders it live.
							<br />
							The source stays in <code>design/</code>, beside your code.
						</p>
						<a href={`${REPO}#readme`}>
							Read the docs <Arrow />
						</a>
					</div>
					<div className="lp-file-tree">
						<span>your-project/</span>
						<div>
							design/
							<div>
								frames/
								<div>
									<span>brasa-home/</span>
									<strong>frame.tsx</strong>
								</div>
								<div>
									<span>brasa-daylight/</span>
									<strong>frame.tsx</strong>
								</div>
								<div>
									<span>orto-home/</span>
									<strong>frame.tsx</strong>
								</div>
							</div>
						</div>
					</div>
				</section>
				<section className="lp-final">
					<h2>See it before you build it.</h2>
					<p>A local prototyping canvas. Open source, under the MIT licence.</p>
					<Install />
				</section>
				<footer className="lp-footer">
					<Brand />
					<span>Made with spool.</span>
					<a href={REPO}>
						GitHub <Arrow />
					</a>
					<a href={`${REPO}/blob/main/LICENSE.md`}>MIT licence</a>
				</footer>
			</div>
			<dialog
				className="lp-player"
				ref={player}
				aria-label="Play the restaurant prototype"
				onClick={(event) => {
					if (event.target === player.current) player.current?.close();
				}}
			>
				<div className="lp-player-inner" ref={playerRef}>
					<header>
						<span>{NAMES[playing]}</span>
						<span>live prototype</span>
						<button type="button" onClick={() => player.current?.close()}>
							Close ×
						</button>
					</header>
					<Preview demo={playing} width={playerWidth} live headline={playHeadline} treatment={playTreatment} />
				</div>
			</dialog>
		</div>
	);
}
