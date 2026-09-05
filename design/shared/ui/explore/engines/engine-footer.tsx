import { useState } from "react";
import { type ClaudeModel, EFFORT_SAYS, type Effort } from "shared/lib/spool/agent-model";
import { cn } from "shared/lib/utils";
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
}) {
	const [over, setOver] = useState<string | null>(null);
	const current = models.find((entry) => entry.value === model);
	const levels = current?.supportedEffortLevels ?? [];
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
					{models.map((entry) => (
						<ModelRow
							key={entry.value}
							label={entry.displayName}
							on={entry.value === model}
							onOver={() => setOver(entry.description)}
							onPick={() => onModel(entry.value)}
						/>
					))}
					{levels.length > 0 ? (
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
						</>
					) : null}
				</div>
			) : null}
		</div>
	);
}
