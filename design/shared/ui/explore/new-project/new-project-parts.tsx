import { useCallback, useEffect, useRef, useState } from "react";
import { shortPath } from "shared/lib/spool/picker-disk";
import { cn } from "shared/lib/utils";
import { FolderIcon } from "shared/ui/spool/icons";
import { type Picker, usePicker } from "shared/ui/spool/picker-parts";
import { ROW, type Seed, useAt } from "shared/ui/explore/picker/picker-min";

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
	readonly name: string;
	readonly nameRef: React.RefObject<HTMLInputElement | null>;
	readonly begin: () => void;
	readonly setName: (next: string) => void;
	readonly onNameKeyDown: (event: React.KeyboardEvent) => void;
}

export interface NewSeed extends Seed {
	readonly naming?: boolean;
	readonly name?: string;
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
				"relative flex w-full items-center gap-3 px-4 text-left transition-colors duration-100",
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
