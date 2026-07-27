import type { ComponentType, ReactNode } from "react";
import { Fragment, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ExternalLinkDialog } from "./external-link-dialog";

/**
 * The stage, the slate HUD, and the session rail (#60), matching the design
 * canvas frame `spool-player--inspector`: the frame letterboxed at native size
 * on the near-black stage, chrome scattered into the screen corners with no
 * containers, and the session available on demand as a 320px instrument rail.
 * Sleep is the resting state — stillness fades every piece of chrome together
 * and hides the cursor, movement wakes it, and an open rail never sleeps.
 * Styling lives in the served document's chrome stylesheet; this component owns
 * structure and wiring.
 */

/** One hop on the session's tape (#60): what moved, when, and what it changed. */
export interface WalkEvent {
	kind: "go" | "back" | "restart" | "rewind";
	from: string;
	to: string;
	/** The click that traveled the edge — absent when code called ui.go. */
	label?: string;
	/** Milliseconds since the session opened. */
	at: number;
	/** State keys written while standing on `from`, rolled up into this hop. */
	changed: string[];
}

/** A mocked call as the rail shows it: shallow by design, never a debugger. */
export interface MockCall {
	method: string;
	path: string;
	status: number;
	ms: number;
}

/** The live store, flattened for the rail: dotted keys, one-line JSON values. */
export interface SessionState {
	scenario: string;
	rows: { key: string; value: string; changed: boolean }[];
}

export interface PlayerController {
	subscribe(listener: () => void): () => void;
	version(): number;
	/** The session store's own subscription — the rail reads state live. */
	stateSubscribe(listener: () => void): () => void;
	stateVersion(): number;
	read(): {
		project: string;
		frame: string;
		stack: string[];
		motion: boolean;
		arrival: number;
		externalHref: string | null;
		log: WalkEvent[];
		mock: MockCall[];
	};
	state(): SessionState;
	/** Milliseconds since the session opened — the tape's clock. */
	elapsed(): number;
	geometry(frame: string): { w: number; h: number };
	/** Whether this screen is a terminal frame (#44). */
	terminal(frame: string): boolean;
	back(): void;
	restart(): void;
	/** Scrub the tape: restore the snapshot the session stood in at that hop. */
	rewind(index: number): void;
	toggleMotion(): void;
	dismissExternal(): void;
	close(): void;
}

const RAIL_W = 320;
/** Stillness this long puts the chrome to sleep; the fade itself is CSS. */
const IDLE_MS = 2000;

