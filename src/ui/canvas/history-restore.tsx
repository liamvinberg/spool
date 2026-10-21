import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { accelLabel } from "../../runtime/platform-keys";
import {
	fetchRestorePlan,
	fetchStretchFiles,
	type HistoryScope,
	type HistoryStretch,
	type HistoryStretchFile,
	type RestoreAsk,
	type RestorePlan,
	restoreFromHistory,
} from "../api";
import { ConfirmDialog } from "../confirm-dialog";
import { Button } from "../primitives/actions";
import { TextAction, Toast } from "../primitives/feedback";
import { Menu, MenuItem } from "../primitives/overlays";
import { Checkbox } from "../primitives/selection";
import { HISTORY_CHANGE } from "./history-pane";
import {
	momentSays,
	questionSays,
	type RestoreTarget,
	restoredSays,
	restoreTargets,
	sharedSays,
	targetSays,
	undoOf,
} from "./history-restore-model";

/**
 * Restore in the History pane (spool#188), as #105's prototype draws it. Under an open stretch, Restore… puts back to
 * the stretch's end: in a frame's history that frame, in the project's a choice of each frame and page it touched
 * and the whole project, each with its file count. A file restores from its line, and a set-aside save is put back
 * from under it. One question asks first, offering a frame's changed shared files, off. The toast says it's done,
 * with Undo and ⌘Z; a restore's own row has Undo this restore. Both undo by restoring the same paths to just before.
 * Only an editor's canvas, whose copy follows its team, is given any of it: a viewer has no Restore anywhere.
 */

const UNDO_CHORD = `${accelLabel()}Z`;
/** How long the toast stands with its Undo: the trash toast's window, and a little more for reading the moment. */
const TOAST_MS = 8000;

/** What the pane hangs on a file's line and under a set-aside save. */
export interface FileRestore {
	/** on a file's line, in place of its count under the pointer */
	line: (file: HistoryStretchFile, stretch: HistoryStretch) => ReactNode;
	/** under a save the team set aside */
	setAside: (
		file: HistoryStretchFile,
		save: HistoryStretchFile["setAside"][number],
		stretch: HistoryStretch,
	) => ReactNode;
}

/** The question being asked: what goes back to which version, made when and ending whose saves. */
interface Asking {
	target: RestoreTarget;
	to: number;
	at: number;
	by: string;
}

interface Said {
	key: number;
	message: string;
	undo: RestoreAsk | null;
	error: boolean;
}

export function useRestoring(project: string) {
	const [asking, setAsking] = useState<Asking | null>(null);
	const [said, setSaid] = useState<Said | null>(null);
	const keys = useRef(0);
	const say = useCallback((next: Omit<Said, "key"> | null) => {
		setSaid(next === null ? null : { ...next, key: ++keys.current });
	}, []);
	useEffect(() => {
		if (said === null) return;
		const gone = setTimeout(() => setSaid(null), TOAST_MS);
		return () => clearTimeout(gone);
	}, [said]);

	/** Undo a restore: itself a restore, of the same paths to the version just before it. */
	const undo = useCallback(
		async (ask: RestoreAsk) => {
			try {
				await restoreFromHistory(project, ask);
				say(null);
			} catch (error) {
				say({ message: messageOf(error), undo: null, error: true });
			}
			window.dispatchEvent(new CustomEvent(HISTORY_CHANGE));
		},
		[project, say],
	);

	const ask = (target: RestoreTarget, to: number, at: number, by: string) => setAsking({ target, to, at, by });

	const actions = (stretch: HistoryStretch, scope: HistoryScope): ReactNode =>
		stretch.restore === null || stretch.restore === undefined ? (
			<RestoreButton
				project={project}
				stretch={stretch}
				scope={scope}
				onPick={(target) => ask(target, stretch.to, stretch.end, stretch.by.name)}
			/>
		) : (
			<Button
				size="sm"
				onClick={() =>
					void fetchStretchFiles(project, { kind: "project" }, stretch).then((files) => {
						if (files === null)
							say({ message: "The restore's files can't be read now.", undo: null, error: true });
						else
							void undo(
								undoOf(
									stretch,
									files.map((file) => file.path),
								),
							);
					})
				}
			>
				Undo this restore
			</Button>
		);

	const file: FileRestore = {
		line: (line, stretch) => (
			<TextAction onClick={() => ask({ kind: "file", target: line.path }, stretch.to, stretch.end, stretch.by.name)}>
				Restore
			</TextAction>
		),
		setAside: (line, save, stretch) => (
			<TextAction onClick={() => ask({ kind: "file", target: line.path }, save.version, save.at, stretch.by.name)}>
				Put back
			</TextAction>
		),
	};

	const question =
		asking === null ? null : (
			<RestoreQuestion
				key={`${asking.target.kind}\n${asking.target.target}\n${asking.to}`}
				project={project}
				asking={asking}
				onClose={() => setAsking(null)}
				onDone={(message, next) => {
					say({ message, undo: next, error: false });
					window.dispatchEvent(new CustomEvent(HISTORY_CHANGE));
				}}
			/>
		);

	const toast =
		said === null ? null : (
			<Toast
				key={said.key}
				data-restored=""
				message={said.message}
				tone={said.error ? "error" : "default"}
				action={
					said.undo === null ? undefined : (
						<TextAction
							onClick={() => {
								const next = said.undo;
								if (next !== null) void undo(next);
							}}
						>
							Undo
						</TextAction>
					)
				}
				keys={said.undo === null ? undefined : UNDO_CHORD}
				drain={said.undo === null ? undefined : TOAST_MS}
			/>
		);

	/** ⌘Z while the toast stands undoes the restore it says; false when there is none to undo. */
	const undoLast = () => {
		if (said?.undo === null || said === null) return false;
		void undo(said.undo);
		return true;
	};

	return { actions, file, question, toast, undoLast };
}

