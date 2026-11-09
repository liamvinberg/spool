import { AnimatePresence, motion } from "motion/react";
import { type ComponentProps, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentEngineId } from "../../daemon/agent-engine";
import { type MachineAgent, PI_KEY_PROVIDERS, type PiKeyProvider } from "../../daemon/agent-setup";
import type { CloudAccountState } from "../../daemon/cloud-account";
import { postAgentCode, postAgentSetup } from "../api";
import { CommandLine } from "../canvas/agent-float";
import { cn } from "../cn";
import type { DesktopWindow } from "../desktop-window";
import { attachHotkeyLayer } from "../hotkey-dispatch";
import { CheckIcon, RibbonMark } from "../icons";
import { Button, IconButton, ToggleButton } from "../primitives/actions";
import { SpinRing } from "../primitives/display";
import { TextField } from "../primitives/inputs";
import { type Aim, Glow } from "./glow";
import {
	AgentGlyph,
	AgentTiles,
	EASE,
	Glyph,
	Head,
	Ok,
	Primary,
	Row,
	Secondary,
	SoundIcon,
	SPRING,
	TeamTags,
} from "./parts";
import { type PiKeyState, usePiKey } from "./pi-key";
import { prepareField, Ripple, T } from "./ripple";
import {
	audioCanStart,
	closeAudio,
	heardNow,
	playSound,
	preloadSounds,
	SETUP_SHOWN,
	SOUNDS,
	setMuted,
	unlockAudio,
} from "./sounds";
import {
	AGENT_COPY,
	AGENT_ROWS,
	agentsContinue,
	agentsHeadline,
	backFrom,
	CLOUD_OFFER,
	DOTS,
	dotOf,
	isReady,
	type RowAction,
	rowAction,
	type Step,
} from "./steps";

/**
 * spool's first run (spool#250): the ripple open, the agents, Try Spool Cloud, and the
 * small window growing into spool's, onto Home.
 *
 * It is one ordinary window throughout. In the Mac app the window itself is small, sized
 * to each step, and grows when it is done (`DesktopWindow.setupWindow`); in a browser, or
 * where the window can't change (full screen), the page draws the same small box in the
 * middle of the window and grows it there. Skip setup is at the head of every step.
 */

/** Each step's size, and how tall its light band is: the open's light is the whole window. */
const SIZE: Record<Step, { w: number; h: number; band: number }> = {
	open: { w: 560, h: 480, band: 480 },
	agents: { w: 560, h: 532, band: 132 },
	pi: { w: 560, h: 640, band: 132 },
	cloud: { w: 560, h: 616, band: 148 },
};
const FOOT = 56;

/** chords' loudness every 0.1 s, smoothed over half a second, peak 1: the light's strength and drift follow it */
const ENVELOPE = [
	0.07, 0.09, 0.11, 0.14, 0.17, 0.2, 0.24, 0.27, 0.3, 0.33, 0.35, 0.36, 0.39, 0.42, 0.46, 0.49, 0.52, 0.55, 0.56, 0.57,
	0.59, 0.61, 0.64, 0.67, 0.7, 0.72, 0.72, 0.72, 0.73, 0.74, 0.77, 0.81, 0.86, 0.88, 0.88, 0.88, 0.89, 0.9, 0.93, 0.96,
	0.99, 0.99, 1, 1, 1, 0.99, 0.98, 0.95, 0.9, 0.87, 0.84, 0.81, 0.76, 0.72, 0.65, 0.58, 0.51, 0.44, 0.39, 0.33, 0.29,
	0.25, 0.22, 0.18, 0.15, 0.13, 0.1, 0.08, 0.07, 0.05, 0.04, 0.03, 0.02,
] as const;
/** the light lands in the mark on the chord's peak */
const PEAK = 4.5;

const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The window's size as it is now, again on every resize: the Mac app's window changes size after the page asks. */
function useViewport() {
	const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
	useEffect(() => {
		const read = () => setSize({ w: window.innerWidth, h: window.innerHeight });
		window.addEventListener("resize", read);
		read();
		return () => window.removeEventListener("resize", read);
	}, []);
	return size;
}

export interface FirstRunProps {
	/** the machine's agents, as the daemon last said them; null until it has */
	agents: readonly MachineAgent[] | null;
	/** asks every agent again: after a sign-in pi only takes from a terminal */
	onRecheck: () => void;
	account: CloudAccountState;
	/** the cloud sign-in Home's foot starts, in the browser */
	onSignIn: () => void;
	onCancelSignIn: () => void;
	/** done or skipped: the window has grown; `team` when the trial is to start, with New team */
	onDone: (then: { team: boolean }) => void;
	/** the Mac app's window, which the first run makes small and grows; none in a browser */
	appWindow?: DesktopWindow | undefined;
}

