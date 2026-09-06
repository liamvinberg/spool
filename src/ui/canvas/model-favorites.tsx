import { useState } from "react";
import type { AgentModel } from "../../daemon/agent-offer";
import { cn } from "../cn";
import { SearchIcon } from "../icons";
import { keep, recall } from "../remembered";

const isFavorites = (value: unknown): value is string[] =>
	Array.isArray(value) && value.every((entry) => typeof entry === "string");

export function useModelFavorites(project: string, engine: string) {
	const key = `models.favorites.${encodeURIComponent(project)}.${engine}`;
	const [stored, setStored] = useState<{ key: string; values: string[] }>(() => ({
		key,
		values: recall(key, isFavorites) ?? [],
	}));
	const values = stored.key === key ? stored.values : (recall(key, isFavorites) ?? []);
	return {
		values,
		toggle: (value: string) => {
			const next = values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value];
			keep(key, next);
			setStored({ key, values: next });
		},
	};
}

export function favoriteModels(
	models: readonly AgentModel[],
	current: string | null,
	favorites: readonly string[],
	all: boolean,
	query: string,
) {
	return models.filter(
		(model) =>
			(all || favorites.includes(model.value) || model.value === current) &&
			`${model.displayName} ${model.connection ?? ""}`
				.toLocaleLowerCase()
				.includes(query.trim().toLocaleLowerCase()),
	);
}

export function ModelSearch({
	query,
	all,
	onQuery,
	onAll,
}: {
	query: string;
	all: boolean;
	onQuery: (value: string) => void;
	onAll: (all: boolean) => void;
}) {
	const label = all ? "Search all models" : "Search favorites";
	return (
		<>
			<div className="flex gap-3 px-1.5 pt-1 pb-2">
				{[false, true].map((value) => (
					<button
						type="button"
						key={String(value)}
						aria-pressed={all === value}
						onClick={() => onAll(value)}
						className={cn(
							"border-b pb-1 text-base leading-base",
							all === value ? "border-text/65 text-text" : "border-transparent text-muted hover:text-text",
						)}
					>
						{value ? "All models" : "Favorites"}
					</button>
				))}
			</div>
			<label className="flex h-8 min-w-0 items-center gap-2 rounded-sm border border-border-raised bg-bg px-2.5 text-muted focus-within:border-muted/45">
				<SearchIcon className="h-3 w-3 shrink-0" />
				<input
					type="search"
					value={query}
					onChange={(event) => onQuery(event.target.value)}
					aria-label={label}
					placeholder={label}
					className="min-w-0 flex-1 bg-transparent text-base text-text leading-base outline-none placeholder:text-muted/50"
				/>
			</label>
		</>
	);
}

export function ModelFavorite({ model, on, toggle }: { model: AgentModel; on: boolean; toggle: () => void }) {
	return (
		<button
			type="button"
			aria-label={`${on ? "Unfavorite" : "Favorite"} ${model.displayName} through ${model.connection ?? "Claude Code"}`}
			aria-pressed={on}
			title={on ? "Remove from favorites" : "Add to favorites"}
			onClick={toggle}
			className={cn(
				"flex h-7 w-7 shrink-0 items-center justify-center rounded-sm transition-colors hover:bg-surface hover:text-text",
				on ? "text-text/75" : "text-muted/45",
			)}
		>
			<svg
				aria-hidden="true"
				viewBox="0 0 24 24"
				className="h-3 w-3"
				fill={on ? "currentColor" : "none"}
				stroke="currentColor"
				strokeWidth="1.5"
				strokeLinejoin="round"
			>
				<path d="m12 3 2.8 5.7 6.3.9-4.6 4.5 1.1 6.3L12 17.4l-5.6 3 1.1-6.3L3 9.6l6.2-.9Z" />
			</svg>
		</button>
	);
}
