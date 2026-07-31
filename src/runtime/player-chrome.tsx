import type { ComponentType, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { fitBox, type Placement } from "../fit";
import { ExternalLinkDialog } from "./external-link-dialog";
import { accelLabel, accelPressed } from "./platform-keys";

/**
 * The stage and the pill (#210). The frame takes the whole viewport it can and
 * never more than its authored size, the way a video player letterboxes, and
 * the only chrome left is one floating pill: restart, fullscreen, close. The
 * inspector rail, the session tape and the corner registration ticks are gone
 * — inline play made the canvas the place you read a prototype from, so the
 * player is the prototype and nothing else. Sleep is still the resting state:
 * stillness fades the pill and takes the cursor with it, movement wakes it.
 * Styling lives in the served document's chrome stylesheet; this component owns
 * structure and wiring.
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
	/** Whether this screen is a terminal frame (#44). */
	terminal(frame: string): boolean;
	restart(): void;
	dismissExternal(): void;
	close(): void;
}

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
	const { frame, arrival, externalHref } = controller.read();
	const { w, h } = controller.geometry(frame);
	const viewport = useViewport();
	const terminal = controller.terminal(frame);
	const Screen = frames[frame];
	// reading is stillness, and a dialog owns the moment it is up. A terminal
	// screen is another document, so the hand moving inside it is invisible from
	// here — the player never sleeps on a stillness it cannot actually see (#44).
	const { awake, wake } = useWake(!terminal && externalHref === null);
	const asleep = !coarsePointer && !awake;
	// the external-link dialog is modal: it owns the moment, chrome and all
	const blocked = externalHref !== null;
	const { scale, x, y } = place(w, h, viewport);
	const fullscreen = useFullscreen();

	// Spool's own gestures live behind accel, never on a plain key (#210): a live
	// frame keeps every ordinary key, its own esc for modals included. Focus is
	// usually inside the frame, so this only fires when the stage itself holds it
	// — what covers the rest is the runtime forwarding the same two chords.
	const { close, restart } = controller;
	const toggleFullscreen = fullscreen.toggle;
	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (!accelPressed(event) || event.altKey || event.shiftKey) return;
			if (event.key === "Escape") {
				event.preventDefault();
				close();
			} else if (event.key.toLowerCase() === "f") {
				event.preventDefault();
				toggleFullscreen();
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [close, toggleFullscreen]);

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
				<div className="spool-pill-dock" inert={blocked}>
					<div className="spool-pill">
						<span className="spool-pill-name">
							<span className="spool-dash" />
							{frame}
						</span>
						<span className="spool-pill-rule" />
						<span className="spool-pill-readout">
							{w} × {h} · {Math.round(scale * 100)}%
						</span>
						<span className="spool-pill-rule" />
						<PillButton id="spool-restart" label="Restart the session" disabled={blocked} onClick={restart}>
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
						</PillButton>
						<PillButton
							id="spool-fullscreen"
							label={fullscreen.on ? "Leave fullscreen" : "Fill the screen"}
							pressed={fullscreen.on}
							disabled={blocked}
							onClick={toggleFullscreen}
						>
							<path
								d={fullscreen.on ? "M6.5 2.5v4h-4M9.5 13.5v-4h4" : "M2.5 6.5v-4h4M13.5 9.5v4h-4"}
								fill="none"
								stroke="currentColor"
								strokeWidth="1.5"
								strokeLinecap="round"
								strokeLinejoin="round"
							/>
						</PillButton>
						<button
							type="button"
							id="spool-close"
							className="spool-pill-close"
							aria-label="Close the player"
							disabled={blocked}
							onClick={close}
						>
							<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
								<path
									d="M4 4 L12 12 M12 4 L4 12"
									fill="none"
									stroke="currentColor"
									strokeWidth="1.5"
									strokeLinecap="round"
								/>
							</svg>
							{`${accelLabel()}esc`}
						</button>
					</div>
				</div>
			)}
		</div>
	);
}

function PillButton({
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
			className={pressed === true ? "spool-pill-button is-on" : "spool-pill-button"}
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

/**
 * Filling the screen for real (#210), so a prototype reads the way it would if
 * you had opened it in your own browser. The request needs transient activation
 * and can be refused outright — a rejected promise is the browser saying no, not
 * an error the player has anything to add to.
 */
function useFullscreen(): { on: boolean; toggle: () => void } {
	const [on, setOn] = useState(() => document.fullscreenElement != null);
	useEffect(() => {
		const sync = () => setOn(document.fullscreenElement != null);
		document.addEventListener("fullscreenchange", sync);
		return () => document.removeEventListener("fullscreenchange", sync);
	}, []);
	const toggle = useCallback(() => {
		if (document.fullscreenElement != null) void document.exitFullscreen().catch(() => {});
		else void document.documentElement.requestFullscreen?.().catch(() => {});
	}, []);
	return { on, toggle };
}

/** Touch is the immersive context; anything with a fine pointer letterboxes. */
const coarsePointer = window.matchMedia("(pointer: coarse)").matches;

/**
 * Edge to edge, the way a video player letterboxes (#210): the frame takes the
 * whole viewport it can, never past its authored size, and whatever bars are
 * left are aspect mismatch and nothing else. `fitBox` is the canvas camera's
 * own fit, which is what lets an inline play flight land exactly here.
 */
function place(w: number, h: number, { vw, vh }: Viewport): Placement {
	return fitBox(w, h, vw, vh);
}
