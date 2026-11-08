import { useCallback, useEffect, useMemo, useState } from "react";
import type { PresenceFocus, PresencePerson, TabPresence } from "../team-sync-protocol";
import { lookFor, nextLook } from "./canvas/presence";

/**
 * Who else is in each open team project, for the tabs not focused (task 139). The daemon says it when someone
 * arrives, leaves, comes back or changes their window's focus; the rest of how present they are is the clock's
 * alone, so it is worked out here, the way the canvas works it out (task 503).
 */

/** One person on a tab: who, and whether they're active or only unfocused. The away and the gone aren't on it. */
export interface TabMate {
	accountId: string;
	name: string;
	color: string;
	look: "active" | "unfocused";
}

/** Someone as heard: who, when they last did anything of their own on this page's clock, and their window's focus. */
export interface TabHeard {
	person: PresencePerson;
	active: number;
	focus?: PresenceFocus | undefined;
}

/** What the daemon said, on this page's clock. */
export function heardAt(people: readonly TabPresence[], now: number): TabHeard[] {
	return people.map(({ person, quiet, focus }) => ({ person, active: now - quiet, focus }));
}

/** The people a tab shows, the active first, then the unfocused, each in the order they were said. */
export function tabMates(heard: readonly TabHeard[], now: number): TabMate[] {
	const mates = heard.map(({ person, active, focus }) => ({ ...person, look: lookFor(now - active, focus) }));
	const shown = (look: TabMate["look"]) => mates.flatMap((mate) => (mate.look === look ? [{ ...mate, look }] : []));
	return [...shown("active"), ...shown("unfocused")];
}

/** When the next of them changes how present they look by the clock alone, or undefined when nobody will. */
export function nextTabChange(heard: readonly TabHeard[], now: number): number | undefined {
	let next: number | undefined;
	for (const { active } of heard) {
		const at = nextLook(active, now);
		if (at !== undefined && (next === undefined || at < next)) next = at;
	}
	return next;
}

/** Who is in each team project by root, kept as the daemon says it and redrawn as people dim and go. */
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
		const at = nextTabChange([...rooms.values()].flat(), now);
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
