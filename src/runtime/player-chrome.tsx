import type { ComponentType, ReactNode } from "react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { accelChord } from "./accel-chord";
import { ExternalLinkDialog } from "./external-link-dialog";
import { accelLabel } from "./platform-keys";
import { fittedScale, type PlayerSize, playRoom } from "./player-fit";
import { barLayout, DESK_BAR_PX, DESK_RESTORED_MS, type DeskWindow, useViewport, type Viewport } from "./player-page";
import type { PlayerRecorder } from "./player-recorder";
import { SizeDesk, SizeGrips, SizeMenu, useSizing } from "./player-size";
import { CLIP_ASPECTS, type ClipAspect, RECORD_WARN_MS } from "./record-protocol";

/**
 * The played page (#227). Play opens a browser tab, so the frame stops being a
 * scaled picture and becomes a document the browser owns: it lays out at the
 * real viewport width, capped at its authored `w` as a max-width, and its
 * height is whatever its content is. Below the cap the frame's own breakpoints
 * fire and its own padding compresses; a frame that makes no accommodation
 * overflows the way that site would in production. That is responsive, and it
 * is how the bare player plays. A player that can choose the size plays a frame
 * at its authored size instead (spool#553, spool#263), centred, and shrunk where
 * the window is smaller; or at the window's size, a device's, or one pulled by
 * hand (spool#264). The bar's middle says the size and opens the list of them,
 * and the frame's edges pull.
 *
 * The only chrome is the bar along the top, the same 30px the Mac app's window
 * wears: the frame's name, the size it plays at, copy link and close. It is
 * always worn: at 30px it costs less than a page's own
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
	/** Leave the player. Absent, it cannot be left from inside: the bar has no close and the chord does nothing. */
	close?(): void;
	/** The size frames play at, where this player can choose it: absent, a frame is always played responsive. */
	size?: PlayerSize;
}

/** What a player that cannot choose a size is held at: nothing, so nothing is laid or kept. */
const UNSIZED: PlayerSize = {
	held: () => ({ id: "drawn", size: { w: 1, h: 1 } }),
	authored: () => ({ w: 1, h: 1 }),
	hold: () => {},
	lay: () => {},
};

