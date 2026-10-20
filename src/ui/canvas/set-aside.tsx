import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { dismissSetAside, fetchSetAside, putSetAsideBack, type ShownSetAside } from "../api";
import { TextAction, Toast } from "../primitives/feedback";

/**
 * A team project's clashes, said on its canvas as one notice.
 *
 * When this machine's save reaches the team after a teammate's to the same file, the sync merges the two the way
 * git would, and nobody hears of it. Only where both changed the same lines does a save stay set aside: the team
 * keeps the teammate's, this machine's disk takes it, and this machine alone is told, once for all such files, with
 * three ways on. Use theirs lets this machine's side go. Use mine writes it again, which travels as an ordinary new
 * save on top. Ask agent to fix starts one new thread with every file in it, and only when pressed: nothing reaches
 * an agent on its own. A delete of this machine's that a teammate's edit undid is told the same way, since an edit
 * beats a delete.
 */

/** What the agent is asked: every clashed file, where both sides are, and what to do with them. */
export function setAsideAsk(marks: readonly ShownSetAside[]): string {
	const lines = marks.map((mark) => {
		const file = `design/${mark.path}`;
		const who = mark.by ?? "a teammate";
		if (mark.kind === "restored" || mark.deleted || mark.file === null)
			return `- ${file}: I deleted it and ${who} edited it, so it stayed. Read their version and tell me whether it should still go; if it should, delete it again.`;
		return `- ${file}: ${who}'s version is in the file now. Mine is in ${mark.file}.`;
	});
	return [
		"My changes to these files in this team project clashed with a teammate's: we both changed the same lines, and theirs reached the team first.",
		"",
		...lines,
		"",
		"Redo each of my changes on top of the team's version in the file, keeping their work.",
	].join("\n");
}

/** The notice's one line: who, and what both changed. */
export function setAsideSays(marks: readonly ShownSetAside[]): string {
	const names = new Set(marks.map((mark) => mark.by));
	const [only] = names;
	const who = names.size === 1 && only != null ? `You and ${only}` : "You and a teammate";
	const [first] = marks;
	const frames = new Set(marks.flatMap((mark) => mark.frames));
	let what: string;
	if (marks.length === 1 && first !== undefined)
		what = first.frames.length === 1 ? (first.frames[0] ?? first.path) : first.path;
	else if (frames.size > 0 && marks.every((mark) => mark.frames.length > 0))
		what = `${frames.size} ${frames.size === 1 ? "frame" : "frames"}`;
	else what = `${marks.length} files`;
	return `${who} both changed ${what}`;
}

export interface SetAsideFix {
	/** What the third action says: the agent fixes it, or, with no agent on this machine, its prompt is copied. */
	label: string;
	run(marks: readonly ShownSetAside[]): void;
}

/**
 * The project's clashes, read when the canvas opens, when sync says they changed (the `set-aside` change event,
 * passed on as `spool-set-aside-change`), and when the window comes back to the front. The notice, or nothing.
 */
export function useSetAside(project: string, fix: SetAsideFix): ReactNode {
	const [marks, setMarks] = useState<ShownSetAside[]>([]);
	// closed for now: it comes back when the canvas opens again, or another clash arrives
	const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
	const revision = useRef(0);

	const refresh = useCallback(() => {
		const asked = ++revision.current;
		void fetchSetAside(project).then((next) => {
			if (asked === revision.current) setMarks(next);
		});
	}, [project]);

	useEffect(() => {
		refresh();
		window.addEventListener("spool-set-aside-change", refresh);
		window.addEventListener("focus", refresh);
		return () => {
			revision.current++;
			window.removeEventListener("spool-set-aside-change", refresh);
			window.removeEventListener("focus", refresh);
		};
	}, [refresh]);

	const shown = useMemo(() => marks.filter((mark) => !hidden.has(mark.id)), [marks, hidden]);
	if (shown.length === 0) return null;
	/** Answer every mark the notice stands for, at once. */
	const answer = (act: (project: string, id: string) => Promise<boolean>) => {
		const ids = new Set(shown.map((mark) => mark.id));
		setMarks((current) => current.filter((mark) => !ids.has(mark.id)));
		void Promise.all(shown.map((mark) => act(project, mark.id))).then(refresh);
	};
	return (
		<SetAsideNotice
			marks={shown}
			fixLabel={fix.label}
			onTheirs={() => answer(dismissSetAside)}
			onMine={() => answer(putSetAsideBack)}
			onFix={() => fix.run(shown)}
			onClose={() => setHidden((was) => new Set([...was, ...shown.map((mark) => mark.id)]))}
		/>
	);
}

export function SetAsideNotice({
	marks,
	fixLabel,
	onTheirs,
	onMine,
	onFix,
	onClose,
}: {
	marks: readonly ShownSetAside[];
	fixLabel: string;
	onTheirs: () => void;
	onMine: () => void;
	onFix: () => void;
	onClose: () => void;
}) {
	return (
		<Toast
			data-set-aside=""
			className="max-w-sheet"
			// one line: the actions are what wrap first, never the sentence
			message={<span className="whitespace-nowrap">{setAsideSays(marks)}</span>}
			action={
				<>
					<TextAction onClick={onTheirs}>Use theirs</TextAction>
					<TextAction onClick={onMine}>Use mine</TextAction>
					<TextAction onClick={onFix}>{fixLabel}</TextAction>
				</>
			}
			onDismiss={onClose}
		/>
	);
}
