import { useEffect, useRef, useState } from "react";

/**
 * View state that outlives a reload.
 *
 * Spool already persists a great deal, and none of it belongs here: a thread's picture,
 * the canvas, the projection and the project list are all the daemon's, written under the
 * state directory because they are facts about the work. What this file holds is the other
 * kind — how wide you left a rail, and whether you had it shut. That is a fact about the
 * browser you are sitting in rather than about the project, so it lives in that browser and
 * never travels to the daemon, where it would arrive as somebody else's layout.
 *
 * **Nothing here migrates.** A key is read, and if what comes back is not what the key
 * means today it is deleted and the caller gets its own default. There is no versioning, no
 * upgrade path and no partial merge, because every value this is for is one a person can
 * restore with one drag. The recovery is explicit and it is cheap, which is the whole reason
 * a stored layout is allowed to be thrown away rather than repaired.
 *
 * `accepts` is therefore not a formality. It is the only thing standing between a stale
 * shape and the component that trusts it, so a caller that writes a loose guard has no
 * guard at all.
 */

/** one namespace, so a key that is not ours is obvious in a devtools pane */
const PREFIX = "spool.";

/**
 * How long a value has to hold still before it is worth writing down.
 *
 * A dragged rail sets its width on every pointer move, which is sixty settled preferences a
 * second and none of them is one. The write waits for the hand to stop, so a gesture costs
 * one write rather than one per frame, and what lands is where the drag actually ended.
 */
const SETTLE_MS = 250;

/**
 * The store, or nothing.
 *
 * A browser is allowed to refuse storage outright — private windows and blocked
 * third-party contexts both throw on *access* rather than on use, so the guard has to be
 * around the property read itself. This is not a compatibility path: it is the difference
 * between a browser that can remember and one that cannot, and in the second case every
 * caller correctly falls back to its own default for the life of the tab.
 */
function store(): Storage | null {
	try {
		// `?? null` is not defensive noise: a refused context throws on the read, but an
		// environment that simply has no storage hands back `undefined`, which walks
		// straight through a `=== null` test and throws on the first `getItem` instead
		return window.localStorage ?? null;
	} catch {
		return null;
	}
}

/** what was written under this key, or null when there is nothing usable there */
export function recall<T>(key: string, accepts: (value: unknown) => value is T): T | null {
	const box = store();
	if (box === null) return null;
	const raw = box.getItem(PREFIX + key);
	if (raw === null) return null;
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		// ours, and not JSON: nothing can be recovered from it and it will never become
		// readable, so it goes rather than being stepped over on every future read
		box.removeItem(PREFIX + key);
		return null;
	}
	if (accepts(parsed)) return parsed;
	// readable, and not what this key means any more. The old shape is not translated
	box.removeItem(PREFIX + key);
	return null;
}

/** write it down, or find out the browser will not let you and carry on */
export function keep<T>(key: string, value: T): void {
	try {
		store()?.setItem(PREFIX + key, JSON.stringify(value));
	} catch {
		// a full or refused quota is not this call's problem to solve: the value is already
		// live in the component that set it, and the only thing lost is the next reload
	}
}

/**
 * A piece of view state, remembered.
 *
 * Reads once on mount and writes once the value stops moving. A default that nobody has
 * changed is never written, so a fresh browser holds no keys and changing a default in the
 * source changes it for everyone who never touched it.
 */
export function useRemembered<T>(
	key: string,
	fallback: T,
	accepts: (value: unknown) => value is T,
): [T, (next: T) => void] {
	const [value, setValue] = useState<T>(() => recall(key, accepts) ?? fallback);
	const latest = useRef(value);
	latest.current = value;
	/** what is actually on disk, so an unchanged default is never written */
	const written = useRef(value);

	useEffect(() => {
		if (value === written.current) return;
		const timer = window.setTimeout(() => {
			written.current = latest.current;
			keep(key, latest.current);
		}, SETTLE_MS);
		return () => window.clearTimeout(timer);
	}, [key, value]);

	// a gesture that ends in an unmount is still a gesture that ended
	useEffect(
		() => () => {
			if (latest.current !== written.current) keep(key, latest.current);
		},
		[key],
	);

	return [value, setValue];
}
