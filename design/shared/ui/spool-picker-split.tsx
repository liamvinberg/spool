import { cn } from "shared/lib/utils";
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
} from "shared/ui/spool-picker-parts";

/**
 * Take three: browsing and searching keep their own rows.
 *
 * Two ways in, neither hidden behind the other. The top row is where you are —
 * up one, and a breadcrumb whose every segment is a press, so getting back to
 * `~` is one click rather than four. The second row is the field. They never
 * trade places, so the dialog does not change shape as you type and the folder
 * you are standing in is readable the whole time.
 *
 * It costs a row of height, and buys the thing the other takes give up: search
 * and browse are equals, and a person who never types still gets the faster
 * climb out.
 */

const ROW = 34;

export function SpoolPickerSplit() {
	const picker = usePicker();

	return (
		<PickerStage width={600}>
			<div className="flex h-10 shrink-0 items-center gap-2.5 border-border border-b px-3">
				<UpButton picker={picker} />
				<Crumbs picker={picker} className="flex-1" />
				<Readout picker={picker} />
			</div>

			<div
				className={cn(
					"flex h-11 shrink-0 items-center gap-3 border-border border-b px-4 transition-colors",
					picker.searching && "bg-canvas/40",
				)}
			>
				<Field picker={picker} placeholder="search every folder under ~" />
			</div>

			{picker.searching ? null : (
				<div className="flex h-9 shrink-0 items-center gap-1.5 border-border border-b px-3">
					<JumpRow picker={picker} />
				</div>
			)}

			<ListBox picker={picker} min={204} max={360}>
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
					<Hints className="flex-1" hints={["↑↓ moves", "↵ opens or goes in", "⌫ goes up"]} />
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
