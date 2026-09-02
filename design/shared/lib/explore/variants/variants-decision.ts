import { useCallback, useMemo, useState } from "react";
import { VARIATIONS, type Variation, type VariationId } from "shared/ui/demo/tvarso-checkout";

/**
 * A variation set is an open decision, and this is the decision.
 *
 * The point of drawing the same screen four ways is to pick one and throw the
 * other three away, so the model is not "which is showing" — it is which are
 * still candidates, which one won, and what happened to the losers. Every take
 * on this page reads from here, which is why they all say keep and discard
 * rather than select and delete.
 *
 * Three rules, and they are the whole thing:
 *
 * 1. Keeping one discards the rest. That is what a decision is.
 * 2. Discarding is reversible until the decision is closed, and never before.
 *    A rejected variation is the argument for the one that won, so it is worth
 *    more than a deleted file.
 * 3. One candidate left is a resolved decision however you got there. Keeping
 *    the last one and discarding the second to last are the same event.
 */

export type Standing = "open" | "resolved";

export interface Decision {
	/** every variation still in the running, in the set's own order */
	readonly candidates: readonly Variation[];
	/** the ones taken out, newest last, still recoverable */
	readonly discarded: readonly Variation[];
	/** what the canvas is showing: the kept one once resolved, the looked-at one while open */
	readonly showing: Variation;
	readonly standing: Standing;
	/** the winner, or null while the decision is open */
	readonly kept: Variation | null;
	/** when it was decided, as a rail would print it */
	readonly at: string | null;
	look: (id: VariationId) => void;
	keep: (id: VariationId) => void;
	discard: (id: VariationId) => void;
	restore: (id: VariationId) => void;
	reopen: () => void;
	/** ← → through the candidates, which is what every take binds */
	next: () => void;
	prev: () => void;
}

export function useDecision(start: Standing = "open", winner: VariationId = "card"): Decision {
	const [gone, setGone] = useState<readonly VariationId[]>(
		start === "resolved" ? VARIATIONS.filter((one) => one.id !== winner).map((one) => one.id) : [],
	);
	const [closed, setClosed] = useState(start === "resolved");
	const [looking, setLooking] = useState<VariationId>(winner);

	const candidates = useMemo(() => VARIATIONS.filter((one) => !gone.includes(one.id)), [gone]);
	const discarded = useMemo(
		() => gone.map((id) => VARIATIONS.find((one) => one.id === id)).filter((one): one is Variation => one !== undefined),
		[gone],
	);
	const standing: Standing = closed || candidates.length <= 1 ? "resolved" : "open";
	const kept = standing === "resolved" ? (candidates[0] ?? null) : null;
	const showing = (standing === "resolved" ? kept : candidates.find((one) => one.id === looking)) ?? candidates[0] ?? VARIATIONS[0]!;

	const look = useCallback((id: VariationId) => setLooking(id), []);

	const keep = useCallback((id: VariationId) => {
		setGone(VARIATIONS.filter((one) => one.id !== id).map((one) => one.id));
		setLooking(id);
		setClosed(true);
	}, []);

	const discard = useCallback((id: VariationId) => {
		setGone((current) => (current.includes(id) ? current : [...current, id]));
		setLooking((current) => {
			if (current !== id) return current;
			const left = VARIATIONS.filter((one) => one.id !== id);
			return left[0]?.id ?? current;
		});
	}, []);

	const restore = useCallback((id: VariationId) => {
		setGone((current) => current.filter((one) => one !== id));
		setClosed(false);
		setLooking(id);
	}, []);

	const reopen = useCallback(() => {
		setGone([]);
		setClosed(false);
	}, []);

	const step = useCallback(
		(by: 1 | -1) => {
			setLooking((current) => {
				const live = VARIATIONS.filter((one) => !gone.includes(one.id));
				const at = live.findIndex((one) => one.id === current);
				const next = live[(((at === -1 ? 0 : at) + by) % live.length + live.length) % live.length];
				return next?.id ?? current;
			});
		},
		[gone],
	);

	return {
		candidates,
		discarded,
		showing,
		standing,
		kept,
		at: standing === "resolved" ? "14:32" : null,
		look,
		keep,
		discard,
		restore,
		reopen,
		next: useCallback(() => step(1), [step]),
		prev: useCallback(() => step(-1), [step]),
	};
}
