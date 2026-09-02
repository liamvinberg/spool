import { useEffect, useRef } from "react";
import { HOME, shortPath } from "shared/lib/spool/picker-disk";
import { cn } from "shared/lib/utils";
import { FolderIcon, SearchIcon } from "shared/ui/spool/icons";
import {
	Crumbs,
	Field,
	ListBox,
	Name,
	type Picker,
	PickerStage,
	type Row,
	usePicker,
	Where,
} from "shared/ui/spool/picker-parts";

/**
 * Subtracting from the picker.
 *
 * The dialog that shipped with #251 is five horizontal bands deep: a header
 * carrying a back arrow, a field and a folder count; a breadcrumb; a list where
 * every row can print a path, a `spool` word and a frame count, under group
 * labels that print counts of their own; a jump row; and a footer holding four
 * key hints and two buttons. Every one of those was answering a real question,
 * and together they answer so many that the folder you came for is the quietest
 * thing on screen.
 *
 * Nothing below changes what the picker does. Search still reaches every folder
 * under home, the breadcrumb is still pressable, `↑↓ ↵ → ⌫ esc` are untouched,
 * and Enter landing on a folder spool does not recognise still offers to
 * initialize it. The takes differ only in how much of the dialog is left.
 */

const ROW = 34;

/** the frame a state opens in: a folder to be standing in, a query to have typed */
export function useAt(picker: Picker, path?: string, query?: string): void {
	const seeded = useRef(false);
	// biome-ignore lint/correctness/useExhaustiveDependencies: a seed, not a sync
	useEffect(() => {
		if (seeded.current) return;
		seeded.current = true;
		if (path !== undefined) picker.browse(path);
		if (query !== undefined) picker.setQuery(query);
	}, []);
}

export interface Seed {
	readonly path?: string;
	readonly query?: string;
}

/**
 * One row, everywhere.
 *
 * A project is told by the colour of its glyph, which is cheaper to read than
 * the word `spool` at the far end of the row, so the word goes and the number
 * stays: how many frames are in there is the one thing the glyph cannot say.
 */
function MinRow({
	row,
	index,
	picked,
	searching,
	pathRight = false,
	onPoint,
	onEnter,
}: {
	row: Row;
	index: number;
	picked: boolean;
	searching: boolean;
	/** the path as a column at the end of the row rather than beside the name */
	pathRight?: boolean | undefined;
	onPoint: () => void;
	onEnter: () => void;
}) {
	return (
		<button
			type="button"
			data-at={index}
			onMouseMove={onPoint}
			onClick={onEnter}
			style={{ height: ROW }}
			className={cn(
				"relative flex w-full items-center gap-3 px-4 text-left transition-colors duration-100",
				picked && "bg-raised",
			)}
		>
			{picked ? <span className="absolute top-1 bottom-1 left-0 w-[2px] rounded-full bg-thread" /> : null}
			<FolderIcon className={cn("h-3 w-3 shrink-0", row.dir.isProject ? "text-thread/70" : "text-muted/30")} />
			<Name
				name={row.dir.name}
				matched={row.matched}
				className={cn("min-w-0 truncate text-base leading-base", pathRight ? "shrink" : "shrink-0")}
			/>
			{searching && !pathRight ? <Where dir={row.dir} className="min-w-0 flex-1" /> : <span className="flex-1" />}
			{searching && pathRight ? <Where dir={row.dir} className="min-w-0 shrink" /> : null}
			{row.dir.frames === undefined ? null : (
				<span className="shrink-0 font-mono text-2xs text-muted/55 leading-3">{row.dir.frames}</span>
			)}
		</button>
	);
}

function Empty({ picker }: { picker: Picker }) {
	return (
		<div className="flex h-[34px] items-center gap-3 px-4 font-mono text-muted/45 text-sm leading-sm">
			<FolderIcon className="h-3 w-3 shrink-0 text-muted/30" />
			{picker.searching ? "nothing under ~ answers to that" : "no folders here"}
		</div>
	);
}

