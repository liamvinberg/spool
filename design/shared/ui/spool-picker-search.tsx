import { cn } from "../lib/utils";
import {
	Crumbs,
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
	UpButton,
	usePicker,
	Where,
} from "./spool-picker-parts";

/**
 * Take one: the field is the header.
 *
 * The path was in that slot because there was nothing else to put there. Once
 * search reaches the whole tree the path stops being the thing you steer with,
 * so it moves down a row into a breadcrumb you press, and the row your caret
 * already sits in is the one that answers typing. Everything else is the picker
 * you have: the same list, the same two buttons, one level while nothing is
 * typed.
 *
 * The breadcrumb stays visible while searching rather than hiding, because a
 * result that lands you three folders deeper has to leave you somewhere you can
 * read afterwards.
 */

const ROW = 34;

export function SpoolPickerSearch() {
	const picker = usePicker();

	return (
		<PickerStage width={600}>
			<div className="flex h-12 shrink-0 items-center gap-3 border-border border-b px-4">
				<UpButton picker={picker} />
				<Field picker={picker} placeholder="search every folder under ~" />
				<Readout picker={picker} />
			</div>

			<div className="flex h-9 shrink-0 items-center gap-3 border-border border-b bg-canvas/40 px-4">
				<Crumbs picker={picker} />
			</div>

			<ListBox picker={picker} min={204} max={390}>
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

			{picker.searching ? null : (
				<div className="flex h-10 shrink-0 items-center gap-3 border-border border-t px-4">
					<span className="shrink-0 font-mono text-2xs text-muted/45 leading-3">jump</span>
					<JumpRow picker={picker} />
				</div>
			)}

			<div className="flex h-12 shrink-0 items-center gap-3 border-border border-t px-4">
				{picker.landed === null ? (
					<Hints className="flex-1" hints={["↑↓ moves", "↵ opens or goes in", "→ goes in", "esc clears"]} />
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
