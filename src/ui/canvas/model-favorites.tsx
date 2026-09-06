import { useState } from "react";
import type { AgentModel } from "../../daemon/agent-offer";
import { cn } from "../cn";
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

export function ModelFavorite({ model, on, toggle }: { model: AgentModel; on: boolean; toggle: () => void }) {
	return (
		<button
			type="button"
			aria-label={`${on ? "Unfavorite" : "Favorite"} ${model.displayName} through ${model.connection ?? "Claude Code"}`}
			aria-pressed={on}
			title={on ? "Remove from favorites" : "Add to favorites"}
			onClick={toggle}
			className={cn(
				"mr-1 flex h-8 w-7 shrink-0 items-center justify-center rounded-sm transition-colors hover:text-text focus-visible:opacity-100",
				on ? "text-muted/65" : "text-muted/35 opacity-0 group-hover:opacity-100",
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
