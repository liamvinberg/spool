import { useState } from "react";
import { type ClaudeModel, type Effort, useModels } from "shared/lib/spool/agent-model";
import type { PlayEntry } from "shared/lib/spool/turn-play";
import { cn } from "shared/lib/utils";
import { FrameThumb } from "shared/ui/explore/agent/play-field";
import { AccountDialog, type AccountLook } from "shared/ui/explore/engines/account-dialog";
import { EngineFooter } from "shared/ui/explore/engines/engine-footer";
import {
	LoginPanel,
	type LoginSeed,
	LoginSimulation,
	type LoginTake,
	useLoginPrototype,
} from "shared/ui/explore/engines/login-flow";
import { CanvasChrome } from "shared/ui/spool/canvas-chrome";
import { MenuItem } from "shared/ui/spool/context-menu";
import { ChevronIcon, PlusIcon } from "shared/ui/spool/icons";
import { ModelMenu, ModelRow } from "shared/ui/spool/model-control";
import { PlayRail } from "shared/ui/spool/play-rail";
import { SpoolShell } from "shared/ui/spool/shell";
import { ThreadMark } from "shared/ui/spool/thread-mark";

/** Throwaway engine-placement proposals. Accounts are connected fixture state.
 * Engine selections reuse ModelRow; new-thread actions reuse MenuItem; the model
 * and effort control is ModelMenu itself. No account or engine is called.
 */
export type EngineTake = "foot" | "plate" | "start" | "combined";
export type ChoiceState = "new" | "choosing" | "thread";
type Engine = "spool" | "claude";
type Thread = {
	id: number;
	engine: Engine;
	name: string;
	entries: readonly PlayEntry[];
	model: string;
	effort: Effort;
	draft: string;
	started: boolean;
};

const ENGINES: readonly Engine[] = ["spool", "claude"];
const NAMES: Record<Engine, string> = { spool: "spool", claude: "Claude Code" };
const DESCRIPTIONS: Record<Engine, string> = {
	spool: "Built into spool. Uses your connected accounts.",
	claude: "Uses Claude Code’s login on this machine.",
};
// Specimen offers for layout. Claude uses the design system's captured offer.
const BUNDLED_MODELS: readonly ClaudeModel[] = [
	{
		value: "gpt-5.4",
		resolvedModel: "gpt-5.4",
		displayName: "GPT-5.4",
		description: "Uses your ChatGPT account.",
		supportsEffort: true,
		supportedEffortLevels: ["low", "medium", "high", "xhigh"],
	},
	{
		value: "gpt-5.4-mini",
		resolvedModel: "gpt-5.4-mini",
		displayName: "GPT-5.4 mini",
		description: "Uses your ChatGPT account.",
		supportsEffort: true,
		supportedEffortLevels: ["low", "medium", "high", "xhigh"],
	},
];
const QUIET = "font-mono text-2xs leading-3";
const REPLY = "The confirmation sits in the middle. The order number and email note stay underneath.";
const HISTORY: readonly PlayEntry[] = [
	{
		key: "ask",
		kind: "user",
		text: "Make the receipt easier to read.",
		context: "receipt",
	},
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
		detail: "Clearer order confirmation and email note.",
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
	{ key: "reply", kind: "prose", full: REPLY, shown: REPLY },
];

function makeThread(id: number, engine: Engine): Thread {
	return {
		id,
		engine,
		name: "new thread",
		entries: [],
		model: engine === "spool" ? "gpt-5.4" : "default",
		effort: "high",
		draft: "",
		started: false,
	};
}

