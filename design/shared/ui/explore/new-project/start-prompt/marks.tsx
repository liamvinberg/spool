import type { ReactNode } from "react";
import type { PlaceKind } from "shared/lib/explore/new-project/places";
import { cn } from "shared/lib/utils";
import { TeamMark } from "shared/ui/explore/cloud/home/parts";
import { FolderIcon } from "shared/ui/spool/icons";

/** spool's entering curve; every arrival here stays under 300ms on it */
export const EASE = [0.22, 0.61, 0.36, 1] as const;
export const ENTER = { duration: 0.24, ease: EASE };

export type Host = "app" | "web";

/** where a project is going to live, before or after it exists */
export type Where = { kind: "draft" } | { kind: "team" } | { kind: "folder"; root: string; branch?: string | undefined };

export function whereKind(where: Where): PlaceKind {
	return where.kind;
}

export function whereLabel(where: Where): string {
	return where.kind === "draft" ? "Drafts" : where.kind === "team" ? "Tidemark" : where.root;
}

/** the files' path for a project of this name in this place */
export function wherePath(where: Where, name: string): string {
	const folder = name.toLowerCase().replace(/[^a-z0-9äöå]+/g, "-").replace(/^-|-$/g, "") || "untitled";
	return where.kind === "draft" ? `~/spool/${folder}` : where.kind === "team" ? `~/spool/tidemark/${folder}` : `${where.root}/design`;
}

/**
 * A draft is a sheet nobody has filed yet: a dashed square. A folder is the folder
 * glyph spool already uses, and a team is its mark.
 */
export function PlaceGlyph({ kind, size = 14, className }: { kind: PlaceKind; size?: number; className?: string }) {
	if (kind === "team") return <TeamMark size={size} />;
	if (kind === "folder") return <FolderIcon className={cn("shrink-0 text-muted", className)} />;
	return (
		<span
			className={cn("shrink-0 rounded-[3px] border border-muted border-dashed", className)}
			style={{ width: size - 2, height: size - 2, margin: 1 }}
		/>
	);
}

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
	return (
		<kbd className={cn("inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[4px] border border-border-raised px-[4px] text-muted type-detail", className)}>
			{children}
		</kbd>
	);
}
