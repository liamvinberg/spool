import type { ComponentType, ReactNode } from "react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { accelChord } from "./accel-chord";
import { ExternalLinkDialog } from "./external-link-dialog";
import { accelLabel } from "./platform-keys";
import {
	barLayout,
	DESK_BAR_PX,
	DESK_RESIZE_MS,
	DESK_RESTORED_MS,
	type DeskWindow,
	deskWindow,
	useViewport,
	type Viewport,
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
 * wears: the frame's name, copy link and close, and the window's size while it
 * is being resized. It is always worn: at 30px it costs less than a page's own
 * nav, and a bar that can be put away is a way home that can be lost. Styling
 * lives in the served document's chrome stylesheet; this component owns
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
	closeLabel = "Close the tab",
	exitKey = EXIT_KEY,
	linkable = false,
}: {
	project: string;
	frames: Record<string, ComponentType>;
	controller: PlayerController;
	/** A control-origin native iframe host in the standalone player shell. */
	host?: ReactNode;
	/** The screen is still on its way — the shell's iframe has not been revealed yet. */
	loading?: boolean;
	/** What leaving is called: a tab closes, and the read-only canvas in a browser goes back to the canvas. */
	closeLabel?: string;
	/** The key the bar says leaves: the tab's own close, or esc where the player stands over a page. */
	exitKey?: string;
	/** Whether the bar copies the address of the screen on show, for an address someone else can open. */
	linkable?: boolean;
}) {
	useSyncExternalStore(controller.subscribe, controller.version);
	const { frame, arrival, externalHref } = controller.read();
	const { w } = controller.geometry(frame);
	const viewport = useViewport();
	const Screen = frames[frame];
	// Which shell this document is in, asked once: a window the app made and
	// handed a bridge draws the bar it was sized for, and everything else is the
	// tab #227 designed. It cannot change under a live document, so it is read at
	// mount and never again.
	const [desk] = useState(deskWindow);

	usePlayedUrl(project, frame, controller);

	// Spool's own gesture lives behind accel, never on a plain key: a live frame
	// keeps every ordinary key, its own esc for modals included. ⌘W is the exit
	// this tab already has; this is the same exit for the hand already on esc.
	// A tab closes itself; a window the app owns is the app's to close, and asking
	// it is the only exit that also forgets nothing it should have kept.
	const close = controller.close;
	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (accelChord(event) === undefined) return;
			event.preventDefault();
			close();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [close]);

	const bar = (
		<TopBar
			project={project}
			frame={frame}
			viewport={viewport}
			loading={loading}
			{...(desk === null ? { onClose: close, closeLabel, exitKey, linkable } : { desk })}
		/>
	);

	return (
		<div className="spool-page has-bar">
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
			{bar}
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

/** Close, with the key that does the same in its tooltip rather than printed on the bar. */
function CloseButton({ label, chord, onClose }: { label: string; chord: string; onClose: () => void }) {
	return (
		<span className="spool-bar-tipped">
			<button type="button" id="spool-close" className="spool-bar-icon" aria-label={label} onClick={onClose}>
				<svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">
					<path d="M2 2 8 8M8 2 2 8" fill="none" stroke="currentColor" strokeWidth="1.5" />
				</svg>
			</button>
			<Tip label={label} chord={chord} />
		</span>
	);
}

/**
 * A control's name under it on hover or keyboard focus, after a beat, with its
 * key when it has one. Decoration only: the control carries its own label.
 */
function Tip({ label, chord }: { label: string; chord?: string }) {
	return (
		<span className="spool-bar-tip" aria-hidden="true">
			{label}
			{chord !== undefined && <kbd>{chord}</kbd>}
		</span>
	);
}

/**
 * The bar along the top (#275, #227), one strip drawn for two shells.
 *
 * In the Mac app's play window it is the title bar: the window has none of its
 * own — `titleBarStyle: "hiddenInset"`, the traffic lights inset into this
 * strip — so these 30px are spent, always. Back to the canvas raises the
 * window that is still standing behind this one; a restore says so once, with
 * the door back beside it, because a person who does not remember moving this
 * window last week needs to know why it is not the width the frame was
 * authored at.
 *
 * In a tab it is the same strip with what only a tab needs: copy link, and
 * close, whose tooltip names the key that does the same.
 *
 * The frame's name is the only thing on the left. The window's size is said in
 * the middle while the window is being resized, and goes once it settles: it is
 * an answer to "how wide is this now", which nobody asks of a still window.
 * Below {@link DESK_BAR_WIDE_PX} the project prefix and the size go too: a phone
 * frame's window is 390 wide and the frame's name is the only thing in there
 * worth its space.
 */
function TopBar({
	project,
	frame,
	viewport,
	loading,
	desk,
	onClose,
	closeLabel = "Close the tab",
	exitKey = EXIT_KEY,
	linkable = false,
}: {
	project: string;
	frame: string;
	viewport: Viewport;
	/** The frame is being compiled or fetched: said in the bar, since the screen has nothing to show yet. */
	loading: boolean;
	/** The app's window, when this is its title bar. */
	desk?: DeskWindow;
	onClose?: () => void;
	closeLabel?: string;
	exitKey?: string;
	linkable?: boolean;
}) {
	const layout = barLayout(viewport.vw);
	const resizing = useResizing(viewport);
	// Said once and then gone, the way a toast is; pressing reset ends it early
	// because the thing it was announcing has just been undone.
	const [restored, setRestored] = useState(desk?.restored ?? false);
	useEffect(() => {
		if (!restored) return;
		const timer = window.setTimeout(() => setRestored(false), DESK_RESTORED_MS);
		return () => window.clearTimeout(timer);
	}, [restored]);
	return (
		<div className={desk === undefined ? "spool-top" : "spool-top is-desk"} style={{ height: DESK_BAR_PX }}>
			<span className="spool-bar-title">
				{layout.project && <span className="spool-bar-project">{project} /</span>}
				<span className="spool-bar-name">{frame}</span>
			</span>
			{layout.size && (
				<span className={resizing ? "spool-bar-size is-on" : "spool-bar-size"} aria-hidden={!resizing}>
					{viewport.vw} × {viewport.vh}
				</span>
			)}
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
					</span>
				)}
				{desk === undefined && linkable && <CopyLinkButton />}
				{desk === undefined && <CloseButton label={closeLabel} chord={exitKey} onClose={onClose ?? (() => {})} />}
			</span>
		</div>
	);
}

