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
	ProjectChip,
	Readout,
	usePicker,
	type Row,
} from "shared/ui/spool-picker-parts";

/**
 * Take two: it is a palette, not a dialog.
 *
 * The same key already opens the frame finder on the canvas, and this is the
 * same question one level up — you know the name, you do not know the path. So
 * the chrome goes: no header path, no footer buttons, one field and a list.
 * Enter is the only commit and the footer says so.
 *
 * Results split into two groups, because they answer two different sentences.
 * A folder with a `canvas.json` is somewhere spool can open; every other folder
 * is somewhere to go, or somewhere to run init. Ranking them in one column made
 * `gym-brute-sketch` sit above the project it was sketched from.
 *
 * The path prints in front of the name, dimmed, rather than on the right: read
 * left to right it is the sentence you would have typed, and the names still
 * line up wherever the eye is already resting.
 */

const ROW = 34;

export function SpoolPickerCommand() {
	const picker = usePicker();
	const projects = picker.rows.filter((row) => row.dir.isProject);
	const folders = picker.rows.filter((row) => !row.dir.isProject);
	const groups: readonly { readonly label: string; readonly rows: readonly Row[] }[] = picker.searching
		? [
				{ label: "spool projects", rows: projects },
				{ label: "folders", rows: folders },
			].filter((group) => group.rows.length > 0)
		: [{ label: shortPath(picker.path), rows: picker.rows }];

	return (
		<PickerStage width={620} top={96}>
			<div className="flex h-[52px] shrink-0 items-center gap-3 border-border border-b px-4">
				<Field
					picker={picker}
					placeholder="type part of a folder name"
					prompt={<span className="shrink-0 font-mono text-md text-muted/60 leading-md">~/</span>}
				/>
				<Readout picker={picker} />
			</div>

			<ListBox picker={picker} min={240} max={420}>
				{picker.rows.length === 0 ? <Nothing picker={picker} /> : null}
				{groups.map((group) => (
					<div key={group.label}>
						<div className="flex h-7 items-center gap-2 px-4">
							<span className="font-mono text-2xs text-muted/45 leading-3">{group.label}</span>
							<span className="h-px flex-1 bg-border" />
							<span className="font-mono text-2xs text-muted/30 leading-3">{group.rows.length}</span>
						</div>
						{group.rows.map((row) => {
							const index = picker.rows.indexOf(row);
							return (
								<button
									key={row.dir.path}
									type="button"
									data-at={index}
									onMouseMove={() => picker.point(index)}
									onClick={() => picker.enter(index)}
									style={{ height: ROW }}
									className={cn(
										"relative flex w-full items-center gap-2.5 px-4 text-left transition-colors duration-100",
										index === picker.at && "bg-raised",
										index === picker.flashing && "bg-thread/15",
									)}
								>
									{index === picker.at ? (
										<span className="absolute top-1 bottom-1 left-0 w-[2px] rounded-full bg-thread" />
									) : null}
									<FolderIcon
										className={cn(
											"h-3 w-3 shrink-0",
											row.dir.isProject ? "text-thread/70" : "text-muted/30",
										)}
									/>
									<span className="min-w-0 flex-1 truncate font-mono text-sm leading-sm">
										{picker.searching ? (
											<span className="text-muted/40">{`${shortPath(row.dir.parent)}/`}</span>
										) : null}
										<Name name={row.dir.name} matched={row.matched} className="text-text" />
									</span>
									{row.dir.isProject ? <ProjectChip dir={row.dir} /> : null}
								</button>
							);
						})}
					</div>
				))}
			</ListBox>

			{picker.searching ? null : (
				<div className="flex h-10 shrink-0 items-center gap-1.5 border-border border-t px-4">
					<JumpRow picker={picker} />
				</div>
			)}

			<div className="flex h-9 shrink-0 items-center border-border border-t px-4">
				{picker.landed === null ? (
					<Hints hints={["↑↓ moves", "↵ opens", "→ goes in", "⌫ goes up", "esc clears"]} />
				) : (
					<LandedLine landed={picker.landed} />
				)}
			</div>
		</PickerStage>
	);
}
