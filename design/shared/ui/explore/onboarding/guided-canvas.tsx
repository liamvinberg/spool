import { AnimatePresence } from "motion/react";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { cn } from "shared/lib/utils";
import { CoffeeScreen } from "shared/ui/demo/coffee-screens";
import { CanvasChrome, type PageRow } from "shared/ui/spool/canvas-chrome";
import { CanvasTools, type CanvasTool } from "shared/ui/spool/canvas-tools";
import { CheckIcon, CloseIcon, FolderIcon, FrameIcon, PlayIcon, RestartIcon } from "shared/ui/spool/icons";
import { SpoolShell } from "shared/ui/spool/shell";
import { Action, Coach } from "shared/ui/explore/onboarding/onboarding";
import "./guided-canvas.css";

export type GuidedScene =
	| "empty"
	| "account"
	| "ready"
	| "frame"
	| "selection"
	| "edit"
	| "pages"
	| "demo"
	| "demo-change";
type Lesson = "agent" | "connect" | "ask" | "select" | "edit" | "play" | "pages";
const LESSONS: Record<Lesson, { title: string; text: string }> = {
	agent: { title: "Your agent is right here.", text: "Open chat from this icon. You can make your first frame here." },
	connect: {
		title: "Start with your account.",
		text: "Connect an account from the bottom of the agent panel. An account already connected is ready to use.",
	},
	ask: {
		title: "Give your agent a starting point.",
		text: "Describe one screen you want to make. Try an example, change the words, then send it when you are ready.",
	},
	select: {
		title: "Select the frame. Or step inside.",
		text: "One click selects the frame and shares it with your agent. Double-click to use the screen. Escape returns to the canvas.",
	},
	edit: {
		title: "Edit individual elements.",
		text: "Choose Edit, then click the Pay button to change its text in properties. Use Select when you want the whole frame.",
	},
	play: {
		title: "Try what you have made.",
		text: "Double-click cart to use it on the canvas. Click its button to follow the flow, then press Escape to come back.",
	},
	pages: {
		title: "The frames are inside this page.",
		text: "A folder is a page with its own canvas. This page holds checkout. Open it to see its frames; the breadcrumb brings you back.",
	},
};

export function GuidedCanvas({ scene = "empty" }: { scene?: GuidedScene }) {
	const [run, setRun] = useState(0);
	return <Canvas key={run} scene={scene} onReplay={() => setRun((value) => value + 1)} />;
}

