import { useCallback, useEffect, useRef, useState } from "react";
import { compileClasses } from "../api";
import type { ClassVerdict } from "./properties-fields";

/**
 * The compiler as the gate on the `+` (#258's P5).
 *
 * A class the field offers is a class this project's Tailwind actually
 * compiles, and the reason a refused one gives is the compiler's own — so the
 * `+` cannot be out of date with a theme that renamed its breakpoints, and it
 * cannot be wrong about a bracket form nobody thought to list. That answer is a
 * round trip (`POST /api/p/:project/theme/classes`), so this is where it is
 * remembered.
 *
 * Two rules keep the traffic honest. A token is asked about once — the answer
 * is a fact about the theme, not about the element — and the whole cache is
 * dropped when the theme could have changed underneath it, which is the same
 * revision a document reload bumps.
 */

/** A batch small enough to answer in one paint, which is a screenful of candidates. */
const BATCH = 48;

export interface Compiler {
	/** what the compiler said, or nothing while it has not answered yet */
	verdictOf: (token: string) => ClassVerdict | undefined;
	/** put these to the compiler; ones already known or in flight cost nothing */
	ask: (tokens: readonly string[]) => void;
}

export function useCompiler(project: string, revision: number): Compiler {
	const [known, setKnown] = useState<ReadonlyMap<string, ClassVerdict>>(new Map());
	/** what is in flight or answered, so the same token is never asked twice */
	const asked = useRef(new Set<string>());
	const live = useRef(true);

	// biome-ignore lint/correctness/useExhaustiveDependencies: `revision` is not read in here, it is the trigger — a document that reloaded may have reloaded because tokens.css changed, and every verdict was about the old one
	useEffect(() => {
		asked.current = new Set();
		setKnown(new Map());
	}, [project, revision]);

	useEffect(() => {
		live.current = true;
		return () => {
			live.current = false;
		};
	}, []);

	const ask = useCallback(
		(tokens: readonly string[]) => {
			const fresh = [...new Set(tokens)]
				.filter((token) => token !== "" && !asked.current.has(token))
				.slice(0, BATCH);
			if (fresh.length === 0) return;
			for (const token of fresh) asked.current.add(token);
			void compileClasses(project, fresh).then((compiled) => {
				if (!live.current) return;
				if (compiled === undefined) {
					// a door that never answered is not a verdict: forget the ask so the
					// next keystroke tries again rather than leaving the list blank
					for (const token of fresh) asked.current.delete(token);
					return;
				}
				setKnown((held) => {
					const next = new Map(held);
					for (const answer of compiled) {
						next.set(
							answer.token,
							answer.ok ? { ok: true, css: answer.css } : { ok: false, reason: answer.reason },
						);
					}
					return next;
				});
			});
		},
		[project],
	);

	const verdictOf = useCallback((token: string) => known.get(token), [known]);
	return { verdictOf, ask };
}
