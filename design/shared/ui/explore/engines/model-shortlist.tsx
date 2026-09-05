import { useEffect, useRef, useState } from "react";
import type { ClaudeModel } from "shared/lib/spool/agent-model";
import { SheetHeading } from "shared/ui/explore/engines/account-dialog";
import { Switch } from "shared/ui/explore/settings/controls";
import { SearchIcon } from "shared/ui/spool/icons";

/** Crowded connected-account fixtures for layout, not a catalog or capability promise.
 * Production offers come from the host, including display names and effort levels.
 */
const CONNECTIONS = [
	{ id: "chatgpt", name: "ChatGPT", models: ["Astra", "GPT-5.4", "GPT-5.4 mini"] },
	{ id: "openai", name: "OpenAI API key", models: ["Astra", "GPT-5.4", "GPT-5.4 mini", "GPT-4.1", "GPT-4.1 mini"] },
	{ id: "anthropic", name: "Anthropic API key", models: ["Opus 5", "Sonnet 5", "Haiku 4.5"] },
	{
		id: "google",
		name: "Google API key",
		models: ["Gemini 3.1 Pro", "Gemini 3 Flash", "Gemini 2.5 Pro", "Gemini 2.5 Flash"],
	},
	{ id: "grok", name: "Grok", models: ["Grok 4", "Grok 4 fast"] },
	{ id: "xai", name: "xAI API key", models: ["Grok 4", "Grok 4 fast", "Grok 3"] },
] as const;

export interface ScopedModel extends ClaudeModel {
	connection: string;
}
const OFFERS: readonly ScopedModel[] = CONNECTIONS.flatMap((connection) =>
	connection.models.map(
		(name): ScopedModel => ({
			value: `${connection.id}/${name}`,
			resolvedModel: `${connection.id}/${name}`,
			displayName: name,
			connection: connection.name,
			description: `Uses your ${connection.name}${connection.id === "chatgpt" || connection.id === "grok" ? " account" : ""}.`,
			supportsEffort: true,
			supportedEffortLevels: ["low", "medium", "high"],
		}),
	),
);

export function useModelScope(search = "") {
	const [shown, setShown] = useState<readonly string[]>([
		"chatgpt/Astra",
		"anthropic/Opus 5",
		"google/Gemini 3.1 Pro",
	]);
	const [query, setQuery] = useState(search);
	return {
		models: OFFERS,
		shown,
		query,
		setQuery,
		setVisible: (value: string, visible: boolean) =>
			setShown((all) => (visible ? [...new Set([...all, value])] : all.filter((id) => id !== value))),
	};
}
export type ModelScope = ReturnType<typeof useModelScope>;

