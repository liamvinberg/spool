import { useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { PlayEntry } from "shared/lib/spool/turn-play";
import { cn } from "shared/lib/utils";
import { CoffeeScreen } from "shared/ui/demo/coffee-screens";
import { PermissionMenu, type PermissionMode } from "shared/ui/spool/permission-menu";
import { ResizePopover } from "shared/ui/spool/resize-popover";
import { CanvasChrome } from "shared/ui/spool/canvas-chrome";
import { ChevronIcon, PlusIcon, SearchIcon } from "shared/ui/spool/icons";
import { PlayRail } from "shared/ui/spool/play-rail";
import { SpoolShell } from "shared/ui/spool/shell";

// Layout fixtures for the shipped model picker. State stays local to each frame.
type Seed = "new" | "thread" | "search" | "effort" | "claude" | "permissions";
type Engine = "spool" | "claude";
type Panel = "models" | "effort" | "agent" | "new" | "permissions" | null;
interface Offer {
	id: string;
	name: string;
	account: string;
	levels: readonly string[];
}
const SIX = ["minimal", "low", "medium", "high", "xhigh", "max"];
const THREE = ["low", "medium", "high"];
const OFFERS: readonly Offer[] = [
	{ id: "chatgpt/astra", name: "GPT-6 Astra", account: "ChatGPT", levels: SIX },
	{ id: "anthropic/opus", name: "Opus 5", account: "Anthropic API", levels: THREE },
	{ id: "anthropic/sonnet", name: "Sonnet 5", account: "Anthropic API", levels: THREE },
	{ id: "openai/astra", name: "GPT-6 Astra", account: "OpenAI API", levels: SIX },
	{ id: "chatgpt/mini", name: "GPT-5.4 mini", account: "ChatGPT", levels: THREE },
	{ id: "google/pro", name: "Gemini 3.1 Pro", account: "Google API", levels: [] },
	{ id: "anthropic/haiku", name: "Haiku 4.5", account: "Anthropic API", levels: [] },
];
const CLAUDE: readonly Offer[] = [
	{ id: "claude/default", name: "Default (recommended)", account: "Claude Code", levels: THREE },
	{ id: "claude/opus", name: "Opus (1M context)", account: "Claude Code", levels: THREE },
	{ id: "claude/sonnet", name: "Sonnet", account: "Claude Code", levels: THREE },
	{ id: "claude/haiku", name: "Haiku", account: "Claude Code", levels: [] },
];
const NAMES = { spool: "spool", claude: "Claude Code" };
const HISTORY: readonly PlayEntry[] = [
	{ key: "ask", kind: "user", text: "Make the receipt easier to read.", context: "receipt" },
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
		key: "reply",
		kind: "prose",
		full: "The confirmation sits in the middle. The order number and email note stay underneath.",
		shown: "The confirmation sits in the middle. The order number and email note stay underneath.",
	},
];
const CONTROL =
	"flex items-center gap-1.5 text-muted type-detail transition-colors hover:text-text focus-visible:outline focus-visible:outline-1 focus-visible:outline-muted";

