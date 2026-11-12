import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type MouseEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import type { Size } from "../../deck/deck-file";
import { parseTalkMessage, roomPasses, type TalkMessage, talkChannel } from "../../deck/present-wire";
import type { KeyCommand } from "../../deck/stage-keys";
import { type At, nextAt, roomPicture, type StageSession, type TalkSlide } from "../../deck/stage-session";
import type { SlideReadiness, StagePointer } from "../../deck/stage-wire";
import type { DeckRead } from "../../deck/wire";
import { mountStage, type StageHost } from "../../runtime/deck/stage-host";
import { cn } from "../cn";
import { desktopWindow, type RoomReport } from "../desktop-window";
import { attachHotkeyLayer } from "../hotkey-dispatch";
import { Button } from "../primitives/actions";
import { Kbd } from "../primitives/display";
import { type DeckMotion, useDeckMotion } from "./deck-motion";
import { KeyList } from "./key-list";
import {
	openRoom,
	type PresentAsk,
	pointerForRoom,
	pointerShown,
	roomScreens,
	showPointer,
	usePointerShown,
} from "./present";
import { presenterLayout } from "./presenter-layout";
import { RoomMenu } from "./room-menu";
import { talkSource } from "./talk-source";
import "./presenter.css";

/**
 * The presenter view (spool#265, the team canvas's `app/spool-deck--presenter`): spool's own window while a talk is
 * presented, and the one authority over where the talk is. The clock, the room's screen with its cues, the slide live
 * as the room sees it, what the next key plays, the beat's name, count and notes, and at the foot the talk as one bar
 * per slide with a segment per beat, each a way there. The room's name opens the room's menu (spool#315): Show pointer,
 * which L flips too, and the screen the room is on.
 *
 * It holds the stage that owns the talk's session and publishes each session whole to the room's window over the
 * talk's broadcast channel, answering the room as it opens or opens again; what the room's keys and clicks ask for it
 * carries out. A second stage, following, shows what the next key plays, or the room's own screen while a live slide
 * has the keys. The talk's keys are the stage's table, read here or in the stage where the focus is; nothing behind the
 * view hears a key while it is up. A slide that is broken or still loading is named beside its bar, and the one the
 * talk is on beside the slide.
 */

/** How long a room's window that said it was going has to come back, as a reload does, before it counts as closed. */
const ROOM_GONE_MS = 1500;
/** How long a room's window has to say it opened before the browser is taken to have kept it closed. */
const ROOM_PATIENCE_MS = 10_000;
/** How long L's cue says what it did. */
const POINTER_SAID_MS = 1800;
/** How long the next pane waits for a step to be on the presenter's slide and the room's screen before it follows. */
const PANE_WAITS_MS = 1500;

export interface PresenterProps {
	readonly ask: PresentAsk;
	/** the deck as last read: each slide's beats by name, and its notes */
	readonly deck: DeckRead | undefined;
	/** the talk's shape */
	readonly talk: Size;
	/** false while the chrome falls away around the slide, before the view is drawn */
	readonly shown: boolean;
	/** the stage drew its first picture of the talk */
	onPicture(): void;
	/** the talk ended, on this slide */
	onEnd(frame: string): void;
	/** the talk could not be played, and why */
	onRefused(why: string): void;
}

type RoomState = "opening" | "open" | "closed";

