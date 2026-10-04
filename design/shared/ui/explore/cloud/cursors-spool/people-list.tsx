import type { ReactNode } from "react";
import { cn } from "shared/lib/utils";
import type { PersonState } from "shared/ui/explore/cloud/cursors-spool/scene";

/**
 * Who is here, opened from the top right. The rows are the same in every take
 * so the takes differ only in the mark each row wears: people on this page
 * first, then a hairline, then the people elsewhere in the project.
 */

export function whereOf(s: PersonState): string {
	if (!s.here) return `${s.track.page} · ${s.track.where ?? ""}`;
	if (s.idle > 0.5) return "idle 6m";
	return s.selected ?? s.hover ?? "canvas";
}

export function PeopleList({
	states,
	mark,
	trailing,
	className,
}: {
	states: readonly PersonState[];
	mark: (s: PersonState) => ReactNode;
	trailing?: ((s: PersonState) => ReactNode) | undefined;
	className?: string | undefined;
}) {
	const here = states.filter((s) => s.here);
	const away = states.filter((s) => !s.here);
	const row = (s: PersonState) => (
		<div key={s.person.id} className="flex h-9 items-center gap-2.5 rounded-sm px-2 hover:bg-surface">
			<span className="flex w-6 shrink-0 justify-center">{mark(s)}</span>
			<span className={cn("min-w-0 flex-1 truncate type-label", s.idle > 0.5 || !s.here ? "text-muted" : "text-text")}>
				{s.person.name}
			</span>
			{trailing?.(s)}
			<span className="shrink-0 text-muted type-detail">{whereOf(s)}</span>
		</div>
	);
	return (
		<div
			className={cn(
				"absolute top-[46px] right-4 z-50 w-[280px] animate-menu-in rounded-lg border border-border-raised bg-bg p-1",
				className,
			)}
		>
			{here.map(row)}
			{away.length === 0 ? null : <div className="mx-2 my-1 h-px bg-border" />}
			{away.map(row)}
		</div>
	);
}