function Canvas({ scene, onReplay }: { scene: GuidedScene; onReplay: () => void }) {
	const input = useRef<HTMLTextAreaElement>(null);
	const textField = useRef<HTMLInputElement>(null);
	const accountDialog = useRef<HTMLElement>(null);
	const beforeDemo = useRef<(() => void) | null>(null);
	const [demo, setDemo] = useState(scene === "demo" || scene === "demo-change");
	const [demoStep, setDemoStep] = useState(scene === "demo-change" ? 2 : 0);
	const [connected, setConnected] = useState(!["empty", "account", "demo", "demo-change"].includes(scene));
	const [provider, setProvider] = useState("ChatGPT");
	const [account, setAccount] = useState(scene === "account");
	const [panel, setPanel] = useState<"agent" | "properties" | null>(
		["empty", "frame", "selection", "edit", "pages"].includes(scene) ? "properties" : "agent",
	);
	const [hasFrames, setHasFrames] = useState(!["empty", "account", "ready"].includes(scene));
	const [page, setPage] = useState(scene === "pages" ? "app" : "app/checkout");
	const [nested, setNested] = useState(scene === "pages");
	const [selected, setSelected] = useState(["selection", "edit", "demo-change"].includes(scene));
	const [element, setElement] = useState(scene === "edit");
	const [tool, setTool] = useState<CanvasTool>(scene === "edit" ? "edit" : "select");
	const [entered, setEntered] = useState(false);
	const [ordered, setOrdered] = useState(false);
	const [draft, setDraft] = useState("");
	const [sent, setSent] = useState<string | null>(scene === "demo-change" ? "Rename the button to Place order." : null);
	const [buttonText, setButtonText] = useState(scene === "demo-change" ? "Place order" : "Pay");
	const [guide, setGuide] = useState(["ready", "frame", "pages"].includes(scene));
	const [lesson, setLesson] = useState<Lesson | null>(
		scene === "empty" ? "agent" : scene === "selection" ? "select" : scene === "edit" ? "edit" : null,
	);
	const [seen, setSeen] = useState<readonly Lesson[]>([]);
	const parent = nested && page === "app";
	const visibleFrame = hasFrames && !parent;
	const showHint = (next: Lesson) => {
		setGuide(false);
		setLesson(next);
		setSeen([...seen, next]);
	};
	const closeHint = () => setLesson(null);
	const openAgent = () => {
		setPanel("agent");
		showHint(connected ? "ask" : "connect");
	};
	const openChild = () => {
		setPage("app/checkout");
		setGuide(false);
		setLesson(null);
		setSelected(false);
	};
	const next: Lesson = parent
		? "pages"
		: !visibleFrame
			? connected
				? "ask"
				: "connect"
			: element
				? "edit"
				: selected
					? "play"
					: "select";
	const suggested = parent
		? "Open checkout"
		: !visibleFrame
			? connected
				? "Make your first frame"
				: "Connect your account"
			: element
				? "Change the button text"
				: selected
					? "Try this frame"
					: "Selecting and entering";
	const guideTopics: readonly Lesson[] = parent
		? ["pages", "ask", "connect"]
		: visibleFrame
			? ["select", "edit", "play", "ask", "connect", ...(nested ? ["pages" as const] : [])]
			: ["connect", "ask"];
	const focusDraft = () => requestAnimationFrame(() => input.current?.focus());
	const exitDemo = () => {
		setDemo(false);
		setEntered(false);
		setOrdered(false);
		setGuide(false);
		setLesson(null);
		if (beforeDemo.current) {
			beforeDemo.current();
			return;
		}
		setHasFrames(false);
		setNested(false);
		setSelected(false);
		setElement(false);
		setTool("select");
		setSent(null);
		setDraft("");
		setButtonText("Pay");
		setPanel("agent");
		showHint(connected ? "ask" : "connect");
	};
	const startDemo = () => {
		beforeDemo.current = () => {
			setHasFrames(hasFrames);
			setNested(nested);
			setPage(page);
			setSelected(selected);
			setElement(element);
			setTool(tool);
			setSent(sent);
			setDraft(draft);
			setButtonText(buttonText);
			setPanel(panel);
		};
		setDemo(true);
		setDemoStep(0);
		setHasFrames(true);
		setNested(false);
		setPage("app/checkout");
		setPanel("agent");
		setSelected(false);
		setElement(false);
		setTool("select");
		setSent(null);
		setDraft("");
		setGuide(false);
		setLesson(null);
		setButtonText("Pay");
		setEntered(false);
		setOrdered(false);
	};
	const selectFrame = () => {
		setSelected(true);
		setElement(false);
		if (demo) setDemoStep(Math.max(demoStep, 1));
		else if (!seen.includes("select")) showHint("select");
	};
	const chooseTool = (nextTool: CanvasTool) => {
		setTool(nextTool);
		setEntered(false);
		setElement(false);
		setSelected(false);
		if (nextTool === "edit") showHint("edit");
		else setLesson(null);
	};
	const enter = () => {
		setEntered(true);
		setOrdered(false);
		setLesson(null);
		setGuide(false);
	};
	const send = () => {
		if (!connected || !draft.trim() || demo) return;
		setSent(draft.trim());
		setDraft("");
		setHasFrames(true);
		setSelected(false);
		setLesson(null);
		if (parent) {
			setPage("app/checkout");
		}
		if (!hasFrames) setGuide(true);
		else setButtonText("Place order");
	};
	const exampleChange = () => {
		setSent("Rename the button to Place order.");
		setButtonText("Place order");
		setDemoStep(2);
	};
	const perform = (topic: Lesson) => {
		setGuide(false);
		if (topic === "connect") {
			setPanel("agent");
			setLesson(null);
			setAccount(true);
		} else if (topic === "ask") {
			setPanel("agent");
			showHint(connected ? "ask" : "connect");
			focusDraft();
		} else if (topic === "pages") showHint("pages");
		else if (topic === "edit") chooseTool("edit");
		else showHint(topic);
	};
	useEffect(() => {
		if (!account) return;
		const previous = document.activeElement;
		accountDialog.current?.focus();
		return () => {
			if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
		};
	}, [account]);
	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			if (entered) {
				setEntered(false);
				setOrdered(false);
				if (demo) setDemoStep(3);
				return;
			}
			setAccount(false);
			setGuide(false);
			setLesson(null);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [entered, demo]);
	const pages: readonly PageRow[] = !hasFrames
		? []
		: nested
			? [
					{ name: "app", frames: [], active: parent, open: true },
					{ name: "app/checkout", frames: ["cart"], active: !parent, open: !parent },
				]
			: [{ name: "app", frames: ["cart"], active: true, open: true }];
	const style: CSSProperties & { "--ob-strip": string; "--ob-panel": string } = {
		"--ob-strip": "44px",
		"--ob-panel": panel === "agent" ? "420px" : panel === "properties" ? "300px" : "0px",
	};
	return (
		<div className={cn("ob-exploration og-canvas", lesson === "agent" && "ob-point-agent")} style={style}>
			<div
				className="ob-app"
				onClickCapture={(event) => {
					if (!(event.target instanceof Element)) return;
					const glyph = event.target.closest<HTMLElement>("[data-dock-glyph]")?.dataset.dockGlyph;
					if (glyph === "agent" || glyph === "properties") {
						setPanel(panel === glyph ? null : glyph);
						if (glyph === "agent" && panel !== "agent" && !demo && lesson === "agent")
							showHint(connected ? "ask" : "connect");
					}
				}}
			>
				<SpoolShell
					activeTab={demo ? "demo" : "kaffe"}
					tabs={demo ? ["kaffe", "demo"] : ["kaffe"]}
					zoom={visibleFrame ? "62%" : "100%"}
					onFocus={(tab) => {
						if (tab === "kaffe" && demo) exitDemo();
					}}
					onClose={(tab) => {
						if (tab === "demo") exitDemo();
					}}
				>
					<CanvasChrome
						pages={pages}
						selected={selected ? "cart" : undefined}
						tool="none"
						railLabel={panel ?? "properties"}
						railWidth={panel === "agent" ? 420 : panel === "properties" ? 300 : 0}
						rail={
							panel === null ? null : panel === "properties" ? (
								element ? (
									<div className="og-properties">
										<div>
											cart <span>› button</span>
										</div>
										<label>
											Text
											<input
												ref={textField}
												aria-label="Button text"
												value={buttonText}
												onChange={(event) => setButtonText(event.target.value)}
											/>
										</label>
										<p>Changes appear on the canvas.</p>
									</div>
								) : undefined
							) : (
								<div className="ob-agent">
									<div className="ob-agent-heading">
										<span>{demo ? "guided example" : sent ? "Coffee shop checkout" : "new conversation"}</span>
										<button type="button" aria-label="Close agent" onClick={() => setPanel(null)}>
											<CloseIcon className="h-3 w-3" />
										</button>
									</div>
									<div className="ob-transcript">
										{demo ? (
											<div className="og-demo-copy">
												<h2>{demoStep === 3 ? "That is the loop." : "Try a small change."}</h2>
												<p>
													{demoStep === 0
														? "This project is ready to explore. Select cart on the canvas."
														: demoStep === 1
															? "The cart selection travels with your ask. See what a simple change looks like."
															: demoStep === 2
																? "The button now says Place order. Double-click cart to use it."
																: "Select something, change it, then use it. You can also try Edit and browse the guide."}
												</p>
												<span>Scripted example. Your account is not used.</span>
											</div>
										) : sent ? (
											<div className="og-sent" aria-live="polite">
												<p>{sent}</p>
												<div>
													<CheckIcon className="h-3 w-3" /> <span>{hasFrames ? "cart is ready" : "write cart"}</span>
												</div>
												<p>
													The checkout is on the canvas. Select it to give me a direction, or double-click to try it.
												</p>
											</div>
										) : (
											<div className="og-start">
												<h1>{connected ? "Make something of your own." : "Start with your agent."}</h1>
												<p>
													{connected
														? "Describe one screen to start with. You can keep shaping it together."
														: "Connect an account, then describe what you want to make."}
												</p>
												<button
													type="button"
													className="og-prompt"
													onClick={() => {
														setDraft(
															visibleFrame
																? "Make the checkout button easier to notice."
																: "Make a mobile checkout for a coffee shop.",
														);
														focusDraft();
													}}
												>
													Try an example prompt <span aria-hidden="true">↗</span>
												</button>
											</div>
										)}
										{demo && sent && (
											<div className="og-example-turn">
												<span>Example ask</span>
												<p>{sent}</p>
												<div>
													<CheckIcon className="h-3 w-3" />
													cart · button text changed
												</div>
											</div>
										)}
									</div>
									{demo ? (
										<div className="og-demo-controls">
											{demoStep === 0 ? (
												<p>Select cart to begin.</p>
											) : demoStep === 1 ? (
												<Action onClick={exampleChange}>
													Show example change <span aria-hidden="true">→</span>
												</Action>
											) : demoStep === 2 ? (
												<Action onClick={enter}>
													Try the frame <span aria-hidden="true">↗</span>
												</Action>
											) : (
												<Action onClick={exitDemo}>
													Back to my project <span aria-hidden="true">→</span>
												</Action>
											)}
											<span>{demoStep === 0 ? "1" : demoStep < 2 ? "2" : "3"} of 3 · select, change, try</span>
											<button type="button" className="og-demo-exit" onClick={exitDemo}>
												Back to kaffe
											</button>
										</div>
									) : (
										<div className="ob-composer">
											{selected && (
												<div className="ob-context">
													<FrameIcon className="h-3 w-3" />
													<span>{element ? "cart · button" : "cart"}</span>
												</div>
											)}
											<textarea
												ref={input}
												aria-label="Message your agent"
												placeholder={hasFrames ? "Ask for a change…" : "Describe your first frame…"}
												value={draft}
												onChange={(event) => setDraft(event.target.value)}
												onKeyDown={(event) => {
													if (event.key === "Enter" && !event.shiftKey) {
														event.preventDefault();
														send();
													}
												}}
											/>
											<div className="ob-composer-foot">
												<button
													type="button"
													className="og-account-button"
													onClick={() => {
														setLesson(null);
														setAccount(true);
													}}
												>
													{connected ? `${provider} · connected` : "Connect account…"}
												</button>
												<button
													type="button"
													aria-label="Send your message"
													className="ob-send"
													disabled={!connected || !draft.trim()}
													onClick={send}
												>
													↑
												</button>
											</div>
										</div>
									)}
								</div>
							)
						}
					>
						<div className="og-crumb">
							{nested ? (
								<>
									<button
										type="button"
										onClick={() => {
											setPage("app");
											setSelected(false);
											setElement(false);
											setEntered(false);
											setGuide(false);
											setLesson(null);
										}}
									>
										app
									</button>
									{!parent && (
										<>
											<span>/</span>
											<span>checkout</span>
										</>
									)}
								</>
							) : (
								<span>{demo ? "demo" : "app"}</span>
							)}
						</div>
						{parent ? (
							<div className="og-page-field">
								<div className="og-page-name">
									<FolderIcon className="h-4 w-4" />
									<span>checkout</span>
									<span>1 frame</span>
								</div>
								<button
									type="button"
									aria-label="Open checkout page"
									className="og-page-object"
									onDoubleClick={openChild}
								>
									<div className="og-page-mini">
										<CoffeeScreen screen="cart" />
									</div>
								</button>
								<button type="button" className="og-page-enter" onClick={openChild}>
									Open checkout <span aria-hidden="true">↗</span>
								</button>
							</div>
						) : visibleFrame ? (
							<div className={cn("og-frame", selected && !entered && !element && "og-selected")}>
								<div className="og-frame-label">
									<button type="button" onClick={selectFrame} onDoubleClick={enter}>
										{ordered ? "receipt" : "cart"}
									</button>
									{entered ? (
										<button
											type="button"
											onClick={() => {
												setEntered(false);
												setOrdered(false);
												if (demo) setDemoStep(3);
											}}
										>
											live · esc exits
										</button>
									) : (
										<button type="button" aria-label="Play cart" onClick={enter}>
											<PlayIcon className="h-2 w-2" />
											play
										</button>
									)}
								</div>
								<div className="og-frame-body">
									<CoffeeScreen screen={ordered ? "receipt" : "cart"} actionLabel={buttonText} />
									{!entered && tool !== "edit" && (
										<button
											type="button"
											className="og-hit-frame"
											aria-label="Select cart frame"
											onClick={selectFrame}
											onDoubleClick={enter}
										/>
									)}
									{!entered && tool === "edit" && (
										<button
											type="button"
											className={cn("og-hit-button", element && "og-element-selected")}
											aria-label={`Select ${buttonText} button`}
											onClick={() => {
												setSelected(true);
												setElement(true);
												setPanel("properties");
												setLesson(null);
											}}
										/>
									)}
									{entered && !ordered && (
										<button type="button" className="og-live-button" onClick={() => setOrdered(true)}>
											{buttonText}
										</button>
									)}
								</div>
							</div>
						) : (
							<div className="ob-empty-field">
								<div className="ob-empty-outline">
									<FrameIcon className="h-5 w-5" />
								</div>
								<p>Your first frame will appear here.</p>
								<span>Start with an ask in the agent panel.</span>
							</div>
						)}
						{visibleFrame && !entered && <CanvasTools tool={tool} onTool={chooseTool} />}
					</CanvasChrome>
				</SpoolShell>
				<div className="ob-rail-foot">
					<button
						type="button"
						className={cn("ob-help-button", guide && "ob-active")}
						aria-label="Open canvas guide"
						aria-expanded={guide}
						onClick={() => {
							setGuide(!guide);
							setLesson(null);
						}}
					>
						?
					</button>
				</div>
				<AnimatePresence>
					{guide && (
						<Coach key="guide" title="Find your way around." position="guide" onDismiss={() => setGuide(false)}>
							<div className="og-guide-next">
								<p>
									{parent
										? "checkout has its own canvas. Its frames are inside."
										: !visibleFrame
											? "Start here on an empty canvas."
											: element
												? "You are editing an element."
												: selected
													? "You have selected cart."
													: "There is a frame to try."}
								</p>
								<button
									type="button"
									onClick={() => {
										if (parent) openChild();
										else if (next === "play") enter();
										else if (element) {
											setPanel("properties");
											setGuide(false);
											requestAnimationFrame(() => textField.current?.focus());
										} else perform(next);
									}}
								>
									{suggested}
									<span aria-hidden="true">↗</span>
								</button>
							</div>
							<div className="og-topic-list">
								{guideTopics
									.filter((topic) => topic !== next || topic === "pages")
									.map((topic) => (
										<button type="button" key={topic} onClick={() => perform(topic)}>
											{topic === "connect"
												? "Accounts and models"
												: topic === "ask"
													? "Ask your agent"
													: topic === "select"
														? "Select, then enter"
														: topic === "edit"
															? "Edit what is inside"
															: topic === "play"
																? "Use a frame"
																: "Folders are pages"}
											<span aria-hidden="true">↗</span>
										</button>
									))}
							</div>
							{!demo && (
								<button type="button" className="og-try-demo" onClick={startDemo}>
									<span>Try the demo project</span>
									<span>Ready-made frames. An account is optional.</span>
								</button>
							)}
						</Coach>
					)}
					{lesson && (
						<Coach
							key={lesson}
							title={LESSONS[lesson].title}
							position={
								lesson === "agent"
									? "rail"
									: lesson === "connect" || lesson === "ask"
										? "composer"
										: lesson === "pages"
											? "properties"
											: "guide"
							}
							onDismiss={closeHint}
						>
							<p>{LESSONS[lesson].text}</p>
							<Action
								onClick={() => {
									if (lesson === "agent") openAgent();
									else if (lesson === "connect") {
										setLesson(null);
										setAccount(true);
									} else if (lesson === "ask") {
										setLesson(null);
										focusDraft();
									} else if (lesson === "pages") openChild();
									else if (lesson === "play") enter();
									else setLesson(null);
								}}
							>
								{lesson === "agent"
									? "Open agent"
									: lesson === "connect"
										? "Connect account"
										: lesson === "ask"
											? "Write an ask"
											: lesson === "pages"
												? "Open checkout"
												: lesson === "play"
													? "Try cart"
													: "Got it"}
								<span aria-hidden="true">→</span>
							</Action>
						</Coach>
					)}
				</AnimatePresence>
				{account && (
					<div className="og-account-scrim">
						<section role="dialog" aria-modal="true" aria-label="Connect an account" className="og-account-dialog">
							<header>
								<h2>Connect an account</h2>
								<button type="button" aria-label="Close account dialog" onClick={() => setAccount(false)}>
									<CloseIcon className="h-4 w-4" />
								</button>
							</header>
							<p>Choose the account you want to use in spool.</p>
							{["ChatGPT", "Grok"].map((name) => (
								<button
									type="button"
									key={name}
									className="og-provider"
									onClick={() => {
										setProvider(name);
										setConnected(true);
										setAccount(false);
										setPanel("agent");
										showHint("ask");
									}}
								>
									<span>Sign in with {name}</span>
									<span aria-hidden="true">↗</span>
								</button>
							))}
							<span className="og-auth-note">Prototype: sign-in is simulated.</span>
						</section>
					</div>
				)}
			</div>
			<footer className="ob-notes">
				<div>
					<strong>{demo ? "Optional demo project" : "The hint follows the canvas"}</strong>
					<p>
						{demo
							? "Prepared frames and a scripted change you can try without connecting an account."
							: "Accounts, frames, selection and pages determine the next useful lesson."}
					</p>
					<span>
						{demo
							? "Select cart, reveal a sample change, then try it. Return to your own project whenever you are ready."
							: "No frame: start with an ask. Frames inside a page: open that page. A selected element: explain Edit."}
					</span>
				</div>
				<div className="ob-notes-controls">
					<span>prototype · sign-in and replies simulated</span>
					<button type="button" onClick={onReplay}>
						<RestartIcon className="h-3 w-3" />
						Replay
					</button>
				</div>
			</footer>
		</div>
	);
}