export function Presenter({ ask, deck, talk: screen, shown, onPicture, onEnd, onRefused }: PresenterProps) {
	const still = useReducedMotion() === true;
	const timing = useDeckMotion();
	const view = useRef<HTMLDivElement | null>(null);
	const slideBox = useRef<HTMLDivElement | null>(null);
	const nextBox = useRef<HTMLDivElement | null>(null);
	const window_ = useWindowSize();
	const layout = presenterLayout(window_, screen);
	const [session, setSession] = useState<StageSession | undefined>(undefined);
	const [said, setTalk] = useState<readonly TalkSlide[]>([]);
	/**
	 * the talk as its stage says it, and as the deck reads until the stage has: the view knows from its first frame what
	 * comes next, and never names the end of a talk it has not heard yet (spool#316)
	 */
	const talk = useMemo<readonly TalkSlide[]>(
		() =>
			said.length > 0
				? said
				: (deck?.slides ?? []).map((slide) => ({
						frame: slide.name,
						beats: Math.max(1, slide.beats.length),
						live: slide.live,
					})),
		[said, deck],
	);
	const [ready, setReady] = useState<readonly SlideReadiness[]>([]);
	const [room, setRoom] = useState<RoomState>("opening");
	const [help, setHelp] = useState(false);
	const [pointer, setPointer] = useState<StagePointer | null>(null);
	/** in the Mac app, the screen the room is on and whether X can trade it; a browser never says */
	const [screenOf, setScreenOf] = useState<RoomReport | null>(null);
	/** every display the room has been on this talk, in the order it was first there: how the menu names both */
	const [seen, setSeen] = useState<readonly string[]>([]);
	const [menu, setMenu] = useState(false);
	const pointerOn = usePointerShown();
	/** L pressed with the menu away: what it did, said for a moment */
	const [pointerSaid, setPointerSaid] = useState<{ readonly on: boolean } | null>(null);
	const clock = useTalkClock(ask.pressed);
	const hands = useRef({ onPicture, onEnd, onRefused, help, menu });
	hands.current = { onPicture, onEnd, onRefused, help, menu };
	/** where the pointer is over the live slide, whatever the room is told */
	const pointedAt = useRef<StagePointer | null>(null);
	const roomWindow = useRef(ask.room);
	const roomOpen = useRef(false);
	roomOpen.current = room === "open";
	const stage = useRef<{ main: StageHost; next: StageHost; say: (message: TalkMessage) => void } | null>(null);

	// the two stages and the channel to the room: for the talk's whole life
	useEffect(() => {
		const main = slideBox.current;
		const after = nextBox.current;
		if (main === null || after === null) return;
		const channel = new BroadcastChannel(talkChannel(ask.talk));
		const say = (message: TalkMessage) => channel.postMessage(message);
		const source = talkSource(ask.project, ask.page);
		const address = source.address;
		let pictured = false;
		let keys = false;
		const end = () => {
			const now = host.session();
			hands.current.onEnd(now === undefined ? ask.slide : (host.talk()[now.at.slide]?.frame ?? ask.slide));
		};
		const publish = () => {
			const now = host.session();
			const frame = now === undefined ? undefined : host.talk()[roomPicture(now).at.slide]?.frame;
			if (now !== undefined && frame !== undefined) say({ kind: "session", session: now, frame });
		};
		const ahead = (now: StageSession) => {
			if (now.keys) return now;
			const at = nextAt(host.talk(), now.at);
			return { ...now, at, keys: false, black: false, frozen: null };
		};
		/**
		 * What the next key plays, owed to the next pane until the step is on the presenter's slide and, while a room is
		 * open, on the room's screen: the pane shares their thread and the GPU, and nothing it starts may land on the key
		 * (spool#320). The talk's first session, and a change that moves neither picture (a slide writing `ui.state`),
		 * reach it at once.
		 */
		let owed: { session: StageSession; slide: At | undefined; room: number | undefined } | undefined;
		let owedTimer: ReturnType<typeof setTimeout> | undefined;
		let before: StageSession | undefined;
		const pay = () => {
			clearTimeout(owedTimer);
			if (owed !== undefined) next.apply(owed.session);
			owed = undefined;
		};
		const paid = () => {
			if (owed?.slide === undefined && owed?.room === undefined) pay();
		};
		const where = (picture: { at: At; takes: StageSession["takes"] }) => JSON.stringify([picture.at, picture.takes]);
		const follow = (now: StageSession) => {
			const was = before;
			before = now;
			const slideMoves = was !== undefined && where(was) !== where(now);
			const roomMoves = was !== undefined && where(roomPicture(was)) !== where(roomPicture(now));
			if (!slideMoves && !(roomMoves && roomOpen.current)) {
				if (owed === undefined) next.apply(ahead(now));
				else owed.session = ahead(now);
				return;
			}
			owed = {
				session: ahead(now),
				slide: slideMoves ? now.at : undefined,
				room: roomMoves && roomOpen.current ? now.revision : undefined,
			};
			clearTimeout(owedTimer);
			owedTimer = setTimeout(pay, PANE_WAITS_MS);
		};
		const app = desktopWindow();
		const carry = (command: KeyCommand) => {
			// the key list open over the view takes the keys pressed in a slide's document or the room's as well: esc
			// and ? close it, and nothing acts through it
			if (hands.current.help) {
				if (command.kind === "escape" || command.kind === "help") setHelp(false);
				return;
			}
			// esc with the room's menu open puts it away, and the talk goes on
			if (command.kind === "escape" && hands.current.menu) setMenu(false);
			else if (command.kind === "escape") end();
			else if (command.kind === "help") setHelp(true);
			else if (command.kind === "swap") app?.swapRoom?.(ask.talk);
			else if (command.kind === "show-pointer") {
				const on = !pointerShown();
				showPointer(on);
				// with the menu open its switch says it
				if (!hands.current.menu) setPointerSaid({ on });
			} else if (command.kind !== "blur") host.command(command);
		};
		// the Mac app places the room and says where: by the display's own name
		const heard = (report: RoomReport | null) => {
			if (report !== null && report.talk !== ask.talk) return;
			setScreenOf(report);
			const on = report?.screen ?? null;
			if (on !== null) setSeen((before) => (before.includes(on) ? before : [...before, on]));
		};
		const stopScreens = app?.onRoom?.(heard);
		const placed = () => void app?.roomReport?.(ask.talk).then(heard, () => {});
		// both stages put their first slide on at rest, as the picture the slide arrives as shows it
		const host = mountStage(main, {
			address,
			mode: "own",
			room: false,
			rest: true,
			frame: ask.slide,
			on: {
				talk: setTalk,
				session: (now) => {
					setSession(now);
					publish();
					follow(now);
					// a live slide given the keys hears them in its own document, and gives them back to the view
					if (now.keys !== keys) {
						keys = now.keys;
						if (keys) host.focus();
						else view.current?.focus({ preventScroll: true });
					}
				},
				slides: setReady,
				shown: (shown) => {
					if (
						owed?.slide !== undefined &&
						owed.slide.slide === shown.at.slide &&
						owed.slide.beat === shown.at.beat
					) {
						owed.slide = undefined;
						paid();
					}
					if (pictured) return;
					pictured = true;
					hands.current.onPicture();
				},
				command: carry,
				pointer: (at) => {
					pointedAt.current = at;
					setPointer(at);
					say({ kind: "pointer", at: pointerForRoom(at, pointerShown()) });
				},
				refused: (why) => {
					if (!pictured) hands.current.onRefused(why);
				},
			},
		});
		// what the next key plays, never touched: what its slides write is the talk's echo, not the talk's
		const next = mountStage(after, { address, mode: "follow", room: true, rest: true, frame: ask.slide });
		stage.current = { main: host, next, say };

		let gone: ReturnType<typeof setTimeout> | undefined;
		const opening = setTimeout(() => setRoom((now) => (now === "opening" ? "closed" : now)), ROOM_PATIENCE_MS);
		channel.addEventListener("message", (event) => {
			const message = parseTalkMessage(event.data);
			if (message === undefined) return;
			if (message.kind === "ask") {
				clearTimeout(gone);
				setRoom("open");
				publish();
				placed();
			} else if (message.kind === "gone") {
				clearTimeout(gone);
				gone = setTimeout(() => setRoom("closed"), ROOM_GONE_MS);
			} else if (message.kind === "shown") {
				if (owed?.room !== undefined && message.revision >= owed.room) {
					owed.room = undefined;
					paid();
				}
			} else if (message.kind === "command" && roomPasses(message.command)) carry(message.command);
		});
		// the window the browser handed over says itself when it closes, and sooner than its last word
		const watch = setInterval(() => {
			if (roomWindow.current?.closed === true) {
				roomWindow.current = null;
				setRoom("closed");
			}
		}, 500);

		// a saved change to the talk taken in place, by both stages, once the folder is quiet
		const stopHearing = source.follow(() => [host, next]);

		// closing or reloading spool's window ends the talk, and the room's window with it
		const leave = () => say({ kind: "end" });
		addEventListener("pagehide", leave);
		return () => {
			stopScreens?.();
			removeEventListener("pagehide", leave);
			stopHearing();
			clearTimeout(gone);
			clearTimeout(opening);
			clearTimeout(owedTimer);
			clearInterval(watch);
			say({ kind: "end" });
			channel.close();
			roomWindow.current?.close();
			host.destroy();
			next.destroy();
			stage.current = null;
		};
	}, [ask]);

	// Show pointer flipped: the room is told at once, nowhere while it is off, so a dot already drawn goes
	useEffect(() => {
		stage.current?.say({ kind: "pointer", at: pointerForRoom(pointedAt.current, pointerOn) });
	}, [pointerOn]);

	// L's cue goes after a moment
	useEffect(() => {
		if (pointerSaid === null) return;
		const timer = setTimeout(() => setPointerSaid(null), POINTER_SAID_MS);
		return () => clearTimeout(timer);
	}, [pointerSaid]);

	// the keyboard is the talk's while the view is up: nothing behind it hears a key, and spool's own keys rest
	useEffect(() => {
		view.current?.focus({ preventScroll: true });
		const down = (event: KeyboardEvent) => {
			event.stopPropagation();
			if (hands.current.help) {
				if (event.key === "Escape" || event.key === "?" || event.key === "Tab") event.preventDefault();
				if (event.key === "Escape" || event.key === "?") setHelp(false);
				return;
			}
			// esc puts the room's menu away before it would end the talk or take the keys back
			if (hands.current.menu && event.key === "Escape") {
				event.preventDefault();
				setMenu(false);
				return;
			}
			if (stage.current?.main.key(event) === true) event.preventDefault();
		};
		window.addEventListener("keydown", down, true);
		const rest = attachHotkeyLayer({ scope: "dialog", handlers: {} });
		return () => {
			window.removeEventListener("keydown", down, true);
			rest();
		};
	}, []);

	// the key list takes the focus from wherever it was (a slide's own document), and gives it back as it closes
	useEffect(() => {
		if (!help) return;
		const before = document.activeElement;
		view.current?.focus({ preventScroll: true });
		return () => {
			if (before instanceof HTMLElement && before.isConnected) before.focus({ preventScroll: true });
		};
	}, [help]);

	const at: At = session?.at ?? {
		slide: Math.max(
			0,
			talk.findIndex((slide) => slide.frame === ask.slide),
		),
		beat: 0,
	};
	const slide = talk[at.slide];
	const frame = slide?.frame ?? ask.slide;
	const read = deck?.slides.find((one) => one.name === frame);
	const beats = read?.beats ?? [];
	const note = read?.notes[at.beat] ?? "";
	const live = slide?.live === true;
	const keys = session?.keys === true;
	const after = nextAt(talk, at);
	const atEnd = after.slide === at.slide && after.beat === at.beat;
	const afterFrame = talk[after.slide]?.frame ?? frame;
	const afterBeat = deck?.slides.find((one) => one.name === afterFrame)?.beats[after.beat];
	const black = session?.black === true;
	const frozen = session?.frozen ?? null;
	const broken = ready.find((one) => one.frame === frame && one.status === "broken");
	const picture = session === undefined ? undefined : roomPicture(session);
	const roomLive = picture !== undefined && talk[picture.at.slide]?.live === true;
	const rect = layout.slide;
	const side = layout.side;
	const nextH = (side.w * screen.h) / screen.w;
	/** the view arriving around the slide, a part at a time */
	const arrive = (part: keyof DeckMotion["arrive"]) => ({
		initial: { opacity: 0, y: 8 },
		animate: shown ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 },
		transition: {
			duration: still ? 0 : timing.slower / 1000,
			ease: timing.out,
			delay: still || !shown ? 0 : timing.arrive[part] / 1000,
		},
	});
	const fade = { duration: still ? 0 : timing.base / 1000, ease: timing.out };
	const cue = (key: string, children: ReactNode, className?: string) => (
		<motion.span
			key={key}
			className={cn("flex min-w-0 items-center gap-2", className)}
			initial={{ opacity: 0, y: 4 }}
			animate={{ opacity: 1, y: 0 }}
			exit={{ opacity: 0, y: -4 }}
			transition={fade}
		>
			{children}
		</motion.span>
	);
	const app = desktopWindow();
	const swaps = screenOf?.swaps === true;
	const roomName = screenOf?.screen ?? "window";
	const reopen = () => {
		roomWindow.current = openRoom(ask, ask.talk);
		setRoom("opening");
	};
	const showRoom = () => (app?.showRoom !== undefined ? app.showRoom(ask.talk) : roomWindow.current?.focus());

	return (
		<div
			ref={view}
			tabIndex={-1}
			data-deck-presenter=""
			role="dialog"
			aria-modal="true"
			aria-label="Presenter view"
			className="fixed inset-0 z-50 overflow-hidden bg-surface-window font-sans text-primary antialiased outline-none"
			style={shown ? undefined : { opacity: 0, pointerEvents: "none" }}
		>
			{/* the head: the clock, the room's screen, the way out */}
			<motion.div
				data-deck-presenter-head=""
				className="absolute inset-x-10 top-0 flex h-[64px] items-center gap-4"
				{...arrive("head")}
			>
				<span className="text-primary tabular-nums type-page">{clock}</span>
				<div className="ml-auto flex min-w-0 items-center gap-5 type-value">
					{/* what the room is doing that the presenter is not seeing: one quiet cue beside its name */}
					<AnimatePresence mode="wait" initial={false}>
						{room === "closed"
							? cue("closed", <>The room's window is closed</>, "text-secondary type-detail")
							: screenOf?.unplugged !== undefined && screenOf.screen === null
								? cue(
										"unplugged",
										// a narrow window shortens the display's name, never what became of the room
										<>
											<span className="truncate">{screenOf.unplugged} was unplugged </span>
											<span className="shrink-0">· the room is a window</span>
										</>,
										"text-secondary type-detail",
									)
								: black
									? cue("black", <>The room's screen is black · any key</>, "text-secondary type-detail")
									: frozen !== null
										? cue(
												"frozen",
												<>
													The room is held on {nameOf(talk[frozen.at.slide]?.frame ?? frame)} <Kbd>F</Kbd>
												</>,
												"text-secondary type-detail",
											)
										: pointerSaid !== null
											? cue(
													pointerSaid.on ? "pointer-on" : "pointer-off",
													<>
														{pointerSaid.on
															? "The room sees your pointer"
															: "The room doesn't see your pointer"}{" "}
														<Kbd>L</Kbd>
													</>,
													"text-secondary type-detail",
												)
											: null}
					</AnimatePresence>
					<RoomMenu
						room={roomName}
						screens={roomScreens(seen, screenOf?.screen ?? null, swaps)}
						closed={room === "closed"}
						onReopen={reopen}
						onSwap={() => app?.swapRoom?.(ask.talk)}
						onShow={showRoom}
						pointer={pointerOn}
						onPointer={showPointer}
						open={menu}
						onOpen={setMenu}
					>
						<AnimatePresence mode="wait" initial={false}>
							{room === "closed" ? cue("again", "open it again") : cue(`on ${roomName}`, roomName)}
						</AnimatePresence>
					</RoomMenu>
					<Button
						variant="ghost"
						// its words, not its wash, end where the column below does
						className="-mr-3 gap-2 type-value"
						onClick={() => stage.current !== null && onEnd(frame)}
						title="End the talk · esc"
					>
						End <Kbd>esc</Kbd>
					</Button>
				</div>
			</motion.div>

			{/* the slide, live, as the room sees it */}
			<div className="absolute" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}>
				<div ref={slideBox} data-deck-slide="" className="relative h-full w-full overflow-hidden rounded-md" />
				{/* who has the keys: while they are the slide's, it wears the focus line */}
				<div
					aria-hidden="true"
					className={cn(
						"pointer-events-none absolute -inset-[5px] rounded-[10px] border-[1.5px] border-line-focus transition-[opacity,scale] duration-slow ease-out",
						keys ? "scale-100 opacity-100" : "scale-[0.99] opacity-0",
					)}
				/>
				<div
					className="absolute inset-x-0 flex h-6 items-center justify-between gap-6 type-detail"
					style={{ top: rect.h + 14 }}
				>
					<AnimatePresence mode="wait" initial={false}>
						{live
							? keys
								? cue(
										"slide",
										<>
											{nameOf(frame)} has the keys <Kbd>esc</Kbd>
										</>,
										"text-secondary",
									)
								: cue(
										"talk",
										<>
											<Kbd>⇥</Kbd> keys to {nameOf(frame)}
										</>,
										"text-tertiary",
									)
							: null}
					</AnimatePresence>
					{broken === undefined ? null : (
						<span data-deck-broken={frame} className="ml-auto min-w-0 truncate text-danger-strong">
							{brokenSaid(broken)}
						</span>
					)}
				</div>
			</div>

			{/* the right: what the next key plays (the room, while the slide has the keys), then this beat's notes */}
			<motion.div
				className="absolute bottom-0"
				style={{ top: side.top, left: side.x, width: side.w }}
				{...arrive("side")}
			>
				<div className="flex h-5 items-center gap-2 text-secondary type-detail">
					<span>{keys ? "room" : "next"}</span>
					<span className="truncate text-tertiary">
						{keys
							? "what they see"
							: atEnd
								? "the end"
								: after.beat > 0 && afterBeat !== undefined
									? `${nameOf(afterFrame)} · ${afterBeat}`
									: nameOf(afterFrame)}
					</span>
				</div>
				<div className="relative mt-2 overflow-hidden rounded-md" style={{ width: side.w, height: nextH }}>
					<div ref={nextBox} className="absolute inset-0" />
					{/* never touched: what it shows is only a look ahead */}
					<div className="absolute inset-0 z-10" />
					{keys ? (
						<SoftDot
							at={pointer}
							shown={roomLive && !black && frozen === null && pointerOn}
							box={{ w: side.w, h: nextH }}
							timing={timing}
						/>
					) : null}
					<AnimatePresence initial={false}>
						{atEnd && !keys ? (
							<motion.div
								key="end"
								className="absolute inset-0 z-10 flex items-center justify-center bg-surface-window text-tertiary type-detail"
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								exit={{ opacity: 0 }}
								transition={{ duration: still ? 0 : timing.slow / 1000, ease: timing.out }}
							>
								end of the talk
							</motion.div>
						) : null}
					</AnimatePresence>
				</div>

				<div className="mt-9 flex h-5 items-center gap-2 text-secondary type-detail">
					<span>notes</span>
					{beats.length > 1 ? (
						<span className="text-tertiary tabular-nums">
							{at.beat + 1} of {beats.length} · {beats[at.beat]}
						</span>
					) : null}
				</div>
				<div className="relative mt-3">
					<AnimatePresence mode="popLayout" initial={false}>
						<motion.p
							key={`${at.slide}-${frame}-${at.beat}`}
							className="text-lg leading-lg text-primary"
							initial={{ opacity: 0, y: 10 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: -10 }}
							transition={{ duration: still ? 0 : timing.notes / 1000, ease: timing.snap }}
						>
							{note === "" ? <span className="text-tertiary">No notes for this beat.</span> : note}
						</motion.p>
					</AnimatePresence>
				</div>
			</motion.div>

			{/* the foot: one bar per slide, a segment per beat */}
			<motion.div className="absolute inset-x-10 bottom-14" {...arrive("foot")}>
				<TalkLine
					at={at}
					talk={talk}
					deck={deck}
					ready={ready}
					onGo={(slide, beat) => stage.current?.main.command({ kind: "go", slide, beat })}
				/>
			</motion.div>

			{help ? <KeyList place={{ at: "presenter", swaps }} onClose={() => setHelp(false)} /> : null}
		</div>
	);
}