export function Player({
	frames,
	controller,
	host,
}: {
	frames: Record<string, ComponentType>;
	controller: PlayerController;
	/** A control-origin native iframe host in the standalone player shell. */
	host?: ReactNode;
}) {
	useSyncExternalStore(controller.subscribe, controller.version);
	useSyncExternalStore(controller.stateSubscribe, controller.stateVersion);
	const { project, frame, stack, motion, arrival, externalHref, log, mock } = controller.read();
	const { w, h } = controller.geometry(frame);
	const viewport = useViewport();
	const terminal = controller.terminal(frame);
	const Screen = frames[frame];
	// the rail is a preference, not session data: it rides every hop, and the
	// session opens immersed
	const [rail, setRail] = useState(false);
	// reading is stillness: an open rail holds the chrome awake, and a dialog
	// owns the moment it is up. A terminal screen is another document, so the
	// hand moving inside it is invisible from here — the player never sleeps on
	// a stillness it cannot actually see (#44).
	const { awake, wake } = useWake(!rail && !terminal && externalHref === null);
	const asleep = !coarsePointer && !awake;
	// the external-link dialog is modal: it owns the moment, chrome and all
	const blocked = externalHref !== null;
	const { scale, x, y } = place(w, h, viewport, coarsePointer || !rail ? 0 : RAIL_W);

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: waking is ambient, not an affordance — the stage is the room, never a control
		<div className={asleep ? "spool-stage is-asleep" : "spool-stage"} onMouseMove={wake}>
			<div
				className={terminal ? "spool-screen is-terminal" : "spool-screen"}
				style={{ width: w, height: h, transform: `translate(${x}px, ${y}px) scale(${scale})` }}
			>
				<div
					className={terminal ? "spool-screen-scroll is-terminal" : "spool-screen-scroll"}
					style={{ position: "relative", zIndex: 0, isolation: "isolate" }}
				>
					{host ?? (Screen === undefined ? null : <Screen key={arrival} />)}
				</div>
				{externalHref !== null && (
					<ExternalLinkDialog
						href={externalHref}
						onStay={controller.dismissExternal}
						onOpen={controller.dismissExternal}
					/>
				)}
			</div>
			{/* touch is the immersive context (#60): the prototype is the page, no chrome at all */}
			{!coarsePointer && (
				<Fragment>
					<div className="spool-hud" inert={externalHref !== null}>
						<span
							className="spool-ticks"
							style={{ left: x - 7, top: y - 7, width: w * scale + 14, height: h * scale + 14 }}
						>
							<i />
							<i />
							<i />
							<i />
						</span>
						<div className="spool-hud-lead">
							<div className="spool-hud-verbs">
								<HudButton
									id="spool-back"
									label="Back"
									disabled={blocked || stack.length === 0}
									onClick={controller.back}
								>
									<path
										d="M10 3.5 L5.5 8 L10 12.5"
										fill="none"
										stroke="currentColor"
										strokeWidth="1.5"
										strokeLinecap="round"
										strokeLinejoin="round"
									/>
								</HudButton>
								<HudButton id="spool-restart" label="Restart" disabled={blocked} onClick={controller.restart}>
									<path
										d="M9.4 3.25 A5 5 0 1 1 6.3 3.3"
										fill="none"
										stroke="currentColor"
										strokeWidth="1.5"
										strokeLinecap="round"
										strokeLinejoin="round"
									/>
									<path
										d="M8.4 1.5 L6.3 3.3 L8 5"
										fill="none"
										stroke="currentColor"
										strokeWidth="1.5"
										strokeLinecap="round"
										strokeLinejoin="round"
									/>
								</HudButton>
							</div>
							<span className="spool-slate">
								<span className="spool-slate-project">{project}</span>
								<span className="spool-slate-frame">
									<span className="spool-dash" />
									{frame}
								</span>
							</span>
						</div>
						<div className="spool-hud-trail" style={{ right: rail ? RAIL_W + 24 : 24 }}>
							<HudButton
								id="spool-inspector"
								label={rail ? "Close inspector" : "Inspector"}
								pressed={rail}
								disabled={blocked}
								onClick={() => setRail((open) => !open)}
							>
								<rect
									x="2.5"
									y="3.5"
									width="11"
									height="9"
									rx="1.5"
									fill="none"
									stroke="currentColor"
									strokeWidth="1.5"
								/>
								<path d="M10 4v8" stroke="currentColor" strokeWidth="1.5" />
							</HudButton>
							<HudButton id="spool-close" label="Close" disabled={blocked} onClick={controller.close}>
								<path
									d="M4 4 L12 12 M12 4 L4 12"
									fill="none"
									stroke="currentColor"
									strokeWidth="1.5"
									strokeLinecap="round"
								/>
							</HudButton>
						</div>
						<span className="spool-readout">
							{w} × {h} · {Math.round(scale * 100)}%
						</span>
					</div>
					<aside
						className={rail ? "spool-rail" : "spool-rail is-closed"}
						aria-label="Session"
						inert={!rail || externalHref !== null}
					>
						<WalkSection log={log} running={rail} elapsed={controller.elapsed} onRewind={controller.rewind} />
						{terminal ? (
							// The prototype runtime is not present in this Spool-owned surface.
							<p className="spool-rail-quiet is-section">
								terminal execution is disabled until it can run in an OS sandbox
							</p>
						) : (
							<Fragment>
								<StateSection state={controller.state()} />
								<MockSection mock={mock} />
							</Fragment>
						)}
						<footer className="spool-rail-foot">
							<button
								type="button"
								id="spool-motion"
								className="spool-rail-row is-button"
								aria-label="Motion"
								aria-pressed={motion}
								onClick={controller.toggleMotion}
							>
								<span className="spool-rail-key">motion</span>
								<span className="spool-rail-value">{motion ? "on" : "off"}</span>
							</button>
						</footer>
					</aside>
				</Fragment>
			)}
		</div>
	);
}

