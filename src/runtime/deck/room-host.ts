import type { Size } from "../../deck/deck-file";
import { parseTalkMessage, roomPasses, type TalkMessage, talkChannel } from "../../deck/present-wire";
import { fitIn, STAGE_GROUND } from "../../deck/stage-fit";
import { roomPicture, type StageSession } from "../../deck/stage-session";
import type { StagePointer } from "../../deck/stage-wire";
import { stageDaemon } from "./stage-daemon";
import { mountStage, type StageHost } from "./stage-host";

/**
 * The room's window (spool#265): what the audience sees while a talk is presented from spool's own window, the slide and
 * nothing else, ever. No chrome, no cursor; black and frozen as its states. It holds the stage as a follower and shows
 * the newest session the presenter view publishes on the talk's broadcast channel, asking for it as it opens, so a
 * reload lands where the talk is. The presenter's pointer over a live slide is one soft dot here, and only then.
 *
 * Its keys and clicks move the talk through the presenter, which carries them out and publishes the result: the room
 * never steps by itself. In a browser the first key or click in it puts it full screen, and does nothing else. When the
 * talk ends, or spool's window goes, the room's window closes.
 */

export interface RoomConfig {
	project: string;
	page: string;
	/** the slide the talk began on, shown until the presenter's first word */
	frame?: string;
	controlToken: string;
	/** the talk this window is the room of */
	room: string;
}

const BARE = new Set(["Shift", "Meta", "Control", "Alt", "AltGraph", "CapsLock", "Fn", "FnLock", "Hyper", "Super"]);