/** What the presenter is told of a broken slide, beside it: why, and what the room kept. */
function brokenSaid(slide: SlideReadiness): string {
	const why = (slide.why ?? "").split("\n")[0]?.trim() || "it broke";
	const kept =
		slide.kept === "picture"
			? " · the room keeps its last picture"
			: slide.kept === "picture-without-webgl"
				? " · the room keeps its last picture, but not what WebGL drew"
				: " · the room keeps the slide it had";
	return `${nameOf(slide.frame)} will not show: ${why}${kept}`;
}

const nameOf = (frame: string): string => frame.slice(frame.lastIndexOf("/") + 1);

/** The talk as its names, each with a segment per beat: past in grey, here in the thread; one pressed goes there. */
function TalkLine({
	at,
	talk,
	deck,
	ready,
	onGo,
}: {
	at: At;
	talk: readonly TalkSlide[];
	deck: DeckRead | undefined;
	ready: readonly SlideReadiness[];
	onGo: (slide: number, beat: number) => void;
}) {
	// a click here moves the talk and leaves the focus, and the keys, where they were
	const keepFocus = (event: MouseEvent) => event.preventDefault();
	return (
		<div className="flex w-full gap-4">
			{talk.map((slide, index) => {
				const names = deck?.slides.find((one) => one.name === slide.frame)?.beats ?? [];
				const beats = Array.from(
					{ length: Math.max(1, slide.beats) },
					(_, beat) => names[beat] ?? `beat ${beat + 1}`,
				);
				const here = index === at.slide;
				const state = ready.find((one) => one.frame === slide.frame)?.status;
				return (
					<div key={slide.frame} className="flex min-w-0 flex-col gap-2" style={{ flex: beats.length + 1 }}>
						<button
							type="button"
							title={`${nameOf(slide.frame)} · ${index + 1} ↵`}
							onMouseDown={keepFocus}
							onClick={() => onGo(index, 0)}
							className={cn(
								"flex min-w-0 cursor-pointer items-baseline gap-1.5 text-left transition-colors duration-base ease-out type-value",
								here
									? "text-primary"
									: index < at.slide
										? "text-secondary"
										: "text-tertiary hover:text-secondary",
							)}
						>
							<span className="truncate">{nameOf(slide.frame)}</span>
							{state === "broken" ? (
								<span className="shrink-0 text-danger-strong type-detail">broken</span>
							) : state === "loading" ? (
								<span className="shrink-0 text-tertiary type-detail">loading</span>
							) : null}
						</button>
						<div className="flex gap-1">
							{beats.map((name, beat) => {
								const past = index < at.slide || (here && beat < at.beat);
								const now = here && beat === at.beat;
								return (
									<button
										// biome-ignore lint/suspicious/noArrayIndexKey: a slide's beats, in their fixed order
										key={beat}
										type="button"
										aria-label={`${nameOf(slide.frame)}, ${name}`}
										onMouseDown={keepFocus}
										onClick={() => onGo(index, beat)}
										className="group flex h-3 flex-1 cursor-pointer items-center"
									>
										<span
											className={cn(
												"h-[3px] w-full rounded-full transition-colors duration-base ease-out",
												now
													? "bg-accent"
													: past
														? "bg-secondary"
														: "bg-line-strong group-hover:bg-tertiary",
											)}
										/>
									</button>
								);
							})}
						</div>
					</div>
				);
			})}
		</div>
	);
}

