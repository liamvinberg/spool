import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "motion/react";
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "shared/lib/utils";
import { CoffeeScreen } from "shared/ui/demo/coffee-screens";
import { CanvasChrome, type PageRow } from "shared/ui/spool/canvas-chrome";
import { CanvasTools, type CanvasTool } from "shared/ui/spool/canvas-tools";
import {
	AgentIcon,
	CheckIcon,
	CloseIcon,
	FrameIcon,
	PanelCaret,
	PlayIcon,
	PlusIcon,
	RestartIcon,
} from "shared/ui/spool/icons";
import { SpoolShell } from "shared/ui/spool/shell";
import "./onboarding.css";

// Exploration only. The app canvas is the starting point; only onboarding is being compared.
// Each take and later state has its own frame. All actions and chat replies stay in memory.
export type Take = "hint" | "labels" | "open" | "tour" | "practice" | "change" | "inline" | "guide";
export type Scene = "arrival" | "opened" | "selection" | "done";
type Panel = "properties" | "agent" | null;

const TAKES: Record<Take, { name: string; why: string; tradeoff: string }> = {
	hint: {
		name: "An attached hint",
		why: "Point to the agent once, then teach at the next useful moment.",
		tradeoff: "Small interruption. Depends on one well-placed hint being noticed.",
	},
	labels: {
		name: "Let the rail say what it holds",
		why: "Keep the names visible until both surfaces have been used.",
		tradeoff: "Easy to scan. Takes more room and changes shape when it compacts.",
	},
	open: {
		name: "Start with the conversation",
		why: "Open the agent on the first visit to an empty canvas.",
		tradeoff: "Fastest path to making something. The other tools still need a way in.",
	},
	tour: {
		name: "A short walk around spool",
		why: "Four stops, attached to the controls they explain. Skip or go back at any point.",
		tradeoff: "Covers more ground. Asks for attention before someone starts working.",
	},
	practice: {
		name: "Learn by making one change",
		why: "A disposable sample: select, ask, then play the result.",
		tradeoff: "Shows the whole loop. More commitment before starting your own work.",
	},
	change: {
		name: "Show the change where it happened",
		why: "One attached note for an important move, once per change.",
		tradeoff: "Hard to miss. Reserve it for changes that would leave someone lost.",
	},
	inline: {
		name: "Explain it when it is used",
		why: "A short note inside the relevant panel, dismissed after it helps.",
		tradeoff: "Keeps the canvas quiet. Cannot help someone who never opens that panel.",
	},
	guide: {
		name: "A guide you can come back to",
		why: "One quiet home for the basics and what changed. Open each lesson in place.",
		tradeoff: "Always available. Needs another first-visit cue to make it discoverable.",
	},
};

export function OnboardingExplore({ take, scene = "arrival" }: { take: Take; scene?: Scene }) {
	const [run, setRun] = useState(0);
	return <Demo key={run} take={take} scene={scene} onReplay={() => setRun((value) => value + 1)} />;
}

