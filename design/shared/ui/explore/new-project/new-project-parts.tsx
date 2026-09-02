import { useCallback, useEffect, useRef, useState } from "react";
import { shortPath } from "shared/lib/spool/picker-disk";
import { cn } from "shared/lib/utils";
import { FolderIcon } from "shared/ui/spool/icons";
import { type Picker, usePicker } from "shared/ui/spool/picker-parts";
import { PathPrefix, ROW, type Seed, useAt } from "shared/ui/explore/picker/picker-min";

/**
 * Making the folder from inside spool ([#242](https://github.com/liamvinberg/spool/issues/242)).
 *
 * The picker only registers folders that already exist, so the first thing a
 * person without a repo has to do is leave spool, open Finder, make a folder,
 * come back and point at it. Both shapes below put that one missing verb inside
 * the picker that won on 2026-09-02 — one field, a list, nothing else — and
 * neither of them adds a band to it.
 *
 * The folder lands where the field's prefix says, which is the folder you are
 * standing in. There is no second answer to argue about: the prefix is already
 * on screen saying where you are, so a location field would be repeating it.
 *
 * Inert here, and only this: a frame has no canvas behind it, so `--created` is
 * a second frame rather than a transition.
 */

export interface NewProject {
	readonly picker: Picker;
	readonly naming: boolean;
	/** Enter landed on a plain folder: the offer to scaffold it is standing */
	readonly initing: boolean;
	readonly name: string;
	readonly nameRef: React.RefObject<HTMLInputElement | null>;
	readonly begin: () => void;
	readonly setName: (next: string) => void;
	readonly onNameKeyDown: (event: React.KeyboardEvent) => void;
}

export interface NewSeed extends Seed {
	readonly naming?: boolean;
	readonly name?: string;
	/** the frame opens on the answer Enter gets from a folder spool does not know */
	readonly init?: boolean;
}

export function useNewProject(seed: NewSeed = {}): NewProject {
	const picker = usePicker();
	useAt(picker, seed.path, seed.query);
	const [naming, setNaming] = useState(seed.naming ?? false);
	const [name, setName] = useState(seed.name ?? "");
	const nameRef = useRef<HTMLInputElement | null>(null);

	// declared after usePicker's own focus, so the field being typed into wins
	useEffect(() => {
		if (naming) nameRef.current?.focus();
	}, [naming]);

	const stop = useCallback(() => {
		setNaming(false);
		setName("");
		picker.inputRef.current?.focus();
	}, [picker]);

	return {
		picker,
		naming,
		initing: (seed.init ?? false) || picker.landed?.kind === "init",
		name,
		nameRef,
		begin: () => setNaming(true),
		setName,
		onNameKeyDown: (event) => {
			if (event.key === "Escape") {
				event.preventDefault();
				stop();
			}
		},
	};
}

/** `~/personal/projects/tvarso`, the folder greyed and the name lit */
export function Target({ parent, name }: { parent: string; name: string }) {
	const typed = name.trim();
	return (
		<span className="min-w-0 truncate font-mono text-md leading-md">
			<span className="text-muted/45">{`${shortPath(parent)}/`}</span>
			<span className={typed === "" ? "text-muted/45" : "text-text"}>{typed === "" ? "" : typed}</span>
		</span>
	);
}

/**
 * The offer, drawn as a row.
 *
 * Same height, same glyph, same gaps as a folder that is actually there, one
 * shade quieter. The list is where you answer "which folder", and a folder that
 * does not exist yet is one more answer to that.
 */
export function OfferRow({
	label,
	hint,
	picked,
	onPress,
}: {
	label: React.ReactNode;
	hint?: string | undefined;
	picked: boolean;
	onPress: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onPress}
			style={{ height: ROW }}
			className={cn(
				"relative flex w-full items-center gap-3 px-4 text-left transition-colors duration-100 hover:bg-raised",
				picked && "bg-raised",
			)}
		>
			{picked ? <span className="absolute top-1 bottom-1 left-0 w-[2px] rounded-full bg-thread" /> : null}
			<FolderIcon className={cn("h-3 w-3 shrink-0", picked ? "text-thread/70" : "text-muted/30")} />
			<span className="min-w-0 shrink truncate text-base text-muted leading-base">{label}</span>
			<span className="flex-1" />
			{hint === undefined ? null : (
				<span className="shrink-0 font-mono text-2xs text-muted/45 leading-3">{hint}</span>
			)}
		</button>
	);
}

/**
 * The field while a project is being named.
 *
 * The prefix does not move, because it is still the location: the only thing
 * that changed is which word the caret is putting after it. The glyph goes
 * thread-coloured, which is the whole announcement that the field means
 * something else now.
 */
export function NamingField({ np }: { np: NewProject }) {
	return (
		<label className="flex h-[52px] shrink-0 items-center px-4">
			<FolderIcon className="mr-2 h-3 w-3 shrink-0 text-thread" />
			<PathPrefix picker={np.picker} />
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
		</label>
	);
}

/** the list, collapsed to the one line the folder is about to be */
export function NameLine({ np }: { np: NewProject }) {
	return (
		<div className="py-1.5">
			<div style={{ height: ROW }} className="relative flex w-full items-center gap-3 bg-raised px-4">
				<span className="absolute top-1 bottom-1 left-0 w-[2px] rounded-full bg-thread" />
				<FolderIcon className="h-3 w-3 shrink-0 text-thread/70" />
				<Target parent={np.picker.path} name={np.name} />
				<span className="flex-1" />
				<span className="shrink-0 font-mono text-2xs text-muted/45 leading-3">↵ creates</span>
			</div>
		</div>
	);
}

/**
 * What the picker says when Enter lands on a folder it does not recognise.
 *
 * The shipped dialog says this in its footer. There is no footer here, so it is
 * one line in the list area, and it is the only place the offer appears: a
 * standing `initialize design/ here` row in every browse was an answer to a
 * question nobody had asked yet.
 */
export function InitLine() {
	return (
		<div
			style={{ height: ROW }}
			className="flex w-full items-center gap-2.5 px-4 font-mono text-2xs leading-3"
		>
			<FolderIcon className="h-3 w-3 shrink-0 text-muted/30" />
			<span className="shrink-0 text-muted/55">not a spool project</span>
			<span className="text-muted/25">·</span>
			<span className="shrink-0 text-muted">↵ initializes design/ here</span>
			<span className="text-muted/25">·</span>
			<span className="shrink-0 text-muted/55">esc goes back</span>
		</div>
	);
}
