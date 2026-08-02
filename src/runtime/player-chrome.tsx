import type { ComponentType, ReactNode } from "react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ExternalLinkDialog } from "./external-link-dialog";
import { accelChord, accelLabel } from "./platform-keys";
import { useEdgeBar, useViewport } from "./player-stage";

/**
 * The played page (#227). Play opens a browser tab, so the frame stops being a
 * scaled picture and becomes a document the browser owns: it lays out at the
 * real viewport width, capped at its authored `w` as a max-width, and its
 * height is whatever its content is. No fit, no letterbox, no `transform:
 * scale` — spool never scales to rescue a page, because the rescue lies to the
 * CSS. Below the cap the frame's own breakpoints fire and its own padding
 * compresses; a frame that makes no accommodation overflows sideways the way
 * that site would in production.
 *
 * The only chrome is the edge bar, and it is summoned: rest the cursor against
 * the top edge and it peels in with back to canvas, the frame switcher and
 * close. A nub at the edge is its resting trace. Touch gets nothing at all —
 * the prototype is the page. Styling lives in the served document's chrome
 * stylesheet; this component owns structure and wiring.
 */

export interface PlayerController {
	subscribe(listener: () => void): () => void;
	version(): number;
	read(): {
		frame: string;
		arrival: number;
		externalHref: string | null;
	};
	geometry(frame: string): { w: number; h: number };
	/** Every screen in the composition, in the order the projection gave them. */
	frames(): string[];
	/** Whether this screen is a terminal frame (#44). */
	terminal(frame: string): boolean;
	/** Walk to another screen: the switcher's press, and the browser's back button. */
	walk(frame: string): void;
	dismissExternal(): void;
	close(): void;
}

export function Player({
	project,
	frames,
	controller,
	host,
	canvasHref,
}: {
	project: string;
	frames: Record<string, ComponentType>;
	controller: PlayerController;
	/** A control-origin native iframe host in the standalone player shell. */
	host?: ReactNode;
	/** Where the canvas lives, when this document can reach it. */
	canvasHref?: string;
}) {
	useSyncExternalStore(controller.subscribe, controller.version);
	const { frame, arrival, externalHref } = controller.read();
	const { w, h } = controller.geometry(frame);
	const viewport = useViewport();
	const terminal = controller.terminal(frame);
	const Screen = frames[frame];
	const [picking, setPicking] = useState(false);
	// the external-link dialog is modal: it owns the moment, chrome and all
	const blocked = externalHref !== null;
	const { revealed: summoned, point } = useEdgeBar(!coarsePointer && !blocked, picking);
	// A terminal screen is another document, so the hand moving inside it is
	// invisible from here (#44) — nothing would ever summon the bar over one, and
	// there would be no way back. So over a terminal the bar simply stands.
	const revealed = summoned || (terminal && !coarsePointer && !blocked);
	useEffect(() => {
		if (!revealed) setPicking(false);
	}, [revealed]);

	// Where the pointer is, forwarded out of an embedded frame: only this
	// document knows what the numbers mean, and a frame that has lost the pointer
	// altogether reports null so a pass through the edge never summons the bar.
	useEffect(() => {
		const onPoint = (event: Event) => {
			const { y } = (event as CustomEvent<{ y: number | null }>).detail;
			point(y);
		};
		window.addEventListener("spool-player-wake", onPoint);
		return () => window.removeEventListener("spool-player-wake", onPoint);
	}, [point]);

	usePlayedUrl(project, frame, controller);

	// Spool's own gesture lives behind accel, never on a plain key: a live frame
	// keeps every ordinary key, its own esc for modals included. ⌘W is the exit
	// this tab already has; this is the same exit for the hand already on esc.
	const { close } = controller;
	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (accelChord(event) === undefined) return;
			event.preventDefault();
			close();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [close]);

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: summoning is ambient, not an affordance — the page is the page, never a control
		<div className="spool-page" onMouseMove={(event) => point(event.clientY)}>
			<div
				className={terminal ? "spool-screen is-terminal" : "spool-screen"}
				// The one number spool imposes: the authored width as a cap, and the
				// real viewport below it. Written here rather than left to `max-width`
				// so the shell's iframe is exactly the box the runtime inside it will
				// measure, which is what the geometry handshake compares against.
				//
				// A terminal is a character grid rather than a document, so it keeps
				// the height it was authored at. Everything else is as tall as it is.
				style={{ width: Math.min(viewport.vw, w), ...(terminal ? { height: h } : {}) }}
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
			{/* touch is the immersive context (#60): the prototype is the page, no chrome at all */}
			{!coarsePointer && (
				<EdgeBar
					project={project}
					frame={frame}
					frames={controller.frames()}
					revealed={revealed && !blocked}
					picking={picking}
					onPicking={setPicking}
					onWalk={controller.walk}
					onClose={close}
					{...(canvasHref === undefined ? {} : { canvasHref })}
				/>
			)}
		</div>
	);
}

/**
 * The URL follows the walk (#227): every screen the session lands on names
 * itself in the address bar, so back and forward walk the visit log, a refresh
 * reopens where it left off, and any moment is a copyable link.
 *
 * A push per landing rather than a push per forward walk, because from out here
 * a `ui.back()` and a `ui.go()` are the same event — the frame changed. The
 * browser's history is the log of screens seen, which is the reading that never
 * disagrees with itself, and stepping back through it is a real walk the
 * session takes: the flow graph is told about it like any other.
 */
