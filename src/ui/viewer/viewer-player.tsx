import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { DesignFrame } from "../../daemon/design-projection";
import { isFramePath } from "../../page-path";
import { fulfillClipboardCopy } from "../../runtime/clipboard-host";
import { Player, type PlayerController } from "../../runtime/player-chrome";
import { PLAYER_CHROME_RULES } from "../../runtime/player-chrome-css";
import { DESK_BAR_PX } from "../../runtime/player-page";
import { walkAccepted, walkRejected } from "../../runtime/walk-protocol";
import type { Box } from "../canvas/camera";
import { FLIGHT_MS } from "../canvas/camera-store";
import { parseFrameMessage, type SessionRecord, sessionReply } from "../canvas/protocol";

/** The glide a played frame grows out of its spot on, and shrinks back into it on. */
export const GROW = { duration: FLIGHT_MS + 60, easing: "cubic-bezier(0.32, 0.72, 0, 1)" } as const;

/**
 * How long a frame clicked on the canvas may take to draw before the player opens without it: one that draws in
 * time grows out of the canvas whole, never as a blank page filling in.
 */
const DRAW_WAIT_MS = 300;
/** A document that loaded but never said it drew (an error, a screen that isn't shared) shows this long after. */
const DRAW_FALLBACK_MS = 150;

interface Arrival {
	frame: string;
	arrival: number;
	/** The document this arrival plays, fixed when it arrives: nothing but a walk loads another. */
	src: string;
}

interface Played extends Arrival {
	externalHref: string | null;
	/** The last arrival that drew. */
	drawn: number;
	/** The screen walked from, kept on show until the next one has drawn: a walk never flashes a blank page. */
	previous: Arrival | null;
}

/**
 * The player, in the same tab: the frame grows out of its own spot on the
 * canvas into the played page, wearing the shipped 30px bar (frame switcher,
 * size, eye, close), and close shrinks it back while the canvas fades in
 * behind it. It grows once its document has drawn, or standing on its cover,
 * so what grows is the screen and never a blank page. The page it plays is the
 * frame's own document from the frames' origin, so a walk inside it is that
 * document asking to go, answered here the way the canvas answers it: the next
 * screen's document, handed the session the last one left.
 *
 * A teammate's save never moves anyone mid-flow: the screen on show stays the
 * document it arrived as, and the next screen walked to is the newest version.
 */