function Demo({ take, scene, onReplay }: { take: Take; scene: Scene; onReplay: () => void }) {
	const root = useRef<HTMLDivElement>(null);
	const composer = useRef<HTMLTextAreaElement>(null);
	const reduced = useReducedMotion();
	const startsOpen = take === "open" || take === "inline" || scene === "opened" || scene === "done";
	const [panel, setPanel] = useState<Panel>(startsOpen ? "agent" : "properties");
	const [selected, setSelected] = useState<string | undefined>(
		(take === "open" && scene !== "done") || (take === "practice" && scene === "arrival") ? undefined : "cart",
	);
	const [step, setStep] = useState(
		scene === "done" ? 4 : scene === "selection" ? 2 : scene === "opened" ? (take === "practice" ? 2 : 1) : 0,
	);
	const [dismissed, setDismissed] = useState(
		(scene === "done" && take !== "practice") || (take === "labels" && scene === "opened"),
	);
	const [used, setUsed] = useState<readonly Panel[]>(["properties"]);
	const [guide, setGuide] = useState(take === "guide" && scene === "arrival");
	const [lesson, setLesson] = useState<string | null>(take === "guide" && scene === "opened" ? "agent" : null);
	const [settings, setSettings] = useState(false);
	const [draft, setDraft] = useState("");
	const sampleChanged = scene === "done" && (take === "practice" || take === "open");
	const [sent, setSent] = useState<string | null>(
		sampleChanged
			? take === "open"
				? "Make a checkout for a coffee shop."
				: "Rename the button to Place order."
			: null,
	);
	const [changed, setChanged] = useState(sampleChanged);
	const [playing, setPlaying] = useState<"menu" | "cart" | null>(null);
	const [ordered, setOrdered] = useState(false);
	const [tool, setTool] = useState<CanvasTool>("select");
	const labels = take === "labels" && !dismissed;
	const empty = take === "open" && !changed;
	const strip = labels ? 124 : 44;
	const panelWidth = panel === "agent" ? 420 : panel === "properties" ? 300 : 0;
	const meta = TAKES[take];
	const focusComposer = () => requestAnimationFrame(() => composer.current?.focus());
	const dismiss = () => {
		setDismissed(true);
		setLesson(null);
		setGuide(false);
	};

	useEffect(() => {
		const escape = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			if (playing !== null) {
				setPlaying(null);
				return;
			}
			setSettings(false);
			setGuide(false);
			setLesson(null);
			setDismissed(true);
		};
		window.addEventListener("keydown", escape);
		return () => window.removeEventListener("keydown", escape);
	}, [playing]);

	const openPanel = (next: Panel) => {
		setPanel(next);
		if (!used.includes(next)) setUsed([...used, next]);
		if (next === "agent") {
			if (take === "hint" || take === "change") setStep(1);
			if (take === "tour" && step === 0) setStep(1);
			if (take === "practice" && step === 1) setStep(2);
		}
	};
	const select = (name: string) => {
		setSelected(name);
		if (take === "practice" && step === 0) setStep(1);
	};
	const send = () => {
		if (!draft.trim()) return;
		setSent(draft.trim());
		setDraft("");
		setChanged(true);
		setSelected("cart");
		if (take === "practice") setStep(3);
		if (take === "hint" || take === "open") setDismissed(true);
	};
	const play = (name: "menu" | "cart" = "cart") => {
		setPlaying(name);
		setOrdered(false);
		if (take === "practice" || take === "tour") setStep(4);
		if (take === "tour") setDismissed(true);
	};
	const tourStep = (next: number) => {
		setStep(next);
		if (next === 0 || next === 2 || next === 3) setPanel("properties");
		if (next === 1) setPanel("agent");
		if (next === 2 || next === 3) setSelected("cart");
		if (next >= 4) setDismissed(true);
	};
	const showLesson = (next: string) => {
		setGuide(false);
		setLesson(next);
		setDismissed(true);
		if (next === "agent") setPanel("properties");
		if (next === "select" || next === "play") {
			setSelected("cart");
			setPanel("properties");
		}
	};
	const pages: readonly PageRow[] = empty
		? []
		: [
				{
					name: take === "practice" ? "try-spool" : "app",
					frames: take === "practice" ? ["cart"] : ["menu", "cart"],
					active: true,
					open: true,
				},
			];
	const style: CSSProperties & { "--ob-strip": string; "--ob-panel": string } = {
		"--ob-strip": `${strip}px`,
		"--ob-panel": `${panelWidth}px`,
	};

	return (
		<div
			ref={root}
			className={cn(
				"ob-exploration",
				labels && "ob-labels",
				take === "tour" && !dismissed && "ob-tour-focus",
				take === "tour" && !dismissed && `ob-tour-step-${step}`,
				!dismissed &&
					(((take === "hint" || take === "change") && step === 0) ||
						(take === "tour" && step === 0) ||
						(take === "practice" && step === 1)) &&
					"ob-point-agent",
			)}
			style={style}
		>
			<div
				className="ob-app"
				onClickCapture={(event) => {
					// Adapt the shipped specimen's inert glyphs without changing shared chrome.
					if (!(event.target instanceof Element)) return;
					const glyph = event.target.closest<HTMLElement>("[data-dock-glyph]")?.dataset.dockGlyph;
					if (glyph === "agent" || glyph === "properties") openPanel(panel === glyph ? null : glyph);
				}}
			>
				<SpoolShell
					activeTab={take === "practice" ? "try-spool" : "kaffe"}
					tabs={[take === "practice" ? "try-spool" : "kaffe"]}
					zoom={empty ? "100%" : "62%"}
				>
					<CanvasChrome
						pages={pages}
						selected={selected}
						tool="none"
						rail={
							panel === null ? null : panel === "properties" ? undefined : (
								<div className="ob-agent">
									<div className="ob-agent-heading">
										<span>
											{sent
												? take === "open"
													? "Coffee shop checkout"
													: "Rename the cart button"
												: "new conversation"}
										</span>
										<button
											type="button"
											aria-label="New conversation"
											onClick={() => {
												setSent(null);
												setDraft("");
											}}
										>
											<PlusIcon className="h-3 w-3" />
										</button>
										<button type="button" aria-label="Close agent" onClick={() => setPanel(null)}>
											<PanelCaret dir="right" className="h-3 w-3" />
										</button>
									</div>
									<div className="ob-transcript" aria-live="polite">
										{sent ? (
											<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
												<p className="ob-user-said">{sent}</p>
												<div className="ob-operation">
													<CheckIcon className="h-3 w-3" />
													<span>{take === "open" ? "write" : "edit"}</span>
													<button type="button" onClick={() => select("cart")}>
														cart
													</button>
												</div>
												<p>
													{take === "open"
														? "I made a coffee shop checkout. Select a frame to change it, or press play to try it."
														: "The cart button now says “Place order”. Play the frame to try it."}
												</p>
											</motion.div>
										) : take === "open" ? (
											<div className="ob-welcome">
												<AgentIcon className="h-6 w-6" />
												<h1>What are you making?</h1>
												<p>Describe a screen. Your agent builds it here, on the canvas.</p>
												<button
													type="button"
													className="ob-example"
													onClick={() => {
														setDraft("Make a checkout for a coffee shop.");
														focusComposer();
													}}
												>
													Try a coffee shop checkout <span aria-hidden="true">↗</span>
												</button>
												<button
													type="button"
													className="ob-text-button"
													onClick={() => {
														setGuide(true);
													}}
												>
													Show me around first
												</button>
											</div>
										) : (
											<div className="ob-agent-empty">
												<p>What would you like to make?</p>
												<span>Select a frame to include it in your ask.</span>
											</div>
										)}
									</div>
									{take === "inline" && !dismissed && (
										<div className="ob-inline-note">
											<div>
												<h2>The agent lives in this rail now.</h2>
												<p>Switch between chat and properties using the two icons on the right.</p>
											</div>
											<button type="button" aria-label="Dismiss change note" onClick={dismiss}>
												<CloseIcon className="h-3 w-3" />
											</button>
										</div>
									)}
									{take === "practice" && step === 2 && !dismissed && (
										<button
											type="button"
											className="ob-sample-ask"
											onClick={() => {
												setDraft("Rename the button to Place order.");
												focusComposer();
											}}
										>
											Use this ask <span>Rename the button to Place order.</span>
										</button>
									)}
									<div className="ob-composer" data-composer="">
										{selected && (
											<div className="ob-context">
												<FrameIcon className="h-3 w-3" />
												<span>{selected}</span>
												<button
													type="button"
													aria-label="Remove selected frame from ask"
													onClick={() => setSelected(undefined)}
												>
													<CloseIcon className="h-2.5 w-2.5" />
												</button>
											</div>
										)}
										<textarea
											ref={composer}
											aria-label="Message the agent"
											value={draft}
											onChange={(event) => setDraft(event.target.value)}
											placeholder="Ask for a change…"
											onKeyDown={(event) => {
												if (event.key === "Enter" && !event.shiftKey) {
													event.preventDefault();
													send();
												}
											}}
										/>
										<div className="ob-composer-foot">
											<span>
												spool <span className="ob-dim">·</span> auto
											</span>
											<button
												type="button"
												className="ob-send"
												disabled={!draft.trim()}
												onClick={send}
												aria-label="Send message"
											>
												↑
											</button>
										</div>
									</div>
								</div>
							)
						}
						railWidth={panelWidth}
						railLabel={panel ?? "properties"}
					>
						<div className="ob-crumb">
							{empty ? "kaffe" : take === "practice" ? "try-spool" : "app"}
							{take === "practice" && <span>A sample you can try freely.</span>}
						</div>
						{empty ? (
							<div className="ob-empty-field">
								<div className="ob-empty-outline">
									<PlusIcon className="h-5 w-5" />
								</div>
								<p>Your first frame will appear here.</p>
								<span>Start with an ask in the agent panel.</span>
							</div>
						) : (
							<div className={cn("ob-field", take === "practice" && "ob-field-sample")}>
								{take !== "practice" && (
									<MiniFrame
										name="menu"
										selected={selected === "menu"}
										onSelect={() => select("menu")}
										onPlay={() => play("menu")}
										changed={false}
									/>
								)}
								{take !== "practice" && (
									<svg className="ob-connection" viewBox="0 0 52 80" fill="none" aria-hidden="true">
										<path d="M0 15C26 15 26 65 47 65" stroke="var(--color-thread)" strokeWidth="1.5" />
										<path d="m51 65-6-3v6Z" fill="var(--color-thread)" />
									</svg>
								)}
								<MiniFrame
									name="cart"
									selected={selected === "cart"}
									onSelect={() => select("cart")}
									onPlay={() => play("cart")}
									changed={changed}
								/>
							</div>
						)}
						{!empty && <CanvasTools tool={tool} onTool={setTool} />}
					</CanvasChrome>
				</SpoolShell>

				<div className="ob-rail-foot">
					<button
						type="button"
						className={cn("ob-help-button", guide && "ob-active")}
						aria-label="Open spool guide"
						aria-expanded={guide}
						onClick={() => {
							setGuide(!guide);
							setDismissed(true);
							setLesson(null);
						}}
					>
						?
					</button>
					<button type="button" aria-label="Open settings" onClick={() => setSettings(true)}>
						<Gear />
					</button>
				</div>

				<AnimatePresence>
					{!dismissed &&
						take === "hint" &&
						(step === 0 ? (
							<Coach key="hint" position="rail" title="Your agent is right here." onDismiss={dismiss}>
								<p>Ask for a screen or a change. The chat opens from this icon, just below properties.</p>
								<Action onClick={() => openPanel("agent")}>
									Open agent <span aria-hidden="true">↗</span>
								</Action>
							</Coach>
						) : panel === "agent" ? (
							<Coach key="hint-composer" position="composer" title="Point, then ask." onDismiss={dismiss}>
								<p>Select a frame to include it. Tell the agent what you want to change.</p>
								<Action
									onClick={() => {
										dismiss();
										focusComposer();
									}}
								>
									Got it
								</Action>
							</Coach>
						) : null)}
					{labels && (
						<div className="ob-label-explainer">
							<p>Two tools, one panel.</p>
							<span>
								Properties for what you select.
								<br />
								Agent for what you want to make.
							</span>
							{used.includes("agent") && (
								<button type="button" onClick={() => setDismissed(true)}>
									Use compact rail <span aria-hidden="true">→</span>
								</button>
							)}
						</div>
					)}
					{!dismissed && take === "tour" && step < 4 && (
						<Coach
							key={`tour-${step}`}
							position={step === 0 ? "rail" : step === 1 ? "composer" : step === 2 ? "properties" : "play"}
							title={
								[
									"Your agent is right here.",
									"Give the agent a direction.",
									"Select it. Shape it.",
									"Try it while you make it.",
								][step] ?? "Your canvas is ready."
							}
							onDismiss={dismiss}
							progress={`${step + 1} of 4`}
						>
							<p>
								{
									[
										"This icon opens chat. Describe a screen or ask for a change to one you already have.",
										"The frames you select come with your message. You can point at something instead of describing where it is.",
										"Click a frame to see its position and size in properties. The agent stays one icon away.",
										"Play opens the screen so you can use it. Double-click a frame to interact on the canvas; Escape brings you back.",
									][step]
								}
							</p>
							<div className="ob-tour-actions">
								<button type="button" onClick={() => (step === 0 ? dismiss() : tourStep(step - 1))}>
									{step === 0 ? "Skip tour" : "Back"}
								</button>
								<Action onClick={() => tourStep(step + 1)}>
									{step === 0 ? "Open agent" : step === 3 ? "Finish" : "Next"}
									<span aria-hidden="true">→</span>
								</Action>
							</div>
						</Coach>
					)}
					{!dismissed && take === "practice" && (
						<div className="ob-practice" aria-live="polite">
							<div className="ob-practice-title">
								<h1>{step === 4 ? "You know the loop." : "Make your first change."}</h1>
								<button type="button" onClick={dismiss} aria-label="Skip practice">
									<CloseIcon className="h-3 w-3" />
								</button>
							</div>
							{step === 4 ? (
								<>
									<p>Select something, ask for a change, then try it.</p>
									<Action onClick={dismiss}>
										Start exploring <span aria-hidden="true">→</span>
									</Action>
								</>
							) : (
								<>
									<p>
										{
											[
												"Click the cart frame to select it.",
												"Open the agent from the icon below properties.",
												"Ask the agent to rename the button.",
												"The change is on the canvas. Press play above cart.",
											][step]
										}
									</p>
									<div className="ob-tasks">
										{["Select", "Ask", "Play"].map((label, index) => (
											<span
												key={label}
												data-done={step > (index === 0 ? 0 : index === 1 ? 2 : 3)}
												data-current={index === (step === 0 ? 0 : step < 3 ? 1 : 2)}
											>
												<span>
													{step > (index === 0 ? 0 : index === 1 ? 2 : 3) ? (
														<CheckIcon className="h-2.5 w-2.5" />
													) : (
														index + 1
													)}
												</span>
												{label}
											</span>
										))}
									</div>
								</>
							)}
						</div>
					)}
					{!dismissed && take === "change" && (
						<Coach
							key={`change-${step}`}
							position={step === 0 ? "rail" : "composer"}
							title={step === 0 ? "Chat has a new home." : "Same conversation. More room."}
							onDismiss={dismiss}
						>
							<p>
								{step === 0
									? "Your agent is in the right rail, below properties. Open it here whenever you need it."
									: "Your conversations and composer live together. Use the icons to switch back to properties."}
							</p>
							<Action onClick={() => (step === 0 ? openPanel("agent") : dismiss())}>
								{step === 0 ? "Show me" : "Got it"}
								<span aria-hidden="true">→</span>
							</Action>
						</Coach>
					)}
					{guide && (
						<Coach key="guide" position="guide" title="A little help with spool." onDismiss={() => setGuide(false)}>
							<p>Open a quick lesson right on your canvas.</p>
							<div className="ob-guide-list">
								<button type="button" onClick={() => showLesson("agent")}>
									<AgentIcon className="h-4 w-4" />
									<span>Talk to your agent</span>
									<span aria-hidden="true">↗</span>
								</button>
								<button type="button" onClick={() => showLesson("select")}>
									<FrameIcon className="h-4 w-4" />
									<span>Select and change a frame</span>
									<span aria-hidden="true">↗</span>
								</button>
								<button type="button" onClick={() => showLesson("play")}>
									<PlayIcon className="h-3 w-3" />
									<span>Play your prototype</span>
									<span aria-hidden="true">↗</span>
								</button>
							</div>
							<div className="ob-guide-changes">
								<h3>What changed</h3>
								<button type="button" onClick={() => showLesson("agent")}>
									Chat moved into the right rail <span aria-hidden="true">↗</span>
								</button>
								<button type="button" onClick={() => showLesson("settings")}>
									Settings is at the foot of the rail <span aria-hidden="true">↗</span>
								</button>
							</div>
						</Coach>
					)}
					{lesson !== null && (
						<Coach
							key={lesson}
							position={
								lesson === "agent"
									? "rail"
									: lesson === "settings"
										? "guide"
										: lesson === "select"
											? "properties"
											: "play"
							}
							title={
								lesson === "agent"
									? "Your agent is right here."
									: lesson === "settings"
										? "Make spool feel like yours."
										: lesson === "select"
											? "Your selection lives here."
											: "Use what you have made."
							}
							onDismiss={() => setLesson(null)}
						>
							<p>
								{lesson === "agent"
									? "Open chat from this icon, just below properties. Your selected frames come with your message."
									: lesson === "settings"
										? "Open settings from the cog to change the theme and keyboard shortcuts."
										: lesson === "select"
											? "Click a frame. Its position and size appear in properties. Open the agent to ask for a bigger change."
											: "Press play above a selected frame to use the screen. Escape returns to the canvas."}
							</p>
							<div className="ob-tour-actions">
								<button
									type="button"
									onClick={() => {
										setLesson(null);
										setGuide(true);
									}}
								>
									All lessons
								</button>
								<Action
									onClick={() => {
										if (lesson === "agent") openPanel("agent");
										if (lesson === "settings") setSettings(true);
										if (lesson === "play") play();
										setLesson(null);
									}}
								>
									{lesson === "agent"
										? "Open agent"
										: lesson === "settings"
											? "Open settings"
											: lesson === "play"
												? "Play cart"
												: "Got it"}
									<span aria-hidden="true">→</span>
								</Action>
							</div>
						</Coach>
					)}
				</AnimatePresence>

				<AnimatePresence>
					{playing && (
						<motion.div
							className="ob-player"
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							transition={{ duration: 0.15 }}
						>
							<div className="ob-player-bar">
								<span>
									{playing} <span className="ob-dim">· live</span>
								</span>
								<button type="button" onClick={() => setPlaying(null)}>
									Back to canvas <kbd>esc</kbd>
								</button>
							</div>
							<motion.div
								className="ob-player-frame"
								initial={reduced ? false : { transform: "translateY(8px) scale(.99)" }}
								animate={{ transform: "translateY(0) scale(1)" }}
								transition={{ duration: 0.24 }}
							>
								<CoffeeScreen screen={ordered ? "receipt" : playing} scale="full" actionLabel="" />
								{!ordered && (
									<button
										type="button"
										className="ob-live-action"
										onClick={() => (playing === "menu" ? setPlaying("cart") : setOrdered(true))}
									>
										{playing === "menu" ? "Checkout" : changed ? "Place order" : "Pay"}
									</button>
								)}
							</motion.div>
						</motion.div>
					)}
					{settings && (
						<motion.div
							className="ob-settings-backdrop"
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
						>
							<div className="ob-settings">
								<div>
									<h1>Settings</h1>
									<button type="button" aria-label="Close settings" onClick={() => setSettings(false)}>
										<CloseIcon className="h-4 w-4" />
									</button>
								</div>
								<p>Theme</p>
								<span>Dark</span>
								<p>Keyboard shortcuts</p>
								<span>Use the keys that feel familiar.</span>
								<button
									type="button"
									className="ob-text-button"
									onClick={() => {
										setSettings(false);
										setGuide(true);
									}}
								>
									Show the spool guide <span aria-hidden="true">↗</span>
								</button>
							</div>
						</motion.div>
					)}
				</AnimatePresence>
			</div>
			<footer className="ob-notes">
				<div>
					<strong>{meta.name}</strong>
					<p>{meta.why}</p>
					<span>{meta.tradeoff}</span>
				</div>
				<div className="ob-notes-controls">
					<span>prototype · sample replies · nothing saved</span>
					<button type="button" onClick={onReplay}>
						<RestartIcon className="h-3 w-3" />
						Replay
					</button>
				</div>
			</footer>
		</div>
	);
}

