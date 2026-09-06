import { type ReactNode, useEffect, useRef, useState } from "react";
import { type Effort, useModels } from "shared/lib/spool/agent-model";
import type { PlayEntry } from "shared/lib/spool/turn-play";
import { cn } from "shared/lib/utils";
import { FrameThumb } from "shared/ui/explore/agent/play-field";
import { AccountDialog } from "shared/ui/explore/engines/account-dialog";
import { EngineFooter } from "shared/ui/explore/engines/engine-footer";
import { LoginSimulation, useLoginPrototype } from "shared/ui/explore/engines/login-flow";
import { useModelScope } from "shared/ui/explore/engines/model-shortlist";
import type { PermissionMode } from "shared/ui/explore/engines/permission-menu";
import { CanvasChrome } from "shared/ui/spool/canvas-chrome";
import { MenuItem } from "shared/ui/spool/context-menu";
import { ChevronIcon, PlusIcon } from "shared/ui/spool/icons";
import { PlayRail, StateMark } from "shared/ui/spool/play-rail";
import { SpoolShell } from "shared/ui/spool/shell";

/** Remaining engine states. Every operation is simulated; no auth, files or commands are accessed. */
export type RecoverySeed =
	| "claude-ready"
	| "claude-choice"
	| "claude-missing"
	| "claude-first"
	| "claude-login"
	| "limit"
	| "limit-unknown"
	| "limit-models"
	| "file"
	| "command"
	| "unavailable"
	| "once"
	| "granted"
	| "denied"
	| "quiet"
	| "question"
	| "edits"
	| "bypass";
type Engine = "spool" | "claude";
type Access = "file" | "command" | "unavailable";
type Mode = PermissionMode;
type Grant = "src/ui/" | "commands";
type Thread = {
	id: number;
	engine: Engine;
	entries: readonly PlayEntry[];
	draft: string;
	model: string;
	effort: Effort;
	started: boolean;
	block: "login" | "limit" | null;
	held: string | null;
	request: Access | null;
	grants: readonly Grant[];
	question: boolean;
};
const ASK = "Make the receipt a little more spacious.";
const QUESTION = "Where should the order number go?";
const HISTORY: readonly PlayEntry[] = [
	{ key: "user", kind: "user", text: "Make the receipt easier to read.", context: "receipt" },
	{
		key: "read",
		kind: "line",
		state: "done",
		verb: "read",
		subject: "receipt",
		frame: "receipt",
		detail: "design/frames/app/receipt/frame.tsx",
	},
	{
		key: "edit",
		kind: "line",
		state: "done",
		verb: "edit",
		subject: "receipt",
		frame: "receipt",
		detail: "design/frames/app/receipt/frame.tsx",
	},
	{
		key: "look",
		kind: "line",
		state: "done",
		verb: "look",
		subject: "receipt",
		frame: "receipt",
		detail: "390 × 844",
	},
	{
		key: "reply",
		kind: "prose",
		full: "The confirmation is centered, with the order number underneath.",
		shown: "The confirmation is centered, with the order number underneath.",
	},
];
const EMPTY: Omit<Thread, "id" | "engine"> = {
	entries: [],
	draft: "",
	model: "chatgpt/Astra",
	effort: "high",
	started: false,
	block: null,
	held: null,
	request: null,
	grants: [],
	question: false,
};
const QUIET = "font-mono text-2xs leading-3";
const textNote = (text: string, count: number): PlayEntry => ({ key: `note-${count}`, kind: "note", text });

