import { PlusIcon, SearchIcon } from "shared/ui/spool/icons";
import { ListBox, PickerStage } from "shared/ui/spool/picker-parts";
import { Empty, MinRow, PathPrefix, ROW } from "shared/ui/explore/picker/picker-min";
import {
	InitLine,
	NameLine,
	NamingField,
	type NewSeed,
	useNewProject,
} from "shared/ui/explore/new-project/new-project-parts";

/**
 * The door as a strip under the list.
 *
 * A button inside the field competes with the field; a strip along the bottom
 * of the panel does not compete with anything, and it has room to say what it
 * is and what key does it without shrinking either. It is also always in the
 * same place, which a last row of a scrolling list never is.
 *
 * What it costs is a band. The picker got down to a field and a list, and this
 * gives one of the five back.
 */
export function NewProjectStrip({ seed }: { seed?: NewSeed | undefined }) {
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
				{np.initing ? <InitLine /> : null}
			</ListBox>

			<button
				type="button"
				onClick={np.begin}
				style={{ height: ROW }}
				className="flex w-full shrink-0 items-center gap-3 border-border border-t px-4 text-left text-muted transition-colors duration-100 hover:bg-raised hover:text-text"
			>
				<PlusIcon className="h-2.5 w-2.5 shrink-0" />
				<span className="text-base leading-base">new project</span>
				<span className="flex-1" />
				<span className="shrink-0 font-mono text-2xs text-muted/45 leading-3">⌘N</span>
			</button>
		</PickerStage>
	);
}