export function bootRoom(root: HTMLElement, config: RoomConfig): StageHost {
	document.title = `${config.page} · room`;
	const look = document.createElement("style");
	look.textContent = "html, body, body * { cursor: none !important; }";
	document.head.append(look);
	// Chromium holds back a new page's frames until it paints something it counts as content, or half a second passes;
	// the slide is drawn in a frame of its own, which does not count, so the room stayed black for that half second with
	// its slide long drawn (spool#306). One character beneath the stage, in its ground's colour, is content enough.
	const content = document.createElement("span");
	content.setAttribute("aria-hidden", "true");
	content.textContent = ".";
	Object.assign(content.style, { position: "absolute", left: "0", top: "0", color: STAGE_GROUND });
	root.append(content);
	const channel = new BroadcastChannel(talkChannel(config.room));
	const say = (message: TalkMessage) => channel.postMessage(message);
	const daemon = stageDaemon(config);
	let size: Size | undefined;
	/** the newest session the presenter published, and the slide the room's screen shows in it */
	let newest: { session: StageSession; frame: string } | undefined;
	let pointer: StagePointer | null = null;
	const app = roomWindow();
	/** The Mac app holds the room's window hidden till its slide is drawn, so it never opens black (spool#306). */
	let drawn = false;
	const sayDrawn = () => {
		if (drawn) return;
		drawn = true;
		// the frame that reveals the slide is painted by the second frame from now
		requestAnimationFrame(() => requestAnimationFrame(() => app?.drawn?.()));
	};

	const host = mountStage(root, {
		async address() {
			const answer = await daemon.address();
			size = answer.size;
			return answer;
		},
		mode: "follow",
		room: true,
		...(config.frame === undefined ? {} : { frame: config.frame }),
		on: {
			// a new build took the screen: the newest session, which it may now be able to show
			talk: () => show(),
			shown: () => {
				sayDrawn();
				dot.draw();
			},
			command: (command) => {
				if (roomPasses(command)) say({ kind: "command", command });
			},
			refused: (why) => {
				// what there is to show, the ground, is shown rather than held back
				sayDrawn();
				console.error(`spool: ${why}`);
			},
		},
	});
	daemon.follow(host);

	/**
	 * The newest session on the room's screen, unless the room plays another build of a talk changed since: then the
	 * picture stays until this window's own build has the same slide there.
	 */
	function show(): void {
		if (newest === undefined) return;
		const talk = host.talk();
		const at = roomPicture(newest.session).at;
		if (talk.length > 0 && talk[at.slide]?.frame !== newest.frame) return;
		host.apply(newest.session);
		dot.draw();
	}

	// nothing of the window takes a press but this: the stage beneath it never has the pointer or the focus
	const shield = document.createElement("div");
	Object.assign(shield.style, { position: "absolute", inset: "0", zIndex: "2" });
	const dot = softDot(root, () => {
		const session = host.session();
		const box = { w: root.clientWidth, h: root.clientHeight };
		if (session === undefined || size === undefined || pointer === null) return null;
		if (session.black || session.frozen !== null || host.talk()[session.at.slide]?.live !== true) return null;
		const f = fitIn(size, box);
		return { x: f.x + pointer.x * size.w * f.s, y: f.y + pointer.y * size.h * f.s, width: size.w * f.s };
	});
	root.append(shield);
	new ResizeObserver(() => dot.draw()).observe(root);
	if (app !== undefined) dragStrip(root, app);

	channel.addEventListener("message", (event) => {
		const message = parseTalkMessage(event.data);
		if (message === undefined) return;
		if (message.kind === "session") {
			newest = { session: message.session, frame: message.frame };
			show();
		} else if (message.kind === "pointer") {
			pointer = message.at;
			dot.draw();
		} else if (message.kind === "end") {
			channel.close();
			// the window goes on the slide it shows: torn down first, it painted its black ground for a few frames before
			// it closed, and closing paints it too, so the Mac app takes the window off the screen before the page goes
			// (spool#308); a window the browser keeps open, one no script opened, shows that ground
			if (app?.close !== undefined) {
				app.close();
				return;
			}
			window.close();
			if (!window.closed) {
				host.destroy();
				dot.destroy();
			}
		}
	});
	say({ kind: "ask" });
	addEventListener("pagehide", () => say({ kind: "gone" }));

	/**
	 * The first key or click in a window not yet full screen puts it full screen, and is spent on that. Not in the Mac
	 * app, which places the room itself: full screen on the room's display, or a window when there is only one.
	 */
	let first = app === undefined;
	const fullScreen = (event: Event): boolean => {
		if (!first) return false;
		first = false;
		if (document.fullscreenElement !== null || !document.fullscreenEnabled) return false;
		event.preventDefault();
		void document.documentElement.requestFullscreen().catch(() => {});
		return true;
	};
	addEventListener("keydown", (event) => {
		const plain = !BARE.has(event.key) && !event.metaKey && !event.ctrlKey && !event.altKey;
		if (plain && event.key !== "Escape" && fullScreen(event)) return;
		if (host.key(event)) event.preventDefault();
	});
	shield.addEventListener("click", (event) => {
		if (fullScreen(event)) return;
		const session = host.session();
		if (session === undefined) return;
		if (session.black) say({ kind: "command", command: { kind: "black", on: false } });
		else if (host.talk()[roomPicture(session).at.slide]?.live !== true)
			say({ kind: "command", command: { kind: "next" } });
	});
	return host;
}

/** The Mac app's word to the room's window: whether it is a window just now, rather than full screen. */
interface RoomWindow {
	windowed: boolean;
	onWindowed(listener: (windowed: boolean) => void): () => void;
	/** the slide is drawn: the window may show; absent in an app from before it waited */
	drawn?(): void;
	/** the talk is over: the window goes; absent in an app from before it took the window off the screen first */
	close?(): void;
}

function roomWindow(): RoomWindow | undefined {
	const bridge = (window as { spoolRoomWindow?: unknown }).spoolRoomWindow;
	if (typeof bridge !== "object" || bridge === null) return undefined;
	const candidate = bridge as Partial<RoomWindow>;
	if (typeof candidate.onWindowed !== "function") return undefined;
	return candidate as RoomWindow;
}

