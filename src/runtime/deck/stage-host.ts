import type { Size } from "../../deck/deck-file";
import { fitIn } from "../../deck/stage-fit";
import { DIGITS_FORGET_MS, type KeyCommand, pressedKey, readKey, typingIn } from "../../deck/stage-keys";
import type { StageCommand, StageSession, TalkSlide } from "../../deck/stage-session";
import {
	type HostMessage,
	parseStageMessage,
	type SlideReadiness,
	type StageMode,
	type StagePointer,
	type StageShown,
} from "../../deck/stage-wire";

/**
 * A stage hosted in a window of spool's (spool#265): the room's window, the presenter view, the canvas over an entered
 * slide, or the plain play address of a deck page. It lays the stage's document out at the talk's size, fitted into
 * the element it is given and centred on black, speaks to it over its private port, and takes a new build of the talk
 * without the picture ever leaving the screen: the new document is readied behind the one showing and takes its place
 * only once it has painted the same slide and beat. When that slide is broken in the new build,
 * the last picture the room saw stays over the new one, through any number of builds that cannot show it either, until
 * the talk moves to a slide the playing build can show. A room's black is drawn here, over every document.
 */

export interface StageHostOptions {
	/** a fresh address of the stage's document, asked for each time one is opened, and the talk's size */
	address(): Promise<{ address: string; size: Size }>;
	/** `own`: the stage keeps the session and the host sends it commands; `follow`: the host hands it each session */
	mode: StageMode;
	/** the stage draws the room's states, black and frozen */
	room: boolean;
	/** where it opens: a session, or a slide by its frame (its first beat); the talk's first slide otherwise */
	session?: StageSession;
	frame?: string;
	on?: StageHostEvents;
}

export interface StageHostEvents {
	/** the talk the stage plays, each time a document of it takes the screen */
	talk?(slides: readonly TalkSlide[]): void;
	/** every change to the session a stage owns */
	session?(session: StageSession): void;
	/** every slide's readiness, whenever one changes */
	slides?(slides: readonly SlideReadiness[]): void;
	/** a command carried out: where, whether the slide was ready, how long it took */
	shown?(shown: StageShown): void;
	/**
	 * a command for the host: escape, swap and help always, and every command while the stage follows, what a slide
	 * wrote to `ui.state` among them (`{ kind: "state" }`), for the session's owner to step
	 */
	command?(command: KeyCommand): void;
	/** the stage could not be opened, or a new build of it could not, and why; what was showing stays */
	refused?(why: string): void;
	/** where the pointer stands over the live slide on screen, and null once it leaves: the room shows it as a dot */
	pointer?(at: StagePointer | null): void;
}

export interface StageHost {
	/** a command for a stage that owns its session */
	command(command: StageCommand): void;
	/**
	 * the session a following stage shows, or that an owning one takes over; `cut`: its slide goes on in one frame,
	 * with no dissolve from the one showing, for a stage nobody was watching until now
	 */
	apply(session: StageSession, mode?: StageMode, cut?: boolean): void;
	/** a key pressed in the host's own document, read as the stage reads its own; true when the talk took it */
	key(event: KeyboardEvent): boolean;
	/** take a new build of the talk, staying on its slide and beat */
	reload(): void;
	/** the keyboard to the stage's own document, where a live slide given the keys hears them */
	focus(): void;
	/** the newest session the host knows */
	session(): StageSession | undefined;
	/** the talk, once the stage said it */
	talk(): readonly TalkSlide[];
	destroy(): void;
}

/** How long a stage document has to connect before its host gives up on it. */
const CONNECT_PATIENCE_MS = 20_000;

/** One document of the stage: the one on screen, or a new build readying behind it. */
interface StageDocument {
	readonly frame: HTMLIFrameElement;
	readonly size: Size;
	talk: readonly TalkSlide[];
	post?: (message: HostMessage) => void;
	/** the session it was last handed, while it readies behind the one on screen */
	opened?: StageSession | undefined;
	/** the session it said it holds, as an owning stage says each: a new build finds its slide in a talk changed since */
	said?: StageSession | undefined;
	shown: boolean;
	timer?: ReturnType<typeof setTimeout>;
	stop(): void;
}