export function EngineRecovery({
	seed,
	buttons = "row",
	permissionFooter = true,
	permissionMenu = false,
	initialEngine,
	railWidth = 420,
	initialModel,
}: {
	seed: RecoverySeed;
	buttons?: "stack" | "row";
	permissionFooter?: boolean;
	permissionMenu?: boolean;
	initialEngine?: Engine;
	railWidth?: number;
	initialModel?: string;
}) {
	const isClaude = initialEngine === "claude" || (seed.startsWith("claude-") && seed !== "claude-choice");
	const isLimit = seed.startsWith("limit");
	const initialRequest: Access | null = seed === "file" || seed === "command" || seed === "unavailable" ? seed : null;
	const initial: Thread = {
		...EMPTY,
		id: 1,
		engine: isClaude ? "claude" : "spool",
		model: isClaude ? "default" : (initialModel ?? "chatgpt/Astra"),
		started: seed !== "claude-first" && seed !== "claude-choice",
		entries: seed === "claude-first" || seed === "claude-choice" ? [] : HISTORY,
		draft: seed === "claude-login" || isLimit ? "Keep the total aligned with the items." : ASK,
		block: seed === "claude-login" ? "login" : isLimit ? "limit" : null,
		held: seed === "claude-login" || isLimit ? ASK : null,
		request: initialRequest,
		grants: seed === "granted" ? ["commands"] : [],
		question: seed === "question" || seed === "bypass",
	};
	if (initial.held !== null) initial.entries = [...initial.entries, { key: "held-prompt", kind: "user", text: ASK }];
	if (seed === "once" || seed === "granted" || seed === "denied")
		initial.entries = [
			...initial.entries,
			textNote(
				seed === "once" ? "allowed once" : seed === "granted" ? "commands allowed for this thread" : "denied",
				0,
			),
			{
				key: "first-command",
				kind: "line",
				state: seed === "denied" ? "stopped" : "done",
				verb: "run",
				subject: "browser check",
				detail: "node scripts/check-receipt.mjs",
			},
		];
	const [threads, setThreads] = useState<readonly Thread[]>([initial]);
	const [active, setActive] = useState(1);
	const [remembered, setRemembered] = useState<Engine>(initial.engine);
	const current = threads.find((thread) => thread.id === active) ?? initial;
	const [menu, setMenu] = useState<"models" | "threads" | "permissions" | null>(
		permissionMenu ? "permissions" : seed === "claude-choice" || seed === "limit-models" ? "models" : null,
	);
	const [machine, setMachine] = useState<"ready" | "missing" | "signed-out">(
		seed === "claude-choice" || seed === "claude-missing"
			? "missing"
			: seed === "claude-first" || seed === "claude-login"
				? "signed-out"
				: "ready",
	);
	const [checking, setChecking] = useState(false);
	const [providerReady, setProviderReady] = useState(false);
	const [mode, setMode] = useState<Mode>(seed === "bypass" ? "bypass" : seed === "edits" ? "edits" : "ask");
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
	useEffect(
		() => () => {
			if (timer.current !== null) clearTimeout(timer.current);
		},
		[],
	);
	const scope = useModelScope();
	const claudeModels = useModels();
	const models = current.engine === "claude" ? claudeModels : scope.models;
	const login = useLoginPrototype();
	const patch = (values: Partial<Thread>, id = active) =>
		setThreads((all) => all.map((thread) => (thread.id === id ? { ...thread, ...values } : thread)));
	const append = (entries: readonly PlayEntry[]) => patch({ entries: [...current.entries, ...entries] });
	const start = (engine: Engine) => {
		setRemembered(engine);
		const id = Math.max(...threads.map((thread) => thread.id)) + 1;
		setThreads((all) => [...all, { ...EMPTY, id, engine, model: engine === "claude" ? "default" : "chatgpt/Astra" }]);
		setActive(id);
		setMenu(null);
		login.close();
	};
	const chooseEngine = (engine: Engine) => {
		setRemembered(engine);
		if (current.started) start(engine);
		else {
			patch({ engine, model: engine === "claude" ? "default" : "chatgpt/Astra" });
			setMenu(null);
		}
	};
	const finish = (id = active, note = "The receipt has more breathing room.") =>
		setThreads((all) =>
			all.map((thread) =>
				thread.id !== id
					? thread
					: {
							...thread,
							block: null,
							held: null,
							entries: [...thread.entries, textNote(note, thread.entries.length)],
						},
			),
		);
	const checkClaude = () => {
		if (checking) return;
		const id = active;
		setChecking(true);
		timer.current = setTimeout(() => {
			setChecking(false);
			if (machine === "ready") finish(id, "Signed in to Claude Code. The receipt has more breathing room.");
			else
				setThreads((all) =>
					all.map((thread) =>
						thread.id !== id
							? thread
							: {
									...thread,
									entries: [
										...thread.entries,
										textNote(
											machine === "missing"
												? "Claude Code is still not installed."
												: "Still signed out of Claude Code.",
											thread.entries.length,
										),
									],
								},
					),
				);
		}, 450);
	};
	const approve = (choice: "once" | "thread" | "deny" | "edits" | "bypass", requested = current.request) => {
		if (requested === null) return;
		const file = requested === "file";
		const grant: Grant = file ? "src/ui/" : "commands";
		patch({
			request: null,
			grants: choice === "thread" ? [...new Set([...current.grants, grant])] : current.grants,
			entries: [
				...current.entries,
				textNote(
					choice === "deny"
						? "denied"
						: choice === "once"
							? "allowed once"
							: choice === "edits" || choice === "bypass"
								? "allowed by agent permissions"
								: file
									? "edits in src/ui/ allowed for this thread"
									: "commands allowed for this thread",
					current.entries.length,
				),
				{
					key: `action-${current.entries.length}`,
					kind: "line",
					state: choice === "deny" ? "stopped" : "done",
					verb: file ? "edit" : "run",
					subject: file ? "src/ui/receipt.css" : "browser check",
					detail: file ? "src/ui/receipt.css" : "node scripts/check-receipt.mjs",
				},
			],
		});
	};
	const request = (access: Access) => {
		if (current.question) return;
		const granted =
			mode === "bypass" ||
			(access === "file" && mode === "edits") ||
			current.grants.includes(access === "file" ? "src/ui/" : "commands");
		if (granted)
			append([
				{
					key: `action-${current.entries.length}`,
					kind: "line",
					state: "done",
					verb: access === "file" ? "edit" : "run",
					subject: access === "file" ? "src/ui/receipt.css" : "browser check",
					detail: access === "file" ? "src/ui/receipt.css" : "node scripts/check-receipt.mjs",
				},
			]);
		else patch({ request: access });
	};
	const send = (text: string) => {
		if (current.request !== null || current.question || current.block !== null || current.held !== null) {
			patch({ draft: text });
			return;
		}
		if (current.engine === "claude" && machine !== "ready") {
			patch({
				started: true,
				block: "login",
				held: text,
				draft: "",
				entries: [...current.entries, { key: `user-${current.entries.length}`, kind: "user", text }],
			});
			return;
		}
		patch({
			started: true,
			draft: "",
			entries: [
				...current.entries,
				{ key: `user-${current.entries.length}`, kind: "user", text },
				textNote("The receipt is updated.", current.entries.length),
			],
		});
	};
	const missing = current.engine === "claude" && machine === "missing";
	const out = current.engine === "claude" && current.block === "login";
	const limited = current.block === "limit";
	const note = limited ? `ChatGPT limit reached${seed === "limit-unknown" ? "" : " · resets 15:40"}` : undefined;
	const questionEntries: readonly PlayEntry[] = current.question
		? [
				{
					key: "design-question",
					kind: "ask",
					state: "running",
					live: true,
					shown: QUESTION,
					ask: {
						header: "Order number",
						question: QUESTION,
						multi: false,
						options: [
							{ label: "Under the confirmation", description: "Keep the receipt centered." },
							{ label: "Beside the total", description: "Group the order details together." },
						],
					},
				},
			]
		: [];
	const footer = (
		<EngineFooter
			engine={current.engine}
			model={current.model}
			effort={current.effort}
			models={models}
			started={current.started}
			open={menu === "models"}
			onToggle={() => setMenu(menu === "models" ? null : "models")}
			onEngine={chooseEngine}
			claudeState={machine}
			notice={note}
			scope={current.engine === "spool" ? scope : undefined}
			modelTake="favorites"
			permissions={
				permissionFooter
					? {
							mode,
							open: menu === "permissions",
							onToggle: () => setMenu(menu === "permissions" ? null : "permissions"),
							onClose: () => setMenu(null),
							onChange: (next) => {
								setMode(next);
								setMenu(null);
								if (
									current.request !== null &&
									(next === "bypass" || (next === "edits" && current.request === "file"))
								)
									approve(next);
							},
						}
					: undefined
			}
			onManage={() => {}}
			onModel={(model) => {
				const levels = models.find((entry) => entry.value === model)?.supportedEffortLevels ?? [];
				patch({
					model,
					effort: levels.includes(current.effort) ? current.effort : (levels[0] ?? "high"),
					block: limited && !model.startsWith("chatgpt/") ? null : current.block,
				});
				scope.setQuery("");
				setMenu(null);
			}}
			onEffort={(effort) => patch({ effort })}
			onConnect={() => {
				setMenu(null);
				login.open();
			}}
		/>
	);
	const recovery =
		missing || out ? (
			<div data-recovery="claude" className="flex flex-col gap-3">
				<p className="text-base text-text leading-base">
					{missing ? "Claude Code isn’t installed." : "Sign in to Claude Code to continue."}
				</p>
				{missing ? (
					<a
						href="https://code.claude.com/docs/en/quickstart"
						target="_blank"
						rel="noreferrer"
						className="w-fit text-base text-muted underline underline-offset-4 hover:text-text"
					>
						Install Claude Code
					</a>
				) : (
					<p className="text-base text-muted leading-base">
						Run <code className="font-mono text-xs">claude</code> in a terminal, then{" "}
						<code className="font-mono text-xs">/login</code>.
					</p>
				)}
				<div className="flex flex-wrap items-center gap-3">
					<QuietAction onClick={checkClaude} disabled={checking}>
						{checking ? "checking…" : "check again"}
					</QuietAction>
					<QuietAction onClick={() => start("spool")}>new thread with spool</QuietAction>
				</div>
			</div>
		) : limited ? (
			<div data-recovery="limit" className="flex flex-col gap-3">
				<p className="text-base text-text leading-base">ChatGPT rate limit reached.</p>
				{seed === "limit-unknown" ? null : <p className="text-base text-muted leading-base">Try again at 15:40.</p>}
				<div className="flex items-center gap-3">
					<QuietAction
						onClick={() =>
							providerReady
								? finish()
								: append([textNote("ChatGPT is still limiting requests.", current.entries.length)])
						}
					>
						retry
					</QuietAction>
					<QuietAction
						onClick={() => {
							scope.setList("all");
							setMenu("models");
						}}
					>
						choose model
					</QuietAction>
				</div>
			</div>
		) : current.held !== null ? (
			<QuietAction onClick={() => finish()}>continue with this model</QuietAction>
		) : current.request !== null ? (
			<AccessPrompt
				access={current.request}
				buttons={buttons}
				onAnswer={approve}
				onPermissions={() => setMenu("permissions")}
			/>
		) : undefined;
	return (
		<SpoolShell activeTab="kaffe" zoom="64%">
			<CanvasChrome
				pages={[
					{ name: "app", frames: ["cart", "menu", "receipt"], active: true, open: true },
					{ name: "site", frames: [] },
				]}
				selected="receipt"
				railWidth={railWidth}
				railLabel="agent"
				rail={
					<div
						data-recovery-prototype={seed}
						data-engine={current.engine}
						data-grants={current.grants.join(",")}
						data-mode={mode}
						className="relative flex h-full min-w-0 flex-col"
						onKeyDownCapture={(event) => {
							if (event.key === "Escape" && menu !== null) {
								event.stopPropagation();
								setMenu(null);
							}
						}}
					>
						{menu === null ? null : (
							<button
								type="button"
								aria-label="Close menu"
								tabIndex={-1}
								className={cn("inset-0 z-20 cursor-default", menu === "permissions" ? "fixed" : "absolute")}
								onClick={() => setMenu(null)}
							/>
						)}
						<PlayRail
							key={active}
							entries={[...current.entries, ...questionEntries]}
							phase={
								current.request !== null || current.question || current.block !== null || current.held !== null
									? "playing"
									: "idle"
							}
							run={active * 1000 + current.entries.length}
							say="read"
							ask="log"
							shot="line"
							jump="name"
							have={["receipt"]}
							model={footer}
							draft={current.draft}
							onDraft={(draft) => patch({ draft })}
							onSend={send}
							onReplay={() => {}}
							disabled={missing}
							afterLog={recovery}
							onAnswer={(answer) =>
								patch({
									question: false,
									entries: [
										...current.entries,
										{
											key: `question-${current.entries.length}`,
											kind: "prose",
											full: QUESTION,
											shown: QUESTION,
										},
										{ key: `answer-${current.entries.length}`, kind: "user", text: answer },
									],
								})
							}
							onDeny={() =>
								patch({
									question: false,
									entries: [...current.entries, textNote("dismissed", current.entries.length)],
								})
							}
							nav={
								<div className="relative z-30 flex h-[34px] shrink-0 items-center gap-2 border-border border-b px-3.5">
									<button
										type="button"
										aria-label="Choose a thread"
										className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm text-text leading-4"
										onClick={() => setMenu(menu === "threads" ? null : "threads")}
									>
										<span className="min-w-0 flex-1 truncate">
											{current.started ? "receipt" : "new thread"}
										</span>
										<ChevronIcon open={menu === "threads"} className="h-2.5 w-2.5 text-muted" />
									</button>
									<button
										type="button"
										aria-label="New thread"
										className="flex h-6 w-6 items-center justify-center text-muted hover:text-text"
										onClick={() => start(remembered)}
									>
										<PlusIcon className="h-2.5 w-2.5" />
									</button>
									{menu === "threads" ? (
										<div className="absolute top-full right-0 left-0 border-border border-b bg-bg p-1.5">
											{threads.map((thread) => (
												<MenuItem
													key={thread.id}
													label={`${thread.started ? "receipt" : "new thread"} · ${thread.engine === "spool" ? "spool" : "Claude Code"}`}
													onClick={() => {
														setActive(thread.id);
														setMenu(null);
													}}
												/>
											))}
										</div>
									) : null}
								</div>
							}
						/>
					</div>
				}
			>
				<div className="absolute top-24 left-14 flex items-start gap-10">
					{["cart", "receipt"].map((name) => (
						<div key={name} className="relative">
							<span
								className={cn(
									"absolute -top-6 left-0 font-mono text-xs leading-xs",
									name === "receipt" ? "text-thread" : "text-muted",
								)}
							>
								{name}
							</span>
							<div className={cn(name === "receipt" && "outline outline-1 outline-thread outline-offset-2")}>
								<FrameThumb name={name} width={240} />
							</div>
						</div>
					))}
				</div>
				<div
					className="absolute right-10 bottom-20 left-14 flex flex-wrap items-center gap-x-4 gap-y-2 border-border border-t pt-3 text-muted/60"
					data-simulation=""
				>
					<span className={QUIET}>simulation</span>
					{seed.startsWith("claude") ? (
						<QuietAction onClick={() => setMachine("ready")}>finish Claude setup</QuietAction>
					) : isLimit ? (
						<QuietAction onClick={() => setProviderReady(true)}>limit clears</QuietAction>
					) : (
						<>
							<QuietAction
								onClick={() =>
									request(seed === "file" ? "file" : seed === "unavailable" ? "unavailable" : "command")
								}
							>
								repeat action
							</QuietAction>
							<QuietAction onClick={() => request("file")}>request file edit</QuietAction>
							<QuietAction onClick={() => patch({ question: true, request: null })}>
								ask a design question
							</QuietAction>
							<QuietAction
								onClick={() =>
									setThreads((all) =>
										all.map((thread) => ({
											...thread,
											grants: [],
											request: null,
											entries: [...thread.entries, textNote("agent restarted", thread.entries.length)],
										})),
									)
								}
							>
								restart agent
							</QuietAction>
							<QuietAction onClick={() => setMenu("permissions")}>agent permissions</QuietAction>
						</>
					)}
				</div>
				{login.view === null ? null : (
					<>
						<AccountDialog login={login} look="list" />
						<LoginSimulation login={login} />
					</>
				)}
			</CanvasChrome>
		</SpoolShell>
	);
}

