import type { ComponentType, ReactNode } from "react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ExternalLinkDialog } from "./external-link-dialog";
import { accelChord, accelLabel } from "./platform-keys";
import {
	barLayout,
	DESK_BAR_PX,
	DESK_RESTORED_MS,
	type DeskWindow,
	deskWindow,
	readBarHidden,
	usePeek,
	useViewport,
	writeBarHidden,
} from "./player-page";

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
 * The only chrome is the bar along the top, the same 30px the Mac app's window
 * wears: back to canvas, the frame switcher, the window's size, and close. In a
 * tab it can be put away with the eye on it, and a nub at the top edge is then
 * its trace — rest the cursor there and it peeks back in, press the nub and it
 * stays. Styling lives in the served document's chrome stylesheet; this
 * component owns structure and wiring.
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
	/**
	 * Walk to another screen because the reader asked spool rather than the
	 * prototype: the switcher's press, and the browser's own back and forward.
	 * `back` is a step back through the walk, so it plays as one.
	 */
	walk(frame: string, back?: boolean): void;
	dismissExternal(): void;
	close(): void;
}

export function Player({
	project,
	frames,
	controller,
	host,
	loading = false,
	canvasHref,
	onInset,
}: {
	project: string;
	frames: Record<string, ComponentType>;
	controller: PlayerController;
	/** A control-origin native iframe host in the standalone player shell. */
	host?: ReactNode;
	/** The screen is still on its way — the shell's iframe has not been revealed yet. */
	loading?: boolean;
	/** Where the canvas lives, when this document can reach it. */
	canvasHref?: string;
	/**
	 * How much of the window the bar stands in front of, told to whoever sizes
	 * the frame's box. The bare document needs no telling: its screen is laid
	 * out under the bar by the page itself.
	 */
	onInset?: (px: number) => void;
}) {
	useSyncExternalStore(controller.subscribe, controller.version);
	const { frame, arrival, externalHref } = controller.read();
	const { w } = controller.geometry(frame);
	const viewport = useViewport();
	const Screen = frames[frame];
	const [picking, setPicking] = useState(false);
	// Which shell this document is in, asked once: a window the app made and
	// handed a bridge draws the bar it was sized for, and everything else is the
	// tab #227 designed. It cannot change under a live document, so it is read at
	// mount and never again.
	const [desk] = useState(deskWindow);
	// Whether the tab's bar is put away, remembered across tabs. The app's bar is
	// the window's title bar and is never put away.
	const [hidden, setHidden] = useState(readBarHidden);
	const hide = (next: boolean) => {
		writeBarHidden(next);
		setHidden(next);
	};
	// the external-link dialog is modal: it owns the moment, chrome and all
	const blocked = externalHref !== null;
	const { peeked, enter, leave } = usePeek(desk === null && hidden && !blocked);
	// A bar that went away takes its open switcher with it.
	const worn = desk !== null || !hidden || peeked;
	useEffect(() => {
		if (!worn) setPicking(false);
	}, [worn]);

	usePlayedUrl(project, frame, controller);

	// Spool's own gesture lives behind accel, never on a plain key: a live frame
	// keeps every ordinary key, its own esc for modals included. ⌘W is the exit
	// this tab already has; this is the same exit for the hand already on esc.
	// A tab closes itself; a window the app owns is the app's to close, and asking
	// it is the only exit that also forgets nothing it should have kept.
	const close = desk === null ? controller.close : desk.close;
	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (accelChord(event) === undefined) return;
			event.preventDefault();
			close();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [close]);

	// The page is inset by the bar it wears. A peek is over the page, not above
	// it: the frame does not jump for a hover.
	const inset = desk !== null || !hidden;
	useEffect(() => {
		onInset?.(inset ? DESK_BAR_PX : 0);
	}, [inset, onInset]);
	const bar = (
		<TopBar
			project={project}
			frame={frame}
			frames={controller.frames()}
			viewport={viewport}
			picking={picking}
			onPicking={setPicking}
			onWalk={controller.walk}
			loading={loading}
			{...(desk === null
				? {
						hidden,
						away: hidden && !peeked,
						onHide: hide,
						onClose: close,
						...(canvasHref === undefined ? {} : { canvasHref }),
					}
				: { desk })}
		/>
	);

	return (
		<div className={inset ? "spool-page has-bar" : "spool-page"}>
			<div
				className="spool-screen"
				// The one number spool imposes: the authored width as a cap, and the
				// real viewport below it. Written here rather than left to `max-width`
				// so the shell's iframe is exactly the box the runtime inside it will
				// measure, which is what the geometry handshake compares against.
				style={{ width: Math.min(viewport.vw, w) }}
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
			{desk === null && hidden ? (
				// The strip the put-away bar left behind. The bar is inside it, so the
				// browser's own hover says when the hand is on either: nothing crosses
				// the frame boundary, and moving down into the page is what leaves.
				// biome-ignore lint/a11y/noStaticElementInteractions: the strip is where the bar was, not a control; the nub inside it is the control
				<div className={peeked ? "spool-peek is-open" : "spool-peek"} onMouseEnter={enter} onMouseLeave={leave}>
					<button type="button" className="spool-nub" aria-label="Show the bar" onClick={() => hide(false)} />
					{bar}
				</div>
			) : (
				bar
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
	/** Where in the pushed history this page stands, so a pop can be told from a press. */
	const index = useRef(0);
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
		if (!first) index.current += 1;
		const state = { spool: "play", frame, index: index.current };
		if (first) window.history.replaceState(state, "", url);
		else window.history.pushState(state, "", url);
	}, [frame, project]);

	useEffect(() => {
		const onPop = (event: PopStateEvent) => {
			const state = event.state as { spool?: unknown; frame?: unknown; index?: unknown } | null;
			const named = state?.spool === "play" && typeof state.frame === "string" ? state.frame : undefined;
			const to = named ?? new URL(window.location.href).searchParams.get("frame");
			const here = controller.read().frame;
			if (to === null || to === here) return;
			// A screen the composition no longer has cannot be walked to, and an
			// address bar naming a frame the page is not showing is a lie: put the
			// entry back on where the session really stands.
			if (!controller.frames().includes(to)) {
				const url = new URL(window.location.href);
				url.searchParams.set("frame", here);
				window.history.replaceState({ spool: "play", frame: here, index: index.current }, "", url);
				return;
			}
			const at = typeof state?.index === "number" ? state.index : index.current;
			const back = at < index.current;
			index.current = at;
			popped.current = to;
			controller.walk(to, back);
		};
		window.addEventListener("popstate", onPop);
		return () => window.removeEventListener("popstate", onPop);
	}, [controller]);
}

