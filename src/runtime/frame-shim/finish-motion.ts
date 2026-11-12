/**
 * Every animation that ends, ended now: a slide put straight onto a beat, as a
 * presenter's jump puts it, rather than played there (spool#318). The booth
 * times a beat entering from the one before, and the way back to that one is
 * no part of it. Endless animations run on, as they do on the stage.
 */
export function finishMotion(): void {
	let animations: Animation[] = [];
	try {
		animations = document.getAnimations();
	} catch {}
	for (const animation of animations) {
		try {
			if (animation.effect?.getComputedTiming().iterations === Number.POSITIVE_INFINITY) continue;
			animation.finish();
		} catch {}
	}
}
