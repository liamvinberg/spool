import type { Place } from "shared/lib/explore/new-project/places";
import { cn } from "shared/lib/utils";
import { TeamMark } from "shared/ui/explore/cloud/home/parts";
import { FolderIcon } from "shared/ui/spool/icons";

/** spool's entering curve: anything arriving eases out and stays under 300ms. */
export const EASE = [0.22, 0.61, 0.36, 1] as const;

type IconProps = { className?: string | undefined };

export function ClockIcon({ className }: IconProps) {
	return (
		<svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
			<circle cx="8" cy="8" r="5.6" stroke="currentColor" strokeWidth="1.35" />
			<path d="M8 5v3.2l2.1 1.4" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}

/**
 * Drafts: a page whose edge is not drawn all the way round yet. The dash is the
 * meaning, a project that has a home on this Mac and no place chosen.
 */
export function DraftIcon({ className }: IconProps) {
	return (
		<svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
			<rect x="3" y="2.6" width="10" height="10.8" rx="1.6" stroke="currentColor" strokeWidth="1.3" strokeDasharray="2.2 1.6" />
		</svg>
	);
}

export function SyncedIcon({ className }: IconProps) {
	return (
		<svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
			<path d="M3.5 8.4 6.6 11.4 12.5 4.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}

/** The glyph a place wears wherever it is named: Drafts, a folder, a team. */
export function PlaceGlyph({ place, size = 14 }: { place: Place; size?: number }) {
	if (place.kind === "team") return <TeamMark size={size + 2} />;
	const Icon = place.kind === "draft" ? DraftIcon : FolderIcon;
	return <Icon className="shrink-0 text-muted" />;
}

/** What a person reads for a place: "Drafts", "Tidemark", or the folder's own name. */
export function placeName(place: Place): string {
	if (place.kind === "folder") return place.label.split("/").pop() ?? place.label;
	return place.label;
}

export function PlaceLine({ place, className }: { place: Place; className?: string }) {
	return (
		<span className={cn("flex min-w-0 items-center gap-[7px] text-muted", className)}>
			<span className="grid h-[16px] w-[16px] shrink-0 place-items-center [&>svg]:h-[14px] [&>svg]:w-[14px]">
				<PlaceGlyph place={place} size={14} />
			</span>
			{place.kind === "folder" ? (
				<span className="truncate type-detail">
					{place.label}
					{place.branch ? ` · ${place.branch}` : ""}
				</span>
			) : (
				<span className="truncate type-caption">{place.label}</span>
			)}
		</span>
	);
}

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
	return <kbd className={cn("type-detail opacity-60", className)}>{children}</kbd>;
}
