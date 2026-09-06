import { useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { AgentLimit } from "../../daemon/agent-events";
import { cn } from "../cn";
import { CloseIcon, SearchIcon } from "../icons";
import { ResizePopover } from "../resize-popover";
import { AgentAccountDialog } from "./agent-account";
import { limitReadout, resetsIn } from "./agent-limit";
import type { AgentModelDeck } from "./agent-model";
import type { LoginDeck } from "./agent-preflight";
import { favoriteModels, ModelFavorite, useModelFavorites } from "./model-favorites";
import { ChevronIcon } from "./sidebar";

export function AgentModelPicker({
	model,
	limit,
	open,
	onOpen,
	interrupted,
	login,
	modelRequest,
}: {
	model: AgentModelDeck;
	limit: AgentLimit | null;
	open: boolean;
	onOpen: (open: boolean) => void;
	interrupted: boolean;
	login?: LoginDeck | undefined;
	modelRequest?: number | undefined;
}) {
	const [view, setView] = useState<"models" | "search" | "effort">("models");
	const [query, setQuery] = useState("");
	const [keyboard, setKeyboard] = useState(false);
	const reduced = useReducedMotion() === true;
	const trigger = useRef<HTMLButtonElement>(null);
	const panel = useRef<HTMLDivElement>(null);
	const returnFocus = useRef<"search" | "effort" | null>(null);
	const favorites = useModelFavorites(model.project ?? "", model.engine ?? "claude");
	const { offer, levels } = model;
	const bundled = model.engine === "spool";
	const current = offer.models.find((entry) => entry.value === offer.current.value);
	const name =
		current?.displayName ??
		offer.current.name ??
		offer.current.resolved ??
		(model.loading ? "Loading models…" : bundled ? "Connect account" : "Choose model");
	const visible = favoriteModels(
		offer.models,
		offer.current.value,
		favorites.values,
		!bundled || view === "search",
		query,
	);
	const pin = offer.current.pin;
	const recovery = login?.recovery;
	const reset = resetsIn(recovery?.resetsAt, Date.now());
	const usage =
		recovery?.kind === "limit"
			? `${recovery.account} limit reached${reset ? ` · resets ${reset}` : ""}`
			: limit === null
				? null
				: limitReadout(limit, Date.now());
	const show = (next: boolean) => {
		onOpen(next);
		if (next) {
			setView("models");
			setQuery("");
			model.refresh();
		} else trigger.current?.focus({ preventScroll: true });
	};
	useEffect(() => {
		if (modelRequest) {
			setQuery("");
			setView("search");
		}
	}, [modelRequest]);
	useEffect(() => {
		if (!open) return;
		const returning = returnFocus.current;
		returnFocus.current = null;
		const target = returning
			? panel.current?.querySelector<HTMLButtonElement>(
					returning === "effort" ? '[aria-label="Change effort"]' : "[data-model-search-trigger]",
				)
			: view === "search"
				? panel.current?.querySelector<HTMLInputElement>("input")
				: view === "effort"
					? panel.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]:not([inert] *)')
					: panel.current?.querySelector<HTMLButtonElement>('[aria-current="true"]:not([inert] *)');
		(target ?? panel.current?.querySelector<HTMLButtonElement>("button:not(:disabled):not([inert] *)"))?.focus({
			preventScroll: true,
		});
	}, [open, view]);
	useEffect(() => {
		if (view === "effort" && levels.length === 0) setView("models");
	}, [view, levels.length]);
	const back = () => {
		returnFocus.current = view === "effort" ? "effort" : "search";
		setView("models");
		setQuery("");
	};
	const connect = () => {
		show(false);
		model.connect?.();
	};
	const content = (
		<div
			role="dialog"
			aria-label={view === "effort" ? "Choose effort" : "Model picker"}
			data-agent-model-menu=""
			data-combined-menu={model.engine === undefined ? undefined : ""}
			onPointerDownCapture={() => setKeyboard(false)}
			onKeyDownCapture={() => setKeyboard(true)}
			onKeyDown={(event) => {
				if (event.key === "Escape") {
					event.preventDefault();
					event.stopPropagation();
					if (view === "models") show(false);
					else back();
					return;
				}
				if (event.key === "Tab") {
					event.preventDefault();
					event.stopPropagation();
					show(false);
					return;
				}
				const grid = event.target instanceof HTMLElement && event.target.closest('[aria-label="Effort levels"]');
				if (
					!["ArrowDown", "ArrowUp", ...(grid ? ["ArrowLeft", "ArrowRight", "Home", "End"] : [])].includes(
						event.key,
					)
				)
					return;
				event.preventDefault();
				event.stopPropagation();
				const controls = [
					...((grid || panel.current)?.querySelectorAll<HTMLElement>(
						"button:not(:disabled):not([inert] *), input:not([inert] *)",
					) ?? []),
				];
				const at = document.activeElement instanceof HTMLElement ? controls.indexOf(document.activeElement) : -1;
				const step =
					event.key === "ArrowDown"
						? grid
							? 3
							: 1
						: event.key === "ArrowUp"
							? grid
								? -3
								: -1
							: event.key === "ArrowRight"
								? 1
								: -1;
				const next =
					event.key === "Home"
						? 0
						: event.key === "End"
							? controls.length - 1
							: (at + step + controls.length) % controls.length;
				controls[next]?.focus();
			}}
		>
			{view === "effort" ? (
				<>
					<div className="flex h-11 items-center gap-2 border-border-raised border-b px-2 text-muted type-control">
						<button
							type="button"
							aria-label="Back to models"
							onClick={back}
							className="flex h-7 w-7 items-center justify-center rounded-sm hover:bg-raised hover:text-text"
						>
							←
						</button>
						<span className="flex-1">Effort</span>
						<button
							type="button"
							aria-label="Close effort"
							onClick={() => show(false)}
							className="flex h-7 w-7 items-center justify-center rounded-sm hover:bg-raised hover:text-text"
						>
							<CloseIcon />
						</button>
					</div>
					<fieldset className="grid grid-cols-3 gap-1 p-2" aria-label="Effort levels">
						{levels.map((level) => (
							<button
								key={level}
								type="button"
								data-agent-model-row={level}
								aria-current={offer.current.effort === level}
								aria-pressed={offer.current.effort === level}
								disabled={pin !== null && pin !== level}
								onClick={() => model.choose({ effort: level })}
								className={cn(
									"h-8 rounded-sm type-detail transition-colors duration-150 hover:bg-raised focus-visible:outline focus-visible:outline-1 focus-visible:outline-muted disabled:text-muted/35 motion-reduce:transition-none",
									offer.current.effort === level ? "bg-raised text-text" : "text-muted",
								)}
							>
								{level}
							</button>
						))}
					</fieldset>
					{pin !== null ? (
						<p role="status" className="px-3 pb-3 text-muted type-caption">
							CLAUDE_CODE_EFFORT_LEVEL={pin} is set in the environment.
						</p>
					) : null}
				</>
			) : (
				<>
					{view === "search" ? (
						<div className="flex h-11 items-center gap-2 border-border-raised border-b px-3 text-muted">
							<button
								type="button"
								aria-label="Back to your models"
								onClick={back}
								className="p-1 text-md hover:text-text"
							>
								←
							</button>
							<input
								type="search"
								aria-label="Search models"
								placeholder="Search models…"
								value={query}
								onChange={(event) => setQuery(event.target.value)}
								className="min-w-0 flex-1 bg-transparent text-text outline-none placeholder:text-muted/65 type-control [&::-webkit-search-cancel-button]:hidden"
								onKeyDown={(event) => {
									if (event.key === "Enter" && visible[0]) {
										event.preventDefault();
										model.choose({ value: visible[0].value });
										show(false);
									}
								}}
							/>
						</div>
					) : null}
					<div className="max-h-[252px] overflow-y-auto p-1.5">
						{visible.map((entry) => (
							<div
								key={entry.value}
								data-model-offer={entry.value}
								className={cn(
									"group flex min-w-0 items-center rounded-sm",
									offer.current.value === entry.value ? "bg-raised" : "hover:bg-raised/55",
								)}
							>
								<button
									type="button"
									data-agent-model-row={entry.displayName}
									aria-current={offer.current.value === entry.value}
									title={entry.description}
									onClick={() => {
										model.choose({ value: entry.value });
										show(false);
									}}
									className="flex min-w-0 flex-1 items-center gap-2 rounded-sm px-2 py-2.5 text-left focus-visible:outline focus-visible:outline-1 focus-visible:outline-muted"
								>
									<span
										aria-hidden="true"
										className={cn(
											"w-3 shrink-0 type-detail",
											offer.current.value === entry.value ? "text-text" : "text-transparent",
										)}
									>
										✓
									</span>
									<span className="flex min-w-0 flex-1 flex-col gap-0.5">
										<span className="truncate text-text type-value">{entry.displayName}</span>
										{entry.connection ? (
											<span className="text-muted type-caption">{entry.connection}</span>
										) : null}
									</span>
								</button>
								{bundled ? (
									<ModelFavorite
										model={entry}
										on={favorites.values.includes(entry.value)}
										toggle={() => favorites.toggle(entry.value)}
									/>
								) : null}
							</div>
						))}
						{visible.length === 0 ? (
							<div className="px-3 py-5 text-muted type-control">
								{query ? (
									<>
										No models match “{query}”.
										<button type="button" onClick={() => setQuery("")} className="mt-2 block text-text">
											Clear search
										</button>
									</>
								) : model.loading ? (
									"Loading models…"
								) : bundled ? (
									"Connect an account to see its models."
								) : (
									"No models available."
								)}
							</div>
						) : null}
					</div>
					{view === "models" ? (
						<button
							type="button"
							data-model-search-trigger=""
							onClick={() => setView("search")}
							className="flex h-10 w-full items-center gap-2 border-border-raised border-t px-3 text-muted hover:text-text type-control"
						>
							<SearchIcon className="h-3 w-3" />
							Find a model…
						</button>
					) : null}
					{view === "models" && levels.length > 0 ? (
						<button
							type="button"
							aria-label="Change effort"
							onClick={() => setView("effort")}
							className="flex h-10 w-full items-center justify-between border-border-raised border-t px-3 text-muted hover:text-text type-control"
						>
							<span>Effort</span>
							<span className="flex items-center gap-2 type-detail">
								{offer.current.effort ?? "auto"}
								<ChevronIcon open={false} className="h-2 w-2" />
							</span>
						</button>
					) : null}
					{bundled && !model.loading && (view === "search" || offer.models.length === 0) ? (
						<button
							type="button"
							onClick={connect}
							className="flex h-10 w-full items-center border-border-raised border-t px-3 text-muted hover:text-text type-control"
						>
							Connect account…
						</button>
					) : null}
				</>
			)}
			{usage !== null ? (
				<p data-agent-usage="" className="border-border-raised border-t px-3 py-2 text-muted type-detail">
					{usage}
				</p>
			) : null}
		</div>
	);
	return (
		<span data-agent-model={model.readout} className="flex min-w-0 flex-1">
			{model.accountOpen && model.project !== undefined ? (
				<AgentAccountDialog
					project={model.project}
					onClose={() => model.closeAccount?.()}
					onConnected={model.refresh}
					renewal={recovery?.kind === "login" ? recovery : undefined}
					onAuthenticated={(provider, method) => {
						if (
							recovery?.kind === "login" &&
							(!recovery.offer || recovery.offer.startsWith(`spool/${provider}/${method}/`))
						)
							login?.retry?.();
					}}
				/>
			) : null}
			{open ? (
				<button
					type="button"
					tabIndex={-1}
					aria-label="close the model menu"
					className="fixed inset-0 z-10 cursor-default"
					onClick={() => show(false)}
				/>
			) : null}
			<button
				type="button"
				ref={trigger}
				aria-label="Choose model"
				title={`${name}${levels.length ? ` · ${offer.current.effort ?? "auto"}` : ""}`}
				aria-expanded={open}
				onPointerDown={() => setKeyboard(false)}
				onClick={(event) => {
					setKeyboard(event.detail === 0);
					show(!open);
				}}
				onKeyDown={(event) => {
					setKeyboard(true);
					if (event.key === "ArrowDown" || event.key === "ArrowUp") {
						event.preventDefault();
						show(true);
					}
				}}
				className="relative z-30 flex min-w-0 items-center gap-1.5 text-muted type-detail transition-colors hover:text-text"
			>
				<span className="min-w-0 truncate">{name}</span>
				<ChevronIcon open={open} className="h-2 w-2 shrink-0" />
			</button>
			{interrupted ? null : (
				<ResizePopover ref={panel} open={open} view={view} still={reduced || keyboard}>
					{content}
				</ResizePopover>
			)}
		</span>
	);
}
