import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "shared/lib/utils";
import { CanvasChrome } from "shared/ui/spool/canvas-chrome";
import { SpoolShell } from "shared/ui/spool/shell";
import { AgentIcon, ArrowRightIcon, CloseIcon, FolderIcon } from "shared/ui/spool/icons";
import { SpoolMark } from "shared/ui/spool/mark";
import { CoffeeScreen } from "shared/ui/demo/coffee-screens";

export const PROJECT_PATH = "/Users/you/Projects/kaffe";
export const START_PROMPT =
	"Read this project's agent instructions and design/AGENTS.md, then follow its spool skill command. Help me design in the existing design/ folder. Start by asking what I want to make.";
export type AgentApp = "claude" | "codex" | "opencode" | "antigravity";
export type NoticeTake = "inline" | "dialog" | "choice" | "ready" | "claude" | "empty";

const PRIMARY =
	"inline-flex min-h-10 items-center justify-center gap-2 rounded-sm bg-text px-4 text-bg type-control hover:bg-text/90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-thread";
const SECONDARY =
	"inline-flex min-h-10 items-center justify-center gap-2 rounded-sm border border-border-raised px-4 text-text type-control hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-thread";
const QUIET = "rounded-sm text-muted type-control hover:text-text focus-visible:outline-2 focus-visible:outline-thread";

export function Prototype({ note, children }: { note: string; children: ReactNode }) {
	return (
		<div className="flex h-full flex-col overflow-hidden bg-bg font-sans text-text">
			<div className="relative min-h-0 flex-1">{children}</div>
			<div
				className="flex h-10 shrink-0 items-center border-t border-border px-5 font-mono text-xs text-muted"
				role="status"
			>
				{note}
			</div>
		</div>
	);
}

export function CopyButton({
	text,
	label,
	onCopy,
	primary = false,
	quiet = false,
}: {
	text: string;
	label: string;
	onCopy: (text: string) => Promise<void>;
	primary?: boolean;
	quiet?: boolean;
}) {
	const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
	return (
		<div>
			<button
				type="button"
				className={quiet ? QUIET : primary ? PRIMARY : SECONDARY}
				onClick={() => {
					void onCopy(text)
						.then(() => setState("copied"))
						.catch(() => setState("failed"));
				}}
			>
				{state === "copied" ? "Copied" : label}
				{state === "copied" ? <span aria-hidden="true">✓</span> : null}
			</button>
			{state === "failed" ? (
				<p role="alert" className="mt-2 text-muted type-label">
					Could not copy. Select the text and copy it manually.
				</p>
			) : null}
		</div>
	);
}

function CanvasFrames() {
	return (
		<div className="absolute inset-0 flex items-center justify-center gap-7 px-8 pb-8">
			{(["menu", "cart"] as const).map((name) => (
				<div key={name} className="shrink-0">
					<div className="mb-3 flex items-center justify-between text-muted type-detail">
						<span>{name}</span>
						<span>390 × 844</span>
					</div>
					<div className="h-[509px] w-[235px] overflow-hidden rounded-[2px]">
						<div className="h-[520px] w-[240px] origin-top-left" style={{ transform: "scale(0.979167)" }}>
							<CoffeeScreen screen={name} />
						</div>
					</div>
				</div>
			))}
		</div>
	);
}

export function Backdrop({
	rail,
	empty = false,
	onGuide,
	onCopy,
}: {
	rail: ReactNode;
	empty?: boolean;
	onGuide?: () => void;
	onCopy?: (text: string) => Promise<void>;
}) {
	return (
		<SpoolShell activeTab="kaffe" tabs={["kaffe", "spool"]} zoom={empty ? "100%" : "60%"}>
			<CanvasChrome
				pages={empty ? [] : [{ name: "app", frames: ["menu", "cart"], active: true, open: true }]}
				rail={rail}
				railWidth={rail === null ? 0 : 420}
				railLabel="Agent"
				tool={empty ? "none" : "select"}
			>
				{empty ? (
					<div className="flex h-full items-center justify-center pb-12">
						<div className="absolute left-7 top-6">
							<p className="type-body">kaffe</p>
							<p className="mt-1 text-muted type-detail">saved on this mac</p>
						</div>
						<div className="flex max-w-[410px] flex-col items-center text-center">
							<SpoolMark className="mb-6 h-10 w-8 text-thread" />
							<h1 className="type-heading">Your canvas is ready.</h1>
							<p className="mt-3 text-muted type-body">
								Open this project in your usual coding app and tell your agent what you’d like to design.
							</p>
							<button type="button" onClick={onGuide} className={cn(PRIMARY, "mt-7")}>
								Use my agent <ArrowRightIcon className="h-4 w-4" />
							</button>
							<code className="mt-6 select-text text-muted type-detail">{PROJECT_PATH}</code>
							{onCopy ? (
								<div className="mt-3">
									<CopyButton quiet text={PROJECT_PATH} label="Copy project path" onCopy={onCopy} />
								</div>
							) : null}
							<p className="mt-7 text-muted type-label">Your agent’s edits appear here as it works.</p>
						</div>
					</div>
				) : (
					<CanvasFrames />
				)}
			</CanvasChrome>
		</SpoolShell>
	);
}