/** A frame as the player's bar names it: the place it is in, when it says one, and its name there. */
export interface FrameSaid {
	place: string | null;
	name: string;
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
	recorder,
	shaped,
	desk,
	bar: worn = true,
	said = (frame) => ({ place: project, name: frame }),
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
	/** Record (spool#221), where the shell can and the experiment is on. */
	recorder?: PlayerRecorder;
	/** Whether the frame is played at a clip's shape, in a box of its own rather than the window's. */
	shaped?: () => boolean;
	/**
	 * The Mac app's play window (#275), when this document is its page: the bar is then its title bar, sized for
	 * it, and everything else is the tab #227 designed. It cannot change under a live document.
	 */
	desk?: DeskWindow | undefined;
	/**
	 * Whether the bar is worn. Without it there is no size to choose and no edge to pull: the frame fills the window,
	 * as an exported file plays on a touch screen (spool#304).
	 */
	bar?: boolean;
	/**
	 * How the bar and the tab name a frame: in the project by its whole path, unless the one playing it sees less
	 * of the project (an outsider on a share, spool#230), whose bar says the page holding it at most.
	 */
	said?: (frame: string) => FrameSaid;
}) {
	useSyncExternalStore(controller.subscribe, controller.version);
	useSyncExternalStore(recorder?.subscribe ?? noSubscription, recorder?.version ?? noVersion);
	const { frame, arrival, externalHref } = controller.read();
	const { w, h } = controller.geometry(frame);
	const boxed = shaped?.() === true;
	const recording = recorder?.view().kind === "recording";
	const viewport = useViewport();
	const room = playRoom(viewport, worn);
	// a frame played at a clip's shape has a box of its own, with no size to choose
	const size = boxed ? undefined : controller.size;
	const scale = size === undefined ? 1 : fittedScale({ w, h }, room);
	const drawn = { w: w * scale, h: h * scale };
	// a narrow window keeps the readout, the one way to the list, without its word, and has no desk to pull on
	const narrow = !barLayout(viewport.vw).word;
	const sizing = useSizing(controller.size ?? UNSIZED, frame, room, drawn, scale, narrow);
	const Screen = frames[frame];

	const named = said(frame);
	usePlayedUrl(named.place === null ? named.name : `${named.name} · ${named.place}`, frame, controller);

	// Spool's own gesture lives behind accel, never on a plain key: a live frame
	// keeps every ordinary key, its own esc for modals included. ⌘W is the exit
	// this tab already has; this is the same exit for the hand already on esc.
	// A tab closes itself; a window the app owns is the app's to close, and asking
	// it is the only exit that also forgets nothing it should have kept.
	const close = controller.close;
	useEffect(() => {
		if (close === undefined) return;
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
			said={named}
			viewport={viewport}
			loading={loading}
			{...(size === undefined
				? {}
				: {
						middle: (
							<SizeMenu
								sizing={sizing}
								laid={{ w, h }}
								scale={scale}
								quiet={sizing.pulling}
								tip={<Tip label="Play it at another size" />}
							/>
						),
					})}
			{...(recorder === undefined ? {} : { recorder })}
			{...(desk === undefined
				? { ...(close === undefined ? {} : { onClose: close }), closeLabel, exitKey, linkable }
				: { desk })}
		/>
	);

	const screen = (
		<div
			className={[
				"spool-screen",
				...(host === undefined ? [] : ["is-hosted"]),
				...(boxed ? ["is-shaped"] : []),
				...(boxed && recording ? ["is-recording"] : []),
			].join(" ")}
			// Responsive, the authored width as a cap and the real viewport below it.
			// Written here rather than left to `max-width` so the shell's iframe is
			// exactly the box the runtime inside it will measure, which is what the
			// geometry handshake compares against. A frame played at a clip's shape
			// gets its height too, centred, and a sized one its whole box, drawn
			// smaller: a scale is the one thing the frame's viewport never sees.
			style={
				boxed
					? { width: w, height: h }
					: size !== undefined
						? {
								width: w,
								height: h,
								minHeight: 0,
								...(scale < 1
									? { transform: `scale(${scale})`, transformOrigin: "0 0", "--spool-scale": scale }
									: {}),
							}
						: { width: Math.min(viewport.vw, w) }
			}
		>
			{host ?? (Screen === undefined ? null : <Screen key={arrival} />)}
		</div>
	);

	const pulled = worn && size !== undefined && !narrow;
	const page = worn ? "spool-page has-bar" : "spool-page";
	return (
		<div
			className={sizing.pulling && pulled ? `${page} is-pulling` : page}
			style={sizing.pulling && pulled ? { cursor: sizing.cursor } : undefined}
		>
			{pulled && <SizeDesk sizing={sizing} drawn={drawn} />}
			{/* the room the shrunk frame takes, so the page centres it and never scrolls past it; worn by every frame
			    and only sized when sized, since a screen that moved in the tree would reload the frame inside it */}
			<div
				className={
					size === undefined
						? "spool-fitted is-off"
						: sizing.filling
							? "spool-fitted"
							: sizing.grip?.hit === true
								? "spool-fitted is-ringed is-hot"
								: "spool-fitted is-ringed"
				}
				style={size === undefined ? undefined : { width: drawn.w, height: drawn.h }}
			>
				{screen}
			</div>
			{pulled && <SizeGrips sizing={sizing} drawn={drawn} />}
			{externalHref !== null && (
				<ExternalLinkDialog
					href={externalHref}
					onStay={controller.dismissExternal}
					onOpen={controller.dismissExternal}
				/>
			)}
			{worn && bar}
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
function usePlayedUrl(title: string, frame: string, controller: PlayerController): void {
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
		document.title = title;
		// A popped entry is already the address bar's; pushing over it would bury
		// the entry the reader just stepped back to.
		if (wasPopped) return;
		const url = new URL(window.location.href);
		url.searchParams.set("frame", frame);
		if (!first) index.current += 1;
		const state = { spool: "play", frame, index: index.current };
		if (first) window.history.replaceState(state, "", url);
		else window.history.pushState(state, "", url);
	}, [frame, title]);

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
 * The frame's name is the only thing on the left. The middle, dead centre,
 * says the size the frame is laid out at, and how far it is drawn smaller when
 * it is, always and live: the size a frame plays at is the first thing to check
 * about it, and a still window is when it is read. Pressed, it opens the list
 * of sizes (spool#264). A player that cannot choose a size, and a frame played
 * at a clip's shape, have nothing there. Below {@link DESK_BAR_WIDE_PX} the
 * project prefix goes and the readout drops its word: a phone frame's window
 * is 390 wide, and the readout is the only way to the list. The frame's name
 * gives way before it.
 */
function TopBar({
	said,
	viewport,
	loading,
	desk,
	onClose,
	closeLabel = "Close the tab",
	exitKey = EXIT_KEY,
	linkable = false,
	recorder,
	middle,
}: {
	said: FrameSaid;
	viewport: Viewport;
	/** The size and its list (`SizeMenu`), where the frame's size can be chosen. */
	middle?: ReactNode;
	/** The frame is being compiled or fetched: said in the bar, since the screen has nothing to show yet. */
	loading: boolean;
	/** The app's window, when this is its title bar. */
	desk?: DeskWindow;
	/** Leaving, where the player can be left: absent, there is no close. */
	onClose?: () => void;
	closeLabel?: string;
	exitKey?: string;
	linkable?: boolean;
	recorder?: PlayerRecorder;
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
		<div className={desk === undefined ? "spool-top" : "spool-top is-desk"} style={{ height: DESK_BAR_PX }}>
			<span className="spool-bar-title">
				{layout.project && said.place !== null && <span className="spool-bar-project">{said.place} /</span>}
				<span className="spool-bar-name">{said.name}</span>
			</span>
			{middle ?? <span />}
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
				{recorder !== undefined && <RecordControl recorder={recorder} />}
				{desk === undefined && linkable && <CopyLinkButton />}
				{desk === undefined && onClose !== undefined && (
					<CloseButton label={closeLabel} chord={exitKey} onClose={onClose} />
				)}
			</span>
		</div>
	);
}

/**
 * Record (spool#221) on the bar: a dot to start, which opens a panel with the
 * clip's shape, the frame played at it behind; Start begins it. While it
 * records, the shape and the time, pressed or Escape to stop; then how far
 * the clip has rendered, and the file it was saved as. The time turns the
 * accent colour from {@link RECORD_WARN_MS}, ten seconds before the recording
 * stops itself.
 */
function RecordControl({ recorder }: { recorder: PlayerRecorder }) {
	useSyncExternalStore(recorder.subscribe, recorder.version);
	const view = recorder.view();
	switch (view.kind) {
		case "idle":
		case "saved":
			return (
				<>
					<span className="spool-bar-tipped">
						<button type="button" className="spool-bar-icon" aria-label="Record" onClick={recorder.record}>
							<span className="spool-record-dot" />
						</button>
						<Tip label="Record a clip" />
					</span>
					{view.kind === "saved" && (
						<div className="spool-record-toast" role="status">
							<span className="spool-record-toast-message">Saved</span>
							<span className="spool-record-toast-file">{view.name}</span>
							<button type="button" className="spool-bar-icon" aria-label="Dismiss" onClick={recorder.dismiss}>
								<CloseGlyph />
							</button>
						</div>
					)}
				</>
			);
		case "arming":
			return (
				<>
					<button
						type="button"
						className="spool-bar-icon is-lit"
						aria-label="Record"
						aria-expanded="true"
						onClick={recorder.dismiss}
					>
						<span className="spool-record-dot" />
					</button>
					<RecordPanel aspect={view.aspect} recorder={recorder} />
				</>
			);
		case "recording":
			return (
				<span className="spool-record-running">
					{view.aspect !== "frame" && <span className="spool-bar-hint spool-record-shape">{view.aspect}</span>}
					<RecordingTime since={view.since} onStop={recorder.stop} />
					<kbd className="spool-record-key">esc</kbd>
				</span>
			);
		case "stopping":
			return (
				<span className="spool-bar-hint spool-bar-loading" role="status">
					stopping
				</span>
			);
		case "rendering":
			return (
				<>
					<span className="spool-bar-hint spool-record-progress" role="status">
						rendering {Math.round(view.progress * 100)}%
					</span>
					<span className="spool-record-line" style={{ width: `${view.progress * 100}%` }} aria-hidden="true" />
				</>
			);
		case "failed":
			return (
				<span className="spool-record-choice">
					<span className="spool-bar-hint spool-record-failed" role="alert" title={view.message}>
						failed
					</span>
					<button type="button" className="spool-bar-share" onClick={recorder.retry}>
						try again
					</button>
					<button type="button" className="spool-bar-share spool-record-discard" onClick={recorder.dismiss}>
						discard
					</button>
				</span>
			);
	}
}

/** What each shape says the clip will be. */
const SHAPE_SAYS: Record<ClipAspect, string> = {
	"16:9": "The frame plays at 16:9 while it records, so the clip is the frame edge to edge.",
	"1:1": "The frame plays square while it records, so the clip is the frame edge to edge.",
	frame: "The frame at its size on the canvas, so the clip is what the canvas shows.",
};

/** Record's panel, under the dot: the clip's shape, then Start. Escape or Cancel puts it away. */
function RecordPanel({ aspect, recorder }: { aspect: ClipAspect; recorder: PlayerRecorder }) {
	const start = useRef<HTMLButtonElement>(null);
	useEffect(() => {
		start.current?.focus({ preventScroll: true });
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") recorder.dismiss();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [recorder]);
	return (
		<div className="spool-record-panel" role="dialog" aria-label="Record a clip">
			<div className="spool-record-panel-head">
				<span>Record a clip</span>
				<span className="spool-record-panel-limit">up to 1:00</span>
			</div>
			<fieldset className="spool-record-shapes" aria-label="Shape">
				{CLIP_ASPECTS.map((each) => (
					<button
						key={each}
						type="button"
						aria-pressed={each === aspect}
						className={each === aspect ? "spool-record-shape-pick is-on" : "spool-record-shape-pick"}
						onClick={() => recorder.pick(each)}
					>
						{each}
					</button>
				))}
			</fieldset>
			<p className="spool-record-panel-says">{SHAPE_SAYS[aspect]}</p>
			<div className="spool-record-panel-foot">
				<button type="button" className="spool-record-button" onClick={recorder.dismiss}>
					Cancel
				</button>
				<button ref={start} type="button" className="spool-record-button is-primary" onClick={recorder.begin}>
					Start recording
				</button>
			</div>
		</div>
	);
}

function CloseGlyph() {
	return (
		<svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">
			<path d="M2 2 8 8M8 2 2 8" fill="none" stroke="currentColor" strokeWidth="1.5" />
		</svg>
	);
}

function RecordingTime({ since, onStop }: { since: number; onStop: () => void }) {
	const [now, setNow] = useState(() => performance.now());
	useEffect(() => {
		const timer = window.setInterval(() => setNow(performance.now()), 250);
		// Escape stops it from the bar too; in the frame the frame's own document hears it
		const stopOnEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape") onStop();
		};
		window.addEventListener("keydown", stopOnEscape);
		return () => {
			window.clearInterval(timer);
			window.removeEventListener("keydown", stopOnEscape);
		};
	}, [onStop]);
	const elapsed = Math.max(0, now - since);
	const seconds = Math.floor(elapsed / 1000);
	return (
		<span className="spool-bar-tipped">
			<button
				type="button"
				className={elapsed >= RECORD_WARN_MS ? "spool-record-on is-near" : "spool-record-on"}
				aria-label="Stop recording"
				onClick={onStop}
			>
				<span className="spool-record-dot" />
				{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
			</button>
			<Tip label="Stop recording" />
		</span>
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
const EXIT_KEY = `${accelLabel()}w`;
const noSubscription = () => () => {};
const noVersion = () => 0;

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
