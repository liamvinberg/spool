import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { fitBox } from "../../fit";
import { ExternalLinkDialog } from "../../runtime/external-link-dialog";
import { accelLabel } from "../../runtime/platform-keys";
import { createPlayerShell, type PlayerShell } from "../../runtime/player-shell-runtime";
import { useFullscreen, useViewport, useWake } from "../../runtime/player-stage";
import { fetchPlaySession, type PlaySession, type ProjectedFrame } from "../api";
import { cn } from "../cn";
import { PLAY_IN, PLAY_OUT } from "./play-flight";

/**
 * Inline play (#210): the canvas is the player's shell.
 *
 * The render-origin player document sits in a sandboxed iframe over the whole
 * viewport, mounted at exactly the geometry the camera flies to — `fitBox` is
 * the one fit both sides read, so the handoff cannot be a pixel out and nothing
 * has to cross-fade. Spool's own chrome stays in this document, where frame
 * code cannot reach it, which is the same reason the standalone `/play/` page
 * has a shell at all.
 *
 * The stage is held back so one beat of dimmed canvas shows on the way in, and
 * the pill arrives once nothing is moving.
 */

export type PlayPhase = "flying" | "live" | "leaving";

export interface PlayLayerProps {
	project: string;
	/** Where the session opens — the frame the press was on. */
	start: string;
	phase: PlayPhase;
	/** Live canvas geometry, pushed into the shell so a resize follows through. */
	frames: readonly ProjectedFrame[];
	/** The player walked: the canvas agrees, so exit flies out of this one. */
	onFrame: (frame: string) => void;
	/** A walk the session really took, for the flow graph's verified marks. */
	onWalked: (from: string, to: string) => void;
	/** The player is up and nothing is moving: the canvas may go back to its pictures. */
	onSettled: () => void;
	onExit: () => void;
}