export function ModelPickerDemo({
	seed = "new",
	narrow = false,
	threeLevels = false,
}: {
	seed?: Seed;
	narrow?: boolean;
	threeLevels?: boolean;
}) {
	const reduced = useReducedMotion() === true;
	const [keyboard, setKeyboard] = useState(false);
	const still = reduced || keyboard;
	const [started, setStarted] = useState(seed !== "new");
	const [engine, setEngine] = useState<Engine>(seed === "claude" ? "claude" : "spool");
	const [modelId, setModelId] = useState(
		seed === "claude" ? "claude/default" : threeLevels ? "anthropic/sonnet" : "chatgpt/astra",
	);
	const [effort, setEffort] = useState("medium");
	const [favorites, setFavorites] = useState(["chatgpt/astra", "anthropic/opus", "anthropic/sonnet"]);
	const [panel, setPanel] = useState<Panel>(
		seed === "permissions" ? "permissions" : seed === "effort" ? "effort" : "models",
	);
	const [permission, setPermission] = useState<PermissionMode>("ask");
	const [query, setQuery] = useState(seed === "search" ? "astra" : "");
	const [searching, setSearching] = useState(seed === "search");
	const [draft, setDraft] = useState("");
	const [entries, setEntries] = useState<readonly PlayEntry[]>(seed === "new" ? [] : HISTORY);
	const [run, setRun] = useState(1);
	const root = useRef<HTMLDivElement>(null);
	const modelTrigger = useRef<HTMLButtonElement>(null);
	const permissionTrigger = useRef<HTMLButtonElement>(null);
	const effortTrigger = useRef<HTMLButtonElement>(null);
	const offers = engine === "claude" ? CLAUDE : OFFERS;
	const model = offers.find((offer) => offer.id === modelId) ?? offers[0]!;
	const hasSearch = searching;
	const found = offers.filter((offer) => {
		if (query.trim()) return `${offer.name} ${offer.account}`.toLowerCase().includes(query.trim().toLowerCase());
		return searching || engine === "claude" || favorites.includes(offer.id) || offer.id === model.id;
	});
	const close = () => {
		setPanel(null);
		modelTrigger.current?.focus();
	};
	useEffect(() => {
		if (panel === "models" && hasSearch)
			root.current?.querySelector<HTMLInputElement>('[aria-label="Search models"]')?.focus();
		else if (panel === "effort")
			root.current?.querySelector<HTMLButtonElement>('[aria-label="Effort levels"] [aria-pressed="true"]')?.focus();
	}, [panel, hasSearch]);
	const backToModels = () => {
		setPanel("models");
		requestAnimationFrame(() => effortTrigger.current?.focus());
	};
	const toggle = (next: Panel) => {
		setQuery("");
		setSearching(false);
		setPanel(panel === next ? null : next);
	};
	const chooseModel = (offer: Offer) => {
		setModelId(offer.id);
		if (!offer.levels.includes(effort))
			setEffort(offer.levels.includes("medium") ? "medium" : (offer.levels[0] ?? ""));
		close();
	};
	const chooseEngine = (next: Engine, fresh: boolean) => {
		if (started && !fresh) return;
		setEngine(next);
		setModelId(next === "spool" ? "chatgpt/astra" : "claude/default");
		setEffort("medium");
		if (fresh) {
			setStarted(false);
			setEntries([]);
			setDraft("");
			setRun((value) => value + 1);
		}
		close();
	};
	const send = (text: string) => {
		if (!text.trim()) return;
		setStarted(true);
		setDraft("");
		setPanel(null);
		setEntries((previous) => [
			...previous,
			{ key: `ask-${previous.length}`, kind: "user", text },
			{
				key: `reply-${previous.length}`,
				kind: "prose",
				full: "This chat has started. You can still change its model and effort.",
				shown: "This chat has started. You can still change its model and effort.",
			},
		]);
	};
	const effortOptions = (
		<fieldset className="grid grid-cols-3 gap-1 p-2" aria-label="Effort levels">
			{model.levels.map((level) => (
				<button
					key={level}
					type="button"
					aria-pressed={effort === level}
					onClick={() => {
						setEffort(level);
					}}
					onKeyDown={(event) => {
						if (!["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
						event.preventDefault();
						const options = [
							...(event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("button") ?? []),
						];
						const index = options.indexOf(event.currentTarget);
						const step =
							event.key === "ArrowDown" ? 3 : event.key === "ArrowUp" ? -3 : event.key === "ArrowRight" ? 1 : -1;
						const next =
							event.key === "Home"
								? 0
								: event.key === "End"
									? options.length - 1
									: (index + step + options.length) % options.length;
						options[next]?.focus();
					}}
					className={cn(
						"h-8 rounded-sm type-detail transition-colors duration-150 hover:bg-raised focus-visible:outline focus-visible:outline-1 focus-visible:outline-muted motion-reduce:transition-none",
						effort === level ? "bg-raised text-text" : "text-muted",
					)}
				>
					{level}
				</button>
			))}
		</fieldset>
	);
	const searchField = (
		<div className="flex h-11 items-center gap-2 border-border-raised border-b px-3 text-muted">
			{
				<button
					type="button"
					aria-label="Back to your models"
					onClick={() => {
						setSearching(false);
						setQuery("");
					}}
					className="p-1 text-md hover:text-text"
				>
					←
				</button>
			}
			<input
				type="search"
				aria-label="Search models"
				placeholder="Search models…"
				value={query}
				onChange={(event) => setQuery(event.target.value)}
				onKeyDown={(event) => {
					if (event.key === "ArrowDown") {
						event.preventDefault();
						root.current?.querySelector<HTMLButtonElement>("[data-model-option]")?.focus();
					}
					if (event.key === "Enter" && found[0]) chooseModel(found[0]);
				}}
				className="min-w-0 flex-1 bg-transparent text-text outline-none placeholder:text-muted/65 type-control [&::-webkit-search-cancel-button]:hidden"
			/>
		</div>
	);
	const modelList = (
		<div className={cn("overflow-y-auto p-1.5", "max-h-[252px]")}>
			{found.map((offer) => (
				<div
					key={offer.id}
					className={cn(
						"group flex min-w-0 items-center rounded-sm",
						model.id === offer.id ? "bg-raised" : "hover:bg-raised/55",
					)}
				>
					<button
						type="button"
						data-model-option={offer.id}
						aria-label={`${offer.name}, ${offer.account}`}
						aria-pressed={model.id === offer.id}
						onClick={() => chooseModel(offer)}
						className={cn(
							"flex min-w-0 flex-1 items-center gap-2 rounded-sm px-2 text-left focus-visible:outline focus-visible:outline-1 focus-visible:outline-muted",
							"py-2.5",
						)}
						onKeyDown={(event) => {
							if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
							event.preventDefault();
							const controls = [
								...(root.current?.querySelectorAll<HTMLButtonElement>("[data-model-option]") ?? []),
							];
							const next =
								(controls.indexOf(event.currentTarget) +
									(event.key === "ArrowDown" ? 1 : controls.length - 1)) %
								controls.length;
							controls[next]?.focus();
						}}
					>
						<span
							className={cn(
								"w-3 shrink-0 type-detail",
								model.id === offer.id ? "text-text" : "text-transparent",
							)}
						>
							✓
						</span>
						<span className={cn("flex min-w-0 flex-1", "flex-col gap-0.5")}>
							<span className="truncate text-text type-value">{offer.name}</span>
							{engine === "spool" ? (
								<span className="shrink-0 text-muted type-caption">{offer.account}</span>
							) : null}
						</span>
					</button>
					{engine === "spool" ? (
						<button
							type="button"
							aria-label={`${favorites.includes(offer.id) ? "Unfavorite" : "Favorite"} ${offer.name}, ${offer.account}`}
							aria-pressed={favorites.includes(offer.id)}
							onClick={() =>
								setFavorites((previous) =>
									previous.includes(offer.id)
										? previous.filter((id) => id !== offer.id)
										: [...previous, offer.id],
								)
							}
							className={cn(
								"mr-1 flex h-8 w-7 shrink-0 items-center justify-center rounded-sm hover:text-text focus-visible:opacity-100",
								favorites.includes(offer.id)
									? "text-muted/65"
									: "text-muted/35 opacity-0 group-hover:opacity-100",
							)}
						>
							<Star filled={favorites.includes(offer.id)} />
						</button>
					) : null}
				</div>
			))}
			{found.length === 0 ? (
				<div className="px-3 py-7 text-muted type-control">
					No models match “{query}”.
					<button type="button" className="mt-2 block text-text" onClick={() => setQuery("")}>
						Clear search
					</button>
				</div>
			) : null}
		</div>
	);
	const picker = (
		<section
			aria-label="Model picker"
			data-model-picker-demo=""
			className={cn("overflow-hidden border-border-raised bg-surface", "")}
		>
			{hasSearch ? searchField : null}
			{modelList}
			{!searching ? (
				<button
					type="button"
					onClick={() => setSearching(true)}
					className="flex h-10 w-full items-center gap-2 border-border-raised border-t px-3 text-muted hover:text-text type-control"
				>
					<SearchIcon className="h-3 w-3" />
					Find a model…
				</button>
			) : null}

			{!searching && model.levels.length > 0 ? (
				<div className="border-border-raised border-t">
					{
						<button
							type="button"
							ref={effortTrigger}
							aria-label="Change effort"
							onClick={() => setPanel("effort")}
							className="flex h-10 w-full items-center justify-between px-3 text-muted hover:text-text type-control"
						>
							<span>Effort</span>
							<span className="flex items-center gap-2 type-detail">
								{effort}
								<ChevronIcon open={false} className="h-2 w-2" />
							</span>
						</button>
					}
				</div>
			) : null}
			{searching && engine === "spool" ? (
				<button
					type="button"
					onClick={close}
					className="flex h-10 w-full items-center border-border-raised border-t px-3 text-muted hover:text-text type-control"
				>
					Connect account…
				</button>
			) : null}
		</section>
	);
	const effortPage = (
		<section aria-label="Choose effort" data-effort-page="">
			<div className="flex h-11 items-center gap-2 border-border-raised border-b px-2 text-muted type-control">
				<button
					type="button"
					aria-label="Back to models"
					onClick={backToModels}
					className="flex h-7 w-7 items-center justify-center rounded-sm hover:bg-raised hover:text-text"
				>
					←
				</button>
				<span className="flex-1">Effort</span>
				<button
					type="button"
					aria-label="Close effort"
					onClick={close}
					className="flex h-7 w-7 items-center justify-center rounded-sm hover:bg-raised hover:text-text"
				>
					×
				</button>
			</div>
			{effortOptions}
		</section>
	);
	const nav = (
		<div className="relative z-30 border-border border-b bg-bg">
			<div className="flex h-11 items-center gap-3 px-3.5">
				<span className="min-w-0 flex-1 truncate text-text type-label">
					{started ? "Make the receipt easier to read." : "New chat"}
				</span>
				<button
					type="button"
					aria-label="New chat"
					aria-expanded={panel === "new"}
					onClick={() => toggle("new")}
					className="flex h-6 w-6 items-center justify-center text-muted hover:text-text"
				>
					<PlusIcon className="h-3 w-3" />
				</button>
			</div>
			<div className="flex h-8 items-center justify-between px-3.5 pb-2">
				{started ? (
					<span
						data-fixed-agent=""
						title="This chat keeps its agent. Use + to start with another."
						className="flex items-center gap-1.5 text-muted type-detail"
					>
						<Lock />
						{NAMES[engine]}
					</span>
				) : (
					<button
						type="button"
						aria-label="Choose agent for this new chat"
						aria-expanded={panel === "agent"}
						onClick={() => toggle("agent")}
						className={CONTROL}
					>
						{NAMES[engine]}
						<ChevronIcon open={panel === "agent"} className="h-2 w-2" />
					</button>
				)}
				{!started ? <span className="text-muted/65 type-caption">For this new chat</span> : null}
			</div>
			{panel === "agent" || panel === "new" ? (
				<div
					role="dialog"
					aria-label={panel === "new" ? "Start a new chat" : "Choose an agent"}
					className="absolute top-full right-3 left-3 z-40 mt-1 overflow-hidden rounded-md border border-border-raised bg-surface p-1.5"
				>
					{(["spool", "claude"] as const).map((value) => (
						<button
							type="button"
							key={value}
							onClick={() => chooseEngine(value, panel === "new")}
							className="flex w-full flex-col gap-1 rounded-sm px-2 py-2.5 text-left hover:bg-raised"
						>
							<span className="text-text type-control">
								{panel === "new" ? `New chat with ${NAMES[value]}` : NAMES[value]}
							</span>
							<span className="text-muted type-caption">
								{value === "spool" ? "Uses your connected accounts." : "Uses Claude Code on this Mac."}
							</span>
						</button>
					))}
					<p className="border-border-raised border-t px-2 pt-2 pb-1 text-muted type-caption">
						The agent stays with the chat after your first message.
					</p>
				</div>
			) : null}
		</div>
	);
	const footer = (
		<div className="relative flex min-w-0 flex-1 items-center justify-between gap-2">
			<button
				type="button"
				ref={modelTrigger}
				aria-label="Choose model"
				aria-expanded={panel === "models" || panel === "effort"}
				onClick={() => (panel === "effort" ? close() : toggle("models"))}
				title={`${model.name}${model.levels.length > 0 ? ` · ${effort}` : ""}`}
				className={cn(CONTROL, "relative z-30 min-w-0")}
			>
				<span data-chosen-model="" className="truncate">
					{model.name}
				</span>
				<ChevronIcon open={panel === "models"} className="h-2 w-2 shrink-0" />
			</button>
			{
				<button
					type="button"
					ref={permissionTrigger}
					data-permission-trigger=""
					aria-label={`Agent permissions: ${permission}`}
					aria-haspopup="menu"
					aria-expanded={panel === "permissions"}
					onClick={() => toggle("permissions")}
					className={cn(CONTROL, "relative z-30 shrink-0")}
				>
					{permission}
					<ChevronIcon open={panel === "permissions"} className="h-2 w-2" />
				</button>
			}
			{panel === "permissions" ? (
				<PermissionMenu
					mode={permission}
					engine={engine}
					trigger={permissionTrigger}
					onChange={(next) => {
						setPermission(next);
						setPanel(null);
					}}
					onClose={() => setPanel(null)}
				/>
			) : null}

			{panel !== "permissions" && panel !== "agent" && panel !== "new" ? (
				<ResizePopover
					open={panel === "models" || panel === "effort"}
					view={panel === "effort" ? "effort" : searching ? "search" : "models"}
					still={still}
				>
					{panel === "effort" ? effortPage : picker}
				</ResizePopover>
			) : null}
		</div>
	);
	return (
		<div
			ref={root}
			data-started={started}
			data-engine={engine}
			className="flex h-full flex-col bg-bg text-text"
			onPointerDownCapture={() => setKeyboard(false)}
			onKeyDownCapture={() => setKeyboard(true)}
			onKeyDown={(event) => {
				if (event.key === "Escape" && panel !== null) {
					event.stopPropagation();
					if (panel === "effort") backToModels();
					else close();
				}
			}}
		>
			<div className="min-h-0 flex-1">
				<SpoolShell activeTab="kaffe" tabs={["kaffe"]} zoom="64%">
					<CanvasChrome
						pages={[
							{ name: "app", frames: ["cart", "menu", "receipt"], active: true, open: true },
							{ name: "site", frames: [] },
						]}
						selected="receipt"
						railWidth={narrow ? 300 : 380}
						railLabel="agent"
						rail={
							<div className="relative flex h-full min-w-0 flex-col">
								{panel !== null ? (
									<button
										type="button"
										tabIndex={-1}
										aria-label="Dismiss picker"
										className="absolute inset-0 z-20 cursor-default"
										onClick={close}
									/>
								) : null}
								<PlayRail
									key={run}
									entries={entries}
									phase="idle"
									nav={nav}
									say="read"
									ask="log"
									shot="line"
									jump="name"
									have={["receipt"]}
									model={footer}
									run={run}
									draft={draft}
									onDraft={setDraft}
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
							{(["cart", "receipt"] as const).map((name) => (
								<div key={name} className="relative">
									<span
										className={cn(
											"absolute -top-6 left-0 type-detail",
											name === "receipt" ? "text-thread" : "text-muted",
										)}
									>
										{name}
									</span>
									<div
										className={cn(
											"overflow-hidden",
											name === "receipt" && "outline outline-1 outline-thread outline-offset-2",
										)}
									>
										<div className="h-[520px] w-[240px]">
											<CoffeeScreen screen={name} />
										</div>
									</div>
								</div>
							))}
						</div>
					</CanvasChrome>
				</SpoolShell>
			</div>
		</div>
	);
}

function Star({ filled }: { filled: boolean }) {
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 24 24"
			className="h-3 w-3"
			fill={filled ? "currentColor" : "none"}
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinejoin="round"
		>
			<path d="m12 3 2.8 5.7 6.3.9-4.6 4.5 1.1 6.3L12 17.4l-5.6 3 1.1-6.3L3 9.6l6.2-.9Z" />
		</svg>
	);
}
function Lock() {
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 16 16"
			className="h-2.5 w-2.5 text-muted/65"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.2"
		>
			<rect x="3.5" y="7" width="9" height="7" rx="1.5" />
			<path d="M5.5 7V4.5a2.5 2.5 0 0 1 5 0V7" />
		</svg>
	);
}