/**
 * The name of the screen, and the way to another one. Written once because two
 * surfaces draw it: the tab's summoned edge bar, and the bar the Mac app's
 * window wears. The picker hangs off this rather than off either bar, so it
 * lines up under the name on both.
 */
function FrameSwitcher({
	project,
	frame,
	frames,
	picking,
	onPicking,
	onWalk,
}: {
	/** Dropped when the bar is too narrow to carry it; the name never is. */
	project?: string | undefined;
	frame: string;
	frames: string[];
	picking: boolean;
	onPicking: (picking: boolean) => void;
	onWalk: (frame: string) => void;
}) {
	return (
		<span className="spool-bar-switcher">
			<button
				type="button"
				id="spool-switcher"
				className="spool-bar-frame"
				aria-expanded={picking}
				aria-controls="spool-frames"
				onClick={() => onPicking(!picking)}
			>
				{project !== undefined && <span className="spool-bar-project">{project} /</span>}
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
			<span id="spool-frames" className={picking ? "spool-picker is-open" : "spool-picker"} inert={!picking}>
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
	);
}

function CloseButton({ label, onClose }: { label: string; onClose: () => void }) {
	return (
		<button type="button" id="spool-close" className="spool-bar-icon" aria-label={label} onClick={onClose}>
			<svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">
				<path d="M2 2 8 8M8 2 2 8" fill="none" stroke="currentColor" strokeWidth="1.5" />
			</svg>
		</button>
	);
}

/**
 * The bar along the top (#275, #227), one strip drawn for two shells.
 *
 * In the Mac app's play window it is the title bar: the window has none of its
 * own — `titleBarStyle: "hiddenInset"`, the traffic lights inset into this
 * strip — so these 30px are spent, always, and in exchange nothing has to be
 * summoned: the frame's name is readable, the switcher is one press away, and
 * the window says how big it is. Back to the canvas raises the window that is
 * still standing behind this one; a restore says so once, with the door back
 * beside it, because a person who does not remember moving this window last
 * week needs to know why it is not the width the frame was authored at.
 *
 * In a tab it is the same strip, worn for the same reasons, with what only a
 * tab needs: back to the canvas is a link, the exit chord is printed, and the
 * eye puts the bar away for a reader who wants the prototype and nothing else.
 *
 * Below {@link DESK_BAR_WIDE_PX} it drops the project prefix, the word on the
 * canvas button and the size readout. A phone frame's window is 390 wide and
 * the frame's name is the only thing in there worth its space.
 */