export function FirstRun({ agents, onRecheck, account, onSignIn, onCancelSignIn, onDone, appWindow }: FirstRunProps) {
	const [step, setStep] = useState<Step>("open");
	const [dir, setDir] = useState(1);
	const [words, setWords] = useState(false);
	const [muted, setMute] = useState(false);
	const [sel, setSel] = useState(0);
	const [piSel, setPiSel] = useState(0);
	const [linesOpen, setLinesOpen] = useState(false);
	const [growing, setGrowing] = useState<{ team: boolean } | null>(null);
	const [cloud, setCloud] = useState<"offer" | "waiting">("offer");
	/** the window itself is the small box; false while the page draws it in a bigger window */
	const [native, setNative] = useState(appWindow?.setupWindow !== undefined);
	/** when the open started, its light and sound together; null while it waits to be let play */
	const [startedAt, setStartedAt] = useState<number | null>(null);
	/** the open, before it starts: waiting for the Mac app to show the window, or for a press where sound needs one */
	const [gate, setGate] = useState<"waiting" | "press">("waiting");
	const [skipped, setSkipped] = useState(false);
	const [refused, setRefused] = useState<string | null>(null);
	const [code, setCode] = useState("");
	const piKeyField = usePiKey();
	const piKey = piKeyField.state;
	/** the agents ready when the step first read them: spool found them rather than set them up */
	const [found, setFound] = useState<readonly AgentEngineId[] | null>(null);
	const playing = useRef<AbortController | null>(null);
	/** the audio clock time at which the chord's first moment is heard; null while silent */
	const heardZero = useRef<number | null>(null);

	const rows = useMemo(() => agents ?? [], [agents]);
	useEffect(() => {
		if (found === null && agents !== null) setFound(agents.filter(isReady).map((agent) => agent.id));
	}, [agents, found]);

	/* ------------------------------------------------------------- the sound -- */

	/** the chord from `from` seconds in, and the bloom on its peak, placed on the chord's own clock */
	const play = useCallback((from: number) => {
		playing.current?.abort();
		heardZero.current = null;
		const run = new AbortController();
		playing.current = run;
		const strikeAt = PEAK - SOUNDS.bloom.strike;
		if (from >= SOUNDS.chords.ends) return;
		void playSound(SOUNDS.chords.url, SOUNDS.chords.volume, {
			from,
			signal: run.signal,
			onScheduled: (at) => {
				if (run.signal.aborted) return;
				heardZero.current = at - from;
				// however late the chord starts (an output waking up, a slow decode), the accent stays on it
				if (from < strikeAt)
					void playSound(SOUNDS.bloom.url, SOUNDS.bloom.volume, {
						when: at - from + strikeAt,
						signal: run.signal,
					});
			},
		});
	}, []);

	const startedRef = useRef(false);
	/** the open, light and sound at once; called inside a press (or the app's own), where audio may start */
	const begin = useCallback(() => {
		if (startedRef.current) return;
		startedRef.current = true;
		unlockAudio();
		setStartedAt(performance.now());
		play(0);
	}, [play]);

	useEffect(() => {
		// the mark's distance field is made at once, so the light starts on time
		prepareField();
		let live = true;
		let late = 0;
		// the Mac app starts the open with a press of its own as it shows the window; an app too old to waits as a browser
		const shown = () => begin();
		// a browser lets sound start only after a press: the open waits for one rather than playing silent
		const askBrowser = () =>
			void audioCanStart().then((can) => {
				if (!live || startedRef.current) return;
				if (can) begin();
				else setGate("press");
			});
		if (reducedMotion()) {
			startedRef.current = true;
			setStartedAt(performance.now());
		} else {
			void preloadSounds(SOUNDS.chords.url, SOUNDS.bloom.url);
			if (appWindow?.setupWindow === undefined) askBrowser();
			else {
				window.addEventListener(SETUP_SHOWN, shown);
				late = window.setTimeout(askBrowser, 1500);
			}
		}
		return () => {
			live = false;
			window.removeEventListener(SETUP_SHOWN, shown);
			clearTimeout(late);
			playing.current?.abort();
			setMuted(false);
			closeAudio();
		};
	}, [begin, appWindow]);

	/** the picture's clock: the chord as heard while it plays, the wall clock while muted or before it sounds */
	const clock = useCallback(() => {
		if (skipped) return T.still;
		const heard = heardNow();
		const wall = (performance.now() - (startedAt ?? performance.now())) / 1000;
		if (heardZero.current === null || heard === null) return wall;
		return heard - heardZero.current;
	}, [startedAt, skipped]);

	const toggleMute = () => {
		const next = !muted;
		setMute(next);
		setMuted(next);
		if (next) {
			playing.current?.abort();
			heardZero.current = null;
		} else if (step === "open" && !skipped && startedAt !== null) play((performance.now() - startedAt) / 1000);
	};

	/* ------------------------------------------------------------ the window -- */

	const size = SIZE[step];
	const viewport = useViewport();
	useEffect(() => {
		if (growing !== null || appWindow?.setupWindow === undefined) return;
		let live = true;
		void appWindow.setupWindow({ w: size.w, h: size.h }).then(
			(changed) => live && setNative(changed),
			() => live && setNative(false),
		);
		return () => {
			live = false;
		};
	}, [appWindow, size.w, size.h, growing]);

	const doneRef = useRef(onDone);
	doneRef.current = onDone;
	const grow = useCallback(
		(then: { team: boolean }) => {
			playing.current?.abort();
			setGrowing(then);
			void appWindow?.setupWindow?.("grow").catch(() => false);
			// the window grows (the Mac's own frame animation, or the box here), then the first run fades onto Home
			window.setTimeout(() => doneRef.current(then), reducedMotion() ? 0 : 900);
		},
		[appWindow],
	);

	/* ------------------------------------------------------------ the steps -- */

	const go = (next: Step) => {
		const order: Step[] = ["open", "agents", "pi", "cloud"];
		setDir(order.indexOf(next) < order.indexOf(step) ? -1 : 1);
		setLinesOpen(false);
		setRefused(null);
		setStep(next);
	};
	const skipOpen = () => {
		startedRef.current = true;
		setStartedAt((was) => was ?? performance.now());
		setSkipped(true);
		setWords(true);
		playing.current?.abort();
	};

	const selected = rows[sel];
	const selectedAction = selected === undefined ? null : rowAction(selected, rows);

	const act = (action: RowAction | null, agent: MachineAgent | undefined) => {
		if (agent === undefined) return;
		if (action === null) return continueAgents();
		setRefused(null);
		if (action.kind === "pi") {
			setPiSel(0);
			return go("pi");
		}
		if (action.kind === "copy") {
			void navigator.clipboard?.writeText(action.line).catch(() => {});
			return;
		}
		if (action.kind === "wait" || !action.can) return;
		void postAgentSetup(agent.id, action.kind).then((said) => said !== undefined && setRefused(said));
	};
	const continueAgents = () => {
		if (agentsContinue(rows).can) go("cloud");
	};
	const actAgent = (i: number) => {
		const agent = rows[i];
		// a sign-in waiting on a code takes the code from the field under the rows
		if (agent?.job?.kind === "sign-in" && agent.job.asksCode && code.trim() !== "") return sendCode(agent.id);
		act(agent === undefined ? null : rowAction(agent, rows), agent);
	};
	const sendCode = (id: AgentEngineId) => {
		const typed = code.trim();
		if (typed === "") return;
		setCode("");
		void postAgentCode(id, typed).then((said) => said !== undefined && setRefused(said));
	};

	const pi = rows.find((agent) => agent.id === "pi");
	const actPi = (i: number) => {
		if (i === 2) {
			if (piKey.check === "ok") return go("agents");
			return piKeyField.check();
		}
		// a plan's sign-in happens inside pi itself: the steps are on the row, and return asks pi again
		onRecheck();
		if (pi !== undefined && isReady(pi)) go("agents");
	};

	const startTrial = () => {
		if (account.state === "signed-in") return grow({ team: true });
		setCloud("waiting");
		onSignIn();
	};
	const notNow = () => {
		if (cloud === "waiting") onCancelSignIn();
		grow({ team: false });
	};
	// the sign-in finished in the browser: the window grows onto Home, where New team asks the team's name
	useEffect(() => {
		if (cloud !== "waiting") return;
		if (account.state === "signed-in") grow({ team: true });
		else if (account.state === "signed-out") setCloud("offer");
	}, [cloud, account.state, grow]);

	/* -------------------------------------------------------------- the keys -- */

	const keys = useRef({ go: () => {}, back: () => {}, move: (_by: number) => {}, mute: () => {} });
	keys.current = {
		go: () => {
			if (step === "open")
				return words ? go("agents") : startedAt === null && gate === "press" ? begin() : skipOpen();
			if (step === "agents") return actAgent(sel);
			if (step === "pi") return actPi(piSel);
			startTrial();
		},
		back: () => {
			if (step === "open") return words ? undefined : skipOpen();
			if (step === "cloud") return notNow();
			const to = backFrom(step);
			if (to !== null) go(to);
		},
		move: (by) => {
			if (step === "agents") setSel((s) => (s + by + AGENT_ROWS.length) % AGENT_ROWS.length);
			if (step === "pi") setPiSel((s) => (s + by + 3) % 3);
		},
		mute: toggleMute,
	};
	useEffect(
		() =>
			attachHotkeyLayer({
				scope: "setup",
				active: () => growingRef.current === null,
				handlers: {
					"firstRun.go": (event) => {
						event?.preventDefault();
						keys.current.go();
					},
					"firstRun.back": () => keys.current.back(),
					"firstRun.up": (event) => {
						event?.preventDefault();
						keys.current.move(-1);
					},
					"firstRun.down": (event) => {
						event?.preventDefault();
						keys.current.move(1);
					},
					"firstRun.mute": () => keys.current.mute(),
				},
			}),
		[],
	);
	const growingRef = useRef(growing);
	growingRef.current = growing;

	/* -------------------------------------------------------------- the light -- */

	const lit = rows.filter(isReady).length;
	const aim: Aim = {
		x: step === "agents" ? 0.5 + (sel - 1) * 0.13 : step === "pi" ? 0.72 : 0.5,
		y: 1.14,
		rx: 0.5,
		ry: 0.95,
		amount: 0.72 + Math.min(lit, 2) * 0.08,
		heat: 0.3,
		speed: 1,
		tau: 900,
	};

	/* -------------------------------------------------------------- the box -- */

	const still = reducedMotion();
	const box =
		native || growing !== null
			? { width: viewport.w, height: viewport.h }
			: { width: Math.min(size.w, viewport.w), height: Math.min(size.h, viewport.h) };

	return (
		<motion.div
			data-first-run={step}
			className="fixed inset-0 z-50 grid place-items-center bg-surface-canvas [color-scheme:dark]"
			initial={false}
			animate={{ opacity: growing !== null ? 0 : 1 }}
			transition={{ duration: still ? 0 : 0.5, ease: EASE, delay: still ? 0 : 0.4 }}
		>
			<motion.div
				role="dialog"
				aria-label="Set up spool"
				aria-modal="true"
				className={cn(
					"relative overflow-hidden bg-surface-window text-primary",
					!native && growing === null && "rounded-xl border border-line-strong",
				)}
				initial={false}
				animate={box}
				transition={
					// the Mac app's window is the box: it follows the window's own frame exactly, never springs after it
					still || native
						? { duration: 0 }
						: growing !== null
							? { type: "spring", duration: 1.15, bounce: 0.08 }
							: SPRING
				}
			>
				{/* the window drags by its head, as spool's bar does */}
				<div data-first-run-head="" className="absolute inset-x-0 top-0 z-20 h-10" />

				{step === "open" ? (
					<OpenStep
						startedAt={startedAt}
						gate={gate}
						onOpen={begin}
						clock={clock}
						words={words}
						onWords={() => setWords(true)}
						onContinue={() => go("agents")}
					/>
				) : (
					<>
						<motion.div
							className="absolute inset-x-0 top-0 overflow-hidden"
							initial={false}
							animate={{ height: size.band }}
							transition={still ? { duration: 0 } : SPRING}
						>
							<Glow aim={aim} />
							<div className="absolute inset-0 grid place-items-center">
								<AnimatePresence mode="popLayout" initial={false}>
									{step === "cloud" ? (
										<motion.div
											key="team"
											initial={{ opacity: 0, y: 14 }}
											animate={{ opacity: 1, y: 0 }}
											exit={{ opacity: 0, y: -12 }}
											transition={{ duration: 0.4, ease: EASE }}
										>
											<TeamTags gathered={cloud === "waiting"} />
										</motion.div>
									) : (
										<motion.div
											key="agents"
											initial={{ opacity: 0, y: 14 }}
											animate={{ opacity: 1, y: 0 }}
											exit={{ opacity: 0, y: -12 }}
											transition={{ duration: 0.4, ease: EASE }}
										>
											<AgentTiles
												tiles={AGENT_ROWS.map((who) => {
													const agent = rows.find((one) => one.id === who);
													return {
														who,
														phase:
															agent === undefined
																? "absent"
																: isReady(agent)
																	? "ready"
																	: agent.job?.state === "running"
																		? "busy"
																		: "absent",
													};
												})}
											/>
										</motion.div>
									)}
								</AnimatePresence>
							</div>
							<div className="absolute inset-x-0 bottom-0 h-px bg-line-strong" />
						</motion.div>

						<motion.div
							className="absolute inset-x-0"
							initial={false}
							animate={{ top: size.band, bottom: FOOT }}
							transition={still ? { duration: 0 } : SPRING}
						>
							<AnimatePresence mode="popLayout" initial={false} custom={dir}>
								<motion.div
									key={step}
									custom={dir}
									variants={{
										enter: (d: number) => ({ opacity: 0, x: d * 32, filter: "blur(4px)" }),
										center: { opacity: 1, x: 0, filter: "blur(0px)" },
										exit: (d: number) => ({ opacity: 0, x: d * -32, filter: "blur(4px)" }),
									}}
									initial={still ? false : "enter"}
									animate="center"
									exit="exit"
									transition={{ duration: still ? 0 : 0.42, ease: EASE }}
									className="absolute inset-0 overflow-y-auto px-8 pt-7"
								>
									{step === "agents" ? (
										<AgentsPage
											agents={rows}
											found={found ?? []}
											sel={sel}
											onSel={setSel}
											onAct={actAgent}
											code={code}
											onCode={setCode}
											refused={refused}
										/>
									) : step === "pi" ? (
										<PiPage
											sel={piSel}
											onSel={setPiSel}
											onAct={actPi}
											piKey={piKey}
											onProvider={piKeyField.setProvider}
											onKey={piKeyField.setKey}
										/>
									) : (
										<CloudPage />
									)}
								</motion.div>
							</AnimatePresence>
						</motion.div>

						<div
							className="absolute inset-x-0 bottom-0 flex items-center gap-2 border-line-default border-t px-4"
							style={{ height: FOOT }}
						>
							<Dots at={dotOf(step)} />
							{step === "agents" ? (
								<Button
									variant="ghost"
									size="sm"
									className="ml-2"
									aria-expanded={linesOpen}
									disabled={!selected?.job}
									onClick={() => setLinesOpen((was) => !was)}
								>
									{linesOpen ? "Hide what spool ran" : "What spool ran"}
								</Button>
							) : null}
							<span className="flex-1" />
							{step === "agents" ? (
								<>
									{rows.some(isReady) ? (
										<Secondary onClick={() => go("open")}>Back</Secondary>
									) : (
										<Secondary onClick={() => go("cloud")} esc={false}>
											Set up later
										</Secondary>
									)}
									{selectedAction === null ? (
										<Primary onClick={continueAgents} disabled={!agentsContinue(rows).can}>
											{agentsContinue(rows).label}
										</Primary>
									) : selected?.job?.kind === "sign-in" && selected.job.asksCode ? (
										<Primary onClick={() => sendCode(selected.id)} disabled={code.trim() === ""}>
											Send the code
										</Primary>
									) : (
										<Primary
											onClick={() => act(selectedAction, selected)}
											disabled={
												selectedAction.kind === "wait" || ("can" in selectedAction && !selectedAction.can)
											}
											loading={selectedAction.kind === "wait"}
										>
											{selectedAction.label}
										</Primary>
									)}
								</>
							) : step === "pi" ? (
								<>
									<Secondary onClick={() => go("agents")}>Back</Secondary>
									<Primary
										onClick={() => actPi(piSel)}
										disabled={piSel === 2 && piKey.key.trim() === "" && piKey.check !== "ok"}
										loading={piSel === 2 && piKey.check === "checking"}
									>
										{piSel === 2
											? piKey.check === "ok"
												? "Done"
												: piKey.check === "checking"
													? "Checking"
													: piKey.check === "unsure"
														? "Save anyway"
														: "Check key"
											: pi !== undefined && isReady(pi)
												? "Done"
												: "Check again"}
									</Primary>
								</>
							) : (
								<>
									<Secondary onClick={notNow}>Not now</Secondary>
									<Primary onClick={startTrial} loading={cloud === "waiting"}>
										{cloud === "waiting" ? "Waiting for spool.page" : "Start free trial"}
									</Primary>
								</>
							)}
						</div>
						{step === "agents" ? <Lines lines={selected?.job?.lines ?? []} open={linesOpen} /> : null}
					</>
				)}

				<div className="absolute top-2.5 right-3 z-30 flex items-center gap-1">
					<Button variant="ghost" size="sm" onClick={() => grow({ team: false })}>
						Skip setup
					</Button>
					<IconButton
						label={muted ? "Turn the sound on" : "Mute the sound"}
						icon={<SoundIcon muted={muted} />}
						pressed={muted}
						onClick={toggleMute}
					/>
				</div>
			</motion.div>
		</motion.div>
	);
}