function Composer({ claude = false }: { claude?: boolean }) {
	const [draft, setDraft] = useState("");
	return (
		<div className="px-3.5 pb-3.5">
			<div className="mb-2 flex justify-between text-muted type-detail">
				<span>
					{claude ? "Claude Code" : "spool"} <span aria-hidden="true">⌄</span>
				</span>
				<span className="type-caption">For this new chat</span>
			</div>
			<div className="rounded-md border border-border-raised bg-surface px-3 py-2.5">
				<textarea
					aria-label="Message your agent"
					value={draft}
					onChange={(event) => setDraft(event.target.value)}
					placeholder="What would you like to make?"
					className="h-16 w-full resize-none bg-transparent type-body outline-none placeholder:text-muted"
				/>
				<div className="flex items-center justify-between text-muted type-detail">
					<span>
						{claude ? "Claude Code default" : "Choose a model"} <span aria-hidden="true">⌄</span>
					</span>
					<span aria-hidden="true" className="text-lg">
						↑
					</span>
				</div>
			</div>
		</div>
	);
}

function RailHeader() {
	return (
		<div className="flex h-11 shrink-0 items-center justify-between border-b border-border px-4">
			<span className="type-control">New chat</span>
			<span className="text-muted type-heading" aria-hidden="true">
				+
			</span>
		</div>
	);
}

function LimitCopy() {
	return (
		<p className="text-muted type-body">
			The spool agent can edit files and run commands. It doesn’t include built-in web search or your app’s connected
			tools.
		</p>
	);
}

function ClaudeCopy({ onClaude }: { onClaude: () => void }) {
	return (
		<p className="text-muted type-label">
			Claude Code also runs inside spool with its own tools, including web search.{" "}
			<button
				type="button"
				className="text-text underline decoration-border-raised underline-offset-4 hover:decoration-text"
				onClick={onClaude}
			>
				Use Claude Code here
			</button>
		</p>
	);
}

export function Modal({
	children,
	onClose,
	wide = false,
	title,
}: {
	children: ReactNode;
	onClose: () => void;
	wide?: boolean;
	title: string;
}) {
	const ref = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const previous = document.activeElement;
		ref.current?.focus({ preventScroll: true });
		return () => {
			if (previous instanceof HTMLElement) previous.focus({ preventScroll: true });
		};
	}, []);
	return (
		<div className="absolute inset-0 z-30 flex items-center justify-center bg-bg/75 p-8">
			<div
				ref={ref}
				role="dialog"
				aria-modal="true"
				aria-label={title}
				tabIndex={-1}
				className={cn(
					"relative max-h-full overflow-auto rounded-lg border border-border-raised bg-surface outline-none",
					wide ? "w-[800px]" : "w-[536px]",
				)}
				onKeyDown={(event) => {
					if (event.key === "Escape") {
						event.stopPropagation();
						onClose();
					}
					if (event.key !== "Tab") return;
					const items = ref.current?.querySelectorAll<HTMLElement>(
						'button:not([disabled]), a[href], input, textarea, [tabindex="0"]',
					);
					const first = items?.[0];
					const last = items?.[items.length - 1];
					if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) {
						event.preventDefault();
						last?.focus();
					} else if (!event.shiftKey && document.activeElement === last) {
						event.preventDefault();
						first?.focus();
					}
				}}
			>
				<button
					type="button"
					aria-label="Close"
					onClick={onClose}
					className="absolute right-4 top-4 z-10 flex h-7 w-7 items-center justify-center rounded-sm text-muted hover:bg-raised hover:text-text"
				>
					<CloseIcon className="h-4 w-4" />
				</button>
				{children}
			</div>
		</div>
	);
}