export function ViewerPlayer({
	project,
	frames,
	documentOf,
	walksAnywhere = false,
	start,
	from,
	coverOf,
	onWalked,
	onClosed,
}: {
	project: string;
	frames: readonly DesignFrame[];
	documentOf: (frame: string) => string;
	/**
	 * Walk to any frame a document names, known here or not: an outsider walking off the pages shared with them is
	 * shown the screen that says it isn't shared, never left where they were.
	 */
	walksAnywhere?: boolean;
	/** The frame to play; a different one while open is a walk to it. */
	start: string;
	/** Where the frame stands on screen on the canvas, to grow from; null plays it at once. */
	from: Box | null;
	/** A frame's cover, standing in until its document has drawn. */
	coverOf: (frame: string) => string | undefined;
	onWalked: (frame: string) => void;
	onClosed: () => void;
}) {
	const shell = useRef<HTMLDivElement | null>(null);
	const backdrop = useRef<HTMLDivElement | null>(null);
	const iframe = useRef<HTMLIFrameElement | null>(null);
	const played = useRef<Played>({
		frame: start,
		arrival: 0,
		src: documentOf(start),
		externalHref: null,
		drawn: -1,
		previous: null,
	});
	/** What the screen walked from left behind, for the next one to start from. */
	const session = useRef<SessionRecord | null>(null);
	const listeners = useRef(new Set<() => void>());
	const version = useRef(0);
	const closing = useRef(false);
	const latest = useRef({ frames, documentOf, onWalked, onClosed });
	latest.current = { frames, documentOf, onWalked, onClosed };
	const reaches = useRef(walksAnywhere);
	reaches.current = walksAnywhere;
	/** Where it opened: what the glide grows out of, and shrinks back into while the same frame plays. */
	const opening = useRef({ start, from });

	const controller = useMemo<PlayerController>(() => {
		const set = (next: Partial<Played>) => {
			played.current = { ...played.current, ...next };
			version.current += 1;
			for (const listener of listeners.current) listener();
		};
		const geometry = (frame: string) => {
			const found = latest.current.frames.find((each) => each.name === frame);
			return { w: found?.w ?? 1440, h: found?.h ?? 900 };
		};
		return {
			subscribe(listener) {
				listeners.current.add(listener);
				return () => listeners.current.delete(listener);
			},
			version: () => version.current,
			read: () => played.current,
			geometry,
			frames: () => latest.current.frames.map((frame) => frame.name),
			walk(frame) {
				if (!walkable(latest.current.frames, reaches.current, frame)) return;
				session.current = null;
				const now = played.current;
				set({
					frame,
					arrival: now.arrival + 1,
					src: latest.current.documentOf(frame),
					externalHref: null,
					previous:
						now.drawn === now.arrival ? { frame: now.frame, arrival: now.arrival, src: now.src } : now.previous,
				});
				latest.current.onWalked(frame);
			},
			dismissExternal: () => set({ externalHref: null }),
			close() {
				if (closing.current) return;
				closing.current = true;
				const el = shell.current;
				const back = played.current.frame === opening.current.start ? opening.current.from : null;
				if (el === null || reducedMotion()) {
					latest.current.onClosed();
					return;
				}
				backdrop.current?.animate([{ opacity: 1 }, { opacity: 0 }], { ...GROW, fill: "forwards" });
				const leaving = el.animate(
					back === null
						? [{ opacity: 1 }, { opacity: 0 }]
						: [
								{ transform: "none", opacity: 1 },
								{ transform: grownFrom(back, geometry(played.current.frame).w), opacity: 1 },
							],
					{ ...GROW, fill: "forwards" },
				);
				leaving.onfinish = () => latest.current.onClosed();
			},
		};
		// the controller is the player's for as long as it is open
	}, []);

	// the URL naming another frame while open (back and forward) walks to it
	useEffect(() => {
		if (played.current.frame !== start) controller.walk(start);
	}, [start, controller]);

	useSyncExternalStore(controller.subscribe, controller.version);
	const now = played.current;
	const cover = coverOf(now.frame);
	// a frame opened from the canvas waits, unseen, for its document to draw; one opened by its address shows at once
	const [waited, setWaited] = useState(from === null || coverOf(start) !== undefined);
	const shown = waited || now.drawn >= 0;
	useEffect(() => {
		if (waited) return;
		const timer = setTimeout(() => setWaited(true), DRAW_WAIT_MS);
		return () => clearTimeout(timer);
	}, [waited]);

	// once shown, it grows out of its spot on the canvas as the canvas dims behind it
	const grown = useRef(false);
	useLayoutEffect(() => {
		const el = shell.current;
		const { start, from } = opening.current;
		if (!shown || grown.current) return;
		grown.current = true;
		if (el === null || from === null || reducedMotion()) return;
		el.animate([{ transform: grownFrom(from, controller.geometry(start).w) }, { transform: "none" }], GROW);
		backdrop.current?.animate([{ opacity: 0 }, { opacity: 1 }], GROW);
	}, [shown, controller]);

	const drew = useMemo(() => {
		const draw = (arrival: number) => {
			const now = played.current;
			if (arrival !== now.arrival || now.drawn === arrival) return;
			played.current = { ...now, drawn: arrival, previous: null };
			version.current += 1;
			for (const listener of listeners.current) listener();
		};
		return {
			/** The document said it drew. */
			now: () => draw(played.current.arrival),
			/** It loaded: one that never says so is shown a beat later anyway. */
			loaded: (arrival: number) => setTimeout(() => draw(arrival), DRAW_FALLBACK_MS),
		};
	}, []);

	// the played document's side of the frame protocol: its session, its walks and its links out
	usePlayedDocument(iframe, session, {
		frame: () => played.current.frame,
		walkable: (frame) => walkable(latest.current.frames, reaches.current, frame),
		walk: (frame) => controller.walk(frame),
		drew: drew.now,
		external(href) {
			played.current = { ...played.current, externalHref: href };
			version.current += 1;
			for (const listener of listeners.current) listener();
		},
	});

	// esc leaves, as close does, whenever the page rather than the frame has the keyboard
	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") controller.close();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [controller]);

	const waiting = now.drawn !== now.arrival && now.previous === null;
	return (
		<div
			className="fixed inset-0 z-30"
			style={shown ? undefined : { opacity: 0, pointerEvents: "none" }}
			data-viewer-player=""
		>
			<style>{PLAYER_CHROME_RULES}</style>
			<div ref={backdrop} className="absolute inset-0 bg-[#0e0e0e]" />
			<div className="absolute inset-0 overflow-auto">
				<div ref={shell} className="min-h-full origin-top-left">
					<Player
						project={project}
						frames={{}}
						controller={controller}
						closeLabel="Back to the canvas"
						loading={waiting && cover === undefined}
						host={
							<PlayedDocument
								iframe={iframe}
								played={now}
								cover={waiting ? cover : undefined}
								onLoad={drew.loaded}
							/>
						}
					/>
				</div>
			</div>
		</div>
	);
}