/* ----------------------------------------------------------------- the open -- */

function OpenStep({
	startedAt,
	gate,
	onOpen,
	clock,
	words,
	onWords,
	onContinue,
}: {
	startedAt: number | null;
	gate: "waiting" | "press";
	onOpen: () => void;
	clock: () => number;
	words: boolean;
	onWords: () => void;
	onContinue: () => void;
}) {
	const rise = (delay: number) => ({
		initial: { opacity: 0, y: 6, filter: "blur(3px)" },
		animate: words ? { opacity: 1, y: 0, filter: "blur(0px)" } : { opacity: 0, y: 6, filter: "blur(3px)" },
		transition: { duration: reducedMotion() ? 0 : 0.8, ease: EASE, delay: words && !reducedMotion() ? delay : 0 },
	});
	if (startedAt === null)
		return gate === "press" ? (
			<div className="absolute inset-0 grid place-items-center">
				<motion.button
					type="button"
					onClick={onOpen}
					className="group flex w-[140px] flex-col items-center gap-3 outline-none"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					transition={{ duration: 0.6, ease: EASE }}
				>
					<span className="grid size-[84px] place-items-center rounded-[20px] border border-line-default bg-surface-window transition-colors duration-base ease-out group-hover:border-line-strong group-focus-visible:border-line-strong">
						<RibbonMark className="h-[44px]" />
					</span>
					<span className="text-tertiary type-label transition-colors duration-base ease-out group-hover:text-secondary group-focus-visible:text-secondary">
						Open spool
					</span>
				</motion.button>
			</div>
		) : null;
	return (
		<>
			<Ripple startedAt={startedAt} clock={clock} envelope={ENVELOPE} onWords={onWords} />
			<div className="absolute inset-x-0 top-[170px] flex flex-col items-center px-12 text-center">
				<motion.h1 className="text-primary type-page" {...rise(0)}>
					Welcome to spool
				</motion.h1>
				<motion.p className="mt-2 max-w-[360px] text-secondary type-body" {...rise(0.14)}>
					Your agent makes working screens, and you click through them like the finished app.
				</motion.p>
				<motion.div className="mt-8" {...rise(0.3)}>
					<Button variant="primary" size="lg" className="px-4" tabIndex={words ? 0 : -1} onClick={onContinue}>
						Continue
					</Button>
				</motion.div>
			</div>
		</>
	);
}