function HudButton({
	id,
	label,
	disabled,
	pressed,
	onClick,
	children,
}: {
	id: string;
	label: string;
	disabled?: boolean;
	pressed?: boolean;
	onClick?: () => void;
	children: ReactNode;
}) {
	return (
		<button
			type="button"
			id={id}
			className={pressed === true ? "spool-hud-button is-on" : "spool-hud-button"}
			aria-label={label}
			aria-pressed={pressed}
			disabled={disabled}
			onClick={onClick}
		>
			<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
				{children}
			</svg>
		</button>
	);
}

/**
 * The tape: every hop the session really took, in order, never truncated. The
 * edge lines above a hop say how it was traveled — the click's own words, then
 * the state keys the stay before it wrote. Clicking an earlier hop rewinds to
 * it, which is itself a hop.
 */
function WalkSection({
	log,
	running,
	elapsed,
	onRewind,
}: {
	log: WalkEvent[];
	/** Whether the rail is open — the header's clock only runs while it is read. */
	running: boolean;
	/** The session's own clock, so the header and the hop times share one origin. */
	elapsed: () => number;
	onRewind: (index: number) => void;
}) {
	const last = log.length - 1;
	// the tape is still rolling: sitting on a screen is part of the walk's
	// duration, so the header counts on past the last hop
	const duration = useElapsed(running, elapsed);
	return (
		<section className="spool-rail-section spool-walk">
			<div className="spool-rail-head">
				<h2>walk</h2>
				<span>{clock(duration)}</span>
			</div>
			<ol>
				{log.map((event, index) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: the same frame can sit at two hops — position IS a tape entry's identity
					<Fragment key={`${index}:${event.to}`}>
						{event.label !== undefined && <li className="spool-walk-edge">· {event.label}</li>}
						{event.changed.length > 0 && <li className="spool-walk-edge">{event.changed.join(" ")}</li>}
						<li>
							<button
								type="button"
								className="spool-walk-hop"
								disabled={index === last}
								onClick={() => onRewind(index)}
							>
								{index === last && <span className="spool-dash" />}
								<span className="spool-walk-name">{event.to}</span>
								<span className="spool-walk-at">{clock(event.at)}</span>
							</button>
						</li>
					</Fragment>
				))}
			</ol>
		</section>
	);
}

function StateSection({ state }: { state: SessionState }) {
	return (
		<section className="spool-rail-section">
			<div className="spool-rail-head">
				<h2>state</h2>
			</div>
			<dl>
				{state.rows.map((row) => (
					<div key={row.key} className="spool-rail-row">
						{row.changed && <span className="spool-dash" />}
						<dt className="spool-rail-key">{row.key}</dt>
						<dd className="spool-rail-value">{row.value}</dd>
					</div>
				))}
				<div className="spool-rail-row">
					<dt className="spool-rail-key">scenario</dt>
					<dd className="spool-rail-value">{JSON.stringify(state.scenario)}</dd>
				</div>
			</dl>
		</section>
	);
}