function usePlayedUrl(project: string, frame: string, controller: PlayerController): void {
	const named = useRef<string | undefined>(undefined);
	const popped = useRef<string | undefined>(undefined);
	useEffect(() => {
		if (named.current === frame) return;
		const first = named.current === undefined;
		const wasPopped = popped.current === frame;
		named.current = frame;
		popped.current = undefined;
		document.title = `${frame} · ${project}`;
		// A popped entry is already the address bar's; pushing over it would bury
		// the entry the reader just stepped back to.
		if (wasPopped) return;
		const url = new URL(window.location.href);
		url.searchParams.set("frame", frame);
		const state = { spool: "play", frame };
		if (first) window.history.replaceState(state, "", url);
		else window.history.pushState(state, "", url);
	}, [frame, project]);

	useEffect(() => {
		const onPop = (event: PopStateEvent) => {
			const state = event.state as { spool?: unknown; frame?: unknown } | null;
			const to =
				state?.spool === "play" && typeof state.frame === "string"
					? state.frame
					: new URL(window.location.href).searchParams.get("frame");
			if (to === null || to === controller.read().frame) return;
			popped.current = to;
			controller.walk(to);
		};
		window.addEventListener("popstate", onPop);
		return () => window.removeEventListener("popstate", onPop);
	}, [controller]);
}

/**
 * The one summonable surface. Closed, it is a 40px nub at the top edge and
 * nothing else — a control with no resting trace is a control most people never
 * find. Open, it carries the two exits a tab cannot draw for itself (back to
 * the canvas, and the frame switcher) beside the two it can.
 */
function EdgeBar({
	project,
	frame,
	frames,
	revealed,
	picking,
	onPicking,
	onWalk,
	onClose,
	canvasHref,
}: {
	project: string;
	frame: string;
	frames: string[];
	revealed: boolean;
	picking: boolean;
	onPicking: (picking: boolean) => void;
	onWalk: (frame: string) => void;
	onClose: () => void;
	canvasHref?: string;
}) {
	return (
		<>
			<span className={revealed ? "spool-nub is-hidden" : "spool-nub"} aria-hidden />
			<div className={revealed ? "spool-edge is-open" : "spool-edge"} inert={!revealed}>
				<div className="spool-bar">
					{canvasHref !== undefined && (
						<>
							<a className="spool-bar-back" href={canvasHref}>
								<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
									<path
										d="m10 3.5-4.5 4.5 4.5 4.5"
										fill="none"
										stroke="currentColor"
										strokeWidth="1.6"
										strokeLinecap="round"
										strokeLinejoin="round"
									/>
								</svg>
								canvas
							</a>
							<span className="spool-bar-rule" />
						</>
					)}
					{/* the picker hangs off the switcher rather than off the bar, so it
					    lines up under the name on whichever surface is drawing this */}
					<span className="spool-bar-switcher">
						<button
							type="button"
							id="spool-switcher"
							className="spool-bar-frame"
							aria-expanded={picking}
							aria-controls="spool-frames"
							onClick={() => onPicking(!picking)}
						>
							<span className="spool-bar-project">{project} /</span>
							<span className="spool-bar-name">{frame}</span>
							<svg
								viewBox="0 0 10 10"
								width="10"
								height="10"
								className={picking ? "spool-bar-chevron is-open" : "spool-bar-chevron"}
								aria-hidden="true"
							>
								<path
									d="m2 4 3 3 3-3"
									fill="none"
									stroke="currentColor"
									strokeWidth="1.4"
									strokeLinecap="round"
									strokeLinejoin="round"
								/>
							</svg>
						</button>
						<span
							id="spool-frames"
							className={picking ? "spool-picker is-open" : "spool-picker"}
							inert={!picking}
						>
							<span className="spool-picker-list">
								{frames.map((name) => (
									<button
										type="button"
										key={name}
										className={name === frame ? "spool-picker-row is-here" : "spool-picker-row"}
										onClick={() => {
											onPicking(false);
											if (name !== frame) onWalk(name);
										}}
									>
										<span className="spool-dash" />
										{name}
									</button>
								))}
							</span>
							<span className="spool-picker-foot">
								{frames.length} {frames.length === 1 ? "frame" : "frames"}
							</span>
						</span>
					</span>
					<span className="spool-bar-end">
						<span className="spool-bar-hint">{exitHint} exits</span>
						<span className="spool-bar-rule" />
						<button
							type="button"
							id="spool-close"
							className="spool-bar-close"
							aria-label="Close the tab"
							onClick={onClose}
						>
							<svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">
								<path d="M2 2 8 8M8 2 2 8" fill="none" stroke="currentColor" strokeWidth="1.5" />
							</svg>
						</button>
					</span>
				</div>
				{/* the scrim a video player draws under its controls: the page is not cut
				    in half by the bar's edge, it fades under it */}
				<div className="spool-edge-scrim" aria-hidden />
			</div>
		</>
	);
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
				minHeight: "100%",
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

/** Touch is the immersive context; anything with a fine pointer gets the bar. */
const coarsePointer = window.matchMedia("(pointer: coarse)").matches;

/** How this platform closes a tab, printed on the bar so nothing has to be taught. */
const exitHint = `${accelLabel()}w`;