/* --------------------------------------------------------------- the agents -- */

function rowEnd(agent: MachineAgent): ReactNode {
	const job = agent.job;
	if (job?.state === "running")
		return (
			<span className="flex items-center gap-2 text-secondary type-detail">
				{job.kind === "install" ? "installing" : "in your browser"}
				<SpinRing className="size-3.5" />
			</span>
		);
	if (job?.state === "failed")
		return (
			<span className="text-danger-strong type-detail">
				{job.kind === "install" ? "didn’t install" : "not signed in"}
			</span>
		);
	if (isReady(agent)) return <Ok>{agent.account ?? "signed in"}</Ok>;
	if (agent.outdated) return <span className="text-tertiary type-detail">needs updating</span>;
	if (!agent.installed) return <span className="text-tertiary type-detail">not installed</span>;
	return <span className="text-tertiary type-detail">not signed in</span>;
}

function AgentsPage({
	agents,
	found,
	sel,
	onSel,
	onAct,
	code,
	onCode,
	refused,
}: {
	agents: readonly MachineAgent[];
	found: readonly AgentEngineId[];
	sel: number;
	onSel: (i: number) => void;
	onAct: (i: number) => void;
	code: string;
	onCode: (code: string) => void;
	refused: string | null;
}) {
	const head = agentsHeadline(agents, found);
	const selected = agents[sel];
	const action = selected === undefined ? null : rowAction(selected, agents);
	const job = selected?.job;
	return (
		<div className="flex flex-col gap-5">
			<Head title={head.title}>{head.body}</Head>
			<div className="-mx-2.5 flex flex-col gap-0.5">
				{agents.length === 0 ? (
					<span className="flex h-[52px] items-center gap-2 px-2.5 text-secondary type-detail">
						<SpinRing className="size-3.5" />
						looking for your agents
					</span>
				) : null}
				{agents.map((agent, i) => (
					<Row
						key={agent.id}
						data-first-run-row={agent.id}
						selected={sel === i}
						onSelect={() => onSel(i)}
						onAct={() => onAct(i)}
						end={rowEnd(agent)}
					>
						<AgentGlyph who={agent.id} />
						<span className="min-w-0 flex-1">
							<span className="block text-primary type-control">{AGENT_COPY[agent.id].name}</span>
							<span className="block truncate text-secondary type-label">{AGENT_COPY[agent.id].plan}</span>
						</span>
					</Row>
				))}
			</div>
			{/* what the selected row needs that a press can't do alone */}
			<div className="flex min-h-[18px] flex-col gap-2">
				{job?.kind === "sign-in" && job.state === "running" && job.asksCode ? (
					<TextField
						mono
						value={code}
						onValueChange={onCode}
						label="Code from the browser"
						placeholder="Paste the code the browser shows"
						inputProps={{ autoFocus: true } as ComponentProps<"input">}
					/>
				) : null}
				{job?.kind === "sign-in" && job.state === "running" && job.url !== null ? (
					<span className="text-tertiary type-label">
						No browser?{" "}
						<a
							className="underline underline-offset-[3px] hover:text-primary"
							href={job.url}
							target="_blank"
							rel="noreferrer"
						>
							Open the sign-in page
						</a>
					</span>
				) : null}
				{action?.kind === "copy" ? (
					<>
						<span className="text-secondary type-label">spool can’t run this here. Run it in a terminal:</span>
						<CommandLine command={action.line} />
					</>
				) : null}
				{job?.state === "failed" ? (
					<span role="alert" className="text-danger-strong type-label">
						{job.lines.at(-1)}
					</span>
				) : null}
				{refused !== null ? (
					<span role="alert" className="text-danger-strong type-label">
						{refused}
					</span>
				) : null}
			</div>
		</div>
	);
}