export function NoticeStage({
	take,
	onGuide,
	onContinue,
	onClaude,
	onCopy,
}: {
	take: NoticeTake;
	onGuide: () => void;
	onContinue: () => void;
	onClaude: () => void;
	onCopy: (text: string) => Promise<void>;
}) {
	const [railOpen, setRailOpen] = useState(take !== "empty");
	const [read, setRead] = useState(take === "ready" || take === "claude");
	const claude = take === "claude";
	const closeNotice = () => {
		setRead(true);
		onContinue();
	};
	const rail = (
		<div className="flex h-full flex-col bg-bg">
			<RailHeader />
			{take === "inline" && !read ? (
				<div className="flex min-h-0 flex-1 flex-col px-6 pt-10">
					<h1 className="max-w-[290px] text-[23px] font-medium leading-[30px] tracking-tight">
						Use the agent you already know.
					</h1>
					<p className="mt-4 text-muted type-body">
						We recommend your usual coding app for its web search, connected tools and familiar setup.
					</p>
					<div className="my-6 border-y border-border py-5">
						<LimitCopy />
					</div>
					<button type="button" className={PRIMARY} onClick={onGuide}>
						Use my agent <ArrowRightIcon className="h-4 w-4" />
					</button>
					<button type="button" className={cn(QUIET, "mt-4 min-h-8")} onClick={closeNotice}>
						Continue in spool
					</button>
					<div className="mt-auto pb-7 pt-8">
						<ClaudeCopy onClaude={onClaude} />
					</div>
				</div>
			) : (
				<>
					<div className="flex min-h-0 flex-1 flex-col px-5">
						<div className="my-auto py-10">
							<AgentIcon className="mb-4 h-6 w-6 text-muted" />
							<h2 className="type-heading">{claude ? "Claude Code, on your canvas." : "Start with an idea."}</h2>
							<p className="mt-2 text-muted type-body">
								{claude
									? "You’re using Claude Code on this Mac. Its tools, including web search, are available here under your project’s permissions."
									: "Ask for a first screen, a different direction, or a small change to what’s here."}
							</p>
							{claude ? (
								<p className="mt-4 text-muted type-label">
									Your Claude desktop app may have additional tools and connections.
								</p>
							) : null}
						</div>
						{read ? (
							<div className="mb-5 border-t border-border pt-4">
								<button type="button" className={QUIET} onClick={onGuide}>
									Open in my agent <span aria-hidden="true">↗</span>
								</button>
								{!claude ? (
									<p className="mt-1 text-muted type-label">The spool agent has no built-in web search.</p>
								) : null}
							</div>
						) : null}
					</div>
					<Composer claude={claude} />
				</>
			)}
		</div>
	);
	return (
		<>
			<Backdrop rail={railOpen ? rail : null} empty={take === "empty"} onGuide={onGuide} onCopy={onCopy} />
			<button
				type="button"
				aria-label={railOpen ? "Close agent panel" : "Open agent panel"}
				onClick={() => setRailOpen(!railOpen)}
				className={cn(
					"absolute right-[5px] top-[91px] z-20 flex h-[34px] w-[34px] items-center justify-center rounded-sm",
					railOpen ? "bg-surface text-text" : "bg-bg text-muted hover:bg-surface",
				)}
			>
				<AgentIcon className="h-4 w-4" />
			</button>
			{(take === "dialog" || (take === "empty" && railOpen)) && !read ? (
				<Modal onClose={closeNotice} title="Use the agent you already know">
					<div className="px-8 pb-7 pt-9">
						<h1 className="max-w-[400px] pr-7 text-[26px] font-medium leading-[33px] tracking-tight">
							Use the agent you already know.
						</h1>
						<p className="mt-4 text-muted type-body">
							We recommend opening this project in your usual coding app. You keep its web search, connected
							tools and setup.
						</p>
						<div className="my-6 border-y border-border-raised py-5">
							<LimitCopy />
						</div>
						<div className="flex gap-3">
							<button type="button" onClick={onGuide} className={PRIMARY}>
								Use my agent <ArrowRightIcon className="h-4 w-4" />
							</button>
							<button type="button" onClick={closeNotice} className={SECONDARY}>
								Continue in spool
							</button>
						</div>
						<div className="mt-6">
							<ClaudeCopy onClaude={onClaude} />
						</div>
					</div>
				</Modal>
			) : null}
			{take === "choice" && !read ? (
				<Modal onClose={closeNotice} wide title="Choose where your agent works">
					<div className="px-8 pb-7 pt-9">
						<h1 className="text-[26px] font-medium leading-[33px] tracking-tight">
							Where would you like to work?
						</h1>
						<p className="mt-3 text-muted type-body">
							We recommend your usual coding app. Every option edits this same project.
						</p>
						<div className="my-7 grid grid-cols-2 divide-x divide-border-raised border-y border-border-raised py-6">
							<div className="flex flex-col pr-7">
								<h2 className="type-heading">Your agent app</h2>
								<p className="mt-3 text-muted type-body">
									Keep the web search, tools and connections you’ve set up in Claude, Codex, OpenCode or
									another coding app.
								</p>
								<p className="mb-6 mt-3 text-muted type-body">
									Changes appear on this canvas as your agent works.
								</p>
								<button type="button" className={cn(PRIMARY, "mt-auto self-start")} onClick={onGuide}>
									Use my agent <ArrowRightIcon className="h-4 w-4" />
								</button>
							</div>
							<div className="flex flex-col pl-7">
								<h2 className="type-heading">The spool agent</h2>
								<p className="mt-3 text-muted type-body">
									Chat beside your canvas. Edit files and run commands with the model you choose.
								</p>
								<p className="mb-6 mt-3 text-muted type-body">
									Built-in web search and your app’s connected tools aren’t included.
								</p>
								<button type="button" className={cn(SECONDARY, "mt-auto self-start")} onClick={closeNotice}>
									Continue in spool
								</button>
							</div>
						</div>
						<ClaudeCopy onClaude={onClaude} />
					</div>
				</Modal>
			) : null}
		</>
	);
}