/**
 * Take one: the same dialog with the fat cut.
 *
 * Five bands become three. The folder count went because the list is the count.
 * The group labels went because a thread-coloured glyph already says which rows
 * spool knows, and saying it twice more per row said it worse. The jump row
 * went because the breadcrumb and the search both reach those folders in fewer
 * presses than a chip does. The back arrow went because backspace on an empty
 * query has always gone up and the breadcrumb is the rest of the way. The two
 * buttons went because Enter was already the button, so the footer is one line
 * of hints, and the offer to initialize a plain folder is a sentence on that
 * same line rather than a state the whole dialog enters.
 *
 * `new project…` would go where the offer already is: the last row of a browse.
 */
export function PickerLean({ seed }: { seed?: Seed | undefined }) {
	const picker = usePicker();
	useAt(picker, seed?.path, seed?.query);
	const initing = picker.landed?.kind === "init";

	return (
		<PickerStage width={600}>
			<div className="flex h-12 shrink-0 items-center gap-3 border-border border-b px-4">
				<Field picker={picker} placeholder="search every folder under ~" />
			</div>

			<div className="flex h-9 shrink-0 items-center border-border border-b px-4">
				<Crumbs picker={picker} />
			</div>

			<ListBox picker={picker} min={204} max={408}>
				{picker.rows.length === 0 ? <Empty picker={picker} /> : null}
				{picker.rows.map((row, index) => (
					<MinRow
						key={row.dir.path}
						row={row}
						index={index}
						picked={index === picker.at}
						searching={picker.searching}
						onPoint={() => picker.point(index)}
						onEnter={() => picker.enter(index)}
					/>
				))}
			</ListBox>

			<div className="flex h-9 shrink-0 items-center gap-5 whitespace-nowrap border-border border-t px-4 font-mono text-2xs text-muted/55 leading-3">
				{initing ? (
					<>
						<span className="min-w-0 flex-1 truncate">
							{`no canvas.json in ${shortPath(picker.landed?.path ?? HOME)}`}
						</span>
						<span>↵ initializes</span>
						<span>esc leaves it</span>
					</>
				) : (
					<>
						<span>↑↓ moves</span>
						<span>↵ opens or goes in</span>
						<span>→ goes in</span>
						<span>⌫ goes up</span>
						<span>esc closes</span>
					</>
				)}
			</div>
		</PickerStage>
	);
}

/**
 * Take two: Spotlight. One field, a list under it.
 *
 * The breadcrumb stops being a band and becomes the thing the caret sits after,
 * so where you are and what you are typing read as one line, in the order a
 * path is written. Every segment of the prefix is still a press. The footer is
 * gone entirely and the offer to initialize is the last row of the browse,
 * because a row is a thing you can arrow onto and a footer never was.
 *
 * The honest cost: search reaches every folder under home, and a prefix in
 * front of the query looks like it is scoping the search to that folder. It is
 * not, and this take has nowhere left to say so.
 *
 * `new project…` would sit beside the initialize row, as the other last row.
 */
