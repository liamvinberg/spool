import { useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { DesignFrame } from "../../daemon/design-projection";
import { fulfillClipboardCopy } from "../../runtime/clipboard-host";
import { Player, type PlayerController } from "../../runtime/player-chrome";
import { PLAYER_CHROME_RULES } from "../../runtime/player-chrome-css";
import { DESK_BAR_PX } from "../../runtime/player-page";
import { walkAccepted, walkRejected } from "../../runtime/walk-protocol";
import type { Box } from "../canvas/camera";
import { FLIGHT_MS } from "../canvas/camera-store";
import { parseFrameMessage, type SessionRecord, sessionReply } from "../canvas/protocol";

/** The glide a played frame grows out of its spot on, and shrinks back into it on. */
const GROW = { duration: FLIGHT_MS + 60, easing: "cubic-bezier(0.32, 0.72, 0, 1)" } as const;

interface Played {
	frame: string;
	arrival: number;
	/** The document this arrival plays, fixed when it arrives: nothing but a walk loads another. */
	src: string;
	externalHref: string | null;
}

/**
 * The player, in the same tab: the frame grows out of its own spot on the
 * canvas into the played page, wearing the shipped 30px bar (frame switcher,
 * size, eye, close), and close shrinks it back. The page it plays is the
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
	start,
	from,
	onWalked,
	onClosed,
}: {
	project: string;
	frames: readonly DesignFrame[];
	documentOf: (frame: string) => string;
	/** The frame to play; a different one while open is a walk to it. */
	start: string;
	/** Where the frame stands on screen on the canvas, to grow from; null plays it at once. */
	from: Box | null;
	onWalked: (frame: string) => void;
	onClosed: () => void;
}) {
	const shell = useRef<HTMLDivElement | null>(null);
	const iframe = useRef<HTMLIFrameElement | null>(null);
	const played = useRef<Played>({ frame: start, arrival: 0, src: documentOf(start), externalHref: null });
	/** What the screen walked from left behind, for the next one to start from. */
	const session = useRef<SessionRecord | null>(null);
	const listeners = useRef(new Set<() => void>());
	const version = useRef(0);
	const closing = useRef(false);
	const latest = useRef({ frames, documentOf, onWalked, onClosed });
	latest.current = { frames, documentOf, onWalked, onClosed };
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
				if (!latest.current.frames.some((each) => each.name === frame)) return;
				session.current = null;
				set({
					frame,
					arrival: played.current.arrival + 1,
					src: latest.current.documentOf(frame),
					externalHref: null,
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

	// it grows out of its spot on the canvas
	useLayoutEffect(() => {
		const el = shell.current;
		const { start, from } = opening.current;
		if (el === null || from === null || reducedMotion()) return;
		el.animate([{ transform: grownFrom(from, controller.geometry(start).w) }, { transform: "none" }], GROW);
	}, [controller]);

	// the played document's side of the frame protocol: its session, its walks and its links out
	useEffect(() => {
		const onMessage = (event: MessageEvent) => {
			const source = iframe.current?.contentWindow;
			if (source === undefined || source === null || event.source !== source) return;
			const message = parseFrameMessage(event.data);
			if (message === undefined || message.frame !== played.current.frame) return;
			switch (message.spool) {
				case "session?":
					source.postMessage(sessionReply(session.current), "*");
					return;
				case "copy":
					fulfillClipboardCopy(message, (result) => source.postMessage(result, "*"));
					return;
				case "external":
					played.current = { ...played.current, externalHref: message.href };
					version.current += 1;
					for (const listener of listeners.current) listener();
					return;
				case "go":
				case "back": {
					if (!latest.current.frames.some((frame) => frame.name === message.target)) {
						if (message.id !== undefined)
							source.postMessage(walkRejected(message.frame, message.id, "missing"), "*");
						return;
					}
					if (message.id !== undefined) source.postMessage(walkAccepted(message.frame, message.id), "*");
					controller.walk(message.target);
					session.current = message.session ?? null;
					return;
				}
			}
		};
		window.addEventListener("message", onMessage);
		return () => window.removeEventListener("message", onMessage);
	}, [controller]);

	// esc leaves, as close does, whenever the page rather than the frame has the keyboard
	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") controller.close();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [controller]);

	return (
		<div className="fixed inset-0 z-30 overflow-auto bg-[#0e0e0e]" data-viewer-player="">
			<style>{PLAYER_CHROME_RULES}</style>
			<div ref={shell} className="min-h-full origin-top-left">
				<Player
					project={project}
					frames={{}}
					controller={controller}
					closeLabel="Back to the canvas"
					host={<PlayedDocument iframe={iframe} controller={controller} played={played} />}
				/>
			</div>
		</div>
	);
}

/** The played frame's document, a fresh one for every arrival. */
function PlayedDocument({
	iframe,
	controller,
	played,
}: {
	iframe: { current: HTMLIFrameElement | null };
	controller: PlayerController;
	played: { current: Played };
}) {
	useSyncExternalStore(controller.subscribe, controller.version);
	const { frame, arrival, src } = played.current;
	return (
		<iframe
			key={arrival}
			ref={(element) => {
				iframe.current = element;
			}}
			src={src}
			title={frame}
			sandbox="allow-scripts"
			className="block w-full border-0 bg-white"
			style={{ height: `calc(100vh - ${DESK_BAR_PX}px)` }}
		/>
	);
}

/** The transform that puts the played page where its frame stands on the canvas. */
function grownFrom(spot: Box, authored: number): string {
	const width = Math.min(window.innerWidth, authored);
	const scale = spot.w / width;
	const left = (window.innerWidth - width) / 2;
	return `translate(${spot.x - left * scale}px, ${spot.y - DESK_BAR_PX * scale}px) scale(${scale})`;
}

function reducedMotion(): boolean {
	return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