function TopBar({
	project,
	frame,
	frames,
	viewport,
	picking,
	onPicking,
	onWalk,
	loading,
	desk,
	hidden,
	away,
	onHide,
	onClose,
	canvasHref,
}: {
	project: string;
	frame: string;
	frames: string[];
	viewport: { vw: number; vh: number };
	picking: boolean;
	onPicking: (picking: boolean) => void;
	onWalk: (frame: string) => void;
	/** The frame is being compiled or fetched: said in the bar, since the screen has nothing to show yet. */
	loading: boolean;
	/** The app's window, when this is its title bar. */
	desk?: DeskWindow;
	/** Tab only: whether the bar is put away, so the eye knows which way it faces. */
	hidden?: boolean;
	/** Tab only: put away and not peeking, so it is out of reach as well as out of sight. */
	away?: boolean;
	onHide?: (hidden: boolean) => void;
	onClose?: () => void;
	canvasHref?: string;
}) {
	const layout = barLayout(viewport.vw);
	// Said once and then gone, the way a toast is; pressing reset ends it early
	// because the thing it was announcing has just been undone.
	const [restored, setRestored] = useState(desk?.restored ?? false);
	useEffect(() => {
		if (!restored) return;
		const timer = window.setTimeout(() => setRestored(false), DESK_RESTORED_MS);
		return () => window.clearTimeout(timer);
	}, [restored]);
	return (
		<div
			className={["spool-top", desk === undefined ? "" : "is-desk", away === true ? "is-away" : ""].join(" ").trim()}
			style={{ height: DESK_BAR_PX }}
			inert={away === true}
		>
			{desk !== undefined ? (
				<button type="button" className="spool-bar-back" aria-label="Back to the canvas" onClick={desk.canvas}>
					<BackChevron />
					{layout.canvasLabel && "canvas"}
				</button>
			) : (
				canvasHref !== undefined && (
					<a className="spool-bar-back" aria-label="Back to the canvas" href={canvasHref}>
						<BackChevron />
						{layout.canvasLabel && "canvas"}
					</a>
				)
			)}
			{(desk !== undefined || canvasHref !== undefined) && <span className="spool-bar-rule" />}
			<FrameSwitcher
				frame={frame}
				frames={frames}
				picking={picking}
				onPicking={onPicking}
				onWalk={onWalk}
				{...(layout.project ? { project } : {})}
			/>
			<span className="spool-bar-end">
				{loading && (
					<span className="spool-bar-hint spool-bar-loading" role="status">
						loading
					</span>
				)}
				{restored && desk !== undefined && (
					<span className="spool-desk-restored">
						<span className="spool-dash is-lit" />
						restored
						<button
							type="button"
							className="spool-desk-reset"
							onClick={() => {
								setRestored(false);
								desk.reset();
							}}
						>
							reset
						</button>
						<span className="spool-bar-rule" />
					</span>
				)}
				{layout.size && (
					<span className="spool-bar-hint">
						{viewport.vw} × {viewport.vh}
					</span>
				)}
				{desk === undefined && layout.size && <span className="spool-bar-hint">{exitHint} exits</span>}
				{desk === undefined && onHide !== undefined && (
					<>
						<span className="spool-bar-rule" />
						<button
							type="button"
							id="spool-bar-eye"
							className="spool-bar-icon"
							aria-label={hidden === true ? "Keep the bar" : "Hide the bar"}
							aria-pressed={hidden === true}
							onClick={() => onHide(hidden !== true)}
						>
							<Eye shut={hidden === true} />
						</button>
					</>
				)}
				<span className="spool-bar-rule" />
				<CloseButton
					label={desk !== undefined ? "Close the window" : "Close the tab"}
					onClose={desk !== undefined ? desk.close : (onClose ?? (() => {}))}
				/>
			</span>
		</div>
	);
}

function BackChevron() {
	return (
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
	);
}

/** An eye, open when the bar is worn and shut when it is put away. */
function Eye({ shut }: { shut: boolean }) {
	return (
		<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
			{shut ? (
				<>
					<path
						d="M1.5 9c1.6 2.3 3.9 3.5 6.5 3.5S12.9 11.3 14.5 9"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.4"
						strokeLinecap="round"
					/>
					<path
						d="m3.5 11-1 1.5M8 12.5V14m4.5-3 1 1.5"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.4"
						strokeLinecap="round"
					/>
				</>
			) : (
				<>
					<path
						d="M1.5 8c1.6-2.7 3.9-4 6.5-4s4.9 1.3 6.5 4c-1.6 2.7-3.9 4-6.5 4S3.1 10.7 1.5 8Z"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.4"
						strokeLinejoin="round"
					/>
					<circle cx="8" cy="8" r="1.8" fill="none" stroke="currentColor" strokeWidth="1.4" />
				</>
			)}
		</svg>
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

/** How this platform closes a tab, printed on the bar so nothing has to be taught. */
const exitHint = `${accelLabel()}w`;
