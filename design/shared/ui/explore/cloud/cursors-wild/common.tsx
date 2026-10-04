import { cn } from "shared/lib/utils";
import type { Seat, WhoRow } from "shared/ui/explore/cloud/cursors-wild/faces";
import { CROWD, frameUnder, type Person, pointer, TEAM } from "shared/ui/explore/cloud/cursors-wild/script";

/** the three columns every take draws: the loop, following Maja, and seven people with the list open */
export type TakeState = "base" | "follow" | "crowd";

export function cast(state: TakeState): readonly Person[] {
	return state === "crowd" ? CROWD : TEAM;
}

/** the people whose hands are on this page */
export function here(people: readonly Person[]): (Person & { track: NonNullable<Person["track"]> })[] {
	return people.flatMap((person) =>
		person.page === undefined && person.track !== undefined ? [{ ...person, track: person.track }] : [],
	);
}

export function seat(person: Person, t: number, ringed = false): Seat {
	const idle = person.track === undefined ? false : pointer(person.track, t).idle;
	return { id: person.id, name: person.name, color: person.color, idle, ringed };
}

/** where a person is, as the list says it: the frame under their hand, the canvas, or idle */
function where(person: Person, t: number): string {
	if (person.track === undefined) return person.frame ?? "";
	const at = pointer(person.track, t);
	if (at.idle) return `idle ${Math.max(1, Math.round(at.idleFor / 1000))}m`;
	return frameUnder(t, at.x, at.y)?.name ?? "canvas";
}

export function groups(people: readonly Person[], t: number): { page: string; here?: boolean; rows: WhoRow[] }[] {
	const pages = new Map<string, WhoRow[]>();
	for (const person of people) {
		const page = person.page ?? "app";
		const rows = pages.get(page) ?? [];
		rows.push({ seat: seat(person, t), where: where(person, t) });
		pages.set(page, rows);
	}
	return [...pages].map(([page, rows]) => ({ page, here: page === "app", rows }));
}

/** a colour at an alpha, for strokes and fills that ride a person's colour */
export function tint(hex: string, alpha: number): string {
	const n = Number.parseInt(hex.slice(1), 16);
	return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/**
 * A name, as the canvas prints it: the person's colour in mono on a scrap of
 * the app's own black, so it reads on a white frame and on the field alike.
 */
export function NameTag({ name, color, className }: { name: string; color: string; className?: string | undefined }) {
	return (
		<span
			className={cn("whitespace-nowrap rounded-xs bg-bg/90 px-1.5 py-px type-detail", className)}
			style={{ color }}
		>
			{name.toLowerCase()}
		</span>
	);
}