export function EngineChoice({
	take,
	state = "new",
	login: loginSpec,
}: {
	take: EngineTake;
	state?: ChoiceState;
	login?: { take: LoginTake; seed: LoginSeed; look?: AccountLook };
}) {
	const claudeModels = useModels();
	const login = useLoginPrototype(loginSpec?.seed, loginSpec === undefined);
	const loginTake = loginSpec?.take ?? "popover";
	const existing: Thread = {
		...makeThread(1, loginSpec === undefined ? "claude" : "spool"),
		model: loginSpec === undefined ? "default" : "chatgpt/gpt-5.4",
		name: "Make the receipt easier to read.",
		entries: HISTORY,
		started: true,
		draft: loginSpec === undefined ? "" : "Give the receipt a little more breathing room.",
	};
	const [threads, setThreads] = useState<readonly Thread[]>(
		state === "thread"
			? [existing]
			: [
					existing,
					{
						...makeThread(2, "spool"),
						draft: loginSpec === undefined ? "" : "Make the receipt easier to read.",
					},
				],
	);
	const [active, setActive] = useState(state === "thread" ? 1 : 2);
	const [remembered, setRemembered] = useState<Engine>(state === "thread" ? existing.engine : "spool");
	const [menu, setMenu] = useState<"engine" | "threads" | null>(state === "choosing" ? "engine" : null);
	const [over, setOver] = useState<Engine | null>(null);
	const current = threads.find((thread) => thread.id === active) ?? existing;
	const bundled =
		take === "combined"
			? login.accounts.flatMap((account) => {
					// Layout specimens, not a maintained model catalog. The host supplies offers.
					if (account === "chatgpt" || account === "openai")
						return BUNDLED_MODELS.map((model) => ({
							...model,
							value: `${account}/${model.value}`,
							description: account === "chatgpt" ? model.description : "Uses your OpenAI API key.",
						}));
					const name =
						account === "anthropic" ? "Claude Sonnet 4.6" : account === "google" ? "Gemini 3.1 Pro" : "Grok 4";
					return [
						{
							value: `${account}/model`,
							resolvedModel: `${account}/model`,
							displayName: name,
							description: `Uses your ${account === "grok" ? "Grok account" : `${account} API key`}.`,
							supportsEffort: false,
							supportedEffortLevels: [],
						} satisfies ClaudeModel,
					];
				})
			: BUNDLED_MODELS;
	const models = current.engine === "spool" ? bundled : claudeModels;
	const modelValue =
		(current.started && current.model.includes("/")) || models.some((model) => model.value === current.model)
			? current.model
			: (models[0]?.value ?? current.model);
	const locked = current.started;
	const patch = (values: Partial<Thread>) =>
		setThreads((all) => all.map((thread) => (thread.id === active ? { ...thread, ...values } : thread)));
	const show = (next: typeof menu) => {
		setOver(null);
		setMenu(next);
	};
	const toggle = (next: typeof menu) => show(menu === next ? null : next);
	const start = (engine: Engine) => {
		login.close();
		const id = Math.max(...threads.map((thread) => thread.id)) + 1;
		setThreads((all) => [...all, makeThread(id, engine)]);
		setActive(id);
		show(null);
	};
	const choose = (engine: Engine) => {
		setRemembered(engine);
		if (take === "start" || locked) start(engine);
		else
			patch({
				engine,
				model: engine === "spool" ? "gpt-5.4" : "default",
				effort: "high",
			});
		show(null);
	};
	const send = (text: string) => {
		if (take === "combined" && current.engine === "spool" && !models.some((model) => model.value === modelValue)) {
			patch({ draft: text });
			login.open();
			show(null);
			return;
		}
		patch({
			started: true,
			model: modelValue,
			name: current.started ? current.name : text,
			draft: "",
			entries: [
				...current.entries,
				{ key: `user-${current.entries.length}`, kind: "user", text },
				{
					key: `note-${current.entries.length}`,
					kind: "note",
					text: `sent with ${NAMES[current.engine]}`,
				},
			],
		});
		show(null);
	};
	const freshAction = take === "start" || locked;
	const currentEngine = freshAction ? remembered : current.engine;
	const help =
		over === null
			? freshAction
				? `New threads use ${NAMES[remembered]}.`
				: DESCRIPTIONS[current.engine]
			: DESCRIPTIONS[over];
	const engineTrigger = locked ? (
		<span data-engine-fixed="" title="This thread keeps its engine." className={cn(QUIET, "truncate text-muted/45")}>
			{NAMES[current.engine]}
		</span>
	) : (
		<button
			type="button"
			data-engine-trigger=""
			aria-label="Choose an engine"
			aria-expanded={menu === "engine"}
			onClick={() => toggle("engine")}
			className={cn(
				QUIET,
				"flex min-w-0 items-center gap-1 transition-colors duration-150",
				menu === "engine" ? "text-muted" : "text-muted/45 hover:text-muted",
			)}
		>
			<span className="truncate">{NAMES[current.engine]}</span>
			<ChevronIcon className="h-2 w-2 shrink-0" open={menu === "engine"} />
		</button>
	);
	const picker = (
		<div
			data-engine-menu=""
			role={freshAction ? "menu" : undefined}
			className={cn(
				"rounded-md border border-border-raised bg-raised",
				freshAction ? "flex flex-col p-unit" : "p-1.5",
			)}
			onMouseLeave={() => setOver(null)}
		>
			{ENGINES.map((engine) => (
				<div
					key={engine}
					data-engine-choice={engine}
					className="flex flex-col"
					onMouseEnter={() => setOver(engine)}
					onFocusCapture={() => setOver(engine)}
				>
					{freshAction ? (
						<MenuItem label={`New thread with ${NAMES[engine]}`} onClick={() => choose(engine)} />
					) : (
						<ModelRow label={NAMES[engine]} on={currentEngine === engine} onPick={() => choose(engine)} />
					)}
				</div>
			))}
			<p
				className={cn(QUIET, "relative pt-1.5 pb-0.5 text-muted/40 leading-[1.5]", freshAction ? "mx-3" : "mx-1.5")}
			>
				<span className="invisible" aria-hidden="true">
					Built into spool. Uses your connected accounts.
				</span>
				<span className="absolute inset-x-0 top-1.5">{help}</span>
			</p>
		</div>
	);
	const newThread = () => (take === "start" ? toggle("engine") : start(remembered));
	const plate = (
		<div className="relative z-30 shrink-0">
			<div className="flex h-[34px] items-center gap-1 border-border border-b px-3.5">
				<button
					type="button"
					data-thread-list=""
					aria-label="Choose a thread"
					aria-expanded={menu === "threads"}
					onClick={() => toggle("threads")}
					className="-ml-1.5 flex h-7 min-w-0 flex-1 items-center gap-2 rounded-sm px-1.5 text-left transition-colors duration-150 hover:bg-surface"
				>
					<span
						className={cn("min-w-0 flex-1 truncate text-sm leading-4", locked ? "text-text" : "text-muted/60")}
					>
						{current.name}
					</span>
					{take === "start" ? (
						<span className={cn(QUIET, "shrink-0 text-muted/45")}>{NAMES[current.engine]}</span>
					) : null}
					<ChevronIcon open={menu === "threads"} className="h-2.5 w-2.5 shrink-0 text-muted/45" />
				</button>
				<button
					type="button"
					data-new-thread=""
					aria-label="New thread"
					title={`New thread with ${NAMES[remembered]}`}
					onClick={newThread}
					className="-mr-1.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-muted/45 transition-colors duration-150 hover:text-text"
				>
					<PlusIcon className="h-2.5 w-2.5" />
				</button>
			</div>
			{take === "plate" ? (
				<div className="flex h-[34px] items-center border-border border-b px-3.5">{engineTrigger}</div>
			) : null}
			{menu === "engine" && (take === "plate" || take === "start") ? (
				<div
					className={cn(
						"absolute top-full mt-1 animate-menu-in",
						take === "start" ? "right-1.5 w-[248px]" : "left-3.5 w-[300px]",
					)}
				>
					{picker}
				</div>
			) : null}
			{menu === "threads" ? (
				<div
					data-thread-menu=""
					className="absolute top-full right-0 left-0 max-h-80 animate-agent-menu-in overflow-auto border-border border-b bg-bg p-1.5"
				>
					{threads.map((thread) => (
						<button
							type="button"
							key={thread.id}
							data-open-thread={thread.name}
							aria-current={thread.id === active ? "true" : undefined}
							onClick={() => {
								setActive(thread.id);
								show(null);
							}}
							className={cn(
								"relative flex w-full items-start gap-2.5 rounded-sm px-2 py-2 text-left transition-colors duration-150",
								thread.id === active ? "bg-surface/70" : "hover:bg-surface/40",
							)}
						>
							{thread.id === active ? (
								<span className="absolute inset-y-0 left-0 w-[2px] rounded-full bg-thread" />
							) : null}
							<ThreadMark life="read" className="mt-px" />
							<span className="flex min-w-0 flex-1 flex-col gap-1">
								<span className="line-clamp-3 text-sm leading-4 text-text/85">{thread.name}</span>
								<span className={cn(QUIET, "text-muted/55")}>{NAMES[thread.engine]}</span>
							</span>
						</button>
					))}
				</div>
			) : null}
		</div>
	);
	const footer =
		take === "combined" ? (
			<EngineFooter
				key={`${active}:${current.engine}`}
				engine={current.engine}
				model={modelValue}
				effort={current.effort}
				models={models}
				started={locked}
				open={menu === "engine"}
				onToggle={() => {
					login.close();
					toggle("engine");
				}}
				onEngine={(engine) => {
					choose(engine);
					if (!locked) setMenu("engine");
				}}
				onModel={(model) => {
					const levels = models.find((entry) => entry.value === model)?.supportedEffortLevels ?? [];
					patch({
						model,
						effort: levels.includes(current.effort) ? current.effort : (levels[0] ?? "high"),
					});
					show(null);
				}}
				onEffort={(effort) => patch({ effort })}
				onConnect={() => {
					show(null);
					login.open();
				}}
			/>
		) : (
			<div className="relative flex min-w-0 flex-1 items-center gap-2.5">
				{take === "foot" ? (
					<>
						{engineTrigger}
						<span className="text-muted/30">·</span>
					</>
				) : null}
				{/* The shipped menu anchors to the footer, not to a shrinking model name.
				 * Scope that geometry here while using the existing component unchanged. */}
				<span data-model-control="" className="flex min-w-0 [&>span]:static [&>span>div]:max-w-full">
					<ModelMenu
						key={`${active}:${current.engine}:${menu ?? "none"}`}
						models={models}
						state={{
							engine: current.engine,
							value: current.model,
							effort: current.effort,
						}}
						onPick={(next) => {
							const value = next.value ?? current.model;
							const levels = models.find((model) => model.value === value)?.supportedEffortLevels ?? [];
							const effort =
								next.effort ?? (levels.includes(current.effort) ? current.effort : (levels[0] ?? "high"));
							patch({ model: value, effort });
						}}
					/>
				</span>
				{menu === "engine" && take === "foot" ? (
					<div className="absolute bottom-full left-0 z-30 mb-2 w-[300px] max-w-full animate-agent-menu-in">
						{picker}
					</div>
				) : null}
			</div>
		);
	return (
		<SpoolShell activeTab="kaffe" zoom="64%">
			<CanvasChrome
				pages={[
					{
						name: "app",
						frames: ["cart", "menu", "receipt"],
						active: true,
						open: true,
					},
					{ name: "site", frames: [] },
				]}
				selected="receipt"
				railWidth={420}
				railLabel="agent"
				rail={
					<div
						data-engine-prototype={take}
						data-active-engine={current.engine}
						data-thread-started={locked}
						data-model={modelValue}
						className="relative flex h-full min-w-0 flex-col"
						onKeyDownCapture={(event) => {
							if (event.key === "Escape" && menu !== null) {
								event.stopPropagation();
								show(null);
							}
							if (event.key === "Escape" && login.view !== null) {
								event.stopPropagation();
								login.close();
							}
						}}
					>
						{menu !== null ? (
							<button
								type="button"
								aria-label="Close menu"
								tabIndex={-1}
								className="absolute inset-0 z-20 cursor-default"
								onClick={() => show(null)}
							/>
						) : null}
						<PlayRail
							key={active}
							entries={current.entries}
							phase="idle"
							nav={plate}
							header={
								take === "combined" && loginTake === "rail" ? (
									<LoginPanel login={login} take={loginTake} />
								) : undefined
							}
							say="read"
							ask="log"
							shot="line"
							jump="name"
							have={["receipt"]}
							model={footer}
							run={active}
							draft={current.draft}
							onDraft={(draft) => patch({ draft })}
							onSend={send}
							onReplay={() => {}}
							selection={[
								{
									id: "receipt",
									kind: "frame",
									frame: "receipt",
									path: "design/frames/app/receipt/frame.tsx",
									size: { w: 390, h: 844 },
								},
							]}
						/>
						{take === "combined" && login.view !== null && loginTake === "popover" ? (
							<div className="absolute right-3.5 bottom-[42px] left-3.5 z-40 animate-agent-menu-in">
								<LoginPanel login={login} take={loginTake} />
							</div>
						) : null}
					</div>
				}
			>
				<div className="absolute top-24 left-14 flex items-start gap-10">
					<CanvasFrame name="cart" />
					<CanvasFrame name="receipt" selected />
				</div>
				{take === "combined" && login.view !== null && loginTake === "dialog" && loginSpec?.look !== undefined ? (
					<AccountDialog login={login} look={loginSpec.look} />
				) : take === "combined" && login.view !== null && loginTake === "dialog" ? (
					<div
						className="absolute inset-0 z-50 flex items-center justify-center bg-bg/55"
						role="dialog"
						aria-modal="true"
						aria-label="Connect an account"
						onKeyDown={(event) => {
							if (event.key === "Escape") login.close();
						}}
					>
						<div className="w-[380px]">
							<LoginPanel login={login} take={loginTake} />
						</div>
					</div>
				) : null}
				{take === "combined" && (loginSpec !== undefined || login.view !== null) ? (
					<LoginSimulation login={login} />
				) : null}
			</CanvasChrome>
		</SpoolShell>
	);
}

function CanvasFrame({ name, selected = false }: { name: string; selected?: boolean }) {
	return (
		<div className="relative">
			<span
				className={cn(
					"absolute -top-6 left-0 font-mono text-xs leading-xs",
					selected ? "text-thread" : "text-muted",
				)}
			>
				{name}
			</span>
			<div className={cn("overflow-hidden", selected && "outline outline-1 outline-thread outline-offset-2")}>
				<FrameThumb name={name} width={240} />
			</div>
		</div>
	);
}
