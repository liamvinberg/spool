import { useState } from "react";
import { type ClaudeModel, EFFORT_SAYS, type Effort } from "shared/lib/spool/agent-model";
import { cn } from "shared/lib/utils";
import { type ModelScope, ModelSearch, modelMatches } from "shared/ui/explore/engines/model-shortlist";
import { MenuItem } from "shared/ui/spool/context-menu";
import { ChevronIcon } from "shared/ui/spool/icons";
import { ModelRow } from "shared/ui/spool/model-control";

type Engine = "spool" | "claude";
const NAMES = { spool: "spool", claude: "Claude Code" };
const QUIET = "font-mono text-2xs leading-3";

/** Accepted footer direction. Reuses the system's selection and action rows. */
export function EngineFooter({
	engine,
	model,
	effort,
	models,
	started,
	open,
	onToggle,
	onEngine,
	onModel,
	onEffort,
	onConnect,
	scope,
	onManage,
}: {
	engine: Engine;
	model: string;
	effort: Effort;
	models: readonly ClaudeModel[];
	started: boolean;
	open: boolean;
	onToggle: () => void;
	onEngine: (engine: Engine) => void;
	onModel: (model: string) => void;
	onEffort: (effort: Effort) => void;
	onConnect: () => void;
	scope?: ModelScope | undefined;
	onManage?: (() => void) | undefined;
}) {
	const [over, setOver] = useState<string | null>(null);
	const current = models.find((entry) => entry.value === model);
	const levels = current?.supportedEffortLevels ?? [];
	const searching = Boolean(scope?.query.trim());
	const visible =
		scope === undefined
			? models
			: scope.models.filter((entry) =>
					searching
						? modelMatches(entry, scope.query)
						: scope.shown.includes(entry.value) || entry.value === model,
				);
	const description = current?.description ?? "Connect an account to see its models.";
	const longest = [
		description,
		...models.map((entry) => entry.description),
		...levels.map((level) => EFFORT_SAYS[level] ?? ""),
	].reduce((a, b) => (a.length > b.length ? a : b), "");
	return (
		<div className="relative flex min-w-0 flex-1">
			<button
				type="button"
				data-combined-trigger=""
				aria-label="Choose engine and model"
				aria-expanded={open}
				onClick={onToggle}
				className={cn(
					QUIET,
					"relative z-30 flex min-w-0 items-center gap-1 transition-colors duration-150",
					open ? "text-muted" : "text-muted/45 hover:text-muted",
				)}
			>
				<span className="truncate">
					{NAMES[engine]} · {current?.displayName ?? "Connect account"}
				</span>
				<ChevronIcon open={open} className="h-2 w-2 shrink-0" />
			</button>
			{open ? (
				<div
					data-combined-menu=""
					className="absolute bottom-full left-0 z-30 mb-2 w-[300px] max-w-full animate-agent-menu-in rounded-md border border-border-raised bg-raised p-1.5"
					onMouseLeave={() => setOver(null)}
				>
					{(["spool", "claude"] as const).map((entry) => (
						<div key={entry} data-combined-engine={entry}>
							{started && entry !== engine ? (
								<MenuItem label={`New thread with ${NAMES[entry]}`} onClick={() => onEngine(entry)} />
							) : (
								<ModelRow
									label={NAMES[entry]}
									on={engine === entry}
									onPick={() => {
										if (!started) onEngine(entry);
									}}
								/>
							)}
						</div>
					))}
					<span className="my-1 block h-px bg-border" />
					{scope === undefined ? null : (
						<div className="py-1">
							<ModelSearch query={scope.query} onChange={scope.setQuery} label="Search all connected models" />
						</div>
					)}
					<div className={cn(scope !== undefined && "max-h-[216px] overflow-y-auto")}>
						{visible.map((entry) => (
							<div key={entry.value} data-model-offer={entry.value}>
								<ModelRow
									label={entry.displayName}
									via={scope?.models.find((candidate) => candidate.value === entry.value)?.connection}
									on={entry.value === model}
									onOver={() => setOver(entry.description)}
									onPick={() => onModel(entry.value)}
								/>
							</div>
						))}
						{scope !== undefined && visible.length === 0 ? (
							<p className="px-1.5 py-3 text-base text-muted leading-base">No matching models.</p>
						) : null}
					</div>
					{scope !== undefined ? (
						<p className={cn(QUIET, "px-1.5 py-1.5 text-muted/50")}>
							{searching
								? `${visible.length} matches across connected accounts`
								: `${scope.shown.length} shown${scope.shown.includes(model) ? "" : " · current model kept visible"}`}
						</p>
					) : null}
					{levels.length > 0 && !searching ? (
						<>
							<span className="my-1 block h-px bg-border" />
							<span className={cn(QUIET, "block px-1.5 pt-1 pb-1.5 text-muted/35")}>effort</span>
							{levels.map((level) => (
								<ModelRow
									key={level}
									label={level}
									on={level === effort}
									onOver={() => setOver(EFFORT_SAYS[level] ?? null)}
									onPick={() => onEffort(level)}
								/>
							))}
						</>
					) : null}
					<p className={cn(QUIET, "relative px-1.5 pt-1.5 pb-0.5 text-muted/40 leading-[1.5]")}>
						<span className="invisible" aria-hidden="true">
							{longest}
						</span>
						<span className="absolute inset-x-1.5 top-1.5">{over ?? description}</span>
					</p>
					{engine === "spool" ? (
						<>
							<span className="my-1 block h-px bg-border" />
							<MenuItem label="Connect account…" onClick={onConnect} />
							{scope === undefined ? null : <MenuItem label="Choose visible models…" onClick={onManage} />}
						</>
					) : null}
				</div>
			) : null}
		</div>
	);
}
