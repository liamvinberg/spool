import { type ReactNode, useState } from "react";
import type { PlayEntry } from "shared/lib/spool/turn-play";
import { cn } from "shared/lib/utils";
import { FrameThumb } from "shared/ui/explore/agent/play-field";
import { CanvasChrome } from "shared/ui/spool/canvas-chrome";
import { ChevronIcon, PlusIcon } from "shared/ui/spool/icons";
import { PlayRail } from "shared/ui/spool/play-rail";
import { SpoolShell } from "shared/ui/spool/shell";

/** Throwaway engine-placement proposals for spool-cloud's rail prototype.
 * Three separate frames: footer, nameplate, or the new-thread action.
 * Accounts are already connected in this first comparison. All interaction is
 * local fixture state; sending never starts an engine or spends model credits.
 * Model names are specimen data, not a claim about a connected account's offer.
 */
export type EngineTake = "foot" | "plate" | "start";
export type ChoiceState = "new" | "choosing" | "thread";
type Engine = "spool" | "claude";
type Model = { name: string; levels: readonly string[] };
type Thread = {
	id: number;
	engine: Engine;
	name: string;
	entries: readonly PlayEntry[];
	model: number;
	effort: string;
	draft: string;
	started: boolean;
};

const ENGINES: readonly Engine[] = ["spool", "claude"];
const NAMES: Record<Engine, string> = { spool: "spool", claude: "Claude Code" };
const MODELS: Record<Engine, readonly Model[]> = {
	spool: [
		{ name: "GPT-5.4", levels: ["low", "medium", "high", "xhigh"] },
		{ name: "GPT-5.4 mini", levels: ["low", "medium", "high", "xhigh"] },
	],
	claude: [
		{ name: "Default (recommended)", levels: ["low", "medium", "high", "xhigh", "max"] },
		{ name: "Sonnet", levels: ["low", "medium", "high", "xhigh", "max"] },
		{ name: "Haiku", levels: [] },
	],
};
const QUIET = "font-mono text-2xs leading-3";
const BUTTON =
	"flex min-w-0 items-center gap-1 rounded-xs text-muted/70 transition-colors duration-150 hover:text-text focus-visible:outline focus-visible:outline-1 focus-visible:outline-muted";
const REPLY = "The confirmation sits in the middle. The order number and email note stay underneath.";
const HISTORY: readonly PlayEntry[] = [
	{ key: "ask", kind: "user", text: "Make the receipt easier to read.", context: "receipt" },
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
	return { id, engine, name: "New thread", entries: [], model: 0, effort: "high", draft: "", started: false };
}