/**
 * The room's window in the Mac app has no title bar, so while it is a window a strip along its top is what it is
 * dragged by. Nothing shows of it: the room draws the slide and nothing else.
 */
function dragStrip(root: HTMLElement, app: RoomWindow): void {
	const strip = document.createElement("div");
	strip.setAttribute("aria-hidden", "true");
	Object.assign(strip.style, { position: "absolute", top: "0", left: "0", right: "0", height: "28px", zIndex: "3" });
	strip.style.setProperty("-webkit-app-region", "drag");
	const set = (windowed: boolean) => {
		strip.style.display = windowed ? "block" : "none";
	};
	set(app.windowed);
	app.onWindowed(set);
	root.append(strip);
}

/** The dot's spring, the design's: stiff and heavily damped, so it follows the pointer closely and never overshoots. */
const STIFFNESS = 900;
const DAMPING = 60;
const MASS = 0.4;
/** Its fade in and out. */
const FADE = "180ms cubic-bezier(0.22, 0.61, 0.36, 1)";

interface Dot {
	draw(): void;
	destroy(): void;
}

/**
 * The presenter's pointer, as the room sees it: one soft dot over the slide, gliding after it on a spring, sized to
 * the slide on screen. `where` says where it stands in the window, and the slide's width there; null hides it.
 */
function softDot(root: HTMLElement, where: () => { x: number; y: number; width: number } | null): Dot {
	const el = document.createElement("span");
	el.setAttribute("aria-hidden", "true");
	el.dataset.spoolRoomDot = "";
	Object.assign(el.style, {
		position: "absolute",
		left: "0",
		top: "0",
		zIndex: "1",
		borderRadius: "9999px",
		background: "rgba(242, 242, 240, 0.55)",
		pointerEvents: "none",
		opacity: "0",
		scale: "0.6",
		transition: `opacity ${FADE}, scale ${FADE}`,
	});
	root.append(el);
	let at: { x: number; y: number } | undefined;
	const speed = { x: 0, y: 0 };
	let goal = { x: 0, y: 0 };
	let size = 10;
	let frame = 0;
	let last = 0;
	const place = () => {
		if (at === undefined) return;
		el.style.transform = `translate(${at.x - size / 2}px, ${at.y - size / 2}px)`;
	};
	const step = (now: number) => {
		frame = 0;
		if (at === undefined) return;
		let left = Math.min(0.05, (now - last) / 1000);
		last = now;
		while (left > 0) {
			const h = Math.min(left, 0.004);
			left -= h;
			for (const axis of ["x", "y"] as const) {
				const pull = -STIFFNESS * (at[axis] - goal[axis]) - DAMPING * speed[axis];
				speed[axis] += (pull / MASS) * h;
				at[axis] += speed[axis] * h;
			}
		}
		const resting =
			Math.abs(at.x - goal.x) < 0.1 && Math.abs(at.y - goal.y) < 0.1 && Math.hypot(speed.x, speed.y) < 1;
		if (resting) at = { ...goal };
		place();
		if (!resting) frame = requestAnimationFrame(step);
	};
	return {
		draw() {
			const now = where();
			if (now === null) {
				el.style.opacity = "0";
				el.style.scale = "0.6";
				return;
			}
			size = Math.max(10, now.width / 60);
			Object.assign(el.style, { width: `${size}px`, height: `${size}px`, filter: `blur(${size / 8}px)` });
			goal = { x: now.x, y: now.y };
			const hidden = el.style.opacity === "0";
			// a dot that comes back comes back where the pointer is, not gliding from where it left
			if (at === undefined || hidden) {
				at = { ...goal };
				speed.x = 0;
				speed.y = 0;
				place();
			} else if (frame === 0) {
				last = performance.now();
				frame = requestAnimationFrame(step);
			}
			el.style.opacity = "1";
			el.style.scale = "1";
		},
		destroy() {
			cancelAnimationFrame(frame);
			el.remove();
		},
	};
}
