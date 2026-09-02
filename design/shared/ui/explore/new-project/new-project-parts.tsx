import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type Dir, HOME, shortPath } from "shared/lib/spool/picker-disk";
import { cn } from "shared/lib/utils";
import { CheckIcon, FolderIcon } from "shared/ui/spool/icons";
import { Name, type Picker, ProjectChip, type Row, usePicker, Where } from "shared/ui/spool/picker-parts";

/**
 * What the four takes of "new project" share ([#242](https://github.com/liamvinberg/spool/issues/242)).
 *
 * The picker only registers folders that already exist, so the person who
 * arrives through the app without a repo has nothing to pick. Every take below
 * adds the one missing verb — make the folder, run the one init scaffold, open
 * the tab — and they differ only in where that verb sits and, because of where
 * it sits, which folder the new project lands in. `usePicker` still owns the
 * disk and the keyboard; this hook only adds the name being typed and the
 * folder that came out.
 *
 * Two things are inert here, the same two that are inert in the picker takes:
 * a frame has no canvas behind it, so nothing can actually open. Creation
 * answers by putting the folder in the list it would really appear in, wearing
 * the chip a project wears, and printing what it would have opened.
 */

export const ROW = 34;
/** #242's default when the location is a field rather than the place you stand */
export const SPOOL_HOME = `${HOME}/Spool`;

export type Mode = "browse" | "naming" | "asking" | "made";

export interface Made {
	readonly parent: string;
	readonly name: string;
	readonly path: string;
}

export interface NewProject {
	readonly picker: Picker;
	/** the browse rows with the folder just created folded into its sorted place */
	readonly rows: readonly Row[];
	/** where the created folder sits in `rows`, so a take can light it without counting */
	readonly madeAt: number | null;
	readonly mode: Mode;
	readonly name: string;
	readonly setName: (next: string) => void;
	readonly made: Made | null;
	readonly nameRef: React.RefObject<HTMLInputElement | null>;
	readonly begin: (mode: Exclude<Mode, "browse" | "made">) => void;
	readonly cancel: () => void;
	readonly create: (parent: string) => void;
	readonly onNameKeyDown: (event: React.KeyboardEvent, parent: string) => void;
}

export interface Start {
	/** the folder the picker is browsing when the frame opens */
	readonly path?: string;
	/** a query already typed, for the takes whose answer is the query */
	readonly query?: string;
	readonly mode?: Mode;
	readonly name?: string;
	/** the folder this frame is showing the moment after, and where it was made */
	readonly made?: string;
}

export function useNewProject(start: Start = {}): NewProject {
	const picker = usePicker(start.query ?? "");
	const [mode, setMode] = useState<Mode>(start.mode ?? "browse");
	const [name, setName] = useState(start.name ?? "");
	const [made, setMade] = useState<Made | null>(
		start.made === undefined || start.name === undefined
			? null
			: { parent: start.made, name: start.name, path: `${start.made}/${start.name}` },
	);
	const nameRef = useRef<HTMLInputElement | null>(null);
	const seeded = useRef(false);

	// the frame opens where the state it is showing would have happened
	// biome-ignore lint/correctness/useExhaustiveDependencies: a seed, not a sync
	useEffect(() => {
		if (seeded.current) return;
		seeded.current = true;
		if (start.path !== undefined) picker.browse(start.path);
		if (start.query !== undefined) picker.setQuery(start.query);
	}, []);

	// declared after usePicker's own focus, so the field being typed into wins
	useEffect(() => {
		if (mode === "naming" || mode === "asking") nameRef.current?.focus();
	}, [mode]);

	const create = useCallback(
		(parent: string) => {
			const trimmed = name.trim();
			if (trimmed === "") return;
			setMade({ parent, name: trimmed, path: `${parent}/${trimmed}` });
			setMode("made");
		},
		[name],
	);

	const rows = useMemo<readonly Row[]>(() => {
		if (made === null) return picker.rows;
		const fresh: Row = { dir: dirOf(made), matched: [] };
		// a folder you just made and are still searching for is the answer, so it goes first
		if (picker.searching) return [fresh, ...picker.rows];
		if (made.parent !== picker.path) return picker.rows;
		const before = picker.rows.filter((row) => row.dir.name.localeCompare(fresh.dir.name) < 0);
		return [...before, fresh, ...picker.rows.slice(before.length)];
	}, [made, picker.rows, picker.searching, picker.path]);

	const madeAt = made === null ? null : rows.findIndex((row) => row.dir.path === made.path);

	return {
		picker,
		rows,
		madeAt: madeAt === null || madeAt < 0 ? null : madeAt,
		mode,
		name,
		setName,
		made,
		nameRef,
		begin: (next) => {
			setMade(null);
			setMode(next);
		},
		cancel: () => {
			setMode("browse");
			setName("");
			picker.inputRef.current?.focus();
		},
		create,
		onNameKeyDown: (event, parent) => {
			if (event.key === "Enter") {
				event.preventDefault();
				create(parent);
			} else if (event.key === "Escape") {
				event.preventDefault();
				setMode("browse");
				setName("");
			}
		},
	};
}

/** a folder that did not exist a second ago, as the picker would have read it off disk */
function dirOf(made: Made): Dir {
	return {
		name: made.name,
		path: made.path,
		parent: made.parent,
		isProject: true,
		frames: 0,
		opened: "just now",
		depth: made.path.slice(HOME.length + 1).split("/").length,
	};
}

/** `~/personal/projects/tvarso`, or the folder alone while nothing is typed */
export function targetPath(parent: string, name: string): string {
	return name.trim() === "" ? shortPath(parent) : `${shortPath(parent)}/${name.trim()}`;
}