function QuietAction({
	children,
	onClick,
	disabled = false,
}: {
	children: ReactNode;
	onClick: () => void;
	disabled?: boolean;
}) {
	return (
		<button
			type="button"
			disabled={disabled}
			onClick={onClick}
			className={cn(QUIET, "w-fit py-1 text-muted transition-colors hover:text-text disabled:text-muted/45")}
		>
			{children}
		</button>
	);
}

function AccessPrompt({
	access,
	buttons,
	onAnswer,
	onPermissions,
}: {
	access: Access;
	buttons: "stack" | "row";
	onAnswer: (choice: "once" | "thread" | "deny") => void;
	onPermissions: () => void;
}) {
	const file = access === "file";
	return (
		<div data-access-request={access} className="flex flex-col gap-3">
			<div className="flex items-center gap-2.5">
				<StateMark state="pending" />
				<span className="font-mono text-xs text-text/70 leading-4">
					{file ? "edit src/ui/receipt.css" : "run browser check"}
				</span>
			</div>
			{access === "unavailable" ? (
				<p className="text-base text-text leading-base">
					spool can’t restrict commands to design/ on this computer.
				</p>
			) : null}
			<p className="text-base text-text/90 leading-base">
				{file ? "Allow edits in src/ui/?" : "Allow commands to read and change files your account can access?"}
			</p>
			{file ? null : (
				<code className="break-words font-mono text-xs text-muted leading-4">node scripts/check-receipt.mjs</code>
			)}
			<div className={cn(buttons === "stack" ? "flex flex-col gap-1.5" : "flex flex-wrap gap-1.5")}>
				{(["once", "thread", "deny"] as const).map((choice) => (
					<button
						key={choice}
						type="button"
						onClick={() => onAnswer(choice)}
						className={cn(
							"rounded-md border border-border-raised bg-surface px-3 py-2 text-left transition-colors hover:border-muted/45",
							buttons === "stack" && "w-full",
						)}
					>
						<span className="font-mono text-sm text-text leading-4">
							{choice === "once" ? "allow once" : choice === "thread" ? "for this thread" : "deny"}
						</span>
					</button>
				))}
			</div>
			<QuietAction onClick={onPermissions}>change permissions…</QuietAction>
		</div>
	);
}