export function PickerField({ seed }: { seed?: Seed | undefined }) {
	const picker = usePicker();
	useAt(picker, seed?.path, seed?.query);
	const parts = shortPath(picker.path).split("/");
	const here = picker.rows.some((row) => row.dir.path === picker.path && row.dir.isProject);

	return (
		<PickerStage width={520} top={162}>
			<label className="flex h-[52px] shrink-0 items-center gap-2 px-4">
				<SearchIcon className="h-3 w-3 shrink-0 text-muted/45" />
				<span className="flex shrink-0 items-center font-mono text-md leading-md">
					{parts.map((part, index) => {
						const to = index === 0 ? HOME : `${HOME}/${parts.slice(1, index + 1).join("/")}`;
						return (
							<button
								key={to}
								type="button"
								onClick={() => picker.browse(to)}
								className="text-muted/45 transition-colors hover:text-muted"
							>
								{index === 0 ? `${part}/` : `${part}/`}
							</button>
						);
					})}
				</span>
				<input
					ref={picker.inputRef}
					value={picker.query}
					spellCheck={false}
					autoComplete="off"
					aria-label="Search folders"
					onChange={(event) => picker.setQuery(event.target.value)}
					onKeyDown={picker.onKeyDown}
					className="min-w-0 flex-1 bg-transparent font-mono text-md text-text leading-md caret-thread outline-none"
				/>
			</label>

			<ListBox picker={picker} min={0} max={442}>
				{picker.rows.length === 0 && picker.searching ? <Empty picker={picker} /> : null}
				{picker.rows.map((row, index) => (
					<MinRow
						key={row.dir.path}
						row={row}
						index={index}
						picked={index === picker.at}
						searching={picker.searching}
						pathRight
						onPoint={() => picker.point(index)}
						onEnter={() => picker.enter(index)}
					/>
				))}
				{picker.searching || here ? null : (
					<button
						type="button"
						onClick={picker.openHere}
						style={{ height: ROW }}
						className="flex w-full items-center gap-3 px-4 text-left"
					>
						<FolderIcon className="h-3 w-3 shrink-0 text-muted/30" />
						<span className="truncate text-base text-muted leading-base">initialize design/ here</span>
					</button>
				)}
			</ListBox>
		</PickerStage>
	);
}

/**
 * Take three: the list alone.
 *
 * There is no field, because a panel whose every row is a folder has nothing
 * else you could be typing into. The query draws itself at the top the way a
 * terminal finder draws it, a prompt and a caret and the letters so far, and
 * the folder you are standing in is one muted line under it. Nothing is boxed
 * off from anything else: one hairline around the panel, and inside it the rows
 * are held apart by their own height.
 *
 * `new project…` has no slot here worth drawing. The panel is rows of folders
 * and a row that makes one would need a rule this take has not got.
 */
export function PickerList({ seed }: { seed?: Seed | undefined }) {
	const picker = usePicker();
	useAt(picker, seed?.path, seed?.query);
	const parts = shortPath(picker.path).split("/");

	return (
		<PickerStage width={560} top={186}>
			<div className="relative flex flex-col px-0 pt-3.5 pb-1">
				<input
					ref={picker.inputRef}
					value={picker.query}
					spellCheck={false}
					autoComplete="off"
					aria-label="Search folders"
					onChange={(event) => picker.setQuery(event.target.value)}
					onKeyDown={picker.onKeyDown}
					className="absolute h-0 w-0 opacity-0"
				/>
				<div className="flex h-5 items-center gap-2.5 px-4 font-mono text-md leading-md">
					<span className="shrink-0 text-thread">{">"}</span>
					{picker.query === "" ? (
						<>
							<span className="-mr-1 h-3.5 w-[1.5px] shrink-0 bg-thread" />
							<span className="text-muted/35">search every folder under ~</span>
						</>
					) : (
						<>
							<span className="min-w-0 truncate text-text">{picker.query}</span>
							<span className="-ml-1 h-3.5 w-[1.5px] shrink-0 bg-thread" />
						</>
					)}
				</div>
				<div className="flex h-5 min-w-0 items-center px-4 pt-0.5">
					{parts.map((part, index) => {
						const to = index === 0 ? HOME : `${HOME}/${parts.slice(1, index + 1).join("/")}`;
						const last = index === parts.length - 1;
						return (
							<button
								key={to}
								type="button"
								onClick={() => picker.browse(to)}
								disabled={last}
								className={cn(
									"shrink-0 truncate font-mono text-2xs leading-3 transition-colors",
									last ? "text-muted/55" : "text-muted/35 hover:text-muted",
								)}
							>
								{index === 0 ? part : `/${part}`}
							</button>
						);
					})}
				</div>
			</div>

			<ListBox picker={picker} min={0} max={442}>
				{picker.rows.length === 0 ? <Empty picker={picker} /> : null}
				{picker.rows.map((row, index) => (
					<MinRow
						key={row.dir.path}
						row={row}
						index={index}
						picked={index === picker.at}
						searching={picker.searching}
						onPoint={() => picker.point(index)}
						onEnter={() => picker.enter(index)}
					/>
				))}
			</ListBox>
		</PickerStage>
	);
}