export function modelMatches(model: ScopedModel, query: string) {
	return `${model.displayName} ${model.connection}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
}

export function ModelSearch({
	query,
	onChange,
	label,
}: {
	query: string;
	onChange: (query: string) => void;
	label: string;
}) {
	return (
		<label className="flex h-8 min-w-0 items-center gap-2 rounded-sm border border-border-raised bg-bg px-2.5 text-muted focus-within:border-muted/45">
			<SearchIcon className="h-3 w-3 shrink-0" />
			<input
				type="search"
				value={query}
				onChange={(event) => onChange(event.target.value)}
				aria-label={label}
				placeholder={label}
				className="min-w-0 flex-1 bg-transparent text-base text-text leading-base outline-none placeholder:text-muted/50"
			/>
		</label>
	);
}

/** Models tab on the existing SettingsSheet geometry and tab style. No writes. */
export function ModelSettings({ scope, onClose }: { scope: ModelScope; onClose: () => void }) {
	const [query, setQuery] = useState("");
	const ref = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const previous = document.activeElement;
		ref.current?.focus();
		return () => {
			if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
		};
	}, []);
	const found = scope.models.filter((model) => modelMatches(model, query));
	return (
		<>
			<div className="fixed inset-0 z-50 animate-find-in bg-bg/48 backdrop-blur-[2px]">
				<button
					type="button"
					tabIndex={-1}
					aria-label="Dismiss settings"
					className="absolute inset-0 cursor-default"
					onClick={onClose}
				/>
			</div>
			<div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center px-8">
				<div
					ref={ref}
					role="dialog"
					aria-modal="true"
					aria-label="Settings"
					tabIndex={-1}
					data-model-settings=""
					className="pointer-events-auto flex h-[560px] max-h-[calc(100%-128px)] w-[760px] animate-find-panel-in flex-col overflow-hidden rounded-lg border border-border-raised bg-surface outline-none"
					onKeyDown={(event) => {
						if (event.key === "Escape") {
							event.stopPropagation();
							onClose();
						}
						if (event.key !== "Tab") return;
						const controls = [
							...(ref.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input") ?? []),
						];
						const first = controls[0];
						const last = controls.at(-1);
						if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) {
							event.preventDefault();
							last?.focus();
						} else if (!event.shiftKey && document.activeElement === last) {
							event.preventDefault();
							first?.focus();
						}
					}}
				>
					<SheetHeading onClose={onClose}>Settings</SheetHeading>
					<div className="flex h-10 shrink-0 items-stretch gap-6 border-border border-b px-6">
						<button
							type="button"
							data-go="settings-sheet"
							className="text-base text-muted leading-base hover:text-text"
						>
							General
						</button>
						<button
							type="button"
							data-go="settings-sheet--theme"
							className="text-base text-muted leading-base hover:text-text"
						>
							Appearance
						</button>
						<span aria-current="page" className="relative flex items-center text-base text-text leading-base">
							Models
							<span className="absolute inset-x-0 bottom-0 h-[2px] bg-thread" />
						</span>
					</div>
					<div className="flex shrink-0 flex-col gap-4 px-6 pt-5 pb-4">
						<div className="flex flex-col gap-1">
							<h3 className="font-medium text-md text-text leading-md">Models in spool</h3>
							<p className="text-base text-muted leading-base">
								Choose the models shown in the picker on this machine. Search can find every connected model.
							</p>
						</div>
						<ModelSearch query={query} onChange={setQuery} label="Search models or accounts" />
						<div className="flex items-center justify-between gap-4">
							<p role="status" className="font-mono text-2xs text-muted leading-3">
								{scope.shown.length} shown · {scope.models.length} available
							</p>
							<button
								type="button"
								onClick={() => {
									for (const model of found)
										scope.setVisible(model.value, !found.every((entry) => scope.shown.includes(entry.value)));
								}}
								className="text-sm text-muted leading-sm hover:text-text"
							>
								{found.every((model) => scope.shown.includes(model.value))
									? query
										? "Hide results"
										: "Hide all"
									: query
										? "Show results"
										: "Show all"}
							</button>
						</div>
					</div>
					<div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
						{CONNECTIONS.map((connection) => {
							const models = found.filter((model) => model.connection === connection.name);
							if (models.length === 0) return null;
							return (
								<section key={connection.id} className="mb-6">
									<h4 className="border-border border-b pb-2 font-medium text-base text-text leading-base">
										{connection.name}
									</h4>
									{models.map((model) => (
										<div
											key={model.value}
											data-visible-model={model.value}
											className="flex h-10 items-center justify-between gap-4 border-border border-b"
										>
											<span className="font-mono text-xs text-text/85 leading-4">{model.displayName}</span>
											<Switch
												on={scope.shown.includes(model.value)}
												label={`Show ${model.displayName} through ${model.connection}`}
												onChange={(visible) => scope.setVisible(model.value, visible)}
											/>
										</div>
									))}
								</section>
							);
						})}
						{found.length === 0 ? (
							<p className="py-4 text-base text-muted leading-base">No models match “{query}”.</p>
						) : null}
					</div>
				</div>
			</div>
		</>
	);
}