/**
 * The row that offers the verb: the same 34px, the same glyph, one shade
 * quieter than a folder that is actually there.
 */
export function OfferRow({
	label,
	hint,
	picked,
	onPress,
	children,
}: {
	label: React.ReactNode;
	hint?: string | undefined;
	picked: boolean;
	onPress: () => void;
	children?: React.ReactNode;
}) {
	return (
		<button
			type="button"
			onClick={onPress}
			style={{ height: ROW }}
			className={cn(
				"relative flex w-full items-center gap-3 px-4 text-left transition-colors duration-100",
				picked && "bg-raised",
			)}
		>
			{picked ? <span className="absolute top-1 bottom-1 left-0 w-[2px] rounded-full bg-thread" /> : null}
			<FolderIcon className={cn("h-3 w-3 shrink-0", picked ? "text-thread/70" : "text-muted/30")} />
			<span className="min-w-0 shrink-0 truncate text-base leading-base text-muted">{label}</span>
			{children ?? <span className="flex-1" />}
			{hint === undefined ? null : (
				<span className="shrink-0 font-mono text-2xs text-muted/45 leading-3">{hint}</span>
			)}
		</button>
	);
}

/** the field a name is typed into, wherever a take puts it */
export function NameField({
	np,
	parent,
	placeholder = "name the project",
	className,
}: {
	np: NewProject;
	parent: string;
	placeholder?: string | undefined;
	className?: string | undefined;
}) {
	return (
		<input
			ref={np.nameRef}
			value={np.name}
			spellCheck={false}
			autoComplete="off"
			placeholder={placeholder}
			aria-label="Project name"
			onChange={(event) => np.setName(event.target.value)}
			onKeyDown={(event) => np.onNameKeyDown(event, parent)}
			className={cn(
				"min-w-0 flex-1 bg-transparent font-mono text-md text-text leading-md caret-thread outline-none placeholder:text-muted/45",
				className,
			)}
		/>
	);
}

/** where the folder will land, printed while it is still being named */
export function Target({ parent, name, className }: { parent: string; name: string; className?: string }) {
	const path = targetPath(parent, name);
	const cut = path.lastIndexOf("/");
	return (
		<span className={cn("shrink-0 truncate font-mono text-2xs leading-3", className)}>
			<span className="text-muted/45">{`${path.slice(0, cut + 1)}`}</span>
			<span className={name.trim() === "" ? "text-muted/45" : "text-text"}>{path.slice(cut + 1)}</span>
		</span>
	);
}

/** what creation did, in the register the machine prints it in */
export function MadeLine({ made, className }: { made: Made; className?: string }) {
	return (
		<span className={cn("flex min-w-0 items-center gap-2 font-mono text-2xs leading-3", className)}>
			<CheckIcon className="h-3 w-3 shrink-0 text-thread" />
			<span className="truncate text-muted">
				{"created "}
				<span className="text-text">{shortPath(made.path)}</span>
				{" · opening it"}
			</span>
		</span>
	);
}

/** one of the two places a folder could land, chosen the way a row is chosen */
export function ChoiceRow({
	path,
	note,
	picked,
	onPress,
}: {
	path: string;
	note: string;
	picked: boolean;
	onPress: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onPress}
			style={{ height: ROW }}
			className={cn(
				"relative flex w-full items-center gap-3 px-4 text-left transition-colors duration-100",
				picked ? "bg-raised" : "hover:bg-raised/50",
			)}
		>
			{picked ? <span className="absolute top-1 bottom-1 left-0 w-[2px] rounded-full bg-thread" /> : null}
			<FolderIcon className={cn("h-3 w-3 shrink-0", picked ? "text-thread/70" : "text-muted/30")} />
			<span className={cn("min-w-0 truncate font-mono text-xs leading-xs", picked ? "text-text" : "text-muted")}>
				{path}
			</span>
			<span className="flex-1" />
			<span className="shrink-0 font-mono text-2xs text-muted/45 leading-3">{note}</span>
		</button>
	);
}

/** the label a field carries when a take asks for two things at once */
export function AskLabel({ children }: { children: React.ReactNode }) {
	return <span className="w-16 shrink-0 font-mono text-2xs text-muted/45 leading-3">{children}</span>;
}

/**
 * A folder as the shipped list draws it. Lifted out of `picker-search` so all
 * four takes below argue about the new row rather than about the old ones.
 */
export function DiskRow({
	row,
	index,
	picked,
	searching,
	dim = false,
	onPoint,
	onEnter,
}: {
	row: Row;
	index: number;
	picked: boolean;
	searching: boolean;
	/** the list is still the context while a name is being typed, but it is not the subject */
	dim?: boolean | undefined;
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
				"relative flex w-full items-center gap-3 px-4 text-left transition-[background-color,opacity] duration-150",
				picked && "bg-raised",
				dim && "opacity-35",
			)}
		>
			{picked ? <span className="absolute top-1 bottom-1 left-0 w-[2px] rounded-full bg-thread" /> : null}
			<FolderIcon className={cn("h-3 w-3 shrink-0", row.dir.isProject ? "text-thread/70" : "text-muted/30")} />
			<Name name={row.dir.name} matched={row.matched} className="min-w-0 shrink-0 truncate text-base leading-base" />
			{searching ? <Where dir={row.dir} className="min-w-0 flex-1" /> : <span className="flex-1" />}
			{row.dir.isProject ? <ProjectChip dir={row.dir} /> : null}
		</button>
	);
}