export function mountStage(container: HTMLElement, options: StageHostOptions): StageHost {
	const on = options.on ?? {};
	let mode = options.mode;
	let session = options.session;
	let current: StageDocument | undefined;
	let incoming: StageDocument | undefined;
	/** the last picture the room saw, an older build's, kept over the playing one while the slide is broken in it */
	let veil: StageDocument | undefined;
	let destroyed = false;
	let digits = "";
	let forget: ReturnType<typeof setTimeout> | undefined;

	const holder = document.createElement("div");
	holder.dataset.spoolStage = "";
	Object.assign(holder.style, { position: "absolute", inset: "0", overflow: "hidden", background: "#000" });
	if (getComputedStyle(container).position === "static") container.style.position = "relative";
	container.append(holder);
	// the room's black, over every document of the stage and any picture kept from an older build
	const black = document.createElement("div");
	black.dataset.spoolStageBlack = "";
	Object.assign(black.style, { position: "absolute", inset: "0", zIndex: "2", background: "#000", display: "none" });
	holder.append(black);
	const drawBlack = () => {
		black.style.display = options.room && session?.black === true ? "block" : "none";
	};

	const place = (doc: StageDocument) => {
		const box = { w: holder.clientWidth || doc.size.w, h: holder.clientHeight || doc.size.h };
		const f = fitIn(doc.size, box);
		Object.assign(doc.frame.style, {
			width: `${doc.size.w}px`,
			height: `${doc.size.h}px`,
			transform: `translate(${f.x}px, ${f.y}px) scale(${f.s})`,
		});
	};
	const resize = new ResizeObserver(() => {
		for (const doc of [current, incoming, veil]) if (doc !== undefined) place(doc);
	});
	resize.observe(holder);

	/** Opens a document of the stage behind whatever is showing, on the newest session. */
	async function open(): Promise<void> {
		let answer: { address: string; size: Size };
		try {
			answer = await options.address();
		} catch (error) {
			on.refused?.(error instanceof Error ? error.message : String(error));
			return;
		}
		if (destroyed) return;
		const frame = document.createElement("iframe");
		frame.setAttribute("sandbox", "allow-scripts");
		frame.setAttribute("allow", "clipboard-write");
		frame.title = "stage";
		// hidden by opacity, never visibility: a hidden frame is throttled and would never get ready (spool#185)
		Object.assign(frame.style, {
			position: "absolute",
			left: "0",
			top: "0",
			border: "0",
			transformOrigin: "0 0",
			opacity: "0",
			pointerEvents: "none",
		});
		const doc: StageDocument = { frame, size: answer.size, talk: [], shown: false, stop: () => {} };
		const onWindowMessage = (event: MessageEvent) => {
			if (event.source !== frame.contentWindow) return;
			const data = event.data as { spool?: unknown; why?: unknown } | null;
			if (data?.spool === "stage-refused") {
				clearTimeout(doc.timer);
				refuse(doc, typeof data.why === "string" ? data.why : "the stage would not open");
				return;
			}
			if (data?.spool !== "stage-connect" || event.ports.length !== 1 || doc.post !== undefined) return;
			const port = event.ports[0];
			if (port === undefined) return;
			clearTimeout(doc.timer);
			port.onmessage = (incomingEvent) => heard(doc, incomingEvent.data);
			doc.post = (message) => port.postMessage(message);
			doc.opened = session;
			// the slide the talk is on, by frame, so a talk changed since finds it again
			const frameOf = session === undefined ? options.frame : current?.talk[session.at.slide]?.frame;
			doc.post({
				spool: "stage-open",
				mode,
				room: options.room,
				...(session === undefined ? {} : { session }),
				...(frameOf === undefined ? {} : { frame: frameOf }),
			});
		};
		addEventListener("message", onWindowMessage);
		doc.timer = setTimeout(() => refuse(doc, "the stage did not answer"), CONNECT_PATIENCE_MS);
		doc.stop = () => {
			removeEventListener("message", onWindowMessage);
			clearTimeout(doc.timer);
			frame.remove();
		};
		frame.src = answer.address;
		place(doc);
		if (current === undefined) current = doc;
		else {
			incoming?.stop();
			incoming = doc;
		}
		holder.append(frame);
	}

	/** A document that will not play: a new build is dropped and the one showing stays; the first one says so. */
	function refuse(doc: StageDocument, why: string): void {
		if (doc === incoming) {
			incoming = undefined;
			doc.stop();
		}
		on.refused?.(why);
	}

	function heard(doc: StageDocument, data: unknown): void {
		const message = parseStageMessage(data);
		if (message === undefined || destroyed) return;
		const live = doc === current;
		switch (message.spool) {
			case "stage-talk":
				doc.talk = message.slides;
				if (live) on.talk?.(doc.talk);
				return;
			case "stage-session":
				doc.said = message.session;
				if (live && mode === "own") {
					session = message.session;
					drawBlack();
					on.session?.(session);
				}
				return;
			case "stage-pointer":
				if (live) on.pointer?.(message.at);
				return;
			case "stage-slides":
				if (live) on.slides?.(message.slides);
				return;
			case "stage-command":
				if (live) on.command?.(message.command);
				return;
			case "stage-shown":
				if (live) {
					if (!doc.shown) reveal(doc);
					// the talk moved to a slide this build can show: the old build's picture goes
					if (veil !== undefined && !message.shown.held) {
						veil.stop();
						veil = undefined;
					}
					on.shown?.(message.shown);
				} else if (doc === incoming) {
					// shown where the talk stood when it opened; the talk may have moved on since
					if (session !== undefined && doc.opened?.revision !== session.revision) {
						doc.opened = session;
						doc.post?.({ spool: "stage-apply", session, mode });
						return;
					}
					takeOver(doc, message.shown.held);
				}
				return;
		}
	}

	function reveal(doc: StageDocument): void {
		doc.shown = true;
		doc.frame.style.opacity = "1";
		doc.frame.style.pointerEvents = "auto";
	}

	/**
	 * The readied document takes the place of the one showing, in one frame, on the same picture. When it has no
	 * picture of the slide (the slide is broken in the new build), the last picture the room saw stays over it, inert,
	 * until it does: the old document's, or the one an older build already left over the old document.
	 */
	function takeOver(doc: StageDocument, held: boolean): void {
		const old = current;
		const focused = old !== undefined && document.activeElement === old.frame;
		current = doc;
		incoming = undefined;
		reveal(doc);
		if (!held) {
			veil?.stop();
			veil = undefined;
			old?.stop();
		} else if (veil === undefined && old !== undefined && old.shown) {
			veil = old;
			Object.assign(old.frame.style, { zIndex: "1", pointerEvents: "none" });
		} else {
			// the old document never showed the room anything over the picture already kept, which stays
			old?.stop();
		}
		// keys pressed in the stage go on reaching the build that now plays the talk
		if (focused) doc.frame.focus();
		on.talk?.(doc.talk);
		// the session as the new build holds it, its slide found again in a talk that changed since
		const said = doc.said;
		if (mode === "own" && said !== undefined && (session === undefined || said.revision >= session.revision)) {
			session = said;
			drawBlack();
			on.session?.(said);
		}
	}

	void open();

	return {
		command(command) {
			current?.post?.({ spool: "stage-command", command });
		},
		apply(next, nextMode, cut) {
			session = next;
			drawBlack();
			if (nextMode !== undefined) mode = nextMode;
			current?.post?.({
				spool: "stage-apply",
				session: next,
				...(nextMode === undefined ? {} : { mode: nextMode }),
				...(cut === true ? { cut: true } : {}),
			});
		},
		key(event) {
			const at = session;
			const talk = current?.talk ?? [];
			const read = readKey(
				pressedKey(event),
				{
					typing: typingIn(event.target),
					live: at !== undefined && talk[at.at.slide]?.live === true,
					keys: at?.keys === true,
					// the room's screen is black wherever the talk is shown from: any key brings it back, and does nothing else
					black: at?.black === true,
					frozen: at?.frozen !== null && at?.frozen !== undefined,
				},
				digits,
			);
			digits = read.digits;
			if (forget !== undefined) clearTimeout(forget);
			if (digits !== "") forget = setTimeout(() => (digits = ""), DIGITS_FORGET_MS);
			const command = read.command;
			if (command === undefined) return read.taken;
			const forHost = command.kind === "escape" || command.kind === "swap" || command.kind === "help";
			if (command.kind === "blur") {
				if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
			} else if (forHost || mode === "follow") on.command?.(command);
			else current?.post?.({ spool: "stage-command", command });
			return true;
		},
		reload() {
			void open();
		},
		focus() {
			current?.frame.focus();
		},
		session: () => session,
		talk: () => current?.talk ?? [],
		destroy() {
			destroyed = true;
			resize.disconnect();
			for (const doc of [current, incoming, veil]) doc?.stop();
			holder.remove();
		},
	};
}