function MiniFrame({
	name,
	selected,
	changed,
	onSelect,
	onPlay,
}: {
	name: "menu" | "cart";
	selected: boolean;
	changed: boolean;
	onSelect: () => void;
	onPlay: () => void;
}) {
	return (
		<div className={cn("ob-mini", selected && "ob-mini-selected")} data-sample-frame={name}>
			<div className="ob-frame-label">
				<button type="button" onClick={onSelect}>
					{name}
				</button>
				<button type="button" className="ob-play-button" aria-label={`Play ${name}`} onClick={onPlay}>
					<PlayIcon className="h-2 w-2" />
					play
				</button>
			</div>
			<div className="ob-frame-content">
				<CoffeeScreen screen={name} actionLabel={changed && name === "cart" ? "Place order" : undefined} />
				<button
					type="button"
					className="ob-frame-hit"
					aria-label={`Select ${name} frame`}
					onClick={onSelect}
					onDoubleClick={onPlay}
				/>
				{selected && (
					<>
						<i className="ob-corner ob-tl" />
						<i className="ob-corner ob-tr" />
						<i className="ob-corner ob-bl" />
						<i className="ob-corner ob-br" />
					</>
				)}
			</div>
			{selected && <span className="ob-measure">390 × 844</span>}
		</div>
	);
}

