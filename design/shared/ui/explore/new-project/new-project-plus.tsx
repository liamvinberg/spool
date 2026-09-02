import { PlusIcon, SearchIcon } from "shared/ui/spool/icons";
import { ListBox, PickerStage } from "shared/ui/spool/picker-parts";
import { Empty, MinRow, PathPrefix } from "shared/ui/explore/picker/picker-min";
import {
	InitLine,
	NameLine,
	NamingField,
	type NewSeed,
	useNewProject,
} from "shared/ui/explore/new-project/new-project-parts";

/**
 * A "+" at the end of the field.
 *
 * Finder has put New Folder in the same place for twenty years, so the button
 * is a thing people already know how to find rather than a row they have to
 * read. It is quiet until the cursor is on it, it costs the field nothing it
 * was using, and it never asks you to type a word that does not exist yet:
 * press it and the field becomes a name field with the folder you are standing
 * in still printed in front of the caret.
 *
 * The offer to initialize a plain folder is gone from the browse. It appears
 * where it always did, once Enter has actually landed on one.
 */
export function NewProjectPlus({ seed }: { seed?: NewSeed | undefined }) {
	const np = useNewProject(seed);
	const { picker } = np;

	if (np.naming) {
		return (
			<PickerStage width={520} top={162}>
				<NamingField np={np} />
				<NameLine np={np} />
			</PickerStage>
		);
	}

	return (
		<PickerStage width={520} top={162}>
			<div className="flex h-[52px] shrink-0 items-center gap-2 px-4">
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
				<button
					type="button"
					onClick={np.begin}
					title="new project ⌘N"
					aria-label="New project"
					className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-muted/45 transition-colors duration-100 hover:bg-raised hover:text-text"
				>
					<PlusIcon className="h-2.5 w-2.5" />
				</button>
			</div>

			<ListBox picker={picker} min={0} max={476}>
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
				{np.initing ? <InitLine /> : null}
			</ListBox>
		</PickerStage>
	);
}
