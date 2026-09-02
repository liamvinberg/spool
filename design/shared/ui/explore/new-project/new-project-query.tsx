import { shortPath } from "shared/lib/spool/picker-disk";
import { SearchIcon } from "shared/ui/spool/icons";
import { ListBox, PickerStage } from "shared/ui/spool/picker-parts";
import { Empty, MinRow, PathPrefix } from "shared/ui/explore/picker/picker-min";
import { type NewSeed, OfferRow, useNewProject } from "shared/ui/explore/new-project/new-project-parts";

/**
 * Shape two: what you typed is the name.
 *
 * There is no mode to enter, because the field you would switch already holds
 * the word you want. A search that turns up no folder actually called that ends
 * in a row offering to make one, and when nothing answers at all that row is the
 * whole list rather than an apology followed by one. The prefix is gone while
 * searching, so the row carries the location itself: `in ~/personal/projects`,
 * the folder you were standing in before you started typing.
 *
 * The cost is that a folder name and a search term are not the same kind of
 * word. Typing `gym br` finds gym-brute and would make a folder called `gym br`.
 */
export function NewProjectQuery({ seed }: { seed?: NewSeed | undefined }) {
	const np = useNewProject(seed);
	const { picker } = np;
	const typed = picker.query.trim();
	const exact = picker.rows.some((row) => row.dir.name === typed);
	const offering = picker.searching && !exact;
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
				{picker.rows.length === 0 && picker.searching && !offering ? <Empty picker={picker} /> : null}
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
				{offering ? (
					<OfferRow
						label={
							<>
								{"create "}
								<span className="text-text">{typed}</span>
								<span className="text-muted/45">{` in ${shortPath(picker.path)}`}</span>
							</>
						}
						hint="↵ makes it"
						picked={picker.rows.length === 0}
						onPress={() => undefined}
					/>
				) : null}
				{picker.searching || here ? null : (
					<OfferRow label="initialize design/ here" picked={false} onPress={picker.openHere} />
				)}
			</ListBox>
		</PickerStage>
	);
}
