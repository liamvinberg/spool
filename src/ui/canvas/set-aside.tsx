import { type ReactNode, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
	compareSetAside,
	dismissSetAside,
	fetchSetAside,
	putSetAsideBack,
	type SetAsideCompare,
	type ShownSetAside,
} from "../api";
import { HOME_ACTION } from "../home-actions";
import { attachHotkeyLayer } from "../hotkey-dispatch";

/**
 * Set-aside marks on a team project's canvas.
 *
 * When this machine's save reaches the team after a teammate's to the same file, the team keeps the teammate's
 * and this machine's disk takes it. Only this machine is told, on each frame that renders the file: what happened,
 * whose save stands, and three ways on. Compare shows both sides. Put mine back writes this machine's side again,
 * which travels as an ordinary new save on top. Hand to agent starts a turn on the agent with both sides, and
 * only when pressed: nothing reaches an agent on its own. A delete of this machine's that a teammate's edit
 * undid is marked the same way, since an edit beats a delete.
 *
 * Coming back from offline can set many saves aside at once. More than a handful together are one summary
 * instead of a mark on every frame, and so is a file no frame renders.
 */

/** More marks than this arriving together are one summary. */
export const SET_ASIDE_HANDFUL = 3;

/** What the agent is asked when a mark is handed to it: both sides, by path, and what to do with them. */
export function setAsideAsk(mark: ShownSetAside): string {
	const file = `design/${mark.path}`;
	const who = mark.by ?? "a teammate";
	if (mark.kind === "restored")
		return `I deleted ${file} in this team project, and ${who}'s edit brought it back: an edit beats a delete. Read their version in ${file} and tell me whether it should still go; if it should, delete it again.`;
	if (mark.deleted || mark.file === null)
		return `My delete of ${file} was set aside: ${who}'s edit reached the team first, so the file stayed. Read their version in ${file} and tell me whether it should still go; if it should, delete it again.`;
	return `My change to ${file} was set aside: ${who}'s save reached the team first, and the file now has their version. My version is in ${mark.file}. Redo my change on top of the team's version in ${file}, keeping their work.`;
}

/** The one line a mark says. */
function setAsideSays(mark: ShownSetAside): string {
	const whose = mark.by === null ? "A teammate's" : `${mark.by}'s`;
	if (mark.kind === "restored") return `Your delete was undone. ${whose} edit brought it back.`;
	if (mark.deleted) return `Your delete was set aside. ${whose} edit arrived first.`;
	return `Your change was set aside. ${whose} arrived first.`;
}

interface Acts {
	compare(mark: ShownSetAside): void;
	putBack(mark: ShownSetAside): void;
	hand(mark: ShownSetAside): void;
	dismiss(mark: ShownSetAside): void;
}

export interface CanvasSetAside {
	/** The mark on one frame's label, when this machine has one there. */
	label(frame: string): ReactNode | undefined;
	/** The summary and Compare, drawn over the canvas. */
	node: ReactNode;
}

/**
 * The project's marks, read when the canvas opens, when sync says they changed (the `set-aside` change event,
 * passed on as `spool-set-aside-change`), and when the window comes back to the front.
 */
export function useSetAside(project: string, hand: (mark: ShownSetAside) => void): CanvasSetAside {
	const [marks, setMarks] = useState<ShownSetAside[]>([]);
	const [comparing, setComparing] = useState<{ mark: ShownSetAside; sides: SetAsideCompare } | null>(null);
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

	const acts = useMemo<Acts>(
		() => ({
			compare: (mark) =>
				void compareSetAside(project, mark.id).then((sides) => {
					if (sides !== undefined) setComparing({ mark, sides });
				}),
			putBack: (mark) => {
				setMarks((current) => current.filter((held) => held.id !== mark.id));
				void putSetAsideBack(project, mark.id).then(refresh);
			},
			hand,
			dismiss: (mark) => {
				setMarks((current) => current.filter((held) => held.id !== mark.id));
				void dismissSetAside(project, mark.id).then(refresh);
			},
		}),
		[project, hand, refresh],
	);

	const { onFrames, summary } = useMemo(() => {
		const onFrames = new Map<string, ShownSetAside[]>();
		const summary: ShownSetAside[] = [];
		for (const mark of marks) {
			if (mark.frames.length === 0 || mark.together > SET_ASIDE_HANDFUL) {
				summary.push(mark);
				continue;
			}
			for (const frame of mark.frames) onFrames.set(frame, [...(onFrames.get(frame) ?? []), mark]);
		}
		return { onFrames, summary };
	}, [marks]);

	return {
		label: (frame) => {
			const here = onFrames.get(frame);
			return here === undefined ? undefined : <SetAsideMark marks={here} acts={acts} />;
		},
		node: (
			<>
				{summary.length > 0 && <SetAsideSummary marks={summary} acts={acts} />}
				{comparing !== null && (
					<SetAsideCompareDialog
						mark={comparing.mark}
						sides={comparing.sides}
						onClose={() => setComparing(null)}
					/>
				)}
			</>
		),
	};
}