export function PlayLayer({ project, start, phase, frames, onFrame, onWalked, onSettled, onExit }: PlayLayerProps) {
	const [session, setSession] = useState<PlaySession | undefined>(undefined);
	const [failure, setFailure] = useState<string | undefined>(undefined);
	const host = useRef<HTMLDivElement>(null);
	const iframe = useRef<HTMLIFrameElement>(null);
	const wake = useRef<() => void>(() => {});
	const fullscreenRef = useRef<{ on: boolean; toggle: () => void }>({ on: false, toggle: () => {} });
	const exit = useRef(onExit);
	exit.current = onExit;
	const walked = useRef(onWalked);
	walked.current = onWalked;

	// The session is asked for the instant the flight starts, never held: the
	// handoff on it is single-use and short-lived, and booting the player while
	// the camera is still moving is what hides the boot (#210).
	useEffect(() => {
		let live = true;
		void fetchPlaySession(project, start).then((next) => {
			if (!live) return;
			if (next === undefined) setFailure(`could not open a session on "${start}"`);
			else setSession(next);
		});
		return () => {
			live = false;
		};
	}, [project, start]);

	// The shell lives as long as the session it was built for, and no longer.
	// Everything it reaches out of itself for is a ref, so a re-render never
	// rebuilds it and a stale closure has nothing to be stale about.
	const shellRef = useRef<PlayerShell | undefined>(undefined);
	const [shell, setShell] = useState<PlayerShell | undefined>(undefined);
	useEffect(() => {
		if (session === undefined) {
			setShell(undefined);
			return;
		}
		const next = createPlayerShell(
			{
				project: session.project,
				start: session.start,
				frames: { ...session.frames },
				terminals: [...session.terminals],
				innerUrl: session.innerUrl,
			},
			{
				frame: () => iframe.current,
				close: () => exit.current(),
				walked: (from, to) => walked.current(from, to),
				wake: () => wake.current(),
				fullscreen: () => fullscreenRef.current.toggle(),
				// A spent handoff repairs by minting another (#88). Out here that is
				// a fresh session rather than a page reload — reloading the canvas to
				// fix the player would throw away the camera, the selection and the
				// walk it was in the middle of.
				repair: () => {
					setSession(undefined);
					void fetchPlaySession(project, start).then((renewed) => {
						if (renewed === undefined) setFailure("the player's handoff expired and could not be renewed");
						else setSession(renewed);
					});
					return true;
				},
				refreshGeometry: () => shellRef.current?.geometryReplay(),
			},
		);
		shellRef.current = next;
		setShell(next);
		return () => {
			next.destroy();
			shellRef.current = undefined;
			setShell(undefined);
		};
	}, [session, project, start]);

	// Geometry the canvas already holds, pushed rather than re-fetched: out here
	// the projection is live in this very component's props. The trigger is the
	// sizes themselves rather than the array, because the projection hands back
	// a fresh one on every poll and a revision the player has to acknowledge is
	// not free.
	const held = useRef(frames);
	held.current = frames;
	const sizes = frames.map((frame) => `${frame.name}:${frame.w}x${frame.h}`).join("\n");
	const revision = useRef(0);
	useEffect(() => {
		if (shell === undefined || sizes === "") return;
		const next = ++revision.current;
		shell.geometryPending(next);
		shell.geometryApplied(
			next,
			held.current.map((frame) => ({ name: frame.name, w: frame.w, h: frame.h })),
		);
	}, [shell, sizes]);

	useSyncExternalStore(shell?.controller.subscribe ?? noSubscribe, shell?.controller.version ?? zero);
	const read = shell?.controller.read();
	const frame = read?.frame ?? start;
	const view = shell?.view();
	const { w, h } = shell?.controller.geometry(frame) ?? sizeOf(frames, frame);

	// The canvas is told where the player stands, so leaving flies out of the
	// frame the walk ended on rather than the one it started from.
	const reported = useRef(start);
	useEffect(() => {
		if (reported.current === frame) return;
		reported.current = frame;
		onFrame(frame);
	}, [frame, onFrame]);

	// The stage is held back whether or not the boot was quick (#210): the beat
	// of dimmed canvas on the way in is the point of the delay, and a cached
	// player that appeared instantly would skip it and pop the pill mid-flight.
	const [due, setDue] = useState(false);
	useEffect(() => {
		const held = window.setTimeout(() => setDue(true), PLAY_IN.stageAt);
		return () => window.clearTimeout(held);
	}, []);

	const revealed = view !== undefined && !view.hidden;
	const settled = useRef(false);
	useEffect(() => {
		if (!revealed || settled.current) return;
		settled.current = true;
		// The player owns the keyboard from the moment it is up, so a prototype's
		// own keys reach it rather than the canvas the press came from.
		iframe.current?.focus({ preventScroll: true });
		onSettled();
	}, [revealed, onSettled]);

	const viewport = useViewport();
	const place = fitBox(w, h, viewport.vw, viewport.vh);
	const leaving = phase === "leaving";
	// The stage waits for the player as well as for the clock: covering the
	// canvas before the player can be seen would leave a beat of nothing where
	// the frame is meant to be.
	const staged = !leaving && due && (revealed || failure !== undefined);
	const { awake, wake: stir } = useWake(staged && failure === undefined);
	wake.current = stir;
	const blocked = read?.externalHref != null;
	const fullscreen = useFullscreen(() => host.current);
	fullscreenRef.current = fullscreen;
	const dismissExternal = shell?.controller.dismissExternal;

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: waking is ambient, not an affordance — the stage is the room, never a control
		<div
			ref={host}
			className="fixed inset-0 z-50"
			style={{ pointerEvents: staged ? "auto" : "none" }}
			onMouseMove={stir}
		>
			<div
				className="absolute inset-0 bg-bg transition-opacity ease-out"
				style={{
					opacity: staged ? 1 : 0,
					transitionDuration: `${leaving ? PLAY_OUT.stage : PLAY_IN.stage}ms`,
					transitionDelay: `${leaving ? PLAY_OUT.stageAt : 0}ms`,
				}}
			/>
			{session !== undefined && (
				<iframe
					ref={iframe}
					title={project}
					sandbox="allow-scripts"
					src={session.innerUrl}
					onLoad={() => shellRef.current?.loaded()}
					// Hidden by opacity, never visibility: headed Chromium render-throttles
					// a visibility-hidden cross-origin iframe, which starves the runtime's
					// animation-frame gates and deadlocks the reveal it is hiding for (#185).
					inert={!staged}
					className="absolute top-0 left-0 origin-top-left border-0"
					style={{
						width: w,
						height: h,
						transform: `translate(${place.x}px, ${place.y}px) scale(${place.scale})`,
						opacity: staged && view?.loadError === undefined ? 1 : 0,
					}}
				/>
			)}
			{/* A prototype's outward link is confirmed above the screen it was on,
			    the same dialog the standalone player puts there. It is modal: while
			    it is up the pill is gone and the player takes no press. */}
			{blocked && staged && read?.externalHref != null && dismissExternal !== undefined && (
				<ExternalLinkDialog href={read.externalHref} onStay={dismissExternal} onOpen={dismissExternal} />
			)}
			{(failure ?? view?.loadError) !== undefined && staged && (
				<div
					className="absolute inset-x-0 top-1/2 mx-auto max-w-[560px] -translate-y-1/2 px-6 font-mono text-muted text-sm leading-sm"
					role="alert"
				>
					<p className="mb-3 text-thread">player failed to load</p>
					<pre className="m-0 whitespace-pre-wrap break-words">{failure ?? view?.loadError}</pre>
				</div>
			)}
			<Pill
				frame={frame}
				w={w}
				h={h}
				scale={place.scale}
				phase={phase}
				visible={staged && awake && !blocked}
				onRestart={shell?.controller.restart}
				fullscreen={fullscreen.on}
				onFullscreen={fullscreen.toggle}
				onClose={onExit}
			/>
		</div>
	);
}

