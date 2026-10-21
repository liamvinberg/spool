import { type ReactNode, type Ref, useState } from "react";
import { cn } from "./cn";
import { ClockIcon, SearchIcon } from "./icons";
import { IconButton } from "./primitives/actions";
import { Count } from "./primitives/display";
import { SearchField, SelectTrigger } from "./primitives/inputs";
import { NavItem, Tab, Tabs } from "./primitives/navigation";
import { Menu, MenuItem, Popover } from "./primitives/overlays";

/**
 * Finding a project on Home once you are in a team (task 147): one search at the top of the sidebar that reaches every
 * place, your own projects and every team's, got or not; Recent under it; and the one head every place's list of
 * projects wears.
 */

/** How a list of covers is ordered. */
export type Sort = "Recent" | "Name";
export const SORTS: readonly Sort[] = ["Recent", "Name"];
export const SORT_LABEL: Record<Sort, string> = { Recent: "Last opened", Name: "A to Z" };

/** Whether a search, lowercase and trimmed, finds something by any of its words: its name, its path. */
export function finds(needle: string, ...words: readonly string[]): boolean {
	return needle === "" || words.some((word) => word.toLowerCase().includes(needle));
}

/**
 * The search and Recent, above the places: the two that reach every place. Below 720 px the search is an icon that
 * opens the field over the page, so it is still one click away.
 */
export function FindNav({
	query,
	onQuery,
	inputRef,
	recent,
	onRecent,
}: {
	query: string;
	onQuery: (query: string) => void;
	inputRef?: Ref<HTMLInputElement> | undefined;
	/** Recent stands in the page; absent where there is no Recent, as in a browser. */
	recent?: boolean | undefined;
	onRecent?: (() => void) | undefined;
}) {
	const [over, setOver] = useState(false);
	const searching = query.trim() !== "";
	return (
		<div className="pj-find mb-[18px] flex flex-col gap-[10px]">
			<SearchField
				size="md"
				className="w-full [@media(max-width:720px)]:hidden"
				value={query}
				onValueChange={onQuery}
				placeholder="Search"
				label="Search projects"
				inputProps={{ ref: inputRef }}
			/>
			<IconButton
				icon={<SearchIcon className="size-4" />}
				label="Search"
				pressed={over || searching}
				className="hidden self-center [@media(max-width:720px)]:inline-flex"
				onClick={() => setOver(!over)}
			/>
			{(over || searching) && (
				<Popover
					pad="sm"
					aria-label="Search projects"
					className="pj-find-over fixed top-[64px] right-[16px] left-[80px] z-30 hidden [@media(max-width:720px)]:flex"
				>
					<SearchField
						size="md"
						className="w-full"
						value={query}
						onValueChange={onQuery}
						placeholder="Search"
						label="Search projects"
						hotkey=""
						inputProps={{
							autoFocus: true,
							onKeyDown: (event) => {
								if (event.key !== "Escape") return;
								onQuery("");
								setOver(false);
							},
							onBlur: () => {
								if (!searching) setOver(false);
							},
						}}
					/>
				</Popover>
			)}
			{onRecent && (
				<NavItem
					icon={<ClockIcon />}
					label="Recent"
					title="Recent"
					current={recent === true && !searching}
					className={NARROW_NAV}
					onClick={onRecent}
				/>
			)}
		</div>
	);
}

/** One head for every list of projects: its title and count, then the sort, the page's own search and its actions. */
export function ProjectsHead({
	title,
	count,
	sort,
	search,
	actions,
	className,
}: {
	title: string;
	/** How many it holds; `shown` while a search finds some of them. */
	count?: { total: number; shown?: number } | undefined;
	sort?: { value: Sort; onChange: (sort: Sort) => void } | undefined;
	/** The page's own search, where the sidebar has none. */
	search?: ReactNode;
	actions?: ReactNode;
	className?: string;
}) {
	const [sorting, setSorting] = useState(false);
	const filtered = count?.shown !== undefined;
	return (
		<header
			className={cn(
				"pj-heading mb-[31px] flex min-h-[35px] items-center justify-between gap-[25px] [@media(max-width:1050px)]:flex-wrap",
				className,
			)}
		>
			<div className="flex items-baseline gap-3">
				<h1 className="type-page font-medium">{title}</h1>
				{count && (
					<Count
						aria-label={
							filtered
								? `${count.shown} of ${count.total} projects`
								: `${count.total} ${count.total === 1 ? "project" : "projects"}`
						}
						value={filtered ? `${count.shown} of ${count.total}` : count.total}
					/>
				)}
			</div>
			<div className="flex items-center gap-2 [@media(max-width:720px)]:flex-wrap">
				{sort && (
					<div className="relative">
						<SelectTrigger
							// the trigger's own face is a toolbar's; in the head it matches the search beside it
							value={<span className="type-control">{SORT_LABEL[sort.value]}</span>}
							open={sorting}
							aria-haspopup="menu"
							aria-label={`Sort projects: ${SORT_LABEL[sort.value]}`}
							className="h-control-lg px-2"
							onClick={() => setSorting(!sorting)}
						/>
						{sorting && (
							<>
								<button
									type="button"
									className="fixed inset-0 z-10 cursor-default"
									aria-label="Close menu"
									onClick={() => setSorting(false)}
								/>
								<Menu aria-label="Sort projects" className="absolute top-full left-0 z-20 mt-1">
									{SORTS.map((choice) => (
										<MenuItem
											key={choice}
											label={SORT_LABEL[choice]}
											checked={sort.value === choice}
											onClick={() => {
												sort.onChange(choice);
												setSorting(false);
											}}
										/>
									))}
								</Menu>
							</>
						)}
					</div>
				)}
				{search}
				{actions}
			</div>
		</header>
	);
}

/** A place the search found something in: a tab over the results. */
export interface FoundPlace {
	key: string;
	name: string;
	count: number;
}

/** The results' head: how many it found, and a tab per place to narrow them to one. */
export function FoundHead({
	places,
	only,
	onOnly,
}: {
	places: readonly FoundPlace[];
	/** The place the results are narrowed to; null for all. */
	only: string | null;
	onOnly: (place: string | null) => void;
}) {
	const found = places.reduce((sum, place) => sum + place.count, 0);
	return (
		<>
			<ProjectsHead title="Search" count={{ total: found }} className="mb-[18px]" />
			{places.length > 1 && (
				<Tabs className="pj-found-places mb-[28px]" aria-label="Places">
					<Tab selected={only === null} onClick={() => onOnly(null)}>
						All <Count value={found} />
					</Tab>
					{places.map((place) => (
						<Tab key={place.key} selected={only === place.key} onClick={() => onOnly(place.key)}>
							{place.name} <Count value={place.count} />
						</Tab>
					))}
				</Tabs>
			)}
		</>
	);
}

/** The place the results are narrowed to, while the search still finds something there. */
export function useFoundPlace(places: readonly FoundPlace[]) {
	const [only, setOnly] = useState<string | null>(null);
	// new words that find nothing in the chosen place show every place again
	const shown = places.some((place) => place.key === only) ? only : null;
	return [shown, setOnly] as const;
}

/** a narrow window keeps the sidebar's icons and drops their words */
export const NARROW_NAV =
	"[@media(max-width:720px)]:justify-center [@media(max-width:720px)]:px-0 [@media(max-width:720px)]:[&>span]:hidden";