/**
 * Whether the window is being resized: true from a change of size until it has
 * held still for {@link DESK_RESIZE_MS}. The size the bar mounts at is not a
 * resize, so a window opened at any size says nothing.
 */
function useResizing({ vw, vh }: Viewport): boolean {
	const [resizing, setResizing] = useState(false);
	const first = useRef(`${vw}x${vh}`);
	useEffect(() => {
		if (first.current === `${vw}x${vh}`) return;
		first.current = "";
		setResizing(true);
		const timer = window.setTimeout(() => setResizing(false), DESK_RESIZE_MS);
		return () => window.clearTimeout(timer);
	}, [vw, vh]);
	return resizing;
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
const EXIT_KEY = `${accelLabel()}w`;

/** How long the bar says the link was copied. */
const COPIED_MS = 1600;

/** Copy the address of the screen on show: the address bar's, which names it. */
function CopyLinkButton() {
	const [copied, setCopied] = useState(false);
	useEffect(() => {
		if (!copied) return;
		const timer = setTimeout(() => setCopied(false), COPIED_MS);
		return () => clearTimeout(timer);
	}, [copied]);
	return (
		<span className="spool-bar-tipped">
			<button
				type="button"
				className="spool-bar-icon spool-bar-copy"
				aria-label="Copy link to this screen"
				onClick={() => {
					void navigator.clipboard?.writeText(window.location.href).then(
						() => setCopied(true),
						() => {},
					);
				}}
			>
				{copied ? <span className="spool-bar-hint">copied</span> : <LinkGlyph />}
			</button>
			{!copied && <Tip label="Copy link" />}
		</span>
	);
}

/** Two links of a chain: the address of what is on show. */
function LinkGlyph() {
	return (
		<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
			<path
				d="M6.8 9.2a2.6 2.6 0 0 0 3.7 0l2.2-2.2a2.6 2.6 0 0 0-3.7-3.7l-.9.9M9.2 6.8a2.6 2.6 0 0 0-3.7 0L3.3 9a2.6 2.6 0 0 0 3.7 3.7l.9-.9"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.4"
				strokeLinecap="round"
			/>
		</svg>
	);
}