/** The presenter's pointer as the room sees it, over the room's view in the right-hand column: one soft dot. */
function SoftDot({
	at,
	shown,
	box,
	timing,
}: {
	at: StagePointer | null;
	shown: boolean;
	box: Size;
	timing: DeckMotion;
}) {
	const size = Math.max(10, box.w / 60);
	const on = shown && at !== null;
	return (
		<motion.span
			aria-hidden="true"
			className="pointer-events-none absolute top-0 left-0 z-10 rounded-full bg-primary/55"
			style={{ width: size, height: size, filter: `blur(${size / 8}px)` }}
			initial={false}
			animate={{
				x: (at?.x ?? 0.5) * box.w - size / 2,
				y: (at?.y ?? 0.5) * box.h - size / 2,
				opacity: on ? 1 : 0,
				scale: on ? 1 : 0.6,
			}}
			transition={{
				x: { type: "spring", ...timing.pointer },
				y: { type: "spring", ...timing.pointer },
				opacity: { duration: timing.base / 1000, ease: timing.out },
				scale: { duration: timing.base / 1000, ease: timing.out },
			}}
		/>
	);
}

/** mm:ss since the talk began, ticking. */
function useTalkClock(startedAt: number): string {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const id = window.setInterval(() => setNow(Date.now()), 1000);
		return () => window.clearInterval(id);
	}, []);
	const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
	return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

/** The window's inner size, kept current. */
export function useWindowSize(): Size {
	const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
	useEffect(() => {
		const resized = () => setSize({ w: window.innerWidth, h: window.innerHeight });
		window.addEventListener("resize", resized);
		return () => window.removeEventListener("resize", resized);
	}, []);
	return size;
}
