import { shortPath } from "shared/lib/picker-disk";
import { cn } from "shared/lib/utils";
import { FolderIcon } from "shared/ui/spool-icons";
import {
	Field,
	Hints,
	JumpRow,
	LandedLine,
	ListBox,
	Name,
	Nothing,
	PickerStage,
	Readout,
	UpButton,
	usePicker,
	type Row,
} from "shared/ui/spool-picker-parts";

/**
 * Take four: the answer is a project, so a project is what a row looks like.
 *
 * The other takes treat a `canvas.json` as a badge on a folder. This one treats
 * it as a different kind of row: two lines, the frame count and when it was last
 * open on the right, the path underneath. What spool already knows about a
 * project is on screen before you commit to it, which is the difference between
 * opening `gym-brute` and opening the `gym-brute` you meant.
 *
 * Projects come first in every state, typed or not — including a plain browse,
 * where a recognised folder is pulled to the top of the level it sits on. The
 * cost is honest and worth naming: the list is no longer alphabetical, so a
 * folder does not stay where you last saw it.
 */

const PROJECT_ROW = 46;
const FOLDER_ROW = 32;

export function SpoolPickerProjects() {
	const picker = usePicker();
	const projects = picker.rows.filter((row) => row.dir.isProject);
	const folders = picker.rows.filter((row) => !row.dir.isProject);

	return (
		<PickerStage width={620}>
			<div className="flex h-12 shrink-0 items-center gap-3 border-border border-b px-4">
				<UpButton picker={picker} />
				<Field picker={picker} placeholder="search every folder under ~" />
				<Readout picker={picker} />
			</div>

			<ListBox picker={picker} min={220} max={400}>
				{picker.rows.length === 0 ? <Nothing picker={picker} /> : null}

				{projects.length === 0 ? null : (
					<div className="flex h-7 items-center gap-2 px-4">
						<span className="font-mono text-2xs text-muted/45 leading-3">projects</span>
						<span className="h-px flex-1 bg-border" />
					</div>
				)}
				{projects.map((row) => (
					<ProjectRow
						key={row.dir.path}
						row={row}
						index={picker.rows.indexOf(row)}
						picker={picker}
						withPath={picker.searching}
					/>
				))}

				{folders.length === 0 ? null : (
					<div className="flex h-7 items-center gap-2 px-4 pt-1">
						<span className="font-mono text-2xs text-muted/45 leading-3">
							{picker.searching ? "other folders" : `in ${shortPath(picker.path)}`}
						</span>
						<span className="h-px flex-1 bg-border" />
					</div>
				)}
				{folders.map((row) => {
					const index = picker.rows.indexOf(row);
					return (
						<button
							key={row.dir.path}
							type="button"
							data-at={index}
							onMouseMove={() => picker.point(index)}
							onClick={() => picker.enter(index)}
							style={{ height: FOLDER_ROW }}
							className={cn(
								"relative flex w-full items-center gap-2.5 px-4 text-left transition-colors duration-100",
								index === picker.at && "bg-raised",
							)}
						>
							{index === picker.at ? (
								<span className="absolute top-1 bottom-1 left-0 w-[2px] rounded-full bg-thread" />
							) : null}
							<FolderIcon className="h-3 w-3 shrink-0 text-muted/30" />
							<Name
								name={row.dir.name}
								matched={row.matched}
								className="min-w-0 shrink-0 truncate text-base leading-base"
							/>
							{picker.searching ? (
								<span className="min-w-0 flex-1 truncate font-mono text-2xs text-muted/45 leading-3">
									{shortPath(row.dir.parent)}
								</span>
							) : null}
						</button>
					);
				})}
			</ListBox>

			{picker.searching ? null : (
				<div className="flex h-10 shrink-0 items-center gap-1.5 border-border border-t px-3">
					<JumpRow picker={picker} />
				</div>
			)}

			<div className="flex h-12 shrink-0 items-center gap-3 border-border border-t px-4">
				{picker.landed === null ? (
					<Hints className="flex-1" hints={["↑↓ moves", "↵ opens", "→ goes in"]} />
				) : (
					<div className="flex-1">
						<LandedLine landed={picker.landed} />
					</div>
				)}
				<button type="button" className="flex h-7 items-center rounded-md px-3 text-muted text-sm hover:text-text">
					Cancel
				</button>
				<button
					type="button"
					onClick={() => (picker.picked?.dir.isProject === true ? picker.enter(picker.at) : picker.openHere())}
					className="flex h-7 items-center rounded-md border border-border-raised bg-raised px-3 font-medium text-sm text-text"
				>
					{picker.picked?.dir.isProject === true ? `Open ${picker.picked.dir.name}` : "Open this folder"}
				</button>
			</div>
		</PickerStage>
	);
}

function ProjectRow({
	row,
	index,
	picker,
	withPath,
}: {
	row: Row;
	index: number;
	picker: ReturnType<typeof usePicker>;
	withPath: boolean;
}) {
	return (
		<button
			type="button"
			data-at={index}
			onMouseMove={() => picker.point(index)}
			onClick={() => picker.enter(index)}
			style={{ height: PROJECT_ROW }}
			className={cn(
				"relative flex w-full items-center gap-3 px-4 text-left transition-colors duration-100",
				index === picker.at && "bg-raised",
				index === picker.flashing && "bg-thread/15",
			)}
		>
			{index === picker.at ? (
				<span className="absolute top-1.5 bottom-1.5 left-0 w-[2px] rounded-full bg-thread" />
			) : null}
			<span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm border border-border-raised bg-canvas">
				<span className="h-3 w-[2px] rounded-full bg-thread" />
			</span>
			<span className="flex min-w-0 flex-1 flex-col gap-[3px]">
				<Name
					name={row.dir.name}
					matched={row.matched}
					className="truncate font-medium text-base leading-[15px]"
				/>
				<span className="truncate font-mono text-2xs text-muted/55 leading-3">
					{withPath ? shortPath(row.dir.path) : shortPath(row.dir.parent)}
				</span>
			</span>
			<span className="flex shrink-0 flex-col items-end gap-[3px] font-mono text-2xs leading-3">
				<span className="text-text/80">
					{row.dir.frames === undefined
						? "not opened yet"
						: row.dir.frames === 0
							? "no frames yet"
							: `${row.dir.frames} frames`}
				</span>
				<span className="text-muted/50">{row.dir.opened ?? ""}</span>
			</span>
		</button>
	);
}