// Guide steps checked against vendor docs on 2026-09-09:
// https://code.claude.com/docs/en/desktop-quickstart
// https://learn.chatgpt.com/docs/developer-commands?surface=cli#codex-app
// https://opencode.ai/docs/cli/ and https://dev.opencode.ai/docs/tools/
// https://antigravity.google/docs/getting-started
const APPS: readonly { id: AgentApp; name: string; detail: string; letter: string }[] = [
	{ id: "claude", name: "Claude", detail: "Code tab", letter: "C" },
	{ id: "codex", name: "Codex", detail: "ChatGPT desktop", letter: "○" },
	{ id: "opencode", name: "OpenCode", detail: "Terminal", letter: ">_" },
	{ id: "antigravity", name: "Antigravity", detail: "Gemini", letter: "A" },
];

function Step({ number, title, children }: { number: number; title: string; children: ReactNode }) {
	return (
		<div className="flex gap-3.5">
			<span className="mt-px flex h-[23px] w-[23px] shrink-0 items-center justify-center rounded-full border border-border-raised text-muted type-detail">
				{number}
			</span>
			<div className="min-w-0 flex-1">
				<h3 className="type-title">{title}</h3>
				<div className="mt-2 text-muted type-body">{children}</div>
			</div>
		</div>
	);
}

