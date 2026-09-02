import { cn } from "shared/lib/utils";
import { SearchIcon } from "shared/ui/spool/icons";
import {
	Field,
	Hints,
	LandedLine,
	ListBox,
	Name,
	Nothing,
	PickerStage,
	ProjectChip,
	Readout,
	UpButton,
	usePicker,
	Where,
} from "shared/ui/spool/picker-parts";

/**
 * Take five: the smallest change that still reaches the whole disk.
 *
 * One 224px field at the right end of the header the picker already has — the
 * same field Home puts in the same corner, the same width, the same `/` chip
 * (`src/ui/home.tsx`). Nothing moves, nothing is added, and the app teaches the
 * shape once instead of twice.
 *
 * While a query is live the path dims rather than leaving, because it is no
 * longer what the list is showing but it is still where ⌫ takes you back to.
 * The field's own width is the whole argument against this take: a result reads
 * `~/personal/projects` in the gutter of a 600px dialog while the thing you are
 * typing into is a quarter of that.
 */

const ROW = 34;

export function SpoolPickerInline() {
	const picker = usePicker();

	return (
		<PickerStage width={600}>
			<div className="flex h-12 shrink-0 items-center gap-3 border-border border-b px-4">
				<UpButton picker={picker} />
				<span
					className={cn(
						"min-w-0 flex-1 truncate font-mono text-xs leading-xs transition-colors",
						picker.searching ? "text-muted/35" : "text-muted",
					)}
				>
					{picker.path}
				</span>
				<label
					className={cn(
						"flex h-7 w-[224px] shrink-0 items-center gap-2 rounded-md border bg-canvas px-2.5 transition-colors",
						picker.searching ? "border-border-raised" : "border-border focus-within:border-border-raised",
					)}
				>
					<Field
						picker={picker}
						placeholder="Search folders"
						prompt={<SearchIcon className="h-3 w-3 shrink-0 text-muted" />}
						className="[&_input]:text-xs [&_input]:leading-xs"
					/>
					{picker.query === "" ? (
						<span className="shrink-0 font-mono text-2xs text-muted leading-none">/</span>
					) : null}
				</label>
			</div>

			<ListBox picker={picker} min={228} max={400}>
				{picker.rows.length === 0 ? (
					<Nothing picker={picker} />
				) : (
					picker.rows.map((row, index) => (
						<button
							key={row.dir.path}
							type="button"
							data-at={index}
							onMouseMove={() => picker.point(index)}
							onClick={() => picker.enter(index)}
							style={{ height: ROW }}
							className={cn(
								"relative flex w-full items-center gap-3 px-4 text-left transition-colors duration-100",
								index === picker.at && "bg-raised",
								index === picker.flashing && "bg-thread/15",
							)}
						>
							{index === picker.at ? (
								<span className="absolute top-1 bottom-1 left-0 w-[2px] rounded-full bg-thread" />
							) : null}
							<Name
								name={row.dir.name}
								matched={row.matched}
								className="min-w-0 shrink-0 truncate text-base leading-base"
							/>
							{picker.searching ? <Where dir={row.dir} className="min-w-0 flex-1" /> : <span className="flex-1" />}
							{row.dir.isProject ? <ProjectChip dir={row.dir} /> : null}
						</button>
					))
				)}
			</ListBox>

			<div className="flex h-12 shrink-0 items-center gap-3 border-border border-t px-4">
				{picker.landed === null ? (
					<div className="flex flex-1 items-center gap-4">
						<Readout picker={picker} />
						<Hints hints={["↑↓ moves", "↵ opens"]} />
					</div>
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
					Open this folder
				</button>
			</div>
		</PickerStage>
	);
}