export function EngineChoice({ take, state = "new" }: { take: EngineTake; state?: ChoiceState }) {
	const existing: Thread = {
		...makeThread(1, "claude"),
		name: "Make the receipt easier to read.",
		entries: HISTORY,
		started: true,
	};
	const [threads, setThreads] = useState<readonly Thread[]>(
		state === "thread" ? [existing] : [existing, makeThread(2, "spool")],
	);
	const [active, setActive] = useState(state === "thread" ? 1 : 2);
	const [remembered, setRemembered] = useState<Engine>(state === "thread" ? "claude" : "spool");
	const [menu, setMenu] = useState<"engine" | "model" | "threads" | null>(state === "choosing" ? "engine" : null);
	const [notice, setNotice] = useState("");
	const current = threads.find((thread) => thread.id === active) ?? existing;
	const model = MODELS[current.engine][current.model] ?? MODELS[current.engine][0];
	const locked = current.started;
	const patch = (values: Partial<Thread>) =>
		setThreads((all) => all.map((thread) => (thread.id === active ? { ...thread, ...values } : thread)));
	const start = (engine: Engine) => {
		const id = Math.max(...threads.map((thread) => thread.id)) + 1;
		setThreads((all) => [...all, makeThread(id, engine)]);
		setActive(id);
		setMenu(null);
		setNotice("");
	};
	const choose = (engine: Engine) => {
		setRemembered(engine);
		if (take === "start" || locked) start(engine);
		else patch({ engine, model: 0, effort: "high" });
		setMenu(null);
	};
	const send = (text: string) => {
		patch({
			started: true,
			name: current.started ? current.name : text,
			draft: "",
			entries: [
				...current.entries,
				{ key: `user-${current.entries.length}`, kind: "user", text },
				{ key: `note-${current.entries.length}`, kind: "note", text: `sent with ${NAMES[current.engine]}` },
			],
		});
		setMenu(null);
	};
	const toggle = (next: typeof menu) => setMenu(menu === next ? null : next);
	const engineTrigger = (
		<button
			type="button"
			data-engine-trigger=""
			aria-label={locked ? "About this thread's engine" : "Choose an engine"}
			aria-expanded={menu === "engine"}
			onClick={() => toggle("engine")}
			className={cn(QUIET, BUTTON)}
		>
			<span>{NAMES[current.engine]}</span>
			{locked ? <Lock /> : <ChevronIcon className="h-2 w-2" open={menu === "engine"} />}
		</button>
	);
	const picker = (
		<div data-engine-menu="" className="overflow-hidden rounded-md border border-border-raised bg-bg p-1">
			{locked && take !== "start" ? (
				<p className="px-2.5 pt-2 pb-3 text-base leading-base text-muted">
					This thread uses {NAMES[current.engine]}. Choose an engine for a new thread.
				</p>
			) : null}
			{ENGINES.map((engine) => (
				<button
					key={engine}
					type="button"
					data-engine-choice={engine}
					onClick={() => choose(engine)}
					className="flex w-full items-start gap-2.5 rounded-sm px-2.5 py-2.5 text-left transition-colors duration-150 hover:bg-surface focus-visible:bg-surface focus-visible:outline-none"
				>
					<span className="flex min-w-0 flex-1 flex-col gap-1">
						<span className="text-base text-text leading-base">
							{take === "start" || locked ? `New thread with ${NAMES[engine]}` : NAMES[engine]}
						</span>
						<span className="text-sm text-muted leading-sm">
							{engine === "spool"
								? "Built into spool. Uses your connected accounts."
								: "Uses Claude Code and its login on this machine."}
						</span>
					</span>
					{engine === (locked || take === "start" ? remembered : current.engine) ? (
						<span aria-label="Selected" className="pt-1 text-xs text-muted">
							✓
						</span>
					) : null}
				</button>
			))}
			<div className="mx-2.5 mt-1 border-border border-t pt-2.5 pb-2 text-sm text-muted leading-sm">
				Your choice is remembered for new threads in this project on this machine.
			</div>
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
						className={cn("min-w-0 flex-1 truncate text-sm leading-4", locked ? "text-text" : "text-muted/70")}
					>
						{current.name}
					</span>
					{take === "start" ? (
						<span className={cn(QUIET, "shrink-0 text-muted/70")}>{NAMES[current.engine]}</span>
					) : null}
					<ChevronIcon open={menu === "threads"} className="h-2.5 w-2.5 shrink-0 text-muted/60" />
				</button>
				<button
					type="button"
					data-new-thread=""
					aria-label="New thread"
					onClick={newThread}
					className="-mr-1.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-muted/65 transition-colors duration-150 hover:text-text"
				>
					<PlusIcon />
				</button>
			</div>
			{take === "plate" ? (
				<div className="flex h-9 items-center justify-between border-border border-b px-3.5">
					{engineTrigger}
					<span className="text-sm text-muted/60">{locked ? "this thread" : "for this new thread"}</span>
				</div>
			) : null}
			{menu === "engine" && take !== "foot" ? (
				<div className="absolute top-full right-2 left-2 mt-2">{picker}</div>
			) : null}
			{menu === "threads" ? (
				<div className="absolute top-full right-0 left-0 max-h-80 overflow-auto border-border border-b bg-bg py-1">
					{threads.map((thread) => (
						<button
							type="button"
							key={thread.id}
							onClick={() => {
								setActive(thread.id);
								setMenu(null);
								setNotice("");
							}}
							className={cn(
								"flex w-full flex-col gap-1 px-3.5 py-3 text-left hover:bg-surface",
								thread.id === active && "bg-surface",
							)}
						>
							<span className="text-base leading-base">{thread.name}</span>
							<span className={cn(QUIET, "text-muted")}>{NAMES[thread.engine]}</span>
						</button>
					))}
				</div>
			) : null}
		</div>
	);
	const footer = (
		<div className="relative flex min-w-0 flex-1 items-center gap-3">
			{take === "foot" ? (
				<>
					{engineTrigger}
					<span className="h-2.5 border-border-raised border-l" />
				</>
			) : null}
			<button
				type="button"
				data-model-trigger=""
				aria-label="Choose a model"
				aria-expanded={menu === "model"}
				onClick={() => toggle("model")}
				className={cn(QUIET, BUTTON)}
			>
				<span className="truncate">
					{model?.name}
					{model?.levels.length ? ` · ${current.effort}` : ""}
				</span>
				<ChevronIcon className="h-2 w-2 shrink-0" open={menu === "model"} />
			</button>
			{menu === "engine" && take === "foot" ? (
				<div className="absolute bottom-full left-0 z-30 mb-2 w-[360px] max-w-full">{picker}</div>
			) : null}
			{menu === "model" ? (
				<div
					data-model-menu=""
					className="absolute bottom-full left-0 z-30 mb-2 w-[300px] max-w-full rounded-md border border-border-raised bg-bg p-1"
				>
					{MODELS[current.engine].map((row, index) => (
						<button
							type="button"
							key={row.name}
							data-model-choice={row.name}
							onClick={() => {
								patch({
									model: index,
									effort: row.levels.includes(current.effort) ? current.effort : (row.levels[0] ?? ""),
								});
								setMenu(null);
							}}
							className="flex w-full items-center justify-between rounded-sm px-2.5 py-2.5 text-left text-base leading-base hover:bg-surface"
						>
							{row.name}
							{current.model === index ? <span className="text-muted">✓</span> : null}
						</button>
					))}
					{model?.levels.length ? (
						<div className="mx-2.5 mt-1 border-border border-t py-2.5">
							<span className={cn(QUIET, "text-muted")}>effort</span>
							<div className="mt-2 flex flex-wrap gap-1">
								{model.levels.map((level) => (
									<button
										type="button"
										key={level}
										aria-pressed={level === current.effort}
										onClick={() => patch({ effort: level })}
										className={cn(
											QUIET,
											"rounded-xs px-2 py-1.5 hover:bg-surface",
											level === current.effort ? "bg-raised text-text" : "text-muted",
										)}
									>
										{level}
									</button>
								))}
							</div>
						</div>
					) : null}
					<p className="mx-2.5 border-border border-t pt-2.5 pb-2 text-sm text-muted leading-sm">
						{current.engine === "spool"
							? "Uses your ChatGPT account."
							: "Uses Claude Code’s login on this machine."}
					</p>
				</div>
			) : null}
		</div>
	);
	return (
		<SpoolShell activeTab="kaffe" zoom="64%">
			<CanvasChrome
				pages={[
					{ name: "app", frames: ["cart", "menu", "receipt"], active: true, open: true },
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
						className="relative flex h-full min-w-0 flex-col"
						onKeyDownCapture={(event) => {
							if (event.key === "Escape" && menu !== null) {
								event.stopPropagation();
								setMenu(null);
							}
						}}
					>
						{menu !== null ? (
							<button
								type="button"
								aria-label="Close menu"
								tabIndex={-1}
								className="absolute inset-0 z-20 cursor-default"
								onClick={() => setMenu(null)}
							/>
						) : null}
						<PlayRail
							key={active}
							entries={current.entries}
							phase={locked ? "settled" : "idle"}
							nav={plate}
							header={
								notice ? (
									<div role="status" className="border-border border-b px-3.5 py-2 text-sm text-muted">
										{notice}
									</div>
								) : undefined
							}
							say="read"
							ask="log"
							shot="line"
							jump="name"
							have={["receipt"]}
							onJump={() => setNotice("receipt is selected on the canvas")}
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
					</div>
				}
			>
				<div className="absolute top-24 left-14 flex items-start gap-10">
					<CanvasFrame name="cart" />
					<CanvasFrame name="receipt" selected />
				</div>
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

function Lock(): ReactNode {
	return (
		<svg aria-hidden="true" viewBox="0 0 12 12" fill="none" className="ml-0.5 h-2.5 w-2.5 text-muted/65">
			<rect x="3" y="5" width="6" height="5" rx="1" stroke="currentColor" />
			<path d="M4.25 5V3.75a1.75 1.75 0 0 1 3.5 0V5" stroke="currentColor" />
		</svg>
	);
}