function MockSection({ mock }: { mock: MockCall[] }) {
	return (
		<section className="spool-rail-section spool-mock">
			<div className="spool-rail-head">
				<h2>mock</h2>
			</div>
			{mock.length === 0 ? (
				<p className="spool-rail-quiet">no calls</p>
			) : (
				<ul>
					{mock.map((call, index) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: a session calls the same endpoint again and again — position IS a call's identity
						<li key={`${index}:${call.method}:${call.path}`}>
							<span className="spool-mock-method">{call.method}</span>
							<span className="spool-mock-path">{call.path}</span>
							<span className="spool-mock-meta">
								{call.status} · {call.ms} ms
							</span>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}

/**
 * The walk's running length, ticked once a second while the rail is open. A
 * closed rail keeps no timer: nothing is reading it, and the screen must not
 * re-render for a clock nobody can see.
 */
function useElapsed(running: boolean, elapsed: () => number): number {
	const [ms, setMs] = useState(elapsed);
	useEffect(() => {
		if (!running) return;
		setMs(elapsed());
		const timer = window.setInterval(() => setMs(elapsed()), 1000);
		return () => window.clearInterval(timer);
	}, [running, elapsed]);
	return ms;
}

/** Tape time, the way a recording reads it. */
function clock(ms: number): string {
	const total = Math.floor(ms / 1000);
	return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** A static terminal surface over its last persisted grid. */
export function TermScreen({ src, poster, title }: { src: string; poster: string; title: string }) {
	return (
		<div className="spool-term-screen" style={{ position: "relative", height: "100%", background: "#111110" }}>
			<img
				className="spool-term-poster"
				src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(poster)}`}
				alt=""
				aria-hidden
				style={{ position: "absolute", inset: 0, display: "block", width: "100%", height: "100%" }}
			/>
			<iframe
				ref={(el) => el?.focus()}
				src={src}
				title={title}
				sandbox="allow-scripts"
				style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
				onLoad={(event) => {
					event.currentTarget.focus({ preventScroll: true });
					event.currentTarget.contentWindow?.postMessage({ spool: "focus", surface: "player" }, "*");
				}}
			/>
		</div>
	);
}

/**
 * A frame that would not compile, standing in its own place instead of taking
 * the whole player down with it. Inline styles throughout: the shell serves this
 * document without the chrome stylesheet, so a class would land unstyled there.
 */
export function BrokenFrame({ frame, file, error }: { frame: string; file: string; error: string }) {
	const prompt = `Fix the compile error in ${file}:\n\n${error}`;
	return (
		<div
			className="spool-broken-frame"
			style={{
				height: "100%",
				overflow: "auto",
				boxSizing: "border-box",
				padding: 24,
				background: "#111110",
				color: "#b5b3ad",
				font: "400 13px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace",
			}}
		>
			<strong style={{ display: "block", marginBottom: 16, fontWeight: 400, color: "#f5391a" }}>
				{frame} failed to compile
			</strong>
			<pre style={{ margin: "0 0 24px", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{error}</pre>
			<div style={{ marginBottom: 8, color: "#8e8c88" }}>hand this to your agent</div>
			<pre
				// Selecting the whole prompt is one click, which is the point of it.
				style={{
					margin: 0,
					padding: 16,
					border: "1px solid #262626",
					whiteSpace: "pre-wrap",
					wordBreak: "break-word",
					color: "#f0efed",
					userSelect: "all",
				}}
			>
				{prompt}
			</pre>
		</div>
	);
}

interface Viewport {
	vw: number;
	vh: number;
}

function useViewport(): Viewport {
	const [viewport, setViewport] = useState<Viewport>(() => ({ vw: window.innerWidth, vh: window.innerHeight }));
	useEffect(() => {
		const measure = () => setViewport({ vw: window.innerWidth, vh: window.innerHeight });
		window.addEventListener("resize", measure);
		return () => window.removeEventListener("resize", measure);
	}, []);
	return viewport;
}

/**
 * The chrome's pulse (#60): while armed, stillness longer than IDLE_MS puts it
 * to sleep and movement wakes it; unarmed, it is simply always awake. The wake
 * listener sits on the stage, never inside a screen — the prototype has no
 * listener here to race (the parity law at the input layer).
 */
function useWake(armed: boolean): { awake: boolean; wake: () => void } {
	const [awake, setAwake] = useState(true);
	const timer = useRef(0);
	useEffect(() => {
		if (!armed) {
			setAwake(true);
			return;
		}
		timer.current = window.setTimeout(() => setAwake(false), IDLE_MS);
		return () => window.clearTimeout(timer.current);
	}, [armed]);
	return {
		awake,
		wake: () => {
			if (!armed) return;
			setAwake(true);
			window.clearTimeout(timer.current);
			timer.current = window.setTimeout(() => setAwake(false), IDLE_MS);
		},
	};
}

/** Touch is the immersive context; anything with a fine pointer letterboxes. */
const coarsePointer = window.matchMedia("(pointer: coarse)").matches;

interface Placement {
	scale: number;
	x: number;
	y: number;
}

/**
 * Fine pointer: keep stage margins for the corner chrome, then center the frame
 * in whatever the rail leaves. Coarse pointer: use the whole viewport. Never
 * scale a frame above its native size.
 */
function place(w: number, h: number, { vw, vh }: Viewport, railW: number): Placement {
	if (coarsePointer) {
		const scale = Math.min(1, vw / w, vh / h);
		return { scale, x: (vw - w * scale) / 2, y: (vh - h * scale) / 2 };
	}
	const stageW = vw - railW;
	const scale = Math.min(1, (stageW - 56) / w, (vh - 120) / h);
	return { scale, x: Math.round((stageW - w * scale) / 2), y: Math.round((vh - h * scale) / 2) };
}
