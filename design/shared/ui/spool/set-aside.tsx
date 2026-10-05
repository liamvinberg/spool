// Mirrors src/ui/canvas/set-aside.tsx.
// ShownSetAside is declared here rather than imported from the daemon's api; the actions are props.

import { HOME_ACTION } from "shared/ui/spool/home-actions";

/**
 * Set-aside marks on a team project's canvas: this machine's save reached the team after a teammate's to the same
 * file, so the team kept theirs and this disk took it. Only this machine is told, on each frame that renders the
 * file, with Compare, Put mine back and Hand to agent. Many at once are one summary.
 */

export interface ShownSetAside {
	path: string;
	kind: "set-aside" | "restored";
	deleted: boolean;
	by: string | null;
}

export function setAsideSays(mark: ShownSetAside): string {
	const whose = mark.by === null ? "A teammate's" : `${mark.by}'s`;
	if (mark.kind === "restored") return `Your delete was undone. ${whose} edit brought it back.`;
	if (mark.deleted) return `Your delete was set aside. ${whose} edit arrived first.`;
	return `Your change was set aside. ${whose} arrived first.`;
}

/** The word on a frame's label; pressing it opens the note under the label. */
export function SetAsideChip({ open = false }: { open?: boolean }) {
	return (
		<button
			type="button"
			aria-expanded={open}
			className="shrink-0 rounded-xs border border-border-raised bg-raised px-1.5 text-text type-detail hover:bg-control"
		>
			set aside
		</button>
	);
}

/** The note a mark opens: what happened, the file, and the three ways on. */
export function SetAsideNoteCard({ marks }: { marks: readonly ShownSetAside[] }) {
	return (
		<div className="flex w-[380px] flex-col gap-3 whitespace-normal rounded-md border border-border-raised bg-raised p-3">
			{marks.map((mark) => (
				<SetAsideNote key={mark.path} mark={mark} />
			))}
		</div>
	);
}

export function SetAsideNote({ mark, compact = false }: { mark: ShownSetAside; compact?: boolean }) {
	return (
		<div className="flex flex-col gap-2">
			{!compact && <p className="text-text type-control">{setAsideSays(mark)}</p>}
			<div className="flex items-baseline justify-between gap-2">
				<span className="min-w-0 truncate text-muted type-value">{mark.path}</span>
				<button type="button" className="shrink-0 text-muted type-detail hover:text-text">
					Dismiss
				</button>
			</div>
			<div className="flex flex-wrap gap-1.5">
				<button type="button" className={HOME_ACTION}>
					Compare
				</button>
				<button type="button" className={HOME_ACTION}>
					Put mine back
				</button>
				<button type="button" className={HOME_ACTION}>
					Hand to agent
				</button>
			</div>
		</div>
	);
}

/** More than a handful set aside together, as after a while offline: one card instead of a mark on every frame. */
export function SetAsideSummary({ marks }: { marks: readonly ShownSetAside[] }) {
	const count = marks.length === 1 ? "1 of your changes was" : `${marks.length} of your changes were`;
	return (
		<section
			aria-label="Set aside"
			className="-translate-x-1/2 absolute top-4 left-1/2 z-30 flex max-h-[60vh] w-[440px] flex-col gap-3 overflow-auto rounded-md border border-border-raised bg-raised p-3.5"
		>
			<div className="flex items-baseline justify-between gap-3">
				<p className="text-text type-control">{count} set aside: teammates' saves reached the team first.</p>
				<button type="button" className="shrink-0 text-muted type-detail hover:text-text">
					Dismiss all
				</button>
			</div>
			{marks.map((mark) => (
				<SetAsideNote key={mark.path} mark={mark} compact />
			))}
		</section>
	);
}