/** What spool ran for the selected agent, its own words, shown only when asked for. */
function Lines({ lines, open }: { lines: readonly string[]; open: boolean }) {
	return (
		<AnimatePresence>
			{open ? (
				<motion.div
					key="lines"
					initial={{ opacity: 0, y: 12 }}
					animate={{ opacity: 1, y: 0 }}
					exit={{ opacity: 0, y: 8 }}
					transition={{ duration: 0.24, ease: EASE }}
					className="absolute inset-x-3 bottom-[60px] z-20 flex max-h-[150px] flex-col-reverse overflow-y-auto rounded-md border border-line-strong bg-surface-raised px-3 py-2.5"
				>
					<div className="flex flex-col">
						{lines.length === 0 ? <span className="text-tertiary type-detail">nothing run yet</span> : null}
						{lines.map((line, i) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: a log only grows
							<span key={i} className="break-all text-secondary type-detail">
								{line}
							</span>
						))}
					</div>
				</motion.div>
			) : null}
		</AnimatePresence>
	);
}

/* ------------------------------------------------------------------- pi -- */

function PiPage({
	sel,
	onSel,
	onAct,
	piKey,
	onProvider,
	onKey,
}: {
	sel: number;
	onSel: (i: number) => void;
	onAct: (i: number) => void;
	piKey: PiKeyState;
	onProvider: (provider: PiKeyProvider) => void;
	onKey: (key: string) => void;
}) {
	const field = useRef<HTMLInputElement>(null);
	const keyOpen = sel === 2;
	useEffect(() => {
		if (keyOpen) window.setTimeout(() => field.current?.focus(), 180);
	}, [keyOpen]);
	const name = PI_KEY_PROVIDERS.find((provider) => provider.id === piKey.provider)?.name ?? piKey.provider;
	const plan = (way: string) => (
		<div className="flex flex-col gap-1.5 px-2.5 pt-1 pb-2">
			<span className="text-secondary type-label">
				pi signs in to {way} from inside itself. Run it in a terminal, type /login and pick {way}; then press return
				here.
			</span>
			<CommandLine command="pi" />
		</div>
	);
	return (
		<div className="flex flex-col gap-5">
			<Head title="Other providers, through pi">Sign in with a plan you have, or paste a key.</Head>
			<div className="-mx-2.5 flex flex-col gap-0.5">
				<Row selected={sel === 0} onSelect={() => onSel(0)} onAct={() => onAct(0)} end={null}>
					<Glyph>
						<svg viewBox="0 0 32 32" className="size-[18px]" fill="none" aria-hidden="true">
							<circle cx="16" cy="16" r="10" stroke="currentColor" strokeWidth="2.4" />
						</svg>
					</Glyph>
					<span className="flex-1 text-primary type-control">Sign in with ChatGPT</span>
				</Row>
				{sel === 0 ? plan("ChatGPT") : null}
				<Row selected={sel === 1} onSelect={() => onSel(1)} onAct={() => onAct(1)} end={null}>
					<Glyph>
						<svg viewBox="0 0 32 32" className="size-[18px]" aria-hidden="true">
							<circle cx="16" cy="16" r="12" fill="currentColor" />
							<circle cx="11.5" cy="15" r="2.4" className="fill-surface-panel" />
							<circle cx="20.5" cy="15" r="2.4" className="fill-surface-panel" />
						</svg>
					</Glyph>
					<span className="flex-1 text-primary type-control">Sign in with GitHub Copilot</span>
				</Row>
				{sel === 1 ? plan("GitHub Copilot") : null}
				<Row
					selected={keyOpen}
					onSelect={() => onSel(2)}
					onAct={() => onAct(2)}
					end={piKey.check === "ok" ? <Ok>{name}</Ok> : null}
				>
					<Glyph>
						<svg viewBox="0 0 16 16" className="size-4" fill="none" aria-hidden="true">
							<circle cx="5.5" cy="10.5" r="3" stroke="currentColor" strokeWidth="1.4" />
							<path
								d="m7.7 8.3 5.3-5.3M11 5l1.8 1.8"
								stroke="currentColor"
								strokeWidth="1.4"
								strokeLinecap="round"
							/>
						</svg>
					</Glyph>
					<span className="flex-1 text-primary type-control">Paste an API key</span>
				</Row>
				{keyOpen ? (
					<div className="flex flex-col gap-2.5 px-2.5 pt-2 pb-1">
						<div className="-mx-1 flex flex-wrap gap-0.5">
							{PI_KEY_PROVIDERS.map((provider) => (
								<ToggleButton
									key={provider.id}
									size="sm"
									pressed={piKey.provider === provider.id}
									onPressedChange={() => onProvider(provider.id)}
								>
									{provider.name}
								</ToggleButton>
							))}
						</div>
						<TextField
							mono
							error={piKey.check === "bad"}
							value={piKey.key}
							onValueChange={onKey}
							placeholder={`Paste your ${name} key`}
							label={`${name} key`}
							inputProps={{ ref: field } as ComponentProps<"input">}
							suffix={piKey.check === "checking" ? <SpinRing className="size-3.5" /> : null}
						/>
						<span
							role={piKey.check === "bad" ? "alert" : undefined}
							className={cn("type-label", piKey.check === "bad" ? "text-danger-strong" : "text-tertiary")}
						>
							{piKey.check === "ok" || piKey.check === "bad" || piKey.check === "unsure"
								? piKey.said
								: piKey.check === "checking"
									? `Checking the key with ${name}`
									: `Return checks it with ${name}.`}
						</span>
					</div>
				) : null}
			</div>
		</div>
	);
}

