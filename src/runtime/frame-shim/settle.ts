/**
 * The one settle (#177): how long a frame is given to finish arriving before
 * anyone believes what it shows. Frames animate their content in, so a picture
 * taken the instant a boot reports loaded records whatever had not faded in
 * yet, and that absence is what the canvas would then show in the frame's
 * place. A looping animation never finishes, so the wait is bounded and
 * infinite iterations are not waited on at all.
 *
 * One source, run in two places. The shim runs it inside a frame on the
 * canvas, for the arrival report and an export, with the rAF it took before
 * frame code ran. The photo booth (`daemon/booth.ts`) runs the very same
 * function in an isolated world of its own tab, where every global is native
 * whatever the frame did to its own, so a cover waits out exactly what a frame
 * on the canvas does. `raf` is the requestAnimationFrame each place trusts.
 */
export async function settle(budgetMs: number, raf: (callback: FrameRequestCallback) => number): Promise<void> {
	if (!(budgetMs > 0)) return;
	const deadline = performance.now() + budgetMs;
	try {
		await document.fonts.ready;
	} catch {}
	while (performance.now() < deadline) {
		let arriving = 0;
		try {
			for (const animation of document.getAnimations()) {
				if (animation.playState !== "running") continue;
				let iterations: number | undefined = 1;
				try {
					iterations = (animation.effect as AnimationEffect).getComputedTiming().iterations;
				} catch {}
				// a loop never finishes; waiting on one would only time out
				if (iterations !== Infinity) arriving++;
			}
		} catch {}
		if (arriving === 0) break;
		await new Promise((resolve) => setTimeout(resolve, 60));
	}
	// Most of what a frame animates, no timing API reports: a spring is
	// rAF-driven inline style writes, and getAnimations() has never heard of
	// it. A quiet DOM is the signal that works whatever the library: wait
	// for nothing to change for a beat, and give up at the budget so a frame
	// that animates forever still gets photographed.
	await new Promise<void>((resolve) => {
		let quiet: ReturnType<typeof setTimeout> | undefined;
		const observer = new MutationObserver(() => {
			clearTimeout(quiet);
			quiet = setTimeout(done, 120);
		});
		const cap = setTimeout(done, Math.max(0, deadline - performance.now()));
		function done(): void {
			clearTimeout(quiet);
			clearTimeout(cap);
			try {
				observer.disconnect();
			} catch {}
			resolve();
		}
		try {
			observer.observe(document.documentElement, {
				attributes: true,
				childList: true,
				subtree: true,
				characterData: true,
			});
		} catch {
			done();
			return;
		}
		quiet = setTimeout(done, 120);
	});
	// Two native frames, so a rAF-driven entry animation's last commit lands.
	// Chrome holds rAF entirely in an offscreen iframe, and a frame on the
	// canvas may be one; the race with the timer is what keeps the settle
	// inside its budget either way.
	await new Promise<void>((resolve) => {
		const timer = setTimeout(resolve, Math.max(0, Math.min(100, deadline - performance.now())));
		raf(() =>
			raf(() => {
				clearTimeout(timer);
				resolve();
			}),
		);
	});
}