function Action({ children, onClick }: { children: ReactNode; onClick: () => void }) {
	return (
		<button type="button" className="ob-action" onClick={onClick}>
			{children}
		</button>
	);
}

function Coach({
	children,
	title,
	position,
	onDismiss,
	progress,
}: {
	children: ReactNode;
	title: string;
	position: "rail" | "composer" | "properties" | "play" | "guide";
	onDismiss: () => void;
	progress?: string;
}) {
	const reduced = useReducedMotion();
	const present = useIsPresent();
	return (
		<motion.section
			inert={!present}
			aria-hidden={!present}
			aria-label={title}
			className={cn("ob-coach", `ob-coach-${position}`)}
			initial={{ opacity: 0, transform: reduced ? "none" : "translateX(6px) scale(.985)" }}
			animate={{ opacity: 1, transform: reduced ? "none" : "translateX(0) scale(1)" }}
			exit={{ opacity: 0, transform: reduced ? "none" : "translateX(3px) scale(.99)" }}
			transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
		>
			<div className="ob-coach-title">
				<h2>{title}</h2>
				<button type="button" aria-label="Dismiss hint" onClick={onDismiss}>
					<CloseIcon className="h-3 w-3" />
				</button>
			</div>
			{children}
			{progress && (
				<div className="ob-progress" aria-label={`Step ${progress}`}>
					<span>{progress}</span>
					<span>esc to skip</span>
				</div>
			)}
		</motion.section>
	);
}

function Gear() {
	return (
		<svg viewBox="0 0 20 20" width="16" height="16" fill="none" aria-hidden="true">
			<path
				d="m8 2-.6 2-1.9 1L3.4 5l-1.5 2.5L3 9.2v1.9l-1.1 1.7L3.4 15l2.1-.1 1.9 1L8 18h4l.6-2.1 1.9-1 2.1.1 1.5-2.2-1.1-1.7V9.2l1.1-1.7L16.6 5l-2.1.1-1.9-1L12 2Z"
				stroke="currentColor"
				strokeWidth="1.2"
			/>
			<circle cx="10" cy="10" r="3" stroke="currentColor" strokeWidth="1.2" />
		</svg>
	);
}