/** The mark on a frame's label: a word that opens what happened and what can be done. */
function SetAsideMark({ marks, acts }: { marks: readonly ShownSetAside[]; acts: Acts }) {
	const [open, setOpen] = useState(false);
	// an action answers the mark, so the note closes behind it; Compare is a look, and keeps it
	const answered = useMemo<Acts>(
		() => ({
			compare: acts.compare,
			putBack: (mark) => {
				setOpen(false);
				acts.putBack(mark);
			},
			hand: (mark) => {
				setOpen(false);
				acts.hand(mark);
			},
			dismiss: (mark) => {
				setOpen(false);
				acts.dismiss(mark);
			},
		}),
		[acts],
	);
	return (
		<>
			<button
				type="button"
				data-set-aside-mark=""
				aria-expanded={open}
				className="shrink-0 rounded-xs border border-border-raised bg-raised px-1.5 text-text type-detail hover:bg-control"
				onPointerDown={(event) => event.stopPropagation()}
				onDoubleClick={(event) => event.stopPropagation()}
				onClick={(event) => {
					event.stopPropagation();
					setOpen((was) => !was);
				}}
			>
				set aside
			</button>
			{open && (
				<div
					role="dialog"
					aria-label="Set aside"
					className="absolute top-full left-0 z-10 mt-1 flex w-[380px] flex-col gap-3 whitespace-normal rounded-md border border-border-raised bg-raised p-3"
					onPointerDown={(event) => event.stopPropagation()}
					onDoubleClick={(event) => event.stopPropagation()}
					onWheel={(event) => event.stopPropagation()}
					onKeyDown={(event) => {
						if (event.key === "Escape") setOpen(false);
					}}
				>
					{marks.map((mark) => (
						<SetAsideNote key={mark.id} mark={mark} acts={answered} />
					))}
				</div>
			)}
		</>
	);
}

/** One mark's line, its file, and its actions. */
function SetAsideNote({ mark, acts, compact = false }: { mark: ShownSetAside; acts: Acts; compact?: boolean }) {
	return (
		<div data-set-aside={mark.path} className="flex flex-col gap-2">
			{!compact && <p className="text-text type-control">{setAsideSays(mark)}</p>}
			<div className="flex items-baseline justify-between gap-2">
				<span className="min-w-0 truncate text-muted type-value">{mark.path}</span>
				<button
					type="button"
					aria-label={`Dismiss ${mark.path}`}
					className="shrink-0 text-muted type-detail hover:text-text"
					onClick={() => acts.dismiss(mark)}
				>
					Dismiss
				</button>
			</div>
			<div className="flex flex-wrap gap-1.5">
				<button type="button" className={HOME_ACTION} onClick={() => acts.compare(mark)}>
					Compare
				</button>
				<button type="button" className={HOME_ACTION} onClick={() => acts.putBack(mark)}>
					Put mine back
				</button>
				<button type="button" className={HOME_ACTION} onClick={() => acts.hand(mark)}>
					Hand to agent
				</button>
			</div>
		</div>
	);
}

/** Many at once: one card instead of a mark on every frame. */
function SetAsideSummary({ marks, acts }: { marks: readonly ShownSetAside[]; acts: Acts }) {
	const count = marks.length === 1 ? "1 of your changes was" : `${marks.length} of your changes were`;
	return (
		<section
			aria-label="Set aside"
			data-set-aside-summary=""
			className="-translate-x-1/2 absolute top-4 left-1/2 z-30 flex max-h-[60vh] w-[440px] flex-col gap-3 overflow-auto rounded-md border border-border-raised bg-raised p-3.5"
			onPointerDown={(event) => event.stopPropagation()}
			onWheel={(event) => event.stopPropagation()}
		>
			<div className="flex items-baseline justify-between gap-3">
				<p className="text-text type-control">{count} set aside: teammates' saves reached the team first.</p>
				<button
					type="button"
					className="shrink-0 text-muted type-detail hover:text-text"
					onClick={() => {
						for (const mark of marks) acts.dismiss(mark);
					}}
				>
					Dismiss all
				</button>
			</div>
			{marks.map((mark) => (
				<SetAsideNote key={mark.id} mark={mark} acts={acts} compact />
			))}
		</section>
	);
}

/** Both sides of a set-aside file, side by side. */
function SetAsideCompareDialog({
	mark,
	sides,
	onClose,
}: {
	mark: ShownSetAside;
	sides: SetAsideCompare;
	onClose: () => void;
}) {
	const id = useId();
	const dialogRef = useRef<HTMLDialogElement>(null);
	useLayoutEffect(() => {
		const dialog = dialogRef.current;
		const previous = document.activeElement;
		dialog?.showModal();
		return () => {
			dialog?.close();
			if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
		};
	}, []);
	useEffect(() => attachHotkeyLayer({ scope: "dialog", handlers: {} }), []);
	return (
		<dialog
			ref={dialogRef}
			aria-labelledby={`${id}-title`}
			className="m-auto flex max-h-[calc(100dvh-64px)] w-[min(1100px,calc(100vw-64px))] flex-col gap-4 rounded-[8px] border border-border-raised bg-surface p-6 text-text backdrop:[background:color-mix(in_srgb,var(--color-bg)_70%,transparent)]"
			onCancel={(event) => {
				event.preventDefault();
				onClose();
			}}
		>
			<div className="flex items-baseline justify-between gap-4">
				<h2 id={`${id}-title`} className="text-text type-control">
					Compare <span className="text-muted type-value">{mark.path}</span>
				</h2>
				<button type="button" className={HOME_ACTION} onClick={onClose}>
					Close
				</button>
			</div>
			<div className="grid min-h-0 flex-1 grid-cols-2 gap-4">
				<CompareSide title="Yours, set aside" side={sides.mine} />
				<CompareSide title={mark.by === null ? "The team's" : `The team's, from ${mark.by}`} side={sides.team} />
			</div>
		</dialog>
	);
}

function CompareSide({ title, side }: { title: string; side: SetAsideCompare["mine"] }) {
	return (
		<section aria-label={title} className="flex min-h-0 flex-col gap-2">
			<h3 className="text-muted type-detail">{title}</h3>
			<pre className="min-h-[120px] flex-1 overflow-auto rounded-md border border-border-raised bg-bg p-3 text-text type-value whitespace-pre">
				{side === null ? "deleted" : (side.text ?? `${side.size} bytes, not text`)}
			</pre>
		</section>
	);
}