export function GuideStage({
	app,
	onSelect,
	onClose,
	onCopy,
	onLaunch,
}: {
	app: AgentApp;
	onSelect: Record<AgentApp, () => void>;
	onClose: () => void;
	onCopy: (text: string) => Promise<void>;
	onLaunch: () => void;
}) {
	const info = APPS.find((item) => item.id === app);
	return (
		<>
			<Backdrop rail={null} />
			<Modal onClose={onClose} wide title="Open this project in your agent">
				<header className="border-b border-border-raised px-7 py-6">
					<h1 className="text-[23px] font-medium leading-[30px] tracking-tight">Open kaffe in your agent</h1>
					<p className="mt-2 text-muted type-body">Same folder. Your agent’s edits appear on this canvas.</p>
				</header>
				<div className="flex min-h-[508px]">
					<nav aria-label="Agent apps" className="w-[194px] shrink-0 border-r border-border-raised p-3">
						{APPS.map((item) => (
							<button
								key={item.id}
								type="button"
								onClick={onSelect[item.id]}
								aria-current={app === item.id ? "page" : undefined}
								className={cn(
									"mb-1 flex w-full items-center gap-3 rounded-sm px-3 py-3 text-left hover:bg-raised",
									app === item.id ? "bg-raised text-text" : "text-muted",
								)}
							>
								<span
									className="flex h-6 w-6 shrink-0 items-center justify-center font-mono text-md"
									aria-hidden="true"
								>
									{item.letter}
								</span>
								<span>
									<span className="block type-control">{item.name}</span>
									<span className="mt-0.5 block text-muted type-caption">{item.detail}</span>
								</span>
							</button>
						))}
						<p className="px-3 pt-6 text-muted type-label">
							Use another app? Open the project folder there and copy the starter prompt.
						</p>
					</nav>
					<div className="min-w-0 flex-1 px-7 py-6">
						<div className="mb-6 flex items-center gap-2.5 rounded-sm border border-border-raised px-3 py-3">
							<FolderIcon className="h-4 w-4 shrink-0 text-muted" />
							<code className="select-text text-muted type-detail">{PROJECT_PATH}</code>
						</div>
						<div className="space-y-6">
							<Step
								number={1}
								title={
									app === "opencode"
										? "Open a terminal in this project"
										: `Open this folder in ${info?.name ?? "your app"}`
								}
							>
								{app === "claude" ? (
									<>
										<p>
											In Claude, choose <span className="text-text">Code → Local → Select folder</span> and
											select the folder above.
										</p>
										<div className="mt-3">
											<CopyButton text={PROJECT_PATH} label="Copy project path" onCopy={onCopy} />
										</div>
										<p className="mt-3 type-label">
											Use the project’s working folder so edits reach this canvas. A separate worktree has
											its own files.
										</p>
									</>
								) : null}
								{app === "codex" ? (
									<>
										<p>
											Open the project locally in the desktop app. Keep working in this folder so your edits
											reach spool.
										</p>
										<div className="mt-3 flex gap-2">
											<button type="button" onClick={onLaunch} className={PRIMARY}>
												Open project <span aria-hidden="true">↗</span>
											</button>
											<CopyButton text={PROJECT_PATH} label="Copy path" onCopy={onCopy} />
										</div>
										<details className="mt-3 type-label">
											<summary className="cursor-pointer hover:text-text">
												Open from Terminal instead
											</summary>
											<code className="my-3 block select-text text-text type-detail">
												codex app &quot;{PROJECT_PATH}&quot;
											</code>
											<CopyButton
												text={`codex app "${PROJECT_PATH}"`}
												label="Copy command"
												onCopy={onCopy}
											/>
										</details>
									</>
								) : null}
								{app === "opencode" ? (
									<>
										<p>With OpenCode installed, run this command:</p>
										<code className="my-3 block select-text text-text type-detail">
											opencode &quot;{PROJECT_PATH}&quot;
										</code>
										<CopyButton text={`opencode "${PROJECT_PATH}"`} label="Copy command" onCopy={onCopy} />
										<p className="mt-3 type-label">
											Web search depends on your OpenCode provider and configuration.
										</p>
									</>
								) : null}
								{app === "antigravity" ? (
									<>
										<p>
											In Antigravity, choose <span className="text-text">New Project → Add Folder</span> and
											select this folder. Start your agent in <span className="text-text">Local Mode</span>.
										</p>
										<div className="mt-3">
											<CopyButton text={PROJECT_PATH} label="Copy project path" onCopy={onCopy} />
										</div>
										<p className="mt-3 type-label">Local Mode works on the folder spool is watching.</p>
									</>
								) : null}
							</Step>
							<Step number={2} title="Give your agent a starting point">
								<p>
									Read the project’s instructions, load the spool skill, and start designing in its existing
									folder.
								</p>
								<div className="mt-3">
									<CopyButton text={START_PROMPT} label="Copy starter prompt" onCopy={onCopy} />
								</div>
								<details className="mt-3 type-label">
									<summary className="cursor-pointer hover:text-text">Read the prompt</summary>
									<p className="mt-2 select-text leading-5">{START_PROMPT}</p>
								</details>
							</Step>
						</div>
					</div>
				</div>
				<footer className="flex items-center justify-between border-t border-border-raised px-7 py-4">
					<p className="text-muted type-label">This opens your files. Your spool chat stays here.</p>
					<button type="button" onClick={onClose} className={QUIET}>
						Back to canvas
					</button>
				</footer>
			</Modal>
		</>
	);
}
