import { useEffect, useRef, useState } from "react";
import { cn } from "shared/lib/utils";
import { SheetHeading } from "shared/ui/explore/engines/account-dialog";
import {
	type ModelScope,
	ModelSearch,
	type ScopedModel,
	modelMatches,
} from "shared/ui/explore/engines/model-shortlist";
import { MenuItem } from "shared/ui/spool/context-menu";
import { ModelRow } from "shared/ui/spool/model-control";

/** Throwaway alternatives to managing the shortlist in Settings. Same account fixtures, no persistence. */
export type ModelTake = "settings" | "favorites" | "browser";

function Favorite({ model, scope }: { model: ScopedModel; scope: ModelScope }) {
	const on = scope.shown.includes(model.value);
	return (
		<button
			type="button"
			aria-label={`${on ? "Unfavorite" : "Favorite"} ${model.displayName} through ${model.connection}`}
			aria-pressed={on}
			title={on ? "Remove from favorites" : "Add to favorites"}
			onClick={() => scope.setVisible(model.value, !on)}
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

export function FavoriteOptions({
	scope,
	model,
	take,
	onPick,
	onOver,
	onBrowse,
}: {
	scope: ModelScope;
	model: string;
	take: "favorites" | "browser";
	onPick: (value: string) => void;
	onOver: (description: string) => void;
	onBrowse: () => void;
}) {
	const all = take === "favorites" && scope.list === "all";
	const visible = scope.models.filter(
		(entry) =>
			(all || scope.shown.includes(entry.value) || entry.value === model) && modelMatches(entry, scope.query),
	);
	return (
		<div data-model-take={take}>
			{take === "favorites" ? (
				<>
					<div className="flex gap-3 px-1.5 pt-1 pb-2">
						{(["favorites", "all"] as const).map((list) => (
							<button
								type="button"
								key={list}
								aria-pressed={scope.list === list}
								onClick={() => scope.setList(list)}
								className={cn(
									"border-b pb-1 text-base leading-base",
									scope.list === list
										? "border-text/65 text-text"
										: "border-transparent text-muted hover:text-text",
								)}
							>
								{list === "favorites" ? "Favorites" : "All models"}
							</button>
						))}
					</div>
					<ModelSearch
						query={scope.query}
						onChange={scope.setQuery}
						label={all ? "Search all models" : "Search favorites"}
					/>
				</>
			) : null}
			<div className="mt-1 max-h-[216px] overflow-y-auto">
				{visible.map((entry) => (
					<div key={entry.value} data-model-offer={entry.value} className="flex items-center gap-0.5">
						<ModelRow
							label={entry.displayName}
							via={entry.connection}
							on={entry.value === model}
							onOver={() => onOver(entry.description)}
							onPick={() => onPick(entry.value)}
						/>
						{take === "favorites" ? <Favorite model={entry} scope={scope} /> : null}
					</div>
				))}
				{visible.length === 0 ? (
					<p className="px-1.5 py-3 text-base text-muted leading-base">
						{all ? "No matching models." : "No matching favorites."}
					</p>
				) : null}
			</div>
			{take === "favorites" ? (
				!all && scope.query.trim() ? (
					<MenuItem label="Search all models…" onClick={() => scope.setList("all")} />
				) : null
			) : (
				<MenuItem label="Browse models…" onClick={onBrowse} />
			)}
		</div>
	);
}

export function ModelBrowser({
	scope,
	model,
	onPick,
	onClose,
	onConnect,
}: {
	scope: ModelScope;
	model: string;
	onPick: (value: string) => void;
	onClose: () => void;
	onConnect: () => void;
}) {
	const [account, setAccount] = useState("all");
	const ref = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const previous = document.activeElement;
		ref.current?.querySelector<HTMLInputElement>("input")?.focus();
		return () => {
			if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
		};
	}, []);
	const connections = [...new Set(scope.models.map((entry) => entry.connection))];
	const available = scope.models.filter(
		(entry) =>
			account === "all" ||
			(account === "favorites" ? scope.shown.includes(entry.value) : entry.connection === account),
	);
	const found = available.filter((entry) => modelMatches(entry, scope.query));
	return (
		<>
			<div className="fixed inset-0 z-50 animate-find-in bg-bg/48 backdrop-blur-[2px]">
				<button
					type="button"
					tabIndex={-1}
					aria-label="Dismiss model browser"
					className="absolute inset-0 cursor-default"
					onClick={onClose}
				/>
			</div>
			<div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center px-8">
				<div
					ref={ref}
					role="dialog"
					aria-modal="true"
					aria-label="Choose a model"
					tabIndex={-1}
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
					<SheetHeading onClose={onClose}>Choose a model</SheetHeading>
					<div className="flex min-h-0 flex-1">
						<nav
							aria-label="Model accounts"
							className="flex w-[190px] shrink-0 flex-col border-border border-r px-2 py-3"
						>
							{[
								{ id: "all", name: "All models" },
								{ id: "favorites", name: "Favorites" },
								...connections.map((name) => ({ id: name, name })),
							].map((entry, index) => (
								<div key={entry.id} className={cn(index === 2 && "mt-3 border-border border-t pt-3")}>
									<button
										type="button"
										aria-current={account === entry.id ? "true" : undefined}
										onClick={() => setAccount(entry.id)}
										className={cn(
											"flex h-8 w-full items-center justify-between gap-2 rounded-sm px-3 text-left text-base leading-base",
											account === entry.id
												? "bg-raised text-text"
												: "text-muted hover:bg-raised/60 hover:text-text",
										)}
									>
										{entry.name}
										<span className="font-mono text-2xs text-muted">
											{entry.id === "all"
												? scope.models.length
												: entry.id === "favorites"
													? scope.shown.length
													: scope.models.filter((candidate) => candidate.connection === entry.id).length}
										</span>
									</button>
								</div>
							))}
							<div className="mt-auto pt-4">
								<MenuItem label="Connect account…" onClick={onConnect} />
							</div>
						</nav>
						<div className="flex min-w-0 flex-1 flex-col">
							<div className="px-5 pt-4 pb-3">
								<ModelSearch
									query={scope.query}
									onChange={scope.setQuery}
									label={
										account === "all"
											? "Search all models"
											: account === "favorites"
												? "Search favorites"
												: `Search ${account}`
									}
								/>
							</div>
							<div className="min-h-0 flex-1 overflow-y-auto px-5">
								{connections.map((connection) => {
									const entries = found.filter((entry) => entry.connection === connection);
									return entries.length === 0 ? null : (
										<section key={connection} className="mb-4">
											<h3 className="border-border border-b pb-2 font-medium text-base text-muted leading-base">
												{connection}
											</h3>
											{entries.map((entry) => (
												<div
													key={entry.value}
													data-model-offer={entry.value}
													className="flex h-9 items-center gap-2 border-border border-b"
												>
													<ModelRow
														label={entry.displayName}
														on={model === entry.value}
														note={model === entry.value ? "current" : undefined}
														onPick={() => onPick(entry.value)}
													/>
													<Favorite model={entry} scope={scope} />
												</div>
											))}
										</section>
									);
								})}
								{found.length === 0 ? (
									<div className="py-8">
										<p className="text-base text-muted leading-base">No matching models.</p>
										{account !== "all" ? (
											<MenuItem label="Search all models…" onClick={() => setAccount("all")} />
										) : null}
									</div>
								) : null}
							</div>
							<p role="status" className="border-border border-t px-5 py-3 text-sm text-muted leading-sm">
								{found.length} models · Star a model to keep it in the footer menu.
							</p>
						</div>
					</div>
				</div>
			</div>
		</>
	);
}