/* ---------------------------------------------------------------- the cloud -- */

function CloudPage() {
	return (
		<div className="flex flex-col gap-5">
			<Head title="Try Spool Cloud with your team.">
				spool stays free on this computer. Spool Cloud puts your team on one canvas.
			</Head>
			<ul className="flex flex-col">
				{CLOUD_OFFER.facts.map((fact, i) => (
					<motion.li
						key={fact}
						initial={{ opacity: 0, y: 4 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{
							duration: reducedMotion() ? 0 : 0.35,
							ease: EASE,
							delay: reducedMotion() ? 0 : 0.2 + i * 0.05,
						}}
						className="flex h-[30px] items-center gap-2.5"
					>
						<CheckIcon className="size-3.5 text-tertiary" />
						<span className="text-primary type-control">{fact}</span>
					</motion.li>
				))}
			</ul>
			<p className="text-secondary type-label">{CLOUD_OFFER.terms}</p>
		</div>
	);
}

function Dots({ at }: { at: number }) {
	return (
		<div className="flex items-center gap-1.5 pl-1" aria-hidden="true">
			{DOTS.map((dot, i) => (
				<motion.span
					key={dot}
					initial={false}
					animate={{ width: i === at ? 16 : 5 }}
					transition={{ type: "spring", duration: 0.5, bounce: 0.2 }}
					className={cn(
						"h-[5px] rounded-full transition-colors duration-slow",
						i <= at ? "bg-primary" : "bg-line-strong",
					)}
				/>
			))}
		</div>
	);
}
