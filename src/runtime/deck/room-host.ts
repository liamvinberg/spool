import type { Size } from "../../deck/deck-file";
import { parseTalkMessage, roomPasses, type TalkMessage, talkChannel } from "../../deck/present-wire";
import { fitIn, STAGE_GROUND } from "../../deck/stage-fit";
import { roomPicture, type StageSession } from "../../deck/stage-session";
import { PRESENTED_WEBGL, PRESENTED_WEBGL_APART, type StagePointer } from "../../deck/stage-wire";
import { roomPointer } from "./room-pointer";
import { stageDaemon } from "./stage-daemon";
import { mountStage, type StageHost } from "./stage-host";

/**
 * The room's window (spool#265): what the audience sees while a talk is presented from spool's own window, the slide and
 * nothing else, ever. No chrome, no cursor; black and frozen as its states. It holds the stage as a follower and shows
 * the newest session the presenter view publishes on the talk's broadcast channel, asking for it as it opens, so a
 * reload lands where the talk is. The presenter's pointer over a live slide shows here (`room-pointer.ts`), and only then,
 * and what the presenter does in it is done in the room's copy (spool#332): the stage gives it to that slide alone.
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
	/**
	 * The stage plays on the room's host, in a process of its own, once that host is seen to answer here, in a browser
	 * that gives each site a process; elsewhere the stage plays on the render host beside the presenter's, as it always
	 * did, and holds that share (spool#320).
	 */
	let apart: boolean | undefined = sitesApart() ? undefined : false;
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
			let answer = await daemon.address(apart !== false);
			if (apart === undefined) {
				apart = await answers(answer.address);
				if (!apart) answer = await daemon.address(false);
			}
			size = answer.size;
			return { ...answer, webgl: (apart ? PRESENTED_WEBGL_APART : PRESENTED_WEBGL).room };
		},
		mode: "follow",
		room: true,
		replay: true,
		...(config.frame === undefined ? {} : { frame: config.frame }),
		on: {
			// a new build took the screen: the newest session, which it may now be able to show
			talk: () => show(),
			shown: (shown) => {
				sayDrawn();
				dot.draw();
				// the step this picture is of: a picture of an older one says nothing of a newer step still coming
				const session = host.session();
				const at = session === undefined ? undefined : roomPicture(session).at;
				if (session !== undefined && at?.slide === shown.at.slide && at.beat === shown.at.beat)
					say({ kind: "shown", revision: session.revision, ...(apart === true ? { apart } : {}) });
			},
			command: (command) => {
				if (roomPasses(command)) say({ kind: "command", command });
			},
			recall: () => say({ kind: "recall" }),
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
	const dot = roomPointer(root, () => {
		const session = host.session();
		const box = { w: root.clientWidth, h: root.clientHeight };
		if (session === undefined || size === undefined || pointer === null) return null;
		if (session.black || session.frozen !== null || host.talk()[session.at.slide]?.live !== true) return null;
		const f = fitIn(size, box);
		return { ...pointer, x: f.x + pointer.x * size.w * f.s, y: f.y + pointer.y * size.h * f.s, width: size.w * f.s };
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
		} else if (message.kind === "input") {
			host.input(message.inputs);
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
	 * The first key or click in a window not yet full screen puts it full screen. A click is spent on that; a key acts
	 * as well, since the room's window has the keys when a click on Present opened it, and the first key after Present
	 * steps (spool#327). Not in the Mac app, which places the room itself: full screen on the room's display, or a
	 * window when there is only one.
	 */
	let first = app === undefined;
	const fullScreen = (): boolean => {
		if (!first) return false;
		first = false;
		if (document.fullscreenElement !== null || !document.fullscreenEnabled) return false;
		void document.documentElement.requestFullscreen().catch(() => {});
		return true;
	};
	addEventListener("keydown", (event) => {
		const plain = !BARE.has(event.key) && !event.metaKey && !event.ctrlKey && !event.altKey;
		if (plain && event.key !== "Escape") fullScreen();
		if (host.key(event)) event.preventDefault();
	});
	shield.addEventListener("click", (event) => {
		if (fullScreen()) {
			event.preventDefault();
			return;
		}
		const session = host.session();
		if (session === undefined) return;
		if (session.black) say({ kind: "command", command: { kind: "black", on: false } });
		else if (host.talk()[roomPicture(session).at.slide]?.live !== true)
			say({ kind: "command", command: { kind: "next" } });
	});
	return host;
}

/** Whether this browser plays each site in a process of its own, as Chromium does, and so the Mac app. */
function sitesApart(): boolean {
	const brands = (navigator as Navigator & { userAgentData?: { brands?: { brand: string }[] } }).userAgentData?.brands;
	return brands?.some(({ brand }) => brand === "Chromium") === true;
}

/** Whether a host of the daemon's answers in this browser at all, by the address of a document on it. */
async function answers(address: string): Promise<boolean> {
	try {
		await fetch(new URL("/favicon.svg", address), {
			mode: "no-cors",
			cache: "no-store",
			signal: AbortSignal.timeout(3000),
		});
		return true;
	} catch {
		return false;
	}
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
