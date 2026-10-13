import { useCallback, useEffect, useMemo, useState } from "react";
import { PRESENCE_IDLE_MS, type PresencePerson, type TabPresence } from "../team-sync-protocol";

/**
 * Who else is in each open team project, for the tabs not focused (task 139). The daemon says it when someone
 * arrives, leaves or comes back from idle; going idle is the clock's alone, so it is worked out here.
 */

/** One person on a tab: who, and whether they've gone idle. */
export interface TabMate {
	accountId: string;
	name: string;
	color: string;
	idle: boolean;
}

/** Someone as heard: who, and when they last did anything of their own on this page's clock. */
export interface TabHeard {
	person: PresencePerson;
	active: number;
}

/** What the daemon said, on this page's clock. */
export function heardAt(people: readonly TabPresence[], now: number): TabHeard[] {
	return people.map(({ person, quiet }) => ({ person, active: now - quiet }));
}

/** The people a tab shows, the ones working first, in the order they were said. */
export function tabMates(heard: readonly TabHeard[], now: number): TabMate[] {
	const mates = heard.map(({ person, active }) => ({ ...person, idle: now - active >= PRESENCE_IDLE_MS }));
	return [...mates.filter((mate) => !mate.idle), ...mates.filter((mate) => mate.idle)];
}

/** When the next of them goes idle by the clock alone, or undefined when nobody will. */
export function nextIdle(heard: readonly TabHeard[], now: number): number | undefined {
	let next: number | undefined;
	for (const { active } of heard) {
		const at = active + PRESENCE_IDLE_MS;
		if (at > now && (next === undefined || at < next)) next = at;
	}
	return next;
}

/** Who is in each team project by root, kept as the daemon says it and redrawn as people go idle. */
export function useTabPresence(): {
	byRoot: ReadonlyMap<string, readonly TabMate[]>;
	heard: (root: string, people: readonly TabPresence[]) => void;
	reset: () => void;
} {
	const [rooms, setRooms] = useState<ReadonlyMap<string, readonly TabHeard[]>>(new Map());
	const [now, setNow] = useState(() => Date.now());
	const heard = useCallback((root: string, people: readonly TabPresence[]) => {
		const at = Date.now();
		setNow(at);
		setRooms((was) => {
			const next = new Map(was);
			if (people.length === 0) next.delete(root);
			else next.set(root, heardAt(people, at));
			return next;
		});
	}, []);
	const reset = useCallback(() => setRooms(new Map()), []);
	useEffect(() => {
		const at = nextIdle([...rooms.values()].flat(), now);
		if (at === undefined) return;
		const timer = setTimeout(() => setNow(Date.now()), at - now + 5);
		return () => clearTimeout(timer);
	}, [rooms, now]);
	const byRoot = useMemo(
		() => new Map([...rooms].map(([root, people]) => [root, tabMates(people, now)] as const)),
		[rooms, now],
	);
	return { byRoot, heard, reset };
}