function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : "The restore couldn't be made. Try again.";
}

/** Restore…: one target as a button that names it, several as a menu, each with how many files go back. */
function RestoreButton({
	project,
	stretch,
	scope,
	onPick,
}: {
	project: string;
	stretch: HistoryStretch;
	scope: HistoryScope;
	onPick: (target: RestoreTarget) => void;
}) {
	const [open, setOpen] = useState(false);
	const [counts, setCounts] = useState<Map<string, number | null>>(new Map());
	const held = useRef<HTMLSpanElement>(null);
	const targets = restoreTargets(stretch, scope);
	const keyOf = (target: RestoreTarget) => `${target.kind}\n${target.target}`;
	// biome-ignore lint/correctness/useExhaustiveDependencies: counted once each time it opens
	useEffect(() => {
		if (!open) return;
		let live = true;
		for (const target of targets)
			void fetchRestorePlan(project, { ...target, to: stretch.to }).then((plan) => {
				if (live) setCounts((was) => new Map(was).set(keyOf(target), plan?.files ?? null));
			});
		const away = (event: PointerEvent) => {
			if (event.target instanceof Node && held.current?.contains(event.target)) return;
			setOpen(false);
		};
		const key = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			event.preventDefault();
			event.stopPropagation();
			setOpen(false);
		};
		document.addEventListener("pointerdown", away, true);
		window.addEventListener("keydown", key, true);
		return () => {
			live = false;
			document.removeEventListener("pointerdown", away, true);
			window.removeEventListener("keydown", key, true);
		};
	}, [open]);
	const [only] = targets;
	if (targets.length === 1 && only !== undefined)
		return (
			<Button size="sm" variant="primary" onClick={() => onPick(only)}>
				Restore {targetSays(only)}…
			</Button>
		);
	return (
		<span ref={held} className="relative">
			<Button size="sm" variant="primary" aria-expanded={open} onClick={() => setOpen(!open)}>
				Restore…
			</Button>
			{open ? (
				<Menu className="absolute top-full left-0 z-40 mt-1 w-[240px]" data-history-restore-menu="">
					<div className="px-3 pt-1.5 pb-1 text-secondary type-detail">to {momentSays(stretch.end)}</div>
					{targets.map((target) => {
						const count = counts.get(keyOf(target));
						return (
							<MenuItem
								key={keyOf(target)}
								label={
									target.kind === "project"
										? "Whole project"
										: target.kind === "page"
											? `${target.target === "" ? "root" : target.target} page`
											: targetSays(target)
								}
								meta={
									count === undefined || count === null ? "…" : `${count} ${count === 1 ? "file" : "files"}`
								}
								onClick={() => {
									setOpen(false);
									onPick(target);
								}}
							/>
						);
					})}
				</Menu>
			) : null}
		</span>
	);
}

/** The one question a restore asks first, with a frame's changed shared files offered, each off. */
function RestoreQuestion({
	project,
	asking,
	onClose,
	onDone,
}: {
	project: string;
	asking: Asking;
	onClose: () => void;
	onDone: (message: string, undo: RestoreAsk | null) => void;
}) {
	const [plan, setPlan] = useState<RestorePlan | null | undefined>(undefined);
	const [also, setAlso] = useState<string[]>([]);
	const { target, to } = asking;
	// biome-ignore lint/correctness/useExhaustiveDependencies: asked once for what it asks
	useEffect(() => {
		let live = true;
		void fetchRestorePlan(project, { ...target, to }).then((read) => {
			if (live) setPlan(read);
		});
		return () => {
			live = false;
		};
	}, []);
	const files = (plan?.files ?? 0) + also.length;
	const said = questionSays(target, asking.at, files, asking.by);
	const description =
		plan === undefined
			? "Reading what goes back…"
			: plan === null
				? "The team's history can't be read now."
				: files === 0 && plan.shared.length === 0
					? `It already stands as it did then: nothing goes back.`
					: said.description;
	return (
		<ConfirmDialog
			title={said.title}
			description={description}
			confirmLabel="Restore"
			disabled={plan === undefined || plan === null || (files === 0 && also.length === 0)}
			onClose={onClose}
			onConfirm={async () => {
				const done = await restoreFromHistory(project, { ...target, to, also });
				const moment = momentSays(asking.at);
				onDone(
					done.setAside.length > 0
						? `Restored ${targetSays(target)} to ${moment}; ${done.setAside.length} set aside`
						: `Restored ${restoredSays({ ...target, toAt: asking.at })}`,
					done.undo,
				);
			}}
		>
			{plan === undefined || plan === null || plan.shared.length === 0 ? undefined : (
				<div className="flex flex-col gap-3" data-history-restore-shared="">
					{plan.shared.map((shared) => (
						<Checkbox
							key={shared.path}
							checked={also.includes(shared.path)}
							onCheckedChange={(on) =>
								setAlso((was) => (on ? [...was, shared.path] : was.filter((path) => path !== shared.path)))
							}
							label={
								<span className="flex flex-col gap-0.5">
									<span className="text-primary type-control">Also restore {shared.path}</span>
									<span className="text-secondary type-label">{sharedSays(target.target, shared.frames)}</span>
								</span>
							}
						/>
					))}
				</div>
			)}
		</ConfirmDialog>
	);
}
