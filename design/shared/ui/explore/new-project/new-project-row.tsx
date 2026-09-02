import { FolderIcon, SearchIcon } from "shared/ui/spool/icons";
import { ListBox, PickerStage } from "shared/ui/spool/picker-parts";
import { Empty, MinRow, PathPrefix, ROW } from "shared/ui/explore/picker/picker-min";
import { type NewSeed, OfferRow, Target, useNewProject } from "shared/ui/explore/new-project/new-project-parts";

/**
 * Shape one: one more row.
 *
 * The list is where you answer which folder, and a folder that does not exist
 * yet is one more answer to that, so `new project…` is the last row of a browse
 * and it is quieter than the folders above it. Enter turns the field into the
 * name field: the prefix does not move, because it is still the location, and
 * the list collapses to the single line the folder is about to be. Nothing is
 * added to the dialog, and while you are naming there is less of it than there
 * was.
 */
export function NewProjectRow({ seed }: { seed?: NewSeed | undefined }) {
	const np = useNewProject(seed);
	const { picker } = np;
	const here = picker.rows.some((row) => row.dir.path === picker.path && row.dir.isProject);

	return (
		<PickerStage width={520} top={162}>
			<label className="flex h-[52px] shrink-0 items-center gap-2 px-4">
				{np.naming ? (
					<FolderIcon className="h-3 w-3 shrink-0 text-thread" />
				) : (
					<SearchIcon className="h-3 w-3 shrink-0 text-muted/45" />
				)}
				{picker.searching ? null : <PathPrefix picker={picker} />}
				{np.naming ? (
					<input
						ref={np.nameRef}
						value={np.name}
						spellCheck={false}
						autoComplete="off"
						placeholder="name"
						aria-label="Project name"
						onChange={(event) => np.setName(event.target.value)}
						onKeyDown={np.onNameKeyDown}
						className="min-w-0 flex-1 bg-transparent font-mono text-md text-text leading-md caret-thread outline-none placeholder:text-muted/35"
					/>
				) : (
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
				)}
			</label>

			{np.naming ? (
				<div className="py-1.5">
					<div style={{ height: ROW }} className="relative flex w-full items-center gap-3 bg-raised px-4">
						<span className="absolute top-1 bottom-1 left-0 w-[2px] rounded-full bg-thread" />
						<FolderIcon className="h-3 w-3 shrink-0 text-thread/70" />
						<Target parent={picker.path} name={np.name} />
						<span className="flex-1" />
						<span className="shrink-0 font-mono text-2xs text-muted/45 leading-3">↵ creates</span>
					</div>
				</div>
			) : (
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
						<OfferRow
							label="initialize design/ here"
							picked={false}
							onPress={picker.openHere}
						/>
					)}
					{picker.searching ? null : (
						<OfferRow label="new project…" hint="↵ names it" picked={false} onPress={np.begin} />
					)}
				</ListBox>
			)}
		</PickerStage>
	);
}