function Pill({
	frame,
	w,
	h,
	scale,
	phase,
	visible,
	onRestart,
	fullscreen,
	onFullscreen,
	onClose,
}: {
	frame: string;
	w: number;
	h: number;
	scale: number;
	phase: PlayPhase;
	visible: boolean;
	onRestart: (() => void) | undefined;
	fullscreen: boolean;
	onFullscreen: () => void;
	onClose: () => void;
}) {
	const leaving = phase === "leaving";
	return (
		<div
			className="pointer-events-none absolute inset-x-0 bottom-7 flex justify-center transition-opacity ease-out"
			style={{
				opacity: visible ? 1 : 0,
				transitionDuration: `${leaving ? PLAY_OUT.pill : PLAY_IN.pill}ms`,
				transitionDelay: `${leaving ? 0 : PLAY_IN.pillAt - PLAY_IN.stageAt}ms`,
			}}
		>
			<div
				className={cn(
					"flex h-9 items-center gap-3.5 rounded-lg border border-border-raised bg-raised px-3.5",
					visible ? "pointer-events-auto" : "pointer-events-none",
				)}
			>
				<span className="flex items-center gap-2 font-mono text-sm leading-sm">
					<span className="h-[2px] w-2 bg-thread" />
					{frame}
				</span>
				<span className="h-3 w-px bg-border-raised" />
				<span className="font-mono text-2xs text-muted leading-3">
					{w} × {h} · {Math.round(scale * 100)}%
				</span>
				<span className="h-3 w-px bg-border-raised" />
				<button
					type="button"
					aria-label="Restart the session"
					disabled={onRestart === undefined}
					onClick={onRestart}
					className="flex cursor-pointer items-center text-muted transition-colors hover:text-text disabled:cursor-default disabled:opacity-40"
				>
					<svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
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
					</svg>
				</button>
				<button
					type="button"
					aria-label={fullscreen ? "Leave fullscreen" : "Fill the screen"}
					aria-pressed={fullscreen}
					onClick={onFullscreen}
					className={cn(
						"flex cursor-pointer items-center transition-colors hover:text-text",
						fullscreen ? "text-text" : "text-muted",
					)}
				>
					<svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
						<path
							d={fullscreen ? "M6.5 2.5v4h-4M9.5 13.5v-4h4" : "M2.5 6.5v-4h4M13.5 9.5v4h-4"}
							fill="none"
							stroke="currentColor"
							strokeWidth="1.5"
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
					</svg>
				</button>
				<button
					type="button"
					aria-label="Close the player"
					onClick={onClose}
					className="flex cursor-pointer items-center gap-1.5 font-mono text-2xs text-muted leading-3 transition-colors hover:text-text"
				>
					<svg
						viewBox="0 0 10 10"
						className="h-2.5 w-2.5"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.5"
						aria-hidden="true"
					>
						<path d="M2 2 8 8M8 2 2 8" />
					</svg>
					{`${accelLabel()}esc`}
				</button>
			</div>
		</div>
	);
}

const noSubscribe = () => () => {};
const zero = () => 0;

function sizeOf(frames: readonly ProjectedFrame[], name: string): { w: number; h: number } {
	const frame = frames.find((candidate) => candidate.name === name);
	return frame === undefined ? { w: 390, h: 844 } : { w: frame.w, h: frame.h };
}