/**
 * The played frame's document, a fresh one for every arrival, hidden until it draws: the screen walked from stays on
 * top until then, or the frame's cover where there is no screen before it.
 */
function PlayedDocument({
	iframe,
	played,
	cover,
	onLoad,
}: {
	iframe: { current: HTMLIFrameElement | null };
	played: Played;
	cover: string | undefined;
	onLoad: (arrival: number) => void;
}) {
	const { frame, arrival, src, drawn, previous } = played;
	const documents = previous === null ? [{ frame, arrival, src }] : [{ frame, arrival, src }, previous];
	return (
		<div className="relative bg-white" style={{ height: `calc(100vh - ${DESK_BAR_PX}px)` }}>
			{cover !== undefined && (
				<img
					src={cover}
					alt=""
					draggable={false}
					className="absolute inset-0 h-full w-full object-cover object-top"
				/>
			)}
			{documents.map((document) => {
				const current = document.arrival === arrival;
				return (
					<iframe
						key={document.arrival}
						ref={
							current
								? (element) => {
										iframe.current = element;
									}
								: undefined
						}
						src={document.src}
						title={current ? document.frame : `${document.frame}, before`}
						sandbox="allow-scripts"
						inert={!current}
						className="absolute inset-0 block h-full w-full border-0 bg-white"
						// hidden by opacity, never visibility, which would hold back the very drawing it waits for
						style={{ opacity: !current || drawn === arrival ? 1 : 0 }}
						onLoad={current ? () => onLoad(document.arrival) : undefined}
					/>
				);
			})}
		</div>
	);
}

/** What a played document may ask of whoever plays it, answered as the canvas answers it. */
export interface PlayedAnswers {
	/** The frame on show: a message from any other is stale. */
	frame: () => string;
	walkable: (frame: string) => boolean;
	/** A walk the document asked for and was told goes ahead. */
	walk: (frame: string) => void;
	/** The document drew its first screen. */
	drew?: () => void;
	/** A link out of the prototype, to an address on the web. */
	external: (href: string) => void;
}

/**
 * The played document's side of the frame protocol, for whoever plays it: the session the last screen left, its
 * walks, its copies to the clipboard and its links out. A walk's session is kept for the next screen to ask for.
 */
export function usePlayedDocument(
	iframe: { current: HTMLIFrameElement | null },
	session: { current: SessionRecord | null },
	answers: PlayedAnswers,
): void {
	const latest = useRef(answers);
	latest.current = answers;
	useEffect(() => {
		const onMessage = (event: MessageEvent) => {
			const source = iframe.current?.contentWindow;
			if (source === undefined || source === null || event.source !== source) return;
			const message = parseFrameMessage(event.data);
			const answer = latest.current;
			if (message === undefined || message.frame !== answer.frame()) return;
			switch (message.spool) {
				case "session?":
					source.postMessage(sessionReply(session.current), "*");
					return;
				case "copy":
					fulfillClipboardCopy(message, (result) => source.postMessage(result, "*"));
					return;
				case "external":
					answer.external(message.href);
					return;
				case "loaded":
					answer.drew?.();
					return;
				case "go":
				case "back": {
					if (!answer.walkable(message.target)) {
						if (message.id !== undefined)
							source.postMessage(walkRejected(message.frame, message.id, "missing"), "*");
						return;
					}
					if (message.id !== undefined) source.postMessage(walkAccepted(message.frame, message.id), "*");
					answer.walk(message.target);
					session.current = message.session ?? null;
					return;
				}
			}
		};
		window.addEventListener("message", onMessage);
		return () => window.removeEventListener("message", onMessage);
	}, [iframe, session]);
}

/** Whether a walk to a frame goes anywhere: one on the canvas, or any frame at all where walks reach anywhere. */
export function walkable(frames: readonly DesignFrame[], anywhere: boolean, frame: string): boolean {
	return frames.some((each) => each.name === frame) || (anywhere && isFramePath(frame));
}

/** The transform that puts the played page where its frame stands on the canvas. */
function grownFrom(spot: Box, authored: number): string {
	const width = Math.min(window.innerWidth, authored);
	const scale = spot.w / width;
	const left = (window.innerWidth - width) / 2;
	return `translate(${spot.x - left * scale}px, ${spot.y - DESK_BAR_PX * scale}px) scale(${scale})`;
}

export function reducedMotion(): boolean {
	return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
