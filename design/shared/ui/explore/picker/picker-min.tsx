import { useEffect, useRef } from "react";
import { HOME, shortPath } from "shared/lib/spool/picker-disk";
import { cn } from "shared/lib/utils";
import { FolderIcon, SearchIcon } from "shared/ui/spool/icons";
import { ListBox, Name, type Picker, PickerStage, type Row, usePicker, Where } from "shared/ui/spool/picker-parts";

/**
 * The picker, subtracted (decided 2026-09-02).
 *
 * What shipped with #251 was five horizontal bands deep: a header carrying a
 * back arrow, a field and a folder count; a breadcrumb; a list whose rows print
 * a path, the word `spool` and a frame count, under group labels printing
 * counts of their own; a jump row; and a footer holding four key hints and two
 * buttons. Every band answered a real question, and together they answered so
 * many that the folder you came for was the quietest thing on screen.
 *
 * This is one field and a list. Nothing it does changed: search still reaches
 * every folder under home, the breadcrumb is still pressable, `↑↓ ↵ → ⌫ esc`
 * are untouched, and landing on a folder spool does not recognise still offers
 * to initialize it. Only the chrome went.
 */

export const ROW = 34;

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
 * One row.
 *
 * A project is told by the colour of its glyph, which is cheaper to read than
 * the word `spool` at the far end of the row, so the word goes and the number
 * stays: how many frames are in there is the one thing the glyph cannot say.
 * A search prints each result's own parent as a column at the end of the row,
 * because a list gathered from four levels of the tree has to say where each
 * line came from.
 */
export function MinRow({
	row,
	index,
	picked,
	searching,
	onPoint,
	onEnter,
}: {
	row: Row;
	index: number;
	picked: boolean;
	searching: boolean;
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
			<Name name={row.dir.name} matched={row.matched} className="min-w-0 shrink truncate text-base leading-base" />
			<span className="flex-1" />
			{searching ? <Where dir={row.dir} className="min-w-0 shrink" /> : null}
			{row.dir.frames === undefined ? null : (
				<span className="shrink-0 font-mono text-2xs text-muted/55 leading-3">{row.dir.frames}</span>
			)}
		</button>
	);
}

export function Empty({ picker }: { picker: Picker }) {
	return (
		<div className="flex h-[34px] items-center gap-3 px-4 font-mono text-muted/45 text-sm leading-sm">
			<FolderIcon className="h-3 w-3 shrink-0 text-muted/30" />
			{picker.searching ? "nothing under ~ answers to that" : "no folders here"}
		</div>
	);
}

/**
 * The breadcrumb, living inside the field.
 *
 * While you are browsing, where you are and what you would type read as one
 * line, in the order a path is written, and every segment of it is still a
 * press. The moment a query starts the prefix drops: search reaches every
 * folder under home, and a path sitting in front of the query would say it was
 * scoped to that folder. What replaces it is per row, where it is true — each
 * result carries its own parent at the end of its line.
 */
export function PathPrefix({ picker }: { picker: Picker }) {
	const parts = shortPath(picker.path).split("/");
	return (
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
						{`${part}/`}
					</button>
				);
			})}
		</span>
	);
}

/**
 * The picker: one field, a list under it.
 *
 * There is no footer, so the offer to initialize a plain folder is the last row
 * of a browse. A row is a thing you can arrow onto; a footer never was.
 */
export function PickerField({ seed }: { seed?: Seed | undefined }) {
	const picker = usePicker();
	useAt(picker, seed?.path, seed?.query);
	const here = picker.rows.some((row) => row.dir.path === picker.path && row.dir.isProject);

	return (
		<PickerStage width={520} top={162}>
			<label className="flex h-[52px] shrink-0 items-center gap-2 px-4">
				<SearchIcon className="h-3 w-3 shrink-0 text-muted/45" />
				{picker.searching ? null : <PathPrefix picker={picker} />}
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

			<ListBox picker={picker} min={0} max={476}>
				{picker.rows.length === 0 && picker.searching ? <Empty picker={picker} /> : null}
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
